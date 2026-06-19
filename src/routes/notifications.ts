import express from 'express';
import { eventService } from '../services/eventService.js';
import { dbManager } from '../database/connection.js';
import QRCode from 'qrcode';
import os from 'os';

const router = express.Router();

// Get server connection info (IPs, Port, pre-generated QR code) for mobile app setup
router.get('/notifications/connection-info', async (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const interfaceName of Object.keys(interfaces)) {
      const addresses = interfaces[interfaceName];
      if (addresses) {
        for (const addr of addresses) {
          if (addr.family === 'IPv4' && !addr.internal) {
            ips.push(addr.address);
          }
        }
      }
    }

    const port = process.env.PORT || 3000;
    const serverUrls = ips.map(ip => `http://${ip}:${port}`);

    // If no external IPs found, fall back to localhost
    if (serverUrls.length === 0) {
      serverUrls.push(`http://localhost:${port}`);
    }

    const qrData = JSON.stringify({ serverUrls });
    // Generate QR code data URL (base64 image)
    const qrCodeUrl = await QRCode.toDataURL(qrData, { width: 250, margin: 1 });

    res.json({
      success: true,
      ips,
      port,
      serverUrls,
      qrCodeUrl
    });
  } catch (err: any) {
    console.error('Failed to generate connection info:', err);
    res.status(500).json({ error: 'Failed to generate connection info: ' + err.message });
  }
});

// Real-time notifications SSE Stream
router.get('/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const listener = (eventData: any) => {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  eventService.on('server_event', listener);

  req.on('close', () => {
    eventService.removeListener('server_event', listener);
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to notifications stream' })}\n\n`);
});

// Memory cache of online/offline status of devices to detect status changes
const deviceOnlineStateCache = new Map<string, number>();

// Register push notification token from mobile device
router.post('/notifications/register-token', async (req, res) => {
  const { token, deviceName, os } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const db = await dbManager.getConnection();
    const devName = deviceName || 'Unknown';
    const devOs = os || 'Unknown';

    // Check if token was previously offline in cache (or not cached yet)
    const isNewOrOffline = !deviceOnlineStateCache.has(token) || deviceOnlineStateCache.get(token) === 0;

    await db.run(
      'INSERT OR REPLACE INTO push_tokens (token, device_name, os, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [token, devName, devOs]
    );

    if (isNewOrOffline) {
      deviceOnlineStateCache.set(token, 1);
      // Log to database
      await db.run(
        'INSERT INTO device_connection_logs (token, device_name, os, status) VALUES (?, ?, ?, ?)',
        [token, devName, devOs, 'connected']
      );
      // Emit real-time SSE stream events
      eventService.emit('server_event', {
        type: 'notification',
        message: `Mobile device "${devName}" connected successfully!`,
        payload: {
          type: 'success',
          message: `Mobile device "${devName}" connected successfully!`,
          link: '/device-logs'
        }
      });
      eventService.emit('server_event', {
        type: 'device_status_change',
        payload: { token, device_name: devName, os: devOs, status: 'connected', timestamp: new Date().toISOString() }
      });
    } else {
      // Just update cache/last seen
      deviceOnlineStateCache.set(token, 1);
    }

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (err: any) {
    console.error('Failed to register push token:', err);
    res.status(500).json({ error: 'Failed to register token: ' + err.message });
  }
});

// Get all registered devices and check if they are currently online
router.get('/notifications/devices', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    // Deduplicate: for each (device_name, os) pair keep only the most-recently-seen row
    // A device offline = no last_seen update in 40 seconds (mobile pings every 15s)
    const rows = await db.all(`
      SELECT 
        token, 
        device_name, 
        os, 
        created_at,
        last_seen,
        CASE 
          WHEN last_seen IS NOT NULL AND (strftime('%s', 'now') - strftime('%s', last_seen) < 40) THEN 1 
          ELSE 0 
        END as is_online,
        CASE
          WHEN last_seen IS NULL THEN 999999
          ELSE (strftime('%s', 'now') - strftime('%s', last_seen))
        END as offline_seconds
      FROM push_tokens
      WHERE rowid IN (
        SELECT rowid FROM push_tokens p2
        WHERE p2.device_name = push_tokens.device_name AND p2.os = push_tokens.os
        ORDER BY last_seen DESC NULLS LAST
        LIMIT 1
      )
      ORDER BY last_seen DESC
    `);
    res.json({ success: true, devices: rows });
  } catch (err: any) {
    console.error('Failed to get registered devices:', err);
    res.status(500).json({ error: 'Failed to get devices: ' + err.message });
  }
});

// Rename a registered device
router.patch('/notifications/devices/:token/rename', async (req, res) => {
  const { token } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const db = await dbManager.getConnection();
    await db.run('UPDATE push_tokens SET device_name = ? WHERE token = ?', [name.trim(), token]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to rename device:', err);
    res.status(500).json({ error: 'Failed to rename device: ' + err.message });
  }
});

// Manual refill reminder endpoint
router.post('/patients/send-refill', async (req, res) => {
  const { whatsapp_number, name } = req.body;
  if (!whatsapp_number) {
    return res.status(400).json({ error: 'WhatsApp number required' });
  }
  try {
    // Simple reminder text – can be templated later
    const message = `Hello ${name || ''}, your medication refill is due soon. Please visit the pharmacy.`;
    // This would use a notification/WhatsApp service
    res.json({ success: true, message: 'Reminder sent (placeholder)' });
  } catch (err) {
    console.error('WhatsApp send error:', err);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// Get device activity logs
router.get('/notifications/devices/logs', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all('SELECT * FROM device_connection_logs ORDER BY timestamp DESC LIMIT 150');
    res.json({ success: true, logs: rows });
  } catch (err: any) {
    console.error('Failed to fetch device logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs: ' + err.message });
  }
});

// Clear device activity logs
router.post('/notifications/devices/logs/clear', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    await db.run('DELETE FROM device_connection_logs');
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (err: any) {
    console.error('Failed to clear device logs:', err);
    res.status(500).json({ error: 'Failed to clear logs: ' + err.message });
  }
});

// Background connection state checking
async function checkDeviceConnections() {
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(`
      SELECT 
        token, 
        device_name, 
        os, 
        CASE 
          WHEN last_seen IS NOT NULL AND (strftime('%s', 'now') - strftime('%s', last_seen) < 40) THEN 1 
          ELSE 0 
        END as is_online
      FROM push_tokens
      WHERE rowid IN (
        SELECT rowid FROM push_tokens p2
        WHERE p2.device_name = push_tokens.device_name AND p2.os = push_tokens.os
        ORDER BY last_seen DESC NULLS LAST
        LIMIT 1
      )
    `);

    for (const row of rows) {
      const { token, device_name, os, is_online } = row;
      const cached = deviceOnlineStateCache.get(token);

      if (cached !== undefined) {
        if (cached === 0 && is_online === 1) {
          deviceOnlineStateCache.set(token, 1);
          await db.run(
            'INSERT INTO device_connection_logs (token, device_name, os, status) VALUES (?, ?, ?, ?)',
            [token, device_name, os, 'connected']
          );
          eventService.emit('server_event', {
            type: 'notification',
            message: `Mobile device "${device_name}" connected successfully!`,
            payload: {
              type: 'success',
              message: `Mobile device "${device_name}" connected successfully!`,
              link: '/device-logs'
            }
          });
          eventService.emit('server_event', {
            type: 'device_status_change',
            payload: { token, device_name, os, status: 'connected', timestamp: new Date().toISOString() }
          });
        } else if (cached === 1 && is_online === 0) {
          deviceOnlineStateCache.set(token, 0);
          await db.run(
            'INSERT INTO device_connection_logs (token, device_name, os, status) VALUES (?, ?, ?, ?)',
            [token, device_name, os, 'disconnected']
          );
          eventService.emit('server_event', {
            type: 'notification',
            message: `Mobile device "${device_name}" disconnected.`,
            payload: {
              type: 'error',
              message: `Mobile device "${device_name}" disconnected.`,
              link: '/device-logs'
            }
          });
          eventService.emit('server_event', {
            type: 'device_status_change',
            payload: { token, device_name, os, status: 'disconnected', timestamp: new Date().toISOString() }
          });
        }
      } else {
        deviceOnlineStateCache.set(token, is_online);
      }
    }
  } catch (err) {
    console.error('Error during periodic device monitoring:', err);
  }
}

// Check connections status every 10 seconds
setInterval(checkDeviceConnections, 10000);

export default router;
