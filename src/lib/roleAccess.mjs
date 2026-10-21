// Presentation and route policy. SQL and handlers independently authorize actions.
// Roles always come from the stored profile, never request or user metadata.
export const ROLE_HOME = {
  director: '/dashboard', admin: '/dashboard', receptionist: '/crm/leads',
  teacher: '/teacher-portal', parent: '/parent-portal', student: '/student-portal',
};

const management = ['director', 'admin'];
const operations = [...management, 'receptionist'];
const capabilityRoles = Object.freeze({
  canManageCRM: operations,
  canManageAdmissions: operations,
  canManagePlacement: operations,
  canManageStudents: operations,
  canManageGroups: operations,
  canManageAcademics: operations,
  canManageFinanceOperations: operations,
  canManageTeacherOperations: operations,
  canAssignGroup: operations,
  canRecordAttendance: operations,
  canEditTeacherOperationalFields: operations,
  canManageStudentDocuments: operations,
  canViewHelp: operations,
  // Online learning (plan OL-r4 D13): operations run lessons; management sets up courses.
  canManageOnlineLessons: operations,
  canManageOnlineCourses: management,
  canViewFinanceAnalytics: management,
  canManageUsers: management,
  canManageSystemSettings: management,
  canViewTeacherCompensation: management,
  canManagePayroll: management,
  canManageIntegrations: ['director'],
  canViewMarketingAnalytics: ['director'],
  canCorrectFinance: ['director'],
  canArchiveStudents: management,
  canImportStudents: management,
  canExportStudents: management,
  canEditStudentProgramme: management,
  canManageTeacherHR: management,
  canDeleteAcademicRecords: management,
  canManageOwnAccount: Object.keys(ROLE_HOME),
});

export function hasCapability(role, capability) {
  return capabilityRoles[capability]?.includes(role) === true;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const exact = new Map([
  ['/crm/today', 'canManageCRM'], ['/crm/leads', 'canManageCRM'],
  ['/placement-tests', 'canManagePlacement'], ['/enrollments', 'canManageAdmissions'],
  ['/students', 'canManageStudents'], ['/students-directory', 'canManageStudents'],
  ['/students/new', 'canManageStudents'], ['/groups', 'canManageGroups'],
  ['/timetable', 'canManageAcademics'], ['/attendance', 'canRecordAttendance'],
  ['/assessments', 'canManageAcademics'],
  ['/receipts', 'canManageFinanceOperations'], ['/receipts/new', 'canManageFinanceOperations'],
  ['/teachers', 'canManageTeacherOperations'], ['/settings', 'canManageOwnAccount'],
  ['/helpdesk', 'canViewHelp'], ['/online', 'canManageOnlineLessons'],
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
