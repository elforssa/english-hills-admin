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

export const SESSION_TYPES = [
  'Yearly',
  'Adults',
  'Summer Camp',
  'Communication Junior',
  'Communication Adult',
  'One-to-One',
  'Mise à niveau',
  'Other',
];

export const LEVELS_BY_SESSION = {
  Yearly: YEARLY_LEVELS,
  Adults: ADULT_LEVELS,
  'Summer Camp': LEGACY_LEVELS,
  'Communication Junior': LEGACY_LEVELS,
  'Communication Adult': LEGACY_LEVELS,
  'One-to-One': LEGACY_LEVELS,
  'Mise à niveau': LEGACY_LEVELS,
  Other: LEGACY_LEVELS,
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

export function groupMatchesSelection(group, sessionType, level) {
  if (!group) return false;
  const groupSession = group.session_type || 'Yearly';
  return (!sessionType || groupSession === sessionType)
    && (!level || group.niveau === level);
}

export function groupMatchesEnrollment(group, enrollment, student) {
  const sessionType = enrollment?.session_type || student?.session_type || 'Yearly';
  // A paid enrollment with no level can be placed in any group for its session.
  // Only legacy enrollments without a session fall back to the student level.
  const level = enrollment?.level || (enrollment?.session_type ? '' : student?.niveau_cefr || '');
  return groupMatchesSelection(group, sessionType, level);
}
