// WebKit raises a fetch that a navigation cancelled as the page error « Fetch API cannot load …
// due to access control checks » (Playwright names it 'Fetch API cannot load http'). A receptionist
// menu with more links leaves more Next.js prefetches in flight when a test replaces the page.
//
// One rule for every browser suite (independent review of PR #204, B1). Such an error is excused only:
// - by a cancellation of the exact same URL (host, path and query) reported within 1 s of it; each
//   cancellation excuses one error; or
// - for a Next.js prefetch (`_rsc=` in the query) or a Supabase REST read (`/rest/v1/`), when a new
//   document loaded in the 3 s after it. WebKit emits no request event for cross-origin reads
//   cancelled before their preflight, so only the page replacement explains those.
// Anything else stays an error: a real CORS failure of another URL, or outside those windows, fails
// the run. A URL that WebKit reports as refused by CORS (« Origin … is not allowed by
// Access-Control-Allow-Origin », « Preflight response is not successful ») is never excused, whether
// the refusal is in the page error or in a failed request of that URL (re-review I2).
// scripts/test-webkit-cancelled-fetch.mjs proves it with synthetic events.
export const CANCEL_WINDOW_MS = 1000;
export const DOCUMENT_WINDOW_MS = 3000;
const SUFFIX = ' due to access control checks.';
export const ORIGIN_REFUSED = /is not allowed by Access-Control-Allow-Origin|Preflight response is not successful/i;

// WebKit's message holds the URL after the scheme: '//127.0.0.1:54321/rest/v1/x?y due to …'.
export function reportedUrl(message) {
  if (!message.endsWith(SUFFIX)) return null;
  return message.slice(0, -SUFFIX.length).replace(/^:?\/*/, '');
}

const keyOf = url => { const u = new URL(url); return u.host + u.pathname + u.search; };
const preloadKind = key => /[?&]_rsc=/.test(key) || /^[^/]+\/rest\/v1\//.test(key);

export function cancelledFetches(page, { now = Date.now } = {}) {
  const cancelled = [], refused = new Set(), documents = [], reported = [];
  page.on('requestfailed', request => {
    const text = request.failure()?.errorText || '';
    if (ORIGIN_REFUSED.test(text)) refused.add(keyOf(request.url()));
    else if (/cancel|abort/i.test(text)) cancelled.push({ at: now(), key: keyOf(request.url()), used: false });
  });
  page.on('domcontentloaded', () => documents.push(now()));
  return {
    // True when the page error is WebKit's fetch report; it is then judged by uncancelled().
    take(error, label = error.message) {
      if (error.name !== 'Fetch API cannot load http' || !error.message.endsWith(SUFFIX)) return false;
      reported.push({ at: now(), key: reportedUrl(error.message), refused: ORIGIN_REFUSED.test(error.message), label });
      return true;
    },
    // The reported fetch errors that neither rule explains.
    uncancelled() {
      for (const item of cancelled) item.used = false;
      return reported.filter(error => {
        if (error.refused || refused.has(error.key)) return true;
        const match = cancelled.find(item => !item.used && item.key === error.key && Math.abs(item.at - error.at) <= CANCEL_WINDOW_MS);
        if (match) { match.used = true; return false; }
        return !(preloadKind(error.key) && documents.some(at => at >= error.at && at <= error.at + DOCUMENT_WINDOW_MS));
      }).map(error => error.label);
    },
    get count() { return reported.length; },
  };
}
