// Email Parser API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { emailService } from '../services/emailService.js';


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

    res.json({ success: true, message: 'Email received and processed' });
  } catch (error) {
    console.error('Email parse error:', error);
    res.status(500).json({ error: 'Failed to process email' });
  }
});

// GET /api/email/inbox
router.get('/inbox', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
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
  const { subject, from, body, attachments } = req.body;
  if (!subject || !from) {
    return res.status(400).json({ error: 'subject and from are required' });
  }
  try {
    const emailData = {
      from,
      subject,
      body: body || '',
      attachments: attachments || []
    };

    await emailService.processEmail(emailData);

    res.json({ success: true, message: 'Invoice manually imported and delivery boy alerted' });
  } catch (error) {
    console.error('Manual import error:', error);
    res.status(500).json({ error: 'Failed to manually import email invoice' });
  }
});

export default router;
