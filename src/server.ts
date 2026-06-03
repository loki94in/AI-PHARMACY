import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { exec } from 'child_process';
import { authenticateApiKey } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { dbManager } from './database/connection.js';
import { extractFromPdf, extractFromCsv } from './extractor.js';
import { startWorker as startCatalogWorker } from './worker/catalogWorker.js';
import { ensureSchema } from './database.js';
import { eventService } from './services/eventService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', 'data', 'app.db');

// Startup check disabled permanently

// Agent 2 (CRM & Utilities) Routers
import crmRouter from './routes/crm.js';
import utilitiesRouter from './routes/utilities.js';
import securityRouter from './routes/security.js';
// Agent 1 (Core) Routers
import salesRouter from './routes/v1/sales.js';
import inventoryRouter from './routes/inventory.js';
import dashboardRouter from './routes/dashboard.js';
import purchasesRouter from './routes/purchases.js';
import returnsRouter from './routes/returns.js';
import ordersRouter from './routes/orders.js';
import expiryRouter from './routes/expiry.js';
import reportsRouter from './routes/reports.js';
import complianceRouter from './routes/compliance.js';
import emailRouter from './routes/email.js';
import migrationRouter from './routes/migration.js';
import settingsRouter from './routes/settings.js';
import dispatchRouter from './routes/dispatch.js';
import archiveRouter from './routes/archive.js';
import learningRouter from './routes/learning.js';
import messagingRouter from './routes/messaging.js';
import aiCameraRouter from './routes/aiCamera.js';
import telegramPrescriptionRouter from './routes/telegramPrescription.js';
import refillsRouter from './routes/refills.js';
import { whatsappQueue } from './services/whatsappQueue.js';
import cron from 'node-cron';
import { checkAllRefills } from './services/refillService.js';
import { checkOverdueCreditNotes, reconcileCreditNote } from './services/creditNoteService.js';

const app = express();

// Ensure uploads and temp directories exist
const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer storage config
const ALLOWED_UPLOAD_EXTENSIONS = /\.(csv|xlsx?|pdf|zip|jpg|jpeg|png|gif|bmp|tiff?)$/i;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + sanitized);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_EXTENSIONS.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP so inline scripts and styles in index.html can run
}));
app.use(cors({
  origin: (origin, callback) => {
    // Reflect the request origin back, or allow if no origin (e.g., server-to-server/mobile)
    if (!origin) return callback(null, true);
    callback(null, true);
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
app.use(express.json({ limit: '1mb' }));


app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// Serve the frontend UI
app.get('/', (req, res) => {
  res.redirect('/test');
});

// Serve the API test console
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-console.html'));
});

// Session token auth for all other API routes
app.use('/api', authenticateApiKey);

// File upload endpoint (Now async for background processing)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fullPath = req.file.path;
    const originalName = req.file.originalname || path.basename(fullPath);
    
    const db = await dbManager.getConnection();
    const result = await db.run(
      `INSERT INTO catalog_jobs (file_path, original_filename, status) VALUES (?, ?, 'pending')`,
      [fullPath, originalName]
    );
    await dbManager.close();

    res.json({ success: true, message: 'Processing in background', jobId: result.lastID });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error during upload' });
  }
});

app.get('/api/catalog/job/:id', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const job = await db.get(`SELECT * FROM catalog_jobs WHERE id = ?`, req.params.id);
    await dbManager.close();
    
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'done' && job.status !== 'ready_for_review') {
      return res.status(400).json({ error: 'Job is not ready yet', status: job.status });
    }
    
    res.json({ 
      success: true, 
      jobId: job.id, 
      extractedData: job.extracted_data ? JSON.parse(job.extracted_data) : [],
      original_filename: job.original_filename
    });
  } catch (error) {
    console.error('Fetch job error:', error);
    res.status(500).json({ error: 'Internal server error fetching job' });
  }
});

// New Catalog Import Endpoint (Receives confirmed preview data)
app.post('/api/catalog/import', async (req, res) => {
  const { medicines } = req.body;
  if (!Array.isArray(medicines)) {
    return res.status(400).json({ error: 'Invalid payload, expected array of medicines' });
  }
  
  try {
    const db = await dbManager.getConnection();
    
    for (const med of medicines) {
      if (!med.name) continue;
      
      const existing = await db.get(`SELECT id FROM medicines WHERE lower(name) = lower(?)`, med.name);
      if (existing) {
        const updates = [];
        const params = [];
        
        if (med.manufacturer) { updates.push("manufacturer = COALESCE(NULLIF(manufacturer, ''), ?)"); params.push(med.manufacturer); }
        if (med.marketed_by) { updates.push("marketed_by = COALESCE(NULLIF(marketed_by, ''), ?)"); params.push(med.marketed_by); }
        if (med.api_reference) { updates.push("api_reference = COALESCE(NULLIF(api_reference, ''), ?)"); params.push(med.api_reference); }
        if (med.strength) { updates.push("strength = COALESCE(NULLIF(strength, ''), ?)"); params.push(med.strength); }
        if (med.packaging_type) { updates.push("packaging = COALESCE(NULLIF(packaging, ''), ?)"); params.push(med.packaging_type); }
        
        if (updates.length > 0) {
            params.push(existing.id);
            const setClause = updates.join(', ');
            await db.run(`UPDATE medicines SET ${setClause} WHERE id = ?`, ...params);
        }
      } else {
        await db.run(
          `INSERT INTO medicines (name, api_reference, strength, packaging, manufacturer, marketed_by) VALUES (?, ?, ?, ?, ?, ?)`,
          med.name,
          med.api_reference || null,
          med.strength || null,
          med.packaging_type || null,
          med.manufacturer || null,
          med.marketed_by || null
        );
      }
    }
    
    await dbManager.close();
    res.json({ success: true, message: 'Catalog imported successfully' });
  } catch (error) {
    await dbManager.close();
    console.error('Import error:', error);
    res.status(500).json({ error: 'Internal server error during import' });
  }
});

// Medicines endpoint
app.get('/api/medicines', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const medicines = await db.all('SELECT * FROM medicines ORDER BY id DESC');
    await dbManager.close();
    res.json(medicines);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch medicines:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Purchases Engine APIs
app.get('/api/distributors', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const distributors = await db.all('SELECT * FROM distributors ORDER BY name');
    await dbManager.close();
    res.json(distributors);
  } catch (error) {
    await dbManager.close();
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/purchases', async (req, res) => {
  const { distributor, invoice_no, total_amount } = req.body;
  try {
    const db = await dbManager.getConnection();
    // Upsert distributor
    await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', distributor);
    const distRow = await db.get('SELECT id FROM distributors WHERE name = ?', distributor);

    // Insert purchase
    await db.run('INSERT INTO purchases (distributor_id, invoice_no, total_amount) VALUES (?, ?, ?)',
      [distRow.id, invoice_no, total_amount]);

    await dbManager.close();

    // Trigger checking refills now that new purchase stock is saved
    // This would be handled via events or services in a more complete refactor

    res.json({ success: true, message: 'Purchase saved' });
  } catch (error) {
    await dbManager.close();
    console.error('Failed to save purchase:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/returns/reconcile-credit', async (req, res) => {
  const { distributor_id, actual_credit_amount, purchase_id } = req.body;
  if (!distributor_id || actual_credit_amount === undefined) {
    return res.status(400).json({ error: 'distributor_id and actual_credit_amount are required' });
  }
  try {
    const db = await dbManager.getConnection();
    const result = await reconcileCreditNote(db, distributor_id, actual_credit_amount, purchase_id);
    await dbManager.close();
    res.json(result);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to reconcile credit note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API to fetch all catalog jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const jobs = await db.all('SELECT * FROM catalog_jobs ORDER BY created_at DESC');
    await dbManager.close();
    res.json(jobs);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mount Agent 2 Routers
app.use('/api/crm', crmRouter);
app.use('/api/utilities', utilitiesRouter);
app.use('/api/security', securityRouter);
app.use('/api/email', emailRouter);
app.use('/api/migration', migrationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/archive', archiveRouter);
app.use('/api/learning', learningRouter);
app.use('/api/messaging', messagingRouter);
app.use('/api/aicamera', aiCameraRouter);
app.use('/api/telegram-prescription', telegramPrescriptionRouter);
app.use('/api/refills', refillsRouter);
// Core API routes
app.use('/api/sales', salesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/expiry', expiryRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/compliance', complianceRouter);

// Real-time notifications SSE Stream
app.get('/api/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const listener = (eventData: any) => {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  eventService.on('server_event', listener);

  req.on('close', () => {
    eventService.removeListener('server_event', listener);
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to notifications stream' })}\n\n`);
});

// Manual refill reminder endpoint
app.post('/api/patients/send-refill', async (req, res) => {
  const { whatsapp_number, name } = req.body;
  if (!whatsapp_number) {
    return res.status(400).json({ error: 'WhatsApp number required' });
  }
  try {
    // Simple reminder text – can be templated later
    const message = `Hello ${name || ''}, your medication refill is due soon. Please visit the pharmacy.`;
    // This would use a notification/WhatsApp service
    res.json({ success: true, message: 'Reminder sent (placeholder)' });
  } catch (err) {
    console.error('WhatsApp send error:', err);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// Initialize services that need startup logic
// These would be initialized via dependency injection in a complete refactor

// Error handling middleware - should be last
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

ensureSchema(DB_PATH).then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}/test`);
    // whatsappQueue.startWorker(); // Disabled for testing
    // NOTE: Enable below line in production to send WhatsApp refill reminders via queue
    whatsappQueue.startWorker();
    startCatalogWorker().catch(err => console.error('Failed to start catalog worker:', err));

    // Run startup catch-up check for the 15-day expiry scan (handles PC downtime/off times)
    import('./services/expiryAlertService.js')
      .then(m => m.checkAndRunScheduledExpiryScan(90))
      .catch(err => console.error('Failed running startup catch-up scan check:', err));

  // Daily check at 9:00 AM for patient refills & overdue credit notes
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily patient refill & overdue credit notes check...');
    try {
      const db = await dbManager.getConnection();
      await checkAllRefills(db);
      await checkOverdueCreditNotes(db);
      await dbManager.close();
    } catch (err) {
      console.error('Failed running daily check cron:', err);
    }
  });

  // Automatic inventory near-expiry scan & WhatsApp alerts (Every 15 days at 9:00 AM)
  cron.schedule('0 9 1,16 * *', async () => {
    console.log('Running automatic 15-day near-expiry inventory scan...');
    try {
      const { runExpiryScanAndAlert } = await import('./services/expiryAlertService.js');
      await runExpiryScanAndAlert(90);
    } catch (err) {
      console.error('Failed running 15-day expiry scan cron:', err);
    }
  });

  // Daily licensing tasks disabled permanently
  });
}).catch(err => {
  console.error('Failed to initialize database schema:', err);
  process.exit(1);
});

// For graceful shutdown (handled manually for now)
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await dbManager.close();
  process.exit(0);
});