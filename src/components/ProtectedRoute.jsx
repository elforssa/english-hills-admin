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
//   • receptionist                      → access granted to RECEPTIONIST_ROUTES;
//                                         anything else → /
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

const RECEPTIONIST_ROUTES = [
  '/dashboard', '/', '/students', '/students-directory', '/dismissal',
  '/attendance', '/settings',
];

function matchesAny(path, allowedList) {
  return allowedList.some((r) => path === r || path.startsWith(`${r}/`));
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, isLoading } = useAuth();
  const router    = useRouter();
  const pathname  = usePathname();

  useEffect(() => {
    if (isLoading) return;

    // Not signed in
    if (!user) {
      const returnTo = encodeURIComponent(pathname || '/');
      router.replace(`/login?returnTo=${returnTo}`);
      return;
    }

    // Explicit per-route allowlist takes precedence
    if (Array.isArray(allowedRoles)) {
      if (!allowedRoles.includes(role)) {
        router.replace('/unauthorized');
      }
      return;
    }

    // Pending / unknown
    if (!role || role === 'pending') {
      router.replace('/unauthorized');
      return;
    }

    // Full-access roles
    if (role === 'admin' || role === 'director') return;

    // Teacher
    if (role === 'teacher') {
      if (!matchesAny(pathname, TEACHER_ROUTES)) {
        router.replace('/teacher-portal');
      }
      return;
    }

    // Parent — portal + settings only
    if (role === 'parent') {
      if (pathname !== '/parent-portal' && pathname !== '/settings') {
        router.replace('/parent-portal');
      }
      return;
    }

    // Student — portal + settings only
    if (role === 'student') {
      if (pathname !== '/student-portal' && pathname !== '/settings') {
        router.replace('/student-portal');
      }
      return;
    }

    // Receptionist
    if (role === 'receptionist') {
      if (!matchesAny(pathname, RECEPTIONIST_ROUTES)) {
        router.replace('/');
      }
      return;
    }

    // Unknown role
    router.replace('/unauthorized');
  }, [user, role, isLoading, pathname, router, allowedRoles]);

  if (isLoading || !user) return null;
  return children;
}
