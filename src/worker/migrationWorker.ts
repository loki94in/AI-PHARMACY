import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';
import zlib from 'zlib';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import readline from 'readline';

// PostgreSQL COPY parser
import { parseCopyHeader, parseCopyDataRow, isCopyEndMarker, isPgDump } from './parsers/pgCopyParser.js';

// Importers
import {
  clearAllMaps, categoryMap, manufacturerMap, distributorMap, doctorMap, patientMap, medicineMap,
  importCategory, importManufacturer, importDistributor, flushDistributors,
  importDoctor, flushDoctors, importPatient, flushPatients,
  importMedicine, flushMedicines,
} from './importers/pgMasterImporter.js';

import {
  batchMap, purchaseMap, clearPurchaseMap,
  importBatch, flushBatches,
  importInventory, flushPurchases,
  importInventoryMedicine, flushPurchaseItems,
} from './importers/pgPurchaseImporter.js';

import {
  salesInvoiceMap, clearSalesMap,
  importOrder, flushSalesInvoices,
  importOrderItem, flushSaleItems,
} from './importers/pgSalesImporter.js';

import {
  returnMap, clearReturnsMap,
  importReturnOrder, flushReturns,
  importReturnOrderItem, flushReturnItems,
  importStockEffect, flushStockLedger,
} from './importers/pgReturnsImporter.js';

// Legacy parsers (kept for backward compat with INSERT-style SQL files)
import { processReturnsLine } from './parsers/returnsParser.js';
import { processInventoryLine } from './parsers/inventoryParser.js';
import { processSalesLine } from './parsers/salesParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_DIR = path.join(PROJECT_ROOT, 'MIGRATION SAMPEL');
const TEMP_DIR = path.join(PROJECT_ROOT, 'data', 'temp_migration');
const DB_PATH = process.env.DB_PATH || path.join(PROJECT_ROOT, 'data', 'app.db');

export let migrationStatus = {
  active: false,
  progress: 0,
  message: 'Idle',
  file: null as string | null
};

// Ensure directories exist
if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export async function runManualMigration(fileName: string): Promise<void> {
  if (migrationStatus.active) {
    throw new Error('A migration is already in progress.');
  }
  const filePath = path.join(MIGRATION_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error('File does not exist in MIGRATION SAMPEL folder.');
  }
  
  const lowerFileName = fileName.toLowerCase();
  const allowedExtensions = ['.zip', '.sql', '.gz', '.tgz', '.tar.gz'];
  const isValid = allowedExtensions.some(ext => lowerFileName.endsWith(ext));
  
  if (!isValid) {
    throw new Error('Unsupported file format for migration. Supported formats: .zip, .sql, .sql.gz/gz, .tar.gz/tgz');
  }

  await processMigrationFile(filePath);
}

async function processMigrationFile(filePath: string) {
  let extractPath: string | undefined = undefined;
  try {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);
    migrationStatus = { active: true, progress: 0, message: 'Processing migration file...', file: basename };

    const archiveDir = path.join(PROJECT_ROOT, 'data', 'archived_migrations');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

    let sqlFilePath = filePath;

    if (ext === '.sql') {
      // Direct SQL file — use as-is
      sqlFilePath = filePath;
    }
    else if (ext === '.gz' || filePath.toLowerCase().endsWith('.sql.gz')) {
      migrationStatus.message = 'Decompressing GZIP file...';
      extractPath = path.join(TEMP_DIR, `extract_${Date.now()}`);
      fs.mkdirSync(extractPath, { recursive: true });
      sqlFilePath = path.join(extractPath, 'decompressed_backup.sql');
      
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(zlib.createGunzip())
          .pipe(fs.createWriteStream(sqlFilePath))
          .on('close', resolve)
          .on('error', reject);
      });
    }
    else if (ext === '.zip') {
      extractPath = path.join(TEMP_DIR, `extract_${Date.now()}`);
      fs.mkdirSync(extractPath, { recursive: true });
      try {
        await new Promise<void>((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(unzipper.Extract({ path: extractPath }))
            .on('close', resolve)
            .on('error', reject);
        });
      } catch (unzipError: any) {
        if (unzipError.message?.includes('invalid signature')) {
          sqlFilePath = path.join(extractPath, 'extracted_backup.sql');
          await new Promise<void>((resolve, reject) => {
            fs.createReadStream(filePath)
              .pipe(zlib.createGunzip())
              .pipe(fs.createWriteStream(sqlFilePath))
              .on('close', resolve)
              .on('error', reject);
          });
        } else {
          throw new Error(`Failed to extract ZIP file: ${unzipError.message}`);
        }
      }

      if (sqlFilePath === filePath) {
        // Need to find SQL file in extracted dir
        migrationStatus.message = 'Scanning extracted files...';
        const files = fs.readdirSync(extractPath);
        const sqlFile = files.find(f => f.toLowerCase().endsWith('.sql'));
        if (!sqlFile) {
          throw new Error('No .sql file found in the ZIP archive');
        }
        sqlFilePath = path.join(extractPath, sqlFile);
      }
    }
    else if (ext === '.tar' || ext === '.tgz' || filePath.toLowerCase().endsWith('.tar.gz')) {
      migrationStatus.message = 'Extracting TAR archive...';
      extractPath = path.join(TEMP_DIR, `extract_${Date.now()}`);
      fs.mkdirSync(extractPath, { recursive: true });

      const { execSync } = await import('child_process');
      try {
        execSync(`tar -xf "${filePath}" -C "${extractPath}"`);
      } catch (tarError: any) {
        throw new Error(`Failed to extract TAR archive: ${tarError.message}`);
      }

      const findSqlFile = (dir: string): string | null => {
        const list = fs.readdirSync(dir);
        for (const item of list) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const found = findSqlFile(fullPath);
            if (found) return found;
          } else if (item.toLowerCase().endsWith('.sql')) {
            return fullPath;
          }
        }
        return null;
      };

      const foundSql = findSqlFile(extractPath);
      if (!foundSql) {
        throw new Error('No .sql file found in the TAR archive');
      }
      sqlFilePath = foundSql;
    }
    else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    // Auto-detect format: PostgreSQL COPY or legacy INSERT
    migrationStatus.message = 'Detecting dump format...';
    const formatDetected = await detectDumpFormat(sqlFilePath);

    if (formatDetected === 'pg_dump') {
      migrationStatus.message = 'PostgreSQL dump detected — starting multi-pass import...';
      await parseAndImportPgDump(sqlFilePath);
    } else {
      migrationStatus.message = 'Legacy SQL format detected — parsing INSERT statements...';
      await parseAndImportLegacySQL(sqlFilePath);
    }

    migrationStatus = { active: false, progress: 100, message: 'Migration Complete!', file: null };

    // Archive the original file (don't archive if we read from archived_migrations)
    if (!filePath.includes('archived_migrations')) {
      fs.renameSync(filePath, path.join(archiveDir, basename));
    }

  } catch (err: any) {
    console.error('Migration failed:', err);
    migrationStatus = { active: false, progress: 0, message: `Failed: ${err.message}`, file: null };
    throw err; // Re-throw so caller knows it failed
  } finally {
    if (extractPath && fs.existsSync(extractPath)) {
      try {
        fs.rmSync(extractPath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup extraction directory:', cleanupError);
      }
    }
  }
}

/**
 * Detect if a SQL file is a PostgreSQL pg_dump or legacy INSERT-based format.
 */
async function detectDumpFormat(sqlPath: string): Promise<'pg_dump' | 'legacy'> {
  const fileStream = fs.createReadStream(sqlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  const headerLines: string[] = [];

  for await (const line of rl) {
    headerLines.push(line);
    if (headerLines.length >= 30) break;
  }
  rl.close();
  fileStream.destroy();

  return isPgDump(headerLines) ? 'pg_dump' : 'legacy';
}

/**
 * Multi-pass PostgreSQL dump importer.
 * 
 * Pass 1: Reference tables (category, manufacturer, distributor, doctor, patient)
 * Pass 2: Medicine master (286K rows)
 * Pass 3: Inventory & stock (batch, inventory, inventory_medicine)
 * Pass 4: Sales & returns (orders, order_item, return_orders, return_order_item, stock_effects)
 */
async function parseAndImportPgDump(sqlPath: string) {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  
  // Enable WAL mode for better concurrent write performance
  await db.run('PRAGMA journal_mode = WAL');
  await db.run('PRAGMA synchronous = NORMAL');
  await db.run('PRAGMA cache_size = -64000'); // 64MB cache

  // Clear all maps for a fresh import
  clearAllMaps();
  clearPurchaseMap();
  clearSalesMap();
  clearReturnsMap();

  // Prevent duplicate legacy records if the migration is run again
  const tablesWithLegacyId = [
    'medicines', 'distributors', 'customers', 'doctors',
    'purchases', 'purchase_items', 'sales_invoices', 'sale_items',
    'returns', 'return_items', 'stock_ledger'
  ];
  for (const table of tablesWithLegacyId) {
    try {
      await db.run(`DELETE FROM ${table} WHERE legacy_id IS NOT NULL`);
    } catch (err) {
      // Ignore if table/column does not exist
    }
  }
  try {
    await db.run(`DELETE FROM inventory_master WHERE legacy_batch_id IS NOT NULL`);
  } catch (err) {}

  const totalPasses = 4;
  const stats = {
    categories: 0,
    manufacturers: 0,
    distributors: 0,
    doctors: 0,
    patients: 0,
    medicines: 0,
    batches: 0,
    purchases: 0,
    purchaseItems: 0,
    salesInvoices: 0,
    saleItems: 0,
    returns: 0,
    returnItems: 0,
    stockLedger: 0,
  };

  // ─── PASS 1: Reference Tables ─────────────────────────────
  migrationStatus.message = 'Pass 1/4: Importing reference tables (distributors, doctors, patients)...';
  migrationStatus.progress = 5;

  await streamPgDump(sqlPath, {
    'category': (row) => { importCategory(row); stats.categories++; },
    'manufacturer': (row) => { importManufacturer(row); stats.manufacturers++; },
    'distributor': async (row) => { await importDistributor(row, db); stats.distributors++; },
    'doctor': async (row) => { await importDoctor(row, db); stats.doctors++; },
    'patient': async (row) => { await importPatient(row, db); stats.patients++; },
  });

  // Flush remaining batches
  await flushDistributors(db);
  await flushDoctors(db);
  await flushPatients(db);

  migrationStatus.message = `Pass 1 done: ${stats.categories} categories, ${stats.manufacturers} mfg, ${stats.distributors} distributors, ${stats.doctors} doctors, ${stats.patients} patients`;
  migrationStatus.progress = 20;
  console.log(migrationStatus.message);

  // ─── PASS 2: Medicine Master ──────────────────────────────
  migrationStatus.message = 'Pass 2/4: Importing medicines (this may take a moment)...';
  migrationStatus.progress = 25;

  await streamPgDump(sqlPath, {
    'medicine': async (row) => {
      await importMedicine(row, db);
      stats.medicines++;
      if (stats.medicines % 10000 === 0) {
        migrationStatus.message = `Pass 2/4: Imported ${stats.medicines} medicines...`;
        migrationStatus.progress = 25 + Math.min(20, Math.floor(stats.medicines / 15000));
      }
    },
  });

  await flushMedicines(db);

  migrationStatus.message = `Pass 2 done: ${stats.medicines} medicines imported`;
  migrationStatus.progress = 45;
  console.log(migrationStatus.message);

  // ─── PASS 3: Inventory & Stock ────────────────────────────
  migrationStatus.message = 'Pass 3/4: Importing purchases, batches, and inventory...';
  migrationStatus.progress = 50;

  await streamPgDump(sqlPath, {
    'batch': async (row) => { await importBatch(row, db); stats.batches++; },
    'inventory': async (row) => { await importInventory(row, db); stats.purchases++; },
    'inventory_medicine': async (row) => { await importInventoryMedicine(row, db); stats.purchaseItems++; },
  });

  await flushBatches(db);
  await flushPurchases(db);
  await flushPurchaseItems(db);

  migrationStatus.message = `Pass 3 done: ${stats.batches} batches, ${stats.purchases} purchases, ${stats.purchaseItems} purchase items`;
  migrationStatus.progress = 70;
  console.log(migrationStatus.message);

  // ─── PASS 4: Sales & Returns ──────────────────────────────
  migrationStatus.message = 'Pass 4/4: Importing sales, returns, and stock ledger...';
  migrationStatus.progress = 75;

  await streamPgDump(sqlPath, {
    'orders': async (row) => { await importOrder(row, db); stats.salesInvoices++; },
    'order_item': async (row) => { await importOrderItem(row, db); stats.saleItems++; },
    'return_orders': async (row) => { await importReturnOrder(row, db); stats.returns++; },
    'return_order_item': async (row) => { await importReturnOrderItem(row, db); stats.returnItems++; },
    'stock_effects': async (row) => { await importStockEffect(row, db); stats.stockLedger++; },
  });

  await flushSalesInvoices(db);
  await flushSaleItems(db);
  await flushReturns(db);
  await flushReturnItems(db);
  await flushStockLedger(db);

  migrationStatus.message = `Pass 4 done: ${stats.salesInvoices} invoices, ${stats.saleItems} sale items, ${stats.returns} returns, ${stats.stockLedger} stock movements`;
  migrationStatus.progress = 95;
  console.log(migrationStatus.message);

  // ─── Generate Summary Report ──────────────────────────────
  migrationStatus.message = 'Generating migration summary report...';
  await generateMigrationReport(db, stats);

  await db.close();

  migrationStatus.message = `Migration Complete! ${stats.medicines} medicines, ${stats.purchases} purchases, ${stats.salesInvoices} sales, ${stats.returns} returns imported.`;
  migrationStatus.progress = 100;
  console.log('=== MIGRATION COMPLETE ===');
  console.log(JSON.stringify(stats, null, 2));
}

/**
 * Stream a pg_dump SQL file and call handlers for matching tables.
 */
async function streamPgDump(
  sqlPath: string,
  handlers: Record<string, (row: Record<string, string | null>) => Promise<void> | void>
) {
  const fileStream = fs.createReadStream(sqlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let currentTable: string | null = null;
  let currentColumns: string[] = [];
  let activeHandler: ((row: Record<string, string | null>) => Promise<void> | void) | null = null;

  for await (const line of rl) {
    // Check for COPY header
    if (line.startsWith('COPY public.')) {
      const parsed = parseCopyHeader(line);
      if (parsed && handlers[parsed.table]) {
        currentTable = parsed.table;
        currentColumns = parsed.columns;
        activeHandler = handlers[parsed.table];
      } else {
        currentTable = null;
        activeHandler = null;
      }
      continue;
    }

    // Check for end of COPY data
    if (isCopyEndMarker(line)) {
      currentTable = null;
      currentColumns = [];
      activeHandler = null;
      continue;
    }

    // Process data row if we have an active handler
    if (activeHandler && currentColumns.length > 0) {
      const rowData = parseCopyDataRow(line, currentColumns);
      await activeHandler(rowData);
    }
  }

  rl.close();
  fileStream.destroy();
}

/**
 * Generate migration summary report files.
 */
async function generateMigrationReport(db: any, stats: any) {
  const reportsDir = path.join(PROJECT_ROOT, 'data', 'migration_reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  // Summary report
  const summary = {
    migration_date: new Date().toISOString(),
    source_format: 'PostgreSQL pg_dump',
    stats,
    id_maps: {
      distributors: distributorMap.size,
      doctors: doctorMap.size,
      patients_as_customers: patientMap.size,
      medicines: medicineMap.size,
      batches: batchMap.size,
      purchases: purchaseMap.size,
      sales_invoices: salesInvoiceMap.size,
      returns: returnMap.size,
    }
  };

  fs.writeFileSync(
    path.join(reportsDir, 'migration_summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Quick row-count verification from SQLite
  const counts: Record<string, number> = {};
  const tables = ['medicines', 'distributors', 'customers', 'doctors', 'inventory_master', 'purchases', 'purchase_items', 'sales_invoices', 'sale_items', 'returns', 'return_items', 'stock_ledger'];
  for (const tbl of tables) {
    try {
      const row = await db.get(`SELECT COUNT(*) as cnt FROM ${tbl}`);
      counts[tbl] = row?.cnt || 0;
    } catch {
      counts[tbl] = -1; // table doesn't exist
    }
  }

  fs.writeFileSync(
    path.join(reportsDir, 'row_counts.json'),
    JSON.stringify(counts, null, 2)
  );

  console.log('Migration reports saved to:', reportsDir);
}

/**
 * Legacy SQL parser (INSERT-based) — kept for backward compatibility.
 */
async function parseAndImportLegacySQL(sqlPath: string) {
  migrationStatus.message = 'Parsing and Importing SQL Data (legacy format)...';

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  const fileStream = fs.createReadStream(sqlPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let linesProcessed = 0;
  let linesMigrated = 0;

  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      linesProcessed++;
      if (linesProcessed % 1000 === 0) {
        migrationStatus.progress = Math.min(99, Math.floor(linesProcessed / 1000));
        migrationStatus.message = `Processed ${linesProcessed} lines, migrated ${linesMigrated} rows...`;
      }
      continue;
    }

    let migrated = false;

    if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_RETURNS')) {
      migrated = await processReturnsLine(trimmedLine, db);
    }
    else if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_STOCK') ||
             trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_BATCHES')) {
      migrated = await processInventoryLine(trimmedLine, db);
    }
    else if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALES') ||
             trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALEITEMS') ||
             trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALE_ITEMS')) {
      migrated = await processSalesLine(trimmedLine, db);
    }

    if (migrated) {
      linesMigrated++;
    }

    linesProcessed++;
    if (linesProcessed % 1000 === 0) {
      migrationStatus.progress = Math.min(99, Math.floor(linesProcessed / 1000));
      migrationStatus.message = `Processed ${linesProcessed} lines, migrated ${linesMigrated} rows...`;
    }
  }

  await db.close();
  migrationStatus.message = `Migration Complete! Processed ${linesProcessed} lines, migrated ${linesMigrated} rows`;
}