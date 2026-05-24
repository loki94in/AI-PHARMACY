import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { ensureSchema } from '../database.js';
import { extractFromPdf, extractFromCsv } from '../extractor.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

function findApiReference(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export async function processJob(job: { id: number; file_path: string }) {
  const { id, file_path } = job;
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run(`UPDATE catalog_jobs SET status='processing' WHERE id=?`, id);
  try {
    const ext = path.extname(file_path).toLowerCase();
    const names = ext === '.pdf' ? await extractFromPdf(file_path) : await extractFromCsv(file_path);
    const rawContent = await fs.promises.readFile(file_path, 'utf-8');
    const apiRef = findApiReference(rawContent);
    for (const n of names) {
      await db.run(
        `INSERT INTO medicines (name, api_reference)
         SELECT ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM medicines WHERE lower(name)=lower(?))`,
        n,
        apiRef,
        n
      );
    }
    await db.run(`INSERT OR REPLACE INTO processed_files (file_path, last_processed) VALUES (?, CURRENT_TIMESTAMP)`, file_path);
    await db.run(`UPDATE catalog_jobs SET status='done' WHERE id=?`, id);
  } catch (e) {
    console.error('Job failed', e);
    await db.run(`UPDATE catalog_jobs SET status='failed' WHERE id=?`, id);
  } finally {
    await db.close();
  }
}

async function workerLoop() {
  await ensureSchema(DB_PATH);
  while (true) {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const job = await db.get(`SELECT * FROM catalog_jobs WHERE status='pending' ORDER BY created_at LIMIT 1`);
    await db.close();
    if (!job) {
      // No pending jobs – wait a bit before checking again
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    await processJob(job);
  }
}

if (process.env.NODE_ENV !== 'test') {
  workerLoop().catch((err) => {
    console.error('Worker crashed:', err);
    process.exit(1);
  });
}
