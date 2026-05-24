import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Get inventory master
router.get('/', async (req, res) => {
  // TODO (Agent A): Fetch inventory joined with medicines
  res.json([]);
});

// Update stock (Stock Override)
router.post('/override', async (req, res) => {
  // TODO (Agent A): Implement stock override
  res.json({ success: true });
});

// Smart-Hover Peek (Price Comparison Logs)
router.get('/peek/:medicine_id', async (req, res) => {
  // TODO (Agent A): Return historical purchase costs for the medicine
  res.json([]);
});

export default router;
