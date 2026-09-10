import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase';

const ASSIGNABLE_ROLES = ['student', 'parent', 'teacher', 'admin', 'director'];

const RATE_LIMITS = [
  { scope: 'role_update:minute', max: 10,  windowSeconds: 60 },
  { scope: 'role_update:hour',   max: 50,  windowSeconds: 60 * 60 },
];

const Schema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
});

export async function POST(request) {
  // ── Gate 1: must be authenticated ──────────────────────────────────────
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ── Gate 2: caller must be admin or director ───────────────────────────
  const { data: callerProfile, error: callerErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (callerErr || !callerProfile || !['admin', 'director'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Gate 3: per-user rate limit ────────────────────────────────────────
  for (const limit of RATE_LIMITS) {
    const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_scope: limit.scope,
      p_max_requests: limit.max,
      p_window_seconds: limit.windowSeconds,
    });
    if (rlError) {
      // eslint-disable-next-line no-console
      console.error('[update-role] rate-limit RPC failed:', rlError);
      return NextResponse.json({ error: 'Rate limiter unavailable' }, { status: 503 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': String(limit.windowSeconds) } },
      );
    }
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let raw;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { userId, role: nextRole } = parsed.data;

  // The database derives the actor from this session and serializes the
  // authorization decision, role write, last-director check and audit.
  const { data, error } = await supabase.rpc('change_user_role', { p_user_id: userId, p_role: nextRole });
  if (error) {
    const status = error.code === '42501' ? 403 : ['23514', '40001', '40P01'].includes(error.code) ? 409 : 500;
    return NextResponse.json({ error: status === 403 ? 'Forbidden' : status === 409
      ? 'Modification impossible ou concurrente. Vérifiez les rôles et réessayez.' : 'Échec de la mise à jour du rôle.' }, { status });
  }
  return NextResponse.json(data);
}
