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
const TEST_DB_PATH = path.resolve(dataDir, 'basic-test.db');

async function basicTest() {
  console.log('Basic test starting');

  // Clean up any existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Open a test SQLite database
  const db = await open({
    filename: TEST_DB_PATH,
    driver: sqlite3.Database
  });

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

  console.log('Testing legacy_sales...');
  const result1 = await processSalesLine("INSERT INTO legacy_sales VALUES (1001, 1, '2024-01-15', 500.0, 25.0);", db);
  console.log('legacy_sales result:', result1);

  console.log('Testing legacy_saleItems with existing refs...');
  // First insert a legacy sales invoice to reference
  await db.run("INSERT INTO sales_invoices (invoice_no, customer_id, date, total_amount, tax_amount) VALUES (?, ?, ?, ?, ?)",
              ['INV001', 1, '2024-01-15', 500.0, 25.0]);

  const result2 = await processSalesLine("INSERT INTO legacy_saleItems VALUES (1, 'INV001', 101, 2, 100.0);", db);
  console.log('legacy_saleItems result:', result2);

  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  console.log('Basic test completed');
}

basicTest().then(() => console.log('Success')).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});