import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Get next sequential invoice number
router.get('/next-invoice', async (req, res) => {
  // TODO (Agent A): Implement prefix logic (S-YYYY-XXXX)
  res.json({ invoice_no: 'S-2026-0001' });
});

// Create a new sale
router.post('/', async (req, res) => {
  // TODO (Agent A): Implement cart processing, stock reduction, tax math
  res.json({ success: true, message: 'Sale created' });
});

// Hold a bill
router.post('/hold', async (req, res) => {
  // TODO (Agent A): Implement hold bill functionality
  res.json({ success: true, message: 'Bill held' });
});

export default router;
