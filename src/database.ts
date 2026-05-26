import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

/**
 * Ensure required SQLite tables exist.
 * Creates `medicines`, `catalog_jobs`, `processed_files`, `message_templates` and others if they are missing.
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
    CREATE TABLE IF NOT EXISTS message_templates (
      locale TEXT NOT NULL,
      key    TEXT NOT NULL,
      value  TEXT NOT NULL,
      PRIMARY KEY (locale, key)
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
    CREATE TABLE IF NOT EXISTS delivery_boys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      whatsapp_number TEXT,
      telegram_chat_id TEXT,
      is_active INTEGER DEFAULT 1
    );
  `);

  // Safely add new columns to existing tables (SQLite throws if column exists — we catch and ignore)
  const alterStatements = [
    `ALTER TABLE inventory_master ADD COLUMN unit_price REAL DEFAULT 0`,
    `ALTER TABLE inventory_master ADD COLUMN cost_price REAL DEFAULT 0`,
    `ALTER TABLE inventory_master ADD COLUMN reorder_level INTEGER DEFAULT 10`,
    `ALTER TABLE inventory_master ADD COLUMN mrp REAL DEFAULT 0`,
    `ALTER TABLE inventory_master ADD COLUMN legacy_batch_id TEXT`,
    `ALTER TABLE medicines ADD COLUMN mrp REAL DEFAULT 0`,
    `ALTER TABLE medicines ADD COLUMN hsn_code TEXT`,
    `ALTER TABLE medicines ADD COLUMN schedule_type TEXT DEFAULT 'None'`,
    `ALTER TABLE medicines ADD COLUMN manufacturer TEXT`,
    `ALTER TABLE medicines ADD COLUMN category TEXT`,
    `ALTER TABLE medicines ADD COLUMN marketed_by TEXT`,
    `ALTER TABLE medicines ADD COLUMN manufactured_by TEXT`,
    `ALTER TABLE medicines ADD COLUMN legacy_id TEXT`,
    `ALTER TABLE medicines ADD COLUMN packaging TEXT`,
    `ALTER TABLE medicines ADD COLUMN item_type TEXT`,
    `ALTER TABLE medicines ADD COLUMN cgst REAL DEFAULT 0`,
    `ALTER TABLE medicines ADD COLUMN sgst REAL DEFAULT 0`,
    `ALTER TABLE medicines ADD COLUMN igst REAL DEFAULT 0`,
    `ALTER TABLE medicines ADD COLUMN rack TEXT`,
    // Purchases extra columns
    `ALTER TABLE purchases ADD COLUMN cgst_value REAL DEFAULT 0`,
    `ALTER TABLE purchases ADD COLUMN sgst_value REAL DEFAULT 0`,
    `ALTER TABLE purchases ADD COLUMN igst_value REAL DEFAULT 0`,
    `ALTER TABLE purchases ADD COLUMN roff REAL DEFAULT 0`,
    `ALTER TABLE purchases ADD COLUMN status TEXT DEFAULT 'PUBLISHED'`,
    `ALTER TABLE purchases ADD COLUMN legacy_id TEXT`,
    `ALTER TABLE purchases ADD COLUMN business_date DATETIME`,
    // Sales invoices extra columns
    `ALTER TABLE sales_invoices ADD COLUMN doctor_id INTEGER`,
    `ALTER TABLE sales_invoices ADD COLUMN payment_medium TEXT`,
    `ALTER TABLE sales_invoices ADD COLUMN roff REAL DEFAULT 0`,
    `ALTER TABLE sales_invoices ADD COLUMN cgst_value REAL DEFAULT 0`,
    `ALTER TABLE sales_invoices ADD COLUMN sgst_value REAL DEFAULT 0`,
    `ALTER TABLE sales_invoices ADD COLUMN igst_value REAL DEFAULT 0`,
    `ALTER TABLE sales_invoices ADD COLUMN legacy_id TEXT`,
    `ALTER TABLE sales_invoices ADD COLUMN business_date DATETIME`,
    // Sale items extra columns
    `ALTER TABLE sale_items ADD COLUMN mrp REAL`,
    `ALTER TABLE sale_items ADD COLUMN batch_no TEXT`,
    `ALTER TABLE sale_items ADD COLUMN cgst_value REAL DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN sgst_value REAL DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN discount_per REAL DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN legacy_id TEXT`,
    // Returns extra columns
    `ALTER TABLE returns ADD COLUMN cgst_value REAL DEFAULT 0`,
    `ALTER TABLE returns ADD COLUMN sgst_value REAL DEFAULT 0`,
    `ALTER TABLE returns ADD COLUMN igst_value REAL DEFAULT 0`,
    `ALTER TABLE returns ADD COLUMN distributor_id INTEGER`,
    `ALTER TABLE returns ADD COLUMN legacy_id TEXT`,
    // Distributors extra columns
    `ALTER TABLE distributors ADD COLUMN legacy_id TEXT`,
    `ALTER TABLE distributors ADD COLUMN gstin TEXT`,
    `ALTER TABLE distributors ADD COLUMN address TEXT`,
    `ALTER TABLE distributors ADD COLUMN city TEXT`,
    `ALTER TABLE distributors ADD COLUMN email TEXT`,
    `ALTER TABLE distributors ADD COLUMN dl_no TEXT`,
    // Customers extra columns
    `ALTER TABLE customers ADD COLUMN legacy_id TEXT`,
    `ALTER TABLE customers ADD COLUMN age TEXT`,
    `ALTER TABLE customers ADD COLUMN gender TEXT`,
  ];
  for (const stmt of alterStatements) {
    try {
      await db.run(stmt);
    } catch (_e) {
      // Column already exists — safe to ignore
    }
  }

  // New tables needed by various routes
  await db.exec(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      degree TEXT,
      reg_no TEXT,
      hospital TEXT,
      phone TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      legacy_id TEXT,
      speciality TEXT
    );

    CREATE TABLE IF NOT EXISTS held_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS compliance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      drug_name TEXT,
      patient_name TEXT,
      doctor_name TEXT,
      license_no TEXT,
      qty INTEGER,
      bill_no TEXT,
      schedule_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Migration: Purchase line items
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER,
      medicine_id INTEGER,
      batch_no TEXT,
      expiry_date DATETIME,
      quantity INTEGER,
      free_qty INTEGER DEFAULT 0,
      cost_price REAL,
      mrp REAL,
      hsn_code TEXT,
      cgst_per REAL DEFAULT 0,
      cgst_value REAL DEFAULT 0,
      sgst_per REAL DEFAULT 0,
      sgst_value REAL DEFAULT 0,
      igst_per REAL DEFAULT 0,
      igst_value REAL DEFAULT 0,
      scheme_per REAL DEFAULT 0,
      scheme_value REAL DEFAULT 0,
      cd_value REAL DEFAULT 0,
      legacy_id TEXT,
      FOREIGN KEY(purchase_id) REFERENCES purchases(id),
      FOREIGN KEY(medicine_id) REFERENCES medicines(id)
    );

    -- Migration: Return line items
    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER,
      medicine_id INTEGER,
      batch_no TEXT,
      quantity INTEGER,
      cost_price REAL,
      mrp REAL,
      total_price REAL,
      cgst_value REAL DEFAULT 0,
      sgst_value REAL DEFAULT 0,
      igst_value REAL DEFAULT 0,
      legacy_id TEXT,
      FOREIGN KEY(return_id) REFERENCES returns(id),
      FOREIGN KEY(medicine_id) REFERENCES medicines(id)
    );

    -- Migration: Stock movement audit trail
    CREATE TABLE IF NOT EXISTS stock_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER,
      batch_no TEXT,
      quantity INTEGER,
      transaction_type TEXT,
      transaction_id TEXT,
      business_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(medicine_id) REFERENCES medicines(id)
    );
  `);

  // Safely add legacy_id/speciality to doctors if the table already existed without them
  const doctorAlters = [
    `ALTER TABLE doctors ADD COLUMN legacy_id TEXT`,
    `ALTER TABLE doctors ADD COLUMN speciality TEXT`,
  ];
  for (const stmt of doctorAlters) {
    try { await db.run(stmt); } catch (_e) { /* already exists */ }
  }

  await db.close();

}
