#!/usr/bin/env node
/**
 * perf/db-bench.cjs — SQLite throughput benchmark
 *
 * Usage:
 *   node perf/db-bench.cjs [--iterations 50000] [--db path/to/app.db]
 *
 * Gate thresholds:
 *   Read throughput  > 10 000 ops/s
 *   Write throughput >  3 000 ops/s
 *
 * Opens the database in WAL mode (read-write) on a SEPARATE connection
 * so it never touches the running server's shared connection.
 * Uses a dedicated bench_temp table that is dropped after the run.
 */

'use strict';

const path        = require('path');
const fs          = require('fs');
const Database    = require(path.resolve(__dirname, '..', 'node_modules', 'better-sqlite3'));

// ─── CLI args ────────────────────────────────────────────────────────────────
// Supports both --key=value and --key value forms
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

const ITERATIONS = parseInt(args.iterations ?? '50000', 10);
const DB_PATH    = args.db
  ?? path.resolve(__dirname, '..', 'data', 'app.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: Database not found at ${DB_PATH}`);
  console.error('       Pass --db=<path> to specify a different location.');
  process.exit(1);
}

// ─── Gates ───────────────────────────────────────────────────────────────────
const READ_GATE  = 10_000;  // ops/s
const WRITE_GATE =  3_000;  // ops/s

// ─── Benchmark helpers ───────────────────────────────────────────────────────
function bench(label, fn, n) {
  const start = process.hrtime.bigint();
  fn(n);
  const elapsed = Number(process.hrtime.bigint() - start) / 1e9; // seconds
  const opsPerSec = Math.round(n / elapsed);
  return { label, iterations: n, elapsed: elapsed.toFixed(3), opsPerSec };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log(`\nAI-Pharmacy SQLite Throughput Benchmark`);
console.log(`DB: ${DB_PATH}`);
console.log(`Iterations: ${fmt(ITERATIONS)}\n`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

// Temp table so we never corrupt live data
db.exec(`DROP TABLE IF EXISTS _bench_temp`);
db.exec(`CREATE TABLE _bench_temp (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  key   TEXT NOT NULL,
  value TEXT NOT NULL
)`);

const insertStmt  = db.prepare(`INSERT INTO _bench_temp (key, value) VALUES (?, ?)`);
const selectStmt  = db.prepare(`SELECT id, key, value FROM _bench_temp WHERE id = ?`);
const countStmt   = db.prepare(`SELECT COUNT(*) AS n FROM _bench_temp`);
const updateStmt  = db.prepare(`UPDATE _bench_temp SET value = ? WHERE id = ?`);
const deleteStmt  = db.prepare(`DELETE FROM _bench_temp WHERE id = ?`);

const results = [];

// 1. Sequential inserts (inside a transaction for realistic throughput)
const writeResult = bench('INSERT (transactional)', (n) => {
  const txn = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      insertStmt.run(`key-${i}`, `value-${i}-${'x'.repeat(64)}`);
    }
  });
  txn();
}, ITERATIONS);
results.push(writeResult);

// 2. Point reads by primary key
const rowCount = countStmt.get().n;
const readResult = bench('SELECT by PK (sequential)', (n) => {
  for (let i = 0; i < n; i++) {
    const id = (i % rowCount) + 1;
    selectStmt.get(id);
  }
}, ITERATIONS);
results.push(readResult);

// 3. Bulk update (transactional)
const updateResult = bench('UPDATE by PK (transactional)', (n) => {
  const txn = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const id = (i % rowCount) + 1;
      updateStmt.run(`updated-${i}`, id);
    }
  });
  txn();
}, ITERATIONS);
results.push(updateResult);

// 4. Table scan (COUNT)
const scanResult = bench('Full-table COUNT(*)', (n) => {
  for (let i = 0; i < n; i++) {
    countStmt.get();
  }
}, Math.min(ITERATIONS, 5_000)); // count is slower; cap at 5k
results.push(scanResult);

// Cleanup
db.exec(`DROP TABLE IF EXISTS _bench_temp`);
db.close();

// ─── Report ──────────────────────────────────────────────────────────────────
console.log('┌─────────────────────────────────────┬────────────┬────────────┬──────────────┐');
console.log('│ Benchmark                           │  Iters     │  Time (s)  │  ops/s       │');
console.log('├─────────────────────────────────────┼────────────┼────────────┼──────────────┤');
for (const r of results) {
  const lbl  = r.label.padEnd(35);
  const iter = fmt(r.iterations).padStart(10);
  const time = r.elapsed.padStart(10);
  const ops  = fmt(r.opsPerSec).padStart(12);
  console.log(`│ ${lbl} │ ${iter} │ ${time} │ ${ops} │`);
}
console.log('└─────────────────────────────────────┴────────────┴────────────┴──────────────┘');

// Gate check
console.log(`\nGates: INSERT > ${fmt(WRITE_GATE)} ops/s, SELECT by PK > ${fmt(READ_GATE)} ops/s`);
let passed = true;
const insertOps = results.find(r => r.label.startsWith('INSERT'))?.opsPerSec ?? 0;
const selectOps = results.find(r => r.label.startsWith('SELECT'))?.opsPerSec ?? 0;
if (insertOps < WRITE_GATE) {
  console.log(`  FAIL  INSERT: ${fmt(insertOps)} ops/s < ${fmt(WRITE_GATE)} ops/s gate`);
  passed = false;
}
if (selectOps < READ_GATE) {
  console.log(`  FAIL  SELECT: ${fmt(selectOps)} ops/s < ${fmt(READ_GATE)} ops/s gate`);
  passed = false;
}
if (passed) {
  console.log('  ALL GATES PASSED\n');
  process.exit(0);
} else {
  console.log('  GATES FAILED — see above\n');
  process.exit(1);
}
