import http from 'http';
import { randomUUID } from 'crypto';
import { dbManager } from '../database/connection.js';
import {
  deserializeAimail,
  verifyChecksum,
  AIMAIL_SCHEMA_VERSION,
} from '../utils/aimailFormat.js';

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_SYNC_PORT = 3030;
const MAX_RETRIES = 5;
const PEER_TIMEOUT_MS = 10_000;

let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const db = await dbManager.getConnection();
  const row = await db.get(`SELECT value FROM app_settings WHERE key = 'sync_device_id'`);
  if (row?.value) {
    cachedDeviceId = row.value as string;
  } else {
    cachedDeviceId = randomUUID();
    await db.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_device_id', ?)`,
      [cachedDeviceId]
    );
  }
  return cachedDeviceId!;
}

async function getSyncPort(): Promise<number> {
  const db = await dbManager.getConnection();
  const row = await db.get(`SELECT value FROM app_settings WHERE key = 'sync_port'`);
  const port = parseInt(row?.value ?? '', 10);
  return isNaN(port) ? DEFAULT_SYNC_PORT : port;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleReceive(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const doc = deserializeAimail(body);
    if (!verifyChecksum(doc)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Checksum verification failed' }));
      return;
    }
    const db = await dbManager.getConnection();
    await db.run(
      `INSERT OR IGNORE INTO sync_jobs
         (job_id, entity_type, entity_id, payload, checksum, transfer_version, direction, status)
       VALUES (?, 'email', ?, ?, ?, ?, 'inbound', 'received')`,
      [randomUUID(), doc.id, body, doc.checksum, doc.transfer_version]
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err: any) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err?.message ?? err) }));
  }
}

function startHttpServer(port: number, myDeviceId: string): void {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ device_id: myDeviceId, schema_version: AIMAIL_SCHEMA_VERSION }));
        return;
      }
      if (req.method === 'POST' && req.url === '/receive') {
        await handleReceive(req, res);
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (err) {
      console.error('[Sync Worker] Unhandled HTTP error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    }
  });

  server.listen(port, () => {
    console.log(`[Sync Worker] HTTP server listening on port ${port}`);
  });

  server.on('error', (err) => {
    console.error('[Sync Worker] HTTP server error:', err);
  });
}

function postToPeer(ip: string, port: number, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: ip,
      port,
      path: '/receive',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Peer returned HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(PEER_TIMEOUT_MS, () => {
      req.destroy(new Error('Request to peer timed out'));
    });

    req.write(payload);
    req.end();
  });
}

async function pollOutbound(): Promise<void> {
  const db = await dbManager.getConnection();

  const jobs = await db.all(
    `SELECT * FROM sync_jobs
     WHERE direction = 'outbound' AND status = 'pending' AND retries < ?
     ORDER BY created_at ASC`,
    [MAX_RETRIES]
  );
  if (jobs.length === 0) return;

  const peers = await db.all(`SELECT * FROM sync_peers`);
  if (peers.length === 0) return;

  let totalSentCount = 0;
  const sentEntityTypes = new Set<string>();

  for (const job of jobs) {
    let successCount = 0;
    const errors: string[] = [];

    for (const peer of peers) {
      try {
        await postToPeer(peer.ip_address as string, peer.port as number, job.payload as string);
        await db.run(
          `UPDATE sync_peers SET last_seen = datetime('now') WHERE device_id = ?`,
          [peer.device_id]
        );
        successCount++;
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        console.error(
          `[Sync Worker] Failed to deliver job ${job.job_id} to ${peer.ip_address}:${peer.port}: ${msg}`
        );
        errors.push(msg);
      }
    }

    if (successCount === peers.length) {
      await db.run(
        `UPDATE sync_jobs SET status = 'sent', synced_at = datetime('now') WHERE job_id = ?`,
        [job.job_id]
      );
      totalSentCount++;
      if (job.entity_type) sentEntityTypes.add(job.entity_type as string);
    } else {
      const newRetries = (job.retries as number) + 1;
      const newStatus = newRetries >= MAX_RETRIES ? 'failed' : 'pending';
      await db.run(
        `UPDATE sync_jobs SET retries = ?, status = ?, error = ? WHERE job_id = ?`,
        [newRetries, newStatus, errors.join('; '), job.job_id]
      );
    }
  }

  if (totalSentCount > 0) {
    process.send?.({
      type: 'SYNC_BATCH_COMPLETE',
      sentCount: totalSentCount,
      entityTypes: [...sentEntityTypes],
    });
  }
}

// PING / PONG heartbeat
process.on('message', (msg: any) => {
  if (msg?.type === 'PING') process.send?.({ type: 'PONG' });
});

// Graceful exit when supervisor disconnects
process.on('disconnect', () => {
  console.log('[Sync Worker] Supervisor disconnected. Exiting...');
  process.exit(0);
});

async function startup(): Promise<void> {
  console.log('[Sync Worker] Starting up...');

  const db = await dbManager.getConnection();
  await db.run('PRAGMA journal_mode=WAL');
  await db.run('PRAGMA busy_timeout=5000');

  const [myDeviceId, port] = await Promise.all([getDeviceId(), getSyncPort()]);

  startHttpServer(port, myDeviceId);

  setInterval(
    () => pollOutbound().catch((err) => console.error('[Sync Worker] Outbound poll error:', err)),
    POLL_INTERVAL_MS
  );
  console.log(`[Sync Worker] Outbound sync polling every ${POLL_INTERVAL_MS / 1000}s.`);
}

startup().catch((err) => {
  console.error('[Sync Worker] Fatal startup error:', err);
  process.exit(1);
});
