import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { rejectCrossOrigin } from '@/lib/http/requestOrigin.mjs';
import { hasCapability } from '@/lib/roleAccess.mjs';

const ALLOWED_ROLES = ['student', 'parent', 'teacher', 'admin', 'director', 'receptionist'];
const PRIVILEGED_ROLES = ['admin', 'director'];

const RATE_LIMITS = [
  { scope: 'invite:minute', max: 5,  windowSeconds: 60 },
  { scope: 'invite:hour',   max: 20, windowSeconds: 60 * 60 },
];

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ALLOWED_ROLES),
  // Parent and student invitations name the learners staff confirmed; teacher
  // invitations name the teacher record (plan PRF-r2 D3).
  studentIds: z.array(z.guid()).min(1).max(10).optional(),
  teacherId: z.guid().optional(),
});

const NOT_CONFIRMED = "Envoi non confirmé. Réessayez l'invitation; aucun rôle existant n'a été modifié.";

// The route's answer never carries the queue id (the public functions already drop it).
function answer(data) {
  if (!data || typeof data !== 'object') return data;
  const { queueId: _queueId, ...rest } = data;
  return rest;
}

// Plan ELW-r3 section 4 (D2 = A): a confirmed account that is still pending gets a
// sign-in e-mail, so a re-invitation always produces a working link. A cookie-less
// anon client with the implicit flow: under the default templates the link lands on
// /inscription-compte with a fragment, like an invitation. Never creates an account.
async function sendSignInLink(email, request) {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: new URL('/inscription-compte', request.url).toString(),
    },
  });
  return !error;
}

// A closed portal.* refusal carries its French message; other errors stay generic.
function portalRefusal(error) {
  if (!String(error?.hint || '').startsWith('portal.')) return null;
  const status = error.code === 'PT409' ? 409 : error.code === '22023' ? 400 : 403;
  return NextResponse.json({ error: error.message, reason: error.hint }, { status });
}

export async function POST(request) {
  const refused = rejectCrossOrigin(request);
  if (refused) return refused;
  // ── Gate 1: must be authenticated ──────────────────────────────────────
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ── Gate 2: caller must be admin or director; reception (canInviteFamily) only
  //    for a parent or student invitation, checked after parsing (RPW-r2 item 7) ──
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const familyInviterOnly = Boolean(profile) && !PRIVILEGED_ROLES.includes(profile.role)
    && hasCapability(profile.role, 'canInviteFamily');
  if (profileError || !profile || !(PRIVILEGED_ROLES.includes(profile.role) || familyInviterOnly)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Gate 3: per-user rate limit ────────────────────────────────────────
  for (const limit of RATE_LIMITS) {
    const { data: allowed, error: rlError } = await supabase.rpc('consume_rate_limit', { p_scope: limit.scope });
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
  const { email, role, studentIds, teacherId } = parsed.data;
  if (familyInviterOnly && !['parent', 'student'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Authorize and persist via the caller's JWT, before any Auth email is
  // sent. Existing active accounts cannot change role through re-invitation.
  // Family accounts are linked to the confirmed learners and teacher accounts
  // to one teacher record in the same transaction as the queue row.
  const { data, error } = ['parent', 'student'].includes(role)
    ? await supabase.rpc('prepare_family_invitation', { p_email: email, p_role: role, p_student_ids: studentIds ?? [] })
    : role === 'teacher'
      ? await supabase.rpc('prepare_teacher_invitation', { p_email: email, p_teacher_id: teacherId ?? null })
      : await supabase.rpc('prepare_role_invitation', { p_email: email, p_role: role });
  if (error) {
    const refusal = portalRefusal(error);
    if (refusal) return refusal;
    const status = error.code === '42501' ? 403 : ['23514', 'PT409', '40001', '40P01'].includes(error.code) ? 409 : 500;
    return NextResponse.json({ error: status === 403 ? 'Forbidden' : status === 409
      ? "Ce compte existe déjà ou a changé. Utilisez la gestion des rôles puis réessayez."
      : "Échec de la préparation de l'invitation." }, { status });
  }
  if (!data.needsDelivery) {
    // The decision uses only needsDelivery, userId and the stored role, read with the
    // caller's own client. An active account gets no e-mail, as before.
    if (data.userId) {
      const { data: target, error: targetError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.userId)
        .maybeSingle();
      if (targetError) return NextResponse.json({ error: NOT_CONFIRMED }, { status: 502 });
      if (target?.role === 'pending' && !(await sendSignInLink(email, request))) {
        // The queue row stays: the invitation can be retried.
        return NextResponse.json({ error: NOT_CONFIRMED }, { status: 502 });
      }
    }
    return NextResponse.json(answer(data));
  }

  // Service key is used only for Auth delivery, never profile/queue writes.
  // Delivery and the DB transaction cannot be atomic: on failure the bounded,
  // expiring queue stays retryable. A normal signup still requires verified email.
  const admin = getServiceRoleClient();
  const redirectTo = new URL('/inscription-compte', request.url).toString();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError) {
    return NextResponse.json({ error: NOT_CONFIRMED }, { status: 502 });
  }
  return NextResponse.json(answer(data));
}
