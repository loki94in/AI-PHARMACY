import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';
import zlib from 'zlib';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import readline from 'readline';
import { processReturnsLine } from './parsers/returnsParser';
import { processInventoryLine } from './parsers/inventoryParser';
import { processSalesLine } from './parsers/salesParser';
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
    file: null
};
// Ensure directories exist
if (!fs.existsSync(MIGRATION_DIR))
    fs.mkdirSync(MIGRATION_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR))
    fs.mkdirSync(TEMP_DIR, { recursive: true });
export async function runManualMigration(fileName) {
    if (migrationStatus.active) {
        throw new Error('A migration is already in progress.');
    }
    const filePath = path.join(MIGRATION_DIR, fileName);
    if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist in MIGRATION SAMPEL folder.');
    }
    if (!filePath.toLowerCase().endsWith('.zip')) {
        throw new Error('Only .zip files are supported for migration right now.');
    }
    // Fire and forget (runs in background)
    processZipMigration(filePath).catch(err => console.error(err));
}
async function processZipMigration(zipPath) {
    let extractPath = undefined;
    try {
        migrationStatus = { active: true, progress: 0, message: 'Extracting ZIP file...', file: path.basename(zipPath) };
        extractPath = path.join(TEMP_DIR, `extract_${Date.now()}`);
        fs.mkdirSync(extractPath, { recursive: true });
        // Stream unzip with fallback for fake zip files
        try {
            await new Promise((resolve, reject) => {
                fs.createReadStream(zipPath)
                    .pipe(unzipper.Extract({ path: extractPath }))
                    .on('close', resolve)
                    .on('error', reject);
            });
        }
        catch (unzipError) {
            // Check if it's the invalid signature error from unzipper
            if (unzipError.message?.includes('invalid signature')) {
                // Fallback: treat as gzipped SQL file
                const backupSqlPath = path.join(extractPath, 'extracted_backup.sql');
                await new Promise((resolve, reject) => {
                    fs.createReadStream(zipPath)
                        .pipe(zlib.createGunzip())
                        .pipe(fs.createWriteStream(backupSqlPath))
                        .on('close', resolve)
                        .on('error', reject);
                });
            }
            else {
                throw new Error(`Failed to extract ZIP file: ${unzipError.message}`);
            }
        }
        migrationStatus.message = 'Scanning extracted files...';
        // Find .sql files
        const files = fs.readdirSync(extractPath);
        const sqlFile = files.find(f => f.toLowerCase().endsWith('.sql'));
        if (!sqlFile) {
            throw new Error('No .sql file found in the ZIP archive');
        }
        migrationStatus.message = 'Parsing and Importing SQL Data...';
        await parseAndImportSQL(path.join(extractPath, sqlFile));
        migrationStatus = { active: false, progress: 100, message: 'Migration Complete!', file: null };
        // Move the processed zip to an archive folder so it doesn't trigger again
        const archiveDir = path.join(PROJECT_ROOT, 'data', 'archived_migrations');
        if (!fs.existsSync(archiveDir))
            fs.mkdirSync(archiveDir, { recursive: true });
        fs.renameSync(zipPath, path.join(archiveDir, path.basename(zipPath)));
    }
    catch (err) {
        console.error('Migration failed:', err);
        migrationStatus = { active: false, progress: 0, message: `Failed: ${err.message}`, file: null };
        // Clean up extraction directory on failure
        if (extractPath && fs.existsSync(extractPath)) {
            try {
                fs.rmdirSync(extractPath, { recursive: true });
            }
            catch (cleanupError) {
                console.warn('Failed to cleanup extraction directory:', cleanupError);
            }
        }
    }
    finally {
        // Ensure extraction directory is cleaned up on success too
        if (extractPath && fs.existsSync(extractPath)) {
            try {
                fs.rmdirSync(extractPath, { recursive: true });
            }
            catch (cleanupError) {
                console.warn('Failed to cleanup extraction directory:', cleanupError);
            }
        }
    }
}
// A streaming SQL parser that uses specific parsers for known legacy tables
async function parseAndImportSQL(sqlPath) {
    migrationStatus.message = 'Parsing and Importing SQL Data...';
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const rawDb = db.driver; // Get the underlying sqlite3 database
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
            migrated = await processReturnsLine(trimmedLine, rawDb);
        }
        // Then try inventory parser for legacy stock/batches
        else if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_STOCK') ||
            trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_BATCHES')) {
            migrated = await processInventoryLine(trimmedLine, rawDb);
        }
        // Then try sales parser for legacy sales/saleItems
        else if (trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALES') ||
            trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALEITEMS') ||
            trimmedLine.toUpperCase().startsWith('INSERT INTO LEGACY_SALE_ITEMS')) {
            migrated = await processSalesLine(trimmedLine, rawDb);
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
