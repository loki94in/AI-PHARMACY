// Dispatch & Support API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const router = express.Router();
// Create a dispatch request (e.g., support ticket)
router.post('/', async (req, res) => {
    const { type, description, contact } = req.body;
    if (!type || !description) {
        return res.status(400).json({ error: 'type and description required' });
    }
    try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run('INSERT INTO action_logs (action_type, description) VALUES (?, ?)', ['DISPATCH', `${type}: ${description}`]);
        await db.close();
        // In a real system, this could trigger WhatsApp/Email notifications
        res.json({ success: true, message: 'Dispatch logged' });
    }
    catch (error) {
        console.error('Dispatch error:', error);
        res.status(500).json({ error: 'Failed to log dispatch' });
    }
});
export default router;
