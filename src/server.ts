import express from 'express';
import cors from 'cors';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', 'data', 'app.db');

const app = express();
app.use(cors());
app.use(express.json());

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
