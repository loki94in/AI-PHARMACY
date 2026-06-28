import fs from 'fs';
import csvParser from 'csv-parser';

interface Stats { imported: number; skipped: number; errors: number }

export async function runCsvSalesImport(
  filePath: string,
  db: any,
  onProgress: (processed: number, total: number) => Promise<void>
): Promise<Stats> {
  const rows: Record<string, string>[] = await readCsv(filePath);
  const total = rows.length;
  const stats: Stats = { imported: 0, skipped: 0, errors: 0 };

  // Group rows by invoice_no — one sales_invoice per group
  const invoiceMap = new Map<string, Record<string, string>[]>();
  let autoKey = 0;
  for (const row of rows) {
    const invoiceNo = (row['invoice_no'] || row['bill_no'] || row['inv_no'] || '').trim();
    const key = invoiceNo || `__auto_${autoKey++}`;
    if (!invoiceMap.has(key)) invoiceMap.set(key, []);
    invoiceMap.get(key)!.push(row);
  }

  let processed = 0;
  for (const [invoiceKey, invoiceRows] of invoiceMap) {
    const invoiceNo = invoiceKey.startsWith('__auto_') ? null : invoiceKey;

    // Skip if invoice_no already exists
    if (invoiceNo) {
      const existing = await db.get('SELECT id FROM sales_invoices WHERE invoice_no = ?', [invoiceNo]);
      if (existing) {
        stats.skipped += invoiceRows.length;
        processed += invoiceRows.length;
        await onProgress(processed, total);
        continue;
      }
    }

    try {
      const firstRow = invoiceRows[0];
      const saleDate = (firstRow['date'] || firstRow['sale_date'] || firstRow['invoice_date'] || '').trim() || undefined;
      const customerName = (firstRow['customer_name'] || firstRow['patient_name'] || firstRow['customer'] || '').trim();
      const customerPhone = (firstRow['customer_phone'] || firstRow['phone'] || '').trim();
      const doctorName = (firstRow['doctor_name'] || firstRow['doctor'] || '').trim();
      const totalAmount = parseFloat(firstRow['total_amount'] || firstRow['total'] || '0') || 0;

      // Resolve customer
      let customerId: number | null = null;
      if (customerName) {
        await db.run(
          `INSERT OR IGNORE INTO customers (name, phone) VALUES (?, ?)`,
          [customerName, customerPhone]
        );
        const customer = await db.get(
          'SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND COALESCE(phone,\'\') = ?',
          [customerName, customerPhone]
        );
        if (customer) customerId = customer.id;
      }

      // Resolve doctor
      let doctorId: number | null = null;
      if (doctorName) {
        const doctor = await db.get(
          'SELECT id FROM doctors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
          [doctorName]
        );
        if (doctor) doctorId = doctor.id;
      }

      // Create sales_invoice header
      const invoiceResult = await db.run(
        `INSERT INTO sales_invoices (invoice_no, customer_id, doctor_id, date, total_amount, payment_status)
         VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, 'PAID')`,
        [invoiceNo || null, customerId, doctorId, saleDate || null, totalAmount]
      );
      const invoiceId = invoiceResult.lastID!;

      // Insert sale_items via inventory_master lookup
      for (const row of invoiceRows) {
        const medicineName = (row['medicine_name'] || row['name'] || row['product'] || '').trim();
        const itemCode = (row['item_code'] || '').trim();
        const batchNo = (row['batch_no'] || row['batch'] || '').trim();
        if (!medicineName && !itemCode) { stats.skipped++; continue; }

        // Find medicine
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

        // Find or create inventory_master row (batch match preferred)
        let inventory: any = null;
        if (batchNo) {
          inventory = await db.get(
            'SELECT id FROM inventory_master WHERE medicine_id = ? AND batch_no = ?',
            [medicine.id, batchNo]
          );
        }
        if (!inventory) {
          inventory = await db.get(
            'SELECT id FROM inventory_master WHERE medicine_id = ? ORDER BY expiry_date ASC LIMIT 1',
            [medicine.id]
          );
        }
        if (!inventory) {
          // Stub inventory row (no stock data from CSV)
          const invResult = await db.run(
            'INSERT INTO inventory_master (medicine_id, batch_no, quantity) VALUES (?, ?, 0)',
            [medicine.id, batchNo || null]
          );
          inventory = { id: invResult.lastID };
        }

        const qty = parseInt(row['quantity'] || row['qty'] || '1', 10) || 1;
        const mrp = parseFloat(row['mrp'] || '0') || 0;
        const discount = parseFloat(row['discount'] || '0') || 0;

        await db.run(
          'INSERT INTO sale_items (invoice_id, inventory_id, quantity, mrp, discount) VALUES (?, ?, ?, ?, ?)',
          [invoiceId, inventory.id, qty, mrp, discount]
        );
        stats.imported++;
      }
    } catch (err) {
      stats.errors++;
      console.error(`[CsvSalesImporter] Invoice ${invoiceKey} error:`, err);
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
