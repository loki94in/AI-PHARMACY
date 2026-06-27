/**
 * WhatsappQueue — enqueue-only helper used by the main process.
 *
 * The main Express process inserts rows into `pending_whatsapp_jobs`.
 * The forked WhatsApp worker (whatsappWorker.ts) is the sole consumer
 * of that table. processQueue() and startWorker() have been removed from
 * the main process — they now live in the worker.
 */
import { dbManager } from '../database/connection.js';

export class WhatsappQueue {
  async queueJob(invoiceId: number, phone: string, pdfPath: string, caption: string): Promise<void> {
    try {
      const db = await dbManager.getConnection();
      await db.run(
        `INSERT INTO pending_whatsapp_jobs (invoice_id, recipient_phone, pdf_path, caption) VALUES (?, ?, ?, ?)`,
        [invoiceId, phone, pdfPath, caption]
      );
      console.log(`[WhatsApp Queue] Queued job for invoice ${invoiceId} → ${phone}`);
    } catch (err) {
      console.error('[WhatsApp Queue] Failed to queue job:', err);
    }
  }
}

export const whatsappQueue = new WhatsappQueue();
export default whatsappQueue;
