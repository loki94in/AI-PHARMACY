import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

import fs from 'fs';
import PDFDocument from 'pdfkit';

// Trigger backup
router.post('/backup', async (req, res) => {
  try {
    const backupDir = path.resolve(__dirname, '..', '..', 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `app_backup_${timestamp}.db`);
    
    // Copy the database file
    fs.copyFileSync(DB_PATH, backupPath);
    
    // Log the action
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['BACKUP', `Manual backup created: ${backupPath}`]);
    await db.close();

    res.json({ success: true, message: 'Backup created successfully', backupPath });
  } catch (error) {
    console.error('Backup failed:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Generate barcode labels
router.post('/barcode', async (req, res) => {
  const { items } = req.body; // Array of { name, batch }
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required' });
  }

  try {
    const doc = new PDFDocument();
    const pdfPath = path.resolve(__dirname, '..', '..', 'catalog', `barcodes_${Date.now()}.pdf`);
    const stream = fs.createWriteStream(pdfPath);
    
    doc.pipe(stream);
    
    doc.fontSize(16).text('Barcode Labels', { underline: true });
    doc.moveDown();
    
    items.forEach(item => {
      doc.fontSize(12).text(`Item: ${item.name || 'Unknown'}`);
      doc.fontSize(10).text(`Batch: ${item.batch || 'N/A'}`);
      doc.moveDown();
    });
    
    doc.end();
    
    stream.on('finish', () => {
      res.json({ success: true, pdfUrl: `/catalog/${path.basename(pdfPath)}` });
    });
  } catch (error) {
    console.error('Barcode generation failed:', error);
    res.status(500).json({ error: 'Failed to generate barcodes' });
  }
});

// Generate barcode PDF for a single code
router.get('/barcode/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const doc = new PDFDocument();
    const pdfPath = path.resolve(__dirname, '..', '..', 'catalog', `barcode_${code}_${Date.now()}.pdf`);
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    doc.fontSize(20).text(`Barcode: ${code}`, { align: 'center' });
    doc.end();
    stream.on('finish', () => {
      res.json({ success: true, pdfUrl: `/catalog/${path.basename(pdfPath)}` });
    });
  } catch (error) {
    console.error('Barcode generation failed:', error);
    res.status(500).json({ error: 'Failed to generate barcode' });
  }
});

export default router;
