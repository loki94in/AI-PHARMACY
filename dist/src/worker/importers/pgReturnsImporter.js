/**
 * PostgreSQL → SQLite Importer for returns & stock data:
 *   - return_orders → returns
 *   - return_order_item → return_items
 *   - stock_effects → stock_ledger
 */
import { medicineMap, distributorMap } from './pgMasterImporter.js';
// Maps for cross-referencing
export const returnMap = new Map(); // legacy return_order_id → new returns.id
export function clearReturnsMap() {
    returnMap.clear();
}
// ─── Return Orders → returns ────────────────────────────────
let returnBatch = [];
export async function importReturnOrder(row, db) {
    const legacyId = row['return_order_id'];
    const deleted = row['deleted'];
    if (!legacyId || deleted === 't')
        return;
    // Determine return type
    const returnOrderType = (row['return_order_type'] || '').toUpperCase();
    const returnType = returnOrderType === 'PURCHASE' ? 'purchase' : 'sale';
    // Resolve distributor for purchase returns
    const legacyDistId = row['distributor_id'];
    const distributorId = legacyDistId ? distributorMap.get(legacyDistId) : null;
    // Generate return_no
    const returnNo = row['invoice_id'] || `RET-${legacyId}`;
    // Try to resolve original invoice
    let originalInvoiceId = null;
    // For purchase returns, link to purchases; for sale returns, link to sales_invoices
    // The invoice_id field in return_orders references the source
    returnBatch.push({
        return_no: returnNo,
        original_invoice_id: originalInvoiceId,
        type: returnType,
        date: row['created_time'] || null,
        total_amount: parseFloat(row['amount'] || '0') || 0,
        cgst_value: parseFloat(row['cgst_value'] || '0') || 0,
        sgst_value: parseFloat(row['sgst_value'] || '0') || 0,
        igst_value: parseFloat(row['igst_value'] || '0') || 0,
        distributor_id: distributorId || null,
        legacy_id: legacyId,
    });
    if (returnBatch.length >= 500) {
        await flushReturns(db);
    }
}
export async function flushReturns(db) {
    if (returnBatch.length === 0)
        return;
    await db.run('BEGIN TRANSACTION');
    for (const r of returnBatch) {
        const result = await db.run(`INSERT INTO returns (return_no, original_invoice_id, type, date, total_amount, cgst_value, sgst_value, igst_value, distributor_id, legacy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [r.return_no, r.original_invoice_id, r.type, r.date, r.total_amount, r.cgst_value, r.sgst_value, r.igst_value, r.distributor_id, r.legacy_id]);
        returnMap.set(r.legacy_id, result.lastID);
    }
    await db.run('COMMIT');
    returnBatch = [];
}
// ─── Return Order Item → return_items ───────────────────────
let returnItemBatch = [];
export async function importReturnOrderItem(row, db) {
    const legacyId = row['return_order_item_id'];
    const deleted = row['deleted'];
    if (!legacyId || deleted === 't')
        return;
    // Resolve parent return
    const legacyReturnId = row['return_order_id'];
    const returnId = legacyReturnId ? returnMap.get(legacyReturnId) : null;
    if (!returnId)
        return; // Parent return was deleted or not imported
    // Resolve medicine
    const legacyMedId = row['medicine_id'];
    const medicineId = legacyMedId ? medicineMap.get(legacyMedId) : null;
    returnItemBatch.push({
        return_id: returnId,
        medicine_id: medicineId || null,
        batch_no: row['batch_id'] || null,
        quantity: parseInt(row['quantity'] || '0') || 0,
        cost_price: parseFloat(row['cost_price'] || '0') || 0,
        mrp: parseFloat(row['mrp'] || '0') || 0,
        total_price: parseFloat(row['total_price'] || '0') || 0,
        cgst_value: parseFloat(row['cgst_value'] || '0') || 0,
        sgst_value: parseFloat(row['sgst_value'] || '0') || 0,
        igst_value: parseFloat(row['igst_value'] || '0') || 0,
        legacy_id: legacyId,
    });
    if (returnItemBatch.length >= 2000) {
        await flushReturnItems(db);
    }
}
export async function flushReturnItems(db) {
    if (returnItemBatch.length === 0)
        return;
    await db.run('BEGIN TRANSACTION');
    for (const ri of returnItemBatch) {
        await db.run(`INSERT INTO return_items (return_id, medicine_id, batch_no, quantity, cost_price, mrp, total_price, cgst_value, sgst_value, igst_value, legacy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [ri.return_id, ri.medicine_id, ri.batch_no, ri.quantity, ri.cost_price, ri.mrp, ri.total_price, ri.cgst_value, ri.sgst_value, ri.igst_value, ri.legacy_id]);
    }
    await db.run('COMMIT');
    returnItemBatch = [];
}
// ─── Stock Effects → stock_ledger ───────────────────────────
let stockBatch = [];
export async function importStockEffect(row, db) {
    const deleted = row['deleted'];
    if (deleted === 't')
        return;
    // Resolve medicine
    const legacyMedId = row['medicine_id'];
    const medicineId = legacyMedId ? medicineMap.get(legacyMedId) : null;
    if (!medicineId)
        return;
    stockBatch.push({
        medicine_id: medicineId,
        batch_no: row['batch_id'] || null,
        quantity: parseInt(row['quantity'] || '0') || 0,
        transaction_type: row['transaction_type'] || null,
        transaction_id: row['transaction_id'] || null,
        business_date: row['business_date'] || null,
    });
    if (stockBatch.length >= 5000) {
        await flushStockLedger(db);
    }
}
export async function flushStockLedger(db) {
    if (stockBatch.length === 0)
        return;
    await db.run('BEGIN TRANSACTION');
    for (const s of stockBatch) {
        await db.run(`INSERT INTO stock_ledger (medicine_id, batch_no, quantity, transaction_type, transaction_id, business_date)
       VALUES (?, ?, ?, ?, ?, ?)`, [s.medicine_id, s.batch_no, s.quantity, s.transaction_type, s.transaction_id, s.business_date]);
    }
    await db.run('COMMIT');
    stockBatch = [];
}
