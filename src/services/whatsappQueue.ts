import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendMessage, isReady } from '../whatsappClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

export class WhatsappQueue {
  private isProcessing = false;

  async queueJob(invoiceId: number, phone: string, pdfPath: string, caption: string): Promise<void> {
    let db;
    try {
      db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.run(
        `INSERT INTO pending_whatsapp_jobs (invoice_id, recipient_phone, pdf_path, caption) VALUES (?, ?, ?, ?)`,
        [invoiceId, phone, pdfPath, caption]
      );
      await db.close();
      console.log(`Queued pending WhatsApp transmission for Invoice ID ${invoiceId}`);
      
      // Try immediate processing
      this.processQueue().catch(console.error);
    } catch (err) {
      if (db) await db.close();
      console.error('Failed to queue WhatsApp job:', err);
    }
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (!isReady) {
      console.log('WhatsApp client not ready. Delaying queue processing.');
      return;
    }

    this.isProcessing = true;
    let db;
    try {
      db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      const jobs = await db.all('SELECT * FROM pending_whatsapp_jobs ORDER BY created_at ASC');

      for (const job of jobs) {
        try {
          console.log(`Attempting to send queued WhatsApp bill for invoice ${job.invoice_id} to ${job.recipient_phone}`);
          await sendMessage(job.recipient_phone, job.pdf_path, job.caption);
          
          // Delete on success
          await db.run('DELETE FROM pending_whatsapp_jobs WHERE id = ?', [job.id]);
          console.log(`Successfully sent queued WhatsApp bill for invoice ${job.invoice_id}`);
        } catch (jobErr) {
          console.error(`Failed to send queued WhatsApp job ${job.id}:`, jobErr);
          
          if (job.retries >= 5) {
            console.error(`Max retries reached for queued WhatsApp job ${job.id}. Deleting job to prevent lockups.`);
            await db.run('DELETE FROM pending_whatsapp_jobs WHERE id = ?', [job.id]);
          } else {
            await db.run('UPDATE pending_whatsapp_jobs SET retries = retries + 1 WHERE id = ?', [job.id]);
          }
        }
      }
      
      await db.close();
    } catch (err) {
      if (db) await db.close();
      console.error('Error processing WhatsApp queue:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  startWorker(): void {
    // Process queue every 30 seconds
    setInterval(() => {
      this.processQueue().catch(console.error);
    }, 30000);
    console.log('WhatsApp Resilient Queue background worker started.');
  }
}

export const whatsappQueue = new WhatsappQueue();
export default whatsappQueue;
