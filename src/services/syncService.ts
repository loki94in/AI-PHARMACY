import { randomUUID } from 'crypto';
import { dbManager } from '../database/connection.js';
import { AimailDocument, verifyChecksum, serializeAimail } from '../utils/aimailFormat.js';

export const DEFAULT_SYNC_PORT = 3030;

/** Return the persisted device UUID, generating one on first call */
export async function getOrCreateDeviceId(): Promise<string> {
  const db = await dbManager.getConnection();
  const row = await db.get(
    `SELECT value FROM app_settings WHERE key = 'sync_device_id'`
  );
  if (row?.value) return row.value as string;

  const id = randomUUID();
  await db.run(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_device_id', ?)`,
    [id]
  );
  return id;
}

/** Return the configured sync port (default 3030) */
export async function getSyncPort(): Promise<number> {
  const db = await dbManager.getConnection();
  const row = await db.get(
    `SELECT value FROM app_settings WHERE key = 'sync_port'`
  );
  const port = parseInt(row?.value ?? '', 10);
  return isNaN(port) ? DEFAULT_SYNC_PORT : port;
}

/**
 * Queue an AimailDocument for outbound sync to all registered peers.
 * Validates the checksum before inserting.
 */
export async function queueEmailSync(doc: AimailDocument): Promise<void> {
  if (!verifyChecksum(doc)) {
    throw new Error('Cannot queue sync job: AimailDocument has invalid checksum');
  }
  const db = await dbManager.getConnection();
  await db.run(
    `INSERT INTO sync_jobs
       (job_id, entity_type, entity_id, payload, checksum, transfer_version, direction, status)
     VALUES (?, 'email', ?, ?, ?, ?, 'outbound', 'pending')`,
    [randomUUID(), doc.id, serializeAimail(doc), doc.checksum, doc.transfer_version]
  );
}

/** Stats summary for the /api/sync/status endpoint */
export async function getSyncStats(): Promise<{
  deviceId: string;
  port: number;
  pending: number;
  sent: number;
  failed: number;
  received: number;
}> {
  const [deviceId, port] = await Promise.all([getOrCreateDeviceId(), getSyncPort()]);
  const db = await dbManager.getConnection();

  const rows = await db.all(
    `SELECT status, COUNT(*) as cnt FROM sync_jobs GROUP BY status`
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status as string] = r.cnt as number;

  return {
    deviceId,
    port,
    pending: counts['pending'] ?? 0,
    sent: counts['sent'] ?? 0,
    failed: counts['failed'] ?? 0,
    received: counts['received'] ?? 0,
  };
}
