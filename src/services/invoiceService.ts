import { Database } from 'sqlite';
import { dbManager } from '../database/connection';
import { config } from '../config';

export interface InvoiceItem {
  inventoryId: number;
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

      // Insert invoice
      const result = await db.run(
        'INSERT INTO sales_invoices (invoice_no, customer_id, total_amount, tax_amount) VALUES (?, ?, ?, ?)',
        [invoiceNo, customerId, total, tax]
      );
      const invoiceId = result.lastID;

      // Insert line items and update inventory (in same transaction)
      for (const item of data.items) {
        await db.run(
          'INSERT INTO sale_items (invoice_id, inventory_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [invoiceId, item.inventoryId, item.quantity, item.unitPrice]
        );
        // Decrement stock
        await db.run(
          'UPDATE inventory_master SET quantity = quantity - ? WHERE id = ?',
          [item.quantity, item.inventoryId]
        );
      }

      return { invoiceNo, total, tax, subtotal };
    });
  }
}

// Singleton instance
export const invoiceService = new InvoiceService();