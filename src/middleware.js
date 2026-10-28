// Next.js middleware — refreshes the Supabase session cookie on every
// request AND enforces server-side route protection (auth + role gate).
//
// The role rules mirror src/components/ProtectedRoute.jsx so that disabling
// JavaScript or hitting a route directly cannot bypass the client-side
// guard. Anything the client-side guard would redirect we redirect here
// too, before any page code runs.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { receptionistCanAccess, isDirectorAnalyticsPath, isDirectorLifecyclePath, ROLE_HOME, isOnlineRoomPath, familyCanAccess } from './lib/roleAccess.mjs';

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

  // A redirect is a new response: carry over every cookie written by Auth
  // refresh, including chunked session cookies and cookie deletions.
  const redirect = (url) => {
    const redirected = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
    return redirected;
  };

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
          const previousCookies = response.cookies.getAll();
          response = NextResponse.next({ request });
          previousCookies.forEach((cookie) => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // A failed read is a connection problem, not "signed out" or "no profile"
  // (plan SCG-r1, REL-9): answer 503 with a retry page that renders no
  // protected page and grants no role. It carries the refreshed cookies.
  const unavailable = () => {
    const page = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="15">'
      + '<title>Connexion impossible</title></head><body style="font-family:system-ui,sans-serif;margin:0;'
      + 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc">'
      + '<main style="max-width:28rem;text-align:center"><h1 style="font-size:1.125rem">Connexion impossible, nouvel essai…</h1>'
      + '<p style="color:#475569;font-size:.875rem">La page n’a pas pu vérifier votre compte à cause d’un problème de connexion. '
      + 'Vos accès ne sont pas modifiés. Nouvel essai automatique dans quelques secondes.</p>'
      + '<p><a href="" style="color:#1d4ed8;font-weight:600">Réessayer maintenant</a></p></main></body></html>';
    const failed = new NextResponse(page, { status: 503, headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' } });
    response.cookies.getAll().forEach((cookie) => failed.cookies.set(cookie));
    return failed;
  };
  // Auth answered and refused (4xx: no or invalid session) versus could not
  // answer (network, 5xx, rate limit 429).
  const authUnreachable = (error) => Boolean(error) && (error.name === 'AuthRetryableFetchError'
    || error.status === 429 || !(error.status >= 400 && error.status < 500));

  // Always refresh the session — keeps the cookie alive even on public
  // pages so the client picks up a fresh access token.
  const { data: { user }, error: userError } = await supabase.auth.getUser();

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

  if (!user && authUnreachable(userError)) return unavailable();

  // Not signed in → bounce to /login with returnTo.
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?returnTo=${encodeURIComponent(pathname)}`;
    return redirect(url);
  }

  // Signed in — look up the role. profiles.id == auth.users.id (migration 002).
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  // An error is never "no profile": no row is pending, a failed read is a 503.
  if (profileError) return unavailable();
  const role = profile?.role || 'pending';

  if (role !== 'director' && (isDirectorAnalyticsPath(pathname) || isDirectorLifecyclePath(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[role] || '/unauthorized';
    url.search = '';
    return redirect(url);
  }

  // Pending / unknown → /unauthorized.
  if (role === 'pending') {
    if (pathname === '/unauthorized') return response;
    const url = request.nextUrl.clone();
    url.pathname = '/unauthorized';
    url.search = '';
    return redirect(url);
  }

  if (role === 'receptionist') {
    if (receptionistCanAccess(pathname) &&
      (pathname !== '/settings' || !request.nextUrl.search)) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/crm/leads';
    url.search = '';
    return redirect(url);
  }

  // Full-access roles.
  if (role === 'admin' || role === 'director') {
    return response;
  }

  if (role === 'teacher') {
    if (matchesAny(pathname, TEACHER_ROUTES) || isOnlineRoomPath(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/teacher-portal';
    url.search = '';
    return redirect(url);
  }

  if (role === 'parent') {
    if (familyCanAccess('parent', pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/parent-portal';
    url.search = '';
    return redirect(url);
  }

  if (role === 'student') {
    if (familyCanAccess('student', pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/student-portal';
    url.search = '';
    return redirect(url);
  }

  // Unknown role.
  const url = request.nextUrl.clone();
  url.pathname = '/unauthorized';
  url.search = '';
  return redirect(url);
}

export const config = {
  matcher: [
    // `monitoring` is the Sentry tunnel route — must bypass auth so error
    // reports send even from unauthenticated pages (e.g. /login).
    // `_vercel/` is Vercel's platform prefix (Speed Insights script and vitals
    // beacon). No application route can live there: `_`-prefixed app folders
    // are private and never routable. `monitoring` is anchored and the image
    // exemption covers only the real files in public/ (the logo and the staff
    // guide screenshots), so look-alikes such as /monitoringx or
    // /students/abc.png stay gated (plan PRF-r2 D13).
    '/((?!_next/static|_next/image|_vercel/|monitoring(?:/|$)|favicon\\.ico$|eh-logo\\.png$|helpdesk/[^/]+\\.(?:jpg|png)$).*)',
  ],
};
