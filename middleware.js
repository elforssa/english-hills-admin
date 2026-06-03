// Next.js middleware — refreshes the Supabase session cookie on every
// request AND enforces server-side route protection (auth + role gate).
//
// The role rules mirror src/components/ProtectedRoute.jsx so that disabling
// JavaScript or hitting a route directly cannot bypass the client-side
// guard. Anything the client-side guard would redirect we redirect here
// too, before any page code runs.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Paths that are reachable without a session.
const PUBLIC_PATHS = new Set([
  '/login',
  '/login/callback',
  '/inscription',
  '/inscription-compte',
  '/privacy',
  '/unauthorized',
]);

// Per-role allowlists for non-admin/director roles. Anything outside the
// list bounces to the role's home portal. Keep in sync with
// src/components/ProtectedRoute.jsx.
const TEACHER_ROUTES = [
  '/teacher-portal', '/attendance', '/assessments', '/portfolios',
  '/learning-assessments', '/groups', '/timetable', '/dashboard',
  '/', '/settings',
];

function matchesAny(path, allowed) {
  return allowed.some((r) => path === r || path.startsWith(`${r}/`));
}

function isPublic(pathname) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // /login/callback already in the set; also allow any nested login pages.
  if (pathname.startsWith('/login/')) return true;
  return false;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Always refresh the session — keeps the cookie alive even on public
  // pages so the client picks up a fresh access token.
  const { data: { user } } = await supabase.auth.getUser();

  // Public routes: let through without further checks.
  if (isPublic(pathname)) {
    return response;
  }

  // API routes authenticate themselves per-handler (POST /api/email/send
  // already does this). Skip the role gate here so handlers can return
  // proper JSON 401s instead of HTML redirects.
  if (pathname.startsWith('/api/')) {
    return response;
  }

  // Not signed in → bounce to /login with returnTo.
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?returnTo=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Signed in — look up the role. profiles.id == auth.users.id (migration 002).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role || 'pending';

  // Pending / unknown → /unauthorized.
  if (role === 'pending') {
    if (pathname === '/unauthorized') return response;
    const url = request.nextUrl.clone();
    url.pathname = '/unauthorized';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Full-access roles.
  if (role === 'admin' || role === 'director') {
    return response;
  }

  if (role === 'teacher') {
    if (matchesAny(pathname, TEACHER_ROUTES)) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/teacher-portal';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (role === 'parent') {
    if (pathname === '/parent-portal' || pathname === '/settings') return response;
    const url = request.nextUrl.clone();
    url.pathname = '/parent-portal';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (role === 'student') {
    if (pathname === '/student-portal' || pathname === '/settings') return response;
    const url = request.nextUrl.clone();
    url.pathname = '/student-portal';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Unknown role.
  const url = request.nextUrl.clone();
  url.pathname = '/unauthorized';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // `monitoring` is the Sentry tunnel route — must bypass auth so error
    // reports send even from unauthenticated pages (e.g. /login).
    '/((?!_next/static|_next/image|monitoring|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
