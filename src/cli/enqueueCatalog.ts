import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { ensureSchema } from '../../database';

// Directory containing catalog files (relative to project root)
const CATALOG_DIR = path.resolve(__dirname, '..', '..', '..', 'catalog');
// SQLite database path (store under data folder)
const DB_PATH = path.resolve(__dirname, '..', '..', '..', 'data', 'app.db');

async function enqueue() {
  await ensureSchema(DB_PATH);
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const entries = await fs.promises.readdir(CATALOG_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && /\.(pdf|csv)$/i.test(entry.name)) {
      const fullPath = path.join(CATALOG_DIR, entry.name);
      await db.run(`INSERT OR IGNORE INTO catalog_jobs (file_path) VALUES (?)`, fullPath);
    }
  }
  await db.close();
  console.log('Enqueue complete');
}

enqueue().catch((err) => {
  console.error('Failed to enqueue catalog files:', err);
  process.exit(1);
});
