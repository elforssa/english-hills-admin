// RWR-r5 §5.1 — the one phone normaliser, JS mirror of migration 139's SQL
// functions public.phone_e164, public.phone_key and public.phone_is_placeholder.
// Both sides are tested against one fixture file (scripts/fixtures/phone-cases.json):
// a rule changed here must change in SQL too, or test-phone.mjs / test-phone.sql fail.

const ALLOWED = /^[0-9+(). /-]+$/;

// E.164 (« +212612345678 ») or null. A placeholder is still returned (it is a
// well-formed number); callers decide with isPlaceholder (NF-9).
export function toE164(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text || !ALLOWED.test(text)) return null;
  let n = text.replace(/[(). /-]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (/^212[5-7][0-9]{8}$/.test(n)) n = '+' + n;            // NF-10: « 212… » without « + »
  else if (/^\+2120[5-7][0-9]{8}$/.test(n)) n = '+212' + n.slice(5); // « +212 06… »
  else if (/^0[5-7][0-9]{8}$/.test(n)) n = '+212' + n.slice(1);
  else if (/^[5-7][0-9]{8}$/.test(n)) n = '+212' + n;
  if (!/^\+[1-9][0-9]{7,14}$/.test(n)) return null;
  if (n.startsWith('+212') && !/^\+212[5-7][0-9]{8}$/.test(n)) return null;
  return n;
}

// « 06 00 00 00 00 »-style numbers: the prefix digit followed by eight identical digits.
export function isPlaceholder(e164) {
  return typeof e164 === 'string' && /^\+212[5-7]([0-9])\1{7}$/.test(e164);
}

// National significant digits: the last 9 for Morocco, every digit otherwise. A value
// that is not a phone keeps its digits with one leading 00212, 212, 00 or 0 removed,
// so a partial query (« 06 12 34 56 ») still matches the stored number.
export function phoneKey(raw) {
  const e164 = toE164(raw);
  if (e164) return e164.startsWith('+212') ? e164.slice(4) : e164.slice(1);
  const digits = String(raw ?? '').replace(/[^0-9]/g, '').replace(/^(00212|212|00|0)/, '');
  return digits || null;
}

// A search box matches phones once the query holds 6 or more significant digits. When
// removing a leading 00212, 212 or 00 would leave fewer, the typed digits are kept: in a
// partial query (« 003-97-23 ») they are part of the number (migration 141, 5b). A trunk
// 0 alone is still removed (« 06 12 34 » is 5 significant digits: no phone search).
export const PHONE_SEARCH_MIN_DIGITS = 6;
export function phoneSearchKey(query) {
  const key = phoneKey(query);
  if (key && key.length >= PHONE_SEARCH_MIN_DIGITS) return key;
  const digits = String(query ?? '').replace(/[^0-9]/g, '');
  return digits.length >= PHONE_SEARCH_MIN_DIGITS && !/^0([^0]|$)/.test(digits) ? digits : null;
}

// « 06 12 34 56 78 » for Moroccan numbers; the E.164 form otherwise; the raw text
// when it is not a phone at all.
export function formatPhoneFr(raw) {
  const e164 = toE164(raw);
  if (!e164) return String(raw ?? '').trim();
  if (!e164.startsWith('+212')) return e164;
  const national = '0' + e164.slice(4);
  return national.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
}

// A tel: link needs E.164 (RWR-r5 B1); an unreadable stored value gives no link.
export function telHref(raw) {
  const e164 = toE164(raw);
  return e164 ? `tel:${e164}` : null;
}

export const PHONE_INVALID_MESSAGE = 'Numéro invalide';
export const PHONE_PLACEHOLDER_MESSAGE = 'Numéro fictif : laissez vide';

// The write-path rule (SQL public.require_phone): blank is « no phone »; an invalid or
// placeholder value is refused with the message the form shows.
export function checkPhone(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { ok: true, e164: null };
  const e164 = toE164(raw);
  if (!e164) return { ok: false, e164: null, error: PHONE_INVALID_MESSAGE, code: 'people.phone_invalid' };
  if (isPlaceholder(e164)) return { ok: false, e164: null, error: PHONE_PLACEHOLDER_MESSAGE, code: 'people.phone_placeholder' };
  return { ok: true, e164 };
}

// « 06 •• •• •• 78 »: what history lines show for a phone (§5.3, phones masked).
export function maskPhone(raw) {
  const e164 = toE164(raw);
  if (!e164) return raw ? '•••' : '';
  const digits = e164.startsWith('+212') ? '0' + e164.slice(4) : e164;
  return digits.slice(0, 2) + ' •• •• •• ' + digits.slice(-2);
}
