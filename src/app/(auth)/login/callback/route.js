// =============================================================================
// Magic-link callback — Supabase sends users here after clicking the email
// link. We exchange the one-time code for a session cookie and bounce to
// /dashboard (or the original returnTo URL if provided).
// =============================================================================

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

const DEFAULT_NEXT = '/dashboard';

// Open-redirect guard. We only honour `next` when it is an internal,
// absolute-path URL with no host component. Anything else (protocol-relative
// //evil.com, scheme://, backslash tricks) is replaced with DEFAULT_NEXT.
function safeNext(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_NEXT;
  if (!raw.startsWith('/')) return DEFAULT_NEXT;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT;
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

  return NextResponse.redirect(`${origin}${next}`);
}
