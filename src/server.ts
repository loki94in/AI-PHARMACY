import express from 'express';
import cors from 'cors';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', 'data', 'app.db');
const UPLOAD_DIR = path.resolve(__dirname, '..', 'catalog');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());

// API to upload file and enqueue it directly
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fullPath = req.file.path;
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(`INSERT OR IGNORE INTO catalog_jobs (file_path) VALUES (?)`, fullPath);
    await db.close();
    
    res.json({ success: true, message: 'File uploaded and queued for processing', file: req.file.filename });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API to fetch all extracted medicines
app.get('/api/medicines', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const medicines = await db.all('SELECT * FROM medicines ORDER BY id DESC');
    await db.close();
    res.json(medicines);
  } catch (error) {
    console.error('Failed to fetch medicines:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Purchases Engine APIs
app.get('/api/distributors', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const distributors = await db.all('SELECT * FROM distributors ORDER BY name');
    await db.close();
    res.json(distributors);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/purchases', async (req, res) => {
  const { distributor, invoice_no, total_amount } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Upsert distributor
    await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', distributor);
    const distRow = await db.get('SELECT id FROM distributors WHERE name = ?', distributor);
    
    // Insert purchase
    await db.run('INSERT INTO purchases (distributor_id, invoice_no, total_amount) VALUES (?, ?, ?)', 
      [distRow.id, invoice_no, total_amount]);
      
    await db.close();
    res.json({ success: true, message: 'Purchase saved' });
  } catch (error) {
    console.error('Failed to save purchase:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API to fetch all catalog jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const jobs = await db.all('SELECT * FROM catalog_jobs ORDER BY created_at DESC');
    await db.close();
    res.json(jobs);
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
