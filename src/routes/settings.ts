// Settings API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');

const router = express.Router();

// Get all settings
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
    const rows = await db.all('SELECT * FROM app_settings');
    await db.close();
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
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
    await db.close();
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
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value ?? '']);
    await db.close();
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
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
    const entries = Object.entries(payload);
    for (const [k, v] of entries) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [k, v ?? '']);
    }
    await db.close();
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

    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('use_custom_stamp', 'true')");
    await db.close();

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

    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('use_custom_signature', 'true')");
    await db.close();

    res.json({ success: true, message: 'Custom signature uploaded and enabled' });
  } catch (err: any) {
    console.error('Upload signature error:', err);
    res.status(500).json({ error: 'Failed to upload signature' });
  }
});

// Create a new distributor
router.post('/distributors', async (req, res) => {
  const { name, phone, email, address, state_code } = req.body;
  if (!name) return res.status(400).json({ error: 'Distributor name is required' });
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const result = await db.run(
      `INSERT INTO distributors (name, phone, email, address, state_code) VALUES (?, ?, ?, ?, ?)`,
      [name, phone || '', email || '', address || '', state_code || '']
    );
    const id = result.lastID;
    const saved = await db.get('SELECT * FROM distributors WHERE id = ?', [id]);
    await db.close();
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Failed to create distributor:', error);
    res.status(500).json({ error: 'Failed to create distributor' });
  }
});

export default router;
