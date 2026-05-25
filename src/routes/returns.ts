import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { aiCameraService } from '../services/aiCameraService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// List returns
router.get('/', async (_req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const rows = await db.all('SELECT * FROM returns ORDER BY date DESC');
    await db.close();
    res.json(rows);
  } catch (err) {
    if (db) await db.close();
    console.error(JSON.stringify({
      message: 'Returns fetch error',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a return (simplified)
router.post('/', async (req, res) => {
  let db;
  try {
    const { return_no, original_invoice_id, type, total_amount } = req.body;
    if (!return_no) {
      return res.status(400).json({ error: 'return_no is required' });
    }
    if (!original_invoice_id) {
      return res.status(400).json({ error: 'original_invoice_id is required' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO returns (return_no, original_invoice_id, type, total_amount) VALUES (?,?,?,?)', [return_no, original_invoice_id, type || null, total_amount || 0]);
    await db.close();
    res.json({ success: true, message: 'Return recorded' });
  } catch (err) {
    if (db) await db.close();
    console.error(JSON.stringify({
      message: 'Create return error',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/financial-note', async (req, res) => {
  let pdfDoc;
  let stream;
  try {
    const { type, amount, details } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'type required' });
    }

    pdfDoc = new PDFDocument();
    const filename = `financial-note-${Date.now()}.pdf`;
    const outPath = path.resolve(__dirname, '..', '..', 'catalog', filename);
    stream = fs.createWriteStream(outPath);
    pdfDoc.pipe(stream);
    pdfDoc.fontSize(20).text(`${type.charAt(0).toUpperCase() + type.slice(1)} Note`, { align: 'center' });
    if (amount) {
      pdfDoc.moveDown().fontSize(14).text(`Amount: ₹${amount}`, { align: 'center' });
    }
    if (details) {
      pdfDoc.moveDown().fontSize(12).text(`Details: ${details}`);
    }
    pdfDoc.moveDown().fontSize(12).text(`Generated on ${new Date().toLocaleString()}`);
    pdfDoc.end();
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    const url = `/catalog/${filename}`;
    res.json({ url, message: `${type} note generated` });
  } catch (err) {
    if (stream) {
      stream.destroy();
    }
    if (pdfDoc) {
      pdfDoc.end();
    }
    console.error(JSON.stringify({
      message: 'Financial note error',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});
export default router;
