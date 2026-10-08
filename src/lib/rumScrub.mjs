// Real-user monitoring privacy filter for Vercel Speed Insights events.
//
// A vital event carries the page URL. Staff URLs can hold record IDs in the path
// (/students/<uuid>) and search text or record IDs in the query (?q=<name>,
// ?lead=<uuid>). Only the origin and a de-identified path are kept: query and
// fragment are dropped and ID-like path segments become [id]. An event whose URL
// cannot be parsed is dropped rather than sent unfiltered.

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

export function scrubVitalEvent(event) {
  let url;
  try {
    url = new URL(event?.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const path = url.pathname.split('/').map(segment => (ID_SEGMENT.test(segment) ? '[id]' : segment)).join('/');
  return { ...event, url: url.origin + path };
}
