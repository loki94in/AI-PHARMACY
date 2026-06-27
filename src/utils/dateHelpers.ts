/**
 * Parses an expiry date string (MM/YY, MM/YYYY, or ISO) into a Date set to
 * the last day of that month.  Returns null for unparseable input.
 */
export function parseExpiryDate(expiryDateStr: string | null | undefined): Date | null {
  if (!expiryDateStr) return null;
  let expDate: Date;
  if (expiryDateStr.includes('/')) {
    const parts = expiryDateStr.split('/');
    let year = parseInt(parts[1], 10);
    const month = parseInt(parts[0], 10) - 1; // 0-indexed
    if (isNaN(year) || isNaN(month)) return null;
    if (year < 100) year += 2000;
    expDate = new Date(year, month + 1, 0); // last day of that month
  } else {
    expDate = new Date(expiryDateStr);
  }
  return isNaN(expDate.getTime()) ? null : expDate;
}
