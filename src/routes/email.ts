// Email Parser API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { emailService } from '../services/emailService.js';
import { eventService } from '../services/eventService.js';


import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Receive raw email payload (e.g., webhook from email service)
router.post('/', async (req, res) => {
  const { subject, from, body, attachments } = req.body;
  if (!subject || !from) {
    return res.status(400).json({ error: 'subject and from are required' });
  }
  try {
    // Log the basic email info
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['EMAIL_RECEIVED', `From: ${from}, Subject: ${subject}`]
    );
    await db.close();

    // Process the email content using our email service
    const emailData = {
      from,
      subject,
      body: body || '',
      attachments: attachments || []
    };

    // Log the email receipt (more detailed)
    const db2 = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db2.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['EMAIL_RECEIVED_PROCESSED', `From: ${from}, Subject: ${subject}`]
    );
    await db2.close();

    // Process the email using our EmailService
    await emailService.processEmail(emailData);

    // Handle attachments if any
    if (emailData.attachments.length > 0) {
      await emailService.processAttachments(emailData.attachments);
    }

    console.log(`Email processed from ${from}: ${subject}`);
    eventService.broadcast('email_update', { success: true, message: 'Email received and processed' });
    res.json({ success: true, message: 'Email received and processed' });
  } catch (error: any) {
    console.error('Email parse error:', error);
    eventService.broadcast('email_update', { success: false, error: error.message || 'Failed to process email' });
    res.status(500).json({ error: 'Failed to process email' });
  }
});

// GET /api/email/inbox
router.get('/inbox', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  try {
    const inbox = await emailService.fetchInbox(limit);
    res.json(inbox);
  } catch (error) {
    console.error('Fetch inbox error:', error);
    res.status(500).json({ error: 'Failed to fetch email inbox' });
  }
});

// POST /api/email/import-manual
router.post('/import-manual', async (req, res) => {
  const { subject, from, body, date, attachments } = req.body;
  if (!subject || !from) {
    return res.status(400).json({ error: 'subject and from are required' });
  }
  try {
    const emailData = {
      from,
      subject,
      body: body || '',
      date: date ? new Date(date) : new Date(),
      attachments: attachments || []
    };

    await emailService.processEmail(emailData);

    res.json({ success: true, message: 'Invoice manually imported and delivery boy alerted' });
  } catch (error) {
    console.error('Manual import error:', error);
    res.status(500).json({ error: 'Failed to manually import email invoice' });
  }
});

// GET /api/email/attachments
router.get('/attachments', async (req, res) => {
  try {
    const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const files = fs.readdirSync(uploadsDir);
    const attachments = files.map(filename => {
      const filePath = path.join(uploadsDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        createdAt: stats.birthtime || stats.mtime,
      };
    }).filter(file => file.filename.match(/\.(csv|txt|xlsx?|ods)$/i));

    res.json(attachments);
  } catch (error) {
    console.error('Failed to read attachments:', error);
    res.status(500).json({ error: 'Failed to retrieve attachments' });
  }
});

// GET /api/email/:id/attachments — get files available for a specific email
router.get('/:id/attachments', async (req, res) => {
  try {
    const emailId = req.params.id;

    // Fetch the email record from action_logs
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const email = await db.get(
      'SELECT * FROM action_logs WHERE id = ? AND action_type = ?',
      [emailId, 'EMAIL_RECEIVED']
    );
    await db.close();

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Read all files from uploads folder
    const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const files = fs.readdirSync(uploadsDir);
    const attachments = files
      .filter(file => file.match(/\.(csv|txt|xlsx?|ods|pdf)$/i))
      .map(filename => {
        const filePath = path.join(uploadsDir, filename);
        const stats = fs.statSync(filePath);
        const ext = path.extname(filename).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.pdf': 'application/pdf',
          '.csv': 'text/csv',
          '.txt': 'text/plain',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.xls': 'application/vnd.ms-excel',
          '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
        };
        return {
          filename,
          size: stats.size,
          contentType: contentTypes[ext] || 'application/octet-stream',
          createdAt: stats.birthtime || stats.mtime,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(attachments);
  } catch (error) {
    console.error('Failed to read email attachments:', error);
    res.status(500).json({ error: 'Failed to retrieve attachments' });
  }
});

// POST /api/email/attachments/parse
router.post('/attachments/parse', async (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'filename is required' });
  }
  try {
    const filePath = path.resolve(__dirname, '..', '..', 'uploads', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Attachment file not found' });
    }

    const result = await emailService.parseAndImportAttachment(filePath);
    eventService.broadcast('email_update', { success: true, message: 'Attachment parsed successfully' });
    res.json(result);
  } catch (error: any) {
    console.error('Failed to parse attachment:', error);
    eventService.broadcast('email_update', { success: false, error: error.message || 'Failed to parse attachment' });
    res.status(500).json({ error: 'Failed to parse attachment' });
  }
});

export default router;
