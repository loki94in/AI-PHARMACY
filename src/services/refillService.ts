import { Database } from 'sqlite';
import { sendMessage } from '../whatsappClient.js';
import { telegramBotService } from '../telegramBot.js';

export async function checkAllRefills(db: Database): Promise<void> {
  // Query active refills that are due to catch Sunday and standard lead times
  const activeRefills = await db.all(
    `SELECT pr.*, m.name as medicine_name FROM patient_refills pr
     LEFT JOIN medicines m ON pr.medicine_id = m.id
     WHERE pr.status = 'pending' AND pr.is_active = 1`
  );

  const outOfStockRefills: any[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const refill of activeRefills) {
    const nextDate = new Date(refill.next_refill_date);
    nextDate.setHours(0, 0, 0, 0);
    const diffTime = nextDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const isRefillSunday = nextDate.getDay() === 0;

    // Trigger configurations
    const orderThreshold = isRefillSunday ? 5 : 6;
    const highlightThreshold = isRefillSunday ? 4 : 6;

    const orderTrigger = diffDays <= orderThreshold;
    const highlightTrigger = diffDays <= highlightThreshold;

    if (!orderTrigger && !highlightTrigger) {
      continue;
    }

    // Resolve items inside this refill schedule
    let items = [];
    if (refill.items_json) {
      try {
        items = JSON.parse(refill.items_json);
      } catch (_) {}
    }
    if (items.length === 0) {
      items = [{
        medicine_id: refill.medicine_id,
        qty: refill.last_qty_dispensed || 10
      }];
    }

    // Check stock availability for all items
    let allInStock = true;
    const outOfStockItems = [];

    for (const item of items) {
      const stockRow = await db.get(
        'SELECT SUM(quantity) as total_qty FROM inventory_master WHERE medicine_id = ?',
        [item.medicine_id]
      );
      const qty = stockRow ? (stockRow.total_qty || 0) : 0;
      if (qty <= 0) {
        allInStock = false;
        // Fetch medicine name
        const med = await db.get('SELECT name FROM medicines WHERE id = ?', [item.medicine_id]);
        outOfStockItems.push({
          medicine_id: item.medicine_id,
          name: med ? med.name : 'Unknown Medicine',
          qty: item.qty || 10
        });
      }
    }

    if (allInStock) {
      // Stock is present!
      if (highlightTrigger) {
        let quickBillId = refill.quick_bill_id;
        if (!quickBillId) {
          quickBillId = await createQuickBillForRefill(db, refill);
          await db.run(
            `UPDATE patient_refills 
             SET is_ready = 1, hold_for_stock = 0, quick_bill_id = ?
             WHERE id = ?`,
            [quickBillId, refill.id]
          );
        } else {
          await db.run(
            `UPDATE patient_refills 
             SET is_ready = 1, hold_for_stock = 0
             WHERE id = ?`,
            [refill.id]
          );
        }
      }
    } else {
      // Stock is missing!
      if (orderTrigger) {
        if (refill.ordering_triggered === 0) {
          // Log order in special_orders for each out of stock item
          for (const item of outOfStockItems) {
            await db.run(
              `INSERT INTO special_orders (product, requester, phone, qty, priority, status, pharmarack_mapped, source_refill_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [item.name, refill.patient_name, refill.patient_phone, item.qty, 'High', 'Pending', 1, refill.id]
            );
            
            // Silent API post to add to Pharmarack cart
            try {
              const port = process.env.PORT || 3000;
              fetch(`http://localhost:${port}/api/pharmarack/cart/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  items: [{
                    name: item.name,
                    qty: item.qty
                  }]
                })
              }).catch(e => console.error('Failed to auto-add to Pharmarack cart:', e));
            } catch (e) {
              console.error('Fetch post error:', e);
            }
          }
          
          await db.run(
            `UPDATE patient_refills 
             SET hold_for_stock = 1, is_ready = 0, ordering_triggered = 1 
             WHERE id = ?`,
            [refill.id]
          );

          outOfStockRefills.push({
            ...refill,
            outOfStockItems
          });
        }
      }
    }
  }

  if (outOfStockRefills.length > 0) {
    let reportMessage = `📋 PENDING REFILLS OF THE WEEK (OUT OF STOCK):\n\n`;
    outOfStockRefills.forEach((refill, index) => {
      const itemsStr = refill.outOfStockItems.map((i: any) => `${i.name} (Qty: ${i.qty})`).join(', ');
      reportMessage += `${index + 1}. Patient: ${refill.patient_name} (${refill.patient_phone})\n   Medications: ${itemsStr}\n   Next Refill Due: ${refill.next_refill_date}\n\n`;
    });
    reportMessage += `Please purchase/add stock for these medicines to trigger patient reminders automatically.`;

    try {
      await telegramBotService.sendDefaultNotification(reportMessage);
    } catch (err) {
      console.error('Failed to send daily out-of-stock refills report to Telegram:', err);
    }
  }

  // Ensure reorder_level on inventory items for refill medicines is high enough
  try {
    const allActiveRefills = await db.all(
      `SELECT * FROM patient_refills WHERE is_active = 1`
    );
    for (const ref of allActiveRefills) {
      let items = [];
      if (ref.items_json) {
        try {
          items = JSON.parse(ref.items_json);
        } catch (_) {}
      }
      if (items.length === 0) {
        items = [{ medicine_id: ref.medicine_id, qty: ref.last_qty_dispensed || 10 }];
      }

      for (const item of items) {
        const minReorder = Math.max(item.qty || 10, 10);
        await db.run(
          `UPDATE inventory_master SET reorder_level = MAX(reorder_level, ?) WHERE medicine_id = ?`,
          [minReorder, item.medicine_id]
        );
      }
    }
  } catch (err) {
    console.error('Failed to update reorder levels for refill medicines:', err);
  }
}

async function createQuickBillForRefill(db: any, refill: any): Promise<number> {
  const invoice_no = `H-REF-${Date.now()}`;
  const temp_label = `Refill - ${refill.patient_name}`;
  
  let items = [];
  if (refill.items_json) {
    try {
      items = JSON.parse(refill.items_json);
    } catch (_) {}
  }
  if (items.length === 0) {
    items = [{
      medicine_id: refill.medicine_id,
      qty: refill.last_qty_dispensed || 10
    }];
  }

  const cartItems = [];
  for (const item of items) {
    const med = await db.get('SELECT name, mrp FROM medicines WHERE id = ?', [item.medicine_id]);
    const mrp = med ? (med.mrp || 100) : 100;
    const name = med ? med.name : `Medicine ${item.medicine_id}`;
    cartItems.push({
      id: item.medicine_id,
      medicine_name: name,
      qty: item.qty || 10,
      unit_price: mrp,
      discount_per: 0
    });
  }
  
  const cart_data = JSON.stringify(cartItems);
  const dataBlob = JSON.stringify({
    items: cartItems,
    patient: { name: refill.patient_name, phone: refill.patient_phone },
    discount: 0,
    date: new Date().toLocaleString(),
    remarks: 'AUTO_REFILL_BILL'
  });

  const billResult = await db.run(
    `INSERT INTO held_bills (invoice_no, temp_label, patient_name, patient_phone, remarks, cart_data, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [invoice_no, temp_label, refill.patient_name, refill.patient_phone, 'AUTO_REFILL_BILL', cart_data, dataBlob]
  );
  
  const medNamesStr = cartItems.map(c => `${c.medicine_name} (Qty: ${c.qty})`).join(', ');
  const msg = `Hi ${refill.patient_name}, your refill for ${medNamesStr} is in stock and ready. You may collect your medicine anytime from XYZ Pharmacy.`;
  await db.run(
    `INSERT INTO automation_notifications (type, recipient_name, recipient_phone, message, status, needs_confirmation, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['refill_collection', refill.patient_name, refill.patient_phone, msg, 'staged', 1, String(refill.id)]
  );

  return billResult.lastID;
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
     LEFT JOIN medicines m ON pr.medicine_id = m.id
     WHERE pr.status = 'pending' AND (pr.hold_for_stock = 1 OR pr.is_ready = 0) AND pr.is_active = 1`
  );

  for (const refill of pendingRefills) {
    let items = [];
    if (refill.items_json) {
      try {
        items = JSON.parse(refill.items_json);
      } catch (_) {}
    }
    if (items.length === 0) {
      items = [{ medicine_id: refill.medicine_id, qty: refill.last_qty_dispensed || 10 }];
    }

    const hasMed = items.some((it: any) => it.medicine_id === medicineId);
    if (!hasMed) continue;

    // Check stock for all items
    let allInStock = true;
    for (const item of items) {
      const sRow = await db.get(
        'SELECT SUM(quantity) as total_qty FROM inventory_master WHERE medicine_id = ?',
        [item.medicine_id]
      );
      const totalQty = sRow ? (sRow.total_qty || 0) : 0;
      if (totalQty <= 0) {
        allInStock = false;
        break;
      }
    }

    if (allInStock) {
      let quickBillId = refill.quick_bill_id;
      if (!quickBillId) {
        quickBillId = await createQuickBillForRefill(db, refill);
      }
      await db.run(
        "UPDATE patient_refills SET is_ready = 1, hold_for_stock = 0, quick_bill_id = ? WHERE id = ?",
        [quickBillId, refill.id]
      );
    }
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

