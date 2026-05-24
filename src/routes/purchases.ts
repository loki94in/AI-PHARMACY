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
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const purchases = await db.all(`SELECT p.id, p.invoice_no, p.date, p.total_amount, d.name as distributor_name FROM purchases p LEFT JOIN distributors d ON p.distributor_id = d.id ORDER BY p.date DESC`);
    await db.close();
    res.json(purchases);
  } catch (err) {
    console.error('Purchases fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { distributor, invoice_no, total_amount } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('UPDATE purchases SET distributor = ?, invoice_no = ?, total_amount = ? WHERE id = ?', [distributor, invoice_no, total_amount, id]);
    await db.close();
    res.json({ success: true, message: 'Purchase updated' });
  } catch (error) {
    console.error('Purchase update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
export default router;
