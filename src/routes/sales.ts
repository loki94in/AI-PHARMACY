import express from 'express';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

const generateInvoiceNo = async (db: Database) => {
  const year = new Date().getFullYear();
  const prefix = `S-${year}-`;
  const row = await db.get('SELECT invoice_no FROM sales_invoices WHERE invoice_no LIKE ? ORDER BY invoice_no DESC LIMIT 1', `${prefix}%`);
  let nextNum = 1;
  if (row && row.invoice_no) {
    const parts = row.invoice_no.split('-');
    const numPart = parts[2];
    nextNum = parseInt(numPart, 10) + 1;
  }
  const padded = String(nextNum).padStart(4, '0');
  return `${prefix}${padded}`;
};

// Get next sequential invoice number
router.get('/next-invoice', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const invoice_no = await generateInvoiceNo(db);
    await db.close();
    res.json({ invoice_no });
  } catch (error) {
    if (db) await db.close();
    const err = error as Error;
    console.error(JSON.stringify({
      message: 'Failed to get next invoice',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new sale
router.post('/', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const { items = [], patient_id, doctor_id, doctor_name, discount = 0, patient_name, patient_phone, patient_address, paymentMedium = 'CASH', paymentStatus = 'PAID', sendWhatsApp = false, sale_date, refillEnabled = false, refillDays = 30 } = req.body;

    // Basic validation
    if (!Array.isArray(items) || items.length === 0) {
      await db.close();
      return res.status(400).json({ error: 'Cart items required' });
    }

    // Resolve or auto-create customer/patient
    let customerId = patient_id || null;
    if (patient_name) {
      const cleanPhone = patient_phone || '';
      const existing = await db.get('SELECT id FROM customers WHERE name = ? AND phone = ?', [patient_name, cleanPhone]);
      if (existing) {
        customerId = existing.id;
      } else {
        const custResult = await db.run(
          'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
          [patient_name, cleanPhone, patient_address || '']
        );
        customerId = custResult.lastID;
      }
    }

    // Compute totals
    let subtotal = 0;
    for (const item of items) {
      const { quantity = 0, unit_price = 0 } = item;
      subtotal += quantity * unit_price;
    }

    const taxRate = 0.05; // 5% tax
    const tax = subtotal * taxRate;
    const total = Math.round(subtotal + tax - discount);

    // Generate invoice number
    const invoice_no = await generateInvoiceNo(db);

    // Insert invoice
    const invoiceDateValue = sale_date ? new Date(sale_date).toISOString() : new Date().toISOString();
    const result = await db.run(
      'INSERT INTO sales_invoices (invoice_no, customer_id, total_amount, tax_amount, payment_medium, payment_status, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [invoice_no, customerId, total, tax, paymentMedium, paymentStatus, invoiceDateValue]
    );
    const invoiceId = result.lastID;

    // Insert line items and update inventory
    for (const item of items) {
      const { inventory_id, quantity = 0, unit_price = 0, loose_qty = 0 } = item;
      await db.run(
        'INSERT INTO sale_items (invoice_id, inventory_id, quantity, unit_price, loose_qty) VALUES (?, ?, ?, ?, ?)',
        [invoiceId, inventory_id, quantity, unit_price, loose_qty]
      );
      // Decrement stock
      await db.run('UPDATE inventory_master SET quantity = quantity - ? WHERE id = ?', [quantity, inventory_id]);

      // Handle refill logic if enabled
      if (refillEnabled && inventory_id) {
        const invRecord = await db.get('SELECT medicine_id FROM inventory_master WHERE id = ?', [inventory_id]);
        if (invRecord && invRecord.medicine_id) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + Number(refillDays));
          
          await db.run(
            'INSERT INTO patient_refills (patient_name, patient_phone, medicine_id, refill_interval_days, next_refill_date, status) VALUES (?, ?, ?, ?, ?, ?)',
            [patient_name || 'Walk-in Customer', patient_phone || '', invRecord.medicine_id, refillDays, nextDate.toISOString(), 'pending']
          );
        }
      }
    }

    await db.close();

    // Trigger WhatsApp invoice sending if requested
    if (sendWhatsApp) {
      import('../services/whatsappInvoiceService.js')
        .then(({ whatsappInvoiceService }) => {
          whatsappInvoiceService.sendInvoiceViaWhatsApp(invoiceId).catch(err => {
            console.error(`Error in async WhatsApp dispatch for invoice ${invoice_no}:`, err);
          });
        })
        .catch(err => console.error('Failed to load whatsappInvoiceService:', err));
    }

    res.json({ success: true, invoice_no, total, tax });
  } catch (error) {
    if (db) await db.close();
    const err = error as Error;
    console.error(JSON.stringify({
      message: 'Failed to create sale',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hold a bill (Unified endpoint supporting both HTML and React POS formats)
router.post('/hold', async (req, res) => {
  let db;
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body required' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Extract fields from body
    const { 
      temp_label, 
      patient_name, 
      patient_phone, 
      doctor_name, 
      discount = 0, 
      remarks, 
      cart_data,
      data,
      items,
      patient,
      doctor
    } = req.body;

    // Standardize variables
    const finalPatientName = patient_name || (patient && typeof patient === 'object' ? patient.name : patient) || '';
    const finalPatientPhone = patient_phone || (patient && typeof patient === 'object' ? patient.phone : '') || '';
    const finalDoctor = doctor_name || doctor || '';
    const finalDiscount = discount || 0;
    const finalCartData = cart_data || items || [];
    
    // Create serialized data blob for compatibility with legacy HTML restoration
    const serializedData = data || JSON.stringify({
      items: finalCartData,
      patient: patient || { name: finalPatientName, phone: finalPatientPhone },
      doctor: finalDoctor,
      discount: finalDiscount,
      date: new Date().toLocaleString(),
      remarks: remarks || ''
    });

    const holdInvoiceNo = await generateInvoiceNo(db);
    
    await db.run(
      `INSERT INTO held_bills (
        invoice_no, temp_label, patient_name, patient_phone, doctor_name, 
        discount, remarks, cart_data, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        holdInvoiceNo,
        temp_label || finalPatientName || 'Held Bill',
        finalPatientName,
        finalPatientPhone,
        finalDoctor,
        finalDiscount,
        remarks || '',
        typeof finalCartData === 'string' ? finalCartData : JSON.stringify(finalCartData),
        serializedData
      ]
    );

    await db.close();
    res.json({ success: true, message: 'Bill held successfully', invoice_no: holdInvoiceNo });
  } catch (error) {
    if (db) await db.close();
    const err = error as Error;
    console.error('Failed to hold bill:', err);
    res.status(500).json({ error: 'Failed to hold bill' });
  }
});

// Get recommended quantity for a medicine based on sales history mode
router.get('/recommend-quantity', async (req, res) => {
  const medicineName = req.query.medicineName as string;
  if (!medicineName) {
    return res.status(400).json({ error: 'medicineName query parameter required' });
  }

  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Look up matching medicine first
    const med = await db.get(
      'SELECT id, name FROM medicines WHERE name LIKE ? LIMIT 1',
      `%${medicineName}%`
    );

    if (!med) {
      await db.close();
      return res.json({ recommendedQty: 1, type: 'strip', message: 'No matching history found' });
    }

    // Query historical sales quantities for this medicine
    const history = await db.all(
      `SELECT si.quantity, COUNT(*) as count 
       FROM sale_items si
       JOIN inventory_master im ON si.inventory_id = im.id
       WHERE im.medicine_id = ?
       GROUP BY si.quantity
       ORDER BY count DESC
       LIMIT 3`,
      med.id
    );

    await db.close();

    if (history.length > 0) {
      const mostFrequent = history[0];
      const qty = mostFrequent.quantity;
      let recommendedType = 'strip';
      let displayQty = qty;

      if (qty < 10) {
        recommendedType = 'loose';
        displayQty = qty;
      } else if (qty % 10 === 0) {
        recommendedType = 'strip';
        displayQty = qty / 10;
      } else {
        recommendedType = 'loose';
        displayQty = qty;
      }

      return res.json({
        recommendedQty: displayQty,
        type: recommendedType,
        actualUnits: qty,
        message: `Recommended: ${displayQty} ${recommendedType === 'strip' ? 'strip(s)' : 'loose unit(s)'} (based on ${mostFrequent.count} past order(s))`
      });
    }

    res.json({ recommendedQty: 1, type: 'strip', message: 'Default: 1 strip recommended' });
  } catch (error) {
    if (db) await db.close();
    console.error('Failed to get recommendation:', error);
    res.status(500).json({ error: 'Failed to analyze previous sales data' });
  }
});



// List all sales invoices with customer info and items
router.get('/list', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const { search, date_from, date_to, batch } = req.query;

    let query = `
      SELECT 
        si.id, si.invoice_no, si.date, si.total_amount, si.tax_amount,
        si.payment_medium, si.payment_status, si.roff,
        si.cgst_value, si.sgst_value, si.igst_value,
        c.name as customer_name, c.phone as customer_phone
      FROM sales_invoices si
      LEFT JOIN customers c ON si.customer_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      query += ` AND (si.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (date_from) {
      query += ` AND DATE(si.date) >= DATE(?)`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND DATE(si.date) <= DATE(?)`;
      params.push(date_to);
    }

    query += ` ORDER BY si.date DESC`;

    const invoices = await db.all(query, params);

    // If batch filter requested, further filter by item batch numbers
    if (batch) {
      const batchLower = `%${batch}%`;
      const filtered = [];
      for (const inv of invoices) {
        const items = await db.all(
          `SELECT si.*, im.batch_number, m.name as medicine_name
           FROM sale_items si
           JOIN inventory_master im ON si.inventory_id = im.id
           JOIN medicines m ON im.medicine_id = m.id
           WHERE si.invoice_id = ? AND (im.batch_number LIKE ? OR m.name LIKE ?)`,
          [inv.id, batchLower, batchLower]
        );
        if (items.length > 0) {
          inv.items = items;
          filtered.push(inv);
        }
      }
      await db.close();
      return res.json(filtered);
    }

    // Attach items for each invoice
    for (const inv of invoices) {
      inv.items = await db.all(
        `SELECT si.*, im.batch_number, im.expiry_date, m.name as medicine_name, m.mrp, im.pack_size
         FROM sale_items si
         JOIN inventory_master im ON si.inventory_id = im.id
         JOIN medicines m ON im.medicine_id = m.id
         WHERE si.invoice_id = ?`,
        [inv.id]
      );
    }

    await db.close();
    res.json(invoices);
  } catch (error) {
    if (db) await db.close();
    const err = error as Error;
    console.error(JSON.stringify({ message: 'Failed to list sales', error: err.message, timestamp: new Date().toISOString() }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single sale invoice with items
router.get('/:id', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const { id } = req.params;

    const invoice = await db.get(
      `SELECT si.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
       FROM sales_invoices si
       LEFT JOIN customers c ON si.customer_id = c.id
       WHERE si.id = ?`,
      [id]
    );

    if (!invoice) {
      await db.close();
      return res.status(404).json({ error: 'Invoice not found' });
    }

    invoice.items = await db.all(
      `SELECT si.*, im.batch_number, im.expiry_date, im.mrp as item_mrp, im.pack_size,
              m.name as medicine_name, m.mrp as medicine_mrp
       FROM sale_items si
       JOIN inventory_master im ON si.inventory_id = im.id
       JOIN medicines m ON im.medicine_id = m.id
       WHERE si.invoice_id = ?`,
      [id]
    );

    await db.close();
    res.json(invoice);
  } catch (error) {
    if (db) await db.close();
    const err = error as Error;
    console.error(JSON.stringify({ message: 'Failed to get sale', error: err.message, timestamp: new Date().toISOString() }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a sale invoice (items, customer, discount, etc.)
router.put('/:id', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const { id } = req.params;
    const { items, patient_name, patient_phone, discount = 0, paymentMedium, paymentStatus } = req.body;

    // Check invoice exists
    const existing = await db.get('SELECT * FROM sales_invoices WHERE id = ?', [id]);
    if (!existing) {
      await db.close();
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Resolve customer
    let customerId = existing.customer_id;
    if (patient_name) {
      const existingCust = await db.get('SELECT id FROM customers WHERE name = ? AND phone = ?', [patient_name, patient_phone || '']);
      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const custResult = await db.run('INSERT INTO customers (name, phone) VALUES (?, ?)', [patient_name, patient_phone || '']);
        customerId = custResult.lastID;
      }
    }

    // If items changed, reverse old stock and replace
    if (Array.isArray(items)) {
      // Reverse old stock
      const oldItems = await db.all('SELECT inventory_id, quantity FROM sale_items WHERE invoice_id = ?', [id]);
      for (const oi of oldItems) {
        await db.run('UPDATE inventory_master SET quantity = quantity + ? WHERE id = ?', [oi.quantity, oi.inventory_id]);
      }

      // Delete old items
      await db.run('DELETE FROM sale_items WHERE invoice_id = ?', [id]);

      // Compute new totals
      let subtotal = 0;
      for (const item of items) {
        const { inventory_id, quantity = 0, unit_price = 0, loose_qty = 0 } = item;
        await db.run('INSERT INTO sale_items (invoice_id, inventory_id, quantity, unit_price, loose_qty) VALUES (?, ?, ?, ?, ?)', [id, inventory_id, quantity, unit_price, loose_qty]);
        await db.run('UPDATE inventory_master SET quantity = quantity - ? WHERE id = ?', [quantity, inventory_id]);
        subtotal += quantity * unit_price;
      }

      const taxRate = 0.05;
      const tax = subtotal * taxRate;
      const total = Math.round(subtotal + tax - discount);

      await db.run(
        'UPDATE sales_invoices SET customer_id = ?, total_amount = ?, tax_amount = ?, payment_medium = COALESCE(?, payment_medium), payment_status = COALESCE(?, payment_status) WHERE id = ?',
        [customerId, total, tax, paymentMedium || null, paymentStatus || null, id]
      );
    } else {
      // Just update customer/discount
      await db.run('UPDATE sales_invoices SET customer_id = ? WHERE id = ?', [customerId, id]);
    }

    await db.close();
    res.json({ success: true, message: 'Invoice updated' });
  } catch (error) {
    if (db) await db.close();
    const err = error as Error;
    console.error(JSON.stringify({ message: 'Failed to update sale', error: err.message, timestamp: new Date().toISOString() }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a sale invoice (reverses stock)
router.delete('/:id', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM sales_invoices WHERE id = ?', [id]);
    if (!existing) {
      await db.close();
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Reverse stock
    const items = await db.all('SELECT inventory_id, quantity FROM sale_items WHERE invoice_id = ?', [id]);
    for (const item of items) {
      await db.run('UPDATE inventory_master SET quantity = quantity + ? WHERE id = ?', [item.quantity, item.inventory_id]);
    }

    // Delete items then invoice
    await db.run('DELETE FROM sale_items WHERE invoice_id = ?', [id]);
    await db.run('DELETE FROM sales_invoices WHERE id = ?', [id]);

    await db.close();
    res.json({ success: true, message: 'Invoice deleted, stock restored' });
  } catch (error) {
    if (db) await db.close();
    const err = error as Error;
    console.error(JSON.stringify({ message: 'Failed to delete sale', error: err.message, timestamp: new Date().toISOString() }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all held bills
router.get('/hold', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const rows = await db.all('SELECT * FROM held_bills ORDER BY date DESC');
    await db.close();
    res.json(rows);
  } catch (error) {
    if (db) await db.close();
    console.error('Failed to retrieve held bills:', error);
    res.status(500).json({ error: 'Failed to retrieve held bills' });
  }
});

// Delete a held bill session (e.g. upon retrieve or checkout completion)
router.delete('/hold/:id', async (req, res) => {
  const { id } = req.params;
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('DELETE FROM held_bills WHERE id = ?', id);
    await db.close();
    res.json({ success: true, message: 'Held bill removed' });
  } catch (error) {
    if (db) await db.close();
    console.error('Failed to delete held bill:', error);
    res.status(500).json({ error: 'Failed to delete held bill' });
  }
});

export default router;

