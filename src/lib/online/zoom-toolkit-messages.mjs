// Messages of the pinned toolkit (@zoom/videosdk-ui-toolkit 2.5.0-1) that the room
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
//    The « start devices » message of the same screen (`t("preview.error_start_devices")
//    + error`, shown when the consent dialog starts the camera and the microphone
//    together) has the same flaw and gets the same treatment, with reasons that name
//    the camera or the microphone (review note of #197).
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

// Idempotent. Restored at the room's teardown (reliability PR, plan online-room-reliability
// section 4, #197 review note): each room that installs it calls restoreToolkitJwtLog once
// when it ends (leave, error, superseded card, unmount); the original console.log comes
// back when the last room using it has ended, and only if the console still holds this
// wrapper (if something else replaced console.log since, it is left alone). Two rooms that
// overlap during a teardown therefore never leave a half-restored console. The wrapper
// drops only console.log calls whose first argument starts with TOOLKIT_JWT_LOG, which only
// the toolkit writes, and passes every other call through unchanged.
const JWT_ORIGINAL = Symbol.for('eh.online.toolkit.jwt-log-original');
const JWT_USERS = Symbol.for('eh.online.toolkit.jwt-log-users');
export function dropToolkitJwtLog(win) {
  const out = win?.console;
  if (!out || typeof out.log !== 'function') return false;
  if (out.log[JWT_FILTER]) { out.log[JWT_USERS] += 1; return true; }
  const original = out.log;
  const filtered = function log(...args) {
    if (typeof args[0] === 'string' && args[0].startsWith(TOOLKIT_JWT_LOG)) return undefined;
    return original.apply(this, args);
  };
  filtered[JWT_FILTER] = true;
  filtered[JWT_ORIGINAL] = original;
  filtered[JWT_USERS] = 1;
  try { out.log = filtered; } catch { return false; }
  return out.log === filtered;
}

// Undo one dropToolkitJwtLog. Returns true when the original console.log is back.
export function restoreToolkitJwtLog(win) {
  const out = win?.console;
  const current = out?.log;
  if (typeof current !== 'function' || !current[JWT_FILTER]) return false;
  current[JWT_USERS] = Math.max(0, (current[JWT_USERS] || 1) - 1);
  if (current[JWT_USERS] > 0) return false;
  try { out.log = current[JWT_ORIGINAL]; } catch { return false; }
  return out.log === current[JWT_ORIGINAL];
}

export const CAMERA_REASON = Object.freeze({
  blocked: 'l’accès à la caméra est bloqué pour ce site. Autorisez-le dans le navigateur (icône à gauche de l’adresse), puis rechargez la page.',
  missing: 'aucune caméra n’a été trouvée sur cet appareil. Branchez-en une ou continuez sans caméra.',
  busy: 'elle est sans doute utilisée par une autre application (Zoom, Teams, WhatsApp…). Fermez cette application, puis réessayez.',
  unsupported: 'la caméra choisie ne convient pas. Choisissez-en une autre dans la liste, ou continuez sans caméra.',
  other: 'vérifiez qu’elle est branchée, autorisée pour ce site et libre, puis réessayez.',
});
// After « Les périphériques n’ont pas pu démarrer : » (camera and microphone together).
export const DEVICES_REASON = Object.freeze({
  blocked: 'l’accès à la caméra ou au micro est bloqué pour ce site. Autorisez-le dans le navigateur (icône à gauche de l’adresse), puis rechargez la page.',
  missing: 'aucune caméra ou aucun micro n’a été trouvé sur cet appareil. Branchez-le ou continuez sans.',
  busy: 'la caméra ou le micro est sans doute utilisé par une autre application (Zoom, Teams, WhatsApp…). Fermez cette application, puis réessayez.',
  unsupported: 'l’appareil choisi ne convient pas. Choisissez-en un autre dans la liste, ou continuez sans.',
  other: 'vérifiez que la caméra et le micro sont branchés, autorisés pour ce site et libres, puis réessayez.',
});
const BY_ERROR_NAME = { NotAllowedError: 'blocked', PermissionDeniedError: 'blocked', SecurityError: 'blocked', NotFoundError: 'missing', DevicesNotFoundError: 'missing',
  NotReadableError: 'busy', TrackStartError: 'busy', AbortError: 'busy', OverconstrainedError: 'unsupported', ConstraintNotSatisfiedError: 'unsupported',
  VIDEO_USER_FORBIDDEN_CAPTURE: 'blocked', VIDEO_CAMERA_IS_TAKEN: 'busy', CAN_NOT_FIND_CAMERA: 'missing', CAN_NOT_DETECT_CAMERA: 'missing' };
const kindOf = (reasons, reason) => Object.keys(reasons).find(key => reasons[key] === reason);

// The kind of reason from what was printed after the prefix, when it names the error.
const kindFromText = tail => BY_ERROR_NAME[String(tail || '').match(/[A-Za-z_]+/g)?.find(word => BY_ERROR_NAME[word])] || null;
export function cameraReasonFromText(tail) {
  const kind = kindFromText(tail);
  return kind ? CAMERA_REASON[kind] : null;
}
export function devicesReasonFromText(tail) {
  const kind = kindFromText(tail);
  return kind ? DEVICES_REASON[kind] : null;
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
// The same for camera and microphone together: either refused is « blocked », either
// missing is « missing », both allowed and present is « busy ».
export function devicesReasonFromDevice({ permission, cameras, micPermission, mics }) {
  if (permission === 'denied' || micPermission === 'denied') return DEVICES_REASON.blocked;
  if (cameras === 0 || mics === 0) return DEVICES_REASON.missing;
  if (permission === 'granted' && micPermission === 'granted' && cameras > 0 && mics > 0) return DEVICES_REASON.busy;
  return DEVICES_REASON.other;
}

async function deviceState(win) {
  const nav = win?.navigator;
  const state = async name => { try { return (await nav.permissions.query({ name })).state || 'unknown'; } catch { return 'unknown'; } };
  let cameras = null, mics = null;
  try {
    const devices = await nav.mediaDevices.enumerateDevices();
    cameras = devices.filter(device => device.kind === 'videoinput').length;
    mics = devices.filter(device => device.kind === 'audioinput').length;
  } catch { /* not supported */ }
  return { permission: await state('camera'), micPermission: await state('microphone'), cameras, mics };
}

// The two messages of the pre-join screen, by their key in the French resources.
export const DEVICE_MESSAGES = Object.freeze([
  { key: 'preview.error_start_camera', name: 'camera', reasons: CAMERA_REASON, fromText: cameraReasonFromText, fromDevice: cameraReasonFromDevice },
  { key: 'preview.error_start_devices', name: 'devices', reasons: DEVICES_REASON, fromText: devicesReasonFromText, fromDevice: devicesReasonFromDevice },
]);

// Watches the page for the toolkit's camera and « start devices » messages and rewrites
// what follows each prefix (taken from `resources`). Returns a function that stops
// watching. `onFixed(name, kind)` gets the message ('camera' or 'devices') and the kind
// of reason.
export function watchDeviceMessages(win, resources, onFixed) {
  const doc = win?.document;
  const Observer = win?.MutationObserver;
  const messages = DEVICE_MESSAGES.map(message => ({ ...message, head: String(resources?.[message.key] || '').trim() })).filter(message => message.head);
  if (!doc?.body || typeof Observer !== 'function' || !messages.length) return () => {};
  const fix = async node => {
    const text = node.nodeValue || '';
    for (const message of messages) {
      const at = text.indexOf(message.head);
      if (at < 0) continue;
      const start = at + message.head.length;
      const tail = text.slice(start).trim();
      if (!tail || Object.values(message.reasons).includes(tail)) return;
      const reason = message.fromText(tail) || message.fromDevice(await deviceState(win));
      if (node.nodeValue !== text) return;
      node.nodeValue = `${text.slice(0, start)} ${reason}`;
      try { onFixed?.(message.name, kindOf(message.reasons, reason)); } catch { /* the trace never breaks the page */ }
      return;
    }
  };
  const visit = node => {
    if (node.nodeType === 3) { fix(node); return; }
    if (node.nodeType !== 1 || !messages.some(message => node.textContent?.includes(message.head))) return;
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
