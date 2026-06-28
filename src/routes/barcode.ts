import express from 'express';
import { dbManager } from '../database/connection.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { q, medicine_id } = req.query;
  try {
    const db = await dbManager.getConnection();
    let rows;
    if (medicine_id) {
      rows = await db.all(
        `SELECT bm.*, m.name AS medicine_name
         FROM barcode_master bm
         LEFT JOIN medicines m ON bm.medicine_id = m.id
         WHERE bm.medicine_id = ?
         ORDER BY bm.created_at DESC`,
        [medicine_id]
      );
    } else if (q) {
      rows = await db.all(
        `SELECT bm.*, m.name AS medicine_name
         FROM barcode_master bm
         LEFT JOIN medicines m ON bm.medicine_id = m.id
         WHERE bm.barcode LIKE ? OR m.name LIKE ?
         ORDER BY bm.created_at DESC`,
        [`%${q}%`, `%${q}%`]
      );
    } else {
      rows = await db.all(
        `SELECT bm.*, m.name AS medicine_name
         FROM barcode_master bm
         LEFT JOIN medicines m ON bm.medicine_id = m.id
         ORDER BY bm.created_at DESC
         LIMIT 200`
      );
    }
    await dbManager.close();
    res.json(rows);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch barcodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/lookup/:barcode', async (req, res) => {
  const { barcode } = req.params;
  try {
    const db = await dbManager.getConnection();
    const row = await db.get(
      `SELECT bm.*, m.name AS medicine_name, m.mrp, m.pack_unit, m.strength
       FROM barcode_master bm
       LEFT JOIN medicines m ON bm.medicine_id = m.id
       WHERE bm.barcode = ?`,
      [barcode]
    );
    await dbManager.close();
    if (!row) return res.status(404).json({ error: 'Barcode not found' });
    res.json(row);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to lookup barcode:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { barcode, medicine_id, batch_no, expiry_date, notes } = req.body;
  if (!barcode?.trim()) return res.status(400).json({ error: 'barcode is required' });
  if (!medicine_id) return res.status(400).json({ error: 'medicine_id is required' });
  try {
    const db = await dbManager.getConnection();
    const medicine = await db.get('SELECT id FROM medicines WHERE id = ?', [medicine_id]);
    if (!medicine) {
      await dbManager.close();
      return res.status(400).json({ error: 'Medicine not found' });
    }
    const result = await db.run(
      'INSERT INTO barcode_master (barcode, medicine_id, batch_no, expiry_date, notes) VALUES (?, ?, ?, ?, ?)',
      [barcode.trim(), medicine_id, batch_no || '', expiry_date || null, notes || '']
    );
    const saved = await db.get(
      `SELECT bm.*, m.name AS medicine_name FROM barcode_master bm
       LEFT JOIN medicines m ON bm.medicine_id = m.id WHERE bm.id = ?`,
      [result.lastID]
    );
    await dbManager.close();
    res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    await dbManager.close();
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'This barcode is already registered' });
    }
    console.error('Failed to create barcode entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { barcode, medicine_id, batch_no, expiry_date, notes } = req.body;
  if (!barcode?.trim()) return res.status(400).json({ error: 'barcode is required' });
  if (!medicine_id) return res.status(400).json({ error: 'medicine_id is required' });
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      'UPDATE barcode_master SET barcode=?, medicine_id=?, batch_no=?, expiry_date=?, notes=? WHERE id=?',
      [barcode.trim(), medicine_id, batch_no || '', expiry_date || null, notes || '', id]
    );
    if (result.changes === 0) {
      await dbManager.close();
      return res.status(404).json({ error: 'Barcode entry not found' });
    }
    const updated = await db.get(
      `SELECT bm.*, m.name AS medicine_name FROM barcode_master bm
       LEFT JOIN medicines m ON bm.medicine_id = m.id WHERE bm.id = ?`,
      [id]
    );
    await dbManager.close();
    res.json({ success: true, data: updated });
  } catch (error: any) {
    await dbManager.close();
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'This barcode is already registered' });
    }
    console.error('Failed to update barcode entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    const result = await db.run('DELETE FROM barcode_master WHERE id = ?', [id]);
    await dbManager.close();
    if (result.changes === 0) return res.status(404).json({ error: 'Barcode entry not found' });
    res.json({ success: true });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to delete barcode entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
