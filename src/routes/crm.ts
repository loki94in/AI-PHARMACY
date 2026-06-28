import express from 'express';
import { dbManager } from '../database/connection.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendDailyDoctorReports } from '../services/doctorReportingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Get patients
router.get('/patients', async (req, res) => {
  const { q, limit } = req.query;
  try {
    const db = await dbManager.getConnection();
    let query = 'SELECT * FROM customers';
    const params = [];
    
    if (q) {
      query += ' WHERE name LIKE ? OR phone LIKE ?';
      params.push(`%${q}%`, `%${q}%`);
    }
    
    query += ' ORDER BY id DESC';
    
    if (limit) {
      const limitVal = parseInt(limit as string, 10);
      if (!isNaN(limitVal)) {
        query += ' LIMIT ?';
        params.push(limitVal);
      }
    }
    
    const patients = await db.all(query, params);
    res.json(patients);
  } catch (error) {
    console.error('Failed to fetch patients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single patient
router.get('/patients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    const patient = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
    if (!patient) {
      await dbManager.close();
      return res.status(404).json({ error: 'Patient not found' });
    }
    const stats = await db.get(
      `SELECT COUNT(*) AS total_visits,
              COALESCE(SUM(total_amount), 0) AS total_spent,
              MAX(date) AS last_visit_date
       FROM sales_invoices WHERE customer_id = ?`,
      [id]
    );
    await dbManager.close();
    res.json({ ...patient, stats });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch patient:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create patient
router.post('/patients', async (req, res) => {
  const { name, phone, address, notes, age, gender, credit_enabled, credit_balance } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      `INSERT INTO customers (name, phone, address, notes, age, gender, credit_enabled, credit_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, phone || '', address || '', notes || '',
       age || '', gender || '', credit_enabled ? 1 : 0, parseFloat(credit_balance) || 0]
    );
    const newPatient = await db.get('SELECT * FROM customers WHERE id = ?', result.lastID);
    await dbManager.close();
    res.status(201).json(newPatient);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to create patient:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient
router.put('/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, address, notes, age, gender, credit_enabled, credit_balance } = req.body;
  try {
    const db = await dbManager.getConnection();
    await db.run(
      `UPDATE customers
       SET name=?, phone=?, address=?, notes=?, age=?, gender=?, credit_enabled=?, credit_balance=?
       WHERE id=?`,
      [name, phone || '', address || '', notes || '',
       age || '', gender || '', credit_enabled ? 1 : 0,
       parseFloat(credit_balance) || 0, id]
    );
    const updated = await db.get('SELECT * FROM customers WHERE id = ?', id);
    await dbManager.close();
    res.json(updated);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to update patient:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete patient
router.delete('/patients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    await db.run('DELETE FROM customers WHERE id = ?', id);
        res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete patient:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get customers (legacy alias)
router.get('/', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const customers = await db.all('SELECT * FROM customers ORDER BY id DESC');
        res.json(customers);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get customer history
router.get('/:id/history', async (req, res) => {
  const customerId = req.params.id;
  try {
    const db = await dbManager.getConnection();
    // Agent 1 manages sales_invoices, we can safely read it here
    const history = await db.all(
      'SELECT * FROM sales_invoices WHERE customer_id = ? ORDER BY date DESC',
      [customerId]
    );
        res.json(history);
  } catch (error) {
    console.error('Failed to fetch history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get doctors list
router.get('/doctors', async (req, res) => {
  const { q } = req.query;
  try {
    const db = await dbManager.getConnection();
    let doctors;
    if (q) {
      doctors = await db.all(
        `SELECT * FROM doctors WHERE name LIKE ? OR speciality LIKE ? OR hospital LIKE ? ORDER BY name ASC`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
    } else {
      doctors = await db.all('SELECT * FROM doctors ORDER BY name ASC');
    }
    await dbManager.close();
    res.json(doctors);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch doctors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single doctor
router.get('/doctors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    const doctor = await db.get('SELECT * FROM doctors WHERE id = ?', [id]);
    if (!doctor) {
      await dbManager.close();
      return res.status(404).json({ error: 'Doctor not found' });
    }
    const stats = await db.get(
      `SELECT COUNT(DISTINCT si.id) AS total_prescriptions,
              COUNT(DISTINCT si.customer_id) AS unique_patients,
              MAX(si.date) AS last_prescription_date
       FROM sales_invoices si WHERE si.doctor_id = ?`,
      [id]
    );
    await dbManager.close();
    res.json({ ...doctor, stats });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a doctor
router.post('/doctors', async (req, res) => {
  const { name, speciality, phone, hospital, degree, reg_no, send_daily_summary } = req.body;
  if (!name) return res.status(400).json({ error: 'Doctor name is required' });
  try {
    const db = await dbManager.getConnection();
    await db.run(
      `INSERT INTO doctors (name, speciality, phone, hospital, degree, reg_no, send_daily_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, speciality || '', phone || '', hospital || '', degree || '', reg_no || '', send_daily_summary ? 1 : 0]
    );
    res.json({ success: true, message: 'Doctor added successfully' });
  } catch (error) {
    console.error('Failed to add doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a doctor
router.put('/doctors/:id', async (req, res) => {
  const { id } = req.params;
  const { name, speciality, phone, hospital, degree, reg_no, send_daily_summary } = req.body;
  if (!name) return res.status(400).json({ error: 'Doctor name is required' });
  try {
    const db = await dbManager.getConnection();
    await db.run(
      `UPDATE doctors 
       SET name = ?, speciality = ?, phone = ?, hospital = ?, degree = ?, reg_no = ?, send_daily_summary = ?
       WHERE id = ?`,
      [name, speciality || '', phone || '', hospital || '', degree || '', reg_no || '', send_daily_summary ? 1 : 0, id]
    );
    const updated = await db.get('SELECT * FROM doctors WHERE id = ?', id);
    res.json({ success: true, doctor: updated });
  } catch (error) {
    console.error('Failed to update doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a doctor
router.delete('/doctors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    await db.run('DELETE FROM doctors WHERE id = ?', id);
    res.json({ success: true, message: 'Doctor deleted successfully' });
  } catch (error) {
    console.error('Failed to delete doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Trigger daily doctor WhatsApp reports manually for testing
router.post('/doctors/send-daily-reports', async (req, res) => {
  const { date } = req.body; // e.g. "2026-06-22", optional
  try {
    const result = await sendDailyDoctorReports(date);
    res.json(result);
  } catch (error: any) {
    console.error('Failed to manually trigger doctor reports:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get suggestions for a doctor
router.get('/doctors/:id/suggestions', async (req, res) => {
  const doctorId = req.params.id;
  try {
    const db = await dbManager.getConnection();
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
    const db = await dbManager.getConnection();
    await db.run(
      'UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ?',
      [amount, customer_id]
    );
        res.json({ success: true, message: `Paid ₹${amount} successfully` });
  } catch (error) {
    console.error('Failed to pay ledger:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
