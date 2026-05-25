import sqlite3 from 'sqlite3';

// Helper function to normalize various date formats to ISO 8601 DATETIME string (YYYY-MM-DD HH:MM:SS)
// Returns null for invalid dates or NULL input
// Returns undefined if the input was NULL/empty (to distinguish from invalid dates)
function normalizeDate(dateStr: string): string | null | undefined {
    if (!dateStr || dateStr.toUpperCase() === 'NULL') {
        return undefined; // Indicates that NULL is a valid value
    }

    // Remove surrounding quotes if present
    let cleaned = dateStr.trim();
    if ((cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
    }

    // Try to match MM/YY format
    const mmYYMatch = cleaned.match(/^(\d{1,2})\/(\d{2})$/);
    if (mmYYMatch) {
        const month = parseInt(mmYYMatch[1], 10);
        let year = parseInt(mmYYMatch[2], 10);
        // Assume years 00-69 are 2000s, 70-99 are 1900s (common for expiry dates)
        if (year < 70) {
            year += 2000;
        } else {
            year += 1900;
        }
        // Validate month
        if (month < 1 || month > 12) {
            return null; // Invalid date
        }
        // Set to first day of the month at 00:00:00
        return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01 00:00:00`;
    }

    // Try to match DD-MM-YYYY format
    const ddMMYYYYMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddMMYYYYMatch) {
        const day = parseInt(ddMMYYYYMatch[1], 10);
        const month = parseInt(ddMMYYYYMatch[2], 10);
        const year = parseInt(ddMMYYYYMatch[3], 10);
        // Basic validation
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null; // Invalid date
        }
        return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} 00:00:00`;
    }

    // Try to match YYYY-MM-DD format (already ISO date)
    const yyyymmddMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (yyyymmddMatch) {
        const year = parseInt(yyyymmddMatch[1], 10);
        const month = parseInt(yyyymmddMatch[2], 10);
        const day = parseInt(yyyymmddMatch[3], 10);
        // Basic validation
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null; // Invalid date
        }
        return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} 00:00:00`;
    }

    // If none of the matched formats, return null to indicate failure
    return null;
}

/**
 * Process a single line of SQL that may be a legacy inventory INSERT statement.
 * @param sqlLine - A line of SQL from the migration file
 * @param db - An open SQLite database connection
 * @returns True if the line was processed as a legacy inventory statement, false otherwise
 */
export async function processInventoryLine(sqlLine: string, db: sqlite3.Database): Promise<boolean> {
  // Trim whitespace and ignore empty lines
  const line = sqlLine.trim();
  if (!line) return false;

  // Check if this is an INSERT INTO legacy_stock or legacy_batches statement (case-insensitive)
  const uppercaseLine = line.toUpperCase();
  if (!uppercaseLine.startsWith('INSERT INTO LEGACY_STOCK') &&
      !uppercaseLine.startsWith('INSERT INTO LEGACY_BATCHES')) {
    return false;
  }

  try {
    // Extract the VALUES part from the INSERT statement
    // Find the position of 'VALUES' (case-insensitive)
    const valuesIndex = uppercaseLine.indexOf('VALUES');
    if (valuesIndex === -1) {
      console.warn('INSERT INTO legacy_* found but no VALUES clause:', line);
      return false;
    }

    // Get everything after 'VALUES'
    const afterValues = line.substring(valuesIndex + 6); // 6 = length of 'VALUES'

    // Find the opening parenthesis after VALUES
    const openParenIndex = afterValues.indexOf('(');
    if (openParenIndex === -1) {
      console.warn('No opening parenthesis found after VALUES:', line);
      return false;
    }

    // Find the matching closing parenthesis (simple approach - assumes no nested parentheses)
    let closeParenIndex = afterValues.indexOf(')', openParenIndex);
    if (closeParenIndex === -1) {
      console.warn('No closing parenthesis found for VALUES:', line);
      return false;
    }

    // Extract the values string between parentheses
    const valuesStr = afterValues.substring(openParenIndex + 1, closeParenIndex).trim();

    // Split values by comma (naive approach - assumes no commas inside string values)
    // In a real migration, we'd use a proper SQL parser, but for simplicity we assume clean data
    const rawValues = valuesStr.split(',').map(v => v.trim());

    // We expect 5 columns: medicine_id, quantity, rack_location, batch_no, expiry_date
    if (rawValues.length !== 5) {
      console.warn('Expected 5 values in legacy_* INSERT, got:', rawValues.length, line);
      return false;
    }

    // Extract and clean each value (remove surrounding quotes if present)
    const cleanValue = (val: string) => {
      // Remove leading/trailing whitespace
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
    };

    const medicineIdStr = cleanValue(rawValues[0]);
    const quantityStr = cleanValue(rawValues[1]);
    const rackLocation = cleanValue(rawValues[2]);
    const batchNo = cleanValue(rawValues[3]);
    const expiryDateStr = cleanValue(rawValues[4]);

    // Convert medicine_id and quantity to numbers
    const medicineId = parseInt(medicineIdStr, 10);
    const quantity = parseInt(quantityStr, 10);

    // Validate medicine_id and quantity
    if (isNaN(medicineId) || isNaN(quantity)) {
      console.warn(`Invalid medicine_id or quantity in legacy_* INSERT`, line);
      return false;
    }

    // Normalize expiry date
    const normalizedExpiryDate = normalizeDate(expiryDateStr);

    // If normalizeDate returned null, it means the date format was invalid
    // (undefined means it was NULL/empty which is valid)
    if (normalizedExpiryDate === null) {
      console.warn(`Invalid expiry date format in legacy_* INSERT: ${expiryDateStr}`, line);
      return false;
    }

    // Insert into inventory_master table
    await db.run(
      'INSERT INTO inventory_master (medicine_id, quantity, rack_location, batch_no, expiry_date) VALUES (?, ?, ?, ?, ?)',
      [medicineId, quantity, rackLocation, batchNo, normalizedExpiryDate]
    );

    return true;
  } catch (error) {
    console.error('Error processing legacy inventory line:', error, line);
    // Return false on error to indicate failure to process
    return false;
  }
}