// Dispatch & Support API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Create a dispatch request (e.g., support ticket)
router.post('/', async (req, res) => {
  const { type, description, contact } = req.body;
  if (!type || !description) {
    return res.status(400).json({ error: 'type and description required' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['DISPATCH', `${type}: ${description}`]
    );
    await db.close();
    // In a real system, this could trigger WhatsApp/Email notifications
    res.json({ success: true, message: 'Dispatch logged' });
  } catch (error) {
    console.error('Dispatch error:', error);
    res.status(500).json({ error: 'Failed to log dispatch' });
  }
});

// GET /api/dispatch/delivery-boys
router.get('/delivery-boys', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const boys = await db.all('SELECT * FROM delivery_boys ORDER BY name');
    await db.close();
    res.json(boys);
  } catch (error) {
    console.error('Fetch delivery boys error:', error);
    res.status(500).json({ error: 'Failed to fetch delivery boys' });
  }
});

// POST /api/dispatch/delivery-boys
router.post('/delivery-boys', async (req, res) => {
  const { name, whatsapp_number, telegram_chat_id, is_active } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const result = await db.run(
      'INSERT INTO delivery_boys (name, whatsapp_number, telegram_chat_id, is_active) VALUES (?, ?, ?, ?)',
      [name, whatsapp_number || null, telegram_chat_id || null, is_active !== undefined ? is_active : 1]
    );
    const newBoy = await db.get('SELECT * FROM delivery_boys WHERE id = ?', result.lastID);
    await db.close();
    res.status(201).json(newBoy);
  } catch (error) {
    console.error('Add delivery boy error:', error);
    res.status(500).json({ error: 'Failed to add delivery boy' });
  }
});

// PUT /api/dispatch/delivery-boys/:id
router.put('/delivery-boys/:id', async (req, res) => {
  const { id } = req.params;
  const { name, whatsapp_number, telegram_chat_id, is_active } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const existing = await db.get('SELECT * FROM delivery_boys WHERE id = ?', id);
    if (!existing) {
      await db.close();
      return res.status(404).json({ error: 'Delivery boy not found' });
    }
    await db.run(
      `UPDATE delivery_boys SET name = ?, whatsapp_number = ?, telegram_chat_id = ?, is_active = ? WHERE id = ?`,
      [
        name !== undefined ? name : existing.name,
        whatsapp_number !== undefined ? whatsapp_number : existing.whatsapp_number,
        telegram_chat_id !== undefined ? telegram_chat_id : existing.telegram_chat_id,
        is_active !== undefined ? is_active : existing.is_active,
        id
      ]
    );
    const updated = await db.get('SELECT * FROM delivery_boys WHERE id = ?', id);
    await db.close();
    res.json(updated);
  } catch (error) {
    console.error('Update delivery boy error:', error);
    res.status(500).json({ error: 'Failed to update delivery boy' });
  }
});

// DELETE /api/dispatch/delivery-boys/:id
router.delete('/delivery-boys/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const result = await db.run('DELETE FROM delivery_boys WHERE id = ?', id);
    await db.close();
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }
    res.json({ success: true, message: 'Delivery boy deleted' });
  } catch (error) {
    console.error('Delete delivery boy error:', error);
    res.status(500).json({ error: 'Failed to delete delivery boy' });
  }
});

export default router;
