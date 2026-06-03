import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { ensureSchema } from '../database.js';
import { extractFromPdf, extractFromCsv, ExtractedMedicine } from '../extractor.js';
import { eventService } from '../services/eventService.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

export async function processJob(job: { id: number; file_path: string }) {
  const { id, file_path } = job;
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run(`UPDATE catalog_jobs SET status='processing' WHERE id=?`, id);
  eventService.broadcast('catalog_job_update', { id, status: 'processing' });
  try {
    const onProgress = (percent: number) => {
      eventService.broadcast('catalog_job_progress', { id, progress: percent });
    };

    const ext = path.extname(file_path).toLowerCase();
    const extracted: ExtractedMedicine[] = ext === '.pdf' 
        ? await extractFromPdf(file_path, onProgress) 
        : await extractFromCsv(file_path, onProgress);
        
    const extractedJson = JSON.stringify(extracted);
    await db.run(`UPDATE catalog_jobs SET status='done', extracted_data=? WHERE id=?`, [extractedJson, id]);
    
    // Also notify for immediate UI update
    eventService.broadcast('catalog_job_update', { id, status: 'done' });
    eventService.broadcast('catalog_review_ready', { id, file_path });
  } catch (e: any) {
    console.error('Job failed', e);
    await db.run(`UPDATE catalog_jobs SET status='failed' WHERE id=?`, id);
    eventService.broadcast('catalog_job_update', { id, status: 'failed', error: e.message });
  } finally {
    await db.close();
  }
}

// Loop to poll jobs
export async function startWorker() {
  setInterval(async () => {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const job = await db.get(`SELECT * FROM catalog_jobs WHERE status='pending' ORDER BY id ASC LIMIT 1`);
    await db.close();
    if (job) {
      await processJob(job);
    }
  }, 10000);
}
