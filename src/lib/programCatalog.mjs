// Programme (session type) and level catalogue shared by every staff screen, the
// public registration form and the node tests. The database constraints and the
// reception/CRM programme lists (migration 117) hold the same values.
export const LEGACY_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const YEARLY_LEVELS = [
  'Pre-Child',
  ...Array.from({ length: 6 }, (_, index) => `Child ${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `Junior ${index + 1}`),
];

export const ADULT_LEVELS = [
  ...Array.from({ length: 6 }, (_, index) => `Beginning ${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `Intermediate ${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `Advanced ${index + 1}`),
];

// Online courses are enrolled by reception only (owner decision Q15 = A).
export const ONLINE_SESSION_TYPES = ['Online', 'Online One-to-One'];

export const SESSION_TYPES = [
  'Yearly',
  'Adults',
  'Summer Camp',
  'Communication Junior',
  'Communication Adult',
  'One-to-One',
  'Mise à niveau',
  'Other',
  ...ONLINE_SESSION_TYPES,
];

// RWR-r5 §5.4 (migration 140): the programme catalogue. These rows equal the seed of
// public.programmes (scripts/test-catalogue-labels.mjs); a stored code is never
// translated anywhere else. `crmSelectable` is the seed default: the director can
// change it on the catalogue screen (get_catalogue returns the live value).
export const PROGRAMMES = [
  { code: 'Yearly', label: 'Programme annuel', audience: 'enfants', crmSelectable: true, enrollable: true },
  { code: 'Adults', label: 'Adultes', audience: 'adultes', crmSelectable: true, enrollable: true },
  { code: 'Summer Camp', label: 'Stage d’été', audience: 'enfants', crmSelectable: true, enrollable: true },
  { code: 'Communication Junior', label: 'Communication junior', audience: 'ados', crmSelectable: true, enrollable: true },
  { code: 'Communication Adult', label: 'Communication adultes', audience: 'adultes', crmSelectable: true, enrollable: true },
  { code: 'One-to-One', label: 'Cours individuel', audience: 'tous', crmSelectable: true, enrollable: true },
  { code: 'Mise à niveau', label: 'Mise à niveau', audience: 'tous', crmSelectable: true, enrollable: true },
  { code: 'Online', label: 'Cours en ligne', audience: 'tous', crmSelectable: true, enrollable: true },
  { code: 'Online One-to-One', label: 'Cours individuel en ligne', audience: 'tous', crmSelectable: true, enrollable: true },
  { code: 'Other', label: 'Autre programme', audience: 'tous', crmSelectable: true, enrollable: false },
];

// Finance keeps a « Legacy » code for balances carried over from the old system.
export const PROGRAMME_LABELS = {
  ...Object.fromEntries(PROGRAMMES.map(p => [p.code, p.label])),
  Legacy: 'Ancien solde',
};

// The French label of a stored programme code; an unknown value is shown as stored.
export function programmeName(code) {
  return PROGRAMME_LABELS[code] || code || '';
}

// Options for a programme <select>: the stored code as value, the French label as text.
export function programmeOptions(codes = SESSION_TYPES) {
  return codes.map(code => ({ value: code, label: programmeName(code) }));
}

// A stored « Programme · 2026/2027 » text (receipt and charge service lines, written
// before and after 140 with the code) read in French; the stored text never changes.
export function serviceLine(text) {
  const value = String(text || '');
  const [head, ...rest] = value.split(' · ');
  return PROGRAMME_LABELS[head] ? [PROGRAMME_LABELS[head], ...rest].join(' · ') : value;
}

// CDC (migration 128, Q1 = A): the programmes whose groups carry a start and an end
// date (courses). Yearly, Other and the Communication programmes may carry dates.
export const COURSE_DATE_PROGRAMMES = ['Mise à niveau', 'Adults', 'Summer Camp', 'One-to-One'];

// CDC (OA5, Q17 = A): every programme uses groups except Other, which a payment never
// turns into an enrollment; « Inscrits — groupe à affecter » counts only these.
export const PROGRAMMES_WITHOUT_GROUPS = ['Other'];
export function programmeUsesGroups(sessionType) {
  return Boolean(sessionType) && !PROGRAMMES_WITHOUT_GROUPS.includes(sessionType);
}

// The public /inscription page and its API accept exactly these programmes.
export const PUBLIC_SESSION_TYPES = SESSION_TYPES.filter(type => !ONLINE_SESSION_TYPES.includes(type));

export function isOnlineSessionType(sessionType) {
  return ONLINE_SESSION_TYPES.includes(sessionType);
}

export const LEVELS_BY_SESSION = {
  Yearly: YEARLY_LEVELS,
  Adults: ADULT_LEVELS,
  'Summer Camp': LEGACY_LEVELS,
  'Communication Junior': LEGACY_LEVELS,
  'Communication Adult': LEGACY_LEVELS,
  'One-to-One': LEGACY_LEVELS,
  'Mise à niveau': LEGACY_LEVELS,
  Other: LEGACY_LEVELS,
  // Q3 = A: CEFR A1–C2 for both online types.
  Online: LEGACY_LEVELS,
  'Online One-to-One': LEGACY_LEVELS,
};

export const ALL_LEVELS = [...new Set([
  ...YEARLY_LEVELS,
  ...ADULT_LEVELS,
  ...LEGACY_LEVELS,
])];

// Keep an existing legacy value visible while a historical record is edited.
// New selections remain limited to the catalogue for the chosen session.
export function getLevelsForSession(sessionType, currentLevel = '') {
  const levels = LEVELS_BY_SESSION[sessionType] || LEGACY_LEVELS;
  return currentLevel && !levels.includes(currentLevel)
    ? [currentLevel, ...levels]
    : levels;
}
