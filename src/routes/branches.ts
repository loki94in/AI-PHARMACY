import express from 'express';
import { dbManager } from '../database/connection.js';

const router = express.Router();

/**
 * Idempotent schema bootstrap for multi-branch support.
 * Called once at server startup — safe to call repeatedly.
 */
export async function initBranchSchema(): Promise<void> {
  const db = await dbManager.getConnection();

  // Core branches table
  await db.run(`
    CREATE TABLE IF NOT EXISTS branches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      address     TEXT,
      phone       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Ensure default "Main Branch" (id=1) always exists
  await db.run(`
    INSERT OR IGNORE INTO branches (id, name, address, phone)
    VALUES (1, 'Main Branch', NULL, NULL)
  `);

  // Add branch_id to key tables only if the column doesn't yet exist.
  // SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS,
  // so we inspect PRAGMA table_info and skip tables that already have it.
  const tables = ['medicines', 'customers', 'sales_invoices', 'purchases'];
  for (const table of tables) {
    const cols = await db.all(`PRAGMA table_info(${table})`);
    const hasBranchId = cols.some((c: any) => c.name === 'branch_id');
    if (!hasBranchId) {
      try {
        await db.run(
          `ALTER TABLE ${table} ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1`
        );
      } catch {
        // Table may not exist in this deployment (e.g. sales_invoices renamed) — skip silently
      }
    }
  }
}

// ─── GET /api/branches ────────────────────────────────────────────────────────
router.get('/branches', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    const branches = await db.all(
      'SELECT id, name, address, phone, is_active, created_at FROM branches ORDER BY id ASC'
    );
    res.json({ success: true, branches });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/branches ───────────────────────────────────────────────────────
router.post('/branches', async (req, res) => {
  const { name, address, phone } = req.body ?? {};
  if (!name?.trim()) {
    return res.status(400).json({ success: false, error: 'Branch name is required' });
  }
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      'INSERT INTO branches (name, address, phone) VALUES (?, ?, ?)',
      [name.trim(), address?.trim() ?? null, phone?.trim() ?? null]
    );
    const branch = await db.get('SELECT * FROM branches WHERE id = ?', [result.lastID]);
    res.status(201).json({ success: true, branch });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'A branch with that name already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/branches/:id ──────────────────────────────────────────────────
router.patch('/branches/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ success: false, error: 'Invalid branch id' });

  const { name, address, phone, is_active } = req.body ?? {};
  try {
    const db = await dbManager.getConnection();
    const existing = await db.get('SELECT id FROM branches WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Branch not found' });

    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined)      { fields.push('name = ?');      params.push(name.trim()); }
    if (address !== undefined)   { fields.push('address = ?');   params.push(address?.trim() ?? null); }
    if (phone !== undefined)     { fields.push('phone = ?');     params.push(phone?.trim() ?? null); }
    if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);
    await db.run(`UPDATE branches SET ${fields.join(', ')} WHERE id = ?`, params);
    const updated = await db.get('SELECT * FROM branches WHERE id = ?', [id]);
    res.json({ success: true, branch: updated });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'A branch with that name already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
