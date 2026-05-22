// =============================================================================
// POST /api/admin/invite
//
// Sends a Supabase Auth invitation email and queues a pending_roles row so
// the invitee's role is applied on first sign-in. The invite link lands on
// /inscription-compte, where the user sets their password and full name.
//
// Auth model:
//   • Caller must have profile.role in {admin, director}.
//   • Director may grant any of {director, admin, teacher, parent, student}.
//   • Admin may grant {teacher, parent, student} only — granting admin or
//     director from an admin session returns 403.
//
// Body shape:
//   { email: string, role: 'student'|'parent'|'teacher'|'admin'|'director' }
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceRoleClient } from '@/lib/supabase';

const ALLOWED_ROLES = ['student', 'parent', 'teacher', 'admin', 'director'];
const PRIVILEGED_ROLES = ['admin', 'director'];

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

  // ── Gate 3: only directors may grant privileged roles ──────────────────
  if (PRIVILEGED_ROLES.includes(role) && profile.role !== 'director') {
    return NextResponse.json(
      { error: 'Seul le directeur peut attribuer ce rôle.' },
      { status: 403 },
    );
  }

  // ── Perform invite via service-role client ─────────────────────────────
  const admin = getServiceRoleClient();

  const redirectTo = new URL('/inscription-compte', request.url).toString();
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  // "User already registered" is fine — we still upsert the pending role so
  // the next sign-in (or apply_pending_role RPC) bumps them to the new role.
  if (inviteError && !/already (registered|exists)/i.test(inviteError.message)) {
    // eslint-disable-next-line no-console
    console.error('[invite] inviteUserByEmail failed:', inviteError);
    return NextResponse.json(
      { error: inviteError.message || 'Failed to send invitation' },
      { status: 500 },
    );
  }

  const { error: pendingError } = await admin
    .from('pending_roles')
    .upsert({ email, role }, { onConflict: 'email' });
  if (pendingError) {
    // eslint-disable-next-line no-console
    console.error('[invite] pending_roles upsert failed:', pendingError);
    return NextResponse.json(
      { error: 'Invitation sent but role queueing failed', details: pendingError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    email,
    role,
    userId: inviteData?.user?.id ?? null,
    alreadyRegistered: !!inviteError,
  });
}
