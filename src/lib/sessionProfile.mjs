// The browser's profile resolution (plan SCG-r1, REL-9, owner decision D3 = B).
// A profile read that FAILS (network, timeout, server error) is a connection
// problem, never "no profile": it resolves to 'unavailable', grants no role and
// does not call recover_missing_profile. "No row" keeps the recovery safety net.

/** → { status: 'ok', profile } | { status: 'unavailable' }; profile may be null (pending). */
export async function resolveProfile(sb, authUser, log = () => {}) {
  const { data: existing, error: readErr } = await sb
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();
  if (readErr) {
    log('profiles read failed:', readErr);
    return { status: 'unavailable' };
  }
  if (existing) return { status: 'ok', profile: existing };

  // Authenticated clients cannot insert profiles under the current grants.
  // The narrow RPC derives the identity from auth.uid() and auth.users.
  const { error: recoveryErr } = await sb.rpc('recover_missing_profile');
  if (recoveryErr) {
    log('profiles recovery failed:', recoveryErr);
    return { status: 'ok', profile: null };
  }
  const { data: recovered, error: rereadErr } = await sb.from('profiles')
    .select('*').eq('id', authUser.id).maybeSingle();
  // A failed re-read is a failed profile read too.
  if (rereadErr) {
    log('profiles re-read failed:', rereadErr);
    return { status: 'unavailable' };
  }
  return { status: 'ok', profile: recovered };
}

/** The retry screen never covers the sign-in pages. */
export function showsUnavailable(unavailable, pathname = '') {
  return Boolean(unavailable) && !(pathname === '/login' || pathname.startsWith('/login/'));
}
