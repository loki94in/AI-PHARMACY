import { Response } from 'express';

function escapeCell(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function csvLine(values: any[]): string {
  return values.map(escapeCell).join(',') + '\r\n';
}

export function streamCsvResponse(
  res: Response,
  filename: string,
  cols: string[],
  rows: Record<string, any>[]
): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write(csvLine(cols));
  for (const row of rows) {
    res.write(csvLine(cols.map(c => row[c])));
  }
  res.end();
}
