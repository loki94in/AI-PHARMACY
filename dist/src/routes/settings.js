// Settings API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const router = express.Router();
// Get a setting value
router.get('/:key', async (req, res) => {
    const { key } = req.params;
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
        await db.close();
        if (!row)
            return res.status(404).json({ error: 'Setting not found' });
        res.json({ key, value: row.value });
    }
    catch (error) {
        console.error('Settings fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch setting' });
    }
});
// Update or create a setting
router.post('/', async (req, res) => {
    const { key, value } = req.body;
    if (!key)
        return res.status(400).json({ error: 'key required' });
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value ?? '']);
        await db.close();
        res.json({ success: true, message: 'Setting saved' });
    }
    catch (error) {
        console.error('Settings save error:', error);
        res.status(500).json({ error: 'Failed to save setting' });
    }
});
// Generic settings save (upsert multiple keys)
router.post('/save', async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object')
        return res.status(400).json({ error: 'payload required' });
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
        const entries = Object.entries(payload);
        for (const [k, v] of entries) {
            await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [k, v ?? '']);
        }
        await db.close();
        res.json({ success: true, message: 'Settings saved' });
    }
    catch (error) {
        console.error('Bulk settings save error:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});
export default router;
