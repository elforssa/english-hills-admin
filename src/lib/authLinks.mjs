// Auth e-mail links (plan ELW-r3, ADR-017). Pure parsing, routing and wording for
// /auth/confirm, /inscription-compte and the two request forms of /login. No I/O:
// the pages own every call, so the rules here are unit-tested on their own.
//
// The page never takes a destination from the address: it comes from the stored
// role through loginDestination(role). Whether the activation form is shown is
// decided by the activation mark (a completed profiles.full_name), never by the
// role, because the AuthContext sweep may apply the invited role first.

import { loginDestination } from './roleAccess.mjs';

// Closed list. `email` is the sign-in link and the sign-up confirmation; `magiclink`
// is the older spelling of the sign-in link.
export const LINK_TYPES = Object.freeze(['invite', 'email', 'magiclink', 'recovery']);
const TOKEN_HASH = /^[A-Za-z0-9_-]{1,200}$/;

/** → { tokenHash, type } for a well-formed link, or null (used-link screen, no call). */
export function parseLinkParams(params) {
  const get = (name) => (params && typeof params.get === 'function' ? params.get(name) : null);
  const tokenHash = get('token_hash');
  const type = get('type');
  if (typeof tokenHash !== 'string' || !TOKEN_HASH.test(tokenHash)) return null;
  if (typeof type !== 'string' || !LINK_TYPES.includes(type)) return null;
  return { tokenHash, type };
}

/** The activation mark: the account's own profile name is filled in. */
export function isActivated(profile) {
  return typeof profile?.full_name === 'string' && profile.full_name.trim() !== '';
}

/** The account's destination: the stored role's home, /unauthorized for a pending one. */
export function destinationFor(role) {
  return loginDestination(role);
}

/**
 * What follows a successful verification (plan section 1, routing table).
 * → { step: 'activation' | 'new-password' | 'destination', applyPendingRole }
 * An account without the mark always goes to the activation form, with no prior
 * apply_pending_role() call.
 */
export function routeAfterVerify(type, profile) {
  if (!LINK_TYPES.includes(type)) throw new Error('Unknown link type');
  if (!isActivated(profile)) return { step: 'activation', applyPendingRole: false };
  if (type === 'invite') return { step: 'destination', applyPendingRole: false };
  if (type === 'recovery') return { step: 'new-password', applyPendingRole: false };
  return { step: 'destination', applyPendingRole: true };
}

/** Status of an Auth error: 0 when the request got no answer at all. */
function statusOf(error) {
  const status = Number(error?.status);
  return Number.isFinite(status) ? status : 0;
}

/**
 * A failed verification: 'connection' (no answer, 5xx, 429: the token was not used and
 * stays in the address) or 'used' (any other Auth 4xx: used, expired or invalid).
 */
export function classifyVerifyError(error) {
  const status = statusOf(error);
  if (status === 0 || status === 429 || status >= 500) return 'connection';
  if (status >= 400) return 'used';
  return 'connection';
}

// ── Wording ────────────────────────────────────────────────────────────────
export const MESSAGES = Object.freeze({
  used: "Ce lien a déjà été utilisé ou a expiré. Si votre compte est déjà activé, connectez-vous.",
  connection: 'Connexion impossible. Vérifiez votre connexion puis réessayez.',
  requestSent: 'Si un compte existe pour cette adresse, un e-mail vient de lui être envoyé. Pensez à vérifier vos courriers indésirables.',
  alreadyActivated: 'Votre compte est déjà activé.',
  callbackFailed: "Ce lien de connexion n'a pas pu être vérifié. Il a peut-être déjà été utilisé, a expiré, ou a été ouvert dans un autre navigateur. Demandez un nouveau lien.",
  weakPassword: "Ce mot de passe est trop faible. Choisissez-en un autre d'au moins 8 caractères.",
  sessionExpired: 'Votre session a expiré. Rouvrez votre lien ou demandez-en un nouveau.',
  tooManyAttempts: 'Trop de tentatives. Réessayez dans quelques minutes.',
  passwordFailed: "Le mot de passe n'a pas pu être enregistré. Réessayez.",
  nameFailed: "Votre nom n'a pas pu être enregistré. Réessayez.",
  invitationInvalid: "Votre invitation n'est plus valide. Demandez au centre de vous réinviter, puis connectez-vous avec le mot de passe que vous venez de choisir.",
  othersStillSignedIn: 'Mot de passe modifié. Vos autres appareils resteront connectés quelques instants.',
});

/**
 * Both request forms (sign-in link, new password) answer the same sentence for every
 * answer Supabase gives, 429 included; only a request that got no answer differs.
 * → 'sent' | 'connection'
 */
export function requestOutcome(error) {
  if (!error) return 'sent';
  return statusOf(error) === 0 ? 'connection' : 'sent';
}

export function requestMessage(error) {
  return requestOutcome(error) === 'sent' ? MESSAGES.requestSent : MESSAGES.connection;
}

/** Supabase refuses a password equal to the current one; the forms treat it as set. */
export function isSamePassword(error) {
  return error?.code === 'same_password';
}

/** Closed French map for a refused password change; Auth text is never shown. */
export function passwordErrorMessage(error) {
  const status = statusOf(error);
  if (error?.code === 'weak_password' || error?.name === 'AuthWeakPasswordError') return MESSAGES.weakPassword;
  if (status === 0) return MESSAGES.connection;
  if (status === 401 || status === 403 || error?.name === 'AuthSessionMissingError') return MESSAGES.sessionExpired;
  if (status === 429) return MESSAGES.tooManyAttempts;
  return MESSAGES.passwordFailed;
}

// ── /login parameters (closed lists; nothing from the address is rendered) ──
export const LOGIN_MODES = Object.freeze(['password', 'link', 'reset']);

export function parseLoginMode(raw) {
  return LOGIN_MODES.includes(raw) ? raw : null;
}

const LOGIN_ERRORS = Object.freeze({
  callback_failed: { message: MESSAGES.callbackFailed, mode: 'link' },
  missing_code: { message: MESSAGES.callbackFailed, mode: 'link' },
});

/** → { message, mode } for a known ?error= value, else null (nothing shown). */
export function parseLoginError(raw) {
  return Object.prototype.hasOwnProperty.call(LOGIN_ERRORS, raw) ? LOGIN_ERRORS[raw] : null;
}

/** Seconds the request button stays disabled after every answered request. */
export const REQUEST_COOLDOWN_SECONDS = 60;
