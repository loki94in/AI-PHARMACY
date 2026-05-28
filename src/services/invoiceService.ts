
import { dbManager } from '../database/connection.js';
// @ts-ignore from '../database/connection.js';
import { config } from '../config';

export interface InvoiceItem {
  inventoryId?: number;
  medicineName?: string;
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceData {
  items: InvoiceItem[];
  patientId?: number;
  doctorId?: number;
  discount?: number;
  patientName?: string;
  patientPhone?: string;
  patientAddress?: string;
  paymentMedium?: string;
  paymentStatus?: string;
}

export interface InvoiceResult {
  invoiceNo: string;
  total: number;
  tax: number;
  subtotal: number;
}

export class InvoiceService {
  /**
   * Generate sequential invoice number
   */
  async generateInvoiceNo(db: Database): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `S-${year}-`;
    const row = await db.get(
      'SELECT invoice_no FROM sales_invoices WHERE invoice_no LIKE ? ORDER BY invoice_no DESC LIMIT 1',
      `${prefix}%`
    );
    let nextNum = 1;
    if (row && row.invoice_no) {
      const parts = row.invoice_no.split('-');
      const numPart = parts[2];
      nextNum = parseInt(numPart, 10) + 1;
    }
    const padded = String(nextNum).padStart(4, '0');
    return `${prefix}${padded}`;
  }

  /**
   * Calculate totals for invoice
   */
  calculateTotals(items: InvoiceItem[], discount = 0): {
    subtotal: number;
    tax: number;
    total: number;
  } {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const tax = subtotal * config.taxRate;
    const total = subtotal + tax - discount;
    return { subtotal, tax, total };
  }

  /**
   * Create a complete invoice with transaction safety
   */
  async createInvoice(data: InvoiceData): Promise<InvoiceResult> {
    return await dbManager.transaction(async (db) => {
      // Resolve or create customer/patient
      let customerId = data.patientId;
      if (data.patientName) {
        const cleanPhone = data.patientPhone || '';
        const existing = await db.get(
          'SELECT id FROM customers WHERE name = ? AND phone = ?',
          [data.patientName, cleanPhone]
        );
        if (existing) {
          customerId = existing.id;
        } else {
          const custResult = await db.run(
            'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
            [data.patientName, cleanPhone, data.patientAddress || '']
          );
          customerId = custResult.lastID;
        }
      }

      // Generate invoice number
      const invoiceNo = await this.generateInvoiceNo(db);

      // Calculate totals
      const { subtotal, tax, total } = this.calculateTotals(data.items, data.discount || 0);

      // Resolve paymentMedium and status
      const paymentMedium = data.paymentMedium || 'CASH';
      const paymentStatus = data.paymentStatus || (paymentMedium === 'CREDIT' ? 'UNPAID' : 'PAID');

      // Insert invoice
      const result = await db.run(
        'INSERT INTO sales_invoices (invoice_no, customer_id, total_amount, tax_amount, payment_medium, payment_status) VALUES (?, ?, ?, ?, ?, ?)',
        [invoiceNo, customerId, total, tax, paymentMedium, paymentStatus]
      );
      const invoiceId = result.lastID;

      // Update credit balance if CREDIT
      if (paymentMedium === 'CREDIT' && customerId) {
        await db.run(
          'UPDATE customers SET credit_balance = credit_balance + ?, credit_enabled = 1 WHERE id = ?',
          [total, customerId]
        );
      }

      // Insert line items and update inventory (in same transaction)
      for (const item of data.items) {
        let invId = item.inventoryId;
        
        if (!invId && item.medicineName) {
          // Find or create medicine
          let med = await db.get('SELECT id FROM medicines WHERE name = ?', [item.medicineName]);
          let medId;
          if (med) {
            medId = med.id;
          } else {
            const medRes = await db.run('INSERT INTO medicines (name, mrp) VALUES (?, ?)', [item.medicineName, item.mrp || item.unitPrice]);
            medId = medRes.lastID;
          }
          
          // Find or create inventory item under this medicine & batch
          const batch = item.batchNo || 'B-MANUAL';
          let inv = await db.get('SELECT id FROM inventory_master WHERE medicine_id = ? AND batch_no = ?', [medId, batch]);
          if (inv) {
            invId = inv.id;
          } else {
            const invRes = await db.run(
              'INSERT INTO inventory_master (medicine_id, quantity, batch_no, expiry_date, mrp, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
              [medId, 100, batch, item.expiryDate || '12/30', item.mrp || item.unitPrice, item.unitPrice]
            );
            invId = invRes.lastID;
          }
        } else if (invId) {
          // If inventoryId is provided, double check it exists, otherwise auto-create or fall back
          const invExists = await db.get('SELECT id FROM inventory_master WHERE id = ?', [invId]);
          if (!invExists) {
            if (item.medicineName) {
              let med = await db.get('SELECT id FROM medicines WHERE name = ?', [item.medicineName]);
              let medId = med ? med.id : (await db.run('INSERT INTO medicines (name) VALUES (?)', [item.medicineName])).lastID;
              invId = (await db.run(
                'INSERT INTO inventory_master (id, medicine_id, quantity, batch_no, expiry_date, mrp, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [invId, medId, 100, item.batchNo || 'B-MANUAL', item.expiryDate || '12/30', item.mrp || item.unitPrice, item.unitPrice]
              )).lastID;
            } else {
              const medId = (await db.run('INSERT INTO medicines (name) VALUES (?)', [`Item ${invId}`])).lastID;
              await db.run(
                'INSERT INTO inventory_master (id, medicine_id, quantity, batch_no, expiry_date, mrp, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [invId, medId, 100, 'B-MANUAL', '12/30', item.unitPrice, item.unitPrice]
              );
            }
          }
        } else {
          // Absolute fallback
          const medId = (await db.run('INSERT INTO medicines (name) VALUES (?)', ['Generic Medicine'])).lastID;
          invId = (await db.run(
            'INSERT INTO inventory_master (medicine_id, quantity, batch_no, expiry_date, mrp, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
            [medId, 100, 'B-MANUAL', '12/30', item.unitPrice, item.unitPrice]
          )).lastID;
        }

        await db.run(
          'INSERT INTO sale_items (invoice_id, inventory_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [invoiceId, invId, item.quantity, item.unitPrice]
        );
        // Decrement stock
        await db.run(
          'UPDATE inventory_master SET quantity = quantity - ? WHERE id = ?',
          [item.quantity, invId]
        );
      }

      // Trigger WhatsApp delivery asynchronously
      if (customerId) {
        import('./whatsappInvoiceService.js').then(({ whatsappInvoiceService }) => {
          whatsappInvoiceService.sendInvoiceViaWhatsApp(invoiceId).catch(console.error);
        });
      }

      return { invoiceNo, total, tax, subtotal };
    });
  }
}

// Singleton instance
export const invoiceService = new InvoiceService();