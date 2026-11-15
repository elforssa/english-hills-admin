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
//     sent when its whiteboard opens or closes and again when somebody joins. The marker
//     carries nothing else; a receiver believes it only from the host or a manager, the
//     only roles Zoom lets start a whiteboard.
export const WHITEBOARD_SIGNAL = Object.freeze({ open: 'eh-whiteboard:open', closed: 'eh-whiteboard:closed' });

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

// A Content-Security-Policy refusal as two words for the room trace: the directive and
// the host (or the scheme for blob:, data: and the like; the keyword for inline and
// eval). Never the path, the query or anything else of the refused address.
export function cspBlockedDetail(event) {
  const directive = String(event?.effectiveDirective || event?.violatedDirective || '').trim().split(/\s+/)[0].replace(/[^a-z-]/gi, '') || 'unknown';
  const uri = String(event?.blockedURI || '');
  let host = 'unknown';
  if (/^[a-z-]+$/i.test(uri)) host = uri.toLowerCase();
  else if (uri.includes(':')) {
    try { const url = new URL(uri); host = url.host || url.protocol.replace(':', ''); } catch { /* keep unknown */ }
  }
  return { directive, host };
}
