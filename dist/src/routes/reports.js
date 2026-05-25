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
    }
    catch (err) {
        console.error('Reports error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
import PDFDocument from 'pdfkit';
// Generic PDF export endpoint
router.get('/export-pdf', async (req, res) => {
    const { type } = req.query;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=export_${type}_${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);
    doc.fontSize(20).text(`Pharmacy OS - ${type} Report`, { align: 'center' });
    doc.moveDown();
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        let query = '';
        if (type === 'expiry') {
            query = 'SELECT item_name, expiry_date, quantity FROM inventory WHERE expiry_date <= date("now", "+90 days")';
        }
        else if (type === 'sales') {
            query = 'SELECT invoice_number, total_amount, payment_method FROM sales_invoices LIMIT 100';
        }
        else if (type === 'logs') {
            query = 'SELECT timestamp, action_type, description FROM action_logs ORDER BY id DESC LIMIT 100';
        }
        else if (type === 'compliance') {
            query = 'SELECT timestamp, action_type, description FROM action_logs WHERE action_type="DISPENSE_RX" ORDER BY id DESC LIMIT 100';
        }
        else {
            query = 'SELECT * FROM action_logs LIMIT 10';
        }
        const rows = await db.all(query);
        await db.close();
        if (rows.length === 0) {
            doc.fontSize(12).text('No records found for this report.');
        }
        else {
            rows.forEach(row => {
                doc.fontSize(10).text(JSON.stringify(row));
                doc.moveDown(0.5);
            });
        }
    }
    catch (err) {
        doc.fontSize(12).fillColor('red').text(`Error generating report: ${err.message}`);
    }
    doc.end();
});
export default router;
