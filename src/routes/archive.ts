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

// Purge old records older than given days (simple implementation)
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
    // Basic safety: only allow known tables
    const allowed = ['action_logs', 'settings', 'customers'];
    if (!allowed.includes(table)) {
      return res.status(400).json({ error: 'Table not allowed for purge' });
    }
    await db.run(`DELETE FROM ${table} WHERE created_at < ?`, iso);
    await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['PURGE', `Purged ${table} older than ${days} days`]);
    await db.close();
    res.json({ success: true, message: `Purged old records from ${table}` });
  } catch (error) {
    console.error('Archive purge error:', error);
    res.status(500).json({ error: 'Failed to purge records' });
  }
});

export default router;
