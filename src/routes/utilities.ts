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

import TelegramBot from 'node-telegram-bot-api';

const token = process.env.TELEGRAM_BOT_TOKEN;
let bot: TelegramBot | null = null;
if (token) {
  bot = new TelegramBot(token, { polling: false });
}

// Telegram send
router.post('/telegram/send', async (req, res) => {
  const { chatId, message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message required' });
  }
  
  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!targetChatId) {
    return res.status(400).json({ error: 'chatId required' });
  }

  try {
    if (bot) {
      await bot.sendMessage(targetChatId, message);
    }
    
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['TELEGRAM_SEND', `To ${targetChatId}: ${message}`]);
    await db.close();
    
    res.json({ success: true, message: 'Telegram message sent successfully!' });
  } catch (e: any) {
    console.error('Telegram send error:', e);
    res.status(500).json({ error: 'Failed to send Telegram message: ' + e.message });
  }
});

// Cloud storage placeholder
router.post('/cloud/push', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['CLOUD_PUSH', 'Simulated cloud storage upload']);
    await db.close();
    res.json({ success: true, message: 'Data pushed to cloud (simulated)' });
  } catch (e) {
    console.error('Cloud push error:', e);
    res.status(500).json({ error: 'Failed to push to cloud' });
  }
});

// Restore backup placeholder
// New placeholder route: backup/restore
router.post('/backup/restore', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['RESTORE_BACKUP', 'Backup restore triggered via /backup/restore']);
    await db.close();
    res.json({ success: true, message: 'Backup restored (simulated)' });
  } catch (e) {
    console.error('Backup restore error:', e);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});
router.post('/restore', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['RESTORE_BACKUP', 'Backup restore triggered']);
    await db.close();
    res.json({ success: true, message: 'Backup restored (simulated)' });
  } catch (e) {
    console.error('Restore error:', e);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Rotate encryption key placeholder
router.post('/encrypt/rotate', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['ROTATE_KEY', 'Encryption key rotated']);
    await db.close();
    res.json({ success: true, message: 'Encryption key rotated (simulated)' });
  } catch (e) {
    console.error('Key rotation error:', e);
    res.status(500).json({ error: 'Failed to rotate key' });
  }
});

// Test connection placeholder
router.get('/test-connection', async (req, res) => {
  try {
    const service = (req.query.service as string) || '';
    const actionType = service ? `TEST_CONNECTION_${service.toUpperCase()}` : 'TEST_CONNECTION';
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const row = await db.get('SELECT 1 as ok');
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', [actionType, `Test connection ${service ? 'for ' + service : 'generic'}`]);
    await db.close();
    let message = 'Connection test OK';
    if (service) {
      const friendly = service.charAt(0).toUpperCase() + service.slice(1);
      message = `${friendly} test OK`;
    }
    res.json({ success: true, message, result: row });
  } catch (e) {
    console.error('Test connection error:', e);
    res.status(500).json({ error: 'Connection test failed' });
  }
});

export default router;
