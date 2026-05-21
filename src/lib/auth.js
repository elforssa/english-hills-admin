// =============================================================================
// auth — current-user helpers: auth.{me,updateMe,logout,redirectToLogin}
//
// `me()` returns the merged Supabase auth user + public.profiles row as one
// object: { id, email, role, linked_student_id, linked_teacher_id, phone,
// full_name, created_date }. Throws NotAuthenticatedError when there's no
// session.
//
// Join model: `auth.users` and `public.profiles` share the same `id` (see
// migration 002). `auth.me().id` is the profile id — the value passed to
// `entities.User.update(id, ...)`.
// =============================================================================

'use client';

import { toast } from 'sonner';
import { getBrowserClient } from './supabase';

const PROFILE_TABLE = 'profiles';
const DEFAULT_ROLE  = 'pending';

class NotAuthenticatedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.status = 401;
    this.type   = 'auth_required';
  }
}

/**
 * Fetches the profile row for the given auth user, creating it on first
 * sight. Keeps `public.users.email` in sync with `auth.users.email`.
 */
async function loadOrCreateProfile(sb, authUser) {
  const { data: existing, error: fetchErr } = await sb
    .from(PROFILE_TABLE)
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (existing) return existing;

  // Safety net — the auth.users INSERT trigger normally creates this row,
  // but if the trigger ever misses we self-heal here.
  const seed = {
    id:        authUser.id,
    email:     authUser.email,
    full_name: authUser.user_metadata?.full_name || null,
    role:      DEFAULT_ROLE,
  };
  const { data: created, error: insertErr } = await sb
    .from(PROFILE_TABLE)
    .insert(seed)
    .select()
    .single();
  if (insertErr) throw insertErr;
  return created;
}

export const auth = {
  /**
   * auth.me() → Promise<User>
   *
   * Returns:
   *   { id, email, full_name, role, linked_student_id, linked_teacher_id,
   *     phone, auth_id, created_date }
   *
   * Throws a NotAuthenticatedError (status 401, type 'auth_required') when
   * the visitor has no Supabase session.
   */
  async me() {
    const sb = getBrowserClient();
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) throw new NotAuthenticatedError();

    const authUser = data.user;
    const profile  = await loadOrCreateProfile(sb, authUser);

    return {
      id:                 profile.id,                    // public.users.id (what entities.User.update expects)
      auth_id:            authUser.id,                   // auth.users.id (rarely needed by app code)
      email:              authUser.email,
      full_name:          profile.full_name || authUser.user_metadata?.full_name || '',
      role:               profile.role || DEFAULT_ROLE,
      linked_student_id:  profile.linked_student_id || null,
      linked_teacher_id:  profile.linked_teacher_id || null,
      phone:              profile.phone || null,
      created_date:       profile.created_at,            // alias for legacy callers
    };
  },

  /**
   * auth.updateMe(data) → Promise<UpdatedProfile>
   *
   * Updates the current user's profile row. Common usage:
   *   auth.updateMe({ role: 'admin' })
   *   auth.updateMe({ phone: '+212...' })
   *   auth.updateMe({ linked_student_id: '...' })
   *
   * Email is never overwritten — it's the join key.
   */
  async updateMe(data) {
    try {
      const sb = getBrowserClient();
      const { data: authData, error: authErr } = await sb.auth.getUser();
      if (authErr || !authData?.user) throw new NotAuthenticatedError();

      const { id, email, ...patch } = data || {};
      const { data: row, error } = await sb
        .from(PROFILE_TABLE)
        .update(patch)
        .eq('id', authData.user.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    } catch (error) {
      if (!(error instanceof NotAuthenticatedError)) {
        // eslint-disable-next-line no-console
        console.error('auth.updateMe failed:', error);
        if (typeof window !== 'undefined') {
          toast.error(`updateMe failed: ${error.message || 'unknown error'}`);
        }
      }
      throw error;
    }
  },

  /**
   * auth.logout(redirectUrl?) → Promise<void>
   *
   * Signs out and navigates. With no argument, redirects to /login. Pass
   * an explicit URL to override — e.g. `logout(window.location.href)` to
   * keep the user on the same page after the auth screen.
   */
  async logout(redirectUrl) {
    try {
      const sb = getBrowserClient();
      await sb.auth.signOut();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('auth.logout failed:', error);
    }
    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl || '/login';
    }
  },

  /**
   * auth.redirectToLogin(returnTo?) → void
   *
   * Sends the browser to /login. If a returnTo URL is supplied it's
   * appended as a query param so the login page can bounce back.
   */
  redirectToLogin(returnTo) {
    if (typeof window === 'undefined') return;
    const qs = returnTo
      ? `?returnTo=${encodeURIComponent(returnTo)}`
      : '';
    window.location.href = `/login${qs}`;
  },
};

export { NotAuthenticatedError };

// -----------------------------------------------------------------------------
// users — admin invite helper. Real implementation requires the Supabase
// service-role key behind an API route (POST /api/admin/invite-user calling
// supabase.auth.admin.inviteUserByEmail). The stub below logs the request and
// resolves so callers (currently Settings.jsx) don't crash. Replace the body
// with a `fetch('/api/admin/invite-user', { ... })` once the route is built.
// -----------------------------------------------------------------------------
export const users = {
  async inviteUser(email, role) {
    // eslint-disable-next-line no-console
    console.warn(
      '[users.inviteUser] Stub — wire to /api/admin/invite-user when ready.',
      { email, role }
    );
    return { skipped: true, email, role };
  },
};
