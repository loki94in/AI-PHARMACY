// Archive & Purge API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Purge old records older than given days (safe implementation)
router.post('/purge', async (req, res) => {
  const { table, days } = req.body;
  if (!table || typeof days !== 'number') {
    return res.status(400).json({ error: 'table and days are required' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const iso = cutoff.toISOString();

    // Safe mapping: never interpolate user input into SQL
    const purgeQueries: Record<string, string> = {
      'action_logs': 'DELETE FROM action_logs WHERE created_at < ?',
      'settings': 'DELETE FROM settings WHERE rowid IN (SELECT rowid FROM settings LIMIT 0)', // settings has no date column, no-op
      'customers': 'DELETE FROM customers WHERE rowid IN (SELECT rowid FROM customers LIMIT 0)', // customers has no date column, no-op
    };
    const query = purgeQueries[table];
    if (!query) {
      await db.close();
      return res.status(400).json({ error: 'Table not allowed for purge' });
    }
    await db.run(query, iso);
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['PURGE', `Purged ${table} older than ${days} days`]);
    await db.close();
    res.json({ success: true, message: `Purged old records from ${table}` });
  } catch (error) {
    console.error('Archive purge error:', error);
    res.status(500).json({ error: 'Failed to purge records' });
  }
});

router.get('/preview', async (req, res) => {
  const days = parseInt(req.query.days as string) || 1095; // default 3 years
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const iso = cutoff.toISOString();
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const rows = await db.all('SELECT * FROM action_logs WHERE created_at < ?', iso);
    await db.close();
    res.json(rows);
  } catch (error) {
    console.error('Archive preview error:', error);
    res.status(500).json({ error: 'Failed to preview archive' });
  }
});

router.post('/sweep', async (req, res) => {
  const { days = 1095 } = req.body; // default 3 years
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const iso = cutoff.toISOString();
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(`CREATE TABLE IF NOT EXISTS archived_action_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action_type TEXT, description TEXT, timestamp TEXT)`);
    const rows = await db.all('SELECT * FROM action_logs WHERE created_at < ?', iso);
    for (const row of rows) {
      await db.run('INSERT INTO archived_action_logs (action_type, description, timestamp) VALUES (?,?,?)', [row.action_type, row.description, row.created_at]);

    }
    await db.run('DELETE FROM action_logs WHERE created_at < ?', iso);
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['ARCHIVE', `Archived ${rows.length} logs older than ${days} days`]);
    await db.close();
    res.json({ success: true, archived: rows.length });
  } catch (error) {
    console.error('Archive sweep error:', error);
    res.status(500).json({ error: 'Failed to sweep archive' });
  }
});
export default router;
