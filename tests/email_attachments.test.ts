import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureSchema } from '../src/database.js';

describe('Email Attachments API', () => {
  let app: express.Express;
  let tmpDir: string;
  let dbPath: string;
  let uploadsDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-attachment-test-'));
    dbPath = path.join(tmpDir, 'app.db');
    await ensureSchema(dbPath);
    process.env.DB_PATH = dbPath;

    // Create a mock uploads directory inside our tmpDir
    uploadsDir = path.join(tmpDir, 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    process.env.UPLOADS_DIR = uploadsDir;

    // Write a test CSV file
    fs.writeFileSync(
      path.join(uploadsDir, 'test_attachment_order.csv'),
      'medicine_name,qty,price\nParacetamol 650mg,50,12\nAmoxicillin 500mg,30,25'
    );

    const { default: emailRouter } = await import('../src/routes/email.js');
    app = express();
    app.use(express.json());
    app.use('/api/email', emailRouter);
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  test('GET /api/email/attachments lists uploads files', async () => {
    const res = await request(app).get('/api/email/attachments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const hasTestFile = res.body.some((file: any) => file.filename === 'test_attachment_order.csv');
    expect(hasTestFile).toBe(true);
  });

  test('POST /api/email/attachments/parse imports items into inventory', async () => {
    const res = await request(app)
      .post('/api/email/attachments/parse')
      .send({ filename: 'test_attachment_order.csv' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });

  test('GET /api/email/attachments/preview serves text content of CSV', async () => {
    const res = await request(app)
      .get('/api/email/attachments/preview')
      .query({ filename: 'test_attachment_order.csv' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBe('text');
    expect(res.body.content).toContain('Paracetamol 650mg');
  });
});
