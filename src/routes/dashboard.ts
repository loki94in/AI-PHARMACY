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

    const [
      salesTodayRow,
      lowStockCount,
      pendingTasksCount,
      alerts,
      mtdSalesRow,
      mtdPurchasesRow,
      grossProfitTodayRow,
      expiryRow,
      creditRow,
      stockValueRow,
      topMedicinesToday,
    ] = await Promise.all([
      db.get(`SELECT IFNULL(SUM(total_amount),0) as total FROM sales_invoices WHERE date(date) = date('now')`),
      db.get(`SELECT COUNT(*) as cnt FROM inventory_master WHERE quantity < 5 AND quantity > 0`),
      db.get(`SELECT COUNT(*) as cnt FROM action_logs WHERE action_type = 'AUTOMATION_ALERT'`),
      db.all(`SELECT id, description, created_at FROM action_logs WHERE action_type = 'AUTOMATION_ALERT' ORDER BY created_at DESC LIMIT 10`),
      db.get(`SELECT ROUND(IFNULL(SUM(total_amount),0),2) as total FROM sales_invoices WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`),
      db.get(`SELECT ROUND(IFNULL(SUM(total_amount),0),2) as total FROM purchases WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`),
      db.get(`SELECT ROUND(IFNULL(SUM(si.quantity * (COALESCE(si.mrp,0) - COALESCE(im.cost_price,0))),0),2) as profit
              FROM sale_items si
              JOIN sales_invoices inv ON si.invoice_id = inv.id
              JOIN inventory_master im ON si.inventory_id = im.id
              WHERE date(inv.date) = date('now')`),
      db.get(`SELECT
                SUM(CASE WHEN date(expiry_date) BETWEEN date('now') AND date('now','+30 days') THEN 1 ELSE 0 END) as in30,
                SUM(CASE WHEN date(expiry_date) BETWEEN date('now') AND date('now','+60 days') THEN 1 ELSE 0 END) as in60,
                SUM(CASE WHEN date(expiry_date) BETWEEN date('now') AND date('now','+90 days') THEN 1 ELSE 0 END) as in90
              FROM inventory_master WHERE quantity > 0`),
      db.get(`SELECT ROUND(IFNULL(SUM(credit_balance),0),2) as total FROM customers WHERE credit_enabled = 1 AND credit_balance > 0`),
      db.get(`SELECT ROUND(IFNULL(SUM(quantity * cost_price),0),2) as total FROM inventory_master`),
      db.all(`SELECT m.name, ROUND(SUM(si.quantity * COALESCE(si.mrp,0)),2) as revenue
              FROM sale_items si
              JOIN sales_invoices inv ON si.invoice_id = inv.id
              JOIN inventory_master im ON si.inventory_id = im.id
              JOIN medicines m ON im.medicine_id = m.id
              WHERE date(inv.date) = date('now')
              GROUP BY m.id ORDER BY revenue DESC LIMIT 3`),
    ]);

    res.json({
      todaySales: salesTodayRow.total,
      lowStock: lowStockCount.cnt,
      pendingTasks: pendingTasksCount.cnt,
      alerts,
      mtdSales: mtdSalesRow.total,
      mtdPurchases: mtdPurchasesRow.total,
      grossProfitToday: grossProfitTodayRow.profit,
      expiringIn30: expiryRow?.in30 || 0,
      expiringIn60: expiryRow?.in60 || 0,
      expiringIn90: expiryRow?.in90 || 0,
      outstandingCredit: creditRow.total,
      totalStockValue: stockValueRow.total,
      topMedicinesToday,
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
