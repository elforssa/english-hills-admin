// =============================================================================
// Magic-link callback — Supabase sends users here after clicking the email
// link. We exchange the one-time code for a session cookie, apply any
// queued pending_role, then redirect to the role-appropriate dashboard.
//
// `?next=<path>` overrides the role-based default when it is a safe
// internal path (open-redirect guard below).
// =============================================================================

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

const PORTAL_FOR_ROLE = {
  director: '/dashboard',
  admin:    '/dashboard',
  teacher:  '/teacher-portal',
  parent:   '/parent-portal',
  student:  '/student-portal',
};

// Open-redirect guard. We only honour `next` when it is an internal,
// absolute-path URL with no host component. Anything else (protocol-relative
// //evil.com, scheme://, backslash tricks) is replaced with the role-based
// default.
function safeNext(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

export async function GET(request) {
  const url    = new URL(request.url);
  const code   = url.searchParams.get('code');
  const next   = safeNext(url.searchParams.get('next'));
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback_failed`);
  }

  // Apply any pending role queued for this invitee. The RPC returns the
  // applied role (or null when no row exists).
  let appliedRole = null;
  const { data } = await supabase.rpc('apply_pending_role');
  appliedRole = data || null;

  if (!appliedRole) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      appliedRole = profile?.role || null;
    }
  }

  const target = next || PORTAL_FOR_ROLE[appliedRole] || '/unauthorized';
  return NextResponse.redirect(`${origin}${target}`);
}
