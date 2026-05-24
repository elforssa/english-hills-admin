// =============================================================================
// POST /api/admin/update-role
//
// Changes the role on an existing profile row. Enforces the same caller-role
// matrix as /api/admin/invite:
//
//   Director → may set any role ∈ {director, admin, teacher, parent, student}
//   Admin    → may set teacher / parent / student only, AND only on target
//              users whose CURRENT role is one of those three (admin cannot
//              demote a director or admin).
//
// All writes go through the service-role client so RLS and the
// profiles_prevent_self_elevation trigger don't gate the change — the
// authorization decision is fully made in this handler.
//
// Body shape:
//   { userId: uuid, role: 'student'|'parent'|'teacher'|'admin'|'director' }
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';

const ASSIGNABLE_ROLES = ['student', 'parent', 'teacher', 'admin', 'director'];
const ADMIN_ASSIGNABLE = ['student', 'parent', 'teacher'];
const ADMIN_TARGETABLE_CURRENT_ROLES = ['student', 'parent', 'teacher', 'pending'];

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

  // ── Look up target's current role (via service role so we always read) ─
  const admin = getServiceRoleClient();
  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, role, email')
    .eq('id', userId)
    .maybeSingle();
  if (targetErr || !target) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Authorization matrix ───────────────────────────────────────────────
  if (callerProfile.role === 'admin') {
    if (!ADMIN_ASSIGNABLE.includes(nextRole)) {
      return NextResponse.json(
        { error: "Seul le directeur peut attribuer les rôles 'admin' et 'directeur'." },
        { status: 403 },
      );
    }
    if (!ADMIN_TARGETABLE_CURRENT_ROLES.includes(target.role)) {
      return NextResponse.json(
        { error: "Seul le directeur peut modifier le rôle d'un administrateur ou directeur." },
        { status: 403 },
      );
    }
  }

  // ── Don't allow a director to demote the last remaining director ───────
  if (target.role === 'director' && nextRole !== 'director') {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'director');
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Impossible de retirer le dernier directeur du système." },
        { status: 409 },
      );
    }
  }

  // ── Apply change (optimistic lock on current role to prevent TOCTOU) ───
  const { data: updated, error: updateErr } = await admin
    .from('profiles')
    .update({ role: nextRole })
    .eq('id', userId)
    .eq('role', target.role)
    .select('id');
  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error('[update-role] profiles update failed:', updateErr);
    return NextResponse.json(
      { error: 'Échec de la mise à jour du rôle.' },
      { status: 500 },
    );
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'Le rôle de cet utilisateur a été modifié entre-temps. Veuillez réessayer.' },
      { status: 409 },
    );
  }

  // Audit the role change. The trigger on profiles already logs the UPDATE,
  // but loses actor_id because we mutate via the service-role client (which
  // bypasses auth.uid()). Append an explicit row with the real caller so
  // role-change history is attributable.
  const { error: auditErr } = await admin.from('activity_log').insert({
    actor_id:     user.id,
    actor_email:  user.email,
    action:       'UPDATE',
    target_table: 'profiles',
    target_id:    userId,
    changed_columns: ['role'],
    before: { role: target.role,  email: target.email },
    after:  { role: nextRole,     email: target.email },
  });
  if (auditErr) {
    // eslint-disable-next-line no-console
    console.error('[update-role] audit log insert failed (non-fatal):', auditErr);
  }

  return NextResponse.json({
    success: true,
    userId,
    email: target.email,
    previousRole: target.role,
    role: nextRole,
  });
}
