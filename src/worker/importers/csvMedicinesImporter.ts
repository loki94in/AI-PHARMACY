import fs from 'fs';
import csvParser from 'csv-parser';

interface Stats { imported: number; skipped: number; errors: number }

export async function runCsvMedicinesImport(
  filePath: string,
  db: any,
  onProgress: (processed: number, total: number) => Promise<void>
): Promise<Stats> {
  const { normalizeMedicineName } = await import('../../utils/nameNormalizer.js');
  const rows: Record<string, string>[] = await readCsv(filePath);
  const total = rows.length;
  const stats: Stats = { imported: 0, skipped: 0, errors: 0 };

  // Read job's data_filters to check for update=true flag
  const job = await db.get(
    "SELECT data_filters FROM catalog_jobs WHERE status='processing' ORDER BY id DESC LIMIT 1"
  );
  const allowUpdate = job?.data_filters
    ? (() => { try { return JSON.parse(job.data_filters)?.update === true; } catch { return false; } })()
    : false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const rawName = (row['name'] || row['medicine_name'] || row['brand_name'] || '').trim();
      if (!rawName) { stats.skipped++; continue; }

      const manufacturer = (row['manufacturer'] || row['mfg'] || '').trim();
      const adjustedName = normalizeMedicineName(rawName, manufacturer);

      const existing = await db.get(
        'SELECT id FROM medicines WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
        [adjustedName]
      );

      if (existing && !allowUpdate) { stats.skipped++; continue; }

      const fields = {
        name: adjustedName,
        generic_name: row['generic_name'] || row['api'] || row['composition'] || '',
        manufacturer,
        marketed_by: row['marketed_by'] || row['mkt_by'] || '',
        pack_unit: row['pack_unit'] || row['pack'] || row['unit'] || '',
        strength: row['strength'] || row['dosage'] || '',
        mrp: parseFloat(row['mrp'] || '0') || 0,
        hsn_code: row['hsn_code'] || row['hsn'] || '',
        cgst_per: parseFloat(row['cgst_per'] || row['cgst'] || '0') || 0,
        sgst_per: parseFloat(row['sgst_per'] || row['sgst'] || '0') || 0,
        igst_per: parseFloat(row['igst_per'] || row['igst'] || '0') || 0,
        schedule_type: row['schedule_type'] || row['schedule'] || '',
        rack: row['rack'] || row['rack_location'] || '',
        item_code: row['item_code'] || '',
        category: row['category'] || '',
      };

      if (existing) {
        // UPDATE: only overwrite non-empty incoming fields
        const updates: string[] = [];
        const params: any[] = [];
        for (const [k, v] of Object.entries(fields)) {
          if (k === 'name') continue;
          if (v !== '' && v !== 0) {
            updates.push(`${k} = ?`);
            params.push(v);
          }
        }
        if (updates.length > 0) {
          params.push(existing.id);
          await db.run(`UPDATE medicines SET ${updates.join(', ')} WHERE id = ?`, params);
        }
      } else {
        await db.run(
          `INSERT INTO medicines
             (name, generic_name, manufacturer, marketed_by, pack_unit, strength, mrp,
              hsn_code, cgst_per, sgst_per, igst_per, schedule_type, rack, item_code, category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [fields.name, fields.generic_name, fields.manufacturer, fields.marketed_by,
           fields.pack_unit, fields.strength, fields.mrp, fields.hsn_code,
           fields.cgst_per, fields.sgst_per, fields.igst_per, fields.schedule_type,
           fields.rack, fields.item_code, fields.category]
        );
      }
      stats.imported++;
    } catch (err) {
      stats.errors++;
      console.error(`[CsvMedicinesImporter] Row ${i + 1} error:`, err);
    }

    if ((i + 1) % 50 === 0 || i === total - 1) {
      await onProgress(i + 1, total);
    }
  }

  return stats;
}

function readCsv(filePath: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    if (!fs.existsSync(filePath)) return resolve(rows);
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row: any) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}
