import express from 'express';
import { dbManager } from '../database/connection.js';
import { sendMessage } from '../whatsappClient.js';

const router = express.Router();

// List all automation notifications
router.get('/notifications', async (req, res) => {
  const { type, status, search, limit = 100 } = req.query;
  let db;
  try {
    db = await dbManager.getConnection();
    let query = 'SELECT * FROM automation_notifications WHERE 1=1';
    const params: any[] = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (recipient_name LIKE ? OR recipient_phone LIKE ? OR message LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit));

    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err: any) {
    console.error('Failed to fetch automation notifications:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// Retry sending a notification
router.post('/notifications/:id/retry', async (req, res) => {
  const { id } = req.params;
  let db;
  try {
    db = await dbManager.getConnection();
    const notification = await db.get('SELECT * FROM automation_notifications WHERE id = ?', [id]);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!notification.recipient_phone) {
      return res.status(400).json({ error: 'No recipient phone number stored for this notification' });
    }

    // Try sending WhatsApp message
    try {
      await sendMessage(notification.recipient_phone, undefined, notification.message);
      
      // Update DB status to 'sent'
      await db.run(
        'UPDATE automation_notifications SET status = "sent", error_message = NULL WHERE id = ?',
        [id]
      );
      res.json({ success: true, message: 'Message sent successfully' });
    } catch (sendErr: any) {
      const errMsg = sendErr.message || 'Unknown send error';
      await db.run(
        'UPDATE automation_notifications SET status = "failed", error_message = ? WHERE id = ?',
        [errMsg, id]
      );
      res.status(500).json({ error: 'Failed to send WhatsApp message: ' + errMsg });
    }
  } catch (err: any) {
    console.error('Failed to retry notification:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// Mark notification as sent manually
router.post('/notifications/:id/manual', async (req, res) => {
  const { id } = req.params;
  let db;
  try {
    db = await dbManager.getConnection();
    const result = await db.run(
      'UPDATE automation_notifications SET status = "sent_manually", error_message = NULL WHERE id = ?',
      [id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification marked as sent manually' });
  } catch (err: any) {
    console.error('Failed to mark manual status:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

export default router;
