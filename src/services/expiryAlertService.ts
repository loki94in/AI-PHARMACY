import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

export async function runExpiryScanAndAlert(days = 90) {
  console.log(`[ExpiryScan] Executing automatic 15-day near-expiry inventory scan (horizon: ${days} days)...`);
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Fetch items nearing expiry / already expired
    const rows = await db.all(`
      SELECT m.name as medicine_name, im.batch_no, im.expiry_date, im.quantity
      FROM inventory_master im
      JOIN medicines m ON im.medicine_id = m.id
      WHERE date(im.expiry_date) <= date('now', '+' || ? || ' days')
      AND im.quantity > 0
      ORDER BY im.expiry_date ASC
      LIMIT 10
    `, [days]);

    if (rows.length === 0) {
      console.log('[ExpiryScan] No near-expiry items found to report.');
      await db.close();
      return;
    }

    // Load owner/pharmacist phone number from settings
    const phoneRow = await db.get("SELECT value FROM app_settings WHERE key = 'owner_phone'");
    const nameRow = await db.get("SELECT value FROM app_settings WHERE key = 'medical_name'");
    await db.close();

    const targetPhone = phoneRow?.value;
    const medicalName = nameRow?.value || 'AI Pharmacy';

    if (!targetPhone) {
      console.warn('[ExpiryScan] Expiry scan completed, but no `owner_phone` is configured in app_settings. WhatsApp alert skipped.');
      return;
    }

    // Load WhatsApp client and send message
    const { sendMessage } = await import('../whatsappClient.js');
    const cleanPhone = targetPhone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    // Construct reports list message
    let msg = `📋 *${medicalName} - Auto 15-Day Expiry Report*\n`;
    msg += `The following inventory items are expiring soon (within ${days} days):\n\n`;
    
    rows.forEach((r, index) => {
      const expDate = new Date(r.expiry_date).toLocaleDateString([], { month: '2-digit', year: '2-digit' });
      msg += `${index + 1}. *${r.medicine_name}* (Batch: ${r.batch_no}) | Exp: ${expDate} | Qty: ${r.quantity}\n`;
    });
    
    if (rows.length >= 10) {
      msg += `\n...and others. Please log in to the dashboard Expiry Monitor for the full report.`;
    }

    await sendMessage(formattedPhone, undefined, msg);
    console.log(`[ExpiryScan] Auto WhatsApp alert summary successfully dispatched to ${targetPhone}`);
  } catch (err) {
    console.error('[ExpiryScan] Error running automatic expiry scan:', err);
  }
}
