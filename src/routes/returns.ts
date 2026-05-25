import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { aiCameraService } from '../services/aiCameraService.js';

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
  } catch (err: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
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

// AI Camera OCR endpoint for scanning medicine labels
router.post('/ai-camera/process', async (req, res) => {
  try {
    // Check if image data is provided
    if (!req.body || !req.body.image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const imageData = req.body.image;

    // Process the image with Tesseract OCR
    const result = await aiCameraService.processImage(imageData);

    // Extract potential medicine information from OCR text
    const medicineInfo = extractMedicineInfo(result.text);

    res.json({
      success: true,
      ocrResult: result,
      medicineInfo: medicineInfo,
      message: 'Image processed successfully'
    });
  } catch (err: any) {
    console.error(JSON.stringify({
      message: 'AI Camera processing error',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error during OCR processing' });
  }
});

// Helper function to extract medicine information from OCR text
function extractMedicineInfo(text: string) {
  const info: any = {};

  // Common patterns for medicine labels
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Look for medicine name (usually the largest/most prominent text)
  info.potentialName = lines.length > 0 ? lines[0] : '';

  // Look for strength/dosage patterns (e.g., "500mg", "10 mg")
  const strengthMatch = text.match(/\d+\s*(?:mg|g|ml|μg|iu)/i);
  if (strengthMatch) {
    info.strength = strengthMatch[0];
  }

  // Look for batch/lot numbers
  const batchMatch = text.match(/(?:batch|lot|#)\s*[:\-]?\s*([A-Z0-9]+)/i);
  if (batchMatch) {
    info.batchNumber = batchMatch[1];
  }

  // Look for expiry dates
  const expiryMatch = text.match(/(?:exp|expiry)\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2})/i);
  if (expiryMatch) {
    info.expiryDate = expiryMatch[1];
  }

  // Look for MRP/price
  const priceMatch = text.match(/(?:mrp|price|₹|rs)\s*[:\-]?\s*(\d+(?:\.\d{2})?)/i);
  if (priceMatch) {
    info.mrp = parseFloat(priceMatch[1]);
  }

  return info;
}

export default router;
