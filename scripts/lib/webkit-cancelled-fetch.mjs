// WebKit raises a fetch that a navigation cancelled as the page error « Fetch API cannot load …
// due to access control checks » (Playwright names it 'Fetch API cannot load http'). A receptionist
// menu with more links leaves more Next.js prefetches in flight when a test replaces the page.
//
// Such an error is excused only when the same request failed as cancelled, or when a new document
// loaded from 0.5 s before to 3 s after it. WebKit emits no request event for cross-origin reads
// cancelled before their preflight. Any other access-control error stays an error: a real CORS
// failure has neither, and test-crm-rcc-b1-browser.mjs uses the same rule.
export function cancelledFetches(page) {
  const cancelled = [], documents = [], reported = [];
  page.on('requestfailed', request => {
    if (/cancel|abort/i.test(request.failure()?.errorText || '')) {
      const url = new URL(request.url());
      cancelled.push(url.host + url.pathname + url.search);
    }
  });
  page.on('domcontentloaded', () => documents.push(Date.now()));
  return {
    // True when the page error is WebKit's fetch report; it is then judged by uncancelled().
    take(error, label = error.message) {
      if (error.name !== 'Fetch API cannot load http' || !error.message.endsWith(' due to access control checks.')) return false;
      reported.push({ at: Date.now(), message: error.message, label });
      return true;
    },
    // The reported fetch errors that no cancellation or document replacement explains.
    uncancelled() {
      return reported.filter(error => !cancelled.some(path => error.message.includes(path))
        && !documents.some(at => at >= error.at - 500 && at <= error.at + 3000)).map(error => error.label);
    },
    get count() { return reported.length; },
  };
}
