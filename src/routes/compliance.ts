import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Compliance check placeholder – returns basic info
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Example: ensure no expired inventory items remain unsold
    const expiredCount = await db.get(`SELECT COUNT(*) as cnt FROM inventory_master WHERE date(expiry_date) < date('now')`);
    await db.close();
    res.json({ expiredItems: expiredCount.cnt, status: expiredCount.cnt === 0 ? 'compliant' : 'non-compliant' });
  } catch (err) {
    console.error('Compliance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
