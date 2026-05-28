import express from 'express';
import { dbManager } from '../../database/connection.js';
import { invoiceService } from '../../services/invoiceService.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';

const router = express.Router();

// Get next sequential invoice number
router.get('/next-invoice', asyncHandler(async (req: express.Request, res: express.Response) => {
  const invoice_no = await invoiceService.generateInvoiceNo(await dbManager.getConnection());
  res.json({ invoice_no });
}));

// Search medicine in inventory by Name, Batch, or MRP
router.get('/search-medicine', asyncHandler(async (req: express.Request, res: express.Response) => {
  const query = req.query.q as string;
  if (!query) {
    return res.json([]);
  }
  const db = await dbManager.getConnection();
  const sql = `
    SELECT im.id as inventory_id, im.medicine_id, m.name as medicine_name, 
           im.batch_no, im.expiry_date, im.quantity, im.mrp, im.unit_price, im.cost_price,
           m.cgst, m.sgst, m.igst, m.hsn_code
    FROM inventory_master im
    JOIN medicines m ON im.medicine_id = m.id
    WHERE m.name LIKE ? 
       OR im.batch_no LIKE ? 
       OR CAST(COALESCE(im.mrp, 0) AS TEXT) LIKE ?
    LIMIT 20
  `;
  const likeQuery = `%${query}%`;
  const rows = await db.all(sql, [likeQuery, likeQuery, likeQuery]);
  await dbManager.close();
  res.json(rows);
}));

// Create a new sale
router.post('/', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { items = [], patient_id, doctor_id, discount = 0, patient_name, patient_phone, patient_address, payment_medium } = req.body;

  // Basic validation
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart items required' });
  }

  // Delegate all business logic to service
  const result = await invoiceService.createInvoice({
    items,
    patientId: patient_id,
    doctorId: doctor_id,
    discount,
    patientName: patient_name,
    patientPhone: patient_phone,
    patientAddress: patient_address,
    paymentMedium: payment_medium
  });

  res.json({ success: true, invoice_no: result.invoiceNo, total: result.total, tax: result.tax });
}));

// Hold a bill
router.post('/hold', asyncHandler(async (req: express.Request, res: express.Response) => {
  if (!req.body) {
    return res.status(400).json({ error: 'Request body required' });
  }

  const db = await dbManager.getConnection();
  const holdData = JSON.stringify(req.body);

  const holdInvoiceNo = await invoiceService.generateInvoiceNo(db);
  await db.run('INSERT INTO held_bills (invoice_no, data) VALUES (?, ?)', [holdInvoiceNo, holdData]);

  await dbManager.close();
  res.json({ success: true, message: 'Bill held', invoice_no: holdInvoiceNo });
}));

// Get recommended quantity for a medicine based on sales history mode
router.get('/recommend-quantity', asyncHandler(async (req: express.Request, res: express.Response) => {
  const medicineName = req.query.medicineName as string;
  if (!medicineName) {
    return res.status(400).json({ error: 'medicineName query parameter required' });
  }

  const db = await dbManager.getConnection();
  // Look up matching medicine first
  const med = await db.get(
    'SELECT id, name FROM medicines WHERE name LIKE ? LIMIT 1',
    `%${medicineName}%`
  );

  if (!med) {
    await dbManager.close();
    return res.json({ recommendedQty: 1, type: 'strip', message: 'No matching history found' });
  }

  // Query historical sales quantities for this medicine
  const history = await db.all(
    `SELECT si.quantity, COUNT(*) as count
     FROM sale_items si
     JOIN inventory_master im ON si.inventory_id = im.id
     WHERE im.medicine_id = ?
     GROUP BY si.quantity
     ORDER BY count DESC
     LIMIT 3`,
    med.id
  );

  if (history.length > 0) {
    const mostFrequent = history[0];
    const qty = mostFrequent.quantity;
    let recommendedType = 'strip';
    let displayQty = qty;

    if (qty < 10) {
      recommendedType = 'loose';
      displayQty = qty;
    } else if (qty % 10 === 0) {
      recommendedType = 'strip';
      displayQty = qty / 10;
    } else {
      recommendedType = 'loose';
      displayQty = qty;
    }

    await dbManager.close();
    return res.json({
      recommendedQty: displayQty,
      type: recommendedType,
      actualUnits: qty,
      message: `Recommended: ${displayQty} ${recommendedType === 'strip' ? 'strip(s)' : 'loose unit(s)'} (based on ${mostFrequent.count} past order(s))`
    });
  }

  await dbManager.close();
  res.json({ recommendedQty: 1, type: 'strip', message: 'Default: 1 strip recommended' });
}));

// List all held bills
router.get('/hold', asyncHandler(async (req: express.Request, res: express.Response) => {
  const db = await dbManager.getConnection();
  const rows = await db.all('SELECT * FROM held_bills ORDER BY date DESC');
  await dbManager.close();
  res.json(rows);
}));

// Delete a held bill session (e.g. upon retrieve or checkout completion)
router.delete('/hold/:id', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const db = await dbManager.getConnection();
  await db.run('DELETE FROM held_bills WHERE id = ?', id);
  await dbManager.close();
  res.json({ success: true, message: 'Held bill removed' });
}));

export default router;