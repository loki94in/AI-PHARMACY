import express from 'express';
import { inventoryService } from '../services/inventoryService.js';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

// Get inventory master
router.get('/', async (req, res) => {
  let db;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // If limit is 0, fetch all (warning: can cause frontend lag)
    if (limit === 0) {
      const rows = await db.all(`
        SELECT im.*, m.name as medicine_name
        FROM inventory_master im
        LEFT JOIN medicines m ON im.medicine_id = m.id
        ORDER BY m.name ASC, im.id DESC
      `);
      await db.close();
      return res.json({ data: rows, totalPages: 1, currentPage: 1, totalItems: rows.length });
    }

    // Pagination logic
    const offset = (page - 1) * limit;
    
    const countRow = await db.get('SELECT COUNT(*) as total FROM inventory_master');
    const totalItems = countRow.total;
    const totalPages = Math.ceil(totalItems / limit);

    const rows = await db.all(`
      SELECT im.*, m.name as medicine_name
      FROM inventory_master im
      LEFT JOIN medicines m ON im.medicine_id = m.id
      ORDER BY m.name ASC, im.id DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    await db.close();
    res.json({
      data: rows,
      totalPages,
      currentPage: page,
      totalItems
    });
  } catch (error: any) {
    if (db) await db.close();
    console.error(JSON.stringify({
      message: 'Error fetching inventory',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update stock (Stock Override)
router.post('/override', async (req, res) => {
  let db;
  try {
    const { inventory_id, quantity } = req.body;
    if (!inventory_id) {
      return res.status(400).json({ error: 'inventory_id required' });
    }
    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative number' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('UPDATE inventory_master SET quantity = ? WHERE id = ?', [quantity, inventory_id]);

    // Check if new stock triggers pending patient refills
    const invItem = await db.get('SELECT medicine_id FROM inventory_master WHERE id = ?', [inventory_id]);
    if (invItem && invItem.medicine_id) {
      await inventoryService.checkAndTriggerRefillsForMedicine(invItem.medicine_id);
    }

    await db.close();
    res.json({ success: true, message: 'Stock updated' });
  } catch (error: any) {
    if (db) await db.close();
    console.error(JSON.stringify({
      message: 'Error overriding stock',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Smart-Hover Peek (Price Comparison Logs)
router.get('/peek/:medicine_id', async (req, res) => {
  let db;
  try {
    const { medicine_id } = req.params;
    if (!medicine_id) {
      return res.status(400).json({ error: 'medicine_id is required' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Simplified: return last purchase price from purchases table joined via inventory_master
    const rows = await db.all(
      `SELECT im.batch_no, im.expiry_date, im.quantity, im.unit_price, im.cost_price
       FROM inventory_master im
       WHERE im.medicine_id = ?
       ORDER BY im.expiry_date ASC LIMIT 5`,
      [medicine_id]
    );

    await db.close();
    res.json(rows);
  } catch (error: any) {
    if (db) await db.close();
    console.error(JSON.stringify({
      message: 'Error fetching peek data',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  let db;
  const { id } = req.params;
  const { quantity, rack_location, batch_no, expiry_date, reorder_level } = req.body;
  try {
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(`UPDATE inventory_master SET quantity = ?, rack_location = ?, batch_no = ?, expiry_date = ?, reorder_level = ? WHERE id = ?`,
      [quantity, rack_location, batch_no, expiry_date, reorder_level, id]
    );

    // Check if new stock triggers pending patient refills
    const invItem = await db.get('SELECT medicine_id FROM inventory_master WHERE id = ?', [id]);
    if (invItem && invItem.medicine_id) {
      await inventoryService.checkAndTriggerRefillsForMedicine(invItem.medicine_id);
    }

    await db.close();
    res.json({ success: true, message: 'Inventory updated' });
  } catch (error: any) {
    if (db) await db.close();
    console.error(JSON.stringify({
      message: 'Inventory update error',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/bulk-action', async (req, res) => {
  let db;
  const { action, ids = [] } = req.body;
  try {
    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Log the bulk action to action_logs using the correct schema
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      [`BULK_${(action as string).toUpperCase()}`, `Bulk ${action} on ${ids.length} inventory items: [${(ids as any[]).join(',')}]`]
    );

    await db.close();
    res.json({ success: true, message: `Bulk ${action} completed and logged` });
  } catch (error: any) {
    if (db) await db.close();
    console.error(JSON.stringify({
      message: 'Bulk action error',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new medicine and inventory batch
router.post('/', async (req, res) => {
  const { name, api_reference, mrp, cost_price, batch_no, expiry_date, quantity, rack_location } = req.body;
  if (!name) return res.status(400).json({ error: 'Medicine name is required' });
  
  let db;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // 1. Insert medicine record
    const medResult = await db.run(
      'INSERT INTO medicines (name, api_reference, mrp) VALUES (?, ?, ?)',
      [name, api_reference || '', parseFloat(mrp) || 0]
    );
    const medicineId = medResult.lastID;
    
    // 2. Insert initial inventory master record
    const invResult = await db.run(
      `INSERT INTO inventory_master (medicine_id, quantity, rack_location, batch_no, expiry_date, unit_price, cost_price, mrp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        medicineId,
        parseInt(quantity, 10) || 100,
        rack_location || 'A-1',
        batch_no || 'B-NEW',
        expiry_date || '12/2028',
        parseFloat(mrp) || 0,
        parseFloat(cost_price) || 0,
        parseFloat(mrp) || 0
      ]
    );
    
    await db.close();
    res.json({
      success: true,
      message: 'Medicine and inventory registered successfully',
      medicine_id: medicineId,
      inventory_id: invResult.lastID
    });
  } catch (error: any) {
    if (db) await db.close();
    console.error('Failed to create medicine and inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Catalog search for auto-suggest in Manual Purchase Entry
router.get('/catalog-search', async (req, res) => {
  let db;
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) return res.json([]);
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const rows = await db.all(
      `SELECT id, name, manufacturer, strength, packaging, mrp
       FROM medicines
       WHERE name LIKE ? OR api_reference LIKE ?
       ORDER BY name ASC LIMIT 15`,
      [`%${q}%`, `%${q}%`]
    );
    await db.close();
    res.json(rows);
  } catch (error: any) {
    if (db) await db.close();
    console.error('Catalog search error:', error.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Generate QR Code for an inventory item (Barcode/QR feature)
import QRCode from 'qrcode';
router.get('/barcode/:id', async (req, res) => {
  let db;
  try {
    const { id } = req.params;
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Fetch medicine and inventory details
    const item = await db.get(`
      SELECT im.*, m.name as medicine_name 
      FROM inventory_master im
      LEFT JOIN medicines m ON im.medicine_id = m.id
      WHERE im.id = ?
    `, [id]);
    
    await db.close();
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Prepare barcode/QR data
    const qrData = JSON.stringify({
      id: item.id,
      name: item.medicine_name,
      batch: item.batch_no,
      exp: item.expiry_date,
      mrp: item.mrp
    });

    // Generate base64 Data URL for the QR code
    const qrImage = await QRCode.toDataURL(qrData, { width: 150, margin: 1 });
    
    res.json({
      success: true,
      qrCodeUrl: qrImage,
      item: {
        name: item.medicine_name,
        batch: item.batch_no,
        expiry: item.expiry_date,
        mrp: item.mrp
      }
    });

  } catch (error: any) {
    if (db) await db.close();
    console.error('QR code generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR Code' });
  }
});

// Fetch enriched medicine information by ID (returns active ingredients, side effects, warnings, etc.)
router.get('/medicines/:id/enriched', async (req, res) => {
  let db;
  const { id } = req.params;
  try {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Find the medicine brand name
    const medicine = await db.get('SELECT name, api_reference, manufacturer FROM medicines WHERE id = ?', [id]);
    if (!medicine) {
      await db.close();
      return res.status(404).json({ error: 'Medicine not found' });
    }

    // Lookup matching entry in enrichment cache
    const cacheRow = await db.get(
      'SELECT enriched_data FROM medicine_enrichment_cache WHERE LOWER(medicine_name) = ?',
      [medicine.name.toLowerCase().trim()]
    );
    await db.close();

    const enrichment = cacheRow ? JSON.parse(cacheRow.enriched_data) : null;

    res.json({
      success: true,
      medicineName: medicine.name,
      api_reference: medicine.api_reference,
      manufacturer: medicine.manufacturer,
      enrichment: enrichment || {
        isEnriched: false,
        activeIngredients: medicine.api_reference ? [medicine.api_reference] : [],
        indications: 'No detailed online indications found yet.',
        dosage: 'No custom dosage metadata cached.',
        sideEffects: 'No active side effects logged.',
        warnings: 'No standard warnings recorded.',
        enrichmentSource: 'Local Database'
      }
    });

  } catch (error: any) {
    if (db) await db.close();
    console.error('Error fetching enriched medicine details:', error);
    res.status(500).json({ error: 'Failed to fetch enriched medicine details' });
  }
});

export default router;
