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
const TEST_DB_PATH = path.resolve(dataDir, 'debug-sales-parser.db');

async function debugTest() {
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

  // Insert some test medicines for foreign key resolution
  await db.exec(`
      INSERT INTO medicines (id, name) VALUES (101, 'Paracetamol');
      INSERT INTO medicines (id, name) VALUES (202, 'Amoxicillin');
      INSERT INTO medicines (id, name) VALUES (303, 'Cetirizine');
  `);

  // Insert some test inventory for foreign key resolution
  await db.exec(`
      INSERT INTO inventory_master (id, medicine_id, quantity) VALUES (1, 101, 100);
      INSERT INTO inventory_master (id, medicine_id, quantity) VALUES (2, 202, 50);
      INSERT INTO inventory_master (id, medicine_id, quantity) VALUES (3, 303, 75);
  `);

  console.log('Starting debug test...');

  try {
    console.log('Testing legacy_sales processing...');
    const sqlLine = "INSERT INTO legacy_sales VALUES (1001, 1, '2024-01-15', 500.0, 25.0);";
    console.log('SQL Line:', sqlLine);

    const result = await processSalesLine(sqlLine, db);
    console.log('Result:', result);

    // Verify the record was inserted correctly
    const rows = await db.all("SELECT * FROM sales_invoices WHERE invoice_no = '1001'");
    console.log('Inserted rows:', rows.length);
    if (rows.length > 0) {
      console.log('First row:', rows[0]);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  }
}

debugTest().then(() => console.log('Debug test completed'));