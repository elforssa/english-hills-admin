// The Video SDK's media library (js_media.min.js, loaded by the toolkit from Zoom's
// library host) is a webpack bundle with three lazy chunks: 557 wmsc (the WebRTC client,
// asked for at the join in browsers where Zoom uses WebRTC video: Chrome, Safari), 208
// annoter (asked for when a screen share starts) and 404 pako. Its own loader fetches a
// chunk and runs it from a blob: URL, which the room path's script-src does not allow
// (next.config.mjs: 'self', inline, wasm and the Zoom library host). The refused script
// is cached as a failed chunk, so the SDK's six retries a second apart all fail, it
// raises WMSC_JS_LOAD_FAIL_FAILOVER and reconnects, and every reconnect fails the same
// way: the R4 test lesson of 2026-11-15 flickered every six seconds and ended on
// « Connexion instable ».
//
// A webpack chunk registers itself on a global list when it runs, and the media library
// installs whatever is already on that list when it starts, or as soon as it is pushed.
// So the room loads the three chunks itself, as ordinary scripts from the same library
// host and version the toolkit uses, which the room's script-src already allows; the
// SDK's blob: loader is then never called. No header changes.
//
// The version is the one inside the pinned toolkit (@zoom/videosdk-ui-toolkit 2.5.0-1
// loads https://source.zoom.us/videosdk/2.5.0/lib/js_media.min.js);
// scripts/test-online-room-unit.mjs fails when a toolkit upgrade changes it, and
// scripts/test-online-zoom-two-party.mjs is the check against Zoom itself.
export const ZOOM_MEDIA_LIB = 'https://source.zoom.us/videosdk/2.5.0/lib';
export const ZOOM_MEDIA_CHUNKS = Object.freeze(['wmsc', 'pako', 'annoter']);

const pending = new Map();

function load(doc, name, timeoutMs) {
  if (pending.has(name)) return pending.get(name);
  const promise = new Promise(resolve => {
    const script = doc.createElement('script');
    let timer = null;
    const done = ok => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      // A chunk that did not load may be tried again by the next room on this page.
      if (!ok) { pending.delete(name); script.remove?.(); }
      resolve(ok);
    };
    timer = setTimeout(() => done(false), timeoutMs);
    script.onload = () => done(true);
    script.onerror = () => done(false);
    script.async = true;
    script.src = `${ZOOM_MEDIA_LIB}/${name}.min.js`;
    doc.head.appendChild(script);
  });
  pending.set(name, promise);
  return promise;
}

// Resolves, never rejects, with the chunk names that loaded and those that did not. A
// chunk that did not load leaves the SDK on its own loader for that chunk.
export async function preloadZoomMediaChunks({ doc = globalThis.document, timeoutMs = 20000 } = {}) {
  if (!doc?.head) return { loaded: [], failed: [...ZOOM_MEDIA_CHUNKS] };
  const results = await Promise.all(ZOOM_MEDIA_CHUNKS.map(name => load(doc, name, timeoutMs)));
  return { loaded: ZOOM_MEDIA_CHUNKS.filter((_, i) => results[i]), failed: ZOOM_MEDIA_CHUNKS.filter((_, i) => !results[i]) };
}
