import fs from 'fs';
import csvParser from 'csv-parser';

interface Stats { imported: number; skipped: number; errors: number }

export async function runCsvPurchasesImport(
  filePath: string,
  db: any,
  onProgress: (processed: number, total: number) => Promise<void>
): Promise<Stats> {
  const rows: Record<string, string>[] = await readCsv(filePath);
  const total = rows.length;
  const stats: Stats = { imported: 0, skipped: 0, errors: 0 };

  // Group rows by (distributor_name, invoice_no) — one purchase per invoice
  const invoiceMap = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const distName = (row['distributor_name'] || row['supplier_name'] || row['vendor'] || '').trim();
    const invoiceNo = (row['invoice_no'] || row['invoice'] || row['bill_no'] || '').trim();
    const key = `${distName}||${invoiceNo}`;
    if (!invoiceMap.has(key)) invoiceMap.set(key, []);
    invoiceMap.get(key)!.push(row);
  }

  let processed = 0;
  for (const [key, invoiceRows] of invoiceMap) {
    const [distName, invoiceNo] = key.split('||');
    if (!distName) { stats.skipped += invoiceRows.length; processed += invoiceRows.length; continue; }

    try {
      // Upsert distributor
      await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', [distName]);
      const dist = await db.get('SELECT id FROM distributors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))', [distName]);
      if (!dist) { stats.skipped += invoiceRows.length; processed += invoiceRows.length; continue; }

      // Skip if invoice already imported for this distributor
      if (invoiceNo) {
        const existing = await db.get(
          'SELECT id FROM purchases WHERE distributor_id = ? AND invoice_no = ?',
          [dist.id, invoiceNo]
        );
        if (existing) {
          stats.skipped += invoiceRows.length;
          processed += invoiceRows.length;
          await onProgress(processed, total);
          continue;
        }
      }

      const firstRow = invoiceRows[0];
      const purchaseDate = (firstRow['date'] || firstRow['invoice_date'] || '').trim() || undefined;
      let totalAmount = 0;

      // Create purchase header
      const purchaseResult = await db.run(
        `INSERT INTO purchases (distributor_id, invoice_no, date, total_amount)
         VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), 0)`,
        [dist.id, invoiceNo || null, purchaseDate || null]
      );
      const purchaseId = purchaseResult.lastID!;

      // Insert purchase_items
      for (const row of invoiceRows) {
        const medicineName = (row['medicine_name'] || row['name'] || row['product'] || '').trim();
        const itemCode = (row['item_code'] || '').trim();

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
        if (!medicine) {
          // Auto-create medicine with minimal data
          if (!medicineName) { stats.skipped++; continue; }
          const insResult = await db.run(
            'INSERT OR IGNORE INTO medicines (name) VALUES (?)',
            [medicineName]
          );
          medicine = await db.get(
            'SELECT id FROM medicines WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
            [medicineName]
          );
          if (!medicine) { stats.skipped++; continue; }
        }

        const qty = parseInt(row['quantity'] || row['qty'] || '0', 10) || 0;
        const freeQty = parseInt(row['free_qty'] || row['free'] || '0', 10) || 0;
        const costPrice = parseFloat(row['cost_price'] || row['rate'] || row['price'] || '0') || 0;
        const mrp = parseFloat(row['mrp'] || '0') || 0;
        const cgstPer = parseFloat(row['cgst_per'] || row['cgst'] || '0') || 0;
        const sgstPer = parseFloat(row['sgst_per'] || row['sgst'] || '0') || 0;
        const igstPer = parseFloat(row['igst_per'] || row['igst'] || '0') || 0;
        const schemePer = parseFloat(row['scheme_per'] || row['scheme'] || '0') || 0;
        const batchNo = (row['batch_no'] || row['batch'] || '').trim() || null;
        const expiryDate = (row['expiry_date'] || row['expiry'] || '').trim() || null;
        const hsnCode = (row['hsn_code'] || row['hsn'] || '').trim();

        const lineTotal = qty * costPrice;
        totalAmount += lineTotal;

        await db.run(
          `INSERT INTO purchase_items
             (purchase_id, medicine_id, batch_no, expiry_date, quantity, free_qty, cost_price, mrp,
              hsn_code, cgst_per, sgst_per, igst_per, scheme_per,
              cgst_value, sgst_value, igst_value)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ROUND(? * cgst_per / 100, 2), ROUND(? * sgst_per / 100, 2), ROUND(? * igst_per / 100, 2))`,
          [purchaseId, medicine.id, batchNo, expiryDate, qty, freeQty, costPrice, mrp,
           hsnCode, cgstPer, sgstPer, igstPer, schemePer,
           lineTotal, lineTotal, lineTotal]
        );
        stats.imported++;
      }

      // Update total_amount on purchase header
      await db.run('UPDATE purchases SET total_amount = ? WHERE id = ?', [totalAmount, purchaseId]);
    } catch (err) {
      stats.errors++;
      console.error(`[CsvPurchasesImporter] Invoice ${key} error:`, err);
    }

    processed += invoiceRows.length;
    await onProgress(processed, total);
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
