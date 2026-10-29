// REL-9, owner decision D3 = B (plan SCG-r1): in the browser, a failed profile read
// is a connection problem — no role, a retry screen, no recover_missing_profile —
// while "no row" keeps the recovery safety net. A failed Auth read is still
// treated as signed out. The screen offers sign-out, is cleared when the session
// ends and never covers /login.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProfile, showsUnavailable } from '../src/lib/sessionProfile.mjs';

function client({ reads, recovery = { error: null } }) {
  const calls = [];
  const queue = [...reads];
  const sb = {
    from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { calls.push(`read:${table}`); return queue.shift(); } }) }) }),
    rpc: async (name) => { calls.push(`rpc:${name}`); return recovery; },
  };
  return { sb, calls };
}
const user = { id: 'u1' };
const failure = { data: null, error: { message: 'TypeError: fetch failed' } };
let checks = 0;

{ // A failed read: unavailable, and no recovery call.
  const { sb, calls } = client({ reads: [failure] });
  assert.deepEqual(await resolveProfile(sb, user), { status: 'unavailable' });
  assert.deepEqual(calls, ['read:profiles']); checks += 1;
}
{ // A server error or timeout is the same.
  const { sb, calls } = client({ reads: [{ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }] });
  assert.equal((await resolveProfile(sb, user)).status, 'unavailable');
  assert.ok(!calls.includes('rpc:recover_missing_profile')); checks += 1;
}
{ // A profile: ok.
  const { sb, calls } = client({ reads: [{ data: { id: 'u1', role: 'director' }, error: null }] });
  assert.deepEqual(await resolveProfile(sb, user), { status: 'ok', profile: { id: 'u1', role: 'director' } });
  assert.deepEqual(calls, ['read:profiles']); checks += 1;
}
{ // No row: the recovery safety net, as before.
  const { sb, calls } = client({ reads: [{ data: null, error: null }, { data: { id: 'u1', role: 'pending' }, error: null }] });
  assert.deepEqual(await resolveProfile(sb, user), { status: 'ok', profile: { id: 'u1', role: 'pending' } });
  assert.deepEqual(calls, ['read:profiles', 'rpc:recover_missing_profile', 'read:profiles']); checks += 1;
}
{ // No row and the recovery fails: no profile (pending), as before.
  const { sb } = client({ reads: [{ data: null, error: null }], recovery: { error: { message: 'denied' } } });
  assert.deepEqual(await resolveProfile(sb, user), { status: 'ok', profile: null }); checks += 1;
}
{ // No row, recovered, and the re-read fails: a failed read again, not pending.
  const { sb } = client({ reads: [{ data: null, error: null }, failure] });
  assert.deepEqual(await resolveProfile(sb, user), { status: 'unavailable' }); checks += 1;
}
// The screen never covers the sign-in pages.
for (const [path, shown] of [['/login', false], ['/login/callback', false], ['/dashboard', true], ['/', true], ['/loginx', true], ['/students/1', true]]) {
  assert.equal(showsUnavailable(true, path), shown, path); checks += 1;
}
assert.equal(showsUnavailable(false, '/dashboard'), false); checks += 1;

// AuthContext wiring: the decision comes from resolveProfile; the state is cleared on
// the no-user branch and on SIGNED_OUT; the screen offers retry and sign-out with no
// promise of an automatic retry; a failed Auth read still signs out.
const source = readFileSync('src/context/AuthContext.jsx', 'utf8');
assert.match(source, /await resolveProfile\(sb, authUser/);
assert.doesNotMatch(source, /async function loadOrCreateProfile/);
assert.match(source, /if \(error \|\| !authUser\) \{[^}]*setUnavailable\(false\);/s, 'no-user branch clears the screen');
assert.match(source, /event === 'SIGNED_OUT'\) \{[^}]*setUnavailable\(false\);/s, 'SIGNED_OUT clears the screen');
assert.match(source, /showsUnavailable\(unavailable, pathname\)/);
assert.match(source, /onSignOut=\{logout\}/);
assert.match(source, />\s*Se déconnecter\s*</);
assert.doesNotMatch(source.slice(source.indexOf('function ConnectionProblem')), /nouvel essai|automatique/i);
checks += 8;
console.log(`PASS browser profile resolution: failed read → retry screen without recovery, no row → recovery as before (${checks} checks)`);
