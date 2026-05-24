import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ensureSchema } from '../../src/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database schema', () => {
  const testDbPath = path.resolve(__dirname, 'test.db');

  beforeAll(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('creates patients table and expiry_date column', async () => {
    await ensureSchema(testDbPath);
    const db = await open({ filename: testDbPath, driver: sqlite3.Database });
    // Check patients table columns
    const patientsInfo = await db.all(`PRAGMA table_info(patients);`);
    const patientCols = patientsInfo.map((c:any) => c.name);
    expect(patientCols).toEqual(expect.arrayContaining([
      'id', 'name', 'whatsapp_number', 'refill_due_date', 'created_at', 'last_notified'
    ]));
    // Check medicines has expiry_date column
    const medsInfo = await db.all(`PRAGMA table_info(medicines);`);
    const medCols = medsInfo.map((c:any) => c.name);
    expect(medCols).toContain('expiry_date');
    await db.close();
  });
});
