// Shared by server middleware, client guards and login routing. Database roles
// remain authoritative; this module never accepts a role from request metadata.
export const ROLE_HOME = {
  director: '/dashboard', admin: '/dashboard', receptionist: '/crm/today',
  teacher: '/teacher-portal', parent: '/parent-portal', student: '/student-portal',
};
export const RECEPTIONIST_ROUTES = ['/crm/today', '/crm/leads', '/placement-tests', '/students', '/enrollments', '/settings'];
export function receptionistCanAccess(path) {
  return RECEPTIONIST_ROUTES.includes(path)
    || /^\/students\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path);
}
export function loginDestination(role, requested) {
  const home = ROLE_HOME[role] || '/unauthorized';
  if (typeof requested !== 'string' || !requested.startsWith('/')
    || requested.startsWith('//') || /[\\\u0000-\u001f]/.test(requested)) return home;
  const path = new URL(requested, 'https://english-hills.local').pathname;
  if (role === 'receptionist' && !receptionistCanAccess(path)) return home;
  if (!ROLE_HOME[role]) return home;
  return requested;
}
