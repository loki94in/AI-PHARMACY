import express from 'express';
import { dbManager } from '../database/connection.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all('SELECT * FROM tax_config ORDER BY rate ASC');
    await dbManager.close();
    res.json(rows);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch tax config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    const row = await db.get('SELECT * FROM tax_config WHERE id = ?', [id]);
    await dbManager.close();
    if (!row) return res.status(404).json({ error: 'Tax config not found' });
    res.json(row);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch tax config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { name, rate, cgst_per, sgst_per, igst_per, description } = req.body;
  if (!name?.trim() || rate === undefined) {
    return res.status(400).json({ error: 'name and rate are required' });
  }
  const parsedRate = parseFloat(rate);
  if (isNaN(parsedRate)) return res.status(400).json({ error: 'rate must be a number' });
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      `INSERT INTO tax_config (name, rate, cgst_per, sgst_per, igst_per, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), parsedRate,
       parseFloat(cgst_per) || parsedRate / 2,
       parseFloat(sgst_per) || parsedRate / 2,
       parseFloat(igst_per) || parsedRate,
       description || '']
    );
    const saved = await db.get('SELECT * FROM tax_config WHERE id = ?', [result.lastID]);
    await dbManager.close();
    res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    await dbManager.close();
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A tax slab with this name already exists' });
    }
    console.error('Failed to create tax config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, rate, cgst_per, sgst_per, igst_per, description } = req.body;
  if (!name?.trim() || rate === undefined) {
    return res.status(400).json({ error: 'name and rate are required' });
  }
  const parsedRate = parseFloat(rate);
  if (isNaN(parsedRate)) return res.status(400).json({ error: 'rate must be a number' });
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      `UPDATE tax_config SET name=?, rate=?, cgst_per=?, sgst_per=?, igst_per=?, description=? WHERE id=?`,
      [name.trim(), parsedRate,
       parseFloat(cgst_per) || parsedRate / 2,
       parseFloat(sgst_per) || parsedRate / 2,
       parseFloat(igst_per) || parsedRate,
       description || '', id]
    );
    if (result.changes === 0) {
      await dbManager.close();
      return res.status(404).json({ error: 'Tax config not found' });
    }
    const updated = await db.get('SELECT * FROM tax_config WHERE id = ?', [id]);
    await dbManager.close();
    res.json({ success: true, data: updated });
  } catch (error: any) {
    await dbManager.close();
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A tax slab with this name already exists' });
    }
    console.error('Failed to update tax config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    const result = await db.run('DELETE FROM tax_config WHERE id = ?', [id]);
    await dbManager.close();
    if (result.changes === 0) return res.status(404).json({ error: 'Tax config not found' });
    res.json({ success: true });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to delete tax config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
