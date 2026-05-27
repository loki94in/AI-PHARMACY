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

    // Mock path resolve in endpoints by setting environment/config if needed,
    // but since they use relative path resolve to __dirname, let's make sure
    // we create a file in the actual project uploads folder for integration testing if necessary.
    // For unit tests, we'll create a test file in the project uploads folder and clean it up.
    const projectUploads = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(projectUploads)) {
      fs.mkdirSync(projectUploads, { recursive: true });
    }

    // Write a test CSV file
    fs.writeFileSync(
      path.join(projectUploads, 'test_attachment_order.csv'),
      'medicine_name,qty,price\nParacetamol 650mg,50,12\nAmoxicillin 500mg,30,25'
    );

    const { default: emailRouter } = await import('../src/routes/email.js');
    app = express();
    app.use(express.json());
    app.use('/api/email', emailRouter);
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try {
      const projectUploads = path.resolve(process.cwd(), 'uploads');
      const testFile = path.join(projectUploads, 'test_attachment_order.csv');
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    } catch (_) {}
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
});
