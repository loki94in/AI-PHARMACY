import fs from 'fs';
import path from 'path';
import { dbManager } from '../database/connection.js';
import { ensureSchema } from '../database.js';
import { extractFromPdf, ExtractedMedicine } from '../extractor.js';
import { eventService } from '../services/eventService.js';
import { activityTracker } from '../utils/activityTracker.js';
import csvParser from 'csv-parser';
import * as XLSX from 'xlsx';
import XLSX_default from 'xlsx';
const XLSX_import = (XLSX as any).readFile ? XLSX : XLSX_default;

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

export async function preScanCsv(filePath: string, onProgress?: (rowIdx: number) => void): Promise<{
  totalCount: number;
  existingCount: number;
  newCount: number;
  duplicateCount: number;
}> {
  const db = await dbManager.getConnection();
  const rows = await db.all('SELECT name FROM medicines');
  
  const existingNames = new Set<string>();
  for (const r of rows) {
    if (r.name) existingNames.add(r.name.toLowerCase().trim());
  }

  const seenInCsv = new Set<string>();
  let totalCount = 0;
  let existingCount = 0;
  let newCount = 0;
  let duplicateCount = 0;

  return new Promise((resolve, reject) => {
    let nameCol = '';
    let processedRows = 0;

    const readStream = fs.createReadStream(filePath);
    const parserStream = readStream.pipe(csvParser());

    parserStream.on('headers', (headers: string[]) => {
      nameCol = headers.find((c) => /name|brand/i.test(c)) ||
                headers.find((c) => /product|item|inn|title/i.test(c)) ||
                headers[0] || '';
    });

    parserStream.on('data', (row: any) => {
      processedRows++;
      if (onProgress && processedRows % 5000 === 0) {
        onProgress(processedRows);
      }

      if (!nameCol) return;
      const nameRaw = row[nameCol];
      if (!nameRaw) return;

      const nameNorm = nameRaw.trim().replace(/\s+/g, ' ');
      if (!nameNorm) return;

      const nameKey = nameNorm.toLowerCase();

      totalCount++;
      if (seenInCsv.has(nameKey)) {
        duplicateCount++;
      } else {
        seenInCsv.add(nameKey);
        if (existingNames.has(nameKey)) {
          existingCount++;
        } else {
          newCount++;
        }
      }
    });

    parserStream.on('end', () => {
      resolve({
        totalCount,
        existingCount,
        newCount,
        duplicateCount
      });
    });

    parserStream.on('error', (err) => {
      reject(err);
    });
  });
}

// Helper to parse CSV headers and preview rows
async function readCsvPreview(filePath: string, maxRows = 10): Promise<{ headers: string[], rows: any[] }> {
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    let headers: string[] = [];
    if (!fs.existsSync(filePath)) return resolve({ headers, rows });

    const stream = fs.createReadStream(filePath).pipe(csvParser());

    stream.on('headers', (h: string[]) => {
      headers = h;
    });

    stream.on('data', (row: any) => {
      if (rows.length < maxRows) {
        rows.push(row);
      } else {
        stream.destroy();
      }
    });

    stream.on('end', () => {
      resolve({ headers, rows });
    });

    stream.on('close', () => {
      resolve({ headers, rows });
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

async function getSuggestedMapping(headers: string[], db: any): Promise<Record<string, string>> {
  const suggested: Record<string, string> = {};
  const headerKey = headers.slice().sort().join(',');

  try {
    const matched = await db.get('SELECT mapping_json FROM catalog_mappings WHERE file_headers = ?', headerKey);
    if (matched && matched.mapping_json) {
      return JSON.parse(matched.mapping_json);
    }
  } catch (err) {
    console.warn('Smart learning mapping load failed:', err);
  }

  for (const h of headers) {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/name|brand|product|item|inn|title|description/i.test(norm)) {
      suggested[h] = 'name';
    } else if (/api|composition|generic|salt|formula|active|molecule/i.test(norm)) {
      suggested[h] = 'api_reference';
    } else if (/strength|dosage|potency|mg|ml/i.test(norm)) {
      suggested[h] = 'strength';
    } else if (/pack|dosageform|packaging|type|unit/i.test(norm)) {
      suggested[h] = 'packaging';
    } else if (/mfg|manufactur|applicant|vendor|supplier|company|maker/i.test(norm)) {
      suggested[h] = 'manufacturer';
    } else if (/mkt|market/i.test(norm)) {
      suggested[h] = 'marketed_by';
    } else if (/hsn/i.test(norm)) {
      suggested[h] = 'hsn_code';
    } else if (/schedule/i.test(norm)) {
      suggested[h] = 'schedule_type';
    } else if (/mrp|price|selling|rate/i.test(norm)) {
      suggested[h] = 'mrp';
    } else if (/cgst/i.test(norm)) {
      suggested[h] = 'cgst';
    } else if (/sgst|gst/i.test(norm)) {
      suggested[h] = 'sgst';
    } else if (/rack|shelf|location/i.test(norm)) {
      suggested[h] = 'rack';
    } else if (/qty|quantity|stock|count|avail/i.test(norm)) {
      suggested[h] = 'quantity';
    } else if (/batch|lot/i.test(norm)) {
      suggested[h] = 'batch_no';
    } else if (/exp/i.test(norm)) {
      suggested[h] = 'expiry_date';
    } else {
      suggested[h] = '';
    }
  }
  return suggested;
}

export async function runCatalogAnalysis(jobId: number) {
  const db = await dbManager.getConnection();
  
  const updatedJob = await db.run(
    "UPDATE catalog_jobs SET status = 'processing_analysis', progress = 0, error_log = NULL WHERE id = ? AND status = 'pending_analysis'",
    jobId
  );
  
  if (updatedJob.changes === 0) {
        return;
  }

  const job = await db.get('SELECT * FROM catalog_jobs WHERE id = ?', jobId);
  if (!job) {
        return;
  }

  eventService.broadcast('catalog_job_update', { id: jobId, status: 'processing', progress: 0 });

  try {
    const ext = path.extname(job.file_path).toLowerCase();
    let headers: string[] = [];
    let previewData: any[] = [];
    let totalCount = 0;
    let newCount = 0;
    let existingCount = 0;
    let duplicateCount = 0;

    if (ext === '.csv') {
      const csvPreview = await readCsvPreview(job.file_path, 50);
      headers = csvPreview.headers;
      previewData = csvPreview.rows;

      // Compute actual counts using preScanCsv
      const scanResult = await preScanCsv(job.file_path);
      totalCount = scanResult.totalCount;
      newCount = scanResult.newCount;
      existingCount = scanResult.existingCount;
      duplicateCount = scanResult.duplicateCount;
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX_import.readFile(job.file_path);
      const sheetName = workbook.SheetNames[0];
      if (sheetName) {
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX_import.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        if (sheetData.length > 0) {
          headers = sheetData[0].map((h: any, idx: number) => h ? String(h).trim() : `Column_${idx + 1}`);
          previewData = sheetData.slice(1, 51).map((row: any[]) => {
            const rowObj: Record<string, any> = {};
            headers.forEach((header, idx) => {
              rowObj[header] = row[idx] !== undefined ? row[idx] : '';
            });
            return rowObj;
          });
          totalCount = Math.max(0, sheetData.length - 1);
        }
      }
    } else if (ext === '.pdf') {
      const extracted = await extractFromPdf(job.file_path);
      previewData = extracted.slice(0, 50).map(item => ({
        'Product Name': item.name,
        'Composition': item.api_reference || '',
        'Strength': item.strength || '',
        'Packaging': item.packaging_type || '',
        'Manufacturer': item.manufacturer || '',
        'Marketed By': item.marketed_by || ''
      }));
      headers = ['Product Name', 'Composition', 'Strength', 'Packaging', 'Manufacturer', 'Marketed By'];
      totalCount = extracted.length;
    } else {
      throw new Error('Unsupported file format.');
    }

    const suggestedMapping = await getSuggestedMapping(headers, db);

    const extractedJson = JSON.stringify({ headers, previewData, suggestedMapping });

    await db.run(
      `UPDATE catalog_jobs SET status = 'waiting_for_mapping', extracted_data = ?, total_count = ?, new_count = ?, existing_count = ?, duplicate_count = ? WHERE id = ?`,
      [extractedJson, totalCount, newCount, existingCount, duplicateCount, jobId]
    );

    eventService.broadcast('catalog_job_update', { 
      id: jobId, 
      status: 'waiting_for_mapping', 
      progress: 100,
      total_count: totalCount,
      new_count: newCount,
      existing_count: existingCount,
      duplicate_count: duplicateCount
    });
  } catch (err: any) {
    console.error('Analysis failed', err);
    await db.run("UPDATE catalog_jobs SET status = 'failed', error_log = ? WHERE id = ?", [err.message || 'Unknown error', jobId]);
    eventService.broadcast('catalog_job_update', { id: jobId, status: 'failed', error: err.message });
  } finally {
      }
}

export async function runCatalogImport(jobId: number) {
  const db = await dbManager.getConnection();
  
  // Use a state lock to prevent concurrent ingestion of the same job
  const updatedJob = await db.run(
    "UPDATE catalog_jobs SET status = 'processing', progress = 0, error_log = NULL WHERE id = ? AND status = 'pending'",
    jobId
  );
  
  if (updatedJob.changes === 0) {
    // Already running or not pending
    const checkJob = await db.get('SELECT status FROM catalog_jobs WHERE id = ?', jobId);
        if (checkJob && checkJob.status === 'processing') {
      console.log(`[Worker] Job ${jobId} is already being processed. Skipping duplicate run.`);
    }
    return;
  }

  const job = await db.get('SELECT * FROM catalog_jobs WHERE id = ?', jobId);
  if (!job) {
        throw new Error('Catalog job not found');
  }

  eventService.broadcast('catalog_job_update', { id: jobId, status: 'processing', progress: 0 });

  try {
    const ext = path.extname(job.file_path).toLowerCase();
    
    // Parse mappings configuration
    const mapping = JSON.parse(job.mapping_config || '{}');
    const nameCol = Object.keys(mapping).find(key => mapping[key] === 'name');
    const apiCol = Object.keys(mapping).find(key => mapping[key] === 'api_reference');
    const strCol = Object.keys(mapping).find(key => mapping[key] === 'strength');
    const pkgCol = Object.keys(mapping).find(key => mapping[key] === 'packaging');
    const mfgCol = Object.keys(mapping).find(key => mapping[key] === 'manufacturer');
    const mktCol = Object.keys(mapping).find(key => mapping[key] === 'marketed_by');
    const hsnCol = Object.keys(mapping).find(key => mapping[key] === 'hsn_code');
    const schCol = Object.keys(mapping).find(key => mapping[key] === 'schedule_type');
    const mrpCol = Object.keys(mapping).find(key => mapping[key] === 'mrp');
    const cgstCol = Object.keys(mapping).find(key => mapping[key] === 'cgst');
    const sgstCol = Object.keys(mapping).find(key => mapping[key] === 'sgst');
    const rackCol = Object.keys(mapping).find(key => mapping[key] === 'rack');
    
    // Stock mapping columns
    const qtyCol = Object.keys(mapping).find(key => mapping[key] === 'quantity');
    const batchCol = Object.keys(mapping).find(key => mapping[key] === 'batch_no');
    const expCol = Object.keys(mapping).find(key => mapping[key] === 'expiry_date');

    const rows: any[] = [];
    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX_import.readFile(job.file_path);
      const sheetName = workbook.SheetNames[0];
      if (sheetName) {
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX_import.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        if (sheetData.length > 0) {
          const headers = sheetData[0].map((h: any, idx: number) => h ? String(h).trim() : `Column_${idx + 1}`);
          const excelRows = sheetData.slice(1).map((row: any[]) => {
            const rowObj: Record<string, any> = {};
            headers.forEach((header, idx) => {
              rowObj[header] = row[idx] !== undefined ? row[idx] : '';
            });
            return rowObj;
          });
          rows.push(...excelRows);
        }
      }
    } else if (ext === '.pdf') {
      const extracted = await extractFromPdf(job.file_path);
      const pdfRows = extracted.map(item => ({
        'Product Name': item.name,
        'Composition': item.api_reference || '',
        'Strength': item.strength || '',
        'Packaging': item.packaging_type || '',
        'Manufacturer': item.manufacturer || '',
        'Marketed By': item.marketed_by || ''
      }));
      rows.push(...pdfRows);
    }

    // Dynamic row counting for CSV progress tracking
    let totalToProcess = 1;
    if (ext === '.csv') {
      totalToProcess = await new Promise<number>((resolve) => {
        let count = 0;
        const countStream = fs.createReadStream(job.file_path);
        countStream
          .pipe(csvParser())
          .on('data', () => { count++; })
          .on('end', () => {
            countStream.destroy();
          })
          .on('close', () => {
            // Wait for file lock to fully release on Windows
            setTimeout(() => resolve(count), 500);
          })
          .on('error', () => resolve(1));
      });
    } else {
      totalToProcess = rows.length;
    }

    await db.run('UPDATE catalog_jobs SET total_count = ? WHERE id = ?', [totalToProcess, jobId]);

    // Fetch existing database medicines for duplication check
    const dbRows = await db.all('SELECT id, name FROM medicines');
    const existingMedicinesMap = new Map<string, number>();
    for (const r of dbRows) {
      if (r.name) existingMedicinesMap.set(r.name.toLowerCase().trim(), r.id);
    }

    const batchSize = 1000;
    let batch: any[] = [];
    let processedCount = 0;
    let newCount = 0;
    let existingCount = 0;
    let duplicateCount = 0;
    const addedNames = new Set<string>();

    const insertBatch = async (items: any[]) => {
      await activityTracker.waitUntilIdle();
      await db.run('BEGIN TRANSACTION');
      for (const item of items) {
        const key = item.name.toLowerCase().trim();
        if (addedNames.has(key)) {
          duplicateCount++;
          continue;
        }
        addedNames.add(key);

        let medId = existingMedicinesMap.get(key);

        if (medId) {
          existingCount++;
          // Update / Merge existing medicine mapping fields
          const updates: string[] = [];
          const params: any[] = [];

          if (item.api_reference !== undefined) { updates.push("api_reference = COALESCE(NULLIF(api_reference, ''), ?)"); params.push(item.api_reference); }
          if (item.strength !== undefined) { updates.push("strength = COALESCE(NULLIF(strength, ''), ?)"); params.push(item.strength); }
          if (item.packaging !== undefined) { updates.push("packaging = COALESCE(NULLIF(packaging, ''), ?)"); params.push(item.packaging); }
          if (item.manufacturer !== undefined) { updates.push("manufacturer = COALESCE(NULLIF(manufacturer, ''), ?)"); params.push(item.manufacturer); }
          if (item.marketed_by !== undefined) { updates.push("marketed_by = COALESCE(NULLIF(marketed_by, ''), ?)"); params.push(item.marketed_by); }
          if (item.hsn_code !== undefined) { updates.push("hsn_code = COALESCE(NULLIF(hsn_code, ''), ?)"); params.push(item.hsn_code); }
          if (item.schedule_type !== undefined) { updates.push("schedule_type = COALESCE(NULLIF(schedule_type, ''), ?)"); params.push(item.schedule_type); }
          if (item.mrp !== undefined) { updates.push("mrp = COALESCE(NULLIF(mrp, 0), ?)"); params.push(item.mrp); }
          if (item.cgst !== undefined) { updates.push("cgst_per = COALESCE(NULLIF(cgst_per, 0), ?)"); params.push(item.cgst); }
          if (item.sgst !== undefined) { updates.push("sgst_per = COALESCE(NULLIF(sgst_per, 0), ?)"); params.push(item.sgst); }
          if (item.rack !== undefined) { updates.push("rack = COALESCE(NULLIF(rack, ''), ?)"); params.push(item.rack); }

          if (updates.length > 0) {
            params.push(medId);
            await db.run(`UPDATE medicines SET ${updates.join(', ')} WHERE id = ?`, ...params);
          }
        } else {
          newCount++;
          // Create new product record in Product Master
          const insertRes = await db.run(
            `INSERT INTO medicines (name, api_reference, strength, packaging, manufacturer, marketed_by, hsn_code, schedule_type, mrp, cgst_per, sgst_per, rack)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.name,
              item.api_reference || null,
              item.strength || null,
              item.packaging || null,
              item.manufacturer || null,
              item.marketed_by || null,
              item.hsn_code || null,
              item.schedule_type || null,
              item.mrp || 0,
              item.cgst || 0,
              item.sgst || 0,
              item.rack || null
            ]
          );
          medId = insertRes.lastID!;
          existingMedicinesMap.set(key, medId);
        }

        // Handle inventory stock insertion if stock fields are mapped
        if (item.quantity !== undefined || item.batch_no !== undefined || item.expiry_date !== undefined) {
          const qty = parseInt(item.quantity) || 0;
          const batchNo = (item.batch_no || 'B-CATALOG').trim();
          const expiry = item.expiry_date || '2028-12-31';
          const mrpVal = parseFloat(item.mrp) || 0;

          const existingInv = await db.get('SELECT id FROM inventory_master WHERE medicine_id = ? AND batch_no = ?', [medId, batchNo]);
          if (existingInv) {
            await db.run('UPDATE inventory_master SET quantity = quantity + ? WHERE id = ?', [qty, existingInv.id]);
          } else {
            await db.run(
              'INSERT INTO inventory_master (medicine_id, quantity, batch_no, expiry_date, mrp) VALUES (?, ?, ?, ?, ?)',
              [medId, qty, batchNo, expiry, mrpVal]
            );
          }
        }
      }
      await db.run('COMMIT');
    };

    const processRowObject = (row: any) => {
      if (!nameCol) return null;
      const name = String(row[nameCol] || '').trim();
      if (!name) return null; // Required validation

      const nameNorm = name.replace(/\s+/g, ' ');
      
      const res: any = { name: nameNorm };
      if (apiCol) res.api_reference = String(row[apiCol] || '').trim();
      if (strCol) res.strength = String(row[strCol] || '').trim();
      if (pkgCol) res.packaging = String(row[pkgCol] || '').trim();
      if (mfgCol) res.manufacturer = String(row[mfgCol] || '').trim();
      if (mktCol) res.marketed_by = String(row[mktCol] || '').trim();
      if (hsnCol) res.hsn_code = String(row[hsnCol] || '').trim();
      if (schCol) res.schedule_type = String(row[schCol] || '').trim();
      if (mrpCol) res.mrp = parseFloat(row[mrpCol]) || 0;
      if (cgstCol) res.cgst = parseFloat(row[cgstCol]) || 0;
      if (sgstCol) res.sgst = parseFloat(row[sgstCol]) || 0;
      if (rackCol) res.rack = String(row[rackCol] || '').trim();
      
      // Stock mapping
      if (qtyCol) res.quantity = parseInt(row[qtyCol]) || 0;
      if (batchCol) res.batch_no = String(row[batchCol] || '').trim();
      if (expCol) res.expiry_date = String(row[expCol] || '').trim();
      
      return res;
    };

    if (ext === '.csv') {
      const readStream = fs.createReadStream(job.file_path);
      const csvStream = readStream.pipe(csvParser());
      readStream.on('error', (err) => {
        csvStream.destroy(new Error(`Failed to read stream for import: ${err.message}`));
      });

      for await (const row of csvStream) {
        const parsed = processRowObject(row);
        if (parsed) {
          batch.push(parsed);
          processedCount++;
        }

        if (batch.length >= batchSize) {
          await insertBatch(batch);
          batch = [];
          const progress = Math.min(99, Math.round((processedCount / totalToProcess) * 100));
          await db.run('UPDATE catalog_jobs SET progress = ?, new_count = ?, existing_count = ?, duplicate_count = ? WHERE id = ?', [progress, newCount, existingCount, duplicateCount, jobId]);
          eventService.broadcast('catalog_job_progress', { id: jobId, progress, new_count: newCount, existing_count: existingCount, duplicate_count: duplicateCount, total_count: totalToProcess });
        }
      }
    } else {
      // PDF and Excel rows in memory
      for (const row of rows) {
        const parsed = processRowObject(row);
        if (parsed) {
          batch.push(parsed);
          processedCount++;
        }

        if (batch.length >= batchSize) {
          await insertBatch(batch);
          batch = [];
          const progress = Math.min(99, Math.round((processedCount / totalToProcess) * 100));
          await db.run('UPDATE catalog_jobs SET progress = ?, new_count = ?, existing_count = ?, duplicate_count = ? WHERE id = ?', [progress, newCount, existingCount, duplicateCount, jobId]);
          eventService.broadcast('catalog_job_progress', { id: jobId, progress, new_count: newCount, existing_count: existingCount, duplicate_count: duplicateCount, total_count: totalToProcess });
        }
      }
    }

    if (batch.length > 0) {
      await insertBatch(batch);
    }

    await db.run("UPDATE catalog_jobs SET status = 'done', progress = 100, new_count = ?, existing_count = ?, duplicate_count = ? WHERE id = ?", [newCount, existingCount, duplicateCount, jobId]);
    eventService.broadcast('catalog_job_update', { id: jobId, status: 'done', progress: 100, new_count: newCount, existing_count: existingCount, duplicate_count: duplicateCount, total_count: totalToProcess });
  } catch (err: any) {
    console.error('Batch import failed', err);
    await db.run("UPDATE catalog_jobs SET status = 'failed', error_log = ? WHERE id = ?", [err.message || 'Unknown error', jobId]);
    eventService.broadcast('catalog_job_update', { id: jobId, status: 'failed', error: err.message });
  } finally {
      }
}

// Loop to poll jobs
export async function startWorker() {
  setInterval(async () => {
    let db;
    try {
      db = await dbManager.getConnection();
      
      const analysisJob = await db.get(`SELECT * FROM catalog_jobs WHERE status='pending_analysis' ORDER BY id ASC LIMIT 1`);
      if (analysisJob) {
        console.log(`[Worker] Found pending analysis job ${analysisJob.id}, triggering runCatalogAnalysis.`);
        await runCatalogAnalysis(analysisJob.id);
      } else {
        const job = await db.get(`SELECT * FROM catalog_jobs WHERE status='pending' ORDER BY id ASC LIMIT 1`);
        if (job) {
          console.log(`[Worker] Found pending job ${job.id}, triggering runCatalogImport.`);
          await runCatalogImport(job.id);
        }
      }
    } catch (err) {
      console.error('Worker polling interval error:', err);
    } finally {
    }
  }, 10000);
}
