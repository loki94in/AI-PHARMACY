import fs from 'fs';
import csvParser from 'csv-parser';

interface Stats { imported: number; skipped: number; errors: number }

export async function runCsvSuppliersImport(
  filePath: string,
  db: any,
  onProgress: (processed: number, total: number) => Promise<void>
): Promise<Stats> {
  const rows: Record<string, string>[] = await readCsv(filePath);
  const total = rows.length;
  const stats: Stats = { imported: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = (row['name'] || row['supplier_name'] || row['distributor_name'] || '').trim();
      if (!name) { stats.skipped++; continue; }

      const existing = await db.get(
        'SELECT id FROM distributors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
        [name]
      );
      if (existing) { stats.skipped++; continue; }

      await db.run(
        `INSERT INTO distributors (name, phone, email, address, city, state_code, gstin, dl_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          (row['phone'] || row['contact'] || '').trim(),
          (row['email'] || '').trim(),
          (row['address'] || '').trim(),
          (row['city'] || '').trim(),
          (row['state_code'] || row['state'] || '').trim(),
          (row['gstin'] || row['gst'] || '').trim(),
          (row['dl_no'] || row['drug_license'] || '').trim(),
        ]
      );
      stats.imported++;
    } catch (err) {
      stats.errors++;
      console.error(`[CsvSuppliersImporter] Row ${i + 1} error:`, err);
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
