import { Database } from 'sqlite';
import { sendMessage } from '../whatsappClient.js';
import { telegramBotService } from '../telegramBot.js';

export async function checkAllRefills(db: Database): Promise<void> {
  const pendingRefills = await db.all(
    `SELECT pr.*, m.name as medicine_name FROM patient_refills pr
     JOIN medicines m ON pr.medicine_id = m.id
     WHERE pr.next_refill_date <= CURRENT_TIMESTAMP AND pr.status = 'pending'`
  );

  const outOfStockRefills: any[] = [];

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
        await db.run("UPDATE patient_refills SET status = 'notified', hold_for_stock = 0 WHERE id = ?", [refill.id]);
      } catch (err) {
        console.error('Failed to send refill WhatsApp message:', err);
      }
    } else {
      // Mark as waiting for stock
      await db.run("UPDATE patient_refills SET hold_for_stock = 1 WHERE id = ?", [refill.id]);
      outOfStockRefills.push(refill);
    }
  }

  // If there are out of stock refills, send a consolidated daily list of the week to the Pharmacist via Telegram
  if (outOfStockRefills.length > 0) {
    let reportMessage = `📋 PENDING REFILLS OF THE WEEK (OUT OF STOCK):\n\n`;
    outOfStockRefills.forEach((refill, index) => {
      reportMessage += `${index + 1}. Patient: ${refill.patient_name} (${refill.patient_phone})\n   Medication: ${refill.medicine_name}\n   Next Refill Due: ${refill.next_refill_date}\n\n`;
    });
    reportMessage += `Please purchase/add stock for these medicines to trigger patient reminders automatically.`;

    try {
      await telegramBotService.sendDefaultNotification(reportMessage);
    } catch (err) {
      console.error('Failed to send daily out-of-stock refills report to Telegram:', err);
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

  // Fetch pending refills that were held back for stock
  const pendingRefills = await db.all(
    `SELECT pr.*, m.name as medicine_name FROM patient_refills pr
     JOIN medicines m ON pr.medicine_id = m.id
     WHERE pr.medicine_id = ? AND (pr.status = 'pending' OR pr.hold_for_stock = 1)`,
    [medicineId]
  );

  for (const refill of pendingRefills) {
    const message = `Hello ${refill.patient_name}, your prescription refill for ${refill.medicine_name} is now ready and in stock! Please visit the pharmacy to collect it.`;
    try {
      await sendMessage(refill.patient_phone, undefined, message);
      await db.run("UPDATE patient_refills SET status = 'notified', hold_for_stock = 0 WHERE id = ?", [refill.id]);
    } catch (err) {
      console.error('Failed to send refill WhatsApp message on stock trigger:', err);
    }
  }
}

export async function triggerPendingSpecialOrdersForMedicineName(db: Database, medicineName: string): Promise<void> {
  if (!medicineName) return;
  const pendingOrders = await db.all(
    `SELECT * FROM special_orders WHERE LOWER(product) = LOWER(?) AND (status = 'Pending' OR status = 'Ordered')`,
    [medicineName.trim()]
  );

  for (const order of pendingOrders) {
    await db.run("UPDATE special_orders SET status = 'Ready', notified = 1 WHERE id = ?", [order.id]);

    if (order.phone) {
      try {
        const cleanPhone = order.phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        
        let medicalName = 'XYZ MEDICAL';
        const nameRow = await db.get("SELECT value FROM app_settings WHERE key = 'medical_name'");
        if (nameRow && nameRow.value) {
          medicalName = nameRow.value;
        }

        const msg = `Hi ${order.requester || 'Customer'}, your special order for ${order.product} (Qty: ${order.qty}) is now READY for collection at ${medicalName}. Please visit us to collect it.`;
        await sendMessage(formattedPhone, undefined, msg);
      } catch (wsError: any) {
        console.error(`Failed to send special order arrival WhatsApp to ${order.requester}:`, wsError);
        await db.run(
          "INSERT INTO action_logs (action_type, description) VALUES (?, ?)",
          ['AUTOMATION_ALERT', `❌ WhatsApp Alert Failure: Failed to send special order ready notification to ${order.requester} (${order.phone}). Error: ${wsError.message || 'Unknown error'}`]
        );
      }
    }
  }
}

