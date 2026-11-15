// French text for a Zoom room that failed to open or dropped, chosen by the SDK's numeric
// error code and never by Zoom's own (English) wording, as in the table of the R4
// diagnosis of 2026-11-14 (finding 5):
//   account or key refused  → « … n’est pas disponible pour le moment. Prévenez l’accueil. »
//   token expired or invalid → the pass_invalid text, with « Réessayer »
//   session full             → the capacity text
//   network or timeout       → « Connexion instable. … », with « Réessayer »
//   anything else            → the provider_error text, with « Réessayer »
// The codes are the ones the pinned toolkit bundle (@zoom/videosdk-ui-toolkit 2.5.0-1) can
// put in a `connection-change` event with state "Fail", plus two of our own: `join_timeout`
// (no answer from Zoom) and `toolkit` (the room could not be loaded). A retry always asks
// for a new pass.
//
// What cannot be told apart: code 200 is the SDK's catch-all ("connection error"). Zoom
// sends it for a lost connection, for a token it refuses as expired, and for a token it
// cannot verify (a wrong key or secret, i.e. "account or key refused"); observed
// 2026-11-14: reasons "Verify JWT failed" and "The token has expired, …", both 200. So
// 200 shows the network text with « Réessayer », except when the platform itself knows
// the pass is past its expiry (`passExpired`, from the embed's own expiry time), which
// shows the pass text. An account or key refusal that arrives as 200 therefore reads as
// "Connexion instable"; only the codes Zoom reserves for a refused account show the
// account text.
import { ONLINE_REASON_TEXT } from './reasons.mjs';

export const ROOM_ERRORS = Object.freeze({
  account: { text: 'La salle de cours n’est pas disponible pour le moment. Prévenez l’accueil.', retry: false },
  pass: { text: ONLINE_REASON_TEXT.pass_invalid, retry: true },
  full: { text: ONLINE_REASON_TEXT.capacity, retry: false },
  network: { text: 'Connexion instable. Vérifiez votre réseau, puis réessayez.', retry: true },
  other: { text: ONLINE_REASON_TEXT.provider_error, retry: true },
});

// SDK error code → row of the table. Any code not listed is "anything else".
const BY_CODE = Object.freeze({
  200: 'network', // "connection error": the catch-all (see above)
  3621: 'network', // no response from the web server
  join_timeout: 'network',
  4005: 'full', // "meeting is at capacity"
  // Refused for the account, the key or the way the join was signed.
  3004: 'account', 3620: 'account', 3627: 'account', 4007: 'account',
  4011: 'account', 4012: 'account', 4013: 'account', 4014: 'account', 4015: 'account', 4017: 'account', 4018: 'account',
  5013: 'account', // CLIENT_INVALID_JOIN_PARAMETER
  4016: 'pass', // a token Zoom reports as expired by its own code
  // Everything else, e.g. 3000 and 4008 (already in the session), 3008 and 3625 (not
  // started), 3009 (removed by the host), 4004 (ended), 4006 (locked), `toolkit`: other.
});

export function roomErrorKey(code, passExpired = false) {
  const name = typeof code === 'number' || typeof code === 'string' ? String(code) : '';
  const key = Object.hasOwn(BY_CODE, name) ? BY_CODE[name] : 'other';
  return key === 'network' && passExpired === true && name === '200' ? 'pass' : key;
}

export function roomErrorFor(detail) {
  const key = roomErrorKey(detail?.code, detail?.passExpired);
  return { key, ...ROOM_ERRORS[key] };
}

// True when the pass in this embed is past its own expiry on the participant's clock.
export function passExpired(embed, now = Date.now()) {
  const at = Date.parse(embed?.tokenExpiresAt || embed?.expiresAt || '');
  return Number.isFinite(at) && now >= at;
}
