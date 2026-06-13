import express from 'express';
import { dbManager } from '../database/connection.js';
import path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore — @types/pdfkit not installed; pdfkit works at runtime
import PDFDocument from 'pdfkit';
import { nonMovingReportService } from '../services/nonMovingReportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Basic analytics report placeholder
router.get('/', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    const totalSales = await db.get('SELECT IFNULL(SUM(total_amount),0) as total FROM sales_invoices');
    const totalPurchases = await db.get('SELECT IFNULL(SUM(total_amount),0) as total FROM purchases');
        res.json({ totalSales: totalSales.total, totalPurchases: totalPurchases.total });
  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


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
    const db = await dbManager.getConnection();
    let query = '';
    
    if (type === 'expiry') {
      query = `SELECT m.name as item_name, im.expiry_date, im.quantity
               FROM inventory_master im
               JOIN medicines m ON im.medicine_id = m.id
               WHERE date(im.expiry_date) <= date('now', '+90 days')`;
    } else if (type === 'sales') {
      query = 'SELECT invoice_no, total_amount, tax_amount FROM sales_invoices ORDER BY date DESC LIMIT 100';
    } else if (type === 'logs') {
      query = 'SELECT created_at as timestamp, action_type, description FROM action_logs ORDER BY id DESC LIMIT 100';
    } else if (type === 'compliance') {
      query = `SELECT created_at as timestamp, action_type, description FROM action_logs
               WHERE action_type IN ('DISPENSE_RX','SCHEDULE_H1_DISPENSE','COMPLIANCE_ENTRY') ORDER BY id DESC LIMIT 100`;
    } else {
      query = 'SELECT * FROM action_logs LIMIT 10';
    }

    
    const rows = await db.all(query);
        
    if (rows.length === 0) {
      doc.fontSize(12).text('No records found for this report.');
    } else {
      rows.forEach(row => {
        doc.fontSize(10).text(JSON.stringify(row));
        doc.moveDown(0.5);
      });
    }
    
  } catch (err: any) {
    doc.fontSize(12).fillColor('red').text(`Error generating report: ${err.message}`);
  }
  
  doc.end();
});

// Fetch report raw data lists
router.get('/data', async (req, res) => {
  const { type } = req.query;
  try {
    const db = await dbManager.getConnection();
    let data: any[] = [];
    if (type === 'sales') {
      data = await db.all('SELECT invoice_no, total_amount, date FROM sales_invoices ORDER BY date DESC LIMIT 50');
    } else if (type === 'purchases') {
      data = await db.all('SELECT p.invoice_no, p.total_amount, d.name as distributor, p.date FROM purchases p LEFT JOIN distributors d ON p.distributor_id = d.id ORDER BY p.date DESC LIMIT 50');
    } else if (type === 'expiry') {
      data = await db.all(`SELECT m.name as product, im.batch_no as batch, im.quantity as qty, im.expiry_date as expiry
                           FROM inventory_master im
                           JOIN medicines m ON im.medicine_id = m.id
                           WHERE date(im.expiry_date) <= date('now', '+90 days')
                           ORDER BY im.expiry_date ASC`);
    } else {
      data = await db.all('SELECT created_at as timestamp, action_type, description FROM action_logs ORDER BY id DESC LIMIT 50');
    }
        res.json(data);
  } catch (err) {
    console.error('Reports data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Non-moving inventory report endpoint
router.get('/non-moving', async (req, res) => {
  try {
    const { days } = req.query;
    const periodDays = days ? parseInt(days as string) : 90; // Default to 90 days

    // Generate the report
    const report = await nonMovingReportService.generateNonMovingReport(periodDays);

    // Save to file
    await nonMovingReportService.saveReportToFile(report);

    // Send notifications
    await nonMovingReportService.sendReportNotification(report);

    res.json({
      success: true,
      message: `Non-moving inventory report generated for last ${periodDays} days`,
      report: {
        generatedAt: report.generatedAt,
        periodDays: report.periodDays,
        totalNonMovingItems: report.totalNonMovingItems,
        totalValue: report.totalValue
      }
    });
  } catch (err: any) {
    console.error('Non-moving report error:', err);
    res.status(500).json({ error: 'Failed to generate non-moving report' });
  }
});

// Get non-moving items data (JSON)
router.get('/non-moving/data', async (req, res) => {
  try {
    const { days } = req.query;
    const periodDays = days ? parseInt(days as string) : 90; // Default to 90 days

    const items = await nonMovingReportService.getNonMovingItems(periodDays);

    res.json({
      success: true,
      periodDays: periodDays,
      count: items.length,
      items: items
    });
  } catch (err: any) {
    console.error('Non-moving data error:', err);
    res.status(500).json({ error: 'Failed to get non-moving inventory data' });
  }
});

// Product Trace audit endpoint (searches purchases & sales all-in-one)
router.get('/product-trace', async (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.json({ purchases: [], sales: [] });
  }

  let db;
  try {
    db = await dbManager.getConnection();
    const likeQuery = `%${query}%`;

    // Fetch matching purchases
    const purchases = await db.all(`
      SELECT pi.id, pi.batch_no, pi.expiry_date, pi.quantity, pi.cost_price, pi.mrp,
             p.invoice_no, p.date as transaction_date, d.name as distributor_name,
             m.name as medicine_name
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN distributors d ON p.distributor_id = d.id
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE m.name LIKE ? 
         OR pi.batch_no LIKE ? 
         OR p.invoice_no LIKE ? 
         OR d.name LIKE ?
      ORDER BY p.date DESC
      LIMIT 100
    `, [likeQuery, likeQuery, likeQuery, likeQuery]);

    // Fetch matching sales
    const sales = await db.all(`
      SELECT si.id, COALESCE(si.batch_no, im.batch_no) as batch_no, im.expiry_date, si.quantity, si.unit_price, si.mrp,
             inv.invoice_no, inv.date as transaction_date, c.name as customer_name,
             m.name as medicine_name
      FROM sale_items si
      JOIN sales_invoices inv ON si.invoice_id = inv.id
      LEFT JOIN customers c ON inv.customer_id = c.id
      JOIN inventory_master im ON si.inventory_id = im.id
      JOIN medicines m ON im.medicine_id = m.id
      WHERE m.name LIKE ?
         OR COALESCE(si.batch_no, im.batch_no) LIKE ?
         OR inv.invoice_no LIKE ?
         OR c.name LIKE ?
      ORDER BY inv.date DESC
      LIMIT 100
    `, [likeQuery, likeQuery, likeQuery, likeQuery]);

        res.json({ purchases, sales });
  } catch (err: any) {
    console.error('Error tracing product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

