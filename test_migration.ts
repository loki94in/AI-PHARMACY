/**
 * Manual Migration Test Script
 * Runs the full PostgreSQL → SQLite migration on the backup file in MIGRATION SAMPEL.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { ensureSchema } from './src/database.js';
import { runManualMigration, migrationStatus } from './src/worker/migrationWorker.js';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
const MIGRATION_DIR = path.join(__dirname, 'MIGRATION SAMPEL');

async function main() {
  console.log('=== AI Pharmacy Migration Test ===');
  console.log('DB Path:', DB_PATH);
  console.log('Migration Dir:', MIGRATION_DIR);
  console.log('');

  // Step 1: Ensure schema is up to date
  console.log('[1/4] Ensuring database schema...');
  await ensureSchema(DB_PATH);
  console.log('Schema ready.\n');

  // Step 2: List available migration files
  const files = fs.readdirSync(MIGRATION_DIR).filter(f => {
    const lower = f.toLowerCase();
    return ['.zip', '.sql', '.gz', '.tgz'].some(ext => lower.endsWith(ext));
  });
  console.log('[2/4] Found migration files:', files);
  if (files.length === 0) {
    console.error('No migration files found in MIGRATION SAMPEL folder!');
    process.exit(1);
  }
  console.log('');

  // Step 3: Run migration
  const fileName = files[0];
  console.log(`[3/4] Starting migration: ${fileName}`);
  console.log('This may take 2-5 minutes for large files...\n');

  // Monitor progress in background
  const progressInterval = setInterval(() => {
    if (migrationStatus.active) {
      console.log(`  [${migrationStatus.progress}%] ${migrationStatus.message}`);
    }
  }, 5000);

  const startTime = Date.now();
  try {
    await runManualMigration(fileName);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nMigration completed in ${elapsed}s`);
  } catch (err) {
    console.error('\nMigration FAILED:', err);
    clearInterval(progressInterval);
    process.exit(1);
  }
  clearInterval(progressInterval);

  // Step 4: Verify results
  console.log('\n[4/4] Verifying results...');
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  const tables = [
    'medicines', 'distributors', 'customers', 'doctors',
    'inventory_master', 'purchases', 'purchase_items',
    'sales_invoices', 'sale_items',
    'returns', 'return_items', 'stock_ledger'
  ];

  console.log('\n┌─────────────────────┬───────────┬──────────────┐');
  console.log('│ Table               │ Total     │ From Legacy  │');
  console.log('├─────────────────────┼───────────┼──────────────┤');

  for (const tbl of tables) {
    try {
      const total = await db.get(`SELECT COUNT(*) as cnt FROM ${tbl}`);
      let legacy = { cnt: 0 };
      try {
        legacy = await db.get(`SELECT COUNT(*) as cnt FROM ${tbl} WHERE legacy_id IS NOT NULL`) || { cnt: 0 };
      } catch { /* table may not have legacy_id */ }
      const tblPad = tbl.padEnd(19);
      const totalPad = String(total?.cnt || 0).padStart(9);
      const legacyPad = String(legacy?.cnt || 0).padStart(12);
      console.log(`│ ${tblPad} │ ${totalPad} │ ${legacyPad} │`);
    } catch (err) {
      console.log(`│ ${tbl.padEnd(19)} │    ERROR  │       ERROR  │`);
    }
  }

  console.log('└─────────────────────┴───────────┴──────────────┘');

  // Show some sample data
  console.log('\n--- Sample Medicines ---');
  const meds = await db.all('SELECT id, name, manufacturer, category, legacy_id FROM medicines WHERE legacy_id IS NOT NULL LIMIT 5');
  console.table(meds);

  console.log('\n--- Sample Purchases ---');
  const purch = await db.all(`SELECT p.id, p.invoice_no, d.name as distributor, p.total_amount, p.legacy_id 
    FROM purchases p LEFT JOIN distributors d ON p.distributor_id = d.id 
    WHERE p.legacy_id IS NOT NULL LIMIT 5`);
  console.table(purch);

  console.log('\n--- Sample Sales ---');
  const sales = await db.all('SELECT id, invoice_no, total_amount, payment_medium, legacy_id FROM sales_invoices WHERE legacy_id IS NOT NULL LIMIT 5');
  console.table(sales);

  // Check report files
  const reportsDir = path.join(__dirname, 'data', 'migration_reports');
  if (fs.existsSync(reportsDir)) {
    console.log('\n--- Migration Reports ---');
    const reportFiles = fs.readdirSync(reportsDir);
    for (const rf of reportFiles) {
      const content = JSON.parse(fs.readFileSync(path.join(reportsDir, rf), 'utf8'));
      console.log(`\n${rf}:`);
      console.log(JSON.stringify(content, null, 2));
    }
  }

  await db.close();
  console.log('\n=== TEST COMPLETE ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
