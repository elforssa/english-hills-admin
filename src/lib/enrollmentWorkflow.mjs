// Shared definitions for the pre-registration queue and placement reports.
export const PENDING_PRE_ENROLLMENT_STATUSES = ['Submitted', 'Under Review'];
export function isPendingPreEnrollment(enrollment) {
  return PENDING_PRE_ENROLLMENT_STATUSES.includes(enrollment.status);
}
export function isPreEnrollment(enrollment) {
  return ['Submitted', 'Under Review', 'Rejected', 'Trial'].includes(enrollment.status);
}
export function studentNeedsGroup(student, enrollments, session = '') {
  const pending = enrollments.some(e => e.student_id === student.id && e.status === 'Confirmed'
    && !e.group_id && (!session || (e.session_type || student.session_type || 'Yearly') === session));
  return pending || (!student.groupe_id && (!session || (student.session_type || 'Yearly') === session));
}
export function groupMemberIds(students, enrollments, groupId) {
  return new Set([
    ...students.filter(s => s.groupe_id === groupId).map(s => s.id),
    ...enrollments.filter(e => e.group_id === groupId && ['Validated','Trial'].includes(e.status)).map(e => e.student_id),
  ]);
}
export function importedStudentStatus(status) {
  return status || 'Enrolled';
}
