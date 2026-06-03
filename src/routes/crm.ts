import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Get patients
router.get('/patients', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const patients = await db.all('SELECT * FROM customers ORDER BY id DESC');
    await db.close();
    res.json(patients);
  } catch (error) {
    console.error('Failed to fetch patients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create patient
router.post('/patients', async (req, res) => {
  const { name, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const result = await db.run(
      'INSERT INTO customers (name, phone, address, notes) VALUES (?, ?, ?, ?)',
      [name, phone || '', address || '', notes || '']
    );
    const newPatient = await db.get('SELECT * FROM customers WHERE id = ?', result.lastID);
    await db.close();
    res.status(201).json(newPatient);
  } catch (error) {
    console.error('Failed to create patient:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient
router.put('/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, address, notes } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'UPDATE customers SET name=?, phone=?, address=?, notes=? WHERE id=?',
      [name, phone || '', address || '', notes || '', id]
    );
    const updated = await db.get('SELECT * FROM customers WHERE id = ?', id);
    await db.close();
    res.json(updated);
  } catch (error) {
    console.error('Failed to update patient:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete patient
router.delete('/patients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('DELETE FROM customers WHERE id = ?', id);
    await db.close();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete patient:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get customers (legacy alias)
router.get('/', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const customers = await db.all('SELECT * FROM customers ORDER BY id DESC');
    await db.close();
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get customer history
router.get('/:id/history', async (req, res) => {
  const customerId = req.params.id;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Agent 1 manages sales_invoices, we can safely read it here
    const history = await db.all(
      'SELECT * FROM sales_invoices WHERE customer_id = ? ORDER BY date DESC',
      [customerId]
    );
    await db.close();
    res.json(history);
  } catch (error) {
    console.error('Failed to fetch history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get doctors list
router.get('/doctors', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const doctors = await db.all('SELECT * FROM doctors ORDER BY name ASC');
    await db.close();
    res.json(doctors);
  } catch (error) {
    console.error('Failed to fetch doctors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a doctor
router.post('/doctors', async (req, res) => {
  const { name, speciality, phone, hospital, degree, reg_no } = req.body;
  if (!name) return res.status(400).json({ error: 'Doctor name is required' });
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      `INSERT INTO doctors (name, speciality, phone, hospital, degree, reg_no)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, speciality || '', phone || '', hospital || '', degree || '', reg_no || '']
    );
    await db.close();
    res.json({ success: true, message: 'Doctor added successfully' });
  } catch (error) {
    console.error('Failed to add doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get suggestions for a doctor
router.get('/doctors/:id/suggestions', async (req, res) => {
  const doctorId = req.params.id;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Fetch top 10 most frequently prescribed medicines by this doctor
    const suggestions = await db.all(
      `SELECT m.id as medicine_id, m.name as medicine_name, m.mrp, COUNT(*) as frequency
       FROM sale_items si
       JOIN sales_invoices s ON si.invoice_id = s.id
       JOIN inventory_master im ON si.inventory_id = im.id
       JOIN medicines m ON im.medicine_id = m.id
       WHERE s.doctor_id = ?
       GROUP BY m.id
       ORDER BY frequency DESC
       LIMIT 10`,
      [doctorId]
    );
    await db.close();
    res.json(suggestions);
  } catch (error) {
    console.error('Failed to fetch doctor suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pay ledger balance
router.post('/ledger/pay', async (req, res) => {
  const { customer_id, amount } = req.body;
  if (!customer_id || !amount) {
    return res.status(400).json({ error: 'Customer ID and amount are required' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ?',
      [amount, customer_id]
    );
    await db.close();
    res.json({ success: true, message: `Paid ₹${amount} successfully` });
  } catch (error) {
    console.error('Failed to pay ledger:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
