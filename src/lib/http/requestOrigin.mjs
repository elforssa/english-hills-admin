// Request-origin guard for cookie-authenticated, state-changing routes (plan
// PRF-r2 D10, audit ACC-4). english-hills.com is the same *site* as
// admin.english-hills.com for browser cookies, so SameSite=Lax alone does not
// stop a page on the public site from posting with the staff session.
//
// A request passes only when:
//   • its Origin header equals the route's own origin (the admin site);
//   • Sec-Fetch-Site, when the browser sends it, is "same-origin";
//   • its Content-Type is application/json (a cross-site form cannot send it).
//
// Call it first, before any authentication work. Webhooks, cron, public and
// bearer-authenticated worker routes have their own authentication and are
// listed as exempt in scripts/test-portal-readiness-unit.mjs.

export const CROSS_ORIGIN_ERROR = 'Requête refusée : origine non autorisée.';
export const CONTENT_TYPE_ERROR = 'Requête refusée : JSON attendu.';

export function requestOriginRefusal(request) {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected) return { status: 403, error: CROSS_ORIGIN_ERROR };
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return { status: 403, error: CROSS_ORIGIN_ERROR };
  const type = request.headers.get('content-type') || '';
  if (!/^application\/json\s*(?:;|$)/i.test(type)) return { status: 415, error: CONTENT_TYPE_ERROR };
  return null;
}

// Returns a refusal Response, or null when the request may continue.
export function rejectCrossOrigin(request) {
  const refusal = requestOriginRefusal(request);
  if (!refusal) return null;
  return Response.json({ error: refusal.error }, { status: refusal.status, headers: { 'Cache-Control': 'no-store' } });
}
