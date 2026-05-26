import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';
import zlib from 'zlib';
import chokidar from 'chokidar';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import readline from 'readline';
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

  // Wait for migration to complete and propagate errors
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

    if (ext === '.sql') {
      migrationStatus.message = 'Parsing and Importing SQL Data...';
      await parseAndImportSQL(filePath);
      migrationStatus = { active: false, progress: 100, message: 'Migration Complete!', file: null };
      fs.renameSync(filePath, path.join(archiveDir, basename));
    }
    else if (ext === '.gz' || filePath.toLowerCase().endsWith('.sql.gz')) {
      migrationStatus.message = 'Decompressing GZIP file...';
      extractPath = path.join(TEMP_DIR, `extract_${Date.now()}`);
      fs.mkdirSync(extractPath, { recursive: true });
      const backupSqlPath = path.join(extractPath, 'decompressed_backup.sql');
      
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(zlib.createGunzip())
          .pipe(fs.createWriteStream(backupSqlPath))
          .on('close', resolve)
          .on('error', reject);
      });

      migrationStatus.message = 'Parsing and Importing SQL Data...';
      await parseAndImportSQL(backupSqlPath);
      migrationStatus = { active: false, progress: 100, message: 'Migration Complete!', file: null };
      fs.renameSync(filePath, path.join(archiveDir, basename));
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
          // Fallback: treat as gzipped SQL file
          const backupSqlPath = path.join(extractPath, 'extracted_backup.sql');
          await new Promise<void>((resolve, reject) => {
            fs.createReadStream(filePath)
              .pipe(zlib.createGunzip())
              .pipe(fs.createWriteStream(backupSqlPath))
              .on('close', resolve)
              .on('error', reject);
          });
        } else {
          throw new Error(`Failed to extract ZIP file: ${unzipError.message}`);
        }
      }

      migrationStatus.message = 'Scanning extracted files...';
      const files = fs.readdirSync(extractPath);
      const sqlFile = files.find(f => f.toLowerCase().endsWith('.sql'));
      if (!sqlFile) {
        throw new Error('No .sql file found in the ZIP archive');
      }

      migrationStatus.message = 'Parsing and Importing SQL Data...';
      await parseAndImportSQL(path.join(extractPath, sqlFile));
      migrationStatus = { active: false, progress: 100, message: 'Migration Complete!', file: null };
      fs.renameSync(filePath, path.join(archiveDir, basename));
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

      migrationStatus.message = 'Scanning extracted files...';
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

      const sqlFile = findSqlFile(extractPath);
      if (!sqlFile) {
        throw new Error('No .sql file found in the TAR archive');
      }

      migrationStatus.message = 'Parsing and Importing SQL Data...';
      await parseAndImportSQL(sqlFile);
      migrationStatus = { active: false, progress: 100, message: 'Migration Complete!', file: null };
      fs.renameSync(filePath, path.join(archiveDir, basename));
    }
    else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

  } catch (err: any) {
    console.error('Migration failed:', err);
    migrationStatus = { active: false, progress: 0, message: `Failed: ${err.message}`, file: null };
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

// A streaming SQL parser that uses specific parsers for known legacy tables
async function parseAndImportSQL(sqlPath: string) {
  migrationStatus.message = 'Parsing and Importing SQL Data...';

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
      // Skip empty lines but still count them for progress
      linesProcessed++;
      if (linesProcessed % 1000 === 0) {
        migrationStatus.progress = Math.min(99, Math.floor(linesProcessed / 1000));
        migrationStatus.message = `Processed ${linesProcessed} lines, migrated ${linesMigrated} rows...`;
      }
      continue;
    }

    let migrated = false;

    // Try returns parser first
    if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_RETURNS')) {
      migrated = await processReturnsLine(trimmedLine, db);
    }
    // Then try inventory parser for legacy stock/batches
    else if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_STOCK') ||
             trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_BATCHES')) {
      migrated = await processInventoryLine(trimmedLine, db);
    }
    // Then try sales parser for legacy sales/saleItems
    else if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALES') ||
             trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALEITEMS') ||
             trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALE_ITEMS')) {
      migrated = await processSalesLine(trimmedLine, db);
    }
    // For other lines, we don't attempt migration (but we still count the line)

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

  // Final status update
  migrationStatus.message = `Migration Complete! Processed ${linesProcessed} lines, migrated ${linesMigrated} rows`;
}