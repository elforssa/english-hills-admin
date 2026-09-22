// Accept only internal list destinations. This value can come from a URL.
export function safeReturnTo(value, fallback = '/students') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const url = new URL(value, 'https://english-hills.local');
    if (url.origin !== 'https://english-hills.local') return fallback;
    const listPath = ['/students', '/students-directory', '/teachers', '/receipts', '/dashboard', '/finance'].includes(url.pathname);
    const profilePath = /^\/(students|teachers)\/[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(url.pathname);
    if (!listPath && !profilePath) return fallback;
    return `${url.pathname}${url.search}`;
  } catch { return fallback; }
}

export function recordHref(path, returnTo) {
  return `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function listHref(path, fields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== '' && value !== null && value !== undefined && value !== false && !(key === 'page' && Number(value) === 1)) params.set(key, String(value));
  }
  return `${path}${params.size ? `?${params}` : ''}`;
}
