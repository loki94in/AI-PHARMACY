import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { dbManager } from '../database/connection.js';
import { getSyncStats, getOrCreateDeviceId } from '../services/syncService.js';
import { buildAimail, deserializeAimail, serializeAimail } from '../utils/aimailFormat.js';
import { mergeDocuments } from '../worker/conflictResolver.js';

const router = Router();

/** GET /api/sync/status — device info + job counts */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const stats = await getSyncStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** GET /api/sync/peers — list registered peers */
router.get('/peers', async (_req: Request, res: Response) => {
  try {
    const db = await dbManager.getConnection();
    const peers = await db.all(
      `SELECT id, device_id, label, ip_address, port, last_seen, created_at
       FROM sync_peers ORDER BY created_at DESC`
    );
    res.json({ success: true, data: peers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** POST /api/sync/peers — register a new peer */
router.post('/peers', async (req: Request, res: Response) => {
  const { device_id, label, ip_address, port } = req.body ?? {};

  if (!device_id || typeof device_id !== 'string') {
    return res.status(400).json({ success: false, error: 'device_id is required' });
  }
  if (!ip_address || typeof ip_address !== 'string') {
    return res.status(400).json({ success: false, error: 'ip_address is required' });
  }
  const peerPort = typeof port === 'number' ? port : parseInt(port ?? '3030', 10);
  if (isNaN(peerPort) || peerPort < 1 || peerPort > 65535) {
    return res.status(400).json({ success: false, error: 'port must be a valid port number' });
  }

  try {
    const db = await dbManager.getConnection();
    await db.run(
      `INSERT INTO sync_peers (device_id, label, ip_address, port)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         label = excluded.label,
         ip_address = excluded.ip_address,
         port = excluded.port`,
      [device_id, label ?? null, ip_address, peerPort]
    );
    const peer = await db.get(`SELECT * FROM sync_peers WHERE device_id = ?`, [device_id]);
    res.status(201).json({ success: true, data: peer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** DELETE /api/sync/peers/:id — remove a peer by row id */
router.delete('/peers/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid peer id' });
  }
  try {
    const db = await dbManager.getConnection();
    const result = await db.run(`DELETE FROM sync_peers WHERE id = ?`, [id]);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Peer not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** GET /api/sync/jobs — list sync jobs with optional filters */
router.get('/jobs', async (req: Request, res: Response) => {
  const { direction, status, limit: limitStr } = req.query;
  const limit = Math.min(parseInt(String(limitStr ?? '100'), 10) || 100, 500);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (direction) {
    conditions.push('direction = ?');
    params.push(direction);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const db = await dbManager.getConnection();
    const jobs = await db.all(
      `SELECT id, job_id, entity_type, entity_id, checksum, transfer_version,
              direction, status, target_device, retries, error, created_at, synced_at
       FROM sync_jobs ${where} ORDER BY created_at DESC LIMIT ?`,
      [...params, limit]
    );
    res.json({ success: true, data: jobs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** GET /api/sync/test-aimail — return a ready-to-push test AimailDocument (checksummed by server) */
router.get('/test-aimail', async (_req: Request, res: Response) => {
  try {
    const deviceId = await getOrCreateDeviceId();
    const now = new Date().toISOString();
    const doc = buildAimail({
      id: randomUUID(),
      source_device_id: deviceId,
      distributor: 'Test Distributor',
      subject: 'Test Sync .aimail — Phase 5',
      body: 'This is a test .aimail document created by the mobile Sync Now screen to validate LAN transport.',
      order_numbers: ['ORD-TEST-001'],
      invoice_numbers: ['INV-TEST-001'],
      purchase_numbers: [],
      status: 'unprocessed',
      attachment_list: [],
      sync_status: 'pending',
      transfer_version: 1,
      email_received_at: now,
      created_at: now,
      updated_at: now,
      synced_at: null,
    });
    res.json({ success: true, data: doc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** GET /api/sync/conflicts — list unresolved sync conflicts */
router.get('/conflicts', async (_req: Request, res: Response) => {
  try {
    const db = await dbManager.getConnection();
    const conflicts = await db.all(
      `SELECT id, entity_type, entity_id, local_checksum, remote_checksum,
              remote_device_id, strategy, created_at
       FROM sync_conflicts
       WHERE resolved_at IS NULL
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: conflicts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** POST /api/sync/conflicts/:id/resolve — apply a resolution choice */
router.post('/conflicts/:id/resolve', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid conflict id' });
  }
  const { choice } = req.body ?? {};
  if (!['local', 'remote', 'merge'].includes(choice)) {
    return res.status(400).json({ success: false, error: "choice must be 'local', 'remote', or 'merge'" });
  }

  try {
    const db = await dbManager.getConnection();
    const conflict = await db.get(
      `SELECT * FROM sync_conflicts WHERE id = ? AND resolved_at IS NULL`,
      [id]
    );
    if (!conflict) {
      return res.status(404).json({ success: false, error: 'Conflict not found or already resolved' });
    }

    let resolvedPayload: string;
    if (choice === 'local') {
      resolvedPayload = conflict.local_payload as string;
    } else if (choice === 'remote') {
      resolvedPayload = conflict.remote_payload as string;
    } else {
      const local = deserializeAimail(conflict.local_payload as string);
      const remote = deserializeAimail(conflict.remote_payload as string);
      const merged = mergeDocuments(local, remote);
      resolvedPayload = serializeAimail(merged);
    }

    await db.run(
      `UPDATE sync_conflicts
       SET resolved_payload = ?, resolved_at = datetime('now'), strategy = ?
       WHERE id = ?`,
      [resolvedPayload, choice, id]
    );

    // Update the inbound sync_job to the resolved payload
    const resolvedDoc = deserializeAimail(resolvedPayload);
    await db.run(
      `UPDATE sync_jobs
       SET payload = ?, checksum = ?, synced_at = datetime('now')
       WHERE entity_id = ? AND direction = 'inbound'`,
      [resolvedPayload, resolvedDoc.checksum, conflict.entity_id]
    );

    await db.run(
      `INSERT INTO action_logs (action, details) VALUES ('sync_conflict_resolved', ?)`,
      [JSON.stringify({ conflictId: id, entityId: conflict.entity_id, choice })]
    );

    res.json({ success: true, resolution: choice });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

/** GET /api/sync/version-history?entity_id=<uuid> — list version snapshots */
router.get('/version-history', async (req: Request, res: Response) => {
  const entityId = req.query.entity_id as string | undefined;
  if (!entityId) {
    return res.status(400).json({ success: false, error: 'entity_id query parameter is required' });
  }
  try {
    const db = await dbManager.getConnection();
    const rows = await db.all(
      `SELECT id, entity_type, entity_id, checksum, source_device_id, created_at
       FROM sync_version_history
       WHERE entity_id = ?
       ORDER BY created_at DESC`,
      [entityId]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
});

export default router;
