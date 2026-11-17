// Paste mistakes in a provider credential (plan ORR-r2, section 2, finding B5). A value
// that shows one is refused before anything is signed, so a mistyped secret closes the
// room with the « not available » text instead of reaching every learner as Zoom's
// catch-all « Connexion instable ». Exactly these, and nothing about the provider's own
// format (no alphabet, no exact length: the plan did not read Zoom's format):
//   - leading or trailing white space, or any white space inside (line breaks included);
//   - a straight or typographic quote;
//   - a character that is not printable ASCII (control characters, zero-width and other
//     invisible characters, any non-ASCII character);
//   - fewer than 8 or more than 512 characters;
//   - and, for a pair, the key equal to the secret.
// The answers are three words only. Nothing here ever returns, logs or throws the
// value, its length, its class of mistake or a fragment (invariant 8).
const MIN = 8;
const MAX = 512;
const QUOTES = /["'`‘’‚‛“”„‟‹›«»]/;
const PRINTABLE = /^[\x21-\x7E]*$/;

export function hasPasteMistake(value) {
  if (typeof value !== 'string') return true;
  if (value.length < MIN || value.length > MAX) return true;
  if (/\s/.test(value)) return true;
  if (QUOTES.test(value)) return true;
  return !PRINTABLE.test(value);
}

// 'correct' | 'incorrect' | 'absent' for a key and secret pair.
export function credentialPairShape(key, secret) {
  if (!key || !secret) return 'absent';
  if (hasPasteMistake(key) || hasPasteMistake(secret) || key === secret) return 'incorrect';
  return 'correct';
}
