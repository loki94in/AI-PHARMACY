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
    const { items = [], patient_id, doctor_id, discount = 0, patient_name, patient_phone, patient_address } = req.body;

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
    const total = subtotal + tax - discount;

    // Generate invoice number
    const invoice_no = await generateInvoiceNo(db);

    // Insert invoice
    const result = await db.run(
      'INSERT INTO sales_invoices (invoice_no, customer_id, total_amount, tax_amount) VALUES (?, ?, ?, ?)',
      [invoice_no, customerId, total, tax]
    );
    const invoiceId = result.lastID;

    // Insert line items and update inventory
    for (const item of items) {
      const { inventory_id, quantity = 0, unit_price = 0 } = item;
      await db.run(
        'INSERT INTO sale_items (invoice_id, inventory_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [invoiceId, inventory_id, quantity, unit_price]
      );
      // Decrement stock
      await db.run('UPDATE inventory_master SET quantity = quantity - ? WHERE id = ?', [quantity, inventory_id]);
    }

    await db.close();
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

// Hold a bill
router.post('/hold', async (req, res) => {
  let dbHold;
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body required' });
    }
    dbHold = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const holdData = JSON.stringify(req.body);

    const holdInvoiceNo = await generateInvoiceNo(dbHold);
    await dbHold.run('INSERT INTO held_bills (invoice_no, data) VALUES (?, ?)', [holdInvoiceNo, holdData]);
    await dbHold.close();
    res.json({ success: true, message: 'Bill held', invoice_no: holdInvoiceNo });
  } catch (error) {
    if (dbHold) await dbHold.close();
    const err = error as Error;
    console.error(JSON.stringify({
      message: 'Failed to hold bill',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
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

// Hold a bill session
router.post('/hold', async (req, res) => {
  const { temp_label, patient_name, patient_phone, doctor_name, discount = 0, remarks, cart_data } = req.body;
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      `INSERT INTO held_bills (temp_label, patient_name, patient_phone, doctor_name, discount, remarks, cart_data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        temp_label || patient_name || 'Held Bill',
        patient_name || '',
        patient_phone || '',
        doctor_name || '',
        discount,
        remarks || '',
        typeof cart_data === 'string' ? cart_data : JSON.stringify(cart_data || [])
      ]
    );
    await db.close();
    res.json({ success: true, message: 'Bill held successfully' });
  } catch (error) {
    if (db) await db.close();
    console.error('Failed to hold bill:', error);
    res.status(500).json({ error: 'Failed to hold bill' });
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

