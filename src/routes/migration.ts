// Migration Utility API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { migrationStatus, runManualMigration } from '../worker/migrationWorker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const MIGRATION_DIR = path.resolve(__dirname, '..', '..', 'MIGRATION SAMPEL');

if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, MIGRATION_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

const router = express.Router();

// Upload a zip file to MIGRATION SAMPEL directory
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ success: true, message: 'File uploaded successfully', file: req.file.filename });
});

// Get live migration status
router.get('/status', (req, res) => {
  res.json(migrationStatus);
});

// List files in the MIGRATION SAMPEL folder
router.get('/files', (req, res) => {
  try {
    if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });
    const files = fs.readdirSync(MIGRATION_DIR).filter(f => f.endsWith('.zip'));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Trigger a manual migration script
router.post('/run', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: 'fileName required' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['MIGRATION', `Requested manual migration for: ${fileName}`]
    );
    await db.close();
    
    // Call the worker
    await runManualMigration(fileName);
    
    res.json({ success: true, message: `Migration for ${fileName} started` });
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message || 'Failed to start migration' });
  }
});

export default router;
