import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { initClient, sendMessage } from './whatsappClient.js';
import { telegramBotService } from './telegramBot.js';
import { ensureSchema } from './database.js';
import { startEmailPoller } from './worker/emailPoller.js';
import { imageArchiveService } from './services/imageArchiveService.js';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', 'data', 'app.db');
const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');

// Ensure uploads and temp directories exist
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

const app = express();

// Ensure DB schema is up to date
ensureSchema(DB_PATH).catch(err => console.error('Schema init error:', err));

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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

// Initialize services
// Telegram bot will initialize automatically via its constructor when imported
// Email poller is started below

// Serve UI static files
app.use('/ui', express.static(path.join(__dirname, 'ui')));
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// API to upload file and enqueue it directly
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fullPath = req.file.path;
    
    // Process image for archiving/H1-Rx detection
    const newPath = await imageArchiveService.processAndRouteImage(fullPath);
    const finalPath = newPath || fullPath;

    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(`INSERT OR IGNORE INTO catalog_jobs (file_path) VALUES (?)`, finalPath);
    await db.close();
    
    res.json({ success: true, message: 'File uploaded and queued for processing', file: req.file.filename });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API to fetch all extracted medicines
app.get('/api/medicines', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const medicines = await db.all('SELECT * FROM medicines ORDER BY id DESC');
    await db.close();
    res.json(medicines);
  } catch (error) {
    console.error('Failed to fetch medicines:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Purchases Engine APIs
app.get('/api/distributors', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const distributors = await db.all('SELECT * FROM distributors ORDER BY name');
    await db.close();
    res.json(distributors);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/purchases', async (req, res) => {
  const { distributor, invoice_no, total_amount } = req.body;
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // Upsert distributor
    await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', distributor);
    const distRow = await db.get('SELECT id FROM distributors WHERE name = ?', distributor);
    
    // Insert purchase
    await db.run('INSERT INTO purchases (distributor_id, invoice_no, total_amount) VALUES (?, ?, ?)', 
      [distRow.id, invoice_no, total_amount]);
      
    await db.close();
    res.json({ success: true, message: 'Purchase saved' });
  } catch (error) {
    console.error('Failed to save purchase:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API to fetch all catalog jobs
app.get('/api/jobs', async (_req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const jobs = await db.all('SELECT * FROM catalog_jobs ORDER BY created_at DESC');
    await db.close();
    res.json(jobs);
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;

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

// Manual refill reminder endpoint
app.post('/api/patients/send-refill', async (req, res) => {
  const { whatsapp_number, name } = req.body;
  if (!whatsapp_number) {
    return res.status(400).json({ error: 'WhatsApp number required' });
  }
  try {
    // Simple reminder text – can be templated later
    const message = `Hello ${name || ''}, your medication refill is due soon. Please visit the pharmacy.`;
    await sendMessage(whatsapp_number, undefined, message);
    res.json({ success: true, message: 'Reminder sent' });
  } catch (err) {
    console.error('WhatsApp send error:', err);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

initClient().catch(err => console.error('WhatsApp init error:', err));
startEmailPoller();
imageArchiveService.initJobs();

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
