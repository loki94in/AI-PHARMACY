import { Router, Request, Response } from 'express';
import { dbManager } from '../database/connection.js';
import { getSyncStats } from '../services/syncService.js';

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

export default router;
