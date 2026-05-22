// =============================================================================
// AuthContext — current Supabase session + resolved profile role.
//
// Responsibilities:
//   1. On mount: read the current Supabase session and load the matching
//      profile row.
//   2. If no profile exists (rare — the auth trigger normally creates one):
//      insert a row with role='pending' as a safety net.
//   3. PendingRole sweep: if the user's email has a PendingRole entry,
//      apply that role to the profile and delete the PendingRole row.
//
// Public surface (kept minimal per spec): { user, role, isLoading, logout }.
// =============================================================================

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getBrowserClient } from '@/lib/supabase';

const AuthContext = createContext(null);

async function loadOrCreateProfile(sb, authUser) {
  // Try to read first.
  const { data: existing, error: readErr } = await sb
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (readErr) {
    // eslint-disable-next-line no-console
    console.error('profiles read failed:', readErr);
  }
  if (existing) return existing;

  // Safety-net insert (the auth.users trigger normally creates this row).
  const { data: created, error: insertErr } = await sb
    .from('profiles')
    .insert({
      id:        authUser.id,
      email:     authUser.email,
      full_name: authUser.user_metadata?.full_name || '',
      role:      'pending',
    })
    .select()
    .single();
  if (insertErr) {
    // eslint-disable-next-line no-console
    console.error('profiles fallback-create failed:', insertErr);
    return null;
  }
  return created;
}

/**
 * Calls the apply_pending_role() SECURITY DEFINER RPC. The RPC looks up
 * the pending_roles row matching the caller's email, applies the role to
 * the profile, and deletes the pending row — all server-side, bypassing
 * the admin-only RLS on pending_roles.
 */
async function applyPendingRoleIfAny(sb, profile) {
  const { data: appliedRole, error } = await sb.rpc('apply_pending_role');
  if (error) {
    // eslint-disable-next-line no-console
    console.error('apply_pending_role RPC failed:', error);
    return profile;
  }
  if (!appliedRole) return profile;
  return { ...profile, role: appliedRole };
}

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [role,      setRole]      = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const sb = getBrowserClient();

    setIsLoading(true);

    const { data: { user: authUser }, error } = await sb.auth.getUser();
    if (error || !authUser) {
      setUser(null);
      setRole(null);
      setIsLoading(false);
      return;
    }

    let profile = await loadOrCreateProfile(sb, authUser);
    if (profile) {
      profile = await applyPendingRoleIfAny(sb, profile);
    }

    const resolvedRole = profile?.role || 'pending';

    setUser({
      id:                profile?.id || authUser.id,
      auth_id:           authUser.id,
      email:             authUser.email,
      full_name:         profile?.full_name || authUser.user_metadata?.full_name || '',
      role:              resolvedRole,
      linked_student_id: profile?.linked_student_id || null,
      linked_teacher_id: profile?.linked_teacher_id || null,
      phone:             profile?.phone || null,
      created_date:      profile?.created_at || authUser.created_at,
    });
    setRole(resolvedRole);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSession();

    // Re-load on auth-state changes (sign-in/out, token refresh).
    const sb = getBrowserClient();
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadSession();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadSession]);

  const logout = useCallback(async () => {
    const sb = getBrowserClient();
    try {
      await sb.auth.signOut();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('signOut failed:', err);
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, []);

  const value = useMemo(
    () => ({ user, role, isLoading, logout, reload: loadSession }),
    [user, role, isLoading, logout, loadSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
