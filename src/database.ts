import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

/**
 * Ensure required SQLite tables exist.
 * Creates `medicines`, `catalog_jobs`, and `processed_files` if they are missing.
 */
export async function ensureSchema(dbPath: string) {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      api_reference TEXT
    );
    CREATE TABLE IF NOT EXISTS catalog_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      status TEXT CHECK(status IN ('pending','processing','done','failed')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS processed_files (
      file_path TEXT PRIMARY KEY,
      last_processed DATETIME
    );
    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      contact TEXT
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distributor_id INTEGER,
      invoice_no TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL,
      FOREIGN KEY(distributor_id) REFERENCES distributors(id)
    );
    CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines (name);
    CREATE INDEX IF NOT EXISTS idx_catalog_jobs_status ON catalog_jobs (status);

    -- Agent A: Core Business & Inventory Schemas
    CREATE TABLE IF NOT EXISTS inventory_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER,
      quantity INTEGER DEFAULT 0,
      rack_location TEXT,
      batch_no TEXT,
      expiry_date DATETIME,
      FOREIGN KEY(medicine_id) REFERENCES medicines(id)
    );
    CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE,
      customer_id INTEGER,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL,
      tax_amount REAL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      inventory_id INTEGER,
      quantity INTEGER,
      unit_price REAL,
      FOREIGN KEY(invoice_id) REFERENCES sales_invoices(id),
      FOREIGN KEY(inventory_id) REFERENCES inventory_master(id)
    );
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_no TEXT UNIQUE,
      original_invoice_id INTEGER,
      type TEXT CHECK(type IN ('sale', 'purchase')),
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL
    );

    -- Agent B: CRM, Communication, & Utilities Schemas
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  await db.close();
}
