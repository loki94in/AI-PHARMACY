// Top-level import of PDF generator (expected to fail initially)
import '../src/utils/pdfGenerator.js';

import { execSync } from 'child_process';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runCatalogImport } from '../src/worker/catalogWorker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'data', 'app.test.db');

describe('Catalog pipeline', () => {
  beforeAll(async () => {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    // Initialize schema for the test database
    process.env.DB_PATH = DB_PATH;
    const { ensureSchema } = await import('../src/database.js');
    await ensureSchema(DB_PATH);
  });

  test('enqueue adds a job', () => {
    const testCatalog = path.resolve(__dirname, 'test-catalog');
    fs.mkdirSync(testCatalog, { recursive: true });
    fs.writeFileSync(path.join(testCatalog, 'test.csv'), 'name,api\nTestMed,http://example.com/api');
    execSync('npm run enqueue-catalog', {
      env: { ...process.env, CATALOG_DIR: testCatalog, DB_PATH },
    });
    return open({ filename: DB_PATH, driver: sqlite3.Database }).then(async (db) => {
      const row = await db.get('SELECT COUNT(*) as cnt FROM catalog_jobs');
      expect(row.cnt).toBeGreaterThan(0);
      await db.close();
    });
  }, 30000);

  test('worker processes job and stores medicine', async () => {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      "UPDATE catalog_jobs SET mapping_config = ? WHERE status='pending'",
      JSON.stringify({ name: 'name', api: 'api_reference' })
    );
    const job = await db.get(`SELECT * FROM catalog_jobs WHERE status='pending' LIMIT 1`);
    expect(job).toBeDefined();
    await runCatalogImport(job.id);
    const meds = await db.all('SELECT * FROM medicines');
    expect(meds.length).toBeGreaterThan(0);
    expect(meds[0].name).toBe('TestMed');
    await db.close();
  });

  test('worker merges multiple compositions and stores metadata', async () => {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Create a new CSV catalog file with multiple compositions and custom column
    const testCatalog = path.resolve(__dirname, 'test-catalog-multi');
    if (fs.existsSync(testCatalog)) fs.rmSync(testCatalog, { recursive: true });
    fs.mkdirSync(testCatalog, { recursive: true });
    fs.writeFileSync(path.join(testCatalog, 'multi.csv'), 'name,comp1,comp2,custom_box\nMultiMed,SaltA,SaltB,Box9');
    
    // Create new job in pending status
    await db.run(
      "INSERT INTO catalog_jobs (file_path, original_filename, status, mapping_config) VALUES (?, ?, 'pending', ?)",
      [
        path.join(testCatalog, 'multi.csv'),
        'multi.csv',
        JSON.stringify({ name: 'name', comp1: 'api_reference', comp2: 'api_reference', custom_box: 'metadata' })
      ]
    );

    const job = await db.get(`SELECT * FROM catalog_jobs WHERE original_filename='multi.csv' LIMIT 1`);
    expect(job).toBeDefined();

    await runCatalogImport(job.id);

    const meds = await db.all("SELECT * FROM medicines WHERE name='MultiMed'");
    expect(meds.length).toBe(1);
    expect(meds[0].api_reference).toBe('SaltA + SaltB');
    
    const parsedMetadata = JSON.parse(meds[0].metadata);
    expect(parsedMetadata.custom_box).toBe('Box9');

    await db.close();
    fs.rmSync(testCatalog, { recursive: true });
  });
});
