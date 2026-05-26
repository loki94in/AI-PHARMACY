/**
 * PostgreSQL → SQLite Importer for reference/master data tables:
 *   - category → in-memory map
 *   - manufacturer → in-memory map
 *   - distributor → distributors table
 *   - doctor → doctors table
 *   - patient → customers table
 *   - medicine → medicines table
 */
// In-memory lookup maps (legacy_id → new SQLite id)
export const categoryMap = new Map(); // legacy_id → category_name
export const manufacturerMap = new Map(); // legacy_id → manufacturer_name
export const distributorMap = new Map(); // legacy_id → new id
export const doctorMap = new Map(); // legacy_id → new id
export const patientMap = new Map(); // legacy_id → new id (→ customers)
export const medicineMap = new Map(); // legacy_id → new id
export function clearAllMaps() {
    categoryMap.clear();
    manufacturerMap.clear();
    distributorMap.clear();
    doctorMap.clear();
    patientMap.clear();
    medicineMap.clear();
}
// ─── Category ───────────────────────────────────────────────
export function importCategory(row) {
    const id = row['category_id'];
    const name = row['category_name'];
    const deleted = row['deleted'];
    if (!id || !name || deleted === 't')
        return;
    categoryMap.set(id, name);
}
// ─── Manufacturer ───────────────────────────────────────────
export function importManufacturer(row) {
    const id = row['manufacturer_id'];
    const name = row['manufacturer_name'];
    const deleted = row['deleted'];
    if (!id || !name || deleted === 't')
        return;
    manufacturerMap.set(id, name);
}
// ─── Distributor ────────────────────────────────────────────
let distributorBatch = [];
export async function importDistributor(row, db) {
    const legacyId = row['distributor_id'];
    const name = row['distributor_name'];
    const deleted = row['deleted'];
    if (!legacyId || !name || deleted === 't')
        return;
    distributorBatch.push({
        name: name,
        contact: row['contact'] || row['distributor_sales_mobile'] || null,
        legacy_id: legacyId,
        gstin: row['distributor_gstin'] || null,
        address: row['address'] || null,
        city: row['city'] || null,
        email: row['email'] || null,
        dl_no: row['dlno'] || null,
    });
    if (distributorBatch.length >= 500) {
        await flushDistributors(db);
    }
}
export async function flushDistributors(db) {
    if (distributorBatch.length === 0)
        return;
    await db.run('BEGIN TRANSACTION');
    for (const d of distributorBatch) {
        const result = await db.run(`INSERT INTO distributors (name, contact, legacy_id, gstin, address, city, email, dl_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [d.name, d.contact, d.legacy_id, d.gstin, d.address, d.city, d.email, d.dl_no]);
        distributorMap.set(d.legacy_id, result.lastID);
    }
    await db.run('COMMIT');
    distributorBatch = [];
}
// ─── Doctor ─────────────────────────────────────────────────
let doctorBatch = [];
export async function importDoctor(row, db) {
    const legacyId = row['doctor_id'];
    const name = row['doctor_name'];
    const deleted = row['deleted'];
    if (!legacyId || !name || deleted === 't')
        return;
    doctorBatch.push({
        name,
        degree: row['qualification'] || row['doctor_qualifications'] || null,
        reg_no: row['registration_no'] || null,
        hospital: row['doctor_hospital'] || null,
        phone: row['doctor_phone'] || null,
        address: row['doctor_address'] || null,
        legacy_id: legacyId,
        speciality: row['speciality'] || null,
    });
    if (doctorBatch.length >= 500) {
        await flushDoctors(db);
    }
}
export async function flushDoctors(db) {
    if (doctorBatch.length === 0)
        return;
    await db.run('BEGIN TRANSACTION');
    for (const d of doctorBatch) {
        const result = await db.run(`INSERT INTO doctors (name, degree, reg_no, hospital, phone, address, legacy_id, speciality)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [d.name, d.degree, d.reg_no, d.hospital, d.phone, d.address, d.legacy_id, d.speciality]);
        doctorMap.set(d.legacy_id, result.lastID);
    }
    await db.run('COMMIT');
    doctorBatch = [];
}
// ─── Patient → Customers ───────────────────────────────────
let patientBatch = [];
export async function importPatient(row, db) {
    const legacyId = row['patient_id'];
    const name = row['patient_name'];
    const deleted = row['deleted'];
    if (!legacyId || !name || deleted === 't')
        return;
    patientBatch.push({
        name,
        phone: row['patient_phone'] || null,
        address: row['patient_address'] || null,
        notes: row['remarks'] || null,
        legacy_id: legacyId,
        age: row['age'] || null,
        gender: row['gender'] || null,
    });
    if (patientBatch.length >= 1000) {
        await flushPatients(db);
    }
}
export async function flushPatients(db) {
    if (patientBatch.length === 0)
        return;
    await db.run('BEGIN TRANSACTION');
    for (const p of patientBatch) {
        const result = await db.run(`INSERT INTO customers (name, phone, address, notes, legacy_id, age, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [p.name, p.phone, p.address, p.notes, p.legacy_id, p.age, p.gender]);
        patientMap.set(p.legacy_id, result.lastID);
    }
    await db.run('COMMIT');
    patientBatch = [];
}
// ─── Medicine ───────────────────────────────────────────────
let medicineBatch = [];
const MEDICINE_BATCH_SIZE = 5000;
export async function importMedicine(row, db) {
    const legacyId = row['medicine_id'];
    const name = row['medicine_name'];
    const deleted = row['deleted'];
    if (!legacyId || !name || deleted === 't')
        return;
    // Resolve manufacturer name
    const mfgId = row['manufacturer_id'];
    const mfgName = row['manufacturer_name'] || (mfgId ? manufacturerMap.get(mfgId) : null) || null;
    // Resolve category name
    const catId = row['category_id'];
    const catName = catId ? categoryMap.get(catId) : null;
    medicineBatch.push({
        name,
        legacy_id: legacyId,
        hsn_code: row['hsn_code'] || null,
        manufacturer: mfgName,
        category: catName || null,
        packaging: row['medicine_packaging'] || null,
        item_type: row['itemtype'] || null,
        cgst: parseFloat(row['cgst'] || '0') || 0,
        sgst: parseFloat(row['sgst'] || '0') || 0,
        igst: parseFloat(row['igst'] || '0') || 0,
        rack: row['rack'] || null,
        marketed_by: row['marketer_name'] || null,
        schedule_type: row['therapeutic'] || 'None',
    });
    if (medicineBatch.length >= MEDICINE_BATCH_SIZE) {
        await flushMedicines(db);
    }
}
export async function flushMedicines(db) {
    if (medicineBatch.length === 0)
        return;
    await db.run('BEGIN TRANSACTION');
    for (const m of medicineBatch) {
        const result = await db.run(`INSERT INTO medicines (name, legacy_id, hsn_code, manufacturer, category, packaging, item_type, cgst, sgst, igst, rack, marketed_by, schedule_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [m.name, m.legacy_id, m.hsn_code, m.manufacturer, m.category, m.packaging, m.item_type, m.cgst, m.sgst, m.igst, m.rack, m.marketed_by, m.schedule_type]);
        medicineMap.set(m.legacy_id, result.lastID);
    }
    await db.run('COMMIT');
    medicineBatch = [];
}
