import { Database } from 'sqlite';
import { sendMessage } from '../whatsappClient.js';
import { telegramBotService } from '../telegramBot.js';

export async function checkAllRefills(db: Database): Promise<void> {
  const pendingRefills = await db.all(
    `SELECT pr.*, m.name as medicine_name FROM patient_refills pr
     JOIN medicines m ON pr.medicine_id = m.id
     WHERE pr.next_refill_date <= CURRENT_TIMESTAMP AND pr.status = 'pending'`
  );

  for (const refill of pendingRefills) {
    // Check medicine stock availability
    const stockRow = await db.get(
      'SELECT SUM(quantity) as total_qty FROM inventory_master WHERE medicine_id = ?',
      [refill.medicine_id]
    );
    const qty = stockRow ? (stockRow.total_qty || 0) : 0;

    if (qty > 0) {
      // Send WhatsApp Reminder
      const message = `Hello ${refill.patient_name}, your prescription refill for ${refill.medicine_name} is now ready and in stock! Please visit the pharmacy to collect it.`;
      try {
        await sendMessage(refill.patient_phone, undefined, message);
        await db.run("UPDATE patient_refills SET status = 'notified' WHERE id = ?", [refill.id]);
      } catch (err) {
        console.error('Failed to send refill WhatsApp message:', err);
      }
    } else {
      // Send Telegram notification to Pharmacist
      const telegramMessage = `⚠️ REFILL ALERT: Patient ${refill.patient_name} (${refill.patient_phone}) is due for refill of "${refill.medicine_name}", but it is OUT OF STOCK. Please place a purchase order.`;
      await telegramBotService.sendDefaultNotification(telegramMessage);
    }
  }
}

export async function triggerPendingRefillsForMedicine(db: Database, medicineId: number): Promise<void> {
  const stockRow = await db.get(
    'SELECT SUM(quantity) as total_qty FROM inventory_master WHERE medicine_id = ?',
    [medicineId]
  );
  const qty = stockRow ? (stockRow.total_qty || 0) : 0;

  if (qty <= 0) return;

  const pendingRefills = await db.all(
    `SELECT pr.*, m.name as medicine_name FROM patient_refills pr
     JOIN medicines m ON pr.medicine_id = m.id
     WHERE pr.medicine_id = ? AND pr.status = 'pending'`,
    [medicineId]
  );

  for (const refill of pendingRefills) {
    const message = `Hello ${refill.patient_name}, your prescription refill for ${refill.medicine_name} is now ready and in stock! Please visit the pharmacy to collect it.`;
    try {
      await sendMessage(refill.patient_phone, undefined, message);
      await db.run("UPDATE patient_refills SET status = 'notified' WHERE id = ?", [refill.id]);
    } catch (err) {
      console.error('Failed to send refill WhatsApp message on stock trigger:', err);
    }
  }
}
