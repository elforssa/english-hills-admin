// =============================================================================
// ProtectedRoute — wraps any page that requires a session.
//
// Behavior (mirrors src/components/ProtectedRoute.jsx from the Vite app,
// adapted to Next.js App Router):
//
//   • No session                       → redirect /login?returnTo=<path>
//   • Session, role='pending'           → redirect /unauthorized
//   • admin / director                  → access granted to any path
//   • teacher                           → access granted to TEACHER_ROUTES;
//                                         anything else → /teacher-portal
//   • parent / student                  → access granted to their portal +
//                                         /settings; anything else → portal
//   • unknown role                      → /unauthorized
//
// Optional `allowedRoles` prop short-circuits the global map: when supplied,
// the component grants access iff the current role is in that list and
// redirects to /unauthorized otherwise.
// =============================================================================

'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const TEACHER_ROUTES = [
  '/teacher-portal', '/attendance', '/assessments', '/portfolios',
  '/learning-assessments', '/groups', '/timetable', '/dashboard', '/', '/settings',
];

function matchesAny(path, allowedList) {
  return allowedList.some((r) => path === r || path.startsWith(`${r}/`));
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, isLoading } = useAuth();
  const router    = useRouter();
  const pathname  = usePathname();

  // Decide before rendering: an effect-only redirect lets disallowed children
  // mount and start queries during the navigation window.
  const redirectTo = (() => {
    if (isLoading) return null;

    // Not signed in
    if (!user) {
      const returnTo = encodeURIComponent(pathname || '/');
      return `/login?returnTo=${returnTo}`;
    }

    // Explicit per-route allowlist takes precedence
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.includes(role) ? null : '/unauthorized';
    }

    // Pending / unknown
    if (!role || role === 'pending') {
      return '/unauthorized';
    }

    // Full-access roles
    if (role === 'admin' || role === 'director') return null;

    // Teacher
    if (role === 'teacher') {
      return matchesAny(pathname, TEACHER_ROUTES) ? null : '/teacher-portal';
    }

    // Parent — portal + settings only
    if (role === 'parent') {
      return pathname === '/parent-portal' || pathname === '/settings' ? null : '/parent-portal';
    }

    // Student — portal + settings only
    if (role === 'student') {
      return pathname === '/student-portal' || pathname === '/settings' ? null : '/student-portal';
    }

    // Unknown role
    return '/unauthorized';
  })();

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (isLoading || !user || redirectTo) return null;
  return children;
}
