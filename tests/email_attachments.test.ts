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

    // Create special_orders table which is queried by inventory overrides
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const db = await open({ filename: dbPath, driver: sqlite3.default.Database });
    await db.exec(`
      CREATE TABLE IF NOT EXISTS special_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product TEXT,
        requester TEXT,
        phone TEXT,
        qty INTEGER,
        priority TEXT,
        status TEXT DEFAULT 'Pending',
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        notified INTEGER DEFAULT 0,
        pharmarack_distributor TEXT,
        pharmarack_rate REAL,
        pharmarack_mrp REAL,
        pharmarack_mapped INTEGER DEFAULT 0,
        pharmarack_scheme TEXT,
        advance_payment REAL DEFAULT 0.0,
        source_refill_id INTEGER DEFAULT NULL
      )
    `);
    await db.close();

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

  describe('isRealMedicineName validation', () => {
    let emailServiceInstance: any;
    
    beforeAll(async () => {
      const { emailService } = await import('../src/services/emailService.js');
      emailServiceInstance = emailService;
    });

    test('accepts valid medicine names', () => {
      expect(emailServiceInstance.isRealMedicineName('Paracetamol 650mg')).toBe(true);
      expect(emailServiceInstance.isRealMedicineName('Amoxicillin 500mg')).toBe(true);
      expect(emailServiceInstance.isRealMedicineName('Piracetam 800mg')).toBe(true);
      expect(emailServiceInstance.isRealMedicineName('Crocin')).toBe(true);
    });

    test('rejects junk layout and billing names', () => {
      expect(emailServiceInstance.isRealMedicineName('GRAND TOTAL')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('GST 18%')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('CGST 9%')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('Subtotal')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('Invoice Total')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('Discount 10%')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('ROUND OFF')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('Bank Details')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('Terms & Conditions')).toBe(false);
      expect(emailServiceInstance.isRealMedicineName('18%')).toBe(false);
    });

    test('extractOrderInfo filters out junk lines from body text', () => {
      const sampleEmail = {
        subject: 'Order from Nitin Agency',
        body: 'Here is the order summary:\n' +
              'Paracetamol 650mg Qty: 10\n' +
              'Amoxicillin 500mg Qty: 5\n' +
              'Subtotal: 1200\n' +
              'GST 18% Qty: 1\n' +
              'Grand Total Qty: 1',
        from: 'nitin@agency.com',
        attachments: []
      };
      
      const orderInfo = emailServiceInstance.extractOrderInfo(sampleEmail);
      const medicineNames = orderInfo.medicines.map((m: any) => m.name);
      
      expect(medicineNames).toContain('Paracetamol 650mg');
      expect(medicineNames).toContain('Amoxicillin 500mg');
      expect(medicineNames).not.toContain('GST 18%');
      expect(medicineNames).not.toContain('Grand Total');
      expect(medicineNames).not.toContain('Subtotal');
    });

    test('cleanupIgnoredEmailsInDb deletes matching emails and attachments', async () => {
      // 1. Initialize DB
      const { open } = await import('sqlite');
      const sqlite3 = await import('sqlite3');
      const db = await open({ filename: dbPath, driver: sqlite3.default.Database });
      
      // 2. Insert ignored_emails setting
      await db.run(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('ignored_emails', 'spam@distributor.com, block@sender.org')"
      );

      // 3. Insert mock emails (one to keep, one to ignore)
      await db.run(
        `INSERT INTO emails (uid, from_addr, subject, body, is_order) 
         VALUES (2001, 'legit@distributor.com', 'Valid Order', 'Paracetamol 650mg x10', 1)`
      );
      await db.run(
        `INSERT INTO emails (uid, from_addr, subject, body, is_order) 
         VALUES (2002, 'spam@distributor.com', 'Junk Mail', 'Buy viagra', 0)`
      );
      await db.run(
        `INSERT INTO emails (uid, from_addr, subject, body, is_order) 
         VALUES (2003, 'other@block@sender.org', 'Blocked Address', 'Ignore me', 0)`
      );

      // 4. Insert mock attachments
      await db.run(
        `INSERT INTO email_attachments (uid, filename, local_path) 
         VALUES (2002, 'spam.pdf', 'dummy_path_spam.pdf')`
      );
      await db.run(
        `INSERT INTO email_attachments (uid, filename, local_path) 
         VALUES (2001, 'invoice.pdf', 'dummy_path_invoice.pdf')`
      );

      // 5. Run the cleanup method
      await emailServiceInstance.cleanupIgnoredEmailsInDb(db);

      // 6. Verify that spam@distributor.com and block@sender.org emails and their attachments were deleted, but legit@distributor.com was preserved
      const remainingEmails = await db.all('SELECT uid FROM emails WHERE uid IN (2001, 2002, 2003)');
      const remainingAttachments = await db.all('SELECT id FROM email_attachments WHERE uid IN (2001, 2002, 2003)');

      expect(remainingEmails.map(e => e.uid)).toContain(2001);
      expect(remainingEmails.map(e => e.uid)).not.toContain(2002);
      expect(remainingEmails.map(e => e.uid)).not.toContain(2003);

      expect(remainingAttachments.length).toBe(1);

      // Cleanup
      await db.run("DELETE FROM emails WHERE uid IN (2001, 2002, 2003)");
      await db.run("DELETE FROM email_attachments WHERE uid IN (2001, 2002, 2003)");
      await db.run("DELETE FROM app_settings WHERE key = 'ignored_emails'");
      await db.close();
    });
  });
});
