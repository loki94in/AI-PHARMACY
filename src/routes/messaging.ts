// Messaging Hub API — talks to the WhatsApp worker via IPC/DB (no direct whatsappClient import)
import express from 'express';
import QRCode from 'qrcode';
import { eventService } from '../services/eventService.js';
import { dbManager } from '../database/connection.js';
import { workerSupervisor } from '../worker/workerSupervisor.js';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const router = express.Router();
let isLoginWindowActive = false;

function findChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null
  ].filter(Boolean) as string[];

  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── In-process WA status cache (populated via IPC from the WhatsApp worker) ──
// This cache is written by server.ts after workerSupervisor.start(); the route
// reads it so it never has to cross the process boundary per-request.
export const waStatusCache: { isReady: boolean; qrData: string | null } = {
  isReady: false,
  qrData: null,
};

// Get current WhatsApp authentication status and QR code
router.get('/qr', async (req, res) => {
  try {
    if (isLoginWindowActive) {
      return res.json({ isReady: false, qrUrl: null, message: 'Chrome login window is open. Scan the QR code in Chrome.' });
    }

    // Check if Business API is active (DB read — fast)
    const db = await dbManager.getConnection();
    const rows = await db.all(
      `SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)`,
      ['whatsapp_enabled', 'wa_business_enabled', 'whatsapp_preferred_system']
    );
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;

    const waBusinessEnabled = map['wa_business_enabled'] === 'true';
    const whatsappEnabled = map['whatsapp_enabled'] === 'true';
    const preferred = map['whatsapp_preferred_system'] || 'automated';

    const useBusiness =
      (waBusinessEnabled && !whatsappEnabled) ||
      (waBusinessEnabled && whatsappEnabled && preferred === 'official');

    if (useBusiness) {
      return res.json({ isReady: true, qrUrl: null, message: 'WhatsApp Business API is active.' });
    }

    if (waStatusCache.isReady) {
      return res.json({ isReady: true, qrUrl: null });
    }

    if (waStatusCache.qrData) {
      const qrUrl = await QRCode.toDataURL(waStatusCache.qrData);
      return res.json({ isReady: false, qrUrl });
    }

    // Worker is still initialising — tell it to try again
    workerSupervisor.sendToWorker('whatsapp', { type: 'WA_CMD', cmd: 'reinit' });
    res.json({ isReady: false, qrUrl: null, message: 'Initializing WhatsApp client. Waiting for QR...' });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Launch non-headless login window for WhatsApp Web
router.post('/login-window', async (req, res) => {
  const chromePath = findChromePath();
  if (!chromePath) {
    return res.status(404).json({ error: 'Google Chrome was not found on your system. Please install Google Chrome to use this feature.' });
  }

  if (isLoginWindowActive) {
    return res.json({ success: true, message: 'Chrome login window is already open.' });
  }

  isLoginWindowActive = true;
  res.json({ success: true, message: 'Opening WhatsApp login window...' });

  (async () => {
    let browser;
    try {
      // Tell the worker to release the session folder locks before Chrome opens
      workerSupervisor.sendToWorker('whatsapp', { type: 'WA_CMD', cmd: 'destroy' });

      // Give OS 2.5 s to release file locks on the profile directory
      await new Promise(resolve => setTimeout(resolve, 2500));

      console.log('[WhatsApp] Launching Chrome for WhatsApp login from:', chromePath);
      const authPath = path.resolve(process.cwd(), '.wwebjs_auth', 'session');
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'],
        userDataDir: authPath
      });

      const [page] = await browser.pages();
      await page.goto('https://web.whatsapp.com/', { waitUntil: 'networkidle2' });

      // Poll for login or user closure (up to 10 minutes)
      for (let i = 0; i < 600; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const isClosed = !browser.connected || (await browser.pages().catch(() => [])).length === 0;
        if (isClosed) {
          console.log('[WhatsApp] Login window closed by user.');
          break;
        }

        const isLoggedIn = await page.evaluate(() => {
          return !!(
            document.querySelector('[data-testid="chat-list"]') ||
            document.querySelector('#pane-side') ||
            document.querySelector('[data-icon="chat"]')
          );
        }).catch(() => false);

        if (isLoggedIn) {
          console.log('[WhatsApp] Login detected in Chrome popup!');
          await new Promise(resolve => setTimeout(resolve, 3000));
          break;
        }
      }
    } catch (err: any) {
      console.error('[WhatsApp] Error in Chrome login window:', err);
      try {
        eventService.broadcast('auth_failure', {
          message: `Failed to open WhatsApp login window: ${err.message || err}. Ensure Chrome is installed and not already open in another process.`
        });
      } catch (broadcastErr) {
        console.error('[WhatsApp] Failed to broadcast auth failure:', broadcastErr);
      }
    } finally {
      isLoginWindowActive = false;
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
      // Tell the worker to re-initialise now that Chrome has released the session
      console.log('[WhatsApp] Signalling worker to re-initialize client...');
      workerSupervisor.sendToWorker('whatsapp', { type: 'WA_CMD', cmd: 'reinit' });
    }
  })();
});

// Force reconnect and clear session
router.post('/reconnect', async (req, res) => {
  try {
    workerSupervisor.sendToWorker('whatsapp', { type: 'WA_CMD', cmd: 'reconnect' });
    res.json({ success: true, message: 'Reconnect signal sent to WhatsApp worker.' });
  } catch (err) {
    console.error('Reconnect error:', err);
    res.status(500).json({ error: 'Failed to send reconnect signal' });
  }
});

// Send a WhatsApp message via the hub — writes to pending_whatsapp_jobs (worker delivers it)
router.post('/send', async (req, res) => {
  const { number, message, file } = req.body;
  if (!number || (!message && !file)) {
    return res.status(400).json({ error: 'number and either message or file are required' });
  }
  try {
    // Check if Business API should handle this
    const db = await dbManager.getConnection();
    const rows = await db.all(
      `SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)`,
      ['whatsapp_enabled', 'wa_business_enabled', 'whatsapp_preferred_system']
    );
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;

    const useBusiness =
      (map['wa_business_enabled'] === 'true' && map['whatsapp_enabled'] !== 'true') ||
      (map['wa_business_enabled'] === 'true' && map['whatsapp_preferred_system'] === 'official');

    if (useBusiness) {
      const { whatsappBusinessService } = await import('../services/whatsappBusinessService.js');
      if (file && file.mimetype && file.data) {
        const { config: appConfig } = await import('../config/index.js');
        if (!fs.existsSync(appConfig.tempDir)) fs.mkdirSync(appConfig.tempDir, { recursive: true });
        const tempFilePath = path.join(appConfig.tempDir, `wa_temp_${Date.now()}_${file.filename || 'document.pdf'}`);
        fs.writeFileSync(tempFilePath, Buffer.from(file.data, 'base64'));
        try {
          const result = await whatsappBusinessService.sendDocument(number, tempFilePath, message, file.filename);
          if (!result.success) throw new Error(result.error || 'Business API send failed');
        } finally {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        }
      } else {
        const result = await whatsappBusinessService.sendTextMessage(number, message ?? '');
        if (!result.success) throw new Error(result.error || 'Business API send failed');
      }
      return res.json({ success: true, message: 'WhatsApp message sent via Business API' });
    }

    // WA Web path — enqueue for the worker
    await db.run(
      `INSERT INTO pending_whatsapp_jobs (invoice_id, recipient_phone, pdf_path, caption) VALUES (?, ?, ?, ?)`,
      [null, number, null, message ?? '']
    );
    res.json({ success: true, message: 'Message queued for WhatsApp Web worker delivery.' });
  } catch (err: any) {
    console.error('Messaging hub send error:', err);
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// Get all WhatsApp chats — reads from local SQLite cache (populated by the worker)
router.get('/chats', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(
      `SELECT id, name, unread_count as unreadCount, timestamp, is_group as isGroup, last_message as lastMessage
       FROM whatsapp_chats
       ORDER BY timestamp DESC`
    );
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching chats:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch chats' });
  }
});

// Get messages for a specific chat — reads from local SQLite cache
router.get('/chats/:id/messages', async (req, res) => {
  try {
    let cleanId = String(req.params.id);
    if (!cleanId.includes('@')) {
      let cleanPhone = cleanId.replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
      cleanId = `${cleanPhone}@c.us`;
    }
    const db = await dbManager.getConnection();
    const rows = await db.all(
      `SELECT id, body, from_me as fromMe, timestamp, type, has_media as hasMedia
       FROM whatsapp_messages
       WHERE chat_id = ?
       ORDER BY timestamp ASC
       LIMIT 200`,
      [cleanId]
    );
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch messages' });
  }
});

// Media fetch: routes to the worker via IPC with a correlation ID
router.get('/chats/:chatId/messages/:messageId/media', async (req, res) => {
  const { chatId, messageId } = req.params;
  const correlationId = `media_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const TIMEOUT_MS = 15000;

  let unsubscribe: (() => void) | null = null;
  const timer = setTimeout(() => {
    if (unsubscribe) unsubscribe();
    if (!res.headersSent) res.status(504).json({ error: 'Worker did not respond in time' });
  }, TIMEOUT_MS);

  unsubscribe = workerSupervisor.onWorkerMessage('whatsapp', (msg: any) => {
    if (msg?.type === 'WA_MEDIA_RESULT' && msg.correlationId === correlationId) {
      clearTimeout(timer);
      if (unsubscribe) unsubscribe();
      if (res.headersSent) return;
      if (msg.error) {
        res.status(500).json({ error: msg.error });
      } else {
        res.json(msg.media);
      }
    }
  });

  workerSupervisor.sendToWorker('whatsapp', {
    type: 'WA_CMD',
    cmd: 'getMedia',
    chatId,
    messageId,
    correlationId,
  });
});

export default router;
