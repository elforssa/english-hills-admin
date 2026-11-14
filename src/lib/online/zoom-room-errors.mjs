// French text for a Zoom room that failed to open or dropped, chosen by the SDK's numeric
// error code and never by Zoom's own (English) wording. The codes are the ones the pinned
// toolkit bundle (@zoom/videosdk-ui-toolkit 2.5.0-1) can put in a `connection-change`
// event with state "Fail" (its join-result table and client error enum), plus two of our
// own: `join_timeout` (no answer from Zoom) and `toolkit` (the room could not be loaded).
// `retry` says whether « Réessayer » is offered; a retry always asks for a new pass.

// Code 200 is the SDK's catch-all: a lost connection, and also a token Zoom refuses
// (observed 2026-11-14: reason "Verify JWT failed" or "The token has expired, …", both
// with errorCode 200). A retry asks for a new pass, which is the remedy for both.
const NETWORK = 'La connexion à la salle a échoué. Vérifiez votre connexion Internet, puis réessayez.';

export const ROOM_ERRORS = Object.freeze({
  network: { text: NETWORK, retry: true },
  join_timeout: { text: 'La salle met trop de temps à répondre. Vérifiez votre connexion Internet, puis réessayez.', retry: true },
  toolkit: { text: 'La salle de cours n’a pas pu être chargée. Actualisez la page, puis réessayez.', retry: true },
  not_started: { text: 'Le cours n’a pas encore commencé. Réessayez dans un instant.', retry: true },
  removed: { text: 'L’enseignant vous a retiré de la salle. Vous ne pouvez plus y revenir pour ce cours.', retry: false },
  ended: { text: 'Ce cours est terminé.', retry: false },
  full: { text: 'La salle est complète. Contactez l’accueil.', retry: true },
  locked: { text: 'L’enseignant a verrouillé la salle. Réessayez dans un instant.', retry: true },
  duplicate: { text: 'Vous êtes déjà connecté à ce cours sur un autre appareil ou dans un autre onglet. Fermez-le, puis réessayez.', retry: true },
  refused: { text: 'La salle a refusé la connexion. Réessayez ; si le problème persiste, contactez l’accueil.', retry: true },
});

// SDK error code → entry above. Anything unknown is treated as a connection problem.
const BY_CODE = Object.freeze({
  200: 'network', // "connection error": the SDK's catch-all
  3000: 'duplicate', // a session of this participant is already in progress
  3004: 'refused', // incorrect passcode (we set none)
  3008: 'not_started',
  3009: 'removed', // "user has been removed"
  3620: 'refused', 3621: 'network', 3625: 'not_started', 3627: 'refused',
  4004: 'ended', 4005: 'full', 4006: 'locked', 4007: 'refused',
  4008: 'duplicate', // "participant exist"
  4011: 'refused', 4012: 'refused', 4013: 'refused', 4014: 'refused', 4015: 'refused', 4016: 'refused', 4017: 'refused', 4018: 'refused',
  5012: 'duplicate', // CLIENT_DUPLICATED_JOIN
  5013: 'refused', // CLIENT_INVALID_JOIN_PARAMETER
  join_timeout: 'join_timeout',
  toolkit: 'toolkit',
});

export function roomErrorKey(code) {
  const key = typeof code === 'number' || typeof code === 'string' ? String(code) : '';
  return Object.hasOwn(BY_CODE, key) ? BY_CODE[key] : 'network';
}

export function roomErrorFor(detail) {
  const key = roomErrorKey(detail?.code);
  return { key, ...ROOM_ERRORS[key] };
}
