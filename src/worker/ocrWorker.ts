/**
 * OCR Worker — runs as a forked child process via WorkerSupervisor.
 *
 * Responsibilities:
 *  - Open its own SQLite connection (WAL + busy_timeout=5000).
 *  - Own the Tesseract/ONNX OCR service entirely (heavy RAM/CPU).
 *  - Poll `pending_ocr_jobs` every 2 s for pending rows.
 *  - Write results back to `pending_ocr_jobs.result_json`.
 *  - Clean up stale jobs older than 5 minutes.
 *  - Respond to PING heartbeat from WorkerSupervisor.
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

// Stale job age: if a job stays 'pending' or 'processing' longer than this, clean it up
const STALE_JOB_AGE_SECONDS = 300;

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (db) return db;
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run('PRAGMA journal_mode = WAL');
  await db.run('PRAGMA busy_timeout = 5000');
  return db;
}

let isProcessing = false;

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const conn = await getDb();

    // Pick up one pending job at a time (prevents stacking if OCR is slow)
    const job = await conn.get(
      `SELECT id, image_data FROM pending_ocr_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
    );

    if (!job) return;

    // Mark as processing
    await conn.run(
      `UPDATE pending_ocr_jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [job.id]
    );

    try {
      console.log(`[OCR Worker] Processing job ${job.id}...`);
      const { aiCameraService } = await import('../services/aiCameraService.js');
      const result = await aiCameraService.processImage(job.image_data);

      await conn.run(
        `UPDATE pending_ocr_jobs SET status = 'done', result_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [JSON.stringify(result), job.id]
      );
      console.log(`[OCR Worker] Job ${job.id} completed.`);
    } catch (jobErr: any) {
      console.error(`[OCR Worker] Job ${job.id} failed:`, jobErr?.message || jobErr);
      await conn.run(
        `UPDATE pending_ocr_jobs SET status = 'error', result_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [JSON.stringify({ error: jobErr?.message || 'OCR processing failed' }), job.id]
      );
    }
  } catch (err: any) {
    console.error('[OCR Worker] Error in processQueue:', err?.message || err);
  } finally {
    isProcessing = false;
  }
}

async function cleanStaleJobs(): Promise<void> {
  try {
    const conn = await getDb();
    const deleted = await conn.run(
      `DELETE FROM pending_ocr_jobs
       WHERE status IN ('done', 'error')
         AND updated_at < datetime('now', '-${STALE_JOB_AGE_SECONDS} seconds')`
    );
    if (deleted.changes && deleted.changes > 0) {
      console.log(`[OCR Worker] Cleaned up ${deleted.changes} stale OCR job(s).`);
    }
  } catch (err: any) {
    console.error('[OCR Worker] Error cleaning stale jobs:', err?.message || err);
  }
}

export async function startOcrWorker(): Promise<void> {
  console.log('[OCR Worker] Starting. DB:', DB_PATH);
  await getDb(); // validate connection

  // Pre-initialise productNameFilterService so first scan is fast
  try {
    const { productNameFilterService } = await import('../services/productNameFilterService.js');
    await productNameFilterService.initialize();
    console.log('[OCR Worker] productNameFilterService pre-initialized.');
  } catch (err) {
    console.error('[OCR Worker] Could not pre-initialize productNameFilterService:', err);
  }

  // Poll for new OCR jobs every 2 seconds
  const pollInterval = setInterval(() => {
    processQueue().catch(err =>
      console.error('[OCR Worker] processQueue error:', err)
    );
  }, 2000);

  // Clean up stale jobs every 60 seconds
  const cleanInterval = setInterval(() => {
    cleanStaleJobs().catch(err =>
      console.error('[OCR Worker] cleanStaleJobs error:', err)
    );
  }, 60000);

  // IPC heartbeat
  process.on('message', (msg: any) => {
    if (msg && msg.type === 'PING') {
      process.send?.({ type: 'PONG' });
    }
  });

  process.on('disconnect', () => {
    clearInterval(pollInterval);
    clearInterval(cleanInterval);
    console.log('[OCR Worker] Supervisor disconnected. Exiting.');
    process.exit(0);
  });

  console.log('[OCR Worker] Running. Poll interval: 2s.');
}
