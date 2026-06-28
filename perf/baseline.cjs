#!/usr/bin/env node
/**
 * perf/baseline.cjs — HTTP load test for AI-Pharmacy API endpoints
 *
 * Usage:
 *   node perf/baseline.cjs [--host localhost] [--port 5000] [--duration 15] [--concurrency 10]
 *
 * Gate thresholds:
 *   p99 latency  < 500 ms
 *   throughput   > 200 req/s
 *
 * Requires the server to be running (npm run dev or npm start).
 * No external dependencies — uses Node.js built-in `http`.
 */

'use strict';

const http = require('http');

// ─── CLI args ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
      else out[a.slice(2)] = true;
    }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

const HOST        = args.host        ?? 'localhost';
const PORT        = parseInt(args.port        ?? '5000', 10);
const DURATION_S  = parseInt(args.duration    ?? '15',   10);
const CONCURRENCY = parseInt(args.concurrency ?? '10',   10);

// ─── Endpoints to test ───────────────────────────────────────────────────────
const SCENARIOS = [
  { label: 'GET /health',                 method: 'GET',  path: '/health' },
  { label: 'GET /api/medicines',          method: 'GET',  path: '/api/medicines?limit=20' },
  { label: 'GET /api/patients',           method: 'GET',  path: '/api/patients?limit=20' },
  { label: 'GET /api/dashboard/summary',  method: 'GET',  path: '/api/dashboard/summary' },
  { label: 'GET /sync/status',            method: 'GET',  path: '/sync/status' },
];

// ─── Core bench ──────────────────────────────────────────────────────────────
function request(scenario) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const req = http.request(
      { host: HOST, port: PORT, path: scenario.path, method: scenario.method,
        headers: { Connection: 'keep-alive' } },
      (res) => {
        res.resume(); // drain
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - start) / 1e6;
          resolve({ ok: res.statusCode < 500, ms });
        });
      }
    );
    req.on('error', () => resolve({ ok: false, ms: -1 }));
    req.end();
  });
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runScenario(scenario) {
  const latencies = [];
  let errors = 0;
  const deadline = Date.now() + DURATION_S * 1000;

  async function worker() {
    while (Date.now() < deadline) {
      const { ok, ms } = await request(scenario);
      if (ok && ms >= 0) latencies.push(ms);
      else errors++;
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, worker);
  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const total = latencies.length + errors;
  const rps   = total / DURATION_S;

  return {
    label:    scenario.label,
    requests: total,
    errors,
    rps:      rps.toFixed(1),
    p50:      latencies.length ? percentile(latencies, 50).toFixed(1)  : 'N/A',
    p95:      latencies.length ? percentile(latencies, 95).toFixed(1)  : 'N/A',
    p99:      latencies.length ? percentile(latencies, 99).toFixed(1)  : 'N/A',
    max:      latencies.length ? latencies[latencies.length - 1].toFixed(1) : 'N/A',
  };
}

// ─── Gate check ──────────────────────────────────────────────────────────────
const P99_GATE_MS  = 500;
const RPS_GATE     = 200;

function checkGates(results) {
  let passed = true;
  for (const r of results) {
    const p99  = parseFloat(r.p99);
    const rps  = parseFloat(r.rps);
    const p99ok = isNaN(p99) || p99 < P99_GATE_MS;
    const rpsok = rps > RPS_GATE;
    if (!p99ok) { console.log(`  FAIL  ${r.label}: p99 ${r.p99} ms >= ${P99_GATE_MS} ms gate`); passed = false; }
    if (!rpsok) { console.log(`  FAIL  ${r.label}: throughput ${r.rps} req/s < ${RPS_GATE} req/s gate`); passed = false; }
  }
  return passed;
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nAI-Pharmacy HTTP Load Test`);
  console.log(`Host: ${HOST}:${PORT}  Duration: ${DURATION_S}s  Concurrency: ${CONCURRENCY}\n`);

  // Verify server reachable
  try {
    await Promise.race([
      request({ method: 'GET', path: '/health' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
  } catch {
    console.error(`ERROR: Server not reachable at ${HOST}:${PORT}. Start it first.\n`);
    process.exit(1);
  }

  const results = [];
  for (const scenario of SCENARIOS) {
    process.stdout.write(`  Running: ${scenario.label} ... `);
    const r = await runScenario(scenario);
    results.push(r);
    console.log(`done  (${r.rps} req/s, p99=${r.p99}ms)`);
  }

  // Table
  console.log('\n┌─────────────────────────────────────────┬──────────┬──────┬────────┬────────┬────────┬────────┐');
  console.log('│ Scenario                                │  req/s   │ err  │  p50   │  p95   │  p99   │  max   │');
  console.log('├─────────────────────────────────────────┼──────────┼──────┼────────┼────────┼────────┼────────┤');
  for (const r of results) {
    const lbl = r.label.padEnd(39);
    const rps = r.rps.padStart(8);
    const err = String(r.errors).padStart(4);
    const p50 = (r.p50 + 'ms').padStart(6);
    const p95 = (r.p95 + 'ms').padStart(6);
    const p99 = (r.p99 + 'ms').padStart(6);
    const max = (r.max + 'ms').padStart(6);
    console.log(`│ ${lbl} │ ${rps} │ ${err} │ ${p50} │ ${p95} │ ${p99} │ ${max} │`);
  }
  console.log('└─────────────────────────────────────────┴──────────┴──────┴────────┴────────┴────────┴────────┘');

  // Gate check
  console.log(`\nGates: p99 < ${P99_GATE_MS} ms, throughput > ${RPS_GATE} req/s`);
  const passed = checkGates(results);
  if (passed) {
    console.log('  ALL GATES PASSED\n');
    process.exit(0);
  } else {
    console.log('  GATES FAILED — see above\n');
    process.exit(1);
  }
})();
