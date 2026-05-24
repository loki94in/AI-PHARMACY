// Learning Engine API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Submit learning data (e.g., from POS) for future model improvements
router.post('/', async (req, res) => {
  const { payload } = req.body;
  if (!payload) return res.status(400).json({ error: 'payload required' });
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['LEARNING_DATA', JSON.stringify(payload).slice(0, 200)]
    );
    await db.close();
    res.json({ success: true, message: 'Learning data received' });
  } catch (error) {
    console.error('Learning endpoint error:', error);
    res.status(500).json({ error: 'Failed to store learning data' });
  }
});

export default router;
