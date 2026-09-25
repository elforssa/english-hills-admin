import { sanitizeAttribution } from './attribution.mjs';
const storageKey = 'eh:inquiry-attribution:v1';
const ttl = 30 * 60 * 1000;
// Call only after the external site's required consent. This creates no cookies,
// third-party requests or fingerprint. Storage is session-only and origin-scoped.
function observedCookies(browser) {
  const observed = {};
  // Observe only these two existing cookies; never transmit a cookie collection.
  for (const [cookie, field] of [['_fbc', 'fbc'], ['_fbp', 'fbp']]) {
    const entry = browser.document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookie}=`));
    if (entry) { try { observed[field] = decodeURIComponent(entry.slice(cookie.length + 1)); } catch {} }
  }
  return sanitizeAttribution(observed);
}
export function captureWebsiteAttribution({ consent = false, browser = globalThis.window, now = Date.now() } = {}) {
  if (!browser) return {};
  if (!consent) { try { browser.sessionStorage.removeItem(storageKey); } catch {} return {}; }
  const url = new URL(browser.location.href);
  try {
    const raw = browser.sessionStorage.getItem(storageKey);
    const saved = raw?.length <= 8192 ? JSON.parse(raw) : null;
    if (saved?.origin === url.origin && saved.expires > now && saved.expires <= now + ttl) {
      const values = { ...observedCookies(browser), ...sanitizeAttribution(saved.values) };
      browser.sessionStorage.setItem(storageKey, JSON.stringify({ ...saved, values }));
      return values;
    }
  } catch { /* Unavailable storage does not block the form. */ }
  const values = { landing_page: url.href, referrer: browser.document.referrer };
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid']) {
    if (url.searchParams.has(key)) values[key] = url.searchParams.get(key);
  }
  Object.assign(values, observedCookies(browser));
  const clean = sanitizeAttribution(values);
  try { browser.sessionStorage.setItem(storageKey, JSON.stringify({ origin: url.origin, expires: now + ttl, values: clean })); } catch {}
  return clean;
}
export function prepareWebsiteInquiry({ site_key, form_key, contact, answers, attribution, consent }, request_key = globalThis.crypto.randomUUID()) {
  // Keep this object unchanged for retries. No parent/child data is persisted in storage.
  return { site_key, form_key, contact: structuredClone(contact), answers: structuredClone(answers), attribution: sanitizeAttribution(attribution), consent, request_key };
}
export async function submitWebsiteInquiry(endpoint, prepared, { turnstileToken, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(endpoint, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...prepared, ...(turnstileToken ? { turnstileToken } : {}) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Envoi impossible. Réessayez avec la même demande.');
  return result;
}
