# AI-Pharmacy Performance Baseline Report

**Date:** <!-- YYYY-MM-DD -->
**Branch:** <!-- git rev-parse --abbrev-ref HEAD -->
**Commit:** <!-- git rev-parse --short HEAD -->
**Runner:** <!-- machine spec: CPU, RAM, OS -->

---

## 1. HTTP Load Test (`perf/baseline.cjs`)

Command run:
```
node perf/baseline.cjs --host localhost --port 5000 --duration 30 --concurrency 10
```

| Scenario | req/s | Errors | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |
|---|---|---|---|---|---|---|
| GET /health | | | | | | |
| GET /api/medicines | | | | | | |
| GET /api/patients | | | | | | |
| GET /api/dashboard/summary | | | | | | |
| GET /sync/status | | | | | | |

**Gate result:** PASS / FAIL
- p99 < 500 ms: PASS / FAIL
- throughput > 200 req/s: PASS / FAIL

**Notes:**
<!-- Any anomalies, warm-up artefacts, or environment caveats -->

---

## 2. SQLite Throughput Benchmark (`perf/db-bench.cjs`)

Command run:
```
node perf/db-bench.cjs --iterations 50000
```

| Benchmark | Iters | Time (s) | ops/s |
|---|---|---|---|
| INSERT (transactional) | | | |
| SELECT by PK (sequential) | | | |
| UPDATE by PK (transactional) | | | |
| Full-table COUNT(*) | | | |

**Gate result:** PASS / FAIL
- INSERT > 3 000 ops/s: PASS / FAIL
- SELECT by PK > 10 000 ops/s: PASS / FAIL

**Notes:**
<!-- WAL mode confirmed? Disk type (SSD/HDD/NVMe)? -->

---

## 3. Regression Policy

1. Run both scripts before **and** after any change that touches:
   - Database schema or indexes
   - Sync worker logic
   - Express middleware stack
   - The `backupService` or `dbManager`

2. A PR is **blocked** if any gate degrades by more than **20%** relative to the baseline recorded here.

3. To update the baseline (e.g. after a deliberate optimisation), copy this file as
   `perf/baseline-<YYYY-MM-DD>.md`, fill in the new numbers, and update the gates in
   `perf/baseline.cjs` and `perf/db-bench.cjs` accordingly.

---

## 4. Profiling Quick-Start

```bash
# CPU profile of the HTTP server under load (requires clinic.js or 0x)
npx 0x --output-dir perf/profiles -- node dist/server.js

# SQLite query timing: enable in-process
node -e "
const DB = require('./node_modules/better-sqlite3');
const db = new DB('data/app.db');
db.pragma('query_only = true');
console.time('q');
db.prepare('SELECT COUNT(*) FROM medicines').get();
console.timeEnd('q');
db.close();
"
```
