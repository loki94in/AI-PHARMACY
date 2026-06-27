import { dbManager } from '../database/connection.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pdfInvoiceService } from './pdfInvoiceService.js';
import { whatsappQueue } from './whatsappQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');

export class WhatsappInvoiceService {
  async sendInvoiceViaWhatsApp(invoiceId: number): Promise<boolean> {
    let db;
    try {
      db = await dbManager.getConnection();

      const invoice = await db.get(
        `SELECT si.invoice_no, si.total_amount, si.payment_medium, si.payment_status,
                c.name as customer_name, c.phone as customer_phone
         FROM sales_invoices si
         LEFT JOIN customers c ON si.customer_id = c.id
         WHERE si.id = ?`,
        [invoiceId]
      );

      if (!invoice) {
        console.error(`Invoice ID ${invoiceId} not found for WhatsApp dispatch`);
        return false;
      }

      const phone = invoice.customer_phone;
      if (!phone) {
        console.warn(`No phone number for customer in Invoice ${invoiceId}. Skipping WhatsApp.`);
        return false;
      }

      // Generate invoice PDF
      const pdfFilename = `invoice_${invoice.invoice_no.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
      const pdfPath = path.join(UPLOADS_DIR, pdfFilename);

      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      await pdfInvoiceService.generateInvoicePdf(invoiceId, pdfPath);

      // Build caption
      let caption = `Dear ${invoice.customer_name || 'Customer'},\n\n`;
      if (invoice.payment_medium === 'CREDIT') {
        caption += `📄 Credit purchase of ₹${(invoice.total_amount || 0).toFixed(2)} recorded successfully.\n`;
        caption += `Total bill amount is posted to your credit account and will be due on your salary day.\n\n`;
      } else {
        caption += `📄 Purchase of ₹${(invoice.total_amount || 0).toFixed(2)} completed successfully.\n`;
        caption += `Thank you for your payment.\n\n`;
      }
      caption += `Please find attached your digitally stamped PDF bill.\n\n— AI Pharmacy OS`;

      // Try WhatsApp Business API first (runs in main process — no Puppeteer involved)
      try {
        const { whatsappBusinessService } = await import('./whatsappBusinessService.js');
        const config = await whatsappBusinessService.getConfig();
        if (config.enabled && config.phoneNumberId && config.accessToken) {
          const bizResult = await whatsappBusinessService.sendDocument(
            phone, pdfPath, caption, `Invoice_${invoice.invoice_no}.pdf`
          );
          if (bizResult.success) {
            console.log(`Invoice ${invoice.invoice_no} dispatched via WhatsApp Business API to ${phone}`);
            return true;
          }
          console.warn(`WhatsApp Business API failed: ${bizResult.error}. Queuing for WA Web worker.`);
        }
      } catch (bizErr) {
        console.warn('[WhatsApp Invoice] Business API attempt failed:', bizErr);
      }

      // Fall back: queue for the WhatsApp Web forked worker
      await whatsappQueue.queueJob(invoiceId, phone, pdfPath, caption);
      console.log(`Invoice ${invoice.invoice_no} queued for WhatsApp Web worker delivery.`);
      return false; // will be delivered asynchronously by worker
    } catch (err) {
      console.error(`Error dispatching invoice ${invoiceId} via WhatsApp:`, err);
      return false;
    }
  }
}

export const whatsappInvoiceService = new WhatsappInvoiceService();
