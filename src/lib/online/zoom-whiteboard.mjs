// Whiteboard helpers for the room (plan online-classroom-tools.md, OCT-r3, PR A).
//
// Facts read in the pinned toolkit bundle (@zoom/videosdk-ui-toolkit 2.5.0-1):
//   - `featuresOptions.whiteboard` is read by the bundle but commented out in its
//     typings (undocumented); scripts/test-online-room-unit.mjs fails if an upgrade
//     stops reading it;
//   - the SDK gives a participant the whiteboard canvas only when the account allows it
//     AND the browser is not Android or iOS AND the device has more than two cores;
//     everybody else receives the whiteboard as a share picture;
//   - the toolkit exposes the SDK client as `window.zmClient` (undocumented), and the
//     client answers `getWhiteboardClient().isWhiteboardEnabled()`;
//   - a whiteboard starts and stops through the SDK events `whiteboard-status-change`
//     (own state: 0 closed, 1 pending, 2 in progress) and `peer-whiteboard-state-change`
//     ({ action: 'Start' | 'Stop', userId }).
//   - a participant WITHOUT the canvas (phone, tablet, two cores) gets neither event: the
//     whiteboard reaches it as an ordinary share stream, with the same events and the same
//     participant fields as a screen share (observed with Zoom, 2026-11-15). So the page
//     of whoever presents the whiteboard says so itself, with one fixed marker on the
//     SDK's command channel (owner decision of 2026-11-15, recorded in OWNER_DECISIONS):
//     sent when its whiteboard opens or closes. A participant who arrives later (a late
//     join, a reload, a reconnection) asks with a third fixed marker once it is in the
//     session and its command channel is connected, and the presenter answers; a marker
//     sent the moment somebody joins is lost, because the newcomer's channel is not
//     ready yet (independent review of 2026-11-16). The markers carry nothing else; a
//     receiver believes « open » and « closed » only from the host or a manager, the
//     only roles Zoom lets start a whiteboard.
export const WHITEBOARD_SIGNAL = Object.freeze({ open: 'eh-whiteboard:open', closed: 'eh-whiteboard:closed', ask: 'eh-whiteboard:ask' });

// The two whiteboard sources of the room path's Content-Security-Policy, repeated here
// for the one refusal that is expected (scripts/test-online-room-unit.mjs fails if this
// list and next.config.mjs differ).
export const WHITEBOARD_SOURCES = Object.freeze(['https://us04st1.zoom.us/web_client_whiteboard/', 'https://us05st1.zoom.us/web_client_whiteboard/']);
// Owner decision of 2026-11-16 (OWNER_DECISIONS, S1/B1): Zoom's whiteboard program probes
// whether it may compile code (`Function("")` inside a try, in the validation library it
// bundles) and carries on without it when the browser refuses. The room does not allow
// eval, so the browser reports exactly one kind of refusal while a whiteboard loads:
// directive script-src, blocked value « eval », raised by a script under an approved
// whiteboard source. That one is named; any other refusal is not expected.
export const EXPECTED_CSP_REFUSAL = 'whiteboard-eval-probe';
export function expectedCspRefusal(event) {
  const source = String(event?.sourceFile || '');
  return String(event?.effectiveDirective || event?.violatedDirective || '').trim().split(/\s+/)[0] === 'script-src'
    && String(event?.blockedURI || '') === 'eval' && WHITEBOARD_SOURCES.some(prefix => source.startsWith(prefix));
}

export const WHITEBOARD_READ_ONLY_TEXT = 'Le tableau blanc s’affiche en lecture seule sur cet appareil. Pour écrire au tableau, utilisez un ordinateur.';

// Zoom's own device rule, used only when the SDK client is not exposed.
export function whiteboardDeviceRule(nav) {
  const agent = String(nav?.userAgent || '');
  const mobile = /Android|iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && Number(nav?.maxTouchPoints) > 1);
  return !mobile && Number(nav?.hardwareConcurrency) > 2;
}

// Can this participant open the whiteboard canvas? The SDK's answer when the client is
// exposed, Zoom's device rule otherwise. Never keyed on the window width.
export function whiteboardCapability(win) {
  try {
    const client = win?.zmClient;
    const whiteboard = typeof client?.getWhiteboardClient === 'function' ? client.getWhiteboardClient() : null;
    if (typeof whiteboard?.isWhiteboardEnabled === 'function') return { capable: whiteboard.isWhiteboardEnabled() === true, source: 'sdk' };
  } catch { /* client not ready: use the device rule */ }
  return { capable: whiteboardDeviceRule(win?.navigator), source: 'device' };
}

// A Content-Security-Policy refusal for the room trace: the directive, the host of the
// refused address (or the scheme for blob:, data: and the like; the keyword for inline
// and eval), the host of the script that asked when the browser names one, and
// `expected=…` for the one named refusal. Never a path, a query or anything else.
const hostOf = uri => {
  if (/^[a-z-]+$/i.test(uri)) return uri.toLowerCase();
  if (!uri.includes(':')) return 'unknown';
  try { const url = new URL(uri); return url.host || url.protocol.replace(':', ''); } catch { return 'unknown'; }
};
export function cspBlockedDetail(event) {
  const directive = String(event?.effectiveDirective || event?.violatedDirective || '').trim().split(/\s+/)[0].replace(/[^a-z-]/gi, '') || 'unknown';
  const host = hostOf(String(event?.blockedURI || ''));
  const source = event?.sourceFile ? hostOf(String(event.sourceFile)) : undefined;
  return { directive, host, source, expected: expectedCspRefusal(event) ? EXPECTED_CSP_REFUSAL : undefined };
}
