/**
 * PostgreSQL → SQLite Importer for purchase/inventory data:
 *   - batch → inventory_master (current stock)
 *   - inventory → purchases (purchase bill headers)
 *   - inventory_medicine → purchase_items (purchase bill line items)
 */

import { Database } from 'sqlite';
import { medicineMap, distributorMap } from './pgMasterImporter.js';

// Maps for cross-referencing
export const batchMap = new Map<string, number>();     // legacy batch_id → new inventory_master.id
export const purchaseMap = new Map<string, number>();   // legacy inventory_id → new purchases.id

export function clearPurchaseMap() {
  batchMap.clear();
  purchaseMap.clear();
}

// ─── Batch → inventory_master ───────────────────────────────
let batchBatch: any[] = [];
const BATCH_SIZE = 3000;

export async function importBatch(row: Record<string, string | null>, db: Database) {
  const legacyBatchId = row['batch_id'];
  const legacyMedicineId = row['medicine_id'];
  const deleted = row['deleted'];
  if (!legacyBatchId || !legacyMedicineId || deleted === 't') return;

  // Resolve medicine
  const medicineId = medicineMap.get(legacyMedicineId);
  if (!medicineId) return; // Medicine was deleted or not imported

  batchBatch.push({
    medicine_id: medicineId,
    batch_no: row['batch_number'] || legacyBatchId,
    expiry_date: row['batch_expiry'] || null,
    rack_location: row['batch_rack'] || null,
    cost_price: parseFloat(row['cost_price'] || '0') || 0,
    unit_price: parseFloat(row['mrp'] || '0') || 0,
    mrp: parseFloat(row['mrp'] || '0') || 0,
    legacy_batch_id: legacyBatchId,
    quantity: 0, // Will be updated from stock_effects
  });

  if (batchBatch.length >= BATCH_SIZE) {
    await flushBatches(db);
  }
}

export async function flushBatches(db: Database) {
  if (batchBatch.length === 0) return;
  await db.run('BEGIN TRANSACTION');
  for (const b of batchBatch) {
    const result = await db.run(
      `INSERT INTO inventory_master (medicine_id, batch_no, expiry_date, rack_location, cost_price, unit_price, mrp, legacy_batch_id, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.medicine_id, b.batch_no, b.expiry_date, b.rack_location, b.cost_price, b.unit_price, b.mrp, b.legacy_batch_id, b.quantity]
    );
    batchMap.set(b.legacy_batch_id, result.lastID!);
  }
  await db.run('COMMIT');
  batchBatch = [];
}

// ─── Inventory → purchases (purchase bill headers) ──────────
let purchaseBatch: any[] = [];

export async function importInventory(row: Record<string, string | null>, db: Database) {
  const legacyId = row['inventory_id'];
  const deleted = row['deleted'];
  if (!legacyId || deleted === 't') return;

  // Only import PUBLISHED purchases (not drafts/transfers)
  const status = row['status'];
  if (status && status !== 'PUBLISHED') return;

  // Skip transfer entries
  if (row['is_transfer'] === 't' || row['is_transfer'] === 'true') return;

  // Resolve distributor
  const legacyDistId = row['distributor_id'];
  const distributorId = legacyDistId ? distributorMap.get(legacyDistId) : null;

  purchaseBatch.push({
    distributor_id: distributorId || null,
    invoice_no: row['invoice'] || row['invoice_id'] || legacyId,
    date: row['created_time'] || null,
    total_amount: parseFloat(row['amount'] || '0') || 0,
    cgst_value: parseFloat(row['cgst_value'] || '0') || 0,
    sgst_value: parseFloat(row['sgst_value'] || '0') || 0,
    igst_value: parseFloat(row['igst_value'] || '0') || 0,
    roff: parseFloat(row['roff'] || '0') || 0,
    status: status || 'PUBLISHED',
    legacy_id: legacyId,
    business_date: row['business_date'] || row['created_time'] || null,
  });

  if (purchaseBatch.length >= 1000) {
    await flushPurchases(db);
  }
}

export async function flushPurchases(db: Database) {
  if (purchaseBatch.length === 0) return;
  await db.run('BEGIN TRANSACTION');
  for (const p of purchaseBatch) {
    const result = await db.run(
      `INSERT INTO purchases (distributor_id, invoice_no, date, total_amount, cgst_value, sgst_value, igst_value, roff, status, legacy_id, business_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.distributor_id, p.invoice_no, p.date, p.total_amount, p.cgst_value, p.sgst_value, p.igst_value, p.roff, p.status, p.legacy_id, p.business_date]
    );
    purchaseMap.set(p.legacy_id, result.lastID!);
  }
  await db.run('COMMIT');
  purchaseBatch = [];
}

// ─── Inventory Medicine → purchase_items ────────────────────
let purchaseItemBatch: any[] = [];

export async function importInventoryMedicine(row: Record<string, string | null>, db: Database) {
  const legacyId = row['inventory_medicine_id'];
  const deleted = row['deleted'];
  if (!legacyId || deleted === 't') return;

  // Resolve purchase (inventory_id → purchases.id)
  const legacyInvId = row['inventory_id'];
  const purchaseId = legacyInvId ? purchaseMap.get(legacyInvId) : null;
  if (!purchaseId) return; // Parent purchase was deleted or not imported

  // Resolve medicine
  const legacyMedId = row['medicine_id'];
  const medicineId = legacyMedId ? medicineMap.get(legacyMedId) : null;

  // Resolve batch
  const legacyBatchId = row['batch_id'];

  purchaseItemBatch.push({
    purchase_id: purchaseId,
    medicine_id: medicineId || null,
    batch_no: legacyBatchId || null,
    quantity: parseInt(row['quantity'] || '0') || 0,
    free_qty: parseInt(row['free'] || '0') || 0,
    cost_price: parseFloat(row['cost_price'] || '0') || 0,
    mrp: parseFloat(row['mrp'] || '0') || 0,
    hsn_code: row['hsn_code'] || null,
    cgst_per: parseFloat(row['cgst_per'] || '0') || 0,
    cgst_value: parseFloat(row['cgst_value'] || '0') || 0,
    sgst_per: parseFloat(row['sgst_per'] || '0') || 0,
    sgst_value: parseFloat(row['sgst_value'] || '0') || 0,
    igst_per: parseFloat(row['igst_per'] || '0') || 0,
    igst_value: parseFloat(row['igst_value'] || '0') || 0,
    scheme_per: parseFloat(row['scheme_per'] || '0') || 0,
    scheme_value: parseFloat(row['scheme_value'] || '0') || 0,
    cd_value: parseFloat(row['cash_discount_value'] || '0') || 0,
    legacy_id: legacyId,
  });

  if (purchaseItemBatch.length >= 3000) {
    await flushPurchaseItems(db);
  }
}

export async function flushPurchaseItems(db: Database) {
  if (purchaseItemBatch.length === 0) return;
  await db.run('BEGIN TRANSACTION');
  for (const pi of purchaseItemBatch) {
    await db.run(
      `INSERT INTO purchase_items (purchase_id, medicine_id, batch_no, quantity, free_qty, cost_price, mrp, hsn_code,
        cgst_per, cgst_value, sgst_per, sgst_value, igst_per, igst_value, scheme_per, scheme_value, cd_value, legacy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pi.purchase_id, pi.medicine_id, pi.batch_no, pi.quantity, pi.free_qty, pi.cost_price, pi.mrp, pi.hsn_code,
       pi.cgst_per, pi.cgst_value, pi.sgst_per, pi.sgst_value, pi.igst_per, pi.igst_value, pi.scheme_per, pi.scheme_value, pi.cd_value, pi.legacy_id]
    );
  }
  await db.run('COMMIT');
  purchaseItemBatch = [];
}
