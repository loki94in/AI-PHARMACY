# Self-Healing Crash Recovery — Implementation Spec for AI Pharmacy OS

This is a single spec to hand to Antigravity (or any coding agent) as-is. It extends
patterns that already exist in this codebase (WorkerSupervisor, backupRecoveryService,
catalog_mappings) rather than introducing a new architecture. Do not let the agent
invent a parallel system — every section below names the existing file it must read
first.

-----

## 1. The problems we are actually solving

|#|Problem                                                                       |Where it lives today                                                                  |Current behavior                                                                                        |
|-|------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
|1|Main server process crashes (uncaught exception / unhandled rejection)        |`src/server.ts`                                                                       |Process dies, nothing restarts it. App is down until the user manually relaunches.                      |
|2|App is force-killed mid-write (Task Manager, power cut, Windows update reboot)|SQLite WAL files (`data/app.db-wal`, `app.db-shm`)                                    |No corruption check on next boot. App just opens the DB and hopes.                                      |
|3|A distributor changes their CSV column order/names                            |`catalog_mappings` table (DB-stored JSON, not files) and `src/worker/catalogWorker.ts`|If a mapped column is missing, the import either silently mis-maps data or the worker throws.           |
|4|Background workers (catalog, email) crash                                     |`src/worker/workerSupervisor.ts`                                                      |**Already solved.** Fork + heartbeat + backoff restart. This is the pattern to copy upward, not rebuild.|
|5|Empty DB on boot after a bad install/restore                                  |`backupRecoveryService.ts` → `checkStartupRestore()`                                  |**Already solved**, but only for “DB is empty” — it does not check for “DB is corrupt but not empty.”   |

Problems 1–3 are the real gaps. Problems 4–5 already work and must not be duplicated or replaced — only extended.

-----

## 2. How the solution should work (end to end)

```
Normal boot
  ├─ 1. ProcessGuardian wraps server.ts (new)
  ├─ 2. Integrity check runs BEFORE dbManager opens for business (new)
  │      ├─ PRAGMA integrity_check
  │      ├─ if fail → PRAGMA wal_checkpoint(TRUNCATE) → re-check
  │      └─ if still fail → PAUSE, notify user, do NOT auto-restore
  ├─ 3. checkStartupRestore() runs as it does today (existing, unchanged)
  ├─ 4. last_clean_shutdown flag read (new) → if false, log "recovered from unclean shutdown"
  └─ 5. WorkerSupervisor.start() as it does today (existing, unchanged)

During normal operation
  ├─ uncaughtException / unhandledRejection → ProcessGuardian catches (new)
  │      ├─ write to crash_log table (new table)
  │      └─ process.exit(1) — deliberate, not a hang
  └─ OS-level watcher restarts the process on exit code 1 (new, outside Node)

Graceful shutdown (user closes app / Windows shutdown hook)
  └─ set last_clean_shutdown = true BEFORE exiting (new)

Catalog import with a stale mapping
  ├─ catalogWorker.ts loads mapping_config as it does today (existing)
  ├─ if a mapped CSV column is missing from this file's actual headers (new check)
  │      ├─ attempt fuzzy match via productNameFilterService (existing service, new call site)
  │      └─ if confidence too low → set job status to 'waiting_for_mapping' (existing status, just route here instead of throwing)
  └─ never silently import on a broken mapping
```

-----

## 3. What to build, file by file

**New file: `src/process/processGuardian.ts`**
Mirrors `workerSupervisor.ts`’s restart logic but for the main process itself.

- Registers `process.on('uncaughtException', ...)` and `process.on('unhandledRejection', ...)`.
- On catch: write `{ timestamp, message, stack, app_version }` into a new `crash_log` table, then `process.exit(1)`. Do not try to keep running after an uncaught exception — exiting cleanly and letting the outer watchdog restart is more reliable than limping on in an unknown state.
- Does **not** itself restart the process — that’s the OS-level watcher’s job (see below). A process can’t reliably resurrect itself from inside its own crash.

**New table: `crash_log`** (add to `src/database.ts` alongside the other `CREATE TABLE IF NOT EXISTS` statements)

```sql
CREATE TABLE IF NOT EXISTS crash_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  message TEXT,
  stack TEXT,
  app_version TEXT,
  recovered INTEGER DEFAULT 0
);
```

**New setting: `app_settings` key `last_clean_shutdown`**

- Written `'false'` on every boot, immediately.
- Written `'true'` only in the graceful shutdown path (the existing SIGTERM/shutdown handler in `server.ts` — check what’s already there before adding a second one).
- On boot, read it before flipping it: if `'false'`, log a warning and increment a counter so repeated unclean shutdowns are visible in the AUDIT-style logs, not just the most recent one.

**New setting: `app_settings` key `app_version`**

- Written by the Inno Setup installer at install time (pass it as a build-time constant, e.g. via a `version.txt` the installer drops next to the exe, which `server.ts` reads on boot and upserts into `app_settings`).
- Purely diagnostic for now — if it doesn’t match what last wrote to the DB, log it. Do not block boot on a mismatch; that’s a future improvement, not part of this spec.

**Extend (don’t replace): `src/database/connection.ts`**
Add an integrity check as the very first thing `getConnection()` does on cold start (i.e., the `if (!this.connection ...)` branch), before the existing write-interceptor logic:

```typescript
const result = await db.get('PRAGMA integrity_check');
if (result?.integrity_check !== 'ok') {
  console.error('[DB] Integrity check failed, attempting WAL checkpoint recovery...');
  await db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const recheck = await db.get('PRAGMA integrity_check');
  if (recheck?.integrity_check !== 'ok') {
    // Do NOT auto-restore from backup here. Surface to the user instead.
    throw new Error('DB_INTEGRITY_FAILURE');
  }
}
```

`server.ts` should catch `DB_INTEGRITY_FAILURE` specifically and show a clear “database needs attention” screen pointing at the existing backup/restore UI, rather than the generic crash path. This is the one place we deliberately do NOT auto-heal — see Section 5.

**Extend (don’t replace): `src/worker/catalogWorker.ts`**
Around where `mapping_config` is parsed (existing code, line ~430 in current file), add a header-presence check before applying the mapping:

```typescript
const actualHeaders = new Set(Object.keys(firstRow));
const missingMappedColumns = Object.keys(mapping).filter(col => !actualHeaders.has(col));
if (missingMappedColumns.length > 0) {
  // try fuzzy match via existing productNameFilterService, else:
  await db.run(`UPDATE catalog_jobs SET status = 'waiting_for_mapping' WHERE id = ?`, job.id);
  return; // do not proceed with a broken mapping
}
```

**New (OS level, outside Node entirely): watchdog wrapper**
This is the piece that restarts the whole app after `process.exit(1)`. For a Windows desktop app, the cleanest option is a tiny wrapper script (NSSM, or a simple PowerShell/Inno Setup launcher loop) that:

- Launches the Node/Electron process.
- On exit code 1 specifically, waits with the same backoff already used in `workerSupervisor.ts` (3s → 6s → 9s → 12s → 15s, suspend after 5 rapid failures in a short window).
- On exit code 0 (normal close), does nothing.
  This is intentionally outside the codebase you’re asking Antigravity to touch in `src/` — it’s an installer/launcher concern, not application code. Keep it as a separate small script so it’s easy to audit on its own.

-----

## 4. What stays separate from what (important boundaries)

- **ProcessGuardian (new) vs WorkerSupervisor (existing): do not merge.** Workers are child processes the main process owns and can kill/restart directly. The main process cannot restart itself from the inside — it can only log and exit cleanly, then rely on the OS-level watchdog. Keep these as two distinct mechanisms even though the *pattern* (heartbeat/backoff) is shared.
- **DB integrity recovery vs empty-DB restore prompt: do not merge.** `checkStartupRestore()` already handles “the DB is empty, want to restore a backup?” — that’s a data-loss safety net for a *fresh/blank* DB. The new integrity check handles “the DB file itself is structurally broken” — a *corruption* problem. A DB can be non-empty and still corrupt, or empty and perfectly healthy. Keep them as two separate checks that run in sequence on boot, not one combined function.
- **Catalog mapping fallback vs the existing `waiting_for_mapping` status: reuse, don’t duplicate.** The status already exists for the “AI couldn’t confidently map this file” case from initial import. The header-mismatch case described above should route to the *same* status and the *same* review UI, not a new parallel “broken mapping” state.
- **Crash logging vs console.log: crash_log table is supplementary, not a replacement.** Don’t rip out existing `console.log`/`console.error` calls as part of this work — that’s the separate “structured logging” improvement already flagged in the audit (pino), and mixing the two pieces of work will make this harder to review and roll back independently.

-----

## 5. The one deliberate non-automation: ask before restoring

If the integrity check fails twice (original + after WAL checkpoint), the spec above
intentionally does **not** auto-restore from a backup automatically. Reasoning: a backup
restore can silently roll back recent sales/purchase entries that happened after the
last backup snapshot. A crashed app that pauses and asks is recoverable and honest. A
crashed app that quietly restores last night’s backup and loses this morning’s sales is
a worse failure mode than the crash itself, and the pharmacy owner may never notice
until reconciliation. Surface a clear screen, point at the existing restore UI, and let
the human make that call.

-----

## 6. Testing phase changes

Add these to the existing Jest suite (`tests/`), following the same naming convention as the current files:

**New: `tests/processGuardian.test.ts`**

- Simulate an uncaught exception inside a test harness process (use `child_process.spawn` to run a tiny throwaway script that imports processGuardian and throws) → assert exit code is 1 and a `crash_log` row was written.
- Assert that a *handled* rejection (one with a `.catch()`) does NOT trigger the guardian — only genuinely uncaught errors should.

**New: `tests/dbIntegrity.test.ts`**

- Deliberately corrupt a throwaway copy of `app.db` (truncate the file mid-write, or write garbage bytes) and confirm `getConnection()` throws `DB_INTEGRITY_FAILURE` rather than silently opening a broken DB.
- Confirm a healthy DB with WAL files present passes the check without triggering checkpoint recovery (i.e., the happy path doesn’t pay the recovery-path cost).

**Extend: `tests/catalogPipeline.test.ts`** (already exists per the audit)

- Add a case: import a CSV whose headers don’t match a previously saved `mapping_config` for that header signature → assert job status becomes `waiting_for_mapping`, not a thrown error and not a silent bad import.

**Do not test the OS-level watchdog script in Jest.** It runs outside Node entirely. Test it manually: force-kill the running app via Task Manager during a normal session, and confirm it relaunches within the expected backoff window. This is a manual QA step before each release, not a unit test.

-----

## 7. Build/release changes

- The Inno Setup script (`installer.iss`) needs to: (a) write a `version.txt` next to the installed exe at install time, and (b) bundle the new watchdog launcher script as the thing that actually gets the desktop shortcut, instead of pointing the shortcut directly at the Node/Electron exe.
- `package.json` version field should be the single source of truth for `version.txt` — wire this through the existing build script rather than hand-typing a version number in two places.
- No changes needed to `frontend/` build process — none of this touches the React app directly (the “database needs attention” screen mentioned in Section 3 is a small new page/route, built the same way any other page is, not a build-pipeline change).

-----

## 8. Order of implementation (so nothing is half-wired at any point)

1. `crash_log` table + `app_settings` keys (`last_clean_shutdown`, `app_version`) — pure schema addition, zero risk, ship first.
1. DB integrity check in `connection.ts` — test thoroughly with deliberately corrupted test DBs before touching the real app, since a bug here means the app refuses to boot on a healthy DB.
1. `processGuardian.ts` + wiring into `server.ts` — straightforward, mirrors existing worker pattern.
1. Catalog mapping header-mismatch fallback — smallest, most isolated change, can ship independently of 1–3.
1. OS-level watchdog launcher + installer changes — last, since it depends on exit-code behavior from step 3 being correct first.