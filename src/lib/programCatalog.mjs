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
