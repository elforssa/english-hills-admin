/**
 * Download an array of objects as a CSV file.
 * @param {Object[]} rows - array of flat objects
 * @param {string} filename - e.g. "presences.csv"
 */
export function csvCell(value) {
  let s = value == null ? '' : String(value);
  // Spreadsheet applications interpret these prefixes as formulas, including
  // after leading whitespace. Prefix with an apostrophe as literal text.
  if (/^[\s\uFEFF]*[=+@-]/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function exportToCsv(rows, filename) {
  if (!Array.isArray(rows)) throw new Error('Export rows are unavailable');
  if (!rows.length) throw new Error('There are no rows to export');
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
