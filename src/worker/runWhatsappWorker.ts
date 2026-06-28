import { eventService } from '../services/eventService.js';
import { initClient, destroyClient, forceReconnect, shouldRouteToBusiness, sendMessage } from '../whatsappClient.js';
import { dbManager } from '../database/connection.js';

// Forward all eventService events to the main process supervisor via IPC
eventService.on('server_event', ({ type, payload }: { type: string; payload: any }) => {
  switch (type) {
    case 'wa_qr':
      process.send?.({ type: 'WA_QR', qr: payload.qr });
      break;
    case 'wa_ready':
      process.send?.({ type: 'WA_READY' });
      break;
    case 'wa_disconnected':
      process.send?.({ type: 'WA_DISCONNECTED' });
      break;
    default:
      process.send?.({ type: 'WA_EVENT', event: type, data: payload });
  }
});

let isProcessingQueue = false;

async function pollQueue(): Promise<void> {
  if (isProcessingQueue) return;

  try {
    const db = await dbManager.getConnection();
    const autoRow = await db.get("SELECT value FROM app_settings WHERE key = 'automation_enabled'");
    if (!autoRow || autoRow.value !== 'true') return;

    const waRow = await db.get("SELECT value FROM app_settings WHERE key = 'whatsapp_enabled'");
    if (!waRow || waRow.value !== 'true') return;

    const useBusiness = await shouldRouteToBusiness();
    // Only process queue via web client here; Business API is handled in main process
    if (useBusiness) return;

    isProcessingQueue = true;
    try {
      const jobs = await db.all('SELECT * FROM pending_whatsapp_jobs ORDER BY created_at ASC');
      for (const job of jobs) {
        try {
          await sendMessage(job.recipient_phone, job.pdf_path ?? undefined, job.caption ?? undefined);
          await db.run('DELETE FROM pending_whatsapp_jobs WHERE id = ?', [job.id]);
          console.log(`[WhatsApp Worker] Sent job ${job.id} for invoice ${job.invoice_id}`);
        } catch (err) {
          console.error(`[WhatsApp Worker] Failed job ${job.id}:`, err);
          if (job.retries >= 5) {
            console.error(`[WhatsApp Worker] Max retries for job ${job.id}. Dropping.`);
            await db.run('DELETE FROM pending_whatsapp_jobs WHERE id = ?', [job.id]);
          } else {
            await db.run('UPDATE pending_whatsapp_jobs SET retries = retries + 1 WHERE id = ?', [job.id]);
          }
        }
      }
    } finally {
      isProcessingQueue = false;
    }
  } catch (err) {
    isProcessingQueue = false;
    console.error('[WhatsApp Worker] Queue poll error:', err);
  }
}

// IPC message handler
process.on('message', async (msg: any) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'PING':
      process.send?.({ type: 'PONG' });
      break;
    case 'WA_INIT':
      initClient().catch(err => {
        console.error('[WhatsApp Worker] Init failed:', err);
        process.send?.({ type: 'WA_EVENT', event: 'auth_failure', data: { message: String(err.message) } });
      });
      break;
    case 'WA_DESTROY':
      await destroyClient().catch(err => console.error('[WhatsApp Worker] Destroy failed:', err));
      break;
    case 'WA_RECONNECT':
      forceReconnect().catch(err => console.error('[WhatsApp Worker] Reconnect failed:', err));
      break;
    default:
      break;
  }
});

// Graceful exit if supervisor disconnects
process.on('disconnect', () => {
  console.log('[WhatsApp Worker] Supervisor disconnected. Exiting...');
  process.exit(0);
});

async function startup(): Promise<void> {
  console.log('[WhatsApp Worker] Starting up...');

  // Ensure WAL mode for concurrent main process reads
  const db = await dbManager.getConnection();
  await db.run('PRAGMA journal_mode=WAL');
  await db.run('PRAGMA busy_timeout=5000');

  // Auto-initialize if settings say enabled
  const autoRow = await db.get("SELECT value FROM app_settings WHERE key = 'automation_enabled'");
  const waRow = await db.get("SELECT value FROM app_settings WHERE key = 'whatsapp_enabled'");

  if (autoRow?.value === 'true' && waRow?.value === 'true') {
    const useBusiness = await shouldRouteToBusiness();
    if (!useBusiness) {
      console.log('[WhatsApp Worker] Auto-starting WhatsApp Web client...');
      initClient().catch(err => console.error('[WhatsApp Worker] Auto-start failed:', err));
    } else {
      console.log('[WhatsApp Worker] WhatsApp Business API preferred; skipping Web client init.');
    }
  }

  // Poll queue every 30 seconds
  setInterval(() => pollQueue().catch(console.error), 30000);
  console.log('[WhatsApp Worker] Queue polling started (30s interval).');
}

startup().catch(err => {
  console.error('[WhatsApp Worker] Fatal startup error:', err);
  process.exit(1);
});
