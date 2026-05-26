// Shared utility functions for migration parsers
/**
 * Helper function to parse CSV-like values string respecting quotes
 * Handles both single and double quotes
 */
export function parseValues(valuesStr) {
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
export function cleanValue(val) {
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
 * Helper function to normalize various date formats to ISO 8601 DATETIME string (YYYY-MM-DD HH:MM:SS)
 * Returns null for invalid dates or NULL input
 * Returns undefined if the input was NULL/empty (to distinguish from invalid dates)
 */
export function normalizeDate(dateStr) {
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
        }
        else {
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
