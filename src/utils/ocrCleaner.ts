/**
 * Utility functions to filter out invoice/bill headers, drug license numbers, phone numbers,
 * dates, totals, and other non-medicine noise from OCR extracted text.
 */

/**
 * Checks if a trimmed line is a valid medicine name candidate.
 * It filters out lines containing DL numbers, GST numbers, phone numbers, invoice headers, etc.
 */
export function isValidMedicineNameCandidate(line: string): boolean {
  if (!line) return false;

  const trimmed = line.trim();
  if (trimmed.length < 2) return false; // Too short to be a medicine name

  // If the line consists only of symbols, punctuation, or numbers, it's not a medicine name
  if (/^[^a-zA-Z]*$/.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();

  // Pattern checks for common noise line categories
  const noisePatterns = [
    // Bill / Invoice identifiers (e.g. "TAX INVOICE", "INVOICE", "CASH MEMO")
    /\b(?:invoice|bill|memo|receipt|challan|estimate|cash\s*memo|tax\s*invoice|credit\s*memo|debit\s*memo)\b/i,
    // Bill numbers / Invoice numbers (e.g. "INV NO: 123", "BILL#", "Ref No.")
    /\b(?:inv|invoice|bill|challan|receipt|memo|ref|doc|s\.?)\s*(?:no\.?|number|#|id)\b/i,
    // Drug License numbers (e.g. "DL NO: MH-12-34", "D.L. 20-B", "DRUG LIC")
    /\b(?:dl|d\.?l\.?|lic|license|licence|lic\.?\s*no\.?)(?:\s*(?:no\.?|number|#))?\b/i,
    /\bdrug\s*lic/i,
    // Phone, Mobile, Contact details
    /\b(?:phone|tel|tele|telephone|mobile|mob|contact|fax|ph)(?:\s*(?:no\.?|number|#))?\b/i,
    // Email and Website URLs
    /@/i,
    /\b(?:email|e-mail|www|http|https|website|web|internet)\b/i,
    // GSTIN, GST, FSSAI, CIN (safe to check standalone or with optional suffix)
    /\b(?:gst|gstin|fssai|cin|uid|uidai|aadhaar|adhaar)(?:\s*(?:no\.?|number|#|:))?\b/i,
    // PAN, TIN, TAN, HSN, SAC (require suffix or colon to avoid matching medicine names like PAN-D)
    /\b(?:pan|tin|tan|hsn|sac)(?:\s*(?:no\.?|number|#|code|:)|:)/i,
    // TAX details (e.g. TAX INVOICE, TAX AMOUNT)
    /\btax\s*(?:invoice|rate|amount|value|id|no\.?|number|:)\b/i,
    // Dates & Times (e.g., "Date: 26/06/2026")
    /\b(?:date|time|dt|d\.o\.b|dob)\b/i,
    // Address elements
    /\b(?:road|street|st\.|lane|nagar|colony|building|bldg|floor|dist(?:\.?|rict)|state|pin(?:\s*code)?|zip|address|addr)\b/i,
    // Pharmacy / Chemist store descriptors (headers)
    /\b(?:pharmacy|chemist|medical(?:\s*store)?|druggist|medical\s*hall|healthcare|hospital|clinic)\b/i,
    // Doctor / Patient details (e.g., doctor, patient, customer)
    /\b(?:doctor|patient|customer|cust|patient\s*name|dr\s*name|patient\s*id|customer\s*id)\b/i,
    // Doctor/Title prefixes (e.g., Dr., Mr., Mrs., M/s)
    /\b(?:dr|m[rs]|m\/s)\b\.?/i,
    // Accounting / Price / Totals line (e.g., "TOTAL: 150.00", "MRP", "QTY: 10")
    /\b(?:total|subtotal|sub\s*total|qty|quantity|mrp|discount|disc|rate|amount|price|rs\.?|₹|balance|paid|due|change)\b/i,
    // Expiry / Batch lines (metadata)
    /\b(?:exp|expiry|exp\.?\s*date|expiry\.?\s*date|batch|lot|batch\.?\s*no|b\.?\s*no|lot\.?\s*no)\b/i,
  ];

  for (const pattern of noisePatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  // Count digits and alphabetic characters
  const digitCount = (trimmed.match(/\d/g) || []).length;
  const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;

  // If there are more digits than letters, it's likely a phone number, GSTIN, or DL No, not a medicine name
  if (digitCount > letterCount) return false;

  return true;
}

/**
 * Removes serial prefixes and leading/trailing punctuation/spaces.
 * Examples:
 *   "1. METACARD 25 MG" -> "METACARD 25 MG"
 *   "02) SHELCAL 500"   -> "SHELCAL 500"
 *   "- ACI-LOC 150"     -> "ACI-LOC 150"
 */
export function cleanMedicineNameLine(line: string): string {
  if (!line) return '';
  let cleaned = line.trim();

  // Remove common serial number prefixes like "1. ", "02) ", "12 - ", etc.
  cleaned = cleaned.replace(/^\s*\d+\s*[\.\)\-\/\:]\s*/, '');

  // Remove other leading noise symbols like bullet points, dashes, commas
  cleaned = cleaned.replace(/^[\s\-\*\•\+\=\#\.\,\:\;]+/g, '');

  return cleaned.trim();
}

/**
 * Splits text by lines, cleans them, and returns the first line that is a valid medicine name candidate.
 * Falls back to the first cleaned non-empty line if no lines pass validation.
 */
export function extractMedicineNameFromText(text: string): string {
  if (!text) return '';

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // First pass: look for a valid medicine name candidate
  for (const line of lines) {
    const cleaned = cleanMedicineNameLine(line);
    if (isValidMedicineNameCandidate(cleaned)) {
      return cleaned;
    }
  }

  // Fallback pass: return the first non-empty line cleaned
  for (const line of lines) {
    const cleaned = cleanMedicineNameLine(line);
    if (cleaned.length > 0) {
      // Avoid returning lines that are just numbers/symbols
      if (/[a-zA-Z]/.test(cleaned)) {
        return cleaned;
      }
    }
  }

  // Final fallback
  return lines.length > 0 ? cleanMedicineNameLine(lines[0]) : '';
}
