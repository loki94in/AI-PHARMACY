# Backend Services and APIs (src/)

This directory contains the Express.js server logic, database interactions, routes, and background services.

## Scope & Responsibilities
- **API Endpoints**: Defined in `src/routes/`.
- **Database**: Defined in `src/database.ts` and `src/database/`.
- **Integrations**: WhatsApp (`src/whatsappClient.ts`) and Telegram (`src/telegramBot.ts`).
- **Services**: Business logic modules in `src/services/` (e.g. `backupService.ts`, `emailService.ts`).

## Rules & Constraints
- Keep database operations secure, avoiding direct raw query concatenation.
- All new dependencies must be scanned using `scan_dependencies` before import.
- Run `node scripts/quick-update.mjs` after any updates to backend files.
