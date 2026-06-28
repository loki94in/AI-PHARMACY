# AI-Pharmacy Disaster Recovery Runbook

**Version:** 1.0  
**Last updated:** 2026-06-28  
**Owner:** System Administrator

---

## 1. Scope

This runbook covers recovery from:
- Corrupt SQLite database (WAL corruption, disk error)
- Accidental data deletion or truncation
- Server OS failure requiring a fresh host
- Data file loss

It does NOT cover HA failover (no replication is configured) or
cloud-hosted DR (Phase 15-B cloud sync relay is a separate concern).

---

## 2. Determining that Disaster Has Occurred

| Signal | Likely cause |
|---|---|
| Server fails to start with `SQLITE_CORRUPT` error | DB file corrupt |
| Medicines / patients data missing after restart | Accidental delete or bad migration |
| `data/app.db` size is 0 bytes or missing | Disk failure / accidental `rm` |
| API returns 500 on every route | DB connection lost |
| DR Status panel shows RPO gap > 24 h | Scheduler stopped or disk full |

---

## 3. Pre-Recovery Checklist

Before touching the live database:

- [ ] Stop the AI-Pharmacy server: `pkill -f "node.*server"` or `Ctrl+C`
- [ ] Snapshot the current (potentially corrupt) DB:
  ```bash
  cp data/app.db data/app.db.incident-$(date +%Y%m%d-%H%M%S)
  ```
- [ ] Note the RPO gap from Settings → Backup & DR → DR Status banner
- [ ] Identify the target backup file (newest valid one — see §4)

---

## 4. Choosing the Right Backup

1. Open Settings → Backup & DR while server is still running (or list manually):
   ```bash
   ls -lht backup/ | head -10
   ```
2. For each candidate backup, run a **DR Test** before committing:
   - **UI:** Click the "DR Test" button on the backup row.
     A green "DR OK (Nms)" label means the backup is valid.
   - **CLI:**
     ```bash
     curl -sX POST http://localhost:5000/utilities/backup/test-restore/<filename> | jq .
     ```
     Expected: `{ "success": true, "report": { "integrityOk": true, ... } }`
3. If the newest backup fails DR Test, try the next oldest.
4. Record the chosen filename: `_________________________________`

---

## 5. Executing the Restore

### Option A — via Settings UI

1. Click "Restore" on the chosen backup row.
2. Confirm the prompt.
3. The server re-opens the DB automatically; verify via the DR Status banner.

### Option B — via API (server must be running)

```bash
curl -sX POST http://localhost:5000/utilities/restore-backup \
  -H 'Content-Type: application/json' \
  -d '{"filename":"<backup-filename>"}' | jq .
```

### Option C — manual (server stopped)

```bash
# Decompress .gz backup
gunzip -c backup/<filename>.db.gz > data/app.db

# Or copy plain .db backup
cp backup/<filename>.db data/app.db

# Restart server
npm start
```

---

## 6. Post-Restore Verification

- [ ] Server starts without errors (`PRAGMA integrity_check` runs at boot? No — manual check:)
  ```bash
  node -e "
  const DB = require('./node_modules/better-sqlite3');
  const db = new DB('data/app.db', { readonly: true });
  const r = db.prepare('PRAGMA integrity_check').all();
  console.log(r);
  db.close();
  "
  ```
  Expected: `[ { integrity_check: 'ok' } ]`
- [ ] Check action_logs for the `RESTORE_BACKUP` entry (Settings → Audit Log)
- [ ] Spot-check critical tables:
  ```bash
  node -e "
  const DB = require('./node_modules/better-sqlite3');
  const db = new DB('data/app.db', { readonly: true });
  console.log('medicines:', db.prepare('SELECT COUNT(*) AS n FROM medicines').get());
  console.log('patients:', db.prepare('SELECT COUNT(*) AS n FROM patients').get());
  db.close();
  "
  ```
- [ ] Confirm the RPO gap is now reasonable (Settings → DR Status banner)
- [ ] Take an immediate fresh backup (Settings → Backup Now)

---

## 7. DR Test Schedule

Run a DR test at least **weekly** — Settings → Backup History → DR Test button on the latest backup.

Automate with a cron job on the server host:
```bash
# /etc/cron.weekly/ai-pharmacy-dr-test
#!/bin/bash
LATEST=$(curl -s http://localhost:5000/utilities/backup/list | jq -r '.backups[0].filename')
curl -sX POST "http://localhost:5000/utilities/backup/test-restore/${LATEST}" | \
  jq '{file: .report.filename, ok: .report.integrityOk, ms: .report.elapsedMs}'
```

---

## 8. RTO / RPO Targets

| Metric | Target | How to measure |
|---|---|---|
| RPO (data loss window) | ≤ 6 hours | DR Status banner → "RPO gap" |
| RTO (recovery time) | ≤ 30 minutes | Time from incident detection to server back online |

If the RPO gap consistently exceeds 6 hours, increase the backup frequency
in Settings → Backup Frequency (set to 3h or 6h).

---

## 9. Contacts

| Role | Name | Contact |
|---|---|---|
| System Admin | ___ | ___ |
| DB Owner | ___ | ___ |
| On-call | ___ | ___ |
