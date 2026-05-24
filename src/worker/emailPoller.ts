import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { ensureSchema } from '../database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

/**
 * Polls the IMAP inbox for unseen emails, logs them, and enqueues any attachment
 * files as catalog jobs for later processing.
 */
export async function pollInbox() {
  try {
    await ensureSchema(DB_PATH);
    const config = {
      imap: {
        user: process.env.IMAP_USER || '',
        password: process.env.IMAP_PASS || '',
        host: process.env.IMAP_HOST || '',
        port: Number(process.env.IMAP_PORT) || 993,
        tls: process.env.IMAP_TLS === 'true',
        authTimeout: 3000,
      },
    };
    const connection = await imap.connect(config);
    await connection.openBox('INBOX');
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: [''], struct: true };
    const results = await connection.search(searchCriteria, fetchOptions);
    for (const item of results) {
      const all = item.parts.find((p) => p.which === '' ).body;
      const parsed = await simpleParser(all);
      const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_POLL', `From: ${parsed.from?.text || ''}, Subject: ${parsed.subject || ''}`]
      );
      if (parsed.attachments && parsed.attachments.length) {
        for (const att of parsed.attachments) {
          const safeName = att.filename?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
          await db.run(
            "INSERT OR IGNORE INTO catalog_jobs (file_path, status) VALUES (?, 'pending')",
            [safeName]
          );
        }
      }
      await db.close();
      // Mark as seen
      await connection.addFlags(item.attributes.uid, '\\Seen');
    }
    await connection.end();
  } catch (err) {
    console.error('Email poller error:', err);
  }
}

// Start polling every 5 minutes (300000 ms)
export function startEmailPoller() {
  // Immediate first run
  pollInbox();
  setInterval(pollInbox, 5 * 60 * 1000);
}
