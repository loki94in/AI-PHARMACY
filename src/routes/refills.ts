import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkAllRefills } from '../services/refillService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Register a manual patient refill request
router.post('/', async (req, res) => {
  const { patient_name, patient_phone, medicine_id, refill_interval_days = 30 } = req.body;
  if (!patient_name || !patient_phone || !medicine_id) {
    return res.status(400).json({ error: 'patient_name, patient_phone, and medicine_id are required' });
  }

  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Calculate next refill date
    const intervalDays = parseInt(refill_interval_days, 10);
    const nextRefillDate = new Date();
    nextRefillDate.setDate(nextRefillDate.getDate() + intervalDays);
    const nextRefillStr = nextRefillDate.toISOString().slice(0, 19).replace('T', ' ');

    await db.run(
      `INSERT INTO patient_refills (patient_name, patient_phone, medicine_id, refill_interval_days, next_refill_date, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [patient_name, patient_phone, medicine_id, intervalDays, nextRefillStr]
    );

    // Run a check immediately in case the medicine is already in stock!
    await checkAllRefills(db);

    await db.close();
    res.json({ success: true, message: 'Refill registered successfully' });
  } catch (err) {
    if (db) await db.close();
    console.error('Failed to register refill:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all refill schedules
router.get('/', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const refills = await db.all(
      `SELECT pr.*, m.name as medicine_name FROM patient_refills pr
       JOIN medicines m ON pr.medicine_id = m.id
       ORDER BY pr.next_refill_date ASC`
    );
    await db.close();
    res.json(refills);
  } catch (err) {
    if (db) await db.close();
    console.error('Failed to fetch refills:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Trigger a manual run of checkAllRefills
router.post('/check', async (req, res) => {
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await checkAllRefills(db);
    await db.close();
    res.json({ success: true, message: 'Refill check complete' });
  } catch (err) {
    if (db) await db.close();
    console.error('Failed to check refills:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
