# 🐛 AI PHARMACY — COMPLETE BUG & ISSUE AUDIT

**Date**: 2026-06-05  
**Mode**: Read-only scan — no fixes applied  
**Total Issues**: **73** (52 source code + 21 test-specific)

---

## TABLE OF CONTENTS
- [🔴 CRITICAL — Source Code (7)](#-critical--source-code-7-issues)
- [🔴 CRITICAL — Tests (5)](#-critical--tests-5-issues)
- [🟠 HIGH — Source Code (11)](#-high--source-code-11-issues)
- [🟡 MEDIUM — Source Code (15)](#-medium--source-code-15-issues)
- [🟡 MEDIUM — Tests (8)](#-medium--tests-8-issues)
- [🟢 LOW — Source Code (19)](#-low--source-code-19-issues)
- [🟢 LOW — Tests (8)](#-low--tests-8-issues)
- [📊 SUMMARY](#-summary)

---

## 🔴 CRITICAL — Source Code (7 Issues)

### C1 — Production OpenFDA API Key Committed to Git

| Field | Detail |
|-------|--------|
| **File** | `.env:1` |
| **Code** | `OPENFDA_API_KEY=zQIexc9ElNA5ZjN5PpwKemUkhZQwsR2GOJXLSLrk` |
| **Why** | `.env` is tracked by Git instead of being in `.gitignore`. The API key is public in the repository. |
| **When** | Every clone, push, or deploy exposes the key to anyone with repository access. |
| **Impact** | **API billing fraud, unauthorized usage, rate limiting for legitimate users.** The OpenFDA API key owner is billed for all usage. Key must be revoked immediately. |

---

### C2 — Authentication Disabled in Non-Production

| Field | Detail |
|-------|--------|
| **File** | `src/middleware/auth.ts:19` |
| **Code** | `if (process.env.NODE_ENV !== 'production') { return next(); }` |
| **Why** | Entire auth middleware is skipped if `NODE_ENV` is anything other than the exact string `'production'`. Since `NODE_ENV` defaults to `undefined` in most dev setups, auth is always bypassed. |
| **When** | Every API request when `NODE_ENV` is `'development'`, `'test'`, `undefined`, `'staging'`, or any value besides `'production'`. |
| **Impact** | **Zero authentication on every API endpoint.** Anyone on the local network can access ALL data: sales, inventory, purchases, CRM, settings, backups. Full read/write access with no credentials required. |

---

### C3 — Hardcoded Default Credentials in Database Init

| Field | Detail |
|-------|--------|
| **File** | `src/database.ts:382-383` |
| **Code** | `('login_password', 'admin123')` and `('master_password', 'master999')` |
| **Why** | Inserted via `INSERT OR IGNORE` on every fresh database initialization. These are plaintext, weak passwords hardcoded in source. |
| **When** | First-time database initialization, or when these `app_settings` keys don't exist yet. |
| **Impact** | **Anyone with source code can authenticate with known defaults.** `admin123` / `master999` are trivially guessable. No password hashing used. |

---

### C4 — CORS Trusts Any Origin

| Field | Detail |
|-------|--------|
| **File** | `src/server.ts:96-103` |
| **Code** | `origin: (origin, callback) => { if (!origin) return callback(null, true); callback(null, true); }, credentials: true` |
| **Why** | The CORS handler unconditionally returns `true` for any origin. Combined with `credentials: true`, cookies/auth headers are sent cross-origin. |
| **When** | Every cross-origin request from ANY website to the pharmacy server. |
| **Impact** | **CSRF attacks fully exploitable.** Any malicious website can make authenticated requests to the pharmacy API. An attacker's page could exfiltrate all inventory, customer data, and create/modify records. |

---

### C5 — Content Security Policy Fully Disabled

| Field | Detail |
|-------|--------|
| **File** | `src/server.ts:94` |
| **Code** | `helmet({ contentSecurityPolicy: false })` |
| **Why** | Comment says "so inline scripts and styles in index.html can run" — security sacrificed entirely for convenience. |
| **When** | Every page load. |
| **Impact** | **All XSS vulnerabilities are unmitigated.** Any injected `<script>` tag executes freely. No protection against inline script injection, `eval()`, or external script loading. |

---

### C6 — Hardcoded Fallback API Key `Pass@123`

| Field | Detail |
|-------|--------|
| **File** | `src/config/index.ts:43` |
| **Code** | `apiKey: process.env.API_KEY \|\| 'Pass@123'` |
| **Why** | Falls back to a static, weak key visible in source code when `API_KEY` env var is not set. |
| **When** | Any deployment where `API_KEY` environment variable is not configured. |
| **Impact** | **Backdoor authentication.** Anyone reading the source code can authenticate to ALL API endpoints using `Pass@123`. This is used as a fallback in the auth middleware (auth.ts:42). |

---

### C7 — No Unhandled Promise Rejection Handler

| Field | Detail |
|-------|--------|
| **File** | Entire project — `process.on('unhandledRejection', ...)` is missing everywhere |
| **Code** | Missing entirely — no `process.on('unhandledRejection')` or `process.on('uncaughtExceptionMonitor')` |
| **Why** | Node.js >=15 treats unhandled promise rejections as fatal. Over 50 fire-and-forget promise chains exist without proper error boundaries. |
| **When** | Any async operation that throws without a `.catch()` handler — API calls, DB queries, file operations, email polling, WhatsApp messaging. |
| **Impact** | **Process crashes from any unhandled async error, causing full system downtime.** The pharmacy goes offline until manually restarted. Data can be corrupted if crash occurs mid-write. |

---

## 🔴 CRITICAL — Tests (5 Issues)

### T1 — Zero-Assertion OCR Test (Always Passes)

| Field | Detail |
|-------|--------|
| **File** | `tests/sampleImages.test.ts:26-60` |
| **What** | Full OCR batch processing test with **zero** `expect()`, `assert()`, or `.should()` calls. Only `console.log()` output. 120-second timeout but never validates any result. |
| **When** | Every test run. |
| **Impact** | **False confidence.** OCR could completely crash or return garbage data and this test passes. Completely negates the purpose of having a test. |

---

### T2 — WhatsApp Mock Missing `MessageMedia` (Test Crashes)

| Field | Detail |
|-------|--------|
| **File** | `tests/whatsapp/clientInit.test.ts:1-11` |
| **What** | Mock only exports `Client` and `LocalAuth`. Production code at `src/whatsappClient.ts:152` does: `const { MessageMedia } = await import('whatsapp-web.js')` which evaluates to `undefined`. Then `MessageMedia.fromFilePath(mediaPath)` throws `TypeError`. |
| **When** | Test executes `sendMessage()` with a `mediaPath` parameter (line 18). |
| **Impact** | **Test crashes before any assertion.** `TypeError: Cannot read properties of undefined (reading 'fromFilePath')`. Test is permanently broken. |

---

### T3 — WhatsApp Test Assertion Mismatch (Wrong Arguments)

| Field | Detail |
|-------|--------|
| **File** | `tests/whatsapp/clientInit.test.ts:19` |
| **What** | Two mismatches between assertion and actual production code: |
| | 1. **Phone format**: Asserts `'12345'` but code produces `'12345@c.us'` (line 147) |
| | 2. **Arguments structure**: Asserts `{ media: '...', caption: '...' }` but real call is `clientInstance.sendMessage(chatId, MessageMedia, { caption })` |
| **When** | Every test run. |
| **Impact** | **Assertion always fails.** Even after fixing the mock (T2), the test would still report failure for wrong reasons, masking real regressions. |

---

### T4 — Unmocked WhatsApp Test Requires Real Chrome Browser

| Field | Detail |
|-------|--------|
| **File** | `tests/whatsapp/client.test.ts:1-8` and `client.test.js:1-7` |
| **What** | Imports and calls `initClient()` from the **real** module without mocking `whatsapp-web.js`. Requires a real Chrome/Chromium browser via Puppeteer. |
| **When** | CI environments, headless servers, developer machines without Chrome installed. |
| **Impact** | **Test hangs indefinitely or crashes with browser-not-found.** Makes the entire test suite unreliable in CI. |

---

### T5 — Test Deletes Production Database

| Field | Detail |
|-------|--------|
| **File** | `tests/catalogPipeline.test.ts:14,18` |
| **Code** | `const DB_PATH = path.resolve(__dirname, '..', 'data', 'app.db');` |
| | `beforeAll: if (fs.existsSync('data/app.db')) fs.unlinkSync('data/app.db');` |
| **What** | Test directly references and **deletes** the real production database file at `data/app.db`. |
| **When** | Running `npm test` with this test file in the suite. |
| **Impact** | **CATASTROPHIC DATA LOSS.** Running the test suite destroys the entire pharmacy database — all customers, inventory, sales history, purchases, settings, and transaction records. Complete business data loss. |

---

## 🟠 HIGH — Source Code (11 Issues)

### H1 — SQL Injection via String Interpolation

| Field | Detail |
|-------|--------|
| **Files** | `src/routes/migration.ts:356,412,466` — `UPDATE inventory_master SET ${updates.join(', ')} WHERE id = ?` |
| | `src/routes/purchases.ts:458,534,578` — dynamic query building |
| | `src/routes/v1/sales.ts:212,220` — template literal SQL |
| | Multiple other locations |
| **What** | Dynamic SQL built with template literals and string joins using user-controlled parameter names and values. |
| **Why** | Column names, filter parameters from `req.query` or `req.body` are interpolated directly into SQL strings. The `parseInt()` in some locations doesn't help — `req.query.months as string` is a compile-time cast, not runtime validation. |
| **When** | Every request to endpoints with dynamic queries — search, filter, sort, update operations in migration, purchases, and sales routes. |
| **Impact** | **SQL injection leading to complete database compromise.** Attacker can exfiltrate all patient/customer data (name, phone, address, medicine history), modify prices, delete records, or execute arbitrary SQL commands. |

---

### H2 — Empty Catch Blocks (19+ Instances)

| Field | Detail |
|-------|--------|
| **Files** | `src/routes/v1/sales.ts:276` — PDF temp file cleanup |
| | `src/services/emailService.ts:106,961` — IMAP connection errors |
| | `src/routes/orders.ts:31,34,93` — order processing errors |
| | `src/services/expiryAlertService.ts:85` — expiry alert failures |
| | `src/worker/migrationWorker.ts:306` — migration worker errors |
| | `src/database.ts:393` — `catch (_e) { /* already exists */ }` |
| | Many more across codebase |
| **What** | Errors completely swallowed with `catch (err) {}` — zero logging, zero alerting, zero fallback handling. |
| **When** | Network failures, DB write errors, file system errors, parsing failures, email polling errors in any of these paths. |
| **Impact** | **Silent data corruption and system degradation.** Database writes can fail without notification. Email polling can silently stop working. Temp files can be left undeleted, filling the disk. Users have zero visibility into failures. Critical bugs go undetected until data is permanently lost. |

---

### H3 — Race Condition in WhatsApp Client Module State

| Field | Detail |
|-------|--------|
| **File** | `src/whatsappClient.ts:9-15` |
| **Code** | `let clientInstance: WAClient \|\| null = null;` |
| | `let initializing = false;` |
| | `export let isReady: boolean = false;` |
| | `export let currentQr: string \|\| null = null;` |
| **What** | All module-level mutable state with zero synchronization. Multiple concurrent consumers read/write these variables without locks or atomic operations. The polling loop at lines 22-29 has a classic TOCTOU (Time-of-Check-Time-of-Use) race. `isReady` is exported and read by consumers with no guarantee of memory consistency. |
| **When** | Concurrent calls to `initClient()`, `sendMessage()`, `getChats()`, `getChatMessages()`, `forceReconnect()` — especially likely during reconnect cycles which fire every 30 seconds on QR timeout. |
| **Impact** | **Double initialization creating multiple Puppeteer Chrome browser instances.** `clientInstance` can be overwritten after being set. `sendMessage` calls fail with "Client not initialized" errors because they read a stale `null`. Lost messages, client crashes, resource leak from orphaned browser processes. |

---

### H4 — Frontend Crashes in Private/Browser Modes

| Field | Detail |
|-------|--------|
| **Files** | `frontend/src/services/api.ts:15` — `localStorage.getItem('session_token')` |
| | `frontend/src/App.tsx:131` — `localStorage.getItem('theme')` |
| **What** | `localStorage` accessed without try-catch wrapper. |
| **Why** | Safari, Firefox, and Brave private/incognito modes throw `SecurityError` when `localStorage` is accessed. The error is uncaught and propagates up to React's error boundary. |
| **When** | Any user opening the frontend in private/incognito browsing mode. |
| **Impact** | **Full frontend crash on page load.** The entire React application fails to render. The user sees a blank screen. Since this is a POS/billing system, the pharmacy cannot process sales until the user switches to a non-private window. |

---

### H5 — WhatsApp QR Timeout Loop Creates Resource Leak

| Field | Detail |
|-------|--------|
| **File** | `src/whatsappClient.ts:72-84` |
| **What** | Each QR event creates a 30-second `setTimeout` that calls `client.destroy()`, which fires a `disconnected` event, which triggers a 3-second `setTimeout`, which calls `initClient()`, which creates a new QR and starts the cycle again. |
| **Why** | If the QR code is never scanned (user not present), this loop runs indefinitely — creating, destroying, and recreating Puppeteer browser instances approximately every 33 seconds. |
| **When** | WhatsApp QR code not scanned within 30 seconds. Or QR scan fails repeatedly. |
| **Impact** | **Memory leak from accumulated (but garbage-collected) browser allocations.** CPU thrash from repeated initialization. Puppeteer handle exhaustion over hours of operation. The server degrades until restart. |

---

### H6 — Missing React Keys / Index-as-Key in Dynamic Lists

| Field | Detail |
|-------|--------|
| **Files** | `frontend/src/components/QuickOrderModal.tsx:242` — `key={index}` |
| | `pharmacy-mobile/app/(tabs)/index.tsx:214,233,263` — `key={index}` |
| | Multiple additional locations |
| **What** | Array index used as React key in dynamic list rendering. |
| **Why** | Index-as-key tells React to reuse component instances by position rather than identity. When items are filtered, sorted, or mutated, React preserves the wrong component state. |
| **When** | Any filtering, sorting, adding, or removing items from lists — medicine search results, chat messages, inventory items. |
| **Impact** | **Wrong component state displayed.** Expanded/collapsed states persist on wrong rows. Checkbox selections mismatch their intended items. Form input values appear on different records. In a billing context, this could cause the wrong medicine to be added to a sale. |

---

### H7 — PDF Temp File Cleanup Failure Silently Swallowed (Disk Exhaustion)

| Field | Detail |
|-------|--------|
| **File** | `src/routes/v1/sales.ts:273-277` |
| **Code** | `stream.on('end', () => { try { fs.unlinkSync(tempPath); } catch (err) {} });` |
| **What** | Temp file deletion failure is caught and silently ignored. |
| **Why** | File deletion can fail due to Windows file locks, permission issues, antivirus scanning, path length limits, or concurrent access. The error is swallowed with no logging, no retry, and no alert. |
| **When** | Every invoice PDF export that generates a temp file — each sales transaction. |
| **Impact** | **Orphaned temp files accumulate indefinitely, eventually filling the disk.** When the disk is full, the server crashes. All pharmacy operations stop. Recovery requires manual cleanup. Each failed invoice PDF export silently leaves a file behind. |

---

### H8 — Hardcoded Default PIN `1234` in Mobile App Lock

| Field | Detail |
|-------|--------|
| **File** | `pharmacy-mobile/components/AppLock.tsx:23` |
| **Code** | `const [configuredPin, setConfiguredPin] = useState('1234');` |
| **What** | The PIN defaults to `'1234'` when no PIN has been stored in SecureStore. |
| **Why** | The `useEffect` at line 25 loads the saved PIN from SecureStore, but until that async operation completes, `configuredPin` is `'1234'`. On fresh install, no PIN exists in SecureStore, so it stays `'1234'`. |
| **When** | Fresh install, app data cleared, or before the SecureStore read completes (race condition). |
| **Impact** | **Anyone can unlock the mobile app with PIN `1234`.** All pharmacy data accessible from the mobile device — inventory, sales, customer information. |

---

### H9 — `alert()` with Unsanitized Dynamic Data (XSS Risk)

| Field | Detail |
|-------|--------|
| **Files** | `frontend/src/pages/POS.tsx:344,384,532,569,597,624` and more across frontend |
| **Code** | `` alert(`Sale completed! Invoice ${result.invoice_no}`) `` |
| | `` alert(`Medicine ${name} added`) `` |
| | Plus error alerts with interpolated API responses |
| **What** | `alert()` is used extensively for user feedback with dynamically interpolated values from backend API responses. |
| **Why** | While `alert()` itself doesn't execute HTML/JS, if an attacker can inject data into any database field that appears in these alerts (medicine name, customer name, invoice number), they can craft social engineering attacks. More critically, this pattern indicates unsanitized data flow throughout the frontend. |
| **When** | Every sale completion, medicine add, error display, and user notification. |
| **Impact** | **XSS via social engineering and indicator of systemic unsanitized data rendering.** If data flows through `alert()` unsanitized, it likely flows unsanitized through other rendering paths too. |

---

### H10 — `.find()` on Potentially Non-Array (Runtime Crash)

| Field | Detail |
|-------|--------|
| **File** | `frontend/src/pages/CRM.tsx:132` |
| **Code** | `const existing = waChats.find(c => c.id === searchId);` |
| **What** | `waChats` is state initialized as `useState<any[]>([])`, but the fetch response at line 132 is not validated to be an array beyond `Array.isArray(data)`. |
| **Why** | If the API endpoint returns `null`, `undefined`, an error object, or any non-array value, `waChats.find()` throws `TypeError: waChats.find is not a function`. |
| **When** | API `/api/wa-chats` endpoint returns an unexpected response — network error partially handled, server error, or schema change. |
| **Impact** | **CRM page runtime crash.** The customer management page becomes entirely unusable. Cannot access patient records, edit customer info, or send WhatsApp messages from CRM. |

---

### H11 — Auth Tokens in Query Parameters (Leakage)

| Field | Detail |
|-------|--------|
| **File** | `src/middleware/auth.ts:32-33` |
| **Code** | `req.query['api-key'] \|\| req.query['apiKey']` |
| **What** | Authentication tokens accepted via URL query parameters. |
| **Why** | Query parameters are logged by web servers, proxies, load balancers, and CDNs. They appear in browser history, saved bookmarks, and are sent in `Referer` headers when navigating to external sites. |
| **When** | Any client that passes the API key or session token via URL query string. |
| **Impact** | **Auth token leakage through multiple channels.** Server access logs contain the token. Browser history saves it. Referer headers leak it to third-party sites. Any compromised log file exposes full API access. |

---

## 🟡 MEDIUM — Source Code (15 Issues)

### M1 — Widespread `any` Type Usage (TypeScript Erosion)

| Field | Detail |
|-------|--------|
| **Files** | 67+ locations in `frontend/src/`, 190+ in `src/` |
| **What** | Pervasive use of TypeScript `any` type throughout the codebase — function return types, React state variables, API response types, event handlers. |
| **Why** | Developers used `any` as a shortcut instead of defining proper interfaces for API responses, database rows, and component props. |
| **When** | Compile-time — all type checking for these values is nullified. |
| **Impact** | **All TypeScript type safety is nullified.** Bugs that should be caught at compile time surface at runtime as crashes. Refactoring becomes dangerous — the compiler can't catch mismatched types. API contract violations go undetected until production. |

---

### M2 — Missing Request Body Validation (No Schema)

| Field | Detail |
|-------|--------|
| **Files** | `src/routes/sales.ts:53`, `src/routes/purchases.ts:*`, `src/routes/migration.ts:*`, most route files |
| **What** | `const { items = [], patient_id, ... } = req.body;` — direct destructuring with no Joi, Zod, or any schema validation. |
| **Why** | No validation middleware is used. Express body parsing produces whatever the client sends. |
| **When** | Every request to any API endpoint with a request body. |
| **Impact** | **Server 500 errors from malformed payloads.** Missing required fields, wrong types, unexpected nested structures all cause crashes. Potential data corruption from invalid values being stored. No clear error messages returned to client. |

---

### M3 — Type Coercion `as string` Without Runtime Validation

| Field | Detail |
|-------|--------|
| **Files** | 32+ locations across all route files |
| **Code** | `const months = parseInt(req.query.months as string) \|\| 0;` |
| **What** | TypeScript `as string` cast is used on Express query parameters without runtime validation. |
| **Why** | `as string` is a compile-time-only cast. Express query parser may return `string`, `string[]`, or `undefined`. If a query parameter appears twice (e.g., `?months=3&months=6`), Express produces an array, and `as string` coerces it to the string `'[object Object]'`, which `parseInt` converts to `NaN`, defaulting to `0`. |
| **When** | Requests with duplicate query parameters, array values, or missing parameters. |
| **Impact** | **Silent data misconfiguration.** Wrong months used for reports. Wrong limits applied to queries. Wrong filters silently ignored. User sees data they didn't request with no error message. |

---

### M4 — Unhandled Promise Rejections from Fire-and-Forget `.catch()`

| Field | Detail |
|-------|--------|
| **Files** | `frontend/src/pages/POS.tsx:237,250,270,293,304,320,475,481,486,1102` |
| **Pattern** | `somePromise.catch(err => console.error(...))` |
| **What** | Promise chains with `.catch()` handlers that could themselves throw errors. |
| **Why** | If the `.catch()` callback itself throws (e.g., accessing properties of a falsy value, `console.error` failing in certain environments), the resulting rejection is unhandled because the `.catch()` returned a promise that rejects. |
| **When** | Any API call failure in the POS page that triggers the catch handler. |
| **Impact** | **Node.js emits `unhandledRejection` warnings.** In Node.js >=15, these cause process crashes. Combined with C7 (no global handler), every API failure risks taking down the entire server. |

---

### M5 — DB Connection Not Closed on Error (Handle Exhaustion)

| Field | Detail |
|-------|--------|
| **Files** | Multiple locations in `src/routes/sales.ts`, `src/server.ts` |
| **What** | `db.close()` / `dbManager.close()` not consistently called in error paths. |
| **Why** | Error handling in route handlers does not consistently use `try/finally` blocks for DB cleanup. Some error paths return early without closing connections. |
| **When** | Any database error in these routes — query failure, constraint violation, connection timeout. |
| **Impact** | **SQLite handle exhaustion over time.** SQLite has limited concurrent connections. Eventually all handles are consumed and the server stops accepting requests. Requires server restart to recover. |

---

### M6 — File Upload Name Collision via `Date.now()`

| Field | Detail |
|-------|--------|
| **File** | `src/server.ts:77` |
| **Code** | `cb(null, Date.now() + '-' + sanitized);` |
| **What** | Upload filenames are prefixed with `Date.now()` which has millisecond precision. |
| **Why** | Two uploads within the same millisecond produce identical filenames. Multer overwrites existing files by default. |
| **When** | Rapid concurrent file uploads — multiple catalog files, batch invoice uploads, simultaneous user operations. |
| **Impact** | **File overwrite leading to data loss.** One upload silently replaces another's file. The first upload's data is permanently lost with no warning. In a pharmacy context, this could mean lost distributor invoices, medicine images, or backup files. |

---

### M7 — Callback Functions Recreated on Every Render (No `useCallback`)

| Field | Detail |
|-------|--------|
| **Files** | `frontend/src/pages/POS.tsx:497,528,336`, `frontend/src/pages/Returns.tsx:142`, many more |
| **What** | Inline arrow functions defined in render and passed to child components as props. |
| **Why** | Without `useCallback`, a new function reference is created on every render, causing child components to re-render even if their other props haven't changed. |
| **When** | Every render cycle of these pages — every state change, every keystroke in search fields, every item added to cart. |
| **Impact** | **Unnecessary re-renders degrading UI performance.** On slower pharmacy hardware (common in Indian retail), this creates visible lag. The POS page becomes sluggish during busy hours. |

---

### M8 — Sequential DB Operations Block Event Loop

| Field | Detail |
|-------|--------|
| **File** | `src/server.ts:185` |
| **Code** | `for (const med of medicines) { ... await db.run(INSERT) ... }` |
| **What** | Each medicine in a batch is inserted one-at-a-time with individual `await` inside the request handler. |
| **Why** | No batching, no bulk insert, no streaming. Each INSERT is a separate round-trip to SQLite. |
| **When** | Bulk medicine insertion during catalog import, inventory seeding, or migration. |
| **Impact** | **Request timeout with large batches.** With hundreds of medicines, the loop takes seconds. The entire Node.js event loop is blocked, and all other user requests are queued behind it. Browser requests time out. |

---

### M9 — Synchronous File Ops Inside Async Handlers

| Field | Detail |
|-------|--------|
| **File** | `src/whatsappClient.ts:43,212` |
| **Code** | `fs.existsSync(p)` (line 43), `fs.rmSync(authPath, ...)` (line 212) |
| **What** | Synchronous file system operations inside async functions. |
| **Why** | `existsSync` and `rmSync` block the Node.js event loop while the file system operation completes. |
| **When** | WhatsApp initialization (every server startup) and force reconnect operations. |
| **Impact** | **Event loop blocked during file I/O.** For the duration of `rmSync` on the auth directory (which may be large), all other concurrent requests are delayed. Every server restart causes a brief outage window. |

---

### M10 — Potential Infinite Re-render Loop in CRM

| Field | Detail |
|-------|--------|
| **File** | `frontend/src/pages/CRM.tsx:87-92` |
| **Code** | `useEffect(() => { fetchPatients(); fetchWaStatus(); }, [fetchPatients, fetchWaStatus]);` |
| **What** | Effect depends on `fetchWaStatus` which itself depends on `fetchWaChats` which has no dependency array. |
| **Why** | If `fetchWaChats` is not wrapped in `useCallback` with proper deps, its reference changes on every render. This causes `fetchWaStatus` to be recreated, which causes the effect to re-run, which causes a re-render, which changes `fetchWaChats` again — an infinite loop. |
| **When** | CRM page is open and active. |
| **Impact** | **CPU saturation, UI freezing, browser tab crash.** Continuous re-renders consume 100% CPU. Browser may crash or show "Unresponsive page" warning. CRM becomes completely unusable. |

---

### M11 — Expo Notifications `trigger: null` May Silently Fail

| Field | Detail |
|-------|--------|
| **File** | `pharmacy-mobile/app/_layout.tsx:96-101` |
| **Code** | `Notifications.scheduleNotificationAsync({ content, trigger: null })` |
| **What** | `null` is passed as the notification trigger. |
| **Why** | Expo Notifications API requires a valid trigger object. `null` is not a valid trigger type. Valid triggers include `{ seconds: 1 }`, `{ date: Date }`, or `{ type: 'timeInterval', seconds: 1 }`. |
| **When** | Any scheduled notification — refill reminders, order updates, alerts. |
| **Impact** | **Push notifications silently fail.** Users never receive refill reminders, order arrival notifications, expiry alerts, or any other push notification. The feature appears configured but does nothing. |

---

### M12 — Dynamic `import()` in Hot Path (QR Code Processing)

| Field | Detail |
|-------|--------|
| **File** | `src/whatsappClient.ts:61` |
| **Code** | `const qrcode = await import('qrcode');` |
| **What** | Dynamic `import()` is called every time a WhatsApp QR code is generated. |
| **Why** | Dynamic imports are meant for code splitting, not hot paths. Each call creates a new module instance, performs I/O, and parses JavaScript. |
| **When** | Every WhatsApp QR code regeneration — approximately every 30 seconds if user hasn't scanned. |
| **Impact** | **Unnecessary I/O and memory pressure.** The `qrcode` module is loaded from disk and parsed every 30 seconds. Adds latency to the QR event handler. Memory accumulates from orphaned module instances. |

---

### M13 — Dead `useState` for `patientId` (Never Updates, Never Used)

| Field | Detail |
|-------|--------|
| **File** | `frontend/src/pages/POS.tsx:14` |
| **Code** | `const [patientId] = useState('P-' + Math.floor(100000 + Math.random() * 900000));` |
| **What** | `patientId` state variable is destructured without `setPatientId` — it's immutable after creation. It's also never read or used in any API payload or rendering. |
| **Why** | Dead code left behind during development. The `patientId` state is allocated on every render but never consumed anywhere in the component. |
| **When** | Every POS page render. |
| **Impact** | **Wasted memory allocation.** On every render, a new random string is computed for state that's never used. Confusing for developers maintaining the code. Indicates incomplete feature or abandoned logic. |

---

### M14 — `isReady` Stale Closure in WhatsApp Queue

| Field | Detail |
|-------|--------|
| **File** | `src/services/whatsappQueue.ts:35` |
| **Code** | `if (!isReady) { ... return; }` where `isReady` is imported from `whatsappClient.js` as a module-level variable |
| **What** | The `processQueue` function reads `isReady` at the time of its execution, but `isReady` is a module-level variable that may have been updated after the closure was captured. |
| **Why** | Module-level `export let isReady` is mutable. When `processQueue` is invoked shortly after WhatsApp initialization, it may read `false` even though `isReady` just flipped to `true` in a different execution context. |
| **When** | Queue processing just after WhatsApp client becomes ready — during startup, after reconnection. |
| **Impact** | **Queue messages delayed by one polling cycle.** Messages that should be sent immediately wait for the next queue check. In a pharmacy context, order confirmations and refill reminders are delayed. |

---

### M15 — No Rate Limiting on Auth Endpoints (Brute Force Feasible)

| Field | Detail |
|-------|--------|
| **File** | `src/server.ts:104-110` |
| **Code** | Global rate limiter: 300 requests per 15 minutes per IP (all endpoints share this) |
| **What** | Auth/login endpoints have no special stricter rate limits. They share the same global 300/15min limit as the rest of the API. |
| **Why** | Auth endpoints need aggressive rate limiting (5-10 attempts per minute) to prevent brute force attacks on passwords and API keys. |
| **When** | Any brute force or credential stuffing attack. |
| **Impact** | **300 attempts per 15 minutes = 20 attempts per minute.** For a 4-digit PIN, full space can be brute-forced in < 1 hour. For alphanumeric passwords, still feasible. Combined with known defaults (C3, C6), effective security is near zero. |

---

## 🟡 MEDIUM — Tests (8 Issues)

### M-T1 — Shared Database State in `refills.test.ts` (Fragile Ordering)

| Field | Detail |
|-------|--------|
| **File** | `tests/refills.test.ts:53-140` |
| **What** | Tests share database state and depend on execution order: Test 1 creates a customer, Test 2 inserts medicines with hardcoded IDs, Test 3 references `inventory_id: 1` which depends on auto-increment from earlier inserts. |
| **When** | Running tests individually, in different order, or in parallel. |
| **Impact** | **Tests fail when run independently or in different order.** Fragile test suite that works by accident in CI but breaks in development workflows. |

---

### M-T2 — `paddleOcr.test.ts` — Weak OCR Validation

| Field | Detail |
|-------|--------|
| **File** | `tests/paddleOcr.test.ts:16,42-57` |
| **What** | Uses a 1x1 pixel transparent PNG as test image. OCR on this produces zero text and near-zero confidence. Test only checks properties are "defined" — never validates actual OCR correctness. |
| **When** | Each test run. |
| **Impact** | **Test provides false confidence.** A 90-second timeout suggests the test is expected to be unreliable. No verification that OCR actually extracts meaningful text from real medicine packaging. |

---

### M-T3 — Duplicate `.ts`/`.js` Test Files

| Field | Detail |
|-------|--------|
| **Files** | `tests/whatsapp/clientInit.test.ts` + `.js` |
| | `tests/whatsapp/client.test.ts` + `.js` |
| **What** | Four files testing identical functionality in both TypeScript and JavaScript. |
| **When** | Jest discovery runs both `.ts` and `.js` versions. |
| **Impact** | **Duplicate test execution.** Same tests run twice. Confusion about which is canonical. Maintenance burden doubled. If only one is updated, the other silently tests the wrong thing. |

---

### M-T4 — `catalogPipeline.test.ts` Runs Real `npm` Command

| Field | Detail |
|-------|--------|
| **File** | `tests/catalogPipeline.test.ts:25` |
| **Code** | `execSync('npm run enqueue-catalog', { ... })` |
| **What** | Test executes a real npm script via shell. Requires full `npm install`, TypeScript compilation via `tsx`, and database access. |
| **When** | Each test run. |
| **Impact** | **Heavy, slow, environment-dependent test.** Takes seconds to run. Fails if npm/node not properly configured. Produces side effects (database writes, temp files). Combined with T5 (production DB deletion), this is catastrophic. |

---

### M-T5 — `telegramPrescription.test.ts` — Critically Under-tested

| Field | Detail |
|-------|--------|
| **File** | `tests/telegramPrescription.test.ts:1-18` |
| **What** | Entire test file contains a single assertion: `expect(telegramPrescriptionService).toBeDefined()`. Comments acknowledge "Additional tests would go here, but we'll keep it simple for now." |
| **When** | Every test run. |
| **Impact** | **Complex cart/prescription workflow completely untested.** The Telegram prescription system handles medicine cart management, billing, and user interaction — all critical functionality with zero test coverage. |

---

### M-T6 — `pdfGenerator.test.ts` — Placeholder with Unused Import

| Field | Detail |
|-------|--------|
| **File** | `tests/pdf/pdfGenerator.test.ts:1-6` |
| **Code** | `import { createPdf } from '../../src/utils/pdfGenerator.js';` |
| | `test('placeholder', () => { expect(true).toBe(true); });` |
| **What** | Imports `createPdf` but never uses it. Test just asserts `true === true`. |
| **When** | Every test run. |
| **Impact** | **Zero-value test.** Provides no coverage for PDF generation. Import is dead code. Would pass even if `createPdf` is deleted or broken. Misleadingly suggests the PDF generator is tested. |

---

### M-T7 — `pdfGenerator.missing.test.ts` — Misleading Name

| Field | Detail |
|-------|--------|
| **File** | `tests/pdf/pdfGenerator.missing.test.ts:1-15` |
| **What** | Filename says "missing" but `src/utils/pdfGenerator.ts` does exist and exports `createPdf`. |
| **When** | Any developer reading the file list. |
| **Impact** | **Misleading semantics.** The test name suggests it was written for a module that didn't exist, but the module exists. Either the test is outdated or was never updated. Creates confusion about project state. |

---

### M-T8 — `sampleImages.test.ts` — No Cleanup of Temp Database

| Field | Detail |
|-------|--------|
| **File** | `tests/sampleImages.test.ts:16-17` |
| **What** | Creates a temporary SQLite database in a temp directory but the test file has no `afterAll` to clean it up. |
| **When** | Each test run. |
| **Impact** | **Temp directories accumulate.** Each run leaves behind a SQLite database in a temporary directory. Over repeated runs (especially in CI), this consumes disk space. |

---

## 🟢 LOW — Source Code (19 Issues)

### L1 — Stub/TODO Implementations

| File | Line | Issue |
|------|------|-------|
| `src/services/emailService.ts` | 685 | `// TODO: Implement actual attachment processing logic here` |
| `src/services/telegramPrescriptionService.ts` | 34 | `// TODO: Replace with database/persistent storage as per plan` |
| `src/services/telegramPrescriptionService.ts` | 78 | `// TODO: Implement persistent storage (database or file)` |

These features are partially implemented. The attachment processor for emails is a no-op. The Telegram prescription cart uses in-memory storage that resets on server restart.

---

### L2 — `Math.random()` for ID Generation

| File | Line | Issue |
|------|------|-------|
| `pharmacy-mobile/app/(tabs)/index.tsx` | 74, 131 | `id: Math.random().toString()` — not cryptographically secure, collision possible |
| `frontend/src/pages/POS.tsx` | 14 | `'P-' + Math.floor(100000 + Math.random() * 900000)` — collision risk in busy stores |

---

### L3 — Float Comparison for Loss Detection

| File | Line | Issue |
|------|------|-------|
| `frontend/src/pages/POS.tsx` | 526 | `const isLoss = cart.length > 0 && profitOrLoss < -0.001;` |

Floating-point imprecision could cause edge cases where small losses (e.g., -0.0005 Rs) are misclassified as profit.

---

### L4 — Camera Stream Not Released on Failed Init

| File | Line | Issue |
|------|------|-------|
| `frontend/src/components/AICamera.tsx` | 37-40 | `stopCamera` uses stale `stream` state if component unmounts before camera init completes |

Camera remains active (microphone/webcam LED stays on) after component unmounts.

---

### L5 — Wrong Tab's Cart Used in Calculations

| File | Line | Issue |
|------|------|-------|
| `frontend/src/pages/POS.tsx` | 510-526 | `profitOrLoss` and `grandTotal` use `cart` which may not reflect the active tab's cart |

POS has multiple order tabs (hold/resume). Switching tabs shows wrong totals.

---

### L6 — PDF Contents Logged to Console

| File | Line | Issue |
|------|------|-------|
| `src/routes/purchases.ts` | 39 | `console.log('PDF Text extracted (first 100 chars):', pdfData.text.substring(0, 100))` |

Customer/distributor purchase data leaked to stdout logs. GDPR/DPDP compliance issue.

---

### L7 — Graceful Shutdown Doesn't Stop Background Services

| File | Line | Issue |
|------|------|-------|
| `src/server.ts` | 429-432 | SIGINT handler only closes DB; cron jobs, WhatsApp client, catalog worker, SSE connections continue |

Data corruption risk on unclean shutdown. In-flight WhatsApp messages lost.

---

### L8 — WhatsApp Number Sanitization Strips International Prefix

| File | Line | Issue |
|------|------|-------|
| `src/whatsappClient.ts` | 139 | `chatId.replace(/\D/g, '')` strips all non-digits including `+` sign |

`+1` (US), `+44` (UK), `+61` (Australia) numbers become invalid. International customers unreachable.

---

### L9 — `wmic` Commands Windows-Only (License System Broken)

| File | Line | Issue |
|------|------|-------|
| `src/license/machineId.ts` | 27, 39, 44, 49 | `wmic` is Windows-only |

License/fingerprint subsystem fails entirely on Linux/macOS. Cannot generate machine ID. Dev machines can't run license validation.

---

### L10 — Upload Extension Filter Bypass

| File | Line | Issue |
|------|------|-------|
| `src/server.ts` | 84 | `/\.(csv|xlsx?|pdf|zip|jpg|jpeg|png|gif|bmp|tiff?)$/i` |

Only checks file extension in the filename. A file named `malware.exe.pdf` passes validation. No content-type verification.

---

### L11 — Inconsistent Upload Size Limits

| File | Line | Issue |
|------|------|-------|
| `src/server.ts` | 111 | `express.json({ limit: '1mb' })` limits JSON body |

Multer configured with 50MB limit but JSON body limited to 1MB. Large catalog imports may fail with confusing errors when sent as JSON.

---

### L12 — SSE Notifications No Heartbeat (Proxy Timeouts)

| File | Line | Issue |
|------|------|-------|
| `src/server.ts` | 335-352 | No periodic keepalive messages |

Proxies (Nginx, Cloudflare, corporate firewalls) time out idle SSE connections after 30-60s. Real-time notifications silently disconnect.

---

### L13 — Phone Parameter Stored Without Sanitization

| File | Line | Issue |
|------|------|-------|
| `src/routes/orders.ts` | 62 | `[product, requester \|\| 'Anonymous', phone \|\| '', qty \|\| 1, ...]` |

Raw phone input stored directly. Potential stored XSS if displayed in admin UI without escaping.

---

### L14 — No ID Validation in CRM Route

| File | Line | Issue |
|------|------|-------|
| `src/routes/crm.ts` | 92 | `const customerId = req.params.id;` — no numeric validation |

Route parameter used directly in DB queries. SQL injection risk via URL path, though mitigated by parameterized queries in most locations.

---

### L15 — `AbortSignal.timeout()` Requires Node 17+

| File | Line | Issue |
|------|------|-------|
| `src/license/licenseCheck.ts` | 78 | `{ signal: AbortSignal.timeout(10000) }` |

Crashes on Node 16 or older with `TypeError: AbortSignal.timeout is not a function`. Package.json targets `node18-win-x64` but doesn't enforce it.

---

### L16 — Mock Inbox Returned on IMAP Failure (Confusing)

| File | Line | Issue |
|------|------|-------|
| `src/services/emailService.ts` | 894-896 | Returns fake mock data when IMAP not configured |

Users think email polling works when it doesn't. Mock data could be mistaken for real distributor invoices, causing inventory discrepancies.

---

### L17 — URL Construction Without Encoding

| File | Line | Issue |
|------|------|-------|
| `src/services/apiClients/openFdaClient.ts` | 44 | `limit=1${apiKeyParam}` — no URL encoding |

Special characters in API key parameter break the URL. `&` in the key would be interpreted as a new parameter.

---

### L18 — Hardcoded Windows Chrome Paths

| File | Line | Issue |
|------|------|-------|
| `src/whatsappClient.ts` | 36-41 | `C:\Program Files\...` paths hardcoded |

Fails on any non-standard Chrome installation, portable Chrome, Chrome installed for current user only, or Linux/macOS.

---

### L19 — Startup License Check Commented Out

| File | Line | Issue |
|------|------|-------|
| `src/server.ts` | 23 | `// Startup check disabled permanently` |

License enforcement appears intentionally bypassed. Comment suggests this is permanent, not temporary. License system is effectively non-functional.

---

## 🟢 LOW — Tests (8 Issues)

### L-T1 — `utilities.test.ts` Leaves Artifacts

| File | Issue |
|------|-------|
| `tests/utilities.test.ts` | Creates files in `backup/` and `uploads/` relative to `process.cwd()` with no cleanup. |

### L-T2 — `dummy.test.ts` — Trivial Placeholder

| File | Issue |
|------|-------|
| `tests/dummy.test.ts` | `expect(true).toBe(true)` — zero value, should be deleted. |

### L-T3 — `clientRoot.test.ts` — Trivial Placeholder

| File | Issue |
|------|-------|
| `tests/clientRoot.test.ts` | Identical `expect(true).toBe(true)` — zero value. |

### L-T4 — `refills.test.ts` Hardcoded Medicine ID

| File | Line | Issue |
|------|------|-------|
| `tests/refills.test.ts` | 83 | `medicine_id: 101` assumes specific auto-increment ID — fragile. |

### L-T5 — Test Overlap: `utilities_smoke.test.ts` vs `utilities.test.ts`

| Files | Issue |
|-------|-------|
| `tests/utilities_smoke.test.ts` + `utilities.test.ts` | Significant test overlap. Both test the same `/utils/` routes with nearly identical setup. |

### L-T6 — `onlineEnrichment.test.ts` Incomplete Mock

| File | Line | Issue |
|------|------|-------|
| `tests/onlineEnrichment.test.ts` | 127 | Mock `fetch` stubs only `ok` and `json` but not `status`, `headers`, or other `Response` properties. |

### L-T7 — `aiCamera.test.ts` Shared Router Instance

| File | Issue |
|------|-------|
| `tests/aiCamera.test.ts` | Dynamic `import()` of router in each test relies on Node.js module cache — same `Router` instance reused across tests, potentially leaking middleware state. |

### L-T8 — `auth.test.ts` Fragile DB Connection

| File | Line | Issue |
|------|------|-------|
| `tests/auth.test.ts` | 44-53 | `afterEach` calls `dbManager.close()` which sets internal connection to `null`, but subsequent tests re-call `getConnection()` — works only because it reopens, but fragile. |

---

## 📊 SUMMARY

### By Severity

| Severity | Source Code | Tests | Total |
|----------|:-----------:|:-----:|:-----:|
| **🔴 Critical** | 7 | 5 | **12** |
| **🟠 High** | 11 | 0 | **11** |
| **🟡 Medium** | 15 | 8 | **23** |
| **🟢 Low** | 19 | 8 | **27** |
| **TOTAL** | **52** | **21** | **73** |

### By Category

| Category | Count | Top Severity |
|----------|:-----:|:------------:|
| **Security** | 16 | 🔴 (6 critical: API key, disabled auth, open CORS, disabled CSP, hardcoded creds, fallback key) |
| **Error Handling** | 9 | 🔴 (unhandled rejections + 19 empty catch blocks) |
| **SQL Injection** | 5+ | 🟠 (dynamic query building in 8+ route locations) |
| **Race Conditions** | 3 | 🟠 (WhatsApp client state, QR timer loop, stale closure) |
| **React/Rendering** | 8 | 🟠 (missing keys, dead state, infinite loop, no useCallback) |
| **TypeScript Erosion** | 5 | 🟡 (257+ `any` usages, unsafe casts, no validation) |
| **Data Loss Risk** | 4 | 🔴 (production DB deletion by test, temp file leak, upload collision, no graceful shutdown) |
| **Environment Lock-in** | 4 | 🟢 (Windows-only paths, Windows-only wmic, hardcoded Chrome paths, Node 17+ requirement) |
| **Test Quality** | 21 | 🔴 (5 critical: zero-assertions, crashing mocks, production DB deletion, wrong assertions) |

### Highest Priority Risks

1. **Security (🔴)** — Production API key in Git, authentication bypassed outside production, open CORS, disabled CSP, hardcoded admin passwords. The system is effectively wide open.

2. **Test Catastrophe (🔴)** — `catalogPipeline.test.ts` **deletes production database** on every `npm test` run. Three WhatsApp tests are permanently broken (wrong mocks, wrong assertions, real browser requirement).

3. **Data Loss (🔴/🟠)** — Orphaned temp files accumulate (disk full → crash), file uploads overwrite each other (data loss), no proper shutdown sequence (DB corruption risk).

4. **SQL Injection (🟠)** — Dynamic query building in migration, purchases, and sales routes allows full database compromise.

5. **Error Handling (🔴/🟠)** — 19+ empty catch blocks mask critical failures. No global unhandled rejection handler means any uncaught async error crashes the server.

---

*This report was generated by AI code audit on 2026-06-05. All findings are based on static code analysis. Some issues may require dynamic testing to confirm exploitability.*
