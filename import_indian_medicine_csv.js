import fs from 'fs';
import { parse } from 'csv-parse';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const DB_PATH = './data/app.db';
const CSV_PATH = './data/indian_medicine_data.csv';

async function importIndianMedicines() {
  console.log('Starting Indian Medicine CSV Import...');
  
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV file not found: ${CSV_PATH}`);
    return;
  }

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  console.log('Connected to SQLite Database.');

  // Create a read stream for the CSV
  const parser = fs.createReadStream(CSV_PATH).pipe(
    parse({
      columns: true, // Parse headers
      skip_empty_lines: true
    })
  );

  let batch = [];
  const BATCH_SIZE = 10000;
  let totalImported = 0;

  console.log('Streaming CSV data and inserting in batches...');

  await db.run('BEGIN TRANSACTION');

  const stmt = await db.prepare(
    'INSERT OR IGNORE INTO medicines (name, mrp, manufacturer, category, marketed_by, manufactured_by) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for await (const record of parser) {
    const name = record.name ? record.name.trim() : '';
    const mrp = record['price(,1)'] ? parseFloat(record['price(,1)']) || 0 : 0;
    const manufacturer = record.manufacturer_name ? record.manufacturer_name.trim() : '';
    const category = record.type ? record.type.trim() : 'Allopathy';
    
    // In India, the manufacturer listed is usually the marketing company (Marketed By)
    const marketed_by = manufacturer;
    // We leave manufactured_by null for now, or flag it for third-party lookup
    const manufactured_by = '';

    if (name.length > 0) {
      batch.push([name, mrp, manufacturer, category, marketed_by, manufactured_by]);
    }

    if (batch.length >= BATCH_SIZE) {
      for (const row of batch) {
        await stmt.run(row);
      }
      totalImported += batch.length;
      console.log(`Processed ${totalImported} records...`);
      batch = [];
    }
  }

  // Insert remaining records
  if (batch.length > 0) {
    for (const row of batch) {
      await stmt.run(row);
    }
    totalImported += batch.length;
  }

  await stmt.finalize();
  await db.run('COMMIT');

  console.log(`\n✓ Successfully finished importing dataset. Total processed: ${totalImported}`);

  const [{ count }] = await db.all('SELECT COUNT(*) as count FROM medicines');
  console.log(`Total medicines in database now: ${count}`);

  await db.close();
}

importIndianMedicines().catch(err => {
  console.error('Import failed:', err);
});
