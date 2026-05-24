import { execSync } from 'child_process';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '..', 'data', 'app.db');

describe('Catalog pipeline', () => {
  beforeAll(() => {
    // Ensure a clean DB for the test run
    execSync('rm -f data/app.db');
  });

  test('enqueue adds a job', () => {
    // Prepare a dummy CSV file in catalog
    execSync('mkdir -p catalog');
    execSync('echo "name,api\nTestMed,http://example.com/api" > catalog/test.csv');
    // Run enqueue script
    execSync('npm run enqueue-catalog');
    // Verify a job exists in the DB
    return open({ filename: DB_PATH, driver: sqlite3.Database }).then(async (db) => {
      const row = await db.get('SELECT COUNT(*) as cnt FROM catalog_jobs');
      expect(row.cnt).toBeGreaterThan(0);
      await db.close();
    });
  });

  test('worker processes job and stores medicine', async () => {
    // Run worker for a short period
    const worker = execSync('node ./src/worker/catalogWorker.js', { timeout: 5000 });
    // After worker exits, check DB content
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const meds = await db.all('SELECT * FROM medicines');
    expect(meds.length).toBeGreaterThan(0);
    expect(meds[0].name).toBe('TestMed');
    await db.close();
  });
});
