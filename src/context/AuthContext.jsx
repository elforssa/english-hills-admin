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
//
// A profile read that FAILS (network, timeout, server error) is a connection
// problem, never "no profile": the provider shows a retry screen with no role,
// no children and no navigation, and does not call recover_missing_profile
// (plan SCG-r1, REL-9, owner decision D3 = B). "No row" behaves as before.
// =============================================================================

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { usePathname } from 'next/navigation';
import { queryClientInstance } from '@/lib/query-client';
import { resolveProfile, showsUnavailable } from '@/lib/sessionProfile.mjs';

const AuthContext = createContext(null);

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
  const [unavailable, setUnavailable] = useState(false);
  const identityRef = useRef(null);
  const requestRef = useRef(0);

  const loadSession = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestRef.current;
    const sb = getBrowserClient();

    // `silent` refreshes the profile without toggling isLoading. Toggling it
    // makes ProtectedRoute unmount the current page — which wipes any
    // in-progress form when Supabase fires an auth event on tab focus.
    if (!silent) setIsLoading(true);

    const { data: { user: authUser }, error } = await sb.auth.getUser();
    if (requestId !== requestRef.current) return;
    if (error || !authUser) {
      queryClientInstance.clear();
      identityRef.current = null;
      setUser(null);
      setRole(null);
      setUnavailable(false);
      setIsLoading(false);
      return;
    }

    // eslint-disable-next-line no-console
    const resolved = await resolveProfile(sb, authUser, (...args) => console.error(...args));
    if (resolved.status === 'unavailable') {
      if (requestId !== requestRef.current) return;
      // Fail closed: no role is kept or granted while the profile is unreadable.
      queryClientInstance.clear();
      identityRef.current = null;
      setUser(null);
      setRole(null);
      setUnavailable(true);
      setIsLoading(false);
      return;
    }
    setUnavailable(false);
    let { profile } = resolved;
    if (profile) {
      profile = await applyPendingRoleIfAny(sb, profile);
    }
    if (requestId !== requestRef.current) return;

    const resolvedRole = profile?.role || 'pending';
    const identity = `${authUser.id}:${resolvedRole}`;
    if (identityRef.current !== identity) {
      queryClientInstance.clear();
      identityRef.current = identity;
    }

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

    // Re-load on auth-state changes. Crucially, these run SILENTLY (no
    // isLoading toggle) so a tab-focus auth event never unmounts the page and
    // wipes an in-progress form. TOKEN_REFRESHED (fired on focus) is ignored
    // entirely — supabase-js has already refreshed the session and the role
    // hasn't changed; only a real sign-in / user update needs a profile reload.
    const sb = getBrowserClient();
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        ++requestRef.current;
        queryClientInstance.clear();
        identityRef.current = null;
        setUser(null);
        setRole(null);
        setUnavailable(false);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadSession({ silent: true });
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

  // The retry screen never covers the sign-in pages.
  const pathname = usePathname() || '';
  return (
    <AuthContext.Provider value={value}>
      {showsUnavailable(unavailable, pathname) ? <ConnectionProblem onRetry={() => loadSession()} onSignOut={logout} /> : children}
    </AuthContext.Provider>
  );
}

function ConnectionProblem({ onRetry, onSignOut }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background" role="alert">
      <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Connexion impossible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre compte n’a pas pu être chargé à cause d’un problème de connexion. Vos accès ne sont pas modifiés.
          Vérifiez la connexion puis réessayez.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onRetry}
            className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-semibold text-primary hover:bg-muted">
            Réessayer
          </button>
          <button type="button" onClick={onSignOut}
            className="inline-flex min-h-10 items-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-muted">
            Se déconnecter
          </button>
        </div>
      </div>
    </main>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
