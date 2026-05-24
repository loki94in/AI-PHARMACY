import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// List returns
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const rows = await db.all('SELECT * FROM returns ORDER BY date DESC');
    await db.close();
    res.json(rows);
  } catch (err) {
    console.error('Returns fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a return (simplified)
router.post('/', async (req, res) => {
  const { return_no, original_invoice_id, type, total_amount } = req.body;
  if (!return_no || !original_invoice_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO returns (return_no, original_invoice_id, type, total_amount) VALUES (?,?,?,?)', [return_no, original_invoice_id, type || null, total_amount || 0]);
    await db.close();
    res.json({ success: true, message: 'Return recorded' });
  } catch (err) {
    console.error('Create return error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
