import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { processSalesLine } from './src/worker/parsers/salesParser.ts';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create data directory if it doesn't exist
const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const TEST_DB_PATH = path.resolve(dataDir, 'focused-test.db');

async function focusedTest() {
  console.log('=== Focused Sales Parser Test ===');

  // Clean up any existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    console.log('Cleaned up existing test database');
  }

  // Open a test SQLite database
  const db = await open({
    filename: TEST_DB_PATH,
    driver: sqlite3.Database
  });
  console.log('Opened database');

  // Create the required tables
  await db.exec(`
      CREATE TABLE medicines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          api_reference TEXT
      );
      CREATE TABLE sales_invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_no TEXT UNIQUE,
          customer_id INTEGER,
          date DATETIME DEFAULT CURRENT_TIMESTAMP,
          total_amount REAL,
          tax_amount REAL
      );
      CREATE TABLE inventory_master (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          medicine_id INTEGER,
          quantity INTEGER DEFAULT 0,
          rack_location TEXT,
          batch_no TEXT,
          expiry_date DATETIME,
          FOREIGN KEY(medicine_id) REFERENCES medicines(id)
      );
      CREATE TABLE sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id INTEGER,
          inventory_id INTEGER,
          quantity INTEGER,
          unit_price REAL,
          FOREIGN KEY(invoice_id) REFERENCES sales_invoices(id),
          FOREIGN KEY(inventory_id) REFERENCES inventory_master(id)
      );
  `);
  console.log('Created tables');

  // Insert some test medicines for foreign key resolution
  await db.exec(`
      INSERT INTO medicines (id, name) VALUES (101, 'Paracetamol');
      INSERT INTO medicines (id, name) VALUES (202, 'Amoxicillin');
      INSERT INTO medicines (id, name) VALUES (303, 'Cetirizine');
  `);
  console.log('Inserted test medicines');

  // Insert some test inventory for foreign key resolution
  await db.exec(`
      INSERT INTO inventory_master (id, medicine_id, quantity) VALUES (1, 101, 100);
      INSERT INTO inventory_master (id, medicine_id, quantity) VALUES (2, 202, 50);
      INSERT INTO inventory_master (id, medicine_id, quantity) VALUES (3, 303, 75);
  `);
  console.log('Inserted test inventory');

  console.log('\n--- Test 1: legacy_sales processing ---');
  try {
    const sqlLine1 = "INSERT INTO legacy_sales VALUES (1001, 1, '2024-01-15', 500.0, 25.0);";
    console.log('Processing:', sqlLine1);

    const startTime1 = Date.now();
    const result1 = await processSalesLine(sqlLine1, db);
    const endTime1 = Date.now();

    console.log('Result:', result1);
    console.log('Time taken:', (endTime1 - startTime1), 'ms');

    // Verify the record was inserted correctly
    const rows = await db.all("SELECT * FROM sales_invoices WHERE invoice_no = '1001'");
    console.log('Inserted rows count:', rows.length);
    if (rows.length > 0) {
      console.log('First row:', JSON.stringify(rows[0], null, 2));
    }
  } catch (error) {
    console.error('Error in test 1:', error);
  }

  console.log('\n--- Test 2: legacy_saleItems processing (with existing references) ---');
  try {
    // First insert a legacy sales invoice to reference
    await db.run("INSERT INTO sales_invoices (invoice_no, customer_id, date, total_amount, tax_amount) VALUES (?, ?, ?, ?, ?)",
                ['INV001', 1, '2024-01-15', 500.0, 25.0]);
    console.log('Inserted legacy sales invoice reference');

    const sqlLine2 = "INSERT INTO legacy_saleItems VALUES (1, 'INV001', 101, 2, 100.0);";
    console.log('Processing:', sqlLine2);

    const startTime2 = Date.now();
    const result2 = await processSalesLine(sqlLine2, db);
    const endTime2 = Date.now();

    console.log('Result:', result2);
    console.log('Time taken:', (endTime2 - startTime2), 'ms');

    // Verify the record was inserted correctly
    const rows2 = await db.all(`
        SELECT si.invoice_no, si.total_amount, si.tax_amount,
               sii.quantity, sii.unit_price, im.medicine_id
        FROM sale_items sii
        JOIN sales_invoices si ON sii.invoice_id = si.id
        JOIN inventory_master im ON sii.inventory_id = im.id
        WHERE si.invoice_no = 'INV001'
    `);
    console.log('Inserted sale items count:', rows2.length);
    if (rows2.length > 0) {
      console.log('First sale item:', JSON.stringify(rows2[0], null, 2));
    }
  } catch (error) {
    console.error('Error in test 2:', error);
  }

  console.log('\n--- Test 3: legacy_saleItems processing (missing medicine - should auto-create) ---');
  try {
    // Insert a legacy sales invoice to reference
    await db.run("INSERT INTO sales_invoices (invoice_no, customer_id, date, total_amount, tax_amount) VALUES (?, ?, ?, ?, ?)",
                ['INV002', 1, '2024-01-16', 300.0, 15.0]);
    console.log('Inserted legacy sales invoice reference for test 3');

    const sqlLine3 = "INSERT INTO legacy_saleItems VALUES (2, 'INV002', 999, 1, 50.0);"; // medicine_id 999 doesn't exist
    console.log('Processing:', sqlLine3);

    const startTime3 = Date.now();
    const result3 = await processSalesLine(sqlLine3, db);
    const endTime3 = Date.now();

    console.log('Result:', result3);
    console.log('Time taken:', (endTime3 - startTime3), 'ms');

    // Verify a record was inserted
    const count = await db.get("SELECT COUNT(*) as count FROM sale_items");
    console.log('Total sale items count:', count?.count);

    if (count && count.count > 0) {
      // Verify the inserted record has correct values
      const saleItem = await db.get(`
          SELECT sii.quantity, sii.unit_price, im.medicine_id, m.name as medicine_name
          FROM sale_items sii
          JOIN sales_invoices si ON sii.invoice_id = si.id
          JOIN inventory_master im ON sii.inventory_id = im.id
          JOIN medicines m ON im.medicine_id = m.id
          WHERE si.invoice_no = 'INV002'
      `);
      console.log('Inserted sale item:', JSON.stringify(saleItem, null, 2));
    }
  } catch (error) {
    console.error('Error in test 3:', error);
  }

  console.log('\n--- Checking caches ---');
  // Let's see what's in our caches by accessing the module
  // We'll need to import the module in a way that lets us access the caches

  await db.close();
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    console.log('Cleaned up test database');
  }

  console.log('\n=== Test completed ===');
}

focusedTest().then(() => {
  console.log('Focused test finished');
}).catch(err => {
  console.error('Focused test failed:', err);
});