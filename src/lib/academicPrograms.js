export {
  LEGACY_LEVELS, YEARLY_LEVELS, ADULT_LEVELS, ONLINE_SESSION_TYPES, SESSION_TYPES, PUBLIC_SESSION_TYPES,
  LEVELS_BY_SESSION, ALL_LEVELS, getLevelsForSession, isOnlineSessionType,
} from './programCatalog.mjs';

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
