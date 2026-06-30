import express from 'express';
import { dbManager } from '../database/connection.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Dashboard summary
router.get('/', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();

    const salesTodayRow = await db.get(`SELECT IFNULL(SUM(total_amount),0) as total FROM sales_invoices WHERE date(date) = date('now')`);
    const salesYesterdayRow = await db.get(`SELECT IFNULL(SUM(total_amount),0) as total FROM sales_invoices WHERE date(date) = date('now','-1 day')`);
    const lowStockCount = await db.get(`SELECT COUNT(*) as cnt FROM inventory_master WHERE quantity < 5`);
    const expiryCount = await db.get(`
      SELECT COUNT(*) as cnt FROM inventory_master im
      WHERE im.quantity > 0
        AND im.expiry_date IS NOT NULL
        AND im.expiry_date != ''
        AND NOT EXISTS (
          SELECT 1 FROM return_items ri JOIN returns r ON ri.return_id = r.id
          WHERE r.type='purchase' AND ri.medicine_id=im.medicine_id AND ri.batch_no=im.batch_no
        )
    `);
    const pendingOrdersCount = await db.get(`SELECT COUNT(*) as cnt FROM special_orders WHERE status IN ('Pending','Ordered')`);
    const pendingTasksCount = await db.get(`SELECT COUNT(*) as cnt FROM action_logs WHERE action_type = 'AUTOMATION_ALERT'`);
    const alerts = await db.all(`
      SELECT id, description, created_at FROM action_logs
      WHERE action_type = 'AUTOMATION_ALERT'
      ORDER BY created_at DESC LIMIT 10
    `);

    // Recent sales — last 8 invoices
    const recentSales = await db.all(`
      SELECT si.invoice_no, si.date, si.total_amount, si.payment_mode,
             p.name as patient_name
      FROM sales_invoices si
      LEFT JOIN patients p ON si.customer_id = p.id
      ORDER BY si.date DESC LIMIT 8
    `);

    // Recent purchases — last 5
    const recentPurchases = await db.all(`
      SELECT ph.invoice_no, ph.date, ph.total_amount, d.name as distributor_name
      FROM purchase_history ph
      LEFT JOIN distributors d ON ph.distributor_id = d.id
      ORDER BY ph.date DESC LIMIT 5
    `);

    const todaySales = salesTodayRow.total;
    const yesterdaySales = salesYesterdayRow.total;
    const salesChange = yesterdaySales > 0
      ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
      : null;

    res.json({
      todaySales,
      yesterdaySales,
      salesChange,
      lowStock: lowStockCount.cnt,
      expiryCount: expiryCount.cnt,
      pendingOrders: pendingOrdersCount.cnt,
      pendingTasks: pendingTasksCount.cnt,
      alerts,
      recentSales,
      recentPurchases,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dismiss/Clear automation alert
router.delete('/alerts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbManager.getConnection();
    await db.run('DELETE FROM action_logs WHERE id = ?', id);
        res.json({ success: true, message: 'Alert dismissed successfully' });
  } catch (err) {
    console.error('Dismiss alert error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
