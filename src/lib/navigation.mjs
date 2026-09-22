const ORIGIN = 'https://english-hills.local';
const RETURN_SCREENS = new Set([
  '/students', '/students-directory', '/teachers', '/receipts', '/dashboard', '/finance',
  '/attendance', '/assessments', '/payroll', '/dismissal', '/enrollments',
  '/timetable', '/groups', '/premium-sessions', '/learning-assessments',
  '/leave-requests', '/placement-tests', '/certificates', '/portfolios', '/activity-log',
]);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PROFILE = new RegExp(`^/(students|teachers|groups)/${UUID}$`, 'i');
const RECEIPT_PREVIEW = new RegExp(`^/receipts/${UUID}/print$`, 'i');

function isSafeDestination(value, depth = 0) {
  if (depth > 6 || typeof value !== 'string' || value.length > 4096
    || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return false;
  // Reject encoded path separators and dot segments before URL normalizes them.
  const rawPath = value.split(/[?#]/, 1)[0];
  if (/%(?:2e|2f|5c)/i.test(rawPath)) return false;
  try {
    const url = new URL(value, ORIGIN);
    if (url.origin !== ORIGIN || url.hash) return false;
    if (!RETURN_SCREENS.has(url.pathname) && !PROFILE.test(url.pathname) && !RECEIPT_PREVIEW.test(url.pathname)) return false;
    const nested = url.searchParams.getAll('returnTo');
    return nested.length <= 1 && (nested.length === 0 || isSafeDestination(nested[0], depth + 1));
  } catch { return false; }
}

// Accept only supported internal destinations, including validated nested returns.
export function safeReturnTo(value, fallback = '/students') {
  if (!isSafeDestination(value)) return fallback;
  const url = new URL(value, ORIGIN);
  return `${url.pathname}${url.search}`;
}

export function recordHref(path, returnTo) {
  return `${path}${path.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function listHref(path, fields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== '' && value !== null && value !== undefined && value !== false && !(key === 'page' && Number(value) === 1)) params.set(key, String(value));
  }
  return `${path}${params.size ? `?${params}` : ''}`;
}
