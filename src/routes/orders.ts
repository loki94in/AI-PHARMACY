import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendMessage } from '../whatsappClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

async function initOrdersTable(db: any) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS special_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product TEXT,
      requester TEXT,
      phone TEXT,
      qty INTEGER,
      priority TEXT,
      status TEXT DEFAULT 'Pending',
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      notified INTEGER DEFAULT 0
    )
  `);
  // Try adding phone and notified columns if they do not exist
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN phone TEXT');
  } catch (_) {}
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN notified INTEGER DEFAULT 0');
  } catch (_) {}
}

// List special requests / orders
router.get('/', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await initOrdersTable(db);
    const orders = await db.all('SELECT * FROM special_orders ORDER BY date DESC');
    await db.close();
    res.json(orders);
  } catch (err) {
    console.error('Orders fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Log a new request / order
router.post('/', async (req, res) => {
  const { product, requester, phone, qty, priority, status } = req.body;
  if (!product) {
    return res.status(400).json({ error: 'Product name is required' });
  }
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await initOrdersTable(db);
    await db.run(
      'INSERT INTO special_orders (product, requester, phone, qty, priority, status) VALUES (?, ?, ?, ?, ?, ?)',
      [product, requester || 'Anonymous', phone || '', qty || 1, priority || 'Normal', status || 'Pending']
    );
    await db.close();

    // Auto send confirmation message to customer via WhatsApp
    if (phone) {
      try {
        const cleanPhone = phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

        let medicalName = 'XYZ MEDICAL';
        const dbConf = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const nameRow = await dbConf.get("SELECT value FROM app_settings WHERE key = 'medical_name'");
        await dbConf.close();
        if (nameRow && nameRow.value) {
          medicalName = nameRow.value;
        }

        const msg = `Hi ${requester || 'Customer'}, your special order for ${product} (Qty: ${qty}) has been taken in ${medicalName}. We will notify you when it is ready.`;
        await sendMessage(formattedPhone, undefined, msg);
        console.log(`Special order confirmation WhatsApp sent to ${requester}`);
      } catch (wsError: any) {
        console.error(`Failed to send special order confirmation WhatsApp to ${requester}:`, wsError);
        try {
          const dbAlert = await open({ filename: DB_PATH, driver: sqlite3.Database });
          await dbAlert.run(
            "INSERT INTO action_logs (action_type, description) VALUES (?, ?)",
            'AUTOMATION_ALERT',
            `❌ WhatsApp Alert Failure: Failed to send special order confirmation to ${requester} (${phone}). Error: ${wsError.message || 'Unknown error'}`
          );
          await dbAlert.close();
        } catch (_) {}
      }
    }

    res.json({ success: true, message: 'Request logged successfully' });
  } catch (err) {
    console.error('Create order request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to fetch uncollected orders (not collected for 2-3 days) and send auto reminders
router.get('/uncollected-alerts', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await initOrdersTable(db);
    
    // Fetch orders ready or pending collection that are 2 days or older (2-3 days ago) and not collected
    // SQLite: datetime('now', '-2 days')
    const uncollected = await db.all(
      `SELECT * FROM special_orders 
       WHERE status IN ('Pending', 'Ready', 'Ordered', 'Pending Collection') 
       AND datetime(date) <= datetime('now', '-2 days')`
    );

    const alertedOrders = [];

    for (const order of uncollected) {
      if (order.phone && order.notified === 0) {
        try {
          const cleanPhone = order.phone.replace(/\D/g, '');
          const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
          const msg = `Hi ${order.requester || 'Customer'}, your special order for ${order.product} (Qty: ${order.qty}) is ready for collection at AI Pharmacy. Please visit us to collect it.`;
          
          await sendMessage(formattedPhone, undefined, msg);
          
          // Mark as notified in database
          await db.run('UPDATE special_orders SET notified = 1 WHERE id = ?', [order.id]);
          order.notified = 1;
          alertedOrders.push({ ...order, autoWhatsAppSent: true });
        } catch (wsError: any) {
          console.error(`Failed to send auto collection reminder to ${order.requester}:`, wsError);
          alertedOrders.push({ ...order, autoWhatsAppSent: false, error: 'WhatsApp failed' });
          await db.run(
            "INSERT INTO action_logs (action_type, description) VALUES (?, ?)",
            'AUTOMATION_ALERT',
            `❌ WhatsApp Alert Failure: Failed to send collection reminder to ${order.requester} (${order.phone}). Error: ${wsError.message || 'Unknown error'}`
          );
        }
      } else {
        alertedOrders.push({ ...order, autoWhatsAppSent: false });
      }
    }

    await db.close();
    res.json(alertedOrders);
  } catch (err) {
    console.error('Fetch uncollected alerts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status/details
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, priority, qty, product, requester, phone } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await initOrdersTable(db);
    
    const existing = await db.get('SELECT * FROM special_orders WHERE id = ?', id);
    if (!existing) {
      await db.close();
      return res.status(404).json({ error: 'Order not found' });
    }

    const newStatus = status !== undefined ? status : existing.status;
    const newPriority = priority !== undefined ? priority : existing.priority;
    const newQty = qty !== undefined ? qty : existing.qty;
    const newProduct = product !== undefined ? product : existing.product;
    const newRequester = requester !== undefined ? requester : existing.requester;
    const newPhone = phone !== undefined ? phone : existing.phone;

    await db.run(
      `UPDATE special_orders 
       SET status = ?, priority = ?, qty = ?, product = ?, requester = ?, phone = ? 
       WHERE id = ?`,
      [newStatus, newPriority, newQty, newProduct, newRequester, newPhone, id]
    );

    // If status changes to 'Ready' and the customer wasn't notified, auto send WhatsApp
    if (newStatus === 'Ready' && existing.status !== 'Ready' && newPhone) {
      try {
        const cleanPhone = newPhone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        const msg = `Hi ${newRequester || 'Customer'}, your special order for ${newProduct} (Qty: ${newQty}) is now READY for collection. Please visit us to collect it.`;
        await sendMessage(formattedPhone, undefined, msg);
        await db.run('UPDATE special_orders SET notified = 1 WHERE id = ?', [id]);
      } catch (wsError: any) {
        console.error(`Failed to send status update WhatsApp to ${newRequester}:`, wsError);
        await db.run(
          "INSERT INTO action_logs (action_type, description) VALUES (?, ?)",
          'AUTOMATION_ALERT',
          `❌ WhatsApp Alert Failure: Failed to send "Ready" notification to ${newRequester} (${newPhone}). Error: ${wsError.message || 'Unknown error'}`
        );
      }
    }

    await db.close();
    res.json({ success: true, message: 'Order updated successfully' });
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete an order
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await initOrdersTable(db);
    
    const result = await db.run('DELETE FROM special_orders WHERE id = ?', id);
    await db.close();
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    console.error('Delete order error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
