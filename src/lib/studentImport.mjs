// CSV import without duplicates (plan NRC-r2, REL-4). Each parsed row gets a
// deterministic learner id from the exact file text and its CSV line, so choosing
// the same file again (even after a reload mid-import) re-sends the same ids and
// rows that already went in are replays. Any edit to the file changes every id.
// Pure: the import page holds the state, the node tests exercise these rules.
export const IMPORT_NAMESPACE = 'english-hills/student-import/v1';
export const IDENTICAL_FILE_WARNING = 'Seul un fichier identique est reconnu : si le fichier est modifié, même d’un caractère, les lignes déjà importées seront créées une seconde fois.';
export const IMPORT_FINISHED = 'Import terminé';

const encoder = new TextEncoder();
const sha256 = async text => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text)));
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

export async function fileDigest(text) {
  return hex(await sha256(text));
}

// UUID in the version-5 layout over SHA-256(namespace, file digest, line).
export async function importRowId(digest, line) {
  const bytes = (await sha256(`${IMPORT_NAMESPACE}\n${digest}\n${line}`)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The CSV line of a parsed data row (line 1 is the header), as the preview shows it.
export const csvLine = row => row.idx + 2;

export async function rowIdentities(text, rows) {
  const digest = await fileDigest(text);
  return Object.fromEntries(await Promise.all(rows.map(async row => [csvLine(row), await importRowId(digest, csvLine(row))])));
}

// Per-row status: absent = pending, { state: 'imported' } or { state: 'failed', reason }.
export function rowsToSend(rows, statuses) {
  return rows.filter(row => row.ok && statuses[csvLine(row)]?.state !== 'imported');
}

export function importFinished(rows, statuses) {
  const valid = rows.filter(row => row.ok);
  return valid.length > 0 && valid.every(row => statuses[csvLine(row)]?.state === 'imported');
}

export function failedLines(statuses) {
  return Object.entries(statuses).filter(([, s]) => s.state === 'failed').map(([line, s]) => ({ line: Number(line), reason: s.reason }))
    .sort((a, b) => a.line - b.line);
}

// Safe, fixed reasons only: never raw database text.
export function importFailureReason(error) {
  if (error?.code === '42501') return 'Accès refusé';
  if (error?.code === '23505') return 'Doublon refusé par la base';
  if (typeof error?.code === 'string' && /^(22|23)[0-9A-Z]{3}$/.test(error.code)) return 'Données refusées par la base';
  return 'Envoi non confirmé : réessayez';
}

// Outcome of createStudentOnce for one row.
export function rowStatus(outcome) {
  if (outcome.status === 'deleted') return { state: 'failed', reason: 'Créé puis supprimé : demandez à l’administration de le restaurer' };
  return { state: 'imported', replayed: outcome.status !== 'created' };
}
