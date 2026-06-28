import { dbManager } from '../database/connection.js';
import { aiCameraService } from '../services/aiCameraService.js';

const POLL_INTERVAL_MS = 1000;

let isProcessing = false;

async function pollJobs(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const db = await dbManager.getConnection();

    // Claim one pending job atomically
    const job = await db.get(
      `SELECT * FROM pending_ocr_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
    );
    if (!job) return;

    await db.run(
      `UPDATE pending_ocr_jobs SET status = 'processing' WHERE job_id = ? AND status = 'pending'`,
      [job.job_id]
    );

    // Re-fetch to confirm we won the race
    const claimed = await db.get(
      `SELECT status FROM pending_ocr_jobs WHERE job_id = ?`,
      [job.job_id]
    );
    if (!claimed || claimed.status !== 'processing') return; // another worker claimed it

    try {
      // Restore original data format expected by aiCameraService
      const imageData: string | Buffer =
        job.job_type === 'extractText'
          ? Buffer.from(job.image_data as string, 'base64')
          : (job.image_data as string);

      let result: any;
      if (job.job_type === 'extractText') {
        result = await aiCameraService.extractTextFromImage(imageData as Buffer);
      } else {
        result = await aiCameraService.processImage(imageData, job.skip_enrichment === 1);
      }

      await db.run(
        `UPDATE pending_ocr_jobs
         SET status = 'done', result = ?, completed_at = datetime('now')
         WHERE job_id = ?`,
        [JSON.stringify(result), job.job_id]
      );
    } catch (err: any) {
      console.error(`[OCR Worker] Job ${job.job_id} failed:`, err);
      await db.run(
        `UPDATE pending_ocr_jobs
         SET status = 'failed', error = ?, completed_at = datetime('now')
         WHERE job_id = ?`,
        [String(err?.message ?? err), job.job_id]
      );
    }
  } catch (err) {
    console.error('[OCR Worker] Poll error:', err);
  } finally {
    isProcessing = false;
  }
}

// PING / PONG heartbeat
process.on('message', (msg: any) => {
  if (msg?.type === 'PING') process.send?.({ type: 'PONG' });
});

// Graceful exit when supervisor disconnects
process.on('disconnect', () => {
  console.log('[OCR Worker] Supervisor disconnected. Exiting...');
  process.exit(0);
});

async function startup(): Promise<void> {
  console.log('[OCR Worker] Starting up...');

  const db = await dbManager.getConnection();
  await db.run('PRAGMA journal_mode=WAL');
  await db.run('PRAGMA busy_timeout=5000');

  // Reset any jobs left in 'processing' state from a previous crashed run
  await db.run(
    `UPDATE pending_ocr_jobs SET status = 'pending' WHERE status = 'processing'`
  );

  setInterval(() => pollJobs().catch(console.error), POLL_INTERVAL_MS);
  console.log('[OCR Worker] Polling for jobs every 1 s.');
}

startup().catch(err => {
  console.error('[OCR Worker] Fatal startup error:', err);
  process.exit(1);
});
