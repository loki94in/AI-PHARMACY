import { Database } from 'sqlite';
import { sendMessage } from '../whatsappClient.js';
import { telegramBotService } from '../telegramBot.js';

export async function checkAllRefills(db: Database): Promise<void> {
  const pendingRefills = await db.all(
    `SELECT pr.*, m.name as medicine_name FROM patient_refills pr
     JOIN medicines m ON pr.medicine_id = m.id
     WHERE pr.next_refill_date <= datetime('now', '+3 days') AND pr.status = 'pending' AND pr.is_active = 1`
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
      // Mark as ready for manual check and send, do not automatically send WhatsApp
      await db.run("UPDATE patient_refills SET is_ready = 1, hold_for_stock = 0 WHERE id = ?", [refill.id]);
    } else {
      // Mark as waiting for stock
      await db.run("UPDATE patient_refills SET hold_for_stock = 1, is_ready = 0 WHERE id = ?", [refill.id]);
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
     WHERE pr.medicine_id = ? AND pr.status = 'pending' AND (pr.hold_for_stock = 1 OR pr.is_ready = 0) AND pr.is_active = 1`,
    [medicineId]
  );

  for (const refill of pendingRefills) {
    // Instead of auto-sending, mark as ready for manual check
    await db.run("UPDATE patient_refills SET is_ready = 1, hold_for_stock = 0 WHERE id = ?", [refill.id]);
  }
}

export async function sendConsolidatedSpecialOrderNotification(db: Database, phone: string): Promise<void> {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  // Check if there are any remaining Pending or Ordered special orders for this customer (same phone number)
  const activeCountRow = await db.get(
    `SELECT COUNT(*) as cnt FROM special_orders 
     WHERE phone = ? AND (status = 'Pending' OR status = 'Ordered')`,
    [phone]
  );
  const activeCount = activeCountRow ? (activeCountRow.cnt || 0) : 0;

  // If there are still pending or ordered items, wait until all are ready before sending notification
  if (activeCount > 0) return;

  // Fetch all 'Ready' but not notified special orders for this customer
  const readyOrders = await db.all(
    `SELECT id, product, qty, requester FROM special_orders 
     WHERE phone = ? AND status = 'Ready' AND notified = 0`,
    [phone]
  );

  if (readyOrders.length === 0) return;

  const requester = readyOrders[0].requester || 'Customer';
  
  let medicalName = 'XYZ MEDICAL';
  const nameRow = await db.get("SELECT value FROM app_settings WHERE key = 'medical_name'");
  if (nameRow && nameRow.value) {
    medicalName = nameRow.value;
  }

  // Format the consolidated list of items
  let productList = '';
  if (readyOrders.length === 1) {
    productList = `${readyOrders[0].product} (Qty: ${readyOrders[0].qty})`;
  } else {
    productList = readyOrders.map((o, idx) => `${idx + 1}. ${o.product} (Qty: ${o.qty})`).join('\n');
  }

  const msg = `Hi ${requester},\n\nAll of your requested medicines are now READY for collection at ${medicalName}:\n\n${productList}\n\nPlease visit us to collect them.`;

  try {
    await sendMessage(formattedPhone, undefined, msg);

    // Update notified statuses to 1
    for (const order of readyOrders) {
      await db.run("UPDATE special_orders SET notified = 1 WHERE id = ?", [order.id]);
      
      // Log notification in automation_notifications
      try {
        await db.run(
          `INSERT INTO automation_notifications (type, recipient_name, recipient_phone, message, status, reference_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['order_ready', requester, formattedPhone, msg, 'sent', String(order.id)]
        );
      } catch (logErr) {
        console.error('Failed to log ready order notification to DB:', logErr);
      }
    }
  } catch (wsError: any) {
    console.error(`Failed to send consolidated WhatsApp notification to ${requester}:`, wsError);
    const errMsg = wsError.message || 'Unknown error';
    try {
      await db.run(
        "INSERT INTO action_logs (action_type, description) VALUES (?, ?)",
        'AUTOMATION_ALERT',
        `❌ WhatsApp Alert Failure: Failed to send consolidated notification to ${requester} (${phone}). Error: ${errMsg}`
      );
      
      for (const order of readyOrders) {
        await db.run(
          `INSERT INTO automation_notifications (type, recipient_name, recipient_phone, message, status, error_message, reference_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['order_ready', requester, formattedPhone, msg, 'failed', errMsg, String(order.id)]
        );
      }
    } catch (_) {}
  }
}

export async function triggerPendingSpecialOrdersForMedicineName(db: Database, medicineName: string): Promise<void> {
  if (!medicineName) return;
  const pendingOrders = await db.all(
    `SELECT * FROM special_orders WHERE LOWER(product) = LOWER(?) AND (status = 'Pending' OR status = 'Ordered')`,
    [medicineName.trim()]
  );

  const uniquePhones = new Set<string>();

  for (const order of pendingOrders) {
    await db.run("UPDATE special_orders SET status = 'Ready' WHERE id = ?", [order.id]);
    if (order.phone) {
      uniquePhones.add(order.phone);
    }
  }

  // Trigger consolidated alerts for each affected customer
  for (const phone of uniquePhones) {
    await sendConsolidatedSpecialOrderNotification(db, phone);
  }
}

