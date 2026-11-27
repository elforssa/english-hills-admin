// RWR-r5 §6.3 (migration 141): a group's class days, ISO weekdays 1 (Monday) to 7
// (Sunday), in groups.class_days. parseClassDays is the twin of
// academic_security.parse_class_days (data step D7 reads the old « jours » text with it);
// both are checked against scripts/fixtures/class-days-cases.json.

export const CLASS_DAYS = [
  { day: 1, short: 'Lun', long: 'Lundi' },
  { day: 2, short: 'Mar', long: 'Mardi' },
  { day: 3, short: 'Mer', long: 'Mercredi' },
  { day: 4, short: 'Jeu', long: 'Jeudi' },
  { day: 5, short: 'Ven', long: 'Vendredi' },
  { day: 6, short: 'Sam', long: 'Samedi' },
  { day: 7, short: 'Dim', long: 'Dimanche' },
];

const TOKENS = [
  [1, /^(lun|lundi|lundis|mon|monday)\.?$/],
  [2, /^(mar|mardi|mardis|tue|tuesday)\.?$/],
  [3, /^(mer|mercredi|mercredis|wed|wednesday)\.?$/],
  [4, /^(jeu|jeudi|jeudis|thu|thursday)\.?$/],
  [5, /^(ven|vendredi|vendredis|fri|friday)\.?$/],
  [6, /^(sam|samedi|samedis|sat|saturday)\.?$/],
  [7, /^(dim|dimanche|dimanches|sun|sunday)\.?$/],
];
const FOLD = { é: 'e', è: 'e', ê: 'e', ë: 'e', à: 'a', â: 'a', ä: 'a', î: 'i', ï: 'i', ô: 'o', ö: 'o', û: 'u', ü: 'u', ù: 'u', ç: 'c' };

// null: nothing written; []: written but not readable (D7 leaves it for a person);
// otherwise the sorted distinct days.
export function parseClassDays(text) {
  if (text == null || String(text).trim() === '') return null;
  const folded = String(text).trim().toLowerCase().replace(/[éèêëàâäîïôöûüùç]/g, c => FOLD[c]);
  const days = new Set();
  for (const token of folded.split(/\s*[,;/+&]\s*|\s+et\s+|\s+/)) {
    if (token === '') continue;
    const found = TOKENS.find(([, re]) => re.test(token));
    if (!found) return [];
    days.add(found[0]);
  }
  return [...days].sort((a, b) => a - b);
}

export function normalizeClassDays(days) {
  const out = [...new Set((days || []).map(Number).filter(d => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
  return out.length ? out : null;
}

// « Lun, Mer » — the text written to « jours » alongside class_days.
export function classDaysText(days) {
  return (normalizeClassDays(days) || []).map(d => CLASS_DAYS[d - 1].short).join(', ');
}

// ISO weekday of a 'YYYY-MM-DD' date.
export function isoWeekday(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// A group meets on a date when it has no class days yet (not restricted, as the server)
// or when the date's weekday is one of them.
export function meetsOn(group, date) {
  const days = normalizeClassDays(group?.class_days);
  return !days || days.includes(isoWeekday(date));
}

// The class days a group's form starts from: the stored ones, else what « jours » reads as.
export function initialClassDays(group) {
  return normalizeClassDays(group?.class_days) || normalizeClassDays(parseClassDays(group?.jours)) || [];
}
