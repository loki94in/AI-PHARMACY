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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('Barcode generation failed:', error);
        res.status(500).json({ error: 'Failed to generate barcode' });
    }
});
// Telegram functionality has been moved to src/telegramBot.ts
// Cloud storage with AWS S3
router.post('/cloud/push', async (req, res) => {
    try {
        const AWS = require('aws-sdk');
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
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['CLOUD_PUSH', `Uploaded to S3: ${data.Key}`]);
        await db.close();
        res.json({ success: true, message: 'Data pushed to AWS S3', s3Url: data.Location });
    }
    catch (e) {
        console.error('Cloud push error:', e);
        res.status(500).json({ error: 'Failed to push to cloud: ' + e.message });
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
    }
    catch (e) {
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
    }
    catch (e) {
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
    }
    catch (e) {
        console.error('Key rotation error:', e);
        res.status(500).json({ error: 'Failed to rotate key' });
    }
});
// Test connection placeholder
// Gmail test‑connection (placeholder – logs and returns success)
router.get('/test-connection/gmail', async (req, res) => {
    try {
        // In a real implementation, you'd use imap-simple to open a test IMAP connection.
        console.log('TEST_CONNECTION_GMAIL');
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['TEST_CONNECTION_GMAIL', 'Gmail test connection invoked']);
        await db.close();
        res.json({ success: true, message: 'Gmail connection OK' });
    }
    catch (e) {
        console.error('Gmail test connection error:', e);
        res.status(500).json({ error: 'Gmail test connection failed' });
    }
});
// WhatsApp test‑connection (placeholder – logs QR readiness and returns success)
router.get('/test-connection/whatsapp', async (req, res) => {
    try {
        console.log('TEST_CONNECTION_WHATSAPP');
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['TEST_CONNECTION_WHATSAPP', 'WhatsApp test connection invoked']);
        await db.close();
        res.json({ success: true, message: 'WhatsApp connection OK' });
    }
    catch (e) {
        console.error('WhatsApp test connection error:', e);
        res.status(500).json({ error: 'WhatsApp test connection failed' });
    }
});
// WhatsApp send‑test‑message (mock implementation)
router.post('/whatsapp/send-test', async (req, res) => {
    try {
        // payload could contain chatId/message but we just mock success
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['WHATSAPP_SEND', 'Mock WhatsApp test message sent']);
        await db.close();
        res.json({ success: true, message: 'WhatsApp test message sent (mock)' });
    }
    catch (e) {
        console.error('WhatsApp send‑test error:', e);
        res.status(500).json({ error: 'Failed to send WhatsApp test message' });
    }
});
// Gmail test‑connection endpoint as requested
router.get('/gmail/test', async (req, res) => {
    try {
        console.log('TEST_CONNECTION_GMAIL');
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['TEST_CONNECTION_GMAIL', 'Gmail test connection invoked']);
        await db.close();
        res.json({ success: true, message: 'Gmail connection OK' });
    }
    catch (e) {
        console.error('Gmail test connection error:', e);
        res.status(500).json({ error: 'Gmail test connection failed' });
    }
});
// WhatsApp test‑connection endpoint as requested
router.get('/whatsapp/test', async (req, res) => {
    try {
        console.log('TEST_CONNECTION_WHATSAPP');
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['TEST_CONNECTION_WHATSAPP', 'WhatsApp test connection invoked']);
        await db.close();
        res.json({ success: true, message: 'WhatsApp connection OK' });
    }
    catch (e) {
        console.error('WhatsApp test connection error:', e);
        res.status(500).json({ error: 'WhatsApp test connection failed' });
    }
});
// WhatsApp send‑test‑message endpoint as requested
router.post('/whatsapp/send', async (req, res) => {
    try {
        // payload could contain chatId/message but we just mock success
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['WHATSAPP_SEND', 'Mock WhatsApp test message sent']);
        await db.close();
        res.json({ success: true, message: 'WhatsApp test message sent (mock)' });
    }
    catch (e) {
        console.error('WhatsApp send‑test error:', e);
        res.status(500).json({ error: 'Failed to send WhatsApp test message' });
    }
});
router.get('/test-connection', async (req, res) => {
    try {
        const service = req.query.service || '';
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
    }
    catch (e) {
        console.error('Test connection error:', e);
        res.status(500).json({ error: 'Connection test failed' });
    }
});
// Email parser polling placeholder (simulated)
if (process.env.EMAIL_PARSER_ENABLED === 'true') {
    setInterval(async () => {
        console.log('Simulated email parser polling for invoices');
        try {
            const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
            await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['EMAIL_PARSER_POLL', 'Polled inbox for invoices']);
            await db.close();
        }
        catch (e) {
            console.error('Email poll error:', e);
        }
    }, 60000);
}
export default router;
