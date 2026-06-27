import { Database } from 'sqlite';

/**
 * Generates the next sales invoice number for the current year.
 * Format: S-YYYY-NNNN  (e.g. S-2026-0001)
 */
export async function generateSalesInvoiceNo(db: Database): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `S-${year}-`;
  const row = await db.get(
    'SELECT invoice_no FROM sales_invoices WHERE invoice_no LIKE ? ORDER BY invoice_no DESC LIMIT 1',
    `${prefix}%`
  );
  let nextNum = 1;
  if (row?.invoice_no) {
    const parts = (row.invoice_no as string).split('-');
    nextNum = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}
