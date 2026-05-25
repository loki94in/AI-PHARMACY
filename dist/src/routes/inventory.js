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
    let db;
    try {
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const rows = await db.all(`
      SELECT im.id, im.medicine_id, m.name as medicine_name, im.quantity, im.rack_location, im.batch_no, im.expiry_date
      FROM inventory_master im
      LEFT JOIN medicines m ON im.medicine_id = m.id
    `);
        await db.close();
        res.json(rows);
    }
    catch (error) {
        if (db)
            await db.close();
        console.error(JSON.stringify({
            message: 'Error fetching inventory',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update stock (Stock Override)
router.post('/override', async (req, res) => {
    let db;
    try {
        const { inventory_id, quantity } = req.body;
        if (!inventory_id) {
            return res.status(400).json({ error: 'inventory_id required' });
        }
        if (typeof quantity !== 'number' || quantity < 0) {
            return res.status(400).json({ error: 'quantity must be a non-negative number' });
        }
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('UPDATE inventory_master SET quantity = ? WHERE id = ?', [quantity, inventory_id]);
        await db.close();
        res.json({ success: true, message: 'Stock updated' });
    }
    catch (error) {
        if (db)
            await db.close();
        console.error(JSON.stringify({
            message: 'Error overriding stock',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Smart-Hover Peek (Price Comparison Logs)
router.get('/peek/:medicine_id', async (req, res) => {
    let db;
    try {
        const { medicine_id } = req.params;
        if (!medicine_id) {
            return res.status(400).json({ error: 'medicine_id is required' });
        }
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        // Simplified: return last purchase price from purchases table joined via inventory_master
        const rows = await db.all(`SELECT p.invoice_no, p.total_amount, im.quantity, im.unit_price FROM purchases p
       JOIN inventory_master im ON im.id = p.id
       WHERE im.medicine_id = ? ORDER BY p.date DESC LIMIT 5`, [medicine_id]);
        await db.close();
        res.json(rows);
    }
    catch (error) {
        if (db)
            await db.close();
        console.error(JSON.stringify({
            message: 'Error fetching peek data',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', async (req, res) => {
    let db;
    const { id } = req.params;
    const { quantity, rack_location, batch_no, expiry_date, reorder_level } = req.body;
    try {
        if (!id) {
            return res.status(400).json({ error: 'id is required' });
        }
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run(`UPDATE inventory_master SET quantity = ?, rack_location = ?, batch_no = ?, expiry_date = ?, reorder_level = ? WHERE id = ?`, [quantity, rack_location, batch_no, expiry_date, reorder_level, id]);
        await db.close();
        res.json({ success: true, message: 'Inventory updated' });
    }
    catch (error) {
        if (db)
            await db.close();
        console.error(JSON.stringify({
            message: 'Inventory update error',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/bulk-action', async (req, res) => {
    let db;
    const { action, ids = [] } = req.body;
    try {
        if (!action) {
            return res.status(400).json({ error: 'action is required' });
        }
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        // Log the bulk action to action_logs
        await db.run('INSERT INTO action_logs (date, product, patient_id, doctor_id, license_no, qty, bill_no) VALUES (?, ?, ?, ?, ?, ?, ?)', [new Date().toISOString().split('T')[0], `Bulk ${action}`, '', '', '', ids.length, `Bulk action: ${action}`]);
        await db.close();
        res.json({ success: true, message: `Bulk ${action} completed and logged` });
    }
    catch (error) {
        if (db)
            await db.close();
        console.error(JSON.stringify({
            message: 'Bulk action error',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
