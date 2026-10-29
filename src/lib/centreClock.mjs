// The centre's clock (plan AFU-r1, decision D-TZ = A): Morocco, UTC+0 since
// 2026-09-20 (tzdata 2026c). This is the one place to change it on the client; it
// mirrors public.centre_utc_offset() in the database. No time-zone database is
// consulted, so a browser or Node build whose data still puts Casablanca at UTC+1
// cannot move a date or a time.
export const CENTRE_UTC_OFFSET_MINUTES = 0;
const OFFSET_MS = CENTRE_UTC_OFFSET_MINUTES * 60_000;
const pad = n => String(n).padStart(2, '0');
// An instant moved to the centre's wall clock, read back with the UTC getters.
const onCentreClock = value => new Date(new Date(value).getTime() + OFFSET_MS);

export function centreParts(now = new Date()) {
  const d = onCentreClock(now);
  // As the former Intl helpers: an invalid date is an error, never a NaN date string.
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid time value');
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}
// 'YYYY-MM-DD', the business date (receipts, payment dates, attendance, reports).
export function centreDate(now = new Date()) {
  const p = centreParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
// 'YYYY-MM'
export function centreMonth(now = new Date()) {
  return centreDate(now).slice(0, 7);
}
export function centreMonthStart(now = new Date()) {
  return `${centreMonth(now)}-01`;
}
// 'YYYY-MM-DDTHH:mm', the value of a datetime-local input.
export function centreDateTimeInput(now = new Date()) {
  const p = centreParts(now);
  return `${centreDate(now)}T${pad(p.hour)}:${pad(p.minute)}`;
}
// School year 'YYYY/YYYY' (1 September to 31 August) of an instant.
export function centreSchoolYear(now = new Date()) {
  const { year, month } = centreParts(now);
  const start = year - (month < 9 ? 1 : 0);
  return `${start}/${start + 1}`;
}
// A centre wall-clock time 'YYYY-MM-DDTHH:mm' as an ISO instant.
export function centreInstant(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value || '')) throw new Error('Choisissez une date et une heure.');
  const wall = Date.parse(`${value}Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) {
    throw new Error('Cette heure locale n’existe pas. Choisissez une autre heure.');
  }
  return new Date(wall - OFFSET_MS).toISOString();
}
// Intl formatting of an instant as the centre's wall clock.
export function centreFormatter(locale, options = {}) {
  const format = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  return {
    format: value => format.format(onCentreClock(value)),
    formatToParts: value => format.formatToParts(onCentreClock(value)),
  };
}
export function formatCentre(value, locale, options = {}) {
  return centreFormatter(locale, options).format(value);
}
