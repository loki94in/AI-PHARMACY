import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Dashboard summary
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Simple aggregates
    const salesTodayRow = await db.get(`SELECT IFNULL(SUM(total_amount),0) as total FROM sales_invoices WHERE date(date) = date('now')`);
    const lowStockCount = await db.get(`SELECT COUNT(*) as cnt FROM inventory_master WHERE quantity < 5`);
    const pendingTasks = 0; // Placeholder – could be derived from action_logs
    await db.close();
    res.json({
      todaySales: salesTodayRow.total,
      lowStock: lowStockCount.cnt,
      pendingTasks,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
