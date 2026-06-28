import { dbManager } from '../database/connection.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WhatsappQueue {
  /** Queue an invoice PDF for WhatsApp delivery (written by main; consumed by worker) */
  async queueJob(invoiceId: number, phone: string, pdfPath: string, caption: string): Promise<void> {
    try {
      const db = await dbManager.getConnection();
      await db.run(
        `INSERT INTO pending_whatsapp_jobs (invoice_id, recipient_phone, pdf_path, caption) VALUES (?, ?, ?, ?)`,
        [invoiceId, phone, pdfPath, caption]
      );
      console.log(`Queued pending WhatsApp transmission for Invoice ID ${invoiceId}`);
    } catch (err) {
      console.error('Failed to queue WhatsApp job:', err);
    }
  }

  /** Queue a general message (no invoice) for WhatsApp delivery via web client */
  async queueMessage(phone: string, pdfPath?: string | null, caption?: string | null): Promise<void> {
    try {
      const db = await dbManager.getConnection();
      await db.run(
        `INSERT INTO pending_whatsapp_jobs (invoice_id, recipient_phone, pdf_path, caption) VALUES (?, ?, ?, ?)`,
        [null, phone, pdfPath ?? null, caption ?? null]
      );
      console.log(`Queued pending WhatsApp message to ${phone}`);
    } catch (err) {
      console.error('Failed to queue WhatsApp message:', err);
    }
  }

  /** No-op — queue is now consumed by the WhatsApp worker process */
  startWorker(): void {
    console.log('[WhatsappQueue] Queue consumer runs in WhatsApp worker process.');
  }
}

export const whatsappQueue = new WhatsappQueue();
export default whatsappQueue;
