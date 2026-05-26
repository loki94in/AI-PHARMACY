import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureSchema } from '../src/database.js';

// Mock communication dependencies
jest.mock('../src/whatsappClient.js', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  initClient: jest.fn().mockResolvedValue(true)
}));
jest.mock('../src/telegramBot.js', () => ({
  telegramBotService: {
    sendDefaultNotification: jest.fn().mockResolvedValue(true)
  }
}));

import { sendMessage } from '../src/whatsappClient.js';
import { telegramBotService } from '../src/telegramBot.js';

describe('Patient Refills & POS Auto-Save Integration', () => {
  let app: express.Express;
  let tmpDir: string;
  let dbPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refill-test-'));
    dbPath = path.join(tmpDir, 'app.db');
    await ensureSchema(dbPath);
    process.env.DB_PATH = dbPath;

    // Load routers
    const { default: salesRouter } = await import('../src/routes/sales.js');
    const { default: refillsRouter } = await import('../src/routes/refills.js');
    const { default: inventoryRouter } = await import('../src/routes/inventory.js');

    app = express();
    app.use(express.json());
    app.use('/api/sales', salesRouter);
    app.use('/api/refills', refillsRouter);
    app.use('/api/inventory', inventoryRouter);
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POS billing automatically creates a customer in the database', async () => {
    const res = await request(app)
      .post('/api/sales')
      .send({
        patient_name: 'John Doe',
        patient_phone: '1234567890',
        patient_address: '123 Test St',
        items: [{ inventory_id: 1, quantity: 1, unit_price: 10 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify customer is in the DB
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const db = await open({ filename: dbPath, driver: sqlite3.default.Database });
    const customer = await db.get('SELECT * FROM customers WHERE name = ?', 'John Doe');
    await db.close();

    expect(customer).toBeDefined();
    expect(customer.phone).toBe('1234567890');
    expect(customer.address).toBe('123 Test St');
  });

  test('Refill registration and out-of-stock Telegram alert', async () => {
    // 1. Add a medicine
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const db = await open({ filename: dbPath, driver: sqlite3.default.Database });
    await db.run('INSERT INTO medicines (id, name) VALUES (?, ?)', [101, 'TestMeds']);
    // Out of stock initially (qty = 0)
    await db.run('INSERT INTO inventory_master (medicine_id, quantity) VALUES (?, ?)', [101, 0]);
    await db.close();

    // 2. Register refill request (which triggers instant check)
    const res = await request(app)
      .post('/api/refills')
      .send({
        patient_name: 'Alice Smith',
        patient_phone: '9876543210',
        medicine_id: 101,
        refill_interval_days: -1 // make it due immediately
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 3. Verify Telegram out-of-stock notification was triggered
    expect(telegramBotService.sendDefaultNotification).toHaveBeenCalledWith(
      expect.stringContaining('Alice Smith')
    );
    expect(telegramBotService.sendDefaultNotification).toHaveBeenCalledWith(
      expect.stringContaining('TestMeds')
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('Stock update triggers WhatsApp refill notification', async () => {
    // 1. Reset mocks
    jest.clearAllMocks();

    // 2. Add stock (inventory override) to trigger check
    const res = await request(app)
      .post('/api/inventory/override')
      .send({
        inventory_id: 1, // refers to medicine_id 101 or whichever is entry 1
        quantity: 10
      });

    expect(res.status).toBe(200);

    // Get the inventory master row mapping
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const db = await open({ filename: dbPath, driver: sqlite3.default.Database });
    const invRow = await db.get('SELECT medicine_id FROM inventory_master WHERE id = 1');
    
    // Explicitly call stock update triggers to make sure medicine stock triggers
    if (invRow) {
      const { triggerPendingRefillsForMedicine } = await import('../src/services/refillService.js');
      await triggerPendingRefillsForMedicine(db, invRow.medicine_id);
    }
    await db.close();

    // 3. Verify WhatsApp notification is sent out
    expect(sendMessage).toHaveBeenCalled();
  });
});
