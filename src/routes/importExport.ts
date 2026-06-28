import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dbManager } from '../database/connection.js';
import { streamCsvResponse } from '../utils/csvExport.js';
import { workerSupervisor } from '../worker/workerSupervisor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMPORTS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'imports');
fs.mkdirSync(IMPORTS_DIR, { recursive: true });

const VALID_MODULES = new Set(['inventory', 'medicines', 'suppliers', 'customers', 'purchases', 'sales']);

const importStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMPORTS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
  },
});

const importUpload = multer({
  storage: importStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(csv|txt)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV/TXT files are accepted for import'));
    }
  },
});

const router = express.Router();

// ── Import ───────────────────────────────────────────────────────────────────

router.post('/import/:module', importUpload.single('file'), async (req, res) => {
  const { module } = req.params;
  if (!VALID_MODULES.has(module)) {
    return res.status(400).json({ error: `Unknown module "${module}". Valid: ${[...VALID_MODULES].join(', ')}` });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      `INSERT INTO catalog_jobs
         (file_path, original_filename, status, module_type, created_at)
       VALUES (?, ?, 'pending', ?, CURRENT_TIMESTAMP)`,
      [req.file.path, req.file.originalname, module]
    );
    const jobId = result.lastID!;
    await dbManager.close();

    workerSupervisor.sendToWorker('catalog', { type: 'MODULE_IMPORT_JOB', jobId, moduleType: module });

    res.json({ success: true, jobId });
  } catch (error: any) {
    await dbManager.close();
    console.error('Failed to create import job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/import/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const db = await dbManager.getConnection();
    const job = await db.get(
      `SELECT id, status, progress, module_type, original_filename,
              new_count, duplicate_count, error_log, processed_count, total_count,
              created_at
       FROM catalog_jobs WHERE id = ?`,
      [jobId]
    );
    await dbManager.close();
    if (!job) return res.status(404).json({ error: 'Import job not found' });
    res.json(job);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch import job status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Export ───────────────────────────────────────────────────────────────────

router.get('/export/inventory.csv', async (_req, res) => {
  const cols = ['medicine_name', 'item_code', 'batch_no', 'expiry_date', 'quantity', 'loose_quantity', 'mrp', 'cost_price', 'rack_location'];
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(`
      SELECT m.name AS medicine_name, m.item_code, im.batch_no, im.expiry_date,
             im.quantity, im.loose_quantity, im.mrp, im.cost_price, im.rack_location
      FROM inventory_master im
      JOIN medicines m ON im.medicine_id = m.id
      ORDER BY m.name ASC, im.expiry_date ASC
    `);
    await dbManager.close();
    streamCsvResponse(res, 'inventory.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    console.error('Export inventory error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/medicines.csv', async (_req, res) => {
  const cols = ['name', 'generic_name', 'manufacturer', 'marketed_by', 'pack_unit', 'strength',
                'mrp', 'hsn_code', 'cgst_per', 'sgst_per', 'igst_per', 'schedule_type',
                'rack', 'item_code', 'category', 'last_purchase_rate', 'last_distributor_name'];
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(`
      SELECT m.name, m.generic_name, m.manufacturer, m.marketed_by, m.pack_unit, m.strength,
             m.mrp, m.hsn_code, m.cgst_per, m.sgst_per, m.igst_per, m.schedule_type,
             m.rack, m.item_code, m.category,
             lp.cost_price AS last_purchase_rate, lp.last_distributor_name
      FROM medicines m
      LEFT JOIN (
        SELECT pi.medicine_id, pi.cost_price, d.name AS last_distributor_name,
               ROW_NUMBER() OVER (PARTITION BY pi.medicine_id ORDER BY p.date DESC) AS rn
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        LEFT JOIN distributors d ON p.distributor_id = d.id
      ) lp ON lp.medicine_id = m.id AND lp.rn = 1
      ORDER BY m.name ASC
    `);
    await dbManager.close();
    streamCsvResponse(res, 'medicines.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    console.error('Export medicines error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/suppliers.csv', async (_req, res) => {
  const cols = ['name', 'phone', 'email', 'address', 'city', 'state_code', 'gstin', 'dl_no'];
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all('SELECT name, phone, email, address, city, state_code, gstin, dl_no FROM distributors ORDER BY name ASC');
    await dbManager.close();
    streamCsvResponse(res, 'suppliers.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/customers.csv', async (_req, res) => {
  const cols = ['name', 'phone', 'address', 'age', 'gender', 'credit_enabled', 'credit_balance', 'notes'];
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all('SELECT name, phone, address, age, gender, credit_enabled, credit_balance, notes FROM customers ORDER BY name ASC');
    await dbManager.close();
    streamCsvResponse(res, 'customers.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/purchases.csv', async (req, res) => {
  const { from, to } = req.query;
  const cols = ['distributor_name', 'invoice_no', 'date', 'medicine_name', 'batch_no',
                'expiry_date', 'quantity', 'free_qty', 'cost_price', 'mrp',
                'cgst_per', 'sgst_per', 'igst_per'];
  try {
    const db = await dbManager.getConnection();
    const params: any[] = [];
    let dateFilter = '';
    if (from) { dateFilter += ' AND p.date >= ?'; params.push(from); }
    if (to)   { dateFilter += ' AND p.date <= ?'; params.push(to); }
    const rows = await db.all(`
      SELECT d.name AS distributor_name, p.invoice_no, p.date,
             m.name AS medicine_name, pi.batch_no, pi.expiry_date,
             pi.quantity, pi.free_qty, pi.cost_price, pi.mrp,
             pi.cgst_per, pi.sgst_per, pi.igst_per
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN medicines m ON pi.medicine_id = m.id
      LEFT JOIN distributors d ON p.distributor_id = d.id
      WHERE 1=1 ${dateFilter}
      ORDER BY p.date DESC, p.id, pi.id
    `, params);
    await dbManager.close();
    streamCsvResponse(res, 'purchases.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/sales.csv', async (req, res) => {
  const { from, to } = req.query;
  const cols = ['invoice_no', 'date', 'customer_name', 'doctor_name', 'medicine_name',
                'quantity', 'mrp', 'discount', 'total_amount'];
  try {
    const db = await dbManager.getConnection();
    const params: any[] = [];
    let dateFilter = '';
    if (from) { dateFilter += ' AND si.date >= ?'; params.push(from); }
    if (to)   { dateFilter += ' AND si.date <= ?'; params.push(to); }
    const rows = await db.all(`
      SELECT si.invoice_no, si.date,
             c.name AS customer_name, doc.name AS doctor_name,
             m.name AS medicine_name,
             sa.quantity, sa.mrp, sa.discount, si.total_amount
      FROM sale_items sa
      JOIN sales_invoices si ON sa.invoice_id = si.id
      JOIN inventory_master im ON sa.inventory_id = im.id
      JOIN medicines m ON im.medicine_id = m.id
      LEFT JOIN customers c ON si.customer_id = c.id
      LEFT JOIN doctors doc ON si.doctor_id = doc.id
      WHERE 1=1 ${dateFilter}
      ORDER BY si.date DESC, si.id, sa.id
    `, params);
    await dbManager.close();
    streamCsvResponse(res, 'sales.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── Report exports ────────────────────────────────────────────────────────────

router.get('/export/stock-report.csv', async (_req, res) => {
  const cols = ['medicine_name', 'item_code', 'batch_no', 'expiry_date', 'quantity', 'loose_quantity', 'mrp', 'rack_location', 'status'];
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(`
      SELECT m.name AS medicine_name, m.item_code, im.batch_no, im.expiry_date,
             im.quantity, im.loose_quantity, im.mrp, im.rack_location,
             CASE
               WHEN im.expiry_date <= DATE('now', '+90 days') THEN 'expiring_soon'
               WHEN im.quantity = 0 THEN 'out_of_stock'
               WHEN im.quantity <= 5 THEN 'low_stock'
               ELSE 'ok'
             END AS status
      FROM inventory_master im
      JOIN medicines m ON im.medicine_id = m.id
      ORDER BY status ASC, im.expiry_date ASC, m.name ASC
    `);
    await dbManager.close();
    streamCsvResponse(res, 'stock-report.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/expiry-report.csv', async (req, res) => {
  const days = parseInt(req.query.days as string) || 90;
  const cols = ['medicine_name', 'item_code', 'batch_no', 'expiry_date', 'quantity', 'mrp', 'rack_location', 'days_to_expiry'];
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(`
      SELECT m.name AS medicine_name, m.item_code, im.batch_no, im.expiry_date,
             im.quantity, im.mrp, im.rack_location,
             CAST(JULIANDAY(im.expiry_date) - JULIANDAY('now') AS INTEGER) AS days_to_expiry
      FROM inventory_master im
      JOIN medicines m ON im.medicine_id = m.id
      WHERE im.expiry_date IS NOT NULL
        AND im.expiry_date <= DATE('now', '+${days} days')
        AND im.quantity > 0
      ORDER BY im.expiry_date ASC
    `);
    await dbManager.close();
    streamCsvResponse(res, 'expiry-report.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/sales-report.csv', async (req, res) => {
  const { from, to } = req.query;
  const cols = ['medicine_name', 'total_qty_sold', 'total_revenue', 'invoice_count'];
  try {
    const db = await dbManager.getConnection();
    const params: any[] = [];
    let dateFilter = '';
    if (from) { dateFilter += ' AND si.date >= ?'; params.push(from); }
    if (to)   { dateFilter += ' AND si.date <= ?'; params.push(to); }
    const rows = await db.all(`
      SELECT m.name AS medicine_name,
             SUM(sa.quantity) AS total_qty_sold,
             ROUND(SUM(sa.quantity * sa.mrp * (1 - COALESCE(sa.discount, 0) / 100.0)), 2) AS total_revenue,
             COUNT(DISTINCT sa.invoice_id) AS invoice_count
      FROM sale_items sa
      JOIN sales_invoices si ON sa.invoice_id = si.id
      JOIN inventory_master im ON sa.inventory_id = im.id
      JOIN medicines m ON im.medicine_id = m.id
      WHERE 1=1 ${dateFilter}
      GROUP BY m.id, m.name
      ORDER BY total_revenue DESC
    `, params);
    await dbManager.close();
    streamCsvResponse(res, 'sales-report.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/export/purchase-report.csv', async (req, res) => {
  const { from, to } = req.query;
  const cols = ['distributor_name', 'invoice_count', 'total_value', 'last_purchase_date'];
  try {
    const db = await dbManager.getConnection();
    const params: any[] = [];
    let dateFilter = '';
    if (from) { dateFilter += ' AND p.date >= ?'; params.push(from); }
    if (to)   { dateFilter += ' AND p.date <= ?'; params.push(to); }
    const rows = await db.all(`
      SELECT d.name AS distributor_name,
             COUNT(DISTINCT p.id) AS invoice_count,
             ROUND(SUM(p.total_amount), 2) AS total_value,
             MAX(p.date) AS last_purchase_date
      FROM purchases p
      LEFT JOIN distributors d ON p.distributor_id = d.id
      WHERE 1=1 ${dateFilter}
      GROUP BY p.distributor_id, d.name
      ORDER BY total_value DESC
    `, params);
    await dbManager.close();
    streamCsvResponse(res, 'purchase-report.csv', cols, rows);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
