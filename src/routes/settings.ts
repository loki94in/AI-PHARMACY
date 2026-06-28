// Settings API (Agent 2)
import express from 'express';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dbManager } from '../database/connection.js';
import { telegramBotService } from '../telegramBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');

const router = express.Router();

// Get all settings
router.get('/', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
    const rows = await db.all('SELECT * FROM app_settings');
    const settingsObj: Record<string, string> = {};
    rows.forEach(r => {
      settingsObj[r.key] = r.value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('All settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get a setting value
router.get('/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const db = await dbManager.getConnection();
    const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
    if (!row) return res.status(404).json({ error: 'Setting not found' });
    res.json({ key, value: row.value });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update or create a setting
router.post('/', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const db = await dbManager.getConnection();
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value ?? '']);
    res.json({ success: true, message: 'Setting saved' });
  } catch (error) {
    console.error('Settings save error:', error);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// Generic settings save (upsert multiple keys)
router.post('/save', async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload required' });
  try {
    const db = await dbManager.getConnection();
    await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
    const entries = Object.entries(payload);
    for (const [k, v] of entries) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [k, v ?? '']);
    }

    const keys = Object.keys(payload);

    // If telegram settings changed, trigger hot-reload of Telegram bot service
    const hasTelegramKey = keys.some(k => k === 'telegram_enabled' || k === 'telegram_token' || k === 'telegram_chat_id');
    if (hasTelegramKey) {
      telegramBotService.initializeOrReloadBot().catch(err => {
        console.error('[Telegram] Failed to reload bot after settings update:', err);
      });
    }

    // If WhatsApp settings changed, hot-reload WhatsApp connection state via worker
    const hasWhatsappKey = keys.some(k => k === 'whatsapp_enabled' || k === 'whatsapp_preferred_system' || k === 'wa_business_enabled');
    if (hasWhatsappKey) {
      (async () => {
        try {
          const { shouldRouteToBusiness } = await import('../whatsappClient.js');
          const { whatsappWorkerBridge } = await import('../services/whatsappWorkerBridge.js');
          const enabled = payload['whatsapp_enabled'] === 'true';
          const useBusiness = await shouldRouteToBusiness();

          if (useBusiness || !enabled) {
            console.log('[Settings] WhatsApp Business API preferred or WhatsApp Web disabled. Shutting down automated client...');
            whatsappWorkerBridge.sendCommand('WA_DESTROY');
          } else {
            console.log('[Settings] Automated WhatsApp Web enabled. Re-initializing client via worker...');
            whatsappWorkerBridge.sendCommand('WA_INIT');
          }
        } catch (err) {
          console.error('[Settings] Failed to hot-reload WhatsApp config:', err);
        }
      })();
    }

    // If ignored emails changed, clean them up from the database immediately
    if (payload['ignored_emails'] !== undefined) {
      (async () => {
        try {
          const { emailService } = await import('../services/emailService.js');
          await emailService.cleanupIgnoredEmailsInDb();
        } catch (err) {
          console.error('[Settings] Failed to cleanup ignored emails after save:', err);
        }
      })();
    }

    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    console.error('Bulk settings save error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Upload custom stamp (base64 transparent PNG)
router.post('/upload-stamp', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Image data required' });

    // Clean base64 header
    const base64Data = image.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const stampPath = path.join(UPLOADS_DIR, 'custom_stamp.png');
    fs.writeFileSync(stampPath, buffer);

    const db = await dbManager.getConnection();
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('use_custom_stamp', 'true')");

    res.json({ success: true, message: 'Custom stamp uploaded and enabled' });
  } catch (err: any) {
    console.error('Upload stamp error:', err);
    res.status(500).json({ error: 'Failed to upload stamp' });
  }
});

// Upload custom signature (base64 transparent PNG)
router.post('/upload-signature', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Image data required' });

    // Clean base64 header
    const base64Data = image.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const sigPath = path.join(UPLOADS_DIR, 'custom_signature.png');
    fs.writeFileSync(sigPath, buffer);

    const db = await dbManager.getConnection();
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('use_custom_signature', 'true')");

    res.json({ success: true, message: 'Custom signature uploaded and enabled' });
  } catch (err: any) {
    console.error('Upload signature error:', err);
    res.status(500).json({ error: 'Failed to upload signature' });
  }
});

// ── Phase 8.6: Company Master ───────────────────────────────────────────────
const COMPANY_FIELDS = [
  'medical_name', 'owner_name', 'address', 'city', 'state', 'pincode',
  'phone', 'mobile', 'email', 'gstin', 'drug_license_no', 'drug_license_no2',
  'fssai_no', 'pan_no', 'bank_name', 'bank_account_no', 'bank_ifsc',
  'bank_branch', 'website', 'state_code',
];

router.get('/company', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
    const placeholders = COMPANY_FIELDS.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT key, value FROM app_settings WHERE key IN (${placeholders})`,
      COMPANY_FIELDS
    );
    await dbManager.close();
    const company: Record<string, string> = {};
    rows.forEach(r => { company[r.key] = r.value; });
    res.json(company);
  } catch (error) {
    await dbManager.close();
    console.error('Company fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

router.post('/company', async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'payload required' });
  }
  const allowed = Object.fromEntries(
    Object.entries(payload).filter(([k]) => COMPANY_FIELDS.includes(k))
  );
  if (Object.keys(allowed).length === 0) {
    return res.status(400).json({ error: 'No valid company fields provided' });
  }
  try {
    const db = await dbManager.getConnection();
    await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
    for (const [k, v] of Object.entries(allowed)) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [k, v ?? '']);
    }
    await dbManager.close();
    res.json({ success: true, message: 'Company details saved' });
  } catch (error) {
    await dbManager.close();
    console.error('Company save error:', error);
    res.status(500).json({ error: 'Failed to save company details' });
  }
});

// Create a new distributor
router.post('/distributors', async (req, res) => {
  const { name, phone, email, address, state_code } = req.body;
  if (!name) return res.status(400).json({ error: 'Distributor name is required' });
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(
      `INSERT INTO distributors (name, phone, email, address, state_code) VALUES (?, ?, ?, ?, ?)`,
      [name, phone || '', email || '', address || '', state_code || '']
    );
    const id = result.lastID;
    const saved = await db.get('SELECT * FROM distributors WHERE id = ?', [id]);
    res.json({ success: true, data: saved });
  } catch (error: any) {
    console.error('Failed to create distributor:', error);
    if (error && error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A distributor with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create distributor: ' + error.message });
  }
});
// Update a distributor
router.put('/distributors/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, address, state_code, gstin, dl_no, city } = req.body;
  if (!name) return res.status(400).json({ error: 'Distributor name is required' });
  try {
    const db = await dbManager.getConnection();
    await db.run(
      `UPDATE distributors
       SET name = ?, phone = ?, email = ?, address = ?, state_code = ?,
           gstin = ?, dl_no = ?, city = ?
       WHERE id = ?`,
      [name, phone || '', email || '', address || '', state_code || '',
       gstin || '', dl_no || '', city || '', id]
    );
    const updated = await db.get('SELECT * FROM distributors WHERE id = ?', [id]);
    if (!updated) return res.status(404).json({ error: 'Distributor not found' });
    await dbManager.close();
    res.json({ success: true, data: updated });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to update distributor:', error);
    res.status(500).json({ error: 'Failed to update distributor' });
  }
});

// ── Phase 12: System Administration ──────────────────────────────────────────

const SECRET_KEYS = new Set([
  'gmail_pass', 'admin_password', 'wa_business_access_token',
  'pr_password', 'google_client_secret', 'admin_unique_key',
]);

// Audit log viewer — paginated action_logs with optional filters
router.get('/audit-logs', async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
  const offset = (page - 1) * limit;
  const type = req.query.type ? String(req.query.type) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const q = req.query.q ? `%${String(req.query.q)}%` : null;

  const conditions: string[] = [];
  const params: any[] = [];
  if (type) { conditions.push('action_type = ?'); params.push(type); }
  if (from)  { conditions.push('date(created_at) >= date(?)'); params.push(from); }
  if (to)    { conditions.push('date(created_at) <= date(?)'); params.push(to); }
  if (q)     { conditions.push('(description LIKE ? OR action_type LIKE ?)'); params.push(q, q); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const db = await dbManager.getConnection();
    const [totalRow, rows, types] = await Promise.all([
      db.get(`SELECT COUNT(*) as cnt FROM action_logs ${where}`, params),
      db.all(`SELECT id, action_type, description, created_at FROM action_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      db.all(`SELECT DISTINCT action_type FROM action_logs ORDER BY action_type`),
    ]);
    const total = totalRow.cnt;
    res.json({ rows, total, page, pages: Math.ceil(total / limit), types: types.map((r: any) => r.action_type) });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// System status — uptime, memory, DB file size, app version
router.get('/system-status', async (_req, res) => {
  try {
    const mem = process.memoryUsage();
    let dbSizeBytes = 0;
    try { dbSizeBytes = fs.statSync(DB_PATH).size; } catch { /* db not yet created */ }

    let appVersion = '0.1.0';
    try {
      const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
      appVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version || appVersion;
    } catch { /* ignore */ }

    const db = await dbManager.getConnection();
    const workerRow = await db.get(`SELECT COUNT(*) as cnt FROM action_logs WHERE action_type LIKE 'WORKER_%' AND created_at >= datetime('now', '-5 minutes')`);

    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      memoryHeapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      dbSizeBytes,
      dbSizeMb: Math.round(dbSizeBytes / 1024 / 1024 * 10) / 10,
      appVersion,
      recentWorkerEvents: workerRow.cnt,
      nodeVersion: process.version,
      platform: process.platform,
    });
  } catch (err) {
    console.error('System status error:', err);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

// DB VACUUM — reclaims disk space, safe for WAL mode
router.post('/db/vacuum', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    const before = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
    await db.run('PRAGMA wal_checkpoint(FULL)');
    await db.run('VACUUM');
    const after = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
    await db.run(`INSERT INTO action_logs (action_type, description) VALUES ('DB_VACUUM', ?)`,
      [`Database vacuumed. Size: ${Math.round(before/1024)}KB → ${Math.round(after/1024)}KB`]);
    res.json({ success: true, freedBytes: before - after, beforeBytes: before, afterBytes: after });
  } catch (err: any) {
    console.error('VACUUM error:', err);
    res.status(500).json({ error: 'VACUUM failed: ' + err.message });
  }
});

// DB ANALYZE — rebuilds query planner statistics
router.post('/db/analyze', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    await db.run('PRAGMA optimize');
    await db.run('ANALYZE');
    await db.run(`INSERT INTO action_logs (action_type, description) VALUES ('DB_ANALYZE', 'Database analyzed and query stats rebuilt')`);
    res.json({ success: true, message: 'Database analyzed successfully' });
  } catch (err: any) {
    console.error('ANALYZE error:', err);
    res.status(500).json({ error: 'ANALYZE failed: ' + err.message });
  }
});

// Export all non-secret app_settings as JSON
router.get('/export', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    const rows: { key: string; value: string }[] = await db.all('SELECT key, value FROM app_settings');
    const safe = rows.filter(r => !SECRET_KEYS.has(r.key));
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), settings: safe }, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="settings_export_${Date.now()}.json"`);
    res.send(json);
  } catch (err: any) {
    console.error('Settings export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Import app_settings from JSON body (skips secret keys)
router.post('/import', async (req, res) => {
  const { settings: incoming } = req.body as { settings?: { key: string; value: string }[] };
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ error: 'settings array required' });
  }
  try {
    const db = await dbManager.getConnection();
    let imported = 0;
    let skipped = 0;
    for (const { key, value } of incoming) {
      if (!key || typeof key !== 'string') { skipped++; continue; }
      if (SECRET_KEYS.has(key)) { skipped++; continue; }
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value ?? '']);
      imported++;
    }
    await db.run(`INSERT INTO action_logs (action_type, description) VALUES ('SETTINGS_IMPORT', ?)`,
      [`Settings imported: ${imported} keys (${skipped} skipped)`]);
    res.json({ success: true, imported, skipped });
  } catch (err: any) {
    console.error('Settings import error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

// ── Transport: USB (adb reverse) ────────────────────────────────────────────
// Tunnels phone's localhost ports to the PC so the mobile app can connect via
// http://localhost:3000 and http://localhost:3030 over a USB cable.
// Requires 'adb' on PATH (installed with Android Platform Tools).
router.post('/adb-reverse', async (_req, res) => {
  const API_PORT  = process.env.PORT ?? '3000';
  const SYNC_PORT = process.env.SYNC_PORT ?? '3030';
  const cmd = `adb reverse tcp:${API_PORT} tcp:${API_PORT} && adb reverse tcp:${SYNC_PORT} tcp:${SYNC_PORT}`;

  exec(cmd, { timeout: 10000 }, async (err, stdout, stderr) => {
    if (err) {
      console.error('[USB] adb reverse failed:', err.message);
      return res.status(500).json({
        error: 'adb reverse failed. Ensure adb is on PATH and the device is connected with USB debugging enabled.',
        detail: err.message,
      });
    }
    try {
      const db = await dbManager.getConnection();
      await db.run(
        "INSERT INTO action_logs (action_type, description) VALUES ('USB_ADB_REVERSE', ?)",
        [`ADB USB tunnels set: localhost:${API_PORT} (API) and localhost:${SYNC_PORT} (sync)`]
      );
    } catch {}
    res.json({
      success: true,
      message: `USB tunnels active — phone localhost:${API_PORT} → PC:${API_PORT}, localhost:${SYNC_PORT} → PC:${SYNC_PORT}`,
      stdout: stdout.trim(),
    });
  });
});

export default router;
