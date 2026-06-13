import express from 'express';
import { dbManager } from '../database/connection.js';
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
      notified INTEGER DEFAULT 0,
      pharmarack_distributor TEXT,
      pharmarack_rate REAL,
      pharmarack_mrp REAL,
      pharmarack_mapped INTEGER DEFAULT 0,
      pharmarack_scheme TEXT
    )
  `);
  // Try adding columns if they do not exist
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN phone TEXT');
  } catch (_) {}
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN notified INTEGER DEFAULT 0');
  } catch (_) {}
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN pharmarack_distributor TEXT');
  } catch (_) {}
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN pharmarack_rate REAL');
  } catch (_) {}
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN pharmarack_mrp REAL');
  } catch (_) {}
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN pharmarack_mapped INTEGER DEFAULT 0');
  } catch (_) {}
  try {
    await db.exec('ALTER TABLE special_orders ADD COLUMN pharmarack_scheme TEXT');
  } catch (_) {}
}

// List special requests / orders
router.get('/', async (_req, res) => {
  try {
    const db = await dbManager.getConnection();
    await initOrdersTable(db);
    const orders = await db.all('SELECT * FROM special_orders ORDER BY date DESC');
        res.json(orders);
  } catch (err) {
    console.error('Orders fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Log a new request / order
router.post('/', async (req, res) => {
  const { 
    product, requester, phone, qty, priority, status,
    pharmarack_distributor, pharmarack_rate, pharmarack_mrp, pharmarack_mapped,
    pharmarack_scheme
  } = req.body;
  if (!product) {
    return res.status(400).json({ error: 'Product name is required' });
  }
  try {
    const db = await dbManager.getConnection();
    await initOrdersTable(db);
    await db.run(
      `INSERT INTO special_orders (
        product, requester, phone, qty, priority, status,
        pharmarack_distributor, pharmarack_rate, pharmarack_mrp, pharmarack_mapped,
        pharmarack_scheme
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product, 
        requester || 'Anonymous', 
        phone || '', 
        qty || 1, 
        priority || 'Normal', 
        status || 'Pending',
        pharmarack_distributor || null,
        pharmarack_rate !== undefined ? pharmarack_rate : null,
        pharmarack_mrp !== undefined ? pharmarack_mrp : null,
        pharmarack_mapped ? 1 : 0,
        pharmarack_scheme || null
      ]
    );
    
    // Auto send confirmation message to customer via WhatsApp
    if (phone) {
      try {
        const cleanPhone = phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

        let medicalName = 'XYZ MEDICAL';
        const dbConf = await dbManager.getConnection();
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
          const dbAlert = await dbManager.getConnection();
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
    const db = await dbManager.getConnection();
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

        res.json(alertedOrders);
  } catch (err) {
    console.error('Fetch uncollected alerts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status/details
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    status, priority, qty, product, requester, phone,
    pharmarack_distributor, pharmarack_rate, pharmarack_mrp, pharmarack_mapped
  } = req.body;
  try {
    const db = await dbManager.getConnection();
    await initOrdersTable(db);
    
    const existing = await db.get('SELECT * FROM special_orders WHERE id = ?', id);
    if (!existing) {
            return res.status(404).json({ error: 'Order not found' });
    }

    const newStatus = status !== undefined ? status : existing.status;
    const newPriority = priority !== undefined ? priority : existing.priority;
    const newQty = qty !== undefined ? qty : existing.qty;
    const newProduct = product !== undefined ? product : existing.product;
    const newRequester = requester !== undefined ? requester : existing.requester;
    const newPhone = phone !== undefined ? phone : existing.phone;
    const newDistributor = pharmarack_distributor !== undefined ? pharmarack_distributor : existing.pharmarack_distributor;
    const newRate = pharmarack_rate !== undefined ? pharmarack_rate : existing.pharmarack_rate;
    const newMrp = pharmarack_mrp !== undefined ? pharmarack_mrp : existing.pharmarack_mrp;
    const newMapped = pharmarack_mapped !== undefined ? (pharmarack_mapped ? 1 : 0) : existing.pharmarack_mapped;

    await db.run(
      `UPDATE special_orders 
       SET status = ?, priority = ?, qty = ?, product = ?, requester = ?, phone = ?,
           pharmarack_distributor = ?, pharmarack_rate = ?, pharmarack_mrp = ?, pharmarack_mapped = ?
       WHERE id = ?`,
      [newStatus, newPriority, newQty, newProduct, newRequester, newPhone, newDistributor, newRate, newMrp, newMapped, id]
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
    const db = await dbManager.getConnection();
    await initOrdersTable(db);
    
    const result = await db.run('DELETE FROM special_orders WHERE id = ?', id);
        
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
