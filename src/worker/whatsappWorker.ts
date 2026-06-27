/**
 * WhatsApp Worker — runs as a forked child process via WorkerSupervisor.
 *
 * Responsibilities:
 *  - Open its own SQLite connection (WAL + busy_timeout=5000).
 *  - Own the whatsapp-web.js Puppeteer client entirely.
 *  - Poll `pending_whatsapp_jobs` every 30 s and deliver queued messages.
 *  - IPC-broadcast QR and readiness state to the main process.
 *  - Accept IPC commands: PING (heartbeat), WA_CMD (reconnect / destroy).
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (db) return db;
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run('PRAGMA journal_mode = WAL');
  await db.run('PRAGMA busy_timeout = 5000');
  return db;
}

// ── IPC helpers ────────────────────────────────────────────────────────────

function sendStatus(isReady: boolean, qrData: string | null): void {
  try {
    process.send?.({ type: 'WA_STATUS', isReady, qrData });
  } catch (_) { /* parent may have closed */ }
}

function sendChatsUpdated(): void {
  try {
    process.send?.({ type: 'WA_CHATS_UPDATED' });
  } catch (_) {}
}

// ── WhatsApp client lifecycle ─────────────────────────────────────────────

// Lazy-import to keep the main process import graph clean.
async function importWA() {
  return import('../whatsappClient.js');
}

async function initializeClient(): Promise<void> {
  const { initClient, isReady: getIsReady } = await importWA();

  console.log('[WhatsApp Worker] Initializing WhatsApp client...');
  try {
    await initClient();
    // initClient resolves after the 'ready' event — broadcast success
    sendStatus(true, null);
    console.log('[WhatsApp Worker] Client ready.');
  } catch (err: any) {
    console.error('[WhatsApp Worker] initClient() failed:', err?.message || err);
    sendStatus(false, null);
  }
}

// ── Queue processing ──────────────────────────────────────────────────────

let isProcessing = false;

async function processQueue(): Promise<void> {
  if (isProcessing) return;

  const conn = await getDb();

  // Check automation and WhatsApp settings before doing any work
  const autoRow = await conn.get("SELECT value FROM app_settings WHERE key = 'automation_enabled'");
  if (!autoRow || autoRow.value !== 'true') return;

  const waRow = await conn.get("SELECT value FROM app_settings WHERE key = 'whatsapp_enabled'");
  if (!waRow || waRow.value !== 'true') return;

  const { isReady } = await importWA();
  if (!isReady) {
    console.log('[WhatsApp Worker] Client not ready — skipping queue poll.');
    return;
  }

  isProcessing = true;
  try {
    const jobs = await conn.all('SELECT * FROM pending_whatsapp_jobs ORDER BY created_at ASC');

    for (const job of jobs) {
      try {
        console.log(`[WhatsApp Worker] Sending invoice ${job.invoice_id} to ${job.recipient_phone}`);
        const { sendMessage } = await importWA();
        await sendMessage(job.recipient_phone, job.pdf_path, job.caption);
        await conn.run('DELETE FROM pending_whatsapp_jobs WHERE id = ?', [job.id]);
        console.log(`[WhatsApp Worker] Sent invoice ${job.invoice_id} successfully.`);
      } catch (jobErr: any) {
        console.error(`[WhatsApp Worker] Failed job ${job.id}:`, jobErr?.message || jobErr);
        if (job.retries >= 5) {
          console.error(`[WhatsApp Worker] Max retries reached for job ${job.id}. Dropping.`);
          await conn.run('DELETE FROM pending_whatsapp_jobs WHERE id = ?', [job.id]);
        } else {
          await conn.run('UPDATE pending_whatsapp_jobs SET retries = retries + 1 WHERE id = ?', [job.id]);
        }
      }
    }
  } catch (err: any) {
    console.error('[WhatsApp Worker] Error processing queue:', err?.message || err);
  } finally {
    isProcessing = false;
  }
}

// ── IPC command handler ───────────────────────────────────────────────────

async function handleCommand(msg: any): Promise<void> {
  const cmd = msg.cmd as string;
  const wa = await importWA();
  switch (cmd) {
    case 'reconnect':
      console.log('[WhatsApp Worker] Received reconnect command.');
      await wa.forceReconnect().catch(err =>
        console.error('[WhatsApp Worker] forceReconnect error:', err)
      );
      break;
    case 'destroy':
      console.log('[WhatsApp Worker] Received destroy command.');
      await wa.destroyClient().catch(err =>
        console.error('[WhatsApp Worker] destroyClient error:', err)
      );
      sendStatus(false, null);
      break;
    case 'reinit':
      console.log('[WhatsApp Worker] Received reinit command.');
      await initializeClient();
      break;
    case 'getMedia': {
      const { chatId, messageId, correlationId } = msg;
      try {
        const media = await wa.getMessageMedia(chatId, messageId);
        process.send?.({ type: 'WA_MEDIA_RESULT', correlationId, media });
      } catch (err: any) {
        process.send?.({ type: 'WA_MEDIA_RESULT', correlationId, error: err?.message || String(err) });
      }
      break;
    }
    default:
      console.warn('[WhatsApp Worker] Unknown WA_CMD:', cmd);
  }
}

// ── Main entry ───────────────────────────────────────────────────────────

export async function startWhatsappWorker(): Promise<void> {
  console.log('[WhatsApp Worker] Starting. DB:', DB_PATH);
  await getDb(); // open and validate connection

  // Monkey-patch eventService broadcasts so they forward over IPC to main process.
  // The worker writes to the DB; the main process reads its own eventService for SSE.
  // This avoids importing the server-side SSE emitter in the worker.
  const { eventService } = await import('../services/eventService.js');
  const originalBroadcast = eventService.broadcast.bind(eventService);
  eventService.broadcast = (event: string, data: any) => {
    try {
      process.send?.({ type: 'WA_EVENT', event, data });
    } catch (_) {}
    // Also run locally in case something in the worker process listens
    originalBroadcast(event, data);
  };

  // Watch for QR codes emitted during client init by patching the module state.
  // We poll the exported `currentQr` variable every 2 s to catch QR updates.
  let lastQrSent: string | null = null;
  const qrPoller = setInterval(async () => {
    try {
      const { currentQr, isReady } = await importWA();
      const qrChanged = currentQr !== lastQrSent;
      if (qrChanged) {
        lastQrSent = currentQr;
        sendStatus(isReady, currentQr);
      }
    } catch (_) {}
  }, 2000);

  // Start client initialization (non-blocking — will emit PONG regardless)
  initializeClient().catch(err =>
    console.error('[WhatsApp Worker] initializeClient error:', err)
  );

  // Queue poll every 30 seconds
  const queuePoller = setInterval(() => {
    processQueue().catch(err =>
      console.error('[WhatsApp Worker] processQueue error:', err)
    );
  }, 30000);

  // IPC message handler
  process.on('message', async (msg: any) => {
    if (!msg) return;
    if (msg.type === 'PING') {
      process.send?.({ type: 'PONG' });
    } else if (msg.type === 'WA_CMD') {
      await handleCommand(msg).catch(err =>
        console.error('[WhatsApp Worker] handleCommand error:', err)
      );
    }
  });

  process.on('disconnect', () => {
    clearInterval(qrPoller);
    clearInterval(queuePoller);
    console.log('[WhatsApp Worker] Parent disconnected. Exiting.');
    process.exit(0);
  });

  console.log('[WhatsApp Worker] Running. Queue poll every 30s.');
}
