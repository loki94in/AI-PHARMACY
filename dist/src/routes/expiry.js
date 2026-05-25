import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const router = express.Router();
// Get items nearing expiry within next 30 days
router.get('/', async (_req, res) => {
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const rows = await db.all(`
      SELECT im.id, m.name as medicine_name, im.expiry_date, im.quantity
      FROM inventory_master im
      JOIN medicines m ON im.medicine_id = m.id
      WHERE date(im.expiry_date) BETWEEN date('now') AND date('now', '+30 days')
      ORDER BY im.expiry_date ASC
    `);
        await db.close();
        res.json(rows);
    }
    catch (err) {
        console.error('Expiry fetch error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
