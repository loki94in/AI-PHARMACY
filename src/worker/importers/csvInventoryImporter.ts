import fs from 'fs';
import csvParser from 'csv-parser';

interface Stats { imported: number; skipped: number; errors: number }

export async function runCsvInventoryImport(
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
      const medicineName = (row['medicine_name'] || row['name'] || '').trim();
      const itemCode = (row['item_code'] || '').trim();
      const batchNo = (row['batch_no'] || row['batch'] || '').trim();
      const expiryDate = (row['expiry_date'] || row['expiry'] || '').trim() || null;
      const quantity = parseInt(row['quantity'] || row['qty'] || '0', 10) || 0;
      const looseQty = parseInt(row['loose_quantity'] || row['loose_qty'] || '0', 10) || 0;
      const costPrice = parseFloat(row['cost_price'] || row['rate'] || '0') || 0;
      const mrp = parseFloat(row['mrp'] || '0') || 0;
      const rack = (row['rack_location'] || row['rack'] || '').trim();

      if (!medicineName && !itemCode) { stats.skipped++; continue; }

      // Resolve medicine_id
      let medicine: any = null;
      if (itemCode) {
        medicine = await db.get('SELECT id FROM medicines WHERE item_code = ?', [itemCode]);
      }
      if (!medicine && medicineName) {
        medicine = await db.get(
          'SELECT id FROM medicines WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
          [medicineName]
        );
      }
      if (!medicine) { stats.skipped++; continue; }

      // Upsert inventory_master (medicine_id + batch_no + expiry_date = composite key)
      const existing = await db.get(
        `SELECT id, quantity, loose_quantity FROM inventory_master
         WHERE medicine_id = ? AND COALESCE(batch_no,'') = ? AND COALESCE(expiry_date,'') = ?`,
        [medicine.id, batchNo, expiryDate || '']
      );

      if (existing) {
        await db.run(
          `UPDATE inventory_master SET quantity = quantity + ?, loose_quantity = loose_quantity + ?,
             mrp = ?, cost_price = ?, rack_location = ? WHERE id = ?`,
          [quantity, looseQty, mrp || existing.mrp, costPrice || existing.cost_price, rack || null, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO inventory_master (medicine_id, batch_no, expiry_date, quantity, loose_quantity, mrp, cost_price, rack_location)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [medicine.id, batchNo || null, expiryDate, quantity, looseQty, mrp, costPrice, rack || null]
        );
      }
      stats.imported++;
    } catch (err) {
      stats.errors++;
      console.error(`[CsvInventoryImporter] Row ${i + 1} error:`, err);
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
