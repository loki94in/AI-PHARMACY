/**
 * /api/v1 — Public versioned API surface (Phase 15-D)
 *
 * All responses follow the envelope:
 *   { success: true, data: <payload>, pagination?: { page, limit, total, pages } }
 *   { success: false, error: "..." }
 *
 * Authentication: same x-api-key / x-session-token as the internal API.
 * Branch scoping: pass ?branch_id=N to filter to a specific branch.
 */

import { Router } from 'express';
import { dbManager } from '../../database/connection.js';

const router = Router();
const API_VERSION = '1.0.0';

// ─── GET /api/v1/health ───────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      apiVersion: API_VERSION,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

// ─── GET /api/v1/medicines ────────────────────────────────────────────────────
router.get('/medicines', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page  as string, 10) || 1);
    const limit    = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset   = (page - 1) * limit;
    const search   = (req.query.search   as string) || '';
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id as string, 10) : null;

    const db = await dbManager.getConnection();
    const where: string[] = [];
    const params: any[]   = [];

    if (search) {
      where.push('(name LIKE ? OR api_reference LIKE ? OR item_code LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (branchId !== null && !isNaN(branchId)) {
      where.push('branch_id = ?');
      params.push(branchId);
    }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = (await db.get(`SELECT COUNT(*) AS n FROM medicines${whereClause}`, params))?.n ?? 0;
    const rows  = await db.all(
      `SELECT id, name, api_reference, mrp, hsn_code, manufacturer, category, packaging, strength, item_code, generic_name, branch_id
       FROM medicines${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v1/patients ─────────────────────────────────────────────────────
router.get('/patients', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page  as string, 10) || 1);
    const limit    = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset   = (page - 1) * limit;
    const search   = (req.query.search   as string) || '';
    const branchId = req.query.branch_id ? parseInt(req.query.branch_id as string, 10) : null;

    const db = await dbManager.getConnection();
    const where: string[] = [];
    const params: any[]   = [];

    if (search) {
      where.push('(name LIKE ? OR phone LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (branchId !== null && !isNaN(branchId)) {
      where.push('branch_id = ?');
      params.push(branchId);
    }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = (await db.get(`SELECT COUNT(*) AS n FROM customers${whereClause}`, params))?.n ?? 0;
    const rows  = await db.all(
      `SELECT id, name, phone, address, age, gender, credit_enabled, credit_balance, branch_id
       FROM customers${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v1/sales ───────────────────────────────────────────────────────
router.get('/sales', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string, 10) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;
    const from   = (req.query.from as string) || '';
    const to     = (req.query.to   as string) || '';

    const db = await dbManager.getConnection();
    const where: string[] = [];
    const params: any[]   = [];

    if (from) { where.push('date >= ?'); params.push(from); }
    if (to)   { where.push('date <= ?'); params.push(to);   }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = (await db.get(`SELECT COUNT(*) AS n FROM sales_invoices${whereClause}`, params))?.n ?? 0;
    const rows  = await db.all(
      `SELECT id, invoice_no, date, customer_id, total_amount, payment_mode, status
       FROM sales_invoices${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v1/purchases ───────────────────────────────────────────────────
router.get('/purchases', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string, 10) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;
    const from   = (req.query.from as string) || '';
    const to     = (req.query.to   as string) || '';

    const db = await dbManager.getConnection();
    const where: string[] = [];
    const params: any[]   = [];

    if (from) { where.push('date >= ?'); params.push(from); }
    if (to)   { where.push('date <= ?'); params.push(to);   }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = (await db.get(`SELECT COUNT(*) AS n FROM purchases${whereClause}`, params))?.n ?? 0;
    const rows  = await db.all(
      `SELECT id, invoice_no, date, distributor_id, total_amount, payment_status
       FROM purchases${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
