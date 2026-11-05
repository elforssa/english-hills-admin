// Shared definitions for enrollments, placement and reports.
// Group membership derives from enrollments (plan EGC-r2, ADR-010): a learner is a
// member of a group through a Validated or Trial enrollment in it. The learner-file
// group (students.groupe_id) is the database's "main group" copy.
// Enrollment at payment (EAP, migration 127): an enrollment is born Confirmed at the
// payment and becomes Validated in a group. Submitted, Under Review, Trial and
// Rejected are retired: never created, only read on old rows (a Trial row placed
// before the archive step is still a member, as the database counts it).
import { centreSchoolYear } from './centreClock.mjs';

export const MEMBERSHIP_STATUSES = ['Validated', 'Trial'];
export const LIVE_ENROLLMENT_STATUSES = ['Confirmed', 'Validated'];
// "Apprenants actifs": Inscrit and Essai only (D3-A); Ancien apprenant and Inactif are not active.
export const ACTIVE_STUDENT_STATUSES = ['Enrolled', 'Trial'];
// A row not yet ended or refused: a live one or, until the archive step ends it, a
// retired one. « Ancien apprenant » and « Clôturer l’année » end these too.
export function isOpenEnrollment(enrollment) {
  return !['Ended', 'Rejected'].includes(enrollment.status);
}
export function isMembership(enrollment) {
  return MEMBERSHIP_STATUSES.includes(enrollment.status) && Boolean(enrollment.group_id);
}
// "Groupe à affecter": a Confirmed (paid) enrollment without a group, or an active
// learner with no membership and no paid enrollment. A learner-file group still
// counts as placed until the clean-up backs every one with an enrollment.
export function studentNeedsGroup(student, enrollments, session = '') {
  const own = enrollments.filter(e => e.student_id === student.id);
  const inSession = e => !session || (e.session_type || student.session_type || 'Yearly') === session;
  if (own.some(e => e.status === 'Confirmed' && !e.group_id && inSession(e))) return true;
  if (!ACTIVE_STUDENT_STATUSES.includes(student.status)) return false;
  if (session && (student.session_type || 'Yearly') !== session) return false;
  return !student.groupe_id && !own.some(isMembership)
    && !own.some(e => e.status === 'Confirmed');
}
// The Groupe column's fallback for a file with no group and no enrollment to place
// (plan AFU-r1, H4): « Groupe à affecter » only for an active file (Inscrit or Essai),
// as the « Groupe à affecter » filter; an Ancien apprenant, Inactif or Prospect shows « — ».
export function fileAwaitsGroup(student) {
  return !student.groupe_id && ACTIVE_STUDENT_STATUSES.includes(student.status);
}
// Roster of a group among the given (non-archived) learners: a Validated or Trial
// enrollment in it, the rule the database enforces (D-8, after the C6 check).
export function groupMemberIds(students, enrollments, groupId) {
  const visible = new Set(students.filter(s => !s.deleted_at).map(s => s.id));
  return new Set(enrollments.filter(e => e.group_id === groupId && isMembership(e) && visible.has(e.student_id))
    .map(e => e.student_id));
}
// The groups a learner is a member of, main group first.
export function studentGroupIds(student, enrollments) {
  const ids = enrollments.filter(e => e.student_id === student.id && isMembership(e)).map(e => e.group_id);
  return [...new Set([student.groupe_id, ...ids].filter(Boolean))];
}
// D3-A: an imported file is a prospect until an enrollment confirms it; a
// historical Ancien apprenant or Inactif status is kept.
export function importedStudentStatus(status) {
  return ['Alumni', 'Inactive', 'Prospect'].includes(status) ? status : 'Prospect';
}
// School year (1 September to 31 August) of an instant on the centre clock.
export function currentSchoolYear(date = new Date()) {
  return centreSchoolYear(date);
}
// groups.annee stores the school year as 'YYYY-YYYY'.
// The enrollment school year 'YYYY/YYYY' of a group, or '' (plan AFU-r1, H5).
export function schoolYearOfGroup(group) {
  const value = String(group?.annee || '').trim().replace('-', '/');
  return isSchoolYear(value) ? value : '';
}
// 'YYYY/YYYY' with consecutive years, the format the year fields ask for.
export function isSchoolYear(value) {
  const match = /^(\d{4})\/(\d{4})$/.exec(String(value || ''));
  return Boolean(match) && Number(match[2]) === Number(match[1]) + 1;
}
export function groupYear(schoolYear) {
  return schoolYear ? schoolYear.replace('/', '-') : '';
}
