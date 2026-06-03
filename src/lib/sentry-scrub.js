// =============================================================================
// CNDP (Loi 09-08) PII scrubber for Sentry.
//
// Runs in-process before any event/breadcrumb leaves the app, so student and
// financial PII never reaches Sentry's servers. Pure JS (no imports) so it is
// safe to load from the browser, Node, and edge runtimes alike.
//
// Strategy (defence in depth):
//   1. Redact values of any key whose NAME looks sensitive (allowlist-by-name).
//   2. Scrub obvious PII patterns (emails, long digit runs) out of free text.
//   3. Drop request bodies / query strings / cookies entirely.
// Combine with `sendDefaultPii: false`, the EU data region, a signed DPA, and
// keeping your own error messages generic.
// =============================================================================

// Field-name fragments that carry personal or financial data. Contains-match,
// case-insensitive — over-redacting an extra field is fine; leaking isn't.
const PII_KEY = /(email|full_name|nom|prenom|name|telephone|phone|iban|naissance|montant|salaire|taux_horaire|cnss|amo|ir_retenu|adresse|address)/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONGNUM_RE = /\b\d{6,}\b/g; // phones, IBAN digits, ids

function redactText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(EMAIL_RE, '[email]').replace(LONGNUM_RE, '[number]');
}

// Recursively redact an object/array in place. Depth-capped to avoid cycles.
function redactDeep(node, depth = 0) {
  if (!node || depth > 6) return node;
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (v && typeof v === 'object') redactDeep(v, depth + 1);
      else node[i] = redactText(v);
    });
    return node;
  }
  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (PII_KEY.test(key)) {
        node[key] = '[redacted]';
      } else if (val && typeof val === 'object') {
        redactDeep(val, depth + 1);
      } else {
        node[key] = redactText(val);
      }
    }
  }
  return node;
}

/** Sentry `beforeSend` hook — scrub an error event before transmission. */
export function scrubEvent(event) {
  if (!event) return event;

  if (event.message) event.message = redactText(event.message);

  // Exception messages frequently interpolate data.
  for (const ex of event.exception?.values || []) {
    if (ex.value) ex.value = redactText(ex.value);
  }

  // Request context: drop bodies/cookies/query, scrub the URL.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
    }
    if (event.request.url) event.request.url = redactText(event.request.url);
  }

  // Never attach end-user identity.
  delete event.user;

  if (event.extra) redactDeep(event.extra);
  if (event.contexts) redactDeep(event.contexts);

  return event;
}

/** Sentry `beforeBreadcrumb` hook — scrub a breadcrumb before it is attached. */
export function scrubBreadcrumb(crumb) {
  if (!crumb) return crumb;
  if (crumb.message) crumb.message = redactText(crumb.message);
  if (crumb.data) {
    // Network breadcrumbs keep the path but lose the query string + body.
    if (typeof crumb.data.url === 'string') crumb.data.url = redactText(crumb.data.url.split('?')[0]);
    delete crumb.data.body;
    redactDeep(crumb.data);
  }
  return crumb;
}
