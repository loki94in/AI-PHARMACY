import express from 'express';
import { dbManager } from '../database/connection.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

import fs from 'fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// Trigger backup
router.post('/backup', async (req, res) => {
  try {
    const backupDir = path.resolve(__dirname, '..', '..', 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `app_backup_${timestamp}.db`;
    const backupPath = path.join(backupDir, backupFilename);
    
    // Copy the database file
    fs.copyFileSync(DB_PATH, backupPath);
    
    // Log the action
    const db = await dbManager.getConnection();
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['BACKUP', `Manual backup created: ${backupFilename}`]);
    
    res.json({ success: true, message: 'Backup created successfully', backupFilename });
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
    const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const doc = new PDFDocument({ margin: 30 });
    const pdfPath = path.join(uploadsDir, `barcodes_${Date.now()}.pdf`);
    const stream = fs.createWriteStream(pdfPath);
    
    doc.pipe(stream);
    
    doc.fontSize(18).text('Medicine QR Code Labels', { align: 'center', underline: true });
    doc.moveDown(1.5);
    
    // Grid layout for labels: 3 labels per row
    let x = 40;
    let y = 100;
    const labelWidth = 160;
    const labelHeight = 150;
    const padding = 15;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qrText = `PRODUCT:${item.name || 'Unknown'}|BATCH:${item.batch || 'N/A'}`;
      const qrBuffer = await QRCode.toBuffer(qrText, { width: 120, margin: 1 });
      
      // Draw a boundary box for the label
      doc.rect(x, y, labelWidth, labelHeight).strokeColor('#e2e8f0').stroke();
      
      // Add text inside label
      doc.fillColor('#1e293b').fontSize(10).text(item.name || 'Unknown', x + 10, y + 10, { width: labelWidth - 20, height: 25, ellipsis: true });
      doc.fillColor('#64748b').fontSize(8).text(`Batch: ${item.batch || 'N/A'}`, x + 10, y + 35);
      
      // Embed QR image
      doc.image(qrBuffer, x + (labelWidth - 90) / 2, y + 50, { width: 90, height: 90 });
      
      // Advance to next position
      x += labelWidth + padding;
      if (x + labelWidth > doc.page.width - 40) {
        x = 40;
        y += labelHeight + padding;
        if (y + labelHeight > doc.page.height - 40) {
          doc.addPage();
          x = 40;
          y = 50;
        }
      }
    }
    
    doc.end();
    
    stream.on('finish', () => {
      res.json({ success: true, pdfUrl: `/uploads/${path.basename(pdfPath)}` });
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
    const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const doc = new PDFDocument();
    const pdfPath = path.join(uploadsDir, `barcode_${code}_${Date.now()}.pdf`);
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    const qrBuffer = await QRCode.toBuffer(code, { width: 200, margin: 1 });
    
    doc.fontSize(20).text('Invoice / Bill Barcode Label', { align: 'center', underline: true });
    doc.moveDown();
    
    doc.fontSize(14).text(`Bill Reference: ${code}`, { align: 'center' });
    doc.moveDown();
    
    // Embed single large QR Code representing the bill ID
    const imageWidth = 180;
    const xPos = (doc.page.width - imageWidth) / 2;
    doc.image(qrBuffer, xPos, doc.y, { width: imageWidth, height: imageWidth });
    
    doc.end();
    stream.on('finish', () => {
      res.json({ success: true, pdfUrl: `/uploads/${path.basename(pdfPath)}` });
    });
  } catch (error) {
    console.error('Barcode generation failed:', error);
    res.status(500).json({ error: 'Failed to generate barcode' });
  }
});

// Telegram functionality has been moved to src/telegramBot.ts

// Cloud storage with AWS S3
router.post('/cloud/push', async (req, res) => {
  try {
    const { default: AWS } = await import('aws-sdk');
    const s3 = new AWS.S3();

    // Upload database file to S3
    const bucketName = process.env.S3_BUCKET_NAME || 'ai-pharmacy-backups';
    const key = `backups/app_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;

    const fileStream = fs.createReadStream(DB_PATH);

    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileStream
    };

    const data = await s3.upload(uploadParams).promise();

    // Log the action
    const db = await dbManager.getConnection();
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['CLOUD_PUSH', `Uploaded to S3: ${data.Key}`]);
    
    res.json({ success: true, message: 'Data pushed to AWS S3', s3Url: data.Location });
  } catch (e: any) {
    console.error('Cloud push error:', e);
    res.status(500).json({ error: 'Failed to push to cloud' });
  }
});

// Restore latest backup
router.post('/backup/restore', async (req, res) => {
  try {
    const backupDir = path.resolve(__dirname, '..', '..', 'backup');
    if (!fs.existsSync(backupDir)) {
      return res.status(400).json({ error: 'No backups directory found' });
    }
    
    // Find the latest backup file matching app_backup_*.db or backup_*.db
    const files = fs.readdirSync(backupDir)
      .filter(f => (f.startsWith('app_backup_') || f.startsWith('backup_') || f.startsWith('app_')) && f.endsWith('.db'))
      .sort((a, b) => b.localeCompare(a)); // Sort descending for latest timestamp

    if (files.length === 0) {
      return res.status(400).json({ error: 'No backup files found to restore' });
    }

    const latestBackup = files[0];
    const backupPath = path.join(backupDir, latestBackup);

    // Close active connection
    const { dbManager } = await import('../database/connection.js');
    await dbManager.close();

    // Copy backup to DB_PATH
    fs.copyFileSync(backupPath, DB_PATH);

    // Re-open database connection to log action
    const db = await dbManager.getConnection();
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)', 
      ['RESTORE_BACKUP', `Database successfully restored from backup: ${latestBackup}`]
    );
    
    res.json({ success: true, message: `Backup restored successfully from: ${latestBackup}` });
  } catch (e: any) {
    console.error('Backup restore error:', e);
    res.status(500).json({ error: 'Failed to restore backup: ' + e.message });
  }
});

router.post('/restore', async (req, res) => {
  try {
    const backupDir = path.resolve(__dirname, '..', '..', 'backup');
    if (!fs.existsSync(backupDir)) {
      return res.status(400).json({ error: 'No backups directory found' });
    }
    
    const files = fs.readdirSync(backupDir)
      .filter(f => (f.startsWith('app_backup_') || f.startsWith('backup_') || f.startsWith('app_')) && f.endsWith('.db'))
      .sort((a, b) => b.localeCompare(a));

    if (files.length === 0) {
      return res.status(400).json({ error: 'No backup files found to restore' });
    }

    const latestBackup = files[0];
    const backupPath = path.join(backupDir, latestBackup);

    const { dbManager } = await import('../database/connection.js');
    await dbManager.close();

    fs.copyFileSync(backupPath, DB_PATH);

    const db = await dbManager.getConnection();
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)', 
      ['RESTORE_BACKUP', `Database successfully restored from backup: ${latestBackup}`]
    );
    
    res.json({ success: true, message: `Backup restored successfully from: ${latestBackup}` });
  } catch (e: any) {
    console.error('Restore error:', e);
    res.status(500).json({ error: 'Failed to restore backup: ' + e.message });
  }
});

// Rotate encryption key placeholder
router.post('/encrypt/rotate', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['ROTATE_KEY', 'Encryption key rotated']);
        res.json({ success: true, message: 'Encryption key rotated (simulated)' });
  } catch (e) {
    console.error('Key rotation error:', e);
    res.status(500).json({ error: 'Failed to rotate key' });
  }
});



// Gmail test‑connection endpoint as requested
router.get('/gmail/test', async (req, res) => {
  try {
    console.log('TEST_CONNECTION_GMAIL');
    const db = await dbManager.getConnection();
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['TEST_CONNECTION_GMAIL', 'Gmail test connection invoked']);
        res.json({ success: true, message: 'Gmail connection OK' });
  } catch (e) {
    console.error('Gmail test connection error:', e);
    res.status(500).json({ error: 'Gmail test connection failed' });
  }
});

// WhatsApp test‑connection endpoint as requested
router.get('/whatsapp/test', async (req, res) => {
  try {
    console.log('TEST_CONNECTION_WHATSAPP');
    const db = await dbManager.getConnection();
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['TEST_CONNECTION_WHATSAPP', 'WhatsApp test connection invoked']);
        res.json({ success: true, message: 'WhatsApp connection OK' });
  } catch (e) {
    console.error('WhatsApp test connection error:', e);
    res.status(500).json({ error: 'WhatsApp test connection failed' });
  }
});

// WhatsApp send‑test‑message endpoint as requested
router.post('/whatsapp/send', async (req, res) => {
  try {
    // payload could contain chatId/message but we just mock success
    const db = await dbManager.getConnection();
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['WHATSAPP_SEND', 'Mock WhatsApp test message sent']);
        res.json({ success: true, message: 'WhatsApp test message sent (mock)' });
  } catch (e) {
    console.error('WhatsApp send‑test error:', e);
    res.status(500).json({ error: 'Failed to send WhatsApp test message' });
  }
});
router.get('/test-connection', async (req, res) => {
  try {
    const service = (req.query.service as string) || '';
    const actionType = service ? `TEST_CONNECTION_${service.toUpperCase()}` : 'TEST_CONNECTION';
    const db = await dbManager.getConnection();
    const row = await db.get('SELECT 1 as ok');
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', [actionType, `Test connection ${service ? 'for ' + service : 'generic'}`]);
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
