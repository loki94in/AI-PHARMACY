import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Get inventory master
router.get('/', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const rows = await db.all(`
      SELECT im.id, im.medicine_id, m.name as medicine_name, im.quantity, im.rack_location, im.batch_no, im.expiry_date
      FROM inventory_master im
      LEFT JOIN medicines m ON im.medicine_id = m.id
    `);
    await db.close();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update stock (Stock Override)
router.post('/override', async (req, res) => {
  try {
    const { inventory_id, quantity } = req.body;
    if (!inventory_id) {
      return res.status(400).json({ error: 'inventory_id required' });
    }
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('UPDATE inventory_master SET quantity = ? WHERE id = ?', [quantity, inventory_id]);
    await db.close();
    res.json({ success: true, message: 'Stock updated' });
  } catch (error) {
    console.error('Error overriding stock:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Smart-Hover Peek (Price Comparison Logs)
router.get('/peek/:medicine_id', async (req, res) => {
  try {
    const { medicine_id } = req.params;
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Simplified: return last purchase price from purchases table joined via inventory_master
    const rows = await db.all(
      `SELECT p.invoice_no, p.total_amount, im.quantity, im.unit_price FROM purchases p
       JOIN inventory_master im ON im.id = p.id
       WHERE im.medicine_id = ? ORDER BY p.date DESC LIMIT 5`,
      [medicine_id]
    );
    await db.close();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching peek data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { quantity, rack_location, batch_no, expiry_date, reorder_level } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(`UPDATE inventory_master SET quantity = ?, rack_location = ?, batch_no = ?, expiry_date = ?, reorder_level = ? WHERE id = ?`,
      [quantity, rack_location, batch_no, expiry_date, reorder_level, id]
    );
    await db.close();
    res.json({ success: true, message: 'Inventory updated' });
  } catch (error) {
    console.error('Inventory update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/bulk-action', async (req, res) => {
  const { action, ids = [] } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    if (action === 'discard') {
      // Placeholder: no operation, just respond
    } else if (action === 'commit' && ids.length) {
      // Example: set quantity flag or update status; here we just touch rows
      const placeholders = ids.map(() => '?').join(',');
      await db.run(`UPDATE inventory_master SET quantity = quantity WHERE id IN (${placeholders})`, ids);
    }
    await db.close();
    res.json({ success: true, message: 'Bulk action completed' });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
export default router;
