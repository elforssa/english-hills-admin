// Courses with dates — close a finished course (plan CDC-r3, migration 128). The
// course rules the screens share with the database, the French text of the course.*
// hints and thin wrappers over the director commands. The client is injected so the
// node tests run this code. « Today » is the centre's business date (ADR-014).
import { centreDate } from '../centreClock.mjs';
import { COURSE_DATE_PROGRAMMES, isOnlineSessionType } from '../programCatalog.mjs';
import { isSchoolYear } from '../enrollmentWorkflow.mjs';

export { COURSE_DATE_PROGRAMMES };

export const COURSE_REASON_TEXT = {
  dates_required: 'Renseignez les dates du cours : date de début et date de fin.',
  dates_outside_year: 'Les dates du cours doivent être comprises dans l’année scolaire du groupe.',
  online_dates: 'Les dates d’un cours en ligne se modifient sur sa page Cours en ligne.',
  one_to_one_capacity: 'Un cours individuel (One-to-One) a une capacité de 1.',
  mark_protected: 'Utilisez « Clôturer le cours » ou « Rouvrir le cours ».',
  closed: 'Ce cours est clôturé.',
  not_finished: 'Ce cours n’est pas terminé : il se clôture après sa date de fin.',
  online: 'Clôturez ce cours depuis sa page Cours en ligne.',
  count_changed: 'Le nombre d’apprenants a changé, rechargez.',
  unplaced_changed: 'La liste des inscriptions payées sans groupe a changé, rechargez.',
};
// The placement refusal of an undated short-programme group has its own words.
export const COURSE_PLACEMENT_DATES_TEXT = 'Renseignez les dates du cours avant d’y affecter un apprenant.';

export function courseReason(hint) {
  const match = /^course\.([a-z_]+)$/.exec(typeof hint === 'string' ? hint : '');
  return match && Object.hasOwn(COURSE_REASON_TEXT, match[1]) ? match[1] : null;
}

// The server's own French sentence names the dates; keep it when it is the expected one.
export function courseErrorMessage(error) {
  const reason = courseReason(error?.hint);
  if (!reason) return null;
  const message = error?.message || '';
  if (reason === 'dates_outside_year' && /^Les dates du cours/.test(message)) return message;
  if (reason === 'not_finished' && /^Ce cours n’est pas terminé/.test(message)) return message;
  if (reason === 'closed' && message === 'Ce cours est clôturé. Rouvrez le cours pour le modifier.') return message;
  if (reason === 'dates_required' && /avant d’y affecter/.test(message)) return COURSE_PLACEMENT_DATES_TEXT;
  return COURSE_REASON_TEXT[reason];
}

export function courseDatesRequired(sessionType) {
  return COURSE_DATE_PROGRAMMES.includes(sessionType);
}

// Q3 = A: 1 June of the first year to 31 August of the second, as 'YYYY-MM-DD'.
export function courseWindow(schoolYear) {
  if (!isSchoolYear(schoolYear)) return null;
  const first = Number(schoolYear.slice(0, 4));
  return { from: `${first}-06-01`, to: `${first + 1}-08-31` };
}

// The form's check, exactly the database's rules (D1), never stricter. Returns '' when
// valid. `previous` is the saved group when editing ({ sessionType, schoolYear,
// dateDebut, dateFin }): like the database, the required dates are checked on a
// creation, a change of programme or a date change only, and the window on a creation,
// a year change or a date change. A programme with optional dates may carry one date.
export function courseDatesError({ sessionType, schoolYear, dateDebut, dateFin, previous = null }) {
  const start = dateDebut || '', end = dateFin || '';
  if (isOnlineSessionType(sessionType)) return start || end ? COURSE_REASON_TEXT.online_dates : '';
  const datesChanged = !previous || (previous.dateDebut || '') !== start || (previous.dateFin || '') !== end;
  const programmeChanged = !previous || previous.sessionType !== sessionType;
  const yearChanged = !previous || previous.schoolYear !== schoolYear;
  if (courseDatesRequired(sessionType) && (programmeChanged || datesChanged) && (!start || !end)) {
    return COURSE_REASON_TEXT.dates_required;
  }
  if (start && end && end < start) return 'La date de fin doit suivre la date de début.';
  const window = courseWindow(schoolYear);
  if ((start || end) && (datesChanged || yearChanged) && window && [start, end].some(d => d && (d < window.from || d > window.to))) {
    return `Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin ${window.from.slice(0, 4)} au 31 août ${window.to.slice(0, 4)}).`;
  }
  return '';
}

// A programme change in the group form: One-to-One forces capacity 1 (Q4 = A); leaving
// One-to-One gives back the group's own capacity, or the default 12 for a new group.
export function capacityAfterProgrammeChange({ from, to, capacity, savedCapacity = null, savedProgramme = null }) {
  if (to === 'One-to-One') return 1;
  if (from === 'One-to-One') return savedProgramme && savedProgramme !== 'One-to-One' && savedCapacity ? savedCapacity : 12;
  return capacity;
}

export function formatCourseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

// « Du 01/09/2026 au 30/06/2027 », or '' for a group without dates.
export function courseDatesLabel(group) {
  const start = formatCourseDate(group?.date_debut), end = formatCourseDate(group?.date_fin);
  if (start && end) return `Du ${start} au ${end}`;
  if (end) return `Jusqu’au ${end}`;
  return start ? `À partir du ${start}` : '';
}

// Q4 = A: a neutral name, never the learner's (OA3).
export function oneToOneGroupName(level, dateDebut) {
  return ['Cours individuel', level || '', formatCourseDate(dateDebut)].filter(Boolean).join(' · ');
}

// The closed state of a course: in person, the closed mark; online, the online close.
export function isClosedCourse(group, closedOnlineIds = null) {
  if (!group) return false;
  if (group.closed_at) return true;
  return isOnlineSessionType(group.session_type) && Boolean(closedOnlineIds?.has?.(group.id));
}

// Pickers that start something new never offer a closed course (D4).
export function openCourses(groups, closedOnlineIds = null) {
  return (groups || []).filter(group => !isClosedCourse(group, closedOnlineIds));
}

// A course whose end date has passed but which is not closed yet stays selectable,
// marked « terminé le … » so a forgotten paid learner can still be placed (D4).
export function courseFinished(group, today = centreDate()) {
  return Boolean(group?.date_fin) && !group?.closed_at && String(group.date_fin) < today;
}
export function courseEndedSuffix(group, today = centreDate()) {
  return courseFinished(group, today) ? ` · terminé le ${formatCourseDate(group.date_fin)}` : '';
}

// Online courses closed on their own page (staff read online_courses; anyone else
// gets an empty set and relies on the database guard).
export async function fetchClosedOnlineGroupIds(client) {
  try {
    const { data, error } = await client.from('online_courses').select('group_id').eq('status', 'closed');
    if (error) return new Set();
    return new Set((data || []).map(row => row.group_id));
  } catch {
    return new Set();
  }
}

// The Groups list views (D8): « En cours » (not closed), « À clôturer » (the director's
// finished-course list), « Clôturés ».
export const GROUP_VIEWS = [
  { value: 'en-cours', label: 'En cours' },
  { value: 'a-cloturer', label: 'À clôturer' },
  { value: 'clotures', label: 'Clôturés' },
];

// The dashboard card « Cours terminés à clôturer »: in-person rows with learners, and online rows (D7).
export function coursesToCloseCount(rows) {
  return (rows || []).filter(row => row.kind === 'online' || Number(row.live_count) > 0).length;
}

// The close dialog: every unplaced paid enrollment needs an explicit choice (Q14 = A).
export const UNPLACED_CHOICES = [
  { value: 'attach', label: 'A suivi ce cours', note: 'Ajoute le cours à son historique ; aucune présence n’est créée.' },
  { value: 'end', label: 'Terminer sans groupe' },
  { value: 'wait', label: 'Laisser en attente' },
];
export function unplacedLists(unplaced, choices) {
  const attach = [], end = [];
  for (const row of unplaced || []) {
    const choice = choices?.[row.enrollment_id];
    if (choice === 'attach') attach.push(row.enrollment_id);
    else if (choice === 'end') end.push(row.enrollment_id);
  }
  return { attach, end };
}
export function allUnplacedChosen(unplaced, choices) {
  return (unplaced || []).every(row => ['attach', 'end', 'wait'].includes(choices?.[row.enrollment_id]));
}
// Before its end date only an empty course closes, and that close touches no paid
// enrollment without a group (close_course refuses course.not_finished otherwise): the
// dialog then offers « Laisser en attente » only, already chosen.
export function unplacedChoicesFor(preview) {
  return preview?.finished ? UNPLACED_CHOICES : UNPLACED_CHOICES.filter(choice => choice.value === 'wait');
}
export function effectiveUnplacedChoices(preview, choices) {
  if (preview?.finished) return choices || {};
  return Object.fromEntries((preview?.unplaced || []).map(row => [row.enrollment_id, 'wait']));
}

// « Clôturer l'année »: the command has work when it ends enrollments or marks groups.
export function yearCloseHasWork(preview) {
  return Number(preview?.to_end || 0) > 0 || Number(preview?.groups_to_mark || 0) > 0;
}
// A by-programme count ({ "Mise à niveau": 3, "Summer Camp": 1 }) as « Mise à niveau 3, Summer Camp 1 ».
export function programmeBreakdown(byProgramme) {
  return Object.entries(byProgramme || {}).filter(([, n]) => Number(n) > 0)
    .sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([programme, n]) => `${programme} ${Number(n)}`).join(', ');
}

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const money = value => `${Number(value || 0).toLocaleString('fr-FR')} MAD`;
export { money as courseMoney };

// The toast after « Clôturer le cours ».
export function closeCourseMessage(data) {
  if (data?.replayed) return 'Ce cours était déjà clôturé.';
  const parts = [plural(Number(data?.total_ended || 0), 'inscription terminée', 'inscriptions terminées')];
  if (Number(data?.alumni)) parts.push(plural(Number(data.alumni), 'ancien apprenant', 'anciens apprenants'));
  if (Number(data?.charges_linked)) parts.push(plural(Number(data.charges_linked), 'solde rattaché', 'soldes rattachés'));
  return `Cours clôturé : ${parts.join(', ')}.`;
}

// The toast after « Rouvrir le cours »: reopen_course returns the rows it left ended as a list.
export function reopenCourseMessage(data) {
  const restored = Number(data?.restored || 0);
  const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
  return `Cours rouvert : ${plural(restored, 'inscription rétablie', 'inscriptions rétablies')}`
    + (skipped ? `, ${plural(skipped, 'laissée terminée (modifiée depuis la clôture)', 'laissées terminées (modifiées depuis la clôture)')}` : '')
    + '.';
}

export function listCoursesToClose(client) {
  return client.rpc('list_courses_to_close');
}
export function closeCoursePreview(client, groupId) {
  return client.rpc('close_course_preview', { p_group: groupId });
}
export function closeCourse(client, { groupId, expectedCount, reason, attach = [], endUnplaced = [] }) {
  return client.rpc('close_course', {
    p_group: groupId, p_expected_count: expectedCount, p_reason: reason, p_attach: attach, p_end_unplaced: endUnplaced,
  });
}
export function reopenCourse(client, { groupId, closedAt }) {
  return client.rpc('reopen_course', { p_group: groupId, p_expected_closed_at: closedAt });
}
export function closeSchoolYearPreview(client, schoolYear) {
  return client.rpc('close_school_year_preview', { p_school_year: schoolYear });
}
