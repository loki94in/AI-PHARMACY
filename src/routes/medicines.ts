import express from 'express';
import { dbManager } from '../database/connection.js';

const router = express.Router();

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
      SELECT medicines.*, 
        (SELECT pi.cost_price 
         FROM purchase_items pi 
         JOIN purchases p ON pi.purchase_id = p.id 
         WHERE pi.medicine_id = medicines.id 
         ORDER BY p.date DESC LIMIT 1) as last_purchase_rate,
        (SELECT pi.mrp 
         FROM purchase_items pi 
         JOIN purchases p ON pi.purchase_id = p.id 
         WHERE pi.medicine_id = medicines.id 
         ORDER BY p.date DESC LIMIT 1) as last_purchase_mrp,
        (SELECT d.name 
         FROM purchase_items pi 
         JOIN purchases p ON pi.purchase_id = p.id 
         JOIN distributors d ON p.distributor_id = d.id 
         WHERE pi.medicine_id = medicines.id 
         ORDER BY p.date DESC LIMIT 1) as last_distributor_name
      FROM medicines
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
      params.push(`%${mrpFilter}%`);
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
        params.push(`%${mrpFilter}%`);
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
  } catch (error) {
    await dbManager.close();
    console.error('Failed to delete medicine:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dynamic Online Search using OpenFDA API fallback
router.get('/online-search', async (req, res) => {
  const query = (req.query.q as string || '').trim();
  if (!query || query.length < 2) {
    return res.json([]);
  }
  try {
    const { checkConnectivity } = await import('../utils/networkDetector.js');
    const isOnline = await checkConnectivity();
    if (!isOnline) {
      return res.json([]);
    }
    const { OpenFdaClient } = await import('../services/apiClients/openFdaClient.js');
    const client = new OpenFdaClient();
    const result = await client.queryMedicine(query);
    if (!result) {
      return res.json([]);
    }
    res.json([{
      name: result.medicineName,
      api_reference: result.activeIngredients?.join(' + ') || '',
      manufacturer: result.manufacturer || ''
    }]);
  } catch (error) {
    console.error('Online search endpoint failed:', error);
    res.status(500).json({ error: 'Internal server error during online search' });
  }
});

// Auto-enrich composition by saving to database
router.post('/auto-enrich', async (req, res) => {
  const { name, api_reference, manufacturer } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Medicine name is required' });
  }
  try {
    const { normalizeMedicineName } = await import('../utils/nameNormalizer.js');
    const db = await dbManager.getConnection();
    const cleanName = name.trim();
    const cleanApi = (api_reference || '').trim();
    const cleanMfr = (manufacturer || '').trim();
    const adjustedName = normalizeMedicineName(cleanName, cleanMfr);

    let existing = await db.get('SELECT * FROM medicines WHERE LOWER(name) = LOWER(?)', [cleanName]);
    if (existing) {
      await db.run(
        "UPDATE medicines SET name = ?, api_reference = COALESCE(NULLIF(api_reference, ''), ?), manufacturer = COALESCE(NULLIF(manufacturer, ''), ?) WHERE id = ?",
        [adjustedName, cleanApi, cleanMfr, existing.id]
      );
      const updated = await db.get('SELECT * FROM medicines WHERE id = ?', [existing.id]);
      await dbManager.close();
      return res.json({ success: true, data: updated, isNew: false });
    } else {
      const result = await db.run(
        "INSERT INTO medicines (name, api_reference, manufacturer) VALUES (?, ?, ?)",
        [adjustedName, cleanApi || null, cleanMfr || null]
      );
      const newMed = await db.get('SELECT * FROM medicines WHERE id = ?', [result.lastID]);
      await dbManager.close();
      return res.json({ success: true, data: newMed, isNew: true });
    }
  } catch (error) {
    await dbManager.close();
    console.error('Auto enrichment save failed:', error);
    res.status(500).json({ error: 'Internal server error saving enrichment' });
  }
});

export default router;

