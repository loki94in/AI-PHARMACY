import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Compliance check placeholder – returns basic info
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Example: ensure no expired inventory items remain unsold
    const expiredCount = await db.get(`SELECT COUNT(*) as cnt FROM inventory_master WHERE date(expiry_date) < date('now')`);
    await db.close();
    res.json({ expiredItems: expiredCount.cnt, status: expiredCount.cnt === 0 ? 'compliant' : 'non-compliant' });
  } catch (err) {
    console.error('Compliance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/add', async (req, res) => {
  const { date, product, patient_id, doctor_id, license_no, qty, bill_no } = req.body;
  if (!date || !product) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT INTO action_logs (date, product, patient_id, doctor_id, license_no, qty, bill_no) VALUES (?,?,?,?,?,?,?)', [date, product, patient_id, doctor_id, license_no, qty, bill_no]);
    await db.close();
    res.json({ success: true, message: 'Compliance entry added' });
  } catch (err) {
    console.error('Add compliance entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New route for Schedule H1 dispensing events
router.post('/add-schedule-h1', async (req, res) => {
  const { drug_name, patient_name, doctor_name } = req.body;
  if (!drug_name || !patient_name || !doctor_name) {
    return res.status(400).json({ error: 'Missing required fields: drug_name, patient_name, doctor_name' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Insert a record indicating a Schedule H1 dispensing event occurred
    // We'll map the fields to the action_logs table: drug_name -> product, patient_name -> patient_id, doctor_name -> doctor_id
    // For license_no, qty, bill_no we'll use placeholder values to indicate Schedule H1 dispensing
    await db.run(
      'INSERT INTO action_logs (date, product, patient_id, doctor_id, license_no, qty, bill_no) VALUES (DATE("now"), ?, ?, ?, "SCH-H1", 1, "SCH-H1-DISP")',
      [drug_name, patient_name, doctor_name]
    );
    await db.close();
    res.json({ success: true, message: 'Schedule H1 dispensing event logged' });
  } catch (err) {
    console.error('Add Schedule H1 compliance entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
