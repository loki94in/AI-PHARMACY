import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const router = express.Router();
// List orders (placeholder – using sales_invoices as orders)
router.get('/', async (_req, res) => {
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const orders = await db.all('SELECT * FROM sales_invoices ORDER BY date DESC');
        await db.close();
        res.json(orders);
    }
    catch (err) {
        console.error('Orders fetch error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
