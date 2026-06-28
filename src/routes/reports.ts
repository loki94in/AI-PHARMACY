import express from 'express';
import { dbManager } from '../database/connection.js';
import { exportToExcel, exportToPdf } from '../utils/reportExporter.js';
import { nonMovingReportService } from '../services/nonMovingReportService.js';

const router = express.Router();

// Fetch summary metrics for stats cards
router.get('/', async (req, res) => {
  const { fromDate, toDate } = req.query;
  const from = fromDate ? String(fromDate) : '1970-01-01';
  const to = toDate ? String(toDate) : '9999-12-31';

  try {
    const db = await dbManager.getConnection();
    
    // 1. Total sales revenue
    const salesRow = await db.get(
      'SELECT IFNULL(SUM(total_amount), 0) as total FROM sales_invoices WHERE date(date) BETWEEN date(?) AND date(?)',
      [from, to]
    );
    
    // 2. Total purchases amount
    const purchasesRow = await db.get(
      'SELECT IFNULL(SUM(total_amount), 0) as total FROM purchases WHERE date(date) BETWEEN date(?) AND date(?)',
      [from, to]
    );

    // 3. Profit Margin (using sum of sale items unit_price vs cost_price in inventory)
    const marginRow = await db.get(`
      SELECT IFNULL(SUM(si.quantity * si.unit_price), 0) as revenue,
             IFNULL(SUM(si.quantity * IFNULL(im.cost_price, 0)), 0) as cost
      FROM sale_items si
      JOIN sales_invoices sinv ON si.invoice_id = sinv.id
      JOIN inventory_master im ON si.inventory_id = im.id
      WHERE date(sinv.date) BETWEEN date(?) AND date(?)
    `, [from, to]);

    const revenue = marginRow.revenue || 0;
    const cost = marginRow.cost || 0;
    const profitMargin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0;

    // 4. Items sold count
    const itemsSoldRow = await db.get(`
      SELECT IFNULL(SUM(quantity), 0) as count
      FROM sale_items si
      JOIN sales_invoices sinv ON si.invoice_id = sinv.id
      WHERE date(sinv.date) BETWEEN date(?) AND date(?)
    `, [from, to]);

    res.json({
      totalSales: salesRow.total || 0,
      totalPurchases: purchasesRow.total || 0,
      profitMargin: profitMargin,
      itemsSold: itemsSoldRow.count || 0
    });
  } catch (err) {
    console.error('Reports summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch report raw data lists for the UI table
router.get('/data', async (req, res) => {
  const { type, fromDate, toDate } = req.query;
  const from = fromDate ? String(fromDate) : '1970-01-01';
  const to = toDate ? String(toDate) : '9999-12-31';

  try {
    const db = await dbManager.getConnection();
    let data: any[] = [];

    if (type === 'sales') {
      data = await db.all(
        'SELECT invoice_no, total_amount, date FROM sales_invoices WHERE date(date) BETWEEN date(?) AND date(?) ORDER BY date DESC LIMIT 100',
        [from, to]
      );
    } else if (type === 'purchases') {
      data = await db.all(
        'SELECT p.invoice_no, p.total_amount, d.name as distributor, p.date FROM purchases p LEFT JOIN distributors d ON p.distributor_id = d.id WHERE date(p.date) BETWEEN date(?) AND date(?) ORDER BY p.date DESC LIMIT 100',
        [from, to]
      );
    } else if (type === 'inventory') {
      data = await db.all(`
        SELECT m.name as medicine_name, im.quantity as stock, (im.quantity * im.cost_price) as value 
        FROM inventory_master im 
        JOIN medicines m ON im.medicine_id = m.id 
        ORDER BY stock DESC LIMIT 100
      `);
    } else if (type === 'expiry') {
      if (fromDate || toDate) {
        data = await db.all(`
          SELECT m.name as medicine_name, im.batch_no, im.expiry_date 
          FROM inventory_master im 
          JOIN medicines m ON im.medicine_id = m.id 
          WHERE date(im.expiry_date) BETWEEN date(?) AND date(?)
          ORDER BY im.expiry_date ASC LIMIT 100
        `, [from, to]);
      } else {
        data = await db.all(`
          SELECT m.name as medicine_name, im.batch_no, im.expiry_date 
          FROM inventory_master im 
          JOIN medicines m ON im.medicine_id = m.id 
          WHERE date(im.expiry_date) <= date('now', '+180 days') 
          ORDER BY im.expiry_date ASC LIMIT 100
        `);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('Reports data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PDF export endpoint
router.get('/export-pdf', async (req, res) => {
  const { type, fromDate, toDate } = req.query;
  const from = fromDate ? String(fromDate) : '1970-01-01';
  const to = toDate ? String(toDate) : '9999-12-31';

  try {
    const db = await dbManager.getConnection();
    let title = 'Pharmacy OS Report';
    let headers: string[] = [];
    let keys: string[] = [];
    let query = '';
    let params: any[] = [];
    let alignMap: Record<string, 'left' | 'center' | 'right'> = {};
    let colWidths: number[] = [];

    if (type === 'sales') {
      title = 'Sales History Report';
      headers = ['Invoice No', 'Date', 'Amount'];
      keys = ['invoice_no', 'date', 'total_amount'];
      query = 'SELECT invoice_no, date, total_amount FROM sales_invoices WHERE date(date) BETWEEN date(?) AND date(?) ORDER BY date DESC';
      params = [from, to];
      alignMap = { invoice_no: 'left', date: 'center', total_amount: 'right' };
      colWidths = [180, 180, 152];
    } else if (type === 'purchases') {
      title = 'Purchase History Report';
      headers = ['Invoice / Bill No', 'Distributor / Supplier', 'Date', 'Amount'];
      keys = ['invoice_no', 'distributor_name', 'date', 'total_amount'];
      query = 'SELECT p.invoice_no, d.name as distributor_name, p.date, p.total_amount FROM purchases p LEFT JOIN distributors d ON p.distributor_id = d.id WHERE date(p.date) BETWEEN date(?) AND date(?) ORDER BY p.date DESC';
      params = [from, to];
      alignMap = { invoice_no: 'left', distributor_name: 'left', date: 'center', total_amount: 'right' };
      colWidths = [120, 180, 112, 100];
    } else if (type === 'inventory') {
      title = 'Current Inventory Status Report';
      headers = ['Medicine Name', 'Batch No', 'Expiry Date', 'Stock Qty', 'Value'];
      keys = ['medicine_name', 'batch_no', 'expiry_date', 'quantity', 'value'];
      query = 'SELECT m.name as medicine_name, im.batch_no, im.expiry_date, im.quantity, (im.quantity * im.cost_price) as value FROM inventory_master im JOIN medicines m ON im.medicine_id = m.id ORDER BY medicine_name ASC';
      alignMap = { medicine_name: 'left', batch_no: 'left', expiry_date: 'center', quantity: 'right', value: 'right' };
      colWidths = [180, 80, 92, 80, 80];
    } else if (type === 'expiry') {
      if (fromDate || toDate) {
        title = `Expiry Warning Report (${from} to ${to})`;
        query = 'SELECT m.name as medicine_name, im.batch_no, im.expiry_date, im.quantity FROM inventory_master im JOIN medicines m ON im.medicine_id = m.id WHERE date(im.expiry_date) BETWEEN date(?) AND date(?) ORDER BY im.expiry_date ASC';
        params = [from, to];
      } else {
        title = 'Expiry Warning Report (Next 180 Days)';
        query = 'SELECT m.name as medicine_name, im.batch_no, im.expiry_date, im.quantity FROM inventory_master im JOIN medicines m ON im.medicine_id = m.id WHERE date(im.expiry_date) <= date(\'now\', \'+180 days\') ORDER BY im.expiry_date ASC';
        params = [];
      }
      headers = ['Medicine Name', 'Batch No', 'Expiry Date', 'Stock Qty'];
      keys = ['medicine_name', 'batch_no', 'expiry_date', 'quantity'];
      alignMap = { medicine_name: 'left', batch_no: 'left', expiry_date: 'center', quantity: 'right' };
      colWidths = [220, 100, 100, 92];
    } else if (type === 'top-medicines') {
      title = 'Top Medicines by Revenue';
      headers = ['Medicine', 'Revenue (₹)', 'Qty Sold'];
      keys = ['name', 'revenue', 'qty'];
      query = `SELECT m.name, ROUND(SUM(si.quantity * COALESCE(si.mrp,0)),2) as revenue, SUM(si.quantity) as qty
               FROM sale_items si JOIN sales_invoices inv ON si.invoice_id = inv.id
               JOIN inventory_master im ON si.inventory_id = im.id JOIN medicines m ON im.medicine_id = m.id
               WHERE date(inv.date) BETWEEN date(?) AND date(?)
               GROUP BY m.id ORDER BY revenue DESC LIMIT 20`;
      params = [from, to];
      alignMap = { name: 'left', revenue: 'right', qty: 'right' };
      colWidths = [280, 120, 112];
    } else if (type === 'top-customers') {
      title = 'Top Customers by Spend';
      headers = ['Customer', 'Total Spend (₹)', 'Visits'];
      keys = ['name', 'total', 'visits'];
      query = `SELECT c.name, ROUND(SUM(inv.total_amount),2) as total, COUNT(*) as visits
               FROM sales_invoices inv JOIN customers c ON inv.customer_id = c.id
               WHERE date(inv.date) BETWEEN date(?) AND date(?)
               GROUP BY c.id ORDER BY total DESC LIMIT 20`;
      params = [from, to];
      alignMap = { name: 'left', total: 'right', visits: 'right' };
      colWidths = [280, 120, 112];
    } else if (type === 'top-distributors') {
      title = 'Top Distributors by Purchase Spend';
      headers = ['Distributor', 'Total Spend (₹)', 'Invoices'];
      keys = ['name', 'total', 'invoice_count'];
      query = `SELECT d.name, ROUND(SUM(p.total_amount),2) as total, COUNT(*) as invoice_count
               FROM purchases p JOIN distributors d ON p.distributor_id = d.id
               WHERE date(p.date) BETWEEN date(?) AND date(?)
               GROUP BY d.id ORDER BY total DESC LIMIT 20`;
      params = [from, to];
      alignMap = { name: 'left', total: 'right', invoice_count: 'right' };
      colWidths = [280, 120, 112];
    } else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const rows = await db.all(query, params);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=report_${type}_${Date.now()}.pdf`);

    exportToPdf(res, title, headers, keys, rows, alignMap, colWidths);
  } catch (err: any) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

// Excel export endpoint
router.get('/export-excel', async (req, res) => {
  const { type, fromDate, toDate } = req.query;
  const from = fromDate ? String(fromDate) : '1970-01-01';
  const to = toDate ? String(toDate) : '9999-12-31';

  try {
    const db = await dbManager.getConnection();
    let title = 'Pharmacy OS Report';
    let headers: string[] = [];
    let keys: string[] = [];
    let query = '';
    let params: any[] = [];

    if (type === 'sales') {
      title = 'Sales History Report';
      headers = ['Invoice No', 'Date', 'Amount (Rs.)'];
      keys = ['invoice_no', 'date', 'total_amount'];
      query = 'SELECT invoice_no, date, total_amount FROM sales_invoices WHERE date(date) BETWEEN date(?) AND date(?) ORDER BY date DESC';
      params = [from, to];
    } else if (type === 'purchases') {
      title = 'Purchase History Report';
      headers = ['Invoice / Bill No', 'Distributor / Supplier', 'Date', 'Amount (Rs.)'];
      keys = ['invoice_no', 'distributor_name', 'date', 'total_amount'];
      query = 'SELECT p.invoice_no, d.name as distributor_name, p.date, p.total_amount FROM purchases p LEFT JOIN distributors d ON p.distributor_id = d.id WHERE date(p.date) BETWEEN date(?) AND date(?) ORDER BY p.date DESC';
      params = [from, to];
    } else if (type === 'inventory') {
      title = 'Current Inventory Status Report';
      headers = ['Medicine Name', 'Batch No', 'Expiry Date', 'Stock Qty', 'Value (Rs.)'];
      keys = ['medicine_name', 'batch_no', 'expiry_date', 'quantity', 'value'];
      query = 'SELECT m.name as medicine_name, im.batch_no, im.expiry_date, im.quantity, (im.quantity * im.cost_price) as value FROM inventory_master im JOIN medicines m ON im.medicine_id = m.id ORDER BY medicine_name ASC';
    } else if (type === 'expiry') {
      if (fromDate || toDate) {
        title = `Expiry Warning Report (${from} to ${to})`;
        query = 'SELECT m.name as medicine_name, im.batch_no, im.expiry_date, im.quantity FROM inventory_master im JOIN medicines m ON im.medicine_id = m.id WHERE date(im.expiry_date) BETWEEN date(?) AND date(?) ORDER BY im.expiry_date ASC';
        params = [from, to];
      } else {
        title = 'Expiry Warning Report (Next 180 Days)';
        query = 'SELECT m.name as medicine_name, im.batch_no, im.expiry_date, im.quantity FROM inventory_master im JOIN medicines m ON im.medicine_id = m.id WHERE date(im.expiry_date) <= date(\'now\', \'+180 days\') ORDER BY im.expiry_date ASC';
        params = [];
      }
      headers = ['Medicine Name', 'Batch No', 'Expiry Date', 'Stock Qty'];
      keys = ['medicine_name', 'batch_no', 'expiry_date', 'quantity'];
    } else if (type === 'top-medicines') {
      title = 'Top Medicines by Revenue';
      headers = ['Medicine', 'Revenue (Rs.)', 'Qty Sold'];
      keys = ['name', 'revenue', 'qty'];
      query = `SELECT m.name, ROUND(SUM(si.quantity * COALESCE(si.mrp,0)),2) as revenue, SUM(si.quantity) as qty
               FROM sale_items si JOIN sales_invoices inv ON si.invoice_id = inv.id
               JOIN inventory_master im ON si.inventory_id = im.id JOIN medicines m ON im.medicine_id = m.id
               WHERE date(inv.date) BETWEEN date(?) AND date(?)
               GROUP BY m.id ORDER BY revenue DESC LIMIT 20`;
      params = [from, to];
    } else if (type === 'top-customers') {
      title = 'Top Customers by Spend';
      headers = ['Customer', 'Total Spend (Rs.)', 'Visits'];
      keys = ['name', 'total', 'visits'];
      query = `SELECT c.name, ROUND(SUM(inv.total_amount),2) as total, COUNT(*) as visits
               FROM sales_invoices inv JOIN customers c ON inv.customer_id = c.id
               WHERE date(inv.date) BETWEEN date(?) AND date(?)
               GROUP BY c.id ORDER BY total DESC LIMIT 20`;
      params = [from, to];
    } else if (type === 'top-distributors') {
      title = 'Top Distributors by Purchase Spend';
      headers = ['Distributor', 'Total Spend (Rs.)', 'Invoices'];
      keys = ['name', 'total', 'invoice_count'];
      query = `SELECT d.name, ROUND(SUM(p.total_amount),2) as total, COUNT(*) as invoice_count
               FROM purchases p JOIN distributors d ON p.distributor_id = d.id
               WHERE date(p.date) BETWEEN date(?) AND date(?)
               GROUP BY d.id ORDER BY total DESC LIMIT 20`;
      params = [from, to];
    } else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const rows = await db.all(query, params);
    const excelBuffer = exportToExcel(title, headers, keys, rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report_${type}_${Date.now()}.xlsx`);
    res.send(excelBuffer);
  } catch (err: any) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: 'Failed to export Excel sheet' });
  }
});

// Analytics endpoint — chart-ready aggregates for all four domains
router.get('/analytics', async (req, res) => {
  const { type, fromDate, toDate } = req.query;
  const from = fromDate ? String(fromDate) : '1970-01-01';
  const to = toDate ? String(toDate) : '9999-12-31';

  try {
    const db = await dbManager.getConnection();

    if (type === 'sales') {
      const [trend, topMedicines, topCustomers, byPaymentStatus, totalRow] = await Promise.all([
        db.all(
          `SELECT date(date) as day, ROUND(SUM(total_amount),2) as amount, COUNT(*) as invoice_count
           FROM sales_invoices WHERE date(date) BETWEEN date(?) AND date(?) GROUP BY date(date) ORDER BY day ASC`,
          [from, to]
        ),
        db.all(
          `SELECT m.name, ROUND(SUM(si.quantity * COALESCE(si.mrp, 0)),2) as revenue, SUM(si.quantity) as qty
           FROM sale_items si
           JOIN sales_invoices inv ON si.invoice_id = inv.id
           JOIN inventory_master im ON si.inventory_id = im.id
           JOIN medicines m ON im.medicine_id = m.id
           WHERE date(inv.date) BETWEEN date(?) AND date(?)
           GROUP BY m.id ORDER BY revenue DESC LIMIT 5`,
          [from, to]
        ),
        db.all(
          `SELECT c.name, ROUND(SUM(inv.total_amount),2) as total, COUNT(*) as visits
           FROM sales_invoices inv
           JOIN customers c ON inv.customer_id = c.id
           WHERE date(inv.date) BETWEEN date(?) AND date(?)
           GROUP BY c.id ORDER BY total DESC LIMIT 5`,
          [from, to]
        ),
        db.all(
          `SELECT COALESCE(payment_status,'UNKNOWN') as status, COUNT(*) as count, ROUND(SUM(total_amount),2) as amount
           FROM sales_invoices WHERE date(date) BETWEEN date(?) AND date(?) GROUP BY payment_status`,
          [from, to]
        ),
        db.get(
          `SELECT COUNT(*) as cnt FROM sales_invoices WHERE date(date) BETWEEN date(?) AND date(?)`,
          [from, to]
        ),
      ]);
      return res.json({ trend, topMedicines, topCustomers, byPaymentStatus, totalInvoices: totalRow.cnt });
    }

    if (type === 'purchases') {
      const [trend, topDistributors, totalRow] = await Promise.all([
        db.all(
          `SELECT date(date) as day, ROUND(SUM(total_amount),2) as amount, COUNT(*) as invoice_count
           FROM purchases WHERE date(date) BETWEEN date(?) AND date(?) GROUP BY date(date) ORDER BY day ASC`,
          [from, to]
        ),
        db.all(
          `SELECT d.name, ROUND(SUM(p.total_amount),2) as total, COUNT(*) as invoice_count
           FROM purchases p JOIN distributors d ON p.distributor_id = d.id
           WHERE date(p.date) BETWEEN date(?) AND date(?)
           GROUP BY d.id ORDER BY total DESC LIMIT 5`,
          [from, to]
        ),
        db.get(
          `SELECT COUNT(*) as cnt FROM purchases WHERE date(date) BETWEEN date(?) AND date(?)`,
          [from, to]
        ),
      ]);
      return res.json({ trend, topDistributors, totalInvoices: totalRow.cnt });
    }

    if (type === 'inventory') {
      const [valueRow, lowRow, deadRow, expiryRow, topValueItems] = await Promise.all([
        db.get(`SELECT ROUND(IFNULL(SUM(quantity * cost_price),0),2) as total FROM inventory_master`),
        db.get(`SELECT COUNT(*) as cnt FROM inventory_master WHERE quantity > 0 AND quantity < 5`),
        db.get(
          `SELECT COUNT(DISTINCT im.id) as cnt FROM inventory_master im
           WHERE im.quantity > 0
           AND im.id NOT IN (
             SELECT DISTINCT si.inventory_id FROM sale_items si
             JOIN sales_invoices inv ON si.invoice_id = inv.id
             WHERE date(inv.date) >= date('now','-90 days')
           )`
        ),
        db.get(
          `SELECT
             SUM(CASE WHEN date(expiry_date) BETWEEN date('now') AND date('now','+30 days') THEN 1 ELSE 0 END) as in30,
             SUM(CASE WHEN date(expiry_date) BETWEEN date('now') AND date('now','+60 days') THEN 1 ELSE 0 END) as in60,
             SUM(CASE WHEN date(expiry_date) BETWEEN date('now') AND date('now','+90 days') THEN 1 ELSE 0 END) as in90
           FROM inventory_master WHERE quantity > 0`
        ),
        db.all(
          `SELECT m.name, im.quantity, ROUND(im.quantity * im.cost_price,2) as value
           FROM inventory_master im JOIN medicines m ON im.medicine_id = m.id
           WHERE im.quantity > 0 ORDER BY value DESC LIMIT 5`
        ),
      ]);
      return res.json({
        totalValue: valueRow.total,
        lowStockCount: lowRow.cnt,
        deadStockCount: deadRow.cnt,
        expiringIn30: expiryRow.in30 || 0,
        expiringIn60: expiryRow.in60 || 0,
        expiringIn90: expiryRow.in90 || 0,
        topValueItems,
      });
    }

    if (type === 'email') {
      const [totalRow, linkedRow, attachRow, topDistributors] = await Promise.all([
        db.get(`SELECT COUNT(*) as cnt FROM emails`),
        db.get(`SELECT COUNT(*) as cnt FROM emails WHERE linked_distributor_id IS NOT NULL`),
        db.get(`SELECT COUNT(*) as cnt FROM email_attachments`),
        db.all(
          `SELECT distributor_name as name, COUNT(*) as count
           FROM emails WHERE distributor_name IS NOT NULL AND distributor_name != ''
           GROUP BY distributor_name ORDER BY count DESC LIMIT 5`
        ),
      ]);
      return res.json({
        total: totalRow.cnt,
        linked: linkedRow.cnt,
        attachmentCount: attachRow.cnt,
        linkRate: totalRow.cnt > 0 ? Math.round((linkedRow.cnt / totalRow.cnt) * 100) : 0,
        topDistributors,
      });
    }

    return res.status(400).json({ error: 'Invalid type. Use: sales, purchases, inventory, email' });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Non-moving inventory report endpoint
router.get('/non-moving', async (req, res) => {
  try {
    const { days } = req.query;
    const periodDays = days ? parseInt(days as string) : 90;

    const report = await nonMovingReportService.generateNonMovingReport(periodDays);
    await nonMovingReportService.saveReportToFile(report);
    await nonMovingReportService.sendReportNotification(report);

    res.json({
      success: true,
      message: `Non-moving inventory report generated for last ${periodDays} days`,
      report: {
        generatedAt: report.generatedAt,
        periodDays: report.periodDays,
        totalNonMovingItems: report.totalNonMovingItems,
        totalValue: report.totalValue
      }
    });
  } catch (err: any) {
    console.error('Non-moving report error:', err);
    res.status(500).json({ error: 'Failed to generate non-moving report' });
  }
});

// Get non-moving items data (JSON)
router.get('/non-moving/data', async (req, res) => {
  try {
    const { days } = req.query;
    const periodDays = days ? parseInt(days as string) : 90;

    const items = await nonMovingReportService.getNonMovingItems(periodDays);

    res.json({
      success: true,
      periodDays: periodDays,
      count: items.length,
      items: items
    });
  } catch (err: any) {
    console.error('Non-moving data error:', err);
    res.status(500).json({ error: 'Failed to get non-moving inventory data' });
  }
});

// Product Trace audit endpoint (searches purchases & sales all-in-one)
router.get('/product-trace', async (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.json({ purchases: [], sales: [] });
  }

  try {
    const db = await dbManager.getConnection();
    const likeQuery = `%${query}%`;

    const purchases = await db.all(`
      SELECT pi.id, pi.batch_no, pi.expiry_date, pi.quantity, pi.cost_price, pi.mrp,
             p.invoice_no, p.date as transaction_date, d.name as distributor_name,
             m.name as medicine_name
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN distributors d ON p.distributor_id = d.id
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE m.name LIKE ? 
         OR pi.batch_no LIKE ? 
         OR p.invoice_no LIKE ? 
         OR d.name LIKE ?
      ORDER BY p.date DESC
      LIMIT 100
    `, [likeQuery, likeQuery, likeQuery, likeQuery]);

    const sales = await db.all(`
      SELECT si.id, COALESCE(si.batch_no, im.batch_no) as batch_no, im.expiry_date, si.quantity, si.unit_price, si.mrp,
             inv.invoice_no, inv.date as transaction_date, c.name as customer_name,
             m.name as medicine_name
      FROM sale_items si
      JOIN sales_invoices inv ON si.invoice_id = inv.id
      LEFT JOIN customers c ON inv.customer_id = c.id
      JOIN inventory_master im ON si.inventory_id = im.id
      JOIN medicines m ON im.medicine_id = m.id
      WHERE m.name LIKE ?
         OR COALESCE(si.batch_no, im.batch_no) LIKE ?
         OR inv.invoice_no LIKE ?
         OR c.name LIKE ?
      ORDER BY inv.date DESC
      LIMIT 100
    `, [likeQuery, likeQuery, likeQuery, likeQuery]);

    res.json({ purchases, sales });
  } catch (err: any) {
    console.error('Error tracing product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
