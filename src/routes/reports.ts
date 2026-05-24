import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Basic analytics report placeholder
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const totalSales = await db.get('SELECT IFNULL(SUM(total_amount),0) as total FROM sales_invoices');
    const totalPurchases = await db.get('SELECT IFNULL(SUM(total_amount),0) as total FROM purchases');
    await db.close();
    res.json({ totalSales: totalSales.total, totalPurchases: totalPurchases.total });
  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
