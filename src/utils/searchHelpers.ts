/**
 * Normalizes numeric search terms by stripping trailing decimal zeros so
 * they match SQLite CAST(value AS TEXT) output (e.g. "31.00" → "31").
 */
export const normalizeNumericSearch = (val: string): string => {
  const cleaned = val.trim();
  if (!cleaned) return '';
  if (/^\d+\.\d+$/.test(cleaned)) {
    return String(parseFloat(cleaned));
  }
  if (/^\d+\.$/.test(cleaned)) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
};
