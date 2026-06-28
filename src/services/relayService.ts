/**
 * relayService.ts — Cloud Sync Relay client (Phase 15-B)
 *
 * The relay is a thin HTTP forwarder: this pharmacy server POSTs AIMAIL
 * batches to RELAY_URL/push and GETs them from RELAY_URL/poll/:device_id.
 * Authentication is a shared secret passed as X-Relay-Secret.
 *
 * Configuration is read from app_settings at runtime (no restart needed):
 *   relay_url    — e.g. https://relay.example.com
 *   relay_secret — shared secret (min 16 chars)
 *   relay_enabled — 'true' | 'false'
 */

import axios from 'axios';
import { dbManager } from '../database/connection.js';
import os from 'os';

export interface RelayConfig {
  enabled: boolean;
  relayUrl: string | null;
  relaySecret: string | null;
}

export interface RelayStatus {
  configured: boolean;
  enabled: boolean;
  relayUrl: string | null;
  deviceId: string;
  lastPushAt: string | null;
  lastPollAt: string | null;
  lastPushCount: number;
  lastPollCount: number;
}

// In-process state (reset on server restart — stored in app_settings for persistence)
let lastPushAt: string | null = null;
let lastPollAt: string | null = null;
let lastPushCount = 0;
let lastPollCount = 0;

function getDeviceId(): string {
  return process.env.DEVICE_ID ?? os.hostname();
}

export async function getRelayConfig(): Promise<RelayConfig> {
  try {
    const db = await dbManager.getConnection();
    await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
    const rows = await db.all(
      "SELECT key, value FROM app_settings WHERE key IN ('relay_url','relay_secret','relay_enabled')"
    );
    const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    return {
      enabled: map['relay_enabled'] === 'true',
      relayUrl: map['relay_url'] ?? null,
      relaySecret: map['relay_secret'] ?? null,
    };
  } catch {
    return { enabled: false, relayUrl: null, relaySecret: null };
  }
}

export async function setRelayConfig(patch: Partial<{ enabled: boolean; relayUrl: string; relaySecret: string }>): Promise<void> {
  const db = await dbManager.getConnection();
  await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
  if (patch.enabled !== undefined) {
    await db.run("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('relay_enabled',?)", [patch.enabled ? 'true' : 'false']);
  }
  if (patch.relayUrl !== undefined) {
    await db.run("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('relay_url',?)", [patch.relayUrl]);
  }
  if (patch.relaySecret !== undefined) {
    await db.run("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('relay_secret',?)", [patch.relaySecret]);
  }
}

/**
 * Push recent unsynced AIMAIL payloads to the relay server.
 * Returns the number of batches pushed.
 */
export async function pushToRelay(): Promise<number> {
  const cfg = await getRelayConfig();
  if (!cfg.enabled || !cfg.relayUrl || !cfg.relaySecret) return 0;

  const db = await dbManager.getConnection();
  const jobs = await db.all(
    `SELECT id, entity_type, entity_id, payload, device_id, created_at
     FROM sync_jobs
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 100`
  );
  if (jobs.length === 0) return 0;

  const batch = {
    sourceDevice: getDeviceId(),
    pushedAt: new Date().toISOString(),
    jobs,
  };

  await axios.post(`${cfg.relayUrl}/push`, batch, {
    headers: { 'X-Relay-Secret': cfg.relaySecret, 'Content-Type': 'application/json' },
    timeout: 10_000,
  });

  lastPushAt = new Date().toISOString();
  lastPushCount = jobs.length;
  return jobs.length;
}

/**
 * Poll the relay server for batches addressed to this device.
 * Inserts received jobs into sync_jobs for processing.
 * Returns the number of jobs received.
 */
export async function pollFromRelay(): Promise<number> {
  const cfg = await getRelayConfig();
  if (!cfg.enabled || !cfg.relayUrl || !cfg.relaySecret) return 0;

  const deviceId = getDeviceId();
  const res = await axios.get(`${cfg.relayUrl}/poll/${encodeURIComponent(deviceId)}`, {
    headers: { 'X-Relay-Secret': cfg.relaySecret },
    timeout: 10_000,
  });

  const jobs: any[] = res.data?.jobs ?? [];
  if (jobs.length === 0) {
    lastPollAt = new Date().toISOString();
    lastPollCount = 0;
    return 0;
  }

  const db = await dbManager.getConnection();
  let inserted = 0;
  for (const j of jobs) {
    try {
      await db.run(
        `INSERT OR IGNORE INTO sync_jobs (entity_type, entity_id, payload, device_id, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [j.entity_type, j.entity_id, j.payload, j.device_id ?? deviceId, j.created_at ?? new Date().toISOString()]
      );
      inserted++;
    } catch { /* duplicate or schema mismatch — skip */ }
  }

  lastPollAt = new Date().toISOString();
  lastPollCount = inserted;
  return inserted;
}

export async function getRelayStatus(): Promise<RelayStatus> {
  const cfg = await getRelayConfig();
  return {
    configured: !!(cfg.relayUrl && cfg.relaySecret),
    enabled: cfg.enabled,
    relayUrl: cfg.relayUrl,
    deviceId: getDeviceId(),
    lastPushAt,
    lastPollAt,
    lastPushCount,
    lastPollCount,
  };
}
