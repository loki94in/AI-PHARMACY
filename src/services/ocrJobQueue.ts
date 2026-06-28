import { dbManager } from '../database/connection.js';
import { randomUUID } from 'crypto';

const POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;
const CLEANUP_AGE_MS = 5 * 60 * 1000; // 5 minutes

type JobType = 'processImage' | 'extractText';

/**
 * Submit an image to the OCR worker via the pending_ocr_jobs table.
 * Blocks until the worker writes a result or the timeout elapses.
 */
export async function submitOcrJob(
  imageData: string | Buffer,
  jobType: JobType = 'processImage',
  skipEnrichment = false,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<any> {
  const jobId = randomUUID();

  // Normalise to base64 string for storage
  let imageStr: string;
  if (Buffer.isBuffer(imageData)) {
    imageStr = imageData.toString('base64');
  } else if (typeof imageData === 'string' && imageData.startsWith('data:')) {
    imageStr = imageData.split(',')[1] ?? imageData;
  } else {
    imageStr = imageData as string;
  }

  const db = await dbManager.getConnection();
  await db.run(
    `INSERT INTO pending_ocr_jobs (job_id, image_data, job_type, skip_enrichment)
     VALUES (?, ?, ?, ?)`,
    [jobId, imageStr, jobType, skipEnrichment ? 1 : 0]
  );

  // Poll until done or timeout
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const row = await db.get(
      `SELECT status, result, error FROM pending_ocr_jobs WHERE job_id = ?`,
      [jobId]
    );
    if (!row) throw new Error(`OCR job ${jobId} disappeared from queue`);
    if (row.status === 'done') {
      return JSON.parse(row.result as string);
    }
    if (row.status === 'failed') {
      throw new Error(row.error ?? 'OCR job failed');
    }
  }

  // Timeout — mark job as failed so worker skips it
  await db.run(
    `UPDATE pending_ocr_jobs SET status = 'failed', error = 'timed out waiting for OCR worker'
     WHERE job_id = ?`,
    [jobId]
  );
  throw new Error('OCR job timed out after ' + timeoutMs + 'ms');
}

/** Periodically remove completed / failed jobs older than CLEANUP_AGE_MS */
export async function cleanupOcrJobs(): Promise<void> {
  try {
    const db = await dbManager.getConnection();
    await db.run(
      `DELETE FROM pending_ocr_jobs
       WHERE status IN ('done', 'failed')
         AND created_at < datetime('now', '-5 minutes')`
    );
  } catch (err) {
    console.error('[OcrJobQueue] Cleanup error:', err);
  }
}
