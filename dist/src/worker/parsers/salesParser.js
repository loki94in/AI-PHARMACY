/**
 * Helper function to parse CSV-like values string respecting quotes
 * Similar to the one in inventoryParser.ts
 */
function parseValues(valuesStr) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;
    for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];
        if (char === '"' || char === "'") {
            if (!inQuotes) {
                inQuotes = true;
                quoteChar = char;
            }
            else if (quoteChar === char) {
                inQuotes = false;
                quoteChar = null;
            }
            else {
                // Inside quotes but different quote char - treat as literal
                current += char;
            }
        }
        else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        }
        else {
            current += char;
        }
    }
    // Push the last value
    values.push(current);
    // Trim each value and remove surrounding quotes if they exist
    return values.map(val => {
        let trimmed = val.trim();
        if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
            trimmed = trimmed.slice(1, -1);
        }
        return trimmed;
    });
}
/**
 * Helper function to clean a value (remove surrounding quotes)
 */
function cleanValue(val) {
    let cleaned = val.trim();
    // Remove surrounding single quotes
    if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length > 1) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    // Remove surrounding double quotes
    if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 1) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    return cleaned;
}
/**
 * Processes a single line of legacy SQL INSERT statement for sales data.
 * Handles both legacy_sales (invoice headers) and legacy_saleItems (invoice line items).
 * @param sqlLine - The SQL INSERT line to process
 * @param db - An open sqlite3.Database instance
 * @returns Promise resolving to true if the line was handled, false otherwise
 */
export async function processSalesLine(sqlLine, db) {
    const line = sqlLine.trim();
    if (!line)
        return false;
    const uppercaseLine = line.toUpperCase();
    // Handle legacy_sales (invoice headers)
    if (uppercaseLine.startsWith('INSERT INTO LEGACY_SALES')) {
        try {
            // Extract the VALUES part
            const valuesIndex = uppercaseLine.indexOf('VALUES');
            if (valuesIndex === -1) {
                console.warn('INSERT INTO legacy_sales found but no VALUES clause:', line);
                return false;
            }
            const afterValues = line.substring(valuesIndex + 6); // 6 = length of 'VALUES'
            const openParenIndex = afterValues.indexOf('(');
            if (openParenIndex === -1) {
                console.warn('No opening parenthesis found after VALUES:', line);
                return false;
            }
            // Find matching closing parenthesis (handle nested parentheses if needed)
            let closeParenIndex = afterValues.indexOf(')', openParenIndex);
            if (closeParenIndex === -1) {
                console.warn('No closing parenthesis found for VALUES:', line);
                return false;
            }
            const valuesStr = afterValues.substring(openParenIndex + 1, closeParenIndex).trim();
            const values = parseValues(valuesStr);
            // Expected columns for legacy_sales:
            // Based on typical legacy structure, assuming: invoice_id, bill_no, customer_id, date, total_amount, tax_amount, etc.
            // We need to be flexible - let's assume common columns
            if (values.length < 4) { // Minimum: invoice_id/bill_no, customer_id, date, amount
                console.warn(`Expected at least 4 values in legacy_sales INSERT, got ${values.length}:`, line);
                return false;
            }
            // Extract values (adjust indices based on actual legacy structure)
            // Assuming common legacy columns: invoice_id, bill_no, customer_id, date, total_amount, tax_amount
            const invoiceIdOrBillNo = cleanValue(values[0]); // Could be invoice_id or bill_no
            const customerIdStr = cleanValue(values[1] || '0');
            const dateStr = cleanValue(values[2]);
            const totalAmountStr = cleanValue(values[3] || '0');
            const taxAmountStr = cleanValue(values[4] || '0');
            // Convert numeric values
            const customerId = parseInt(customerIdStr, 10) || null;
            const totalAmount = parseFloat(totalAmountStr);
            const taxAmount = parseFloat(taxAmountStr);
            if (isNaN(totalAmount) || isNaN(taxAmount)) {
                console.warn(`Invalid amount values in legacy_sales:`, line);
                return false;
            }
            // Generate invoice number (use invoiceIdOrBillNo or create new one)
            // For now, we'll use the legacy invoice_id/bill_no as invoice_no
            // In a real system, you might want to generate new sequential numbers
            const invoice_no = invoiceIdOrBillNo || `LEGACY-${Date.now()}`;
            // Insert into sales_invoices
            const insertInvoiceQuery = `
                INSERT INTO sales_invoices (invoice_no, customer_id, date, total_amount, tax_amount)
                VALUES (?, ?, ?, ?, ?)
            `;
            return new Promise((resolve) => {
                db.run(insertInvoiceQuery, [invoice_no, customerId, dateStr, totalAmount, taxAmount], (err) => {
                    if (err) {
                        console.error(`Failed to insert sales invoice: ${err.message}`);
                        resolve(false);
                    }
                    else {
                        resolve(true);
                    }
                });
            });
        }
        catch (error) {
            console.error(`Error processing legacy_sales line: ${error}`);
            return false;
        }
    }
    // Handle legacy_saleItems (invoice line items)
    else if (uppercaseLine.startsWith('INSERT INTO LEGACY_SALEITEMS') ||
        uppercaseLine.startsWith('INSERT INTO LEGACY_SALE_ITEMS')) {
        try {
            // Extract the VALUES part
            const valuesIndex = uppercaseLine.indexOf('VALUES');
            if (valuesIndex === -1) {
                console.warn('INSERT INTO legacy_saleItems found but no VALUES clause:', line);
                return false;
            }
            const afterValues = line.substring(valuesIndex + 6); // 6 = length of 'VALUES'
            const openParenIndex = afterValues.indexOf('(');
            if (openParenIndex === -1) {
                console.warn('No opening parenthesis found after VALUES:', line);
                return false;
            }
            // Find matching closing parenthesis
            let closeParenIndex = afterValues.indexOf(')', openParenIndex);
            if (closeParenIndex === -1) {
                console.warn('No closing parenthesis found for VALUES:', line);
                return false;
            }
            const valuesStr = afterValues.substring(openParenIndex + 1, closeParenIndex).trim();
            const values = parseValues(valuesStr);
            // Expected columns for legacy_saleItems:
            // Assuming: item_id, invoice_id/bill_no, medicine_id, quantity, unit_price, etc.
            if (values.length < 4) { // Minimum: invoice_id, medicine_id, quantity, unit_price
                console.warn(`Expected at least 4 values in legacy_saleItems INSERT, got ${values.length}:`, line);
                return false;
            }
            // Extract values (adjust indices based on actual legacy structure)
            // Assuming common legacy columns: item_id, invoice_id/bill_no, medicine_id, quantity, unit_price
            const invoiceIdOrBillNo = cleanValue(values[1]); // Reference to legacy sales header (column 1)
            const medicineIdStr = cleanValue(values[2] || '0'); // medicine_id (column 2)
            const quantityStr = cleanValue(values[3] || '0'); // quantity (column 3)
            const unitPriceStr = cleanValue(values[4] || '0'); // unit_price (column 4)
            // Convert numeric values
            const medicineId = parseInt(medicineIdStr, 10);
            const quantity = parseInt(quantityStr, 10);
            const unitPrice = parseFloat(unitPriceStr);
            if (isNaN(medicineId) || isNaN(quantity) || isNaN(unitPrice)) {
                console.warn(`Invalid values in legacy_saleItems:`, line);
                return false;
            }
            // Foreign key resolution: Find the new sales_invoices.id that corresponds to legacy invoice_id/bill_no
            // We need to look up the sales_invoices record by invoice_no
            const invoiceLookup = await db.get('SELECT id FROM sales_invoices WHERE invoice_no = ?', [invoiceIdOrBillNo]);
            if (!invoiceLookup) {
                console.warn(`Could not find sales invoice with legacy reference '${invoiceIdOrBillNo}' for sale item`);
                // We could still proceed but it would create orphaned items
                // For now, let's skip this line to maintain data integrity
                return false;
            }
            const invoiceId = invoiceLookup.id;
            // Foreign key resolution: Find the new inventory_master.id that corresponds to legacy medicine_id
            const inventoryLookup = await db.get('SELECT id FROM inventory_master WHERE medicine_id = ?', [medicineId]);
            let inventoryId = null;
            if (inventoryLookup) {
                inventoryId = inventoryLookup.id;
            }
            else {
                // Legacy medicine_id not found in inventory_master - flag as unmapped
                console.warn(`Legacy medicine_id ${medicineId} not found in inventory_master - marking as unmapped`);
                // We could insert a placeholder or skip - let's skip for now to maintain referential integrity
                return false;
            }
            // Insert into sale_items
            const insertItemQuery = `
                INSERT INTO sale_items (invoice_id, inventory_id, quantity, unit_price)
                VALUES (?, ?, ?, ?)
            `;
            return new Promise((resolve) => {
                db.run(insertItemQuery, [invoiceId, inventoryId, quantity, unitPrice], (err) => {
                    if (err) {
                        console.error(`Failed to insert sale item: ${err.message}`);
                        resolve(false);
                    }
                    else {
                        resolve(true);
                    }
                });
            });
        }
        catch (error) {
            console.error(`Error processing legacy_saleItems line: ${error}`);
            return false;
        }
    }
    // Not a legacy sales line we care about
    return false;
}
