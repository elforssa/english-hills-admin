// Shared browser/server allowlist. No cookie creation or synthetic click IDs.
export const attributionKeys = ['landing_page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'fbc', 'fbp'];
export function sanitizeUrl(value, originOnly = false) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    // Query/fragment may contain emails, registration tokens or arbitrary PII.
    return originOnly ? url.origin : `${url.origin}${url.pathname}`;
  } catch { return null; }
}
export function sanitizeAttribution(input = {}) {
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const key of attributionKeys) {
    const value = input[key];
    if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/.test(value)) continue;
    if (['landing_page', 'referrer'].includes(key)) {
      const safe = sanitizeUrl(value, key === 'referrer');
      if (safe) result[key] = safe;
    } else if (value.length <= (key === 'fbclid' ? 512 : 256)) result[key] = value;
  }
  return result;
}
