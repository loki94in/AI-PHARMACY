import express from 'express';
import { dbManager } from '../database/connection.js';

const router = express.Router();

// Helper to normalize numeric search terms (e.g., stripping trailing decimal zeros like "31.00" -> "31")
// to align with SQLite CAST(value AS TEXT) representations.
const normalizeNumericSearch = (val: string): string => {
  const cleaned = val.trim();
  if (!cleaned) return '';
  // If it's a decimal number, parse it to strip trailing zeros (e.g., 31.00 -> 31, 31.50 -> 31.5)
  if (/^\d+\.\d+$/.test(cleaned)) {
    return String(parseFloat(cleaned));
  }
  // If it ends with a dot, strip it (e.g., 31. -> 31)
  if (/^\d+\.$/.test(cleaned)) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
};

router.get('/medicines', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const search = (req.query.search as string) || '';
    const productName = (req.query.productName as string) || '';
    const mrpFilter = (req.query.mrpFilter as string) || '';
    const apiFilter = (req.query.apiFilter as string) || '';
    const packagingFilter = (req.query.packagingFilter as string) || '';
    const distributorFilter = (req.query.distributorFilter as string) || '';
    const categoryFilter = (req.query.category as string) || '';
    const offset = (page - 1) * limit;

    const db = await dbManager.getConnection();
    
    let query = `
      WITH latest_purchase AS (
        SELECT pi.medicine_id,
               pi.cost_price,
               pi.mrp,
               d.name AS last_distributor_name,
               ROW_NUMBER() OVER (PARTITION BY pi.medicine_id ORDER BY p.date DESC) AS rn
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        LEFT JOIN distributors d ON p.distributor_id = d.id
      )
      SELECT medicines.*,
             lp.cost_price AS last_purchase_rate,
             lp.mrp AS last_purchase_mrp,
             lp.last_distributor_name
      FROM medicines
      LEFT JOIN latest_purchase lp ON lp.medicine_id = medicines.id AND lp.rn = 1
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM medicines';
    const params: any[] = [];
    const letter = (req.query.letter as string) || '';
    
    let whereClauses = [];
    
    if (letter) {
      whereClauses.push('name LIKE ?');
      params.push(`${letter}%`);
    }
    
    if (search) {
      whereClauses.push('(name LIKE ? OR item_code LIKE ? OR manufacturer LIKE ? OR api_reference LIKE ?)');
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    if (productName) {
      whereClauses.push('name LIKE ?');
      params.push(`%${productName}%`);
    }

    if (apiFilter) {
      whereClauses.push('api_reference LIKE ?');
      params.push(`%${apiFilter}%`);
    }

    if (mrpFilter) {
      whereClauses.push('CAST(COALESCE(mrp, 0) AS TEXT) LIKE ?');
      params.push(`%${normalizeNumericSearch(mrpFilter)}%`);
    }

    if (packagingFilter) {
      whereClauses.push('(packaging LIKE ? OR strength LIKE ?)');
      const packParam = `%${packagingFilter}%`;
      params.push(packParam, packParam);
    }

    if (distributorFilter) {
      whereClauses.push(`id IN (
        SELECT DISTINCT pi.medicine_id 
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        JOIN distributors d ON p.distributor_id = d.id
        WHERE d.name LIKE ?
      )`);
      params.push(`%${distributorFilter}%`);
    }

    if (categoryFilter) {
      whereClauses.push('category LIKE ?');
      params.push(`%${categoryFilter}%`);
    }
    
    if (whereClauses.length > 0) {
      const whereString = ' WHERE ' + whereClauses.join(' AND ');
      query += whereString;
      countQuery += whereString;
    }
    
    const sort = (req.query.sort as string) || 'id_desc';
    
    if (sort === 'name_asc') {
      query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    } else {
      query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    }
    
    const countRow = await db.get(countQuery, ...params);
    const totalItems = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(totalItems / limit);
    
    const medicines = await db.all(query, ...[...params, limit, offset]);
    await dbManager.close();
    
    res.json({
      data: medicines,
      totalPages,
      currentPage: page,
      totalItems
    });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch medicines:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/medicines', async (req, res) => {
  const { name, generic_name, manufacturer, marketed_by, pack_unit, strength, cgst_per, sgst_per, hsn_code, category } = req.body;
  if (!name) return res.status(400).json({ error: 'Medicine name is required' });
  try {
    const { normalizeMedicineName } = await import('../utils/nameNormalizer.js');
    const adjustedName = normalizeMedicineName(name, manufacturer || '');
    const db = await dbManager.getConnection();
    const result = await db.run(
      `INSERT INTO medicines (name, generic_name, manufacturer, marketed_by, pack_unit, strength, cgst_per, sgst_per, hsn_code, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adjustedName, generic_name || '', manufacturer || '', marketed_by || '', pack_unit || '', strength || '', parseFloat(cgst_per) || 0, parseFloat(sgst_per) || 0, hsn_code || '', category || '']
    );
    const id = result.lastID;
    const savedMed = await db.get('SELECT * FROM medicines WHERE id = ?', [id]);
    await dbManager.close();
    res.json({ success: true, data: savedMed });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to create medicine:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/medicines/bulk-delete', async (req, res) => {
  const { ids, all, search, productName, mrpFilter, apiFilter, packagingFilter, distributorFilter, category } = req.body;
  try {
    const db = await dbManager.getConnection();
    let targetIds: number[] = [];

    if (all) {
      let query = 'SELECT id FROM medicines';
      const params: any[] = [];
      const whereClauses = [];

      if (search) {
        whereClauses.push('(name LIKE ? OR item_code LIKE ? OR manufacturer LIKE ? OR api_reference LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }
      if (productName) {
        whereClauses.push('name LIKE ?');
        params.push(`%${productName}%`);
      }
      if (apiFilter) {
        whereClauses.push('api_reference LIKE ?');
        params.push(`%${apiFilter}%`);
      }
      if (mrpFilter) {
        whereClauses.push('CAST(COALESCE(mrp, 0) AS TEXT) LIKE ?');
        params.push(`%${normalizeNumericSearch(mrpFilter)}%`);
      }
      if (packagingFilter) {
        whereClauses.push('(packaging LIKE ? OR strength LIKE ?)');
        const packParam = `%${packagingFilter}%`;
        params.push(packParam, packParam);
      }
      if (distributorFilter) {
        whereClauses.push(`id IN (
          SELECT DISTINCT pi.medicine_id 
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          JOIN distributors d ON p.distributor_id = d.id
          WHERE d.name LIKE ?
        )`);
        params.push(`%${distributorFilter}%`);
      }
      if (category) {
        whereClauses.push('category LIKE ?');
        params.push(`%${category}%`);
      }

      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
      }

      const rows = await db.all(query, ...params);
      targetIds = rows.map(r => r.id);
    } else {
      targetIds = ids || [];
    }

    if (targetIds.length === 0) {
      await dbManager.close();
      return res.json({ success: true, successCount: 0, failCount: 0, failedNames: [] });
    }

    let successCount = 0;
    let failCount = 0;
    const failedNames: string[] = [];

    for (const id of targetIds) {
      const med = await db.get('SELECT name FROM medicines WHERE id = ?', [id]);
      const name = med ? med.name : `ID ${id}`;

      const hasPurchases = await db.get('SELECT id FROM purchase_items WHERE medicine_id = ? LIMIT 1', [id]);
      const hasSales = await db.get('SELECT id FROM sale_items WHERE inventory_id IN (SELECT id FROM inventory_master WHERE medicine_id = ?) LIMIT 1', [id]);
      const hasReturns = await db.get('SELECT id FROM return_items WHERE medicine_id = ? LIMIT 1', [id]);
      const hasLedger = await db.get('SELECT id FROM stock_ledger WHERE medicine_id = ? LIMIT 1', [id]);

      if (hasPurchases || hasSales || hasReturns || hasLedger) {
        failCount++;
        failedNames.push(name);
        continue;
      }

      await db.run('DELETE FROM inventory_master WHERE medicine_id = ?', [id]);
      await db.run('DELETE FROM medicine_aliases WHERE medicine_id = ?', [id]);
      await db.run('DELETE FROM patient_refills WHERE medicine_id = ?', [id]);
      await db.run('DELETE FROM medicines WHERE id = ?', [id]);
      successCount++;
    }

    await dbManager.close();
    res.json({ success: true, successCount, failCount, failedNames });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to bulk delete medicines:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /medicines/:id — full medicine detail for the Medicine Detail page ───
router.get('/medicines/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();

    // Core medicine record
    const medicine = await db.get(`
      SELECT m.*, d.name AS primary_distributor_name, d.id AS primary_distributor_id,
             d.phone AS distributor_phone, d.email AS distributor_email
      FROM medicines m
      LEFT JOIN (
        SELECT pi.medicine_id, p.distributor_id,
               ROW_NUMBER() OVER (PARTITION BY pi.medicine_id ORDER BY p.date DESC) AS rn
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        WHERE p.distributor_id IS NOT NULL
      ) latest ON latest.medicine_id = m.id AND latest.rn = 1
      LEFT JOIN distributors d ON d.id = latest.distributor_id
      WHERE m.id = ?
    `, [id]);

    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });

    // All inventory batches
    const batches = await db.all(`
      SELECT id, batch_no, expiry_date, quantity, loose_quantity, mrp, cost_price, rack_location
      FROM inventory_master WHERE medicine_id = ? AND quantity > 0
      ORDER BY expiry_date ASC
    `, [id]);

    // Purchase history (last 20 purchases)
    const purchases = await db.all(`
      SELECT pi.id, pi.batch_no, pi.expiry_date, pi.quantity, pi.free_qty,
             pi.cost_price, pi.mrp, p.date, p.invoice_no,
             d.name AS distributor_name, d.id AS distributor_id
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      LEFT JOIN distributors d ON p.distributor_id = d.id
      WHERE pi.medicine_id = ?
      ORDER BY p.date DESC LIMIT 20
    `, [id]);

    // Sales history (last 20 sale items)
    const sales = await db.all(`
      SELECT si.id, si.quantity, si.unit_price, si.loose_qty,
             inv.invoice_no, inv.date, inv.patient_name
      FROM sale_items si
      JOIN sales_invoices inv ON si.invoice_id = inv.id
      JOIN inventory_master im ON si.inventory_id = im.id
      WHERE im.medicine_id = ?
      ORDER BY inv.date DESC LIMIT 20
    `, [id]);

    // Returned batches (purchase returns — expiry returns)
    const returned = await db.all(`
      SELECT ri.batch_no, ri.quantity, ri.expiry_date, r.date, r.return_no,
             d.name AS distributor_name
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      LEFT JOIN distributors d ON r.distributor_id = d.id
      WHERE ri.medicine_id = ? AND r.type = 'purchase'
      ORDER BY r.date DESC LIMIT 10
    `, [id]);

    // Consumption rate: avg units sold per month over last 3 months
    const consumptionRow = await db.get(`
      SELECT COALESCE(SUM(si.quantity), 0) AS total_sold
      FROM sale_items si
      JOIN inventory_master im ON si.inventory_id = im.id
      JOIN sales_invoices inv ON si.invoice_id = inv.id
      WHERE im.medicine_id = ?
        AND inv.date >= datetime('now', '-3 months')
    `, [id]);
    const totalSold3m = consumptionRow?.total_sold || 0;
    const avgMonthlyConsumption = Math.round(totalSold3m / 3);

    // Total stock
    const totalStock = batches.reduce((s: number, b: any) => s + (b.quantity || 0), 0);
    // Months of stock remaining
    const monthsRemaining = avgMonthlyConsumption > 0 ? (totalStock / avgMonthlyConsumption).toFixed(1) : null;

    // Reorder suggestion: reorder when stock < 2 months consumption
    const reorderPoint = avgMonthlyConsumption * 2;
    const suggestedOrderQty = avgMonthlyConsumption > 0
      ? Math.max(0, avgMonthlyConsumption * 3 - totalStock)
      : null;

    res.json({
      medicine,
      batches,
      purchases,
      sales,
      returned,
      analytics: {
        totalStock,
        avgMonthlyConsumption,
        monthsRemaining,
        reorderPoint,
        suggestedOrderQty,
      },
    });
  } catch (err) {
    console.error('Medicine detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/medicines/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    
    // Check references
    const hasPurchases = await db.get('SELECT id FROM purchase_items WHERE medicine_id = ? LIMIT 1', [id]);
    const hasSales = await db.get('SELECT id FROM sale_items WHERE inventory_id IN (SELECT id FROM inventory_master WHERE medicine_id = ?) LIMIT 1', [id]);
    const hasReturns = await db.get('SELECT id FROM return_items WHERE medicine_id = ? LIMIT 1', [id]);
    const hasLedger = await db.get('SELECT id FROM stock_ledger WHERE medicine_id = ? LIMIT 1', [id]);
    
    if (hasPurchases || hasSales || hasReturns || hasLedger) {
      await dbManager.close();
      return res.status(400).json({ 
        error: 'Cannot delete medicine. It has associated sales, purchases, or ledger transactions.' 
      });
    }
    
    // Delete safe references
    await db.run('DELETE FROM inventory_master WHERE medicine_id = ?', [id]);
    await db.run('DELETE FROM medicine_aliases WHERE medicine_id = ?', [id]);
    await db.run('DELETE FROM patient_refills WHERE medicine_id = ?', [id]);
    
    // Delete the medicine itself
    await db.run('DELETE FROM medicines WHERE id = ?', [id]);
    
    await dbManager.close();
    res.json({ success: true, message: 'Medicine deleted successfully' });
  } catch (err: any) {
    console.error('Delete medicine error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete medicine' });
  }
});

// ── GET /manufacturers — autocomplete distinct manufacturer names ──
router.get('/manufacturers', async (req, res) => {
  const q = (req.query.q as string || '').trim();
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(
      `SELECT DISTINCT manufacturer FROM medicines
       WHERE manufacturer IS NOT NULL AND manufacturer != ''
         AND LOWER(manufacturer) LIKE ?
       ORDER BY manufacturer ASC LIMIT 20`,
      [`%${q.toLowerCase()}%`]
    );
    await dbManager.close();
    res.json(rows.map((r: any) => r.manufacturer));
  } catch (err: any) {
    console.error('Manufacturers fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch manufacturers' });
  }
});

export default router;
