import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';

const ALLOWED_ROLES = ['student', 'parent', 'teacher', 'admin', 'director'];
const PRIVILEGED_ROLES = ['admin', 'director'];

const RATE_LIMITS = [
  { scope: 'invite:minute', max: 5,  windowSeconds: 60 },
  { scope: 'invite:hour',   max: 20, windowSeconds: 60 * 60 },
];

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ALLOWED_ROLES),
});

export async function POST(request) {
  // ── Gate 1: must be authenticated ──────────────────────────────────────
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ── Gate 2: caller must be admin or director ───────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile || !PRIVILEGED_ROLES.includes(profile.role)) {
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
      console.error('[invite] rate-limit RPC failed:', rlError);
      return NextResponse.json({ error: 'Rate limiter unavailable' }, { status: 503 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': String(limit.windowSeconds) } },
      );
    }
  }

  // ── Parse + validate body ──────────────────────────────────────────────
  let raw;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = InviteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { email, role } = parsed.data;

  // Authorize and persist via the caller's JWT, before any Auth email is
  // sent. Existing active accounts cannot change role through re-invitation.
  const { data, error } = await supabase.rpc('prepare_role_invitation', { p_email: email, p_role: role });
  if (error) {
    const status = error.code === '42501' ? 403 : ['23514', '40001', '40P01'].includes(error.code) ? 409 : 500;
    return NextResponse.json({ error: status === 403 ? 'Forbidden' : status === 409
      ? "Ce compte existe déjà ou a changé. Utilisez la gestion des rôles puis réessayez."
      : "Échec de la préparation de l'invitation." }, { status });
  }
  if (!data.needsDelivery) return NextResponse.json(data);

  // Service key is used only for Auth delivery, never profile/queue writes.
  // Delivery and the DB transaction cannot be atomic: on failure the bounded,
  // expiring queue stays retryable. A normal signup still requires verified email.
  const admin = getServiceRoleClient();
  const redirectTo = new URL('/inscription-compte', request.url).toString();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError) {
    return NextResponse.json({ error: "Envoi non confirmé. Réessayez l'invitation; aucun rôle existant n'a été modifié." }, { status: 502 });
  }
  return NextResponse.json(data);
}
