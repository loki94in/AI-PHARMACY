#!/usr/bin/env node
/**
 * AI-Pharmacy Cloud Sync Relay Server (Phase 15-B)
 *
 * Minimal Express relay: pharmacy devices POST batches to /push and
 * GET them from /poll/:device_id.  Batches are stored in memory with
 * a 24-hour TTL.  No database required — deploy on any free Node host
 * (Railway, Fly.io, Render, a VPS, etc.).
 *
 * Environment variables:
 *   PORT          — HTTP port (default 4000)
 *   RELAY_SECRET  — shared secret; must match pharmacy server config
 *
 * Usage:
 *   RELAY_SECRET=mysecret node relay-server/server.cjs
 */

'use strict';

const http    = require('http');
const crypto  = require('crypto');

const PORT   = parseInt(process.env.PORT ?? '4000', 10);
const SECRET = process.env.RELAY_SECRET ?? '';

if (!SECRET || SECRET.length < 16) {
  console.error('FATAL: RELAY_SECRET env var must be at least 16 characters.');
  process.exit(1);
}

// ─── In-memory batch store ────────────────────────────────────────────────────
// Map<batchId, { targetDevice, jobs, expiresAt }>
const store = new Map();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function purgeExpired() {
  const now = Date.now();
  for (const [id, batch] of store) {
    if (batch.expiresAt < now) store.delete(id);
  }
}
setInterval(purgeExpired, 60_000); // prune every minute

// ─── Routing helpers ──────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 10_000_000) reject(new Error('Payload too large')); });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function authenticate(req, res) {
  const secret = req.headers['x-relay-secret'] ?? '';
  const valid = crypto.timingSafeEqual(
    Buffer.from(secret.padEnd(64)),
    Buffer.from(SECRET.padEnd(64))
  );
  if (!valid) { send(res, 401, { error: 'Unauthorized' }); return false; }
  return true;
}

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url  = new URL(req.url, `http://localhost`);
  const path = url.pathname;

  // Health
  if (path === '/health' && req.method === 'GET') {
    return send(res, 200, { ok: true, batches: store.size });
  }

  if (!authenticate(req, res)) return;

  // POST /push — receive a batch from a pharmacy device
  if (path === '/push' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const jobs = body.jobs ?? [];
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return send(res, 400, { error: 'jobs array required' });
      }
      const batchId = crypto.randomUUID();
      store.set(batchId, {
        sourceDevice: body.sourceDevice ?? 'unknown',
        pushedAt: new Date().toISOString(),
        jobs,
        expiresAt: Date.now() + TTL_MS,
      });
      console.log(`[Relay] Stored batch ${batchId} (${jobs.length} jobs) from ${body.sourceDevice}`);
      return send(res, 200, { success: true, batchId, jobCount: jobs.length });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  // GET /poll/:deviceId — return all pending batches for the device then delete them
  const pollMatch = path.match(/^\/poll\/(.+)$/);
  if (pollMatch && req.method === 'GET') {
    const deviceId = decodeURIComponent(pollMatch[1]);
    purgeExpired();
    const allJobs = [];
    const toDelete = [];
    for (const [id, batch] of store) {
      // Deliver to everyone except the original sender (fan-out)
      if (batch.sourceDevice !== deviceId) {
        allJobs.push(...batch.jobs);
        toDelete.push(id);
      }
    }
    for (const id of toDelete) store.delete(id);
    console.log(`[Relay] Poll from ${deviceId}: delivering ${allJobs.length} jobs`);
    return send(res, 200, { success: true, jobs: allJobs });
  }

  // Stats (authenticated)
  if (path === '/stats' && req.method === 'GET') {
    purgeExpired();
    return send(res, 200, { batches: store.size, uptime: process.uptime() });
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[Relay] AI-Pharmacy sync relay running on port ${PORT}`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
