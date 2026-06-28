import express from 'express';
import { dbManager } from '../database/connection.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all('SELECT * FROM units_master ORDER BY name ASC');
    await dbManager.close();
    res.json(rows);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch units:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { name, abbreviation, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Unit name is required' });
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      'INSERT INTO units_master (name, abbreviation, description) VALUES (?, ?, ?)',
      [name.trim(), abbreviation || '', description || '']
    );
    const saved = await db.get('SELECT * FROM units_master WHERE id = ?', [result.lastID]);
    await dbManager.close();
    res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    await dbManager.close();
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A unit with this name already exists' });
    }
    console.error('Failed to create unit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, abbreviation, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Unit name is required' });
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      'UPDATE units_master SET name=?, abbreviation=?, description=? WHERE id=?',
      [name.trim(), abbreviation || '', description || '', id]
    );
    if (result.changes === 0) {
      await dbManager.close();
      return res.status(404).json({ error: 'Unit not found' });
    }
    const updated = await db.get('SELECT * FROM units_master WHERE id = ?', [id]);
    await dbManager.close();
    res.json({ success: true, data: updated });
  } catch (error: any) {
    await dbManager.close();
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A unit with this name already exists' });
    }
    console.error('Failed to update unit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    const result = await db.run('DELETE FROM units_master WHERE id = ?', [id]);
    await dbManager.close();
    if (result.changes === 0) return res.status(404).json({ error: 'Unit not found' });
    res.json({ success: true });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to delete unit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
