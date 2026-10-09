// Real-user monitoring privacy filter for Vercel Speed Insights events.
//
// A vital event carries the page URL and a route. Staff URLs can hold record IDs in
// the path (/students/<uuid>) and search text or record IDs in the query (?q=<name>,
// ?lead=<uuid>). Only the origin and a de-identified path are kept: query and
// fragment are dropped and ID-like path segments become [id]. The route gets the
// same treatment, because the Next.js wrapper falls back to the raw pathname when it
// cannot map params (for example a not-found page under an ID path). An event whose
// URL or route cannot be parsed is dropped rather than sent unfiltered.

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

const scrubPath = path => path.split('/').map(segment => (ID_SEGMENT.test(segment) ? '[id]' : segment)).join('/');

// A route pattern or pathname, de-identified like the URL path. Returns null when the
// value is not a string path (callers then drop the event or send no route).
export function scrubRoute(route) {
  if (typeof route !== 'string') return null;
  let path = route.split(/[?#]/, 1)[0];
  if (!path.startsWith('/')) {
    try {
      const url = new URL(route);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  return scrubPath(path);
}

export function scrubVitalEvent(event) {
  let url;
  try {
    url = new URL(event?.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const scrubbed = { ...event, url: url.origin + scrubPath(url.pathname) };
  if (event.route !== undefined && event.route !== null) {
    const route = scrubRoute(event.route);
    if (route === null) return null;
    scrubbed.route = route;
  }
  return scrubbed;
}
