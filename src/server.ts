import './database/sqlitePatch.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import { authenticateApiKey } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { dbManager } from './database/connection.js';
import { startWorker as startCatalogWorker } from './worker/catalogWorker.js';
import { ensureSchema } from './database.js';
import { startEmailPoller } from './worker/emailPoller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', 'data', 'app.db');

// Startup check disabled permanently

// Agent 2 (CRM & Utilities) Routers
import crmRouter from './routes/crm.js';
import utilitiesRouter from './routes/utilities.js';
import securityRouter from './routes/security.js';
// Agent 1 (Core) Routers
import salesRouter from './routes/sales.js';
import inventoryRouter from './routes/inventory.js';
import dashboardRouter from './routes/dashboard.js';
import purchasesRouter from './routes/purchases.js';
import returnsRouter from './routes/returns.js';
import customerReturnsRouter from './routes/customerReturns.js';
import ordersRouter from './routes/orders.js';
import expiryRouter from './routes/expiry.js';
import reportsRouter from './routes/reports.js';
import complianceRouter from './routes/compliance.js';
import emailRouter from './routes/email.js';
import migrationRouter from './routes/migration.js';
import settingsRouter from './routes/settings.js';
import pharmarackRouter from './routes/pharmarack.js';
import dispatchRouter from './routes/dispatch.js';
import archiveRouter from './routes/archive.js';
import learningRouter from './routes/learning.js';
import messagingRouter from './routes/messaging.js';
import aiCameraRouter from './routes/aiCamera.js';
import telegramPrescriptionRouter from './routes/telegramPrescription.js';
import refillsRouter from './routes/refills.js';
import waBusinessRouter from './routes/whatsappBusiness.js';
import licenseRouter from './routes/license.js';
import uploadRouter from './routes/upload.js';
import catalogRouter from './routes/catalog.js';
import medicinesRouter from './routes/medicines.js';
import enrichmentRouter from './routes/enrichment.js';
import distributorsRouter from './routes/distributors.js';
import notificationsRouter from './routes/notifications.js';
import './services/pushNotificationService.js';
import { whatsappQueue } from './services/whatsappQueue.js';
import cron from 'node-cron';
import { checkAllRefills } from './services/refillService.js';
import { checkOverdueCreditNotes, reconcileCreditNote } from './services/creditNoteService.js';
import { activityTracker } from './utils/activityTracker.js';
import { createBackup, initBackupScheduler } from './services/backupService.js';

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('CRITICAL: Uncaught Exception:', error);
});

const app = express();

app.use((req, res, next) => {
  activityTracker.recordActivity();
  next();
});

// Ensure uploads and temp directories exist
const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');
const RAW_DIR = path.resolve(__dirname, '..', 'catalogue', 'raw');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(RAW_DIR)) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}


// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP so inline scripts and styles in index.html can run
}));
const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // Vite dev server
  'http://localhost:3000',  // Production build
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests with no origin (e.g., mobile, Postman)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: origin ${origin} not allowed`));
  },
  credentials: true
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
}));
app.use(express.json({ limit: '15mb' }));


app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// Old test console routes have been removed. This server now acts purely as an API backend.

// WhatsApp Business webhook endpoints must be public (Meta sends requests without our API key)
// Only the GET and POST /webhook paths are public; other endpoints go through normal auth below.
app.use('/api/wa-business/webhook', waBusinessRouter);

// Session token auth for all other API routes
app.use('/api', authenticateApiKey);


// Mount Agent 2 Routers
app.use('/api/crm', crmRouter);
app.use('/api/utilities', utilitiesRouter);
app.use('/api/security', securityRouter);
app.use('/api/email', emailRouter);
app.use('/api/migration', migrationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/pharmarack', pharmarackRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/archive', archiveRouter);
app.use('/api/learning', learningRouter);
app.use('/api/messaging', messagingRouter);
app.use('/api/aicamera', aiCameraRouter);
app.use('/api/telegram-prescription', telegramPrescriptionRouter);
app.use('/api/refills', refillsRouter);
app.use('/api/wa-business', waBusinessRouter);
// Core API routes
app.use('/api/sales', salesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/customer-returns', customerReturnsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/expiry', expiryRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/license', licenseRouter);

app.use('/api', uploadRouter);
app.use('/api', catalogRouter);
app.use('/api', medicinesRouter);
app.use('/api', enrichmentRouter);
app.use('/api', distributorsRouter);
app.use('/api', notificationsRouter);



// Initialize services that need startup logic
// These would be initialized via dependency injection in a complete refactor

// Error handling middleware - should be last
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

ensureSchema(DB_PATH).then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}/test`);
    // Pre-initialize background services if automation is enabled in settings
    dbManager.getConnection()
      .then(async (db) => {
        await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
        const row = await db.get("SELECT value FROM app_settings WHERE key = 'automation_enabled'");
        await dbManager.close();

        if (row && row.value === 'true') {
          console.log('Background automation is ENABLED in settings. Initializing background services...');
          
          // 1. WhatsApp Pre-initialization
          const waRow = await dbManager.getConnection().then(async (innerDb) => {
            const r = await innerDb.get("SELECT value FROM app_settings WHERE key = 'whatsapp_enabled'");
            await dbManager.close();
            return r;
          });
          if (waRow && waRow.value === 'true') {
            console.log('WhatsApp is enabled, pre-initializing client in the background...');
            const { initClient } = await import('./whatsappClient.js');
            await initClient().catch(err => console.error('Background WhatsApp init failed:', err));
          }

          // 2. WhatsApp Queue Worker
          whatsappQueue.startWorker();

          // 3. Startup catch-up expiry scan (checks for downtime near-expiry alerts)
          import('./services/expiryAlertService.js')
            .then(m => m.checkAndRunScheduledExpiryScan(90))
            .catch(err => console.error('Failed running startup catch-up scan check:', err));

          // 4. Startup catch-up daily check (refills & overdue credit notes)
          dbManager.getConnection().then(async (innerDb) => {
            const d = new Date();
            const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const lastCheckRow = await innerDb.get("SELECT value FROM app_settings WHERE key = 'last_daily_check_date'");
            
            if (!lastCheckRow || lastCheckRow.value !== todayStr) {
              console.log(`Daily check was missed today (${todayStr}). Running startup catch-up daily check...`);
              try {
                await checkAllRefills(innerDb);
                await checkOverdueCreditNotes(innerDb);
                await innerDb.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_daily_check_date', ?)", [todayStr]);
                console.log('Startup catch-up daily check complete.');
              } catch (err) {
                console.error('Failed running startup catch-up daily check:', err);
              }
            } else {
              console.log(`Daily check has already been run today (${todayStr}). Skipping startup catch-up.`);
            }
            await dbManager.close();
          }).catch(err => console.error('Failed to run startup catch-up daily check database connection:', err));

          // 5. Daily check at 9:00 AM for patient refills & overdue credit notes
          cron.schedule('0 9 * * *', async () => {
            console.log('Running daily patient refill & overdue credit notes check...');
            try {
              const db = await dbManager.getConnection();
              await checkAllRefills(db);
              await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
              await checkOverdueCreditNotes(db);
              const d = new Date();
              const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_daily_check_date', ?)", [todayStr]);
              await dbManager.close();
            } catch (err) {
              console.error('Failed running daily check cron:', err);
            }
          });

          // 6. Automatic near-expiry inventory scan & alerts (Every 15 days at 9:00 AM)
          cron.schedule('0 9 1,16 * *', async () => {
            console.log('Running automatic 15-day near-expiry inventory scan...');
            try {
              const { runExpiryScanAndAlert } = await import('./services/expiryAlertService.js');
              await runExpiryScanAndAlert(90);
            } catch (err) {
              console.error('Failed running 15-day expiry scan cron:', err);
            }
          });

          // 7. Nightly 9:30 PM backup (pharmacy closing time)
          cron.schedule('30 21 * * *', async () => {
            console.log('[Backup] Running nightly 9:30 PM backup...');
            try {
              const result = await createBackup('Nightly 9:30 PM');
              console.log(`[Backup] Nightly backup created: ${result.filename}`);
            } catch (err) {
              console.error('[Backup] Nightly backup failed:', err);
            }
          });
        } else {
          console.log('Background automation is DISABLED in settings. Skipping background services.');
        }
      })
      .catch(err => console.error('Background automation init check failed:', err));

    // Backup scheduler is always enabled (reads frequency from app_settings)
    initBackupScheduler().catch(err => console.error('Failed to init backup scheduler:', err));

    // Email poller is always enabled
    try {
      startEmailPoller();
    } catch (err) {
      console.error('Failed to start email poller:', err);
    }

    // Catalog background worker is always enabled
    try {
      startCatalogWorker().catch(err => console.error('Failed to start catalog worker:', err));
    } catch (err) {
      console.error('Failed to start catalog worker:', err);
    }

  // Daily licensing tasks disabled permanently
  });
}).catch(err => {
  console.error('Failed to initialize database schema:', err);
  process.exit(1);
});

// Graceful shutdown with auto-backup
async function gracefulShutdown(signal: string) {
  console.log(`${signal} received. Creating shutdown backup...`);
  try {
    const result = await createBackup(`Shutdown (${signal})`);
    console.log(`[Backup] Shutdown backup created: ${result.filename}`);
  } catch (err) {
    console.error('[Backup] Shutdown backup failed:', err);
  }
  await dbManager.close();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));