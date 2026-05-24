import { execSync } from 'child_process';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { processJob } from '../src/worker/catalogWorker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'data', 'app.db');

describe('Catalog pipeline', () => {
  beforeAll(() => {
    // Ensure a clean DB for the test run
    if (fs.existsSync('data/app.db')) fs.unlinkSync('data/app.db');
  });

  test('enqueue adds a job', () => {
    // Prepare a dummy CSV file in isolated test catalog
    const testCatalog = path.resolve(__dirname, 'test-catalog');
    fs.mkdirSync(testCatalog, { recursive: true });
    fs.writeFileSync(path.join(testCatalog, 'test.csv'), 'name,api\nTestMed,http://example.com/api');
    // Run enqueue script
    execSync('npm run enqueue-catalog', {
      env: { ...process.env, CATALOG_DIR: testCatalog, DB_PATH }
    });
    // Verify a job exists in the DB
    return open({ filename: DB_PATH, driver: sqlite3.Database }).then(async (db) => {
      const row = await db.get('SELECT COUNT(*) as cnt FROM catalog_jobs');
      expect(row.cnt).toBeGreaterThan(0);
      await db.close();
    });
  });

  test('worker processes job and stores medicine', async () => {
    // Manually run the job processing
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const job = await db.get(`SELECT * FROM catalog_jobs WHERE status='pending' LIMIT 1`);
    expect(job).toBeDefined();
    await processJob(job);

    // After worker exits, check DB content
    const meds = await db.all('SELECT * FROM medicines');
    expect(meds.length).toBeGreaterThan(0);
    expect(meds[0].name).toBe('TestMed');
    await db.close();
  });
});
