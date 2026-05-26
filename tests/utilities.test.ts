// Integration tests for utilities routes
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureSchema } from '../src/database.js';

describe('Utilities routes', () => {
  let app: express.Express;
  let tmpDir: string;
  let dbPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'util-test-'));
    dbPath = path.join(tmpDir, 'app.db');
    await ensureSchema(dbPath);
    process.env.DB_PATH = dbPath;
    // Import router after setting DB_PATH
    const { default: utilitiesRouter } = await import('../src/routes/utilities.js');
    app = express();
    app.use(express.json());
    app.use('/utils', utilitiesRouter);
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  test('POST /utils/backup creates a backup file', async () => {
    const res = await request(app).post('/utils/backup');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const backupFilename = res.body.backupFilename as string;
    const backupPath = path.resolve(process.cwd(), 'backup', backupFilename);
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  test('GET /utils/barcode/:code returns PDF URL', async () => {
    const code = 'ABC123';
    const res = await request(app).get(`/utils/barcode/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pdfUrl).toMatch(new RegExp(`barcode_${code}_.*\\.pdf$`));
    const pdfPath = path.resolve(process.cwd(), 'uploads', path.basename(res.body.pdfUrl));
    expect(fs.existsSync(pdfPath)).toBe(true);
  });

  test('GET /utils/gmail/test returns success', async () => {
    const res = await request(app).get('/utils/gmail/test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Gmail connection OK');
  });

  test('GET /utils/whatsapp/test returns success', async () => {
    const res = await request(app).get('/utils/whatsapp/test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('WhatsApp connection OK');
  });

  test('POST /utils/whatsapp/send returns mock success', async () => {
    const res = await request(app).post('/utils/whatsapp/send').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('WhatsApp test message sent (mock)');
  });
});