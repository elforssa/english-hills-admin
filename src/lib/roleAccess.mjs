// Presentation and route policy. SQL and handlers independently authorize actions.
// Roles always come from the stored profile, never request or user metadata.
export const ROLE_HOME = {
  director: '/dashboard', admin: '/dashboard', receptionist: '/crm/leads',
  teacher: '/teacher-portal', parent: '/parent-portal', student: '/student-portal',
};

const management = ['director', 'admin'];
const operations = [...management, 'receptionist'];
const director = ['director'];
const signedIn = Object.keys(ROLE_HOME);

// The one capability list (plan RPW-r2, ADR-018). Each entry names its database twin in
// operational_security.role_has_capability (migration 131 and later); the parity test
// (scripts/test-capability-parity.mjs) fails when a name or a role list differs.
// Pages and shared commands ask for a capability, never for a role. Online entries are
// pinned to their 53c486b values (scripts/test-receptionist-online-pinned.mjs).
export const CAPABILITIES = Object.freeze({
  canManageCRM: { sql: 'manage_crm', roles: operations },
  canManagePlacement: { sql: 'manage_placement', roles: operations },
  canManageStudents: { sql: 'manage_students', roles: operations },
  canManageGroups: { sql: 'manage_groups', roles: operations },
  canManageAcademics: { sql: 'manage_academics', roles: operations },
  canManageFinanceOperations: { sql: 'manage_finance_operations', roles: operations },
  canManageTeacherOperations: { sql: 'manage_teacher_operations', roles: operations },
  canAssignGroup: { sql: 'assign_group', roles: operations },
  canRecordAttendance: { sql: 'record_attendance', roles: operations },
  canEditTeacherOperationalFields: { sql: 'edit_teacher_operations', roles: operations },
  canManageStudentDocuments: { sql: 'manage_student_documents', roles: operations },
  // Stage 2 (items 9-13): the management enrollment dialog and group page.
  canEditEnrollment: { sql: 'edit_enrollment', roles: operations },
  canOverrideCapacity: { sql: 'override_capacity', roles: operations },
  canPlaceWithoutPaidEnrollment: { sql: 'place_without_paid_enrollment', roles: operations },
  // Stage 3 (items 1-6, 14, 16, 17, 17c, 18, 18p, 19, L): the dossier and teaching.
  canEditStudentEmail: { sql: 'edit_student_email', roles: operations },
  canManageAuthorizedAdults: { sql: 'manage_authorized_adults', roles: operations },
  canRecordDismissal: { sql: 'record_dismissal', roles: operations },
  canEndLearner: { sql: 'end_learner', roles: operations },
  canReopenEnrollment: { sql: 'reopen_enrollment', roles: operations },
  canManageGrades: { sql: 'manage_grades', roles: operations },
  canManageLearningRecords: { sql: 'manage_learning_records', roles: operations },
  canViewCertificates: { sql: 'view_certificates', roles: operations },
  canAddTeacher: { sql: 'add_teacher', roles: operations },
  canViewLeaveRequests: { sql: 'view_leave_requests', roles: operations },
  canIssueCertificates: { sql: 'issue_certificates', roles: management },
  canDecideLeaveRequests: { sql: 'decide_leave_requests', roles: management },
  // Direct writes to the learner table (row policies). Without it, the shared learner form
  // saves through save_receptionist_student.
  canWriteStudentRecords: { sql: 'write_student_records', roles: management },
  canViewHelp: { sql: 'view_help', roles: operations },
  // Online learning (plan OL-r4 D13): operations run lessons; management sets up courses.
  canManageOnlineLessons: { sql: 'manage_online_lessons', roles: operations },
  canManageOnlineCourses: { sql: 'manage_online_courses', roles: management },
  canViewFinanceAnalytics: { sql: 'view_finance_analytics', roles: management },
  canManageUsers: { sql: 'manage_users', roles: management },
  canManageSystemSettings: { sql: 'manage_system_settings', roles: management },
  canViewTeacherCompensation: { sql: 'view_teacher_compensation', roles: management },
  canManagePayroll: { sql: 'manage_payroll', roles: management },
  canManageIntegrations: { sql: 'manage_integrations', roles: director },
  canViewMarketingAnalytics: { sql: 'view_marketing_analytics', roles: director },
  canCorrectFinance: { sql: 'correct_finance', roles: director },
  canArchiveStudents: { sql: 'archive_students', roles: management },
  canImportStudents: { sql: 'import_students', roles: management },
  canExportStudents: { sql: 'export_students', roles: management },
  canEditStudentProgramme: { sql: 'edit_student_programme', roles: operations },
  canManageTeacherHR: { sql: 'manage_teacher_hr', roles: management },
  canDeleteAcademicRecords: { sql: 'delete_academic_records', roles: management },
  canManageOwnAccount: { sql: 'manage_own_account', roles: signedIn },
});

export function hasCapability(role, capability) {
  return Object.hasOwn(CAPABILITIES, capability) && CAPABILITIES[capability].roles.includes(role);
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const exact = new Map([
  ['/crm/today', 'canManageCRM'], ['/crm/leads', 'canManageCRM'],
  ['/placement-tests', 'canManagePlacement'],
  ['/students', 'canManageStudents'], ['/students-directory', 'canManageStudents'],
  ['/students/new', 'canManageStudents'], ['/groups', 'canManageGroups'],
  ['/timetable', 'canManageAcademics'], ['/attendance', 'canRecordAttendance'],
  ['/assessments', 'canManageAcademics'],
  ['/receipts', 'canManageFinanceOperations'], ['/receipts/new', 'canManageFinanceOperations'],
  ['/teachers', 'canManageTeacherOperations'], ['/settings', 'canManageOwnAccount'],
  ['/helpdesk', 'canViewHelp'], ['/online', 'canManageOnlineLessons'],
  // Stage 3.
  ['/dismissal', 'canRecordDismissal'], ['/portfolios', 'canManageLearningRecords'],
  ['/learning-assessments', 'canManageLearningRecords'], ['/certificates', 'canViewCertificates'],
  ['/teachers/new', 'canAddTeacher'], ['/leave-requests', 'canViewLeaveRequests'],
]);
const detail = [
  [new RegExp(`^/students/${UUID}(?:/edit)?$`, 'i'), 'canManageStudents'],
  [new RegExp(`^/groups/${UUID}$`, 'i'), 'canManageGroups'],
  [new RegExp(`^/teachers/${UUID}(?:/edit)?$`, 'i'), 'canManageTeacherOperations'],
  [new RegExp(`^/receipts/${UUID}/print$`, 'i'), 'canManageFinanceOperations'],
  [new RegExp(`^/online/${UUID}$`, 'i'), 'canManageOnlineLessons'],
  [new RegExp(`^/online/room/${UUID}$`, 'i'), 'canManageOnlineLessons'],
];

export function normalizeRoutePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
    /[\\\u0000-\u001f?#%]/.test(path)) return null;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function receptionistCanAccess(path) {
  const normalized = normalizeRoutePath(path);
  if (!normalized) return false;
  const capability = exact.get(normalized) || detail.find(([pattern]) => pattern.test(normalized))?.[1];
  return hasCapability('receptionist', capability);
}

export const RECEPTIONIST_ROUTES = Object.freeze([...exact.keys()]);

// The shared lesson room is reachable by every operational role; the join route and
// online_issue_join decide eligibility. Only the exact /online/room/<uuid> form matches.
const ONLINE_ROOM = new RegExp(`^/online/room/${UUID}$`, 'i');
export function isOnlineRoomPath(path) {
  return typeof path === 'string' && ONLINE_ROOM.test(path);
}

// Parent and student allowlists: their portal, its online section, settings and the room.
const FAMILY_ROUTES = Object.freeze({
  parent: ['/parent-portal', '/parent-portal/online', '/settings'],
  student: ['/student-portal', '/student-portal/online', '/settings'],
});
export function familyCanAccess(role, path) {
  return (FAMILY_ROUTES[role] || []).includes(path) || (Boolean(FAMILY_ROUTES[role]) && isOnlineRoomPath(path));
}

export function isDirectorAnalyticsPath(path) {
  return path === '/crm/analytics' || path?.startsWith('/crm/analytics/');
}

export function isDirectorLifecyclePath(path) {
  return path === '/crm/integrations/lifecycle' || path?.startsWith('/crm/integrations/lifecycle/');
}

export function loginDestination(role, requested) {
  const home = ROLE_HOME[role] || '/unauthorized';
  if (typeof requested !== 'string' || !requested.startsWith('/') ||
    requested.startsWith('//') || /[\\\u0000-\u001f]/.test(requested)) return home;
  let url;
  try { url = new URL(requested, 'https://english-hills.local'); } catch { return home; }
  if (url.origin !== 'https://english-hills.local' || /%(?:2f|5c|00)/i.test(requested)) return home;
  const path = normalizeRoutePath(url.pathname);
  if (!path || (role !== 'director' && (isDirectorAnalyticsPath(path) || isDirectorLifecyclePath(path)))) return home;
  if (role === 'receptionist' && (!receptionistCanAccess(path) ||
    (path === '/settings' && (url.search || url.hash)))) return home;
  if (!ROLE_HOME[role]) return home;
  return requested;
}
