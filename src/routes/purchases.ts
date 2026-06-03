import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// List purchases
router.get('/', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const limit = parseInt(req.query.limit as string) || 100;
    const months = parseInt(req.query.months as string) || 0;
    const start = req.query.start as string;
    const end = req.query.end as string;
    
    let dateFilter = '';
    const params: any[] = [];
    
    if (start && end) {
      dateFilter = 'WHERE date(p.date) BETWEEN date(?) AND date(?)';
      params.push(start, end);
    } else if (start) {
      dateFilter = 'WHERE date(p.date) >= date(?)';
      params.push(start);
    } else if (end) {
      dateFilter = 'WHERE date(p.date) <= date(?)';
      params.push(end);
    } else if (months > 0) {
      dateFilter = `WHERE p.date >= datetime('now', '-${months} months')`;
    }
    
    const purchases = await db.all(`
      SELECT p.id, p.invoice_no, p.date, p.total_amount, d.name as distributor_name 
      FROM purchases p 
      LEFT JOIN distributors d ON p.distributor_id = d.id 
      ${dateFilter}
      ORDER BY p.date DESC 
      LIMIT ?
    `, [...params, limit]);
    await db.close();
    res.json(purchases);
  } catch (err) {
    console.error('Purchases fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/manual', async (req, res) => {
  const { distributor, invoice_no, date, cd_per, extra_credit, items } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('BEGIN TRANSACTION');

    // 1. Handle distributor
    await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', [distributor]);
    const distRow = await db.get('SELECT id FROM distributors WHERE name = ?', [distributor]);

    // Calculate totals securely on backend
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    for (const item of items) {
      const qty = parseFloat(item.qty) || 0;
      const rate = parseFloat(item.rate) || 0;
      const discPer = parseFloat(item.discPer) || 0;
      const discRs = parseFloat(item.discRs) || 0;
      const cgst = parseFloat(item.cgst) || 0;
      const sgst = parseFloat(item.sgst) || 0;

      const baseAmt = qty * rate;
      const lineDisc = discRs + (baseAmt * discPer / 100);
      const taxable = baseAmt - lineDisc;
      
      subtotal += taxable;
      totalCgst += taxable * (cgst / 100);
      totalSgst += taxable * (sgst / 100);
    }

    const cdPerVal = parseFloat(cd_per) || 0;
    const globalCdDisc = subtotal * (cdPerVal / 100);
    const extraCreditVal = parseFloat(extra_credit) || 0;

    const grandTotal = subtotal + totalCgst + totalSgst - globalCdDisc - extraCreditVal;

    // 2. Insert into purchases
    const purchRes = await db.run(
      `INSERT INTO purchases (distributor_id, invoice_no, date, total_amount, cgst_value, sgst_value) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [distRow.id, invoice_no, date, grandTotal, totalCgst, totalSgst]
    );
    const purchaseId = purchRes.lastID;

    // 3. Process items
    for (const item of items) {
      const { medicine, batch, expiry, qty, rate, mrp, discPer, discRs, cgst, sgst } = item;
      
      // Ensure medicine exists
      await db.run('INSERT OR IGNORE INTO medicines (name) VALUES (?)', [medicine]);
      const medRow = await db.get('SELECT id FROM medicines WHERE name = ?', [medicine]);
      const medId = medRow.id;

      const baseAmt = qty * rate;
      const lineDisc = discRs + (baseAmt * discPer / 100);
      const taxable = baseAmt - lineDisc;
      const cgstVal = taxable * (cgst / 100);
      const sgstVal = taxable * (sgst / 100);

      // Insert purchase_items
      await db.run(`
        INSERT INTO purchase_items 
        (purchase_id, medicine_id, batch_no, expiry_date, quantity, cost_price, mrp, cgst_per, cgst_value, sgst_per, sgst_value, cd_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [purchaseId, medId, batch, expiry, qty, rate, mrp, cgst, cgstVal, sgst, sgstVal, lineDisc]);

      // Update inventory_master
      const invRow = await db.get('SELECT id, quantity FROM inventory_master WHERE medicine_id = ? AND batch_no = ?', [medId, batch]);
      if (invRow) {
        await db.run('UPDATE inventory_master SET quantity = quantity + ?, cost_price = ?, mrp = ?, expiry_date = ? WHERE id = ?', 
          [qty, rate, mrp, expiry, invRow.id]);
      } else {
        await db.run(`
          INSERT INTO inventory_master (medicine_id, quantity, batch_no, expiry_date, cost_price, mrp)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [medId, qty, batch, expiry, rate, mrp]);
      }
    }

    await db.run('COMMIT');
    await db.close();
    res.json({ success: true, message: 'Purchase saved successfully' });
  } catch (error) {
    console.error('Manual purchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const purchase = await db.get(`
      SELECT p.*, d.name as distributor_name 
      FROM purchases p 
      LEFT JOIN distributors d ON p.distributor_id = d.id 
      WHERE p.id = ?
    `, [id]);
    
    if (!purchase) {
      await db.close();
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const items = await db.all(`
      SELECT pi.*, m.name as medicine_name 
      FROM purchase_items pi
      LEFT JOIN medicines m ON pi.medicine_id = m.id
      WHERE pi.purchase_id = ?
    `, [id]);

    await db.close();
    res.json({ purchase, items });
  } catch (error) {
    console.error('Fetch purchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/full', async (req, res) => {
  const { id } = req.params;
  const { distributor, invoice_no, date, cd_per, extra_credit, items } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('BEGIN TRANSACTION');

    // 1. Revert old items from inventory
    const oldItems = await db.all('SELECT * FROM purchase_items WHERE purchase_id = ?', [id]);
    for (const old of oldItems) {
      // We subtract the old quantity
      await db.run(
        'UPDATE inventory_master SET quantity = quantity - ? WHERE medicine_id = ? AND batch_no = ?',
        [old.quantity, old.medicine_id, old.batch_no]
      );
    }
    // Delete old items
    await db.run('DELETE FROM purchase_items WHERE purchase_id = ?', [id]);

    // 2. Handle distributor
    await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', [distributor]);
    const distRow = await db.get('SELECT id FROM distributors WHERE name = ?', [distributor]);

    // Calculate new totals
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    for (const item of items) {
      const qty = parseFloat(item.qty) || 0;
      const rate = parseFloat(item.rate) || 0;
      const discPer = parseFloat(item.discPer) || 0;
      const discRs = parseFloat(item.discRs) || 0;
      const cgst = parseFloat(item.cgst) || 0;
      const sgst = parseFloat(item.sgst) || 0;

      const baseAmt = qty * rate;
      const lineDisc = discRs + (baseAmt * discPer / 100);
      const taxable = baseAmt - lineDisc;
      
      subtotal += taxable;
      totalCgst += taxable * (cgst / 100);
      totalSgst += taxable * (sgst / 100);
    }

    const cdPerVal = parseFloat(cd_per) || 0;
    const globalCdDisc = subtotal * (cdPerVal / 100);
    const extraCreditVal = parseFloat(extra_credit) || 0;
    const grandTotal = subtotal + totalCgst + totalSgst - globalCdDisc - extraCreditVal;

    // 3. Update purchases record
    await db.run(
      `UPDATE purchases 
       SET distributor_id = ?, invoice_no = ?, date = ?, total_amount = ?, cgst_value = ?, sgst_value = ? 
       WHERE id = ?`,
      [distRow.id, invoice_no, date, grandTotal, totalCgst, totalSgst, id]
    );

    // 4. Insert new items
    for (const item of items) {
      const { medicine, batch, expiry, qty, rate, mrp, discPer, discRs, cgst, sgst } = item;
      
      await db.run('INSERT OR IGNORE INTO medicines (name) VALUES (?)', [medicine]);
      const medRow = await db.get('SELECT id FROM medicines WHERE name = ?', [medicine]);
      const medId = medRow.id;

      const baseAmt = qty * rate;
      const lineDisc = discRs + (baseAmt * discPer / 100);
      const taxable = baseAmt - lineDisc;
      const cgstVal = taxable * (cgst / 100);
      const sgstVal = taxable * (sgst / 100);

      await db.run(`
        INSERT INTO purchase_items 
        (purchase_id, medicine_id, batch_no, expiry_date, quantity, cost_price, mrp, cgst_per, cgst_value, sgst_per, sgst_value, cd_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, medId, batch, expiry, qty, rate, mrp, cgst, cgstVal, sgst, sgstVal, lineDisc]);

      // Update inventory_master (add new quantity)
      const invRow = await db.get('SELECT id, quantity FROM inventory_master WHERE medicine_id = ? AND batch_no = ?', [medId, batch]);
      if (invRow) {
        await db.run('UPDATE inventory_master SET quantity = quantity + ?, cost_price = ?, mrp = ?, expiry_date = ? WHERE id = ?', 
          [qty, rate, mrp, expiry, invRow.id]);
      } else {
        await db.run(`
          INSERT INTO inventory_master (medicine_id, quantity, batch_no, expiry_date, cost_price, mrp)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [medId, qty, batch, expiry, rate, mrp]);
      }
    }

    await db.run('COMMIT');
    await db.close();
    res.json({ success: true, message: 'Purchase updated successfully' });
  } catch (error) {
    console.error('Full purchase update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { distributor, invoice_no, total_amount } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Upsert distributor name → get its id
    if (distributor) {
      await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', [distributor]);
    }
    const distRow = distributor
      ? await db.get('SELECT id FROM distributors WHERE name = ?', [distributor])
      : null;
    await db.run(
      'UPDATE purchases SET distributor_id = ?, invoice_no = ?, total_amount = ? WHERE id = ?',
      [distRow ? distRow.id : null, invoice_no, total_amount, id]
    );
    await db.close();
    res.json({ success: true, message: 'Purchase updated' });
  } catch (error) {
    console.error('Purchase update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/bulk-action', async (req, res) => {
  const { action, ids = [] } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Log the bulk action to action_logs using the correct schema
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      [`BULK_PURCHASE_${(action as string).toUpperCase()}`, `Bulk ${action} on ${ids.length} purchases: [${(ids as any[]).join(',')}]`]
    );

    await db.close();
    res.json({ success: true, message: `Bulk ${action} completed and logged` });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get last purchase data for auto-fill (medicine + distributor matching)
router.get('/last-purchase', async (req, res) => {
  let db;
  try {
    const name = req.query.name as string;
    const distributorId = req.query.distributor_id as string;
    if (!name) {
      return res.status(400).json({ error: 'Medicine name query is required' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });

    // Find medicine by name (fuzzy)
    const medicines = await db.all(
      'SELECT id, name FROM medicines WHERE name LIKE ? LIMIT 5',
      [`%${name}%`]
    );
    if (medicines.length === 0) {
      await db.close();
      return res.json({ found: false });
    }

    const medicineIds = medicines.map((m: any) => m.id);
    const placeholders = medicineIds.map(() => '?').join(',');

    let query = `
      SELECT pi.*, m.name as medicine_name, m.id as medicine_id,
             p.invoice_no, p.date as purchase_date,
             d.name as distributor_name, d.id as distributor_id
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN medicines m ON pi.medicine_id = m.id
      JOIN distributors d ON p.distributor_id = d.id
      WHERE pi.medicine_id IN (${placeholders})
    `;
    const params: any[] = [...medicineIds];

    if (distributorId) {
      query += ' AND p.distributor_id = ?';
      params.push(parseInt(distributorId));
    }

    query += ' ORDER BY p.date DESC LIMIT 1';

    const lastPurchase = await db.get(query, params);
    await db.close();

    if (!lastPurchase) {
      return res.json({ found: false });
    }

    res.json({
      found: true,
      medicine_id: lastPurchase.medicine_id,
      medicine_name: lastPurchase.medicine_name,
      batch_no: lastPurchase.batch_no,
      expiry_date: lastPurchase.expiry_date,
      cost_price: lastPurchase.cost_price,
      mrp: lastPurchase.mrp,
      cgst_per: lastPurchase.cgst_per,
      sgst_per: lastPurchase.sgst_per,
      quantity: lastPurchase.quantity,
      free_qty: lastPurchase.free_qty || 0,
      distributor_name: lastPurchase.distributor_name,
      distributor_id: lastPurchase.distributor_id,
      purchase_date: lastPurchase.purchase_date
    });
  } catch (error) {
    console.error('Last purchase lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Price history: get all past purchase prices for a medicine from different distributors
router.get('/price-history', async (req, res) => {
  let db;
  try {
    const name = req.query.name as string;
    if (!name) {
      return res.status(400).json({ error: 'Medicine name query is required' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });

    const medicines = await db.all(
      'SELECT id FROM medicines WHERE name LIKE ? LIMIT 5',
      [`%${name}%`]
    );
    if (medicines.length === 0) {
      await db.close();
      return res.json({ data: [] });
    }

    const medicineIds = medicines.map((m: any) => m.id);
    const placeholders = medicineIds.map(() => '?').join(',');

    const priceHistory = await db.all(`
      SELECT 
        p.date,
        d.name as distributor_name,
        pi.batch_no,
        pi.expiry_date,
        pi.cost_price as rate,
        pi.mrp,
        pi.cgst_per,
        pi.sgst_per,
        pi.cd_value as cd_rs
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN distributors d ON p.distributor_id = d.id
      WHERE pi.medicine_id IN (${placeholders})
      ORDER BY p.date DESC
      LIMIT 20
    `, medicineIds);

    await db.close();
    res.json({ data: priceHistory });
  } catch (error) {
    console.error('Price history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch auto-fill: get last purchase for multiple medicines at once
router.post('/batch-last-purchase', async (req, res) => {
  let db;
  try {
    const { medicines, distributor_id } = req.body;
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ error: 'medicines array is required' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });

    const results: any[] = [];
    for (const med of medicines) {
      const name = med.name || med;
      const fuzzyRows = await db.all(
        'SELECT id, name FROM medicines WHERE name LIKE ? LIMIT 5',
        [`%${name}%`]
      );
      if (fuzzyRows.length === 0) {
        results.push({ query: name, found: false });
        continue;
      }

      const ids = fuzzyRows.map((r: any) => r.id);
      const ph = ids.map(() => '?').join(',');
      let q = `
        SELECT pi.*, m.name as medicine_name, m.id as medicine_id,
               d.name as distributor_name, d.id as distributor_id
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN medicines m ON pi.medicine_id = m.id
        JOIN distributors d ON p.distributor_id = d.id
        WHERE pi.medicine_id IN (${ph})
      `;
      const p: any[] = [...ids];
      if (distributor_id) {
        q += ' AND p.distributor_id = ?';
        p.push(parseInt(distributor_id));
      }
      q += ' ORDER BY p.date DESC LIMIT 1';

      const row = await db.get(q, p);
      if (!row) {
        results.push({ query: name, found: false });
        continue;
      }
      results.push({
        query: name,
        found: true,
        medicine_id: row.medicine_id,
        medicine_name: row.medicine_name,
        batch_no: row.batch_no,
        expiry_date: row.expiry_date,
        cost_price: row.cost_price,
        mrp: row.mrp,
        cgst_per: row.cgst_per,
        sgst_per: row.sgst_per,
        quantity: row.quantity,
        free_qty: row.free_qty || 0,
        distributor_name: row.distributor_name
      });
    }

    await db.close();
    res.json(results);
  } catch (error) {
    console.error('Batch last purchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
