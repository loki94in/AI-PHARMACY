// Migration Utility API
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { dbManager } from '../database/connection.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import { migrationStatus, runManualMigration } from '../worker/migrationWorker.js';
import csvParser from 'csv-parser';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const MIGRATION_DIR = path.resolve(__dirname, '..', '..', 'MIGRATION SAMPEL');

if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });

const ALLOWED_MIGRATION_EXTENSIONS = /\.(zip|sql|gz|tgz|csv|xlsx|xls)$/i;
const MAX_MIGRATION_SIZE = 500 * 1024 * 1024; // 500MB

// ─── AUTO FILE-TYPE DETECTION ────────────────────────────────────────────────
const INVENTORY_KEYWORDS = ['batch', 'expiry', 'exp', 'rack', 'stock', 'qty', 'quantity', 'mrp', 'rate', 'medicine', 'product', 'item'];
const PURCHASE_KEYWORDS = ['distributor', 'supplier', 'vendor', 'purchase', 'invoice', 'bill', 'received', 'party', 'cgst', 'sgst'];
const SALES_KEYWORDS = ['patient', 'customer', 'sold', 'sale', 'bill_no', 'sell', 'doctor', 'retail', 'receipt'];
const CUSTOMER_KEYWORDS = ['name', 'phone', 'mobile', 'address', 'credit', 'balance'];

function autoDetectFileType(headers: string[]): { type: string; confidence: number } {
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z]/g, '_'));
  const score = (keywords: string[]) =>
    lower.filter(h => keywords.some(k => h.includes(k))).length;

  const scores = {
    inventory: score(INVENTORY_KEYWORDS),
    purchases: score(PURCHASE_KEYWORDS),
    sales: score(SALES_KEYWORDS),
    customers: score(CUSTOMER_KEYWORDS),
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  return { type: best[1] > 0 ? best[0] : 'unknown', confidence: Math.round((best[1] / total) * 100) };
}

// Helper: read headers from a CSV file
async function readCsvHeaders(filePath: string, skipLines = 0): Promise<{ headers: string[], samples: any[] }> {
  const headers: string[] = [];
  const samples: any[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser({ skipLines }))
      .on('headers', (h: string[]) => headers.push(...h))
      .on('data', (row: any) => { if (samples.length < 5) samples.push(row); })
      .on('end', resolve)
      .on('error', reject);
  });
  return { headers, samples };
}

// Helper: read headers from an Excel file
function readExcelHeaders(filePath: string): { headers: string[], samples: any[], sheetNames: string[] } {
  const wb = XLSX.readFile(filePath, { sheetRows: 6 });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[];
  if (!rows || rows.length === 0) return { headers: [], samples: [], sheetNames: wb.SheetNames };
  const headers = (rows[0] as string[]).map(String).filter(h => h.trim());
  const samples = rows.slice(1, 6).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, (row as any[])[i] ?? '']))
  );
  return { headers, samples, sheetNames: wb.SheetNames };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, MIGRATION_DIR);
  },
  filename: (_req, file, cb) => {
    const sanitized = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${sanitized}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_MIGRATION_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIGRATION_EXTENSIONS.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip, .sql, .gz, .tgz, .csv, .xlsx, .xls files are allowed'));
    }
  }
});

const router = express.Router();

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Upload Error:', err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ success: true, message: 'File uploaded successfully', file: req.file.filename });
  });
});

// Get live migration status
router.get('/status', (req, res) => {
  res.json(migrationStatus);
});

// List files in the MIGRATION SAMPEL folder
router.get('/files', (req, res) => {
  try {
    if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });
    const allowedExtensions = ['.zip', '.sql', '.gz', '.tgz', '.tar.gz'];
    const files = fs.readdirSync(MIGRATION_DIR).filter(f => {
      const lower = f.toLowerCase();
      return allowedExtensions.some(ext => lower.endsWith(ext));
    });
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Trigger a manual migration script
router.post('/run', async (req, res) => {
  const { fileName, mapping, skipLines } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: 'fileName required' });
  }
  try {
    const db = await dbManager.getConnection();
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['MIGRATION', `Requested manual migration for: ${fileName}`]
    );
    
    // Call the worker in the background
    const skipCount = parseInt(skipLines) || 0;
    runManualMigration(fileName, mapping, skipCount).catch(error => {
      console.error('Background migration error:', error);
    });

    res.json({ success: true, message: `Migration for ${fileName} started in the background` });
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message || 'Failed to start migration' });
  }
});

// Analyze a CSV file to return headers and a sample row for the UI Mapping Wizard
router.post('/analyze', async (req, res) => {
  const { fileName, skipLines } = req.body;
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  
  const filePath = path.join(MIGRATION_DIR, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  
  if (!fileName.toLowerCase().endsWith('.csv')) {
    return res.json({ headers: [], sample: {}, isCsv: false });
  }
  
  const headersSet = new Set<string>();
  let sampleRows: any[] = [];
  const skipCount = parseInt(skipLines) || 0;
  
  try {
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser({ skipLines: skipCount }))
        .on('headers', (headers: string[]) => {
          headers.forEach((h: string) => headersSet.add(h));
        })
        .on('data', (row) => {
          if (sampleRows.length < 5) {
            sampleRows.push(row);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    // Also get file size as an indicator of data amount
    const stat = fs.statSync(filePath);
    
    res.json({
      isCsv: true,
      headers: Array.from(headersSet).filter(h => h.trim() !== ''),
      samples: sampleRows,
      fileSize: stat.size,
      detected: autoDetectFileType(Array.from(headersSet).filter(h => h.trim() !== '')),
    });
  } catch (err: any) {
    console.error('CSV Analyze Error:', err);
    res.status(500).json({ error: 'Failed to analyze CSV', details: err.message });
  }
});

// ─── ANALYZE EXCEL FILE ───────────────────────────────────────────────────────
router.post('/analyze-excel', async (req, res) => {
  const { fileName, sheetIndex } = req.body;
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  const filePath = path.join(MIGRATION_DIR, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  const ext = fileName.toLowerCase();
  if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
    return res.status(400).json({ error: 'Not an Excel file' });
  }
  try {
    const wb = XLSX.readFile(filePath, { sheetRows: 6 });
    const sheetName = wb.SheetNames[sheetIndex ?? 0] ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[];
    const headers = (rows[0] as string[]).map(String).filter(h => h.trim());
    const samples = rows.slice(1, 6).map(row =>
      Object.fromEntries(headers.map((h, i) => [h, (row as any[])[i] ?? '']))
    );
    const stat = fs.statSync(filePath);
    res.json({
      isExcel: true,
      sheetNames: wb.SheetNames,
      activeSheet: sheetName,
      headers,
      samples,
      fileSize: stat.size,
      detected: autoDetectFileType(headers),
    });
  } catch (err: any) {
    console.error('Excel Analyze Error:', err);
    res.status(500).json({ error: 'Failed to analyze Excel file', details: err.message });
  }
});

// ─── ANALYZE ZIP FILE ─────────────────────────────────────────────────────────
// Extracts the ZIP in memory (no disk write), reads headers of each file inside
router.post('/analyze-zip', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'fileName required' });
  const filePath = path.join(MIGRATION_DIR, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  if (!fileName.toLowerCase().endsWith('.zip')) {
    return res.status(400).json({ error: 'Not a ZIP file' });
  }
  try {
    const buffer = fs.readFileSync(filePath);
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    
    const files: any[] = [];
    
    if (isGzip) {
      // Decompress GZIP in memory
      const decompressed = zlib.gunzipSync(buffer);
      
      // Determine a reasonable filename for the inner SQL file
      const baseName = fileName.replace(/\.zip$/i, '').replace(/\.gz$/i, '');
      const innerName = baseName.toLowerCase().endsWith('.sql') ? baseName : `${baseName}.sql`;
      
      const extractedName = `zip_${Date.now()}_${innerName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const extractedPath = path.join(MIGRATION_DIR, extractedName);
      fs.writeFileSync(extractedPath, decompressed);

      files.push({
        originalName: innerName,
        extractedFileName: extractedName,
        ext: 'sql',
        headers: ['[SQL file — will be auto-imported]'],
        samples: [],
        sheetNames: [],
        detected: { type: 'inventory', confidence: 50 },
        rowCount: null,
      });
    } else {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      const supportedExts = ['.csv', '.xlsx', '.xls', '.sql'];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const name = path.basename(entry.entryName);
        const ext = path.extname(name).toLowerCase();
        if (!supportedExts.includes(ext)) continue;

        // Extract this file to MIGRATION_DIR so it can be analyzed/processed
        const extractedName = `zip_${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const extractedPath = path.join(MIGRATION_DIR, extractedName);
        fs.writeFileSync(extractedPath, entry.getData());

        let headers: string[] = [];
        let samples: any[] = [];
        let sheetNames: string[] = [];

        try {
          if (ext === '.csv') {
            const r = await readCsvHeaders(extractedPath);
            headers = r.headers;
            samples = r.samples;
          } else if (ext === '.xlsx' || ext === '.xls') {
            const r = readExcelHeaders(extractedPath);
            headers = r.headers;
            samples = r.samples;
            sheetNames = r.sheetNames;
          } else if (ext === '.sql') {
            headers = ['[SQL file — will be auto-imported]'];
            samples = [];
          }
        } catch (_) { /* keep going even if one file fails */ }

        const detected = autoDetectFileType(headers);
        files.push({
          originalName: name,
          extractedFileName: extractedName,
          ext: ext.replace('.', ''),
          headers,
          samples: samples.slice(0, 3),
          sheetNames,
          detected,
          rowCount: null, // unknown without full parse
        });
      }
    }

    res.json({ zipFile: fileName, files });
  } catch (err: any) {
    console.error('ZIP Analyze Error:', err);
    res.status(500).json({ error: 'Failed to analyze ZIP file', details: err.message });
  }
});

// ─── ROLLBACK: Delete staging DB ─────────────────────────────────────────────
router.delete('/staging/rollback', async (_req, res) => {
  const STAGING_DB_PATH_LOCAL = path.resolve(__dirname, '..', '..', 'data', 'staging.db');
  try {
    if (fs.existsSync(STAGING_DB_PATH_LOCAL)) {
      fs.unlinkSync(STAGING_DB_PATH_LOCAL);
    }
    // Reset migration status
    Object.assign(migrationStatus, { active: false, progress: 0, message: 'Idle', file: null, isStagingReady: false, errorCount: 0 });
    res.json({ success: true, message: 'Staging cleared. Ready for a fresh migration.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to rollback staging', details: err.message });
  }
});

// --- STAGING APIS ---

const STAGING_DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'staging.db');

router.get('/staging/errors', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.json([]);
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    const rows = await db.all(`
      SELECT id, file_name, row_index, raw_data, error_message, created_at 
      FROM migration_errors 
      ORDER BY id DESC LIMIT 500
    `);
    await db.close();
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/staging/inventory', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.json([]);
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    const rows = await db.all(`
      SELECT m.name as medicine_name, m.api_reference, i.id, i.batch_no, i.expiry_date, i.quantity, i.mrp, i.cost_price, i.rack_location 
      FROM inventory_master i
      LEFT JOIN medicines m ON i.medicine_id = m.id
      ORDER BY i.id DESC LIMIT 200
    `);
    await db.close();
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/staging/inventory/:id', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.status(400).json({ error: 'No staging DB' });
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    const { rack_location, medicine_name, api_reference, batch_no, expiry_date, quantity, mrp, cost_price } = req.body;
    
    const updates = [];
    const params = [];
    if (rack_location !== undefined) { updates.push('rack_location = ?'); params.push(rack_location); }
    if (batch_no !== undefined) { updates.push('batch_no = ?'); params.push(batch_no); }
    if (expiry_date !== undefined) { updates.push('expiry_date = ?'); params.push(expiry_date); }
    if (quantity !== undefined) { updates.push('quantity = ?'); params.push(quantity); }
    if (mrp !== undefined) { updates.push('mrp = ?'); params.push(mrp); }
    if (cost_price !== undefined) { updates.push('cost_price = ?'); params.push(cost_price); }
    
    if (updates.length > 0) {
      await db.run(`UPDATE inventory_master SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    }
    
    if (medicine_name !== undefined || api_reference !== undefined) {
       const inv = await db.get('SELECT medicine_id FROM inventory_master WHERE id = ?', req.params.id);
       if (inv && inv.medicine_id) {
          const mUpdates = [];
          const mParams = [];
          if (medicine_name !== undefined) { mUpdates.push('name = ?'); mParams.push(medicine_name); }
          if (api_reference !== undefined) { mUpdates.push('api_reference = ?'); mParams.push(api_reference); }
          await db.run(`UPDATE medicines SET ${mUpdates.join(', ')} WHERE id = ?`, [...mParams, inv.medicine_id]);
       }
    }
    await db.close();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/staging/inventory/:id', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.status(400).json({ error: 'No staging DB' });
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    await db.run('DELETE FROM inventory_master WHERE id = ?', req.params.id);
    await db.close();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/staging/sales', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.json([]);
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    const rows = await db.all(`
      SELECT s.id, s.invoice_no, s.date, s.total_amount, c.name as patient_name, d.name as doctor_name
      FROM sales_invoices s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN doctors d ON s.doctor_id = d.id
      ORDER BY s.id DESC LIMIT 100
    `);
    await db.close();
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/staging/sales/:id', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.status(400).json({ error: 'No staging DB' });
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    const { invoice_no, date, total_amount, patient_name, doctor_name } = req.body;
    const updates = [];
    const params = [];
    if (invoice_no !== undefined) { updates.push('invoice_no = ?'); params.push(invoice_no); }
    if (date !== undefined) { updates.push('date = ?'); params.push(date); }
    if (total_amount !== undefined) { updates.push('total_amount = ?'); params.push(total_amount); }
    
    if (updates.length > 0) {
      await db.run(`UPDATE sales_invoices SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    }
    
    const sale = await db.get('SELECT customer_id, doctor_id FROM sales_invoices WHERE id = ?', req.params.id);
    if (sale) {
      if (patient_name !== undefined && sale.customer_id) {
         await db.run('UPDATE customers SET name = ? WHERE id = ?', [patient_name, sale.customer_id]);
      }
      if (doctor_name !== undefined && sale.doctor_id) {
         await db.run('UPDATE doctors SET name = ? WHERE id = ?', [doctor_name, sale.doctor_id]);
      }
    }
    await db.close();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/staging/sales/:id', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.status(400).json({ error: 'No staging DB' });
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    await db.run('DELETE FROM sales_invoices WHERE id = ?', req.params.id);
    await db.close();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/staging/purchases', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.json([]);
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    const rows = await db.all(`
      SELECT p.id, p.invoice_no, p.date, p.total_amount, d.name as distributor_name
      FROM purchases p
      LEFT JOIN distributors d ON p.distributor_id = d.id
      ORDER BY p.id DESC LIMIT 100
    `);
    await db.close();
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/staging/purchases/:id', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.status(400).json({ error: 'No staging DB' });
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    const { invoice_no, date, total_amount, distributor_name } = req.body;
    const updates = [];
    const params = [];
    if (invoice_no !== undefined) { updates.push('invoice_no = ?'); params.push(invoice_no); }
    if (date !== undefined) { updates.push('date = ?'); params.push(date); }
    if (total_amount !== undefined) { updates.push('total_amount = ?'); params.push(total_amount); }
    
    if (updates.length > 0) {
      await db.run(`UPDATE purchases SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    }
    
    if (distributor_name !== undefined) {
      const pur = await db.get('SELECT distributor_id FROM purchases WHERE id = ?', req.params.id);
      if (pur && pur.distributor_id) {
         await db.run('UPDATE distributors SET name = ? WHERE id = ?', [distributor_name, pur.distributor_id]);
      }
    }
    await db.close();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/staging/purchases/:id', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.status(400).json({ error: 'No staging DB' });
  try {
    const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
    await db.run('DELETE FROM purchases WHERE id = ?', req.params.id);
    await db.close();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/staging/finalize', async (req, res) => {
  if (!fs.existsSync(STAGING_DB_PATH)) return res.status(400).json({ error: 'No staging DB found' });
  const { regenerateInvoices } = req.body;
  try {
    if (regenerateInvoices) {
      const db = await open({ filename: STAGING_DB_PATH, driver: sqlite3.Database });
      const invoices = await db.all('SELECT id FROM sales_invoices ORDER BY id ASC');
      let counter = 1;
      const today = new Date();
      const prefix = `INV-${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,'0')}`;
      
      await db.run('BEGIN TRANSACTION');
      for (const inv of invoices) {
        const newInvoiceNo = `${prefix}-${counter.toString().padStart(5, '0')}`;
        await db.run('UPDATE sales_invoices SET invoice_no = ? WHERE id = ?', [newInvoiceNo, inv.id]);
        counter++;
      }
      await db.run('COMMIT');
      await db.close();
    }

    // Backup the old app.db just in case
    const backupPath = DB_PATH + '.bak_' + Date.now();
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupPath);
    }

    // Replace app.db with staging.db
    fs.copyFileSync(STAGING_DB_PATH, DB_PATH);
    fs.unlinkSync(STAGING_DB_PATH);
    
    // Reset migration status
    migrationStatus.isStagingReady = false;
    migrationStatus.message = 'Idle';
    
    res.json({ success: true, message: 'Migration finalized and live!' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
