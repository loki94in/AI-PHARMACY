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
    }
    catch (err) {
        console.error('Purchases fetch error:', err);
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
        await db.run('UPDATE purchases SET distributor_id = ?, invoice_no = ?, total_amount = ? WHERE id = ?', [distRow ? distRow.id : null, invoice_no, total_amount, id]);
        await db.close();
        res.json({ success: true, message: 'Purchase updated' });
    }
    catch (error) {
        console.error('Purchase update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/bulk-action', async (req, res) => {
    const { action, ids = [] } = req.body;
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        // Log the bulk action to action_logs using the correct schema
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', [`BULK_PURCHASE_${action.toUpperCase()}`, `Bulk ${action} on ${ids.length} purchases: [${ids.join(',')}]`]);
        await db.close();
        res.json({ success: true, message: `Bulk ${action} completed and logged` });
    }
    catch (error) {
        console.error('Bulk action error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
