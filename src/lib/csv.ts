/**
 * One safe way to write a CSV cell. Spreadsheet programs run any cell that starts with = + - @ (or a tab or return)
 * as a formula, so a value someone typed into the app, like a broker name of =HYPERLINK(...), could run on whoever
 * opens the export. Text that starts that way gets a leading apostrophe so it shows as plain text. Real numbers,
 * including negative ones, are left alone.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)$/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [csvLine(headers), ...rows.map(csvLine)].join('\n');
}
