/**
 * Minimal RFC-4180-ish CSV parser.
 *
 *   parseCsv(text) → { headers: string[], rows: Object[] }
 *
 * Handles quoted fields, escaped quotes ("" inside a quoted cell), CRLF/LF
 * line endings, and a UTF-8 BOM. Returns an empty result on empty input.
 *
 * Not a streaming parser — fine for the kinds of files an admin pastes
 * into a textarea (a few thousand rows max). Use a real library if you
 * ever need to ingest 100k+ rows.
 */
export function parseCsv(text) {
  if (!text) return { headers: [], rows: [] };

  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { record.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      // Commit current field + record.
      record.push(field); field = '';
      // Drop fully-blank lines.
      if (!(record.length === 1 && record[0] === '')) records.push(record);
      record = [];
      // Skip CRLF as a single newline.
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }
    field += ch; i++;
  }

  // Trailing field/record.
  if (field !== '' || record.length > 0) {
    record.push(field);
    if (!(record.length === 1 && record[0] === '')) records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map(h => h.trim());
  const rows = records.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });

  return { headers, rows };
}
