// Two messages of the pinned toolkit (@zoom/videosdk-ui-toolkit 2.5.0-1) that the room
// corrects from its own side, without touching the bundle (classroom polish, part C).
//
// 1. The camera message of the pre-join screen. Read in the bundle: when the camera
//    preview cannot start, the toolkit shows `t("preview.error_start_camera") + error`
//    in its message area. The error is often Zoom's own object `{ type, reason }`
//    (« VIDEO_CAMERA_IS_TAKEN », « VIDEO_USER_FORBIDDEN_CAPTURE », …), which a string
//    concatenation prints as « [object Object] »; sometimes it is the browser's
//    DOMException, printed in English (« NotReadableError: Could not start video
//    source »). The object never reaches the page, so the room writes a French reason in
//    place of what follows « La caméra n’a pas pu démarrer : »: from the browser's error
//    name when it is printed, otherwise from what the browser says about the camera
//    (permission refused, no camera, or most likely in use by another application).
//    Only the text after the prefix of that one message is replaced, and only on the
//    pre-join screen (the room stops looking once the participant is in).
// 2. The toolkit writes the decoded payload of the participant's token to the console
//    at every join: `console.log("[JWT] participant decoded payload:", payload)`. The
//    payload carries the technical session name and the participant's reference, which
//    the room's own trace never prints (invariant 4 of the plan), and a console line can
//    travel as a monitoring breadcrumb. The room drops exactly that call: a console.log
//    whose first argument is that string. Every other console line goes through as is.
// Both rest on the bundle's text; the unit tests read it and fail when an upgrade
// changes it, so these corrections are re-read with the upgrade (PR C).

export const TOOLKIT_JWT_LOG = '[JWT] participant decoded payload:';
const JWT_FILTER = Symbol.for('eh.online.toolkit.jwt-log-filter');

// Idempotent; stays for the life of the page (only the room page loads the toolkit), so
// two rooms that overlap during a teardown cannot leave a half-restored console.
export function dropToolkitJwtLog(win) {
  const out = win?.console;
  if (!out || typeof out.log !== 'function') return false;
  if (out.log[JWT_FILTER]) return true;
  const original = out.log;
  const filtered = function log(...args) {
    if (typeof args[0] === 'string' && args[0].startsWith(TOOLKIT_JWT_LOG)) return undefined;
    return original.apply(this, args);
  };
  filtered[JWT_FILTER] = true;
  try { out.log = filtered; } catch { return false; }
  return out.log === filtered;
}

export const CAMERA_REASON = Object.freeze({
  blocked: 'l’accès à la caméra est bloqué pour ce site. Autorisez-le dans le navigateur (icône à gauche de l’adresse), puis rechargez la page.',
  missing: 'aucune caméra n’a été trouvée sur cet appareil. Branchez-en une ou continuez sans caméra.',
  busy: 'elle est sans doute utilisée par une autre application (Zoom, Teams, WhatsApp…). Fermez cette application, puis réessayez.',
  unsupported: 'la caméra choisie ne convient pas. Choisissez-en une autre dans la liste, ou continuez sans caméra.',
  other: 'vérifiez qu’elle est branchée, autorisée pour ce site et libre, puis réessayez.',
});
const BY_ERROR_NAME = { NotAllowedError: 'blocked', PermissionDeniedError: 'blocked', SecurityError: 'blocked', NotFoundError: 'missing', DevicesNotFoundError: 'missing',
  NotReadableError: 'busy', TrackStartError: 'busy', AbortError: 'busy', OverconstrainedError: 'unsupported', ConstraintNotSatisfiedError: 'unsupported',
  VIDEO_USER_FORBIDDEN_CAPTURE: 'blocked', VIDEO_CAMERA_IS_TAKEN: 'busy', CAN_NOT_FIND_CAMERA: 'missing', CAN_NOT_DETECT_CAMERA: 'missing' };
const isReason = tail => Object.values(CAMERA_REASON).includes(tail);

// The reason from what was printed after the prefix, when it names the error.
export function cameraReasonFromText(tail) {
  const name = String(tail || '').match(/[A-Za-z_]+/g)?.find(word => BY_ERROR_NAME[word]);
  return name ? CAMERA_REASON[BY_ERROR_NAME[name]] : null;
}

// The reason from what the browser says about the camera. `permission` is the state of
// the camera permission (granted, denied, prompt, or unknown), `cameras` how many video
// inputs the browser lists (or null when it cannot say).
export function cameraReasonFromDevice({ permission, cameras }) {
  if (permission === 'denied') return CAMERA_REASON.blocked;
  if (cameras === 0) return CAMERA_REASON.missing;
  if (permission === 'granted' && cameras > 0) return CAMERA_REASON.busy;
  return CAMERA_REASON.other;
}

async function deviceState(win) {
  const nav = win?.navigator;
  let permission = 'unknown', cameras = null;
  try { permission = (await nav.permissions.query({ name: 'camera' })).state || 'unknown'; } catch { /* not supported (Firefox, older Safari) */ }
  try { cameras = (await nav.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput').length; } catch { /* not supported */ }
  return { permission, cameras };
}

// Watches the page for the toolkit's camera message and rewrites what follows the
// prefix. Returns a function that stops watching. `onFixed` gets the kind of reason.
export function watchCameraMessage(win, prefix, onFixed) {
  const doc = win?.document;
  const Observer = win?.MutationObserver;
  const head = String(prefix || '').trim();
  if (!doc?.body || typeof Observer !== 'function' || !head) return () => {};
  const fix = async node => {
    const text = node.nodeValue || '';
    const at = text.indexOf(head);
    if (at < 0) return;
    const start = at + head.length;
    const tail = text.slice(start).trim();
    if (!tail || isReason(tail)) return;
    const reason = cameraReasonFromText(tail) || cameraReasonFromDevice(await deviceState(win));
    if (node.nodeValue !== text) return;
    node.nodeValue = `${text.slice(0, start)} ${reason}`;
    try { onFixed?.(Object.keys(CAMERA_REASON).find(key => CAMERA_REASON[key] === reason)); } catch { /* the trace never breaks the page */ }
  };
  const visit = node => {
    if (node.nodeType === 3) { fix(node); return; }
    if (node.nodeType !== 1 || !node.textContent?.includes(head)) return;
    const walker = doc.createTreeWalker(node, 4);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) fix(text);
  };
  const observer = new Observer(records => {
    for (const record of records) {
      if (record.type === 'characterData') visit(record.target);
      else for (const node of record.addedNodes) visit(node);
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
