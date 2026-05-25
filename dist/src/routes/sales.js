import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const router = express.Router();
const generateInvoiceNo = async (db) => {
    const year = new Date().getFullYear();
    const prefix = `S-${year}-`;
    const row = await db.get('SELECT invoice_no FROM sales_invoices WHERE invoice_no LIKE ? ORDER BY invoice_no DESC LIMIT 1', `${prefix}%`);
    let nextNum = 1;
    if (row && row.invoice_no) {
        const parts = row.invoice_no.split('-');
        const numPart = parts[2];
        nextNum = parseInt(numPart, 10) + 1;
    }
    const padded = String(nextNum).padStart(4, '0');
    return `${prefix}${padded}`;
};
// Get next sequential invoice number
router.get('/next-invoice', async (req, res) => {
    let db;
    try {
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const invoice_no = await generateInvoiceNo(db);
        await db.close();
        res.json({ invoice_no });
    }
    catch (error) {
        if (db)
            await db.close();
        console.error(JSON.stringify({
            message: 'Failed to get next invoice',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create a new sale
router.post('/', async (req, res) => {
    let db;
    try {
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const { items = [], patient_id, doctor_id, discount = 0 } = req.body;
        // Basic validation
        if (!Array.isArray(items) || items.length === 0) {
            await db.close();
            return res.status(400).json({ error: 'Cart items required' });
        }
        // Compute totals
        let subtotal = 0;
        for (const item of items) {
            const { quantity = 0, unit_price = 0 } = item;
            subtotal += quantity * unit_price;
        }
        const taxRate = 0.05; // 5% tax
        const tax = subtotal * taxRate;
        const total = subtotal + tax - discount;
        // Generate invoice number
        const invoice_no = await generateInvoiceNo(db);
        // Insert invoice
        const result = await db.run('INSERT INTO sales_invoices (invoice_no, customer_id, total_amount, tax_amount) VALUES (?, ?, ?, ?)', [invoice_no, patient_id || null, total, tax]);
        const invoiceId = result.lastID;
        // Insert line items and update inventory
        for (const item of items) {
            const { inventory_id, quantity = 0, unit_price = 0 } = item;
            await db.run('INSERT INTO sale_items (invoice_id, inventory_id, quantity, unit_price) VALUES (?, ?, ?, ?)', [invoiceId, inventory_id, quantity, unit_price]);
            // Decrement stock
            await db.run('UPDATE inventory_master SET quantity = quantity - ? WHERE id = ?', [quantity, inventory_id]);
        }
        await db.close();
        res.json({ success: true, invoice_no, total, tax });
    }
    catch (error) {
        if (db)
            await db.close();
        console.error(JSON.stringify({
            message: 'Failed to create sale',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Hold a bill
router.post('/hold', async (req, res) => {
    let dbHold;
    try {
        if (!req.body) {
            return res.status(400).json({ error: 'Request body required' });
        }
        dbHold = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await dbHold.exec(`CREATE TABLE IF NOT EXISTS held_bills (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT, data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        const holdData = JSON.stringify(req.body);
        const holdInvoiceNo = await generateInvoiceNo(dbHold);
        await dbHold.run('INSERT INTO held_bills (invoice_no, data) VALUES (?, ?)', [holdInvoiceNo, holdData]);
        await dbHold.close();
        res.json({ success: true, message: 'Bill held', invoice_no: holdInvoiceNo });
    }
    catch (error) {
        if (dbHold)
            await dbHold.close();
        console.error(JSON.stringify({
            message: 'Failed to hold bill',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }));
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
