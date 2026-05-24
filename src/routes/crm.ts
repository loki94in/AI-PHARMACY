import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Get customers
router.get('/', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const customers = await db.all('SELECT * FROM customers ORDER BY name ASC');
    await db.close();
    res.json(customers);
  } catch (error) {
    console.error('Failed to fetch customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create customer
router.post('/', async (req, res) => {
  const { name, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'INSERT INTO customers (name, phone, address, notes) VALUES (?, ?, ?, ?)',
      [name, phone || '', address || '', notes || '']
    );
    await db.close();
    res.json({ success: true, message: 'Customer created successfully' });
  } catch (error) {
    console.error('Failed to create customer:', error);
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

export default router;
