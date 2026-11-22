// Her online and teacher-portal access is reproduced, not changed (plan RPW-r2): every
// online function and policy equals its 53c486b value, and the online capabilities and
// routes in roleAccess.mjs keep their roles. Changing any of them is a separate decision.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAPABILITIES, hasCapability, receptionistCanAccess, isOnlineRoomPath, loginDestination } from '../src/lib/roleAccess.mjs';
import { sqlJson } from './lib/receptionist-catalog.mjs';

const pinned = JSON.parse(readFileSync(new URL('./fixtures/receptionist-online-pinned.json', import.meta.url), 'utf8'));
const live = sqlJson(`select jsonb_build_object(
  'functions', (select jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
      jsonb_build_object('src_md5', md5(p.prosrc), 'definer', p.prosecdef, 'config', coalesce(array_to_string(p.proconfig, ','), ''),
        'acl', coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '')))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname like 'online\\_%') or n.nspname='online_security'),
  'policies', (select jsonb_object_agg(tablename||'.'||policyname,
      jsonb_build_object('cmd', cmd, 'permissive', permissive, 'roles', array_to_string(roles, ','),
        'qual', regexp_replace(coalesce(qual,''), '\\s+', ' ', 'g'), 'with_check', regexp_replace(coalesce(with_check,''), '\\s+', ' ', 'g')))
    from pg_policies where schemaname='public' and tablename like 'online\\_%'))`);
assert.deepEqual(Object.keys(live.functions).sort(), Object.keys(pinned.functions).sort(), 'online functions added or removed');
for (const [name, value] of Object.entries(pinned.functions)) assert.deepEqual(live.functions[name], value, `${name} changed`);
assert.deepEqual(live.policies, pinned.policies, 'online policies changed');

// The two online capabilities keep their 53c486b roles.
assert.deepEqual(CAPABILITIES.canManageOnlineLessons.roles, ['director', 'admin', 'receptionist']);
assert.deepEqual(CAPABILITIES.canManageOnlineCourses.roles, ['director', 'admin']);
assert.equal(hasCapability('receptionist', 'canManageOnlineLessons'), true);
assert.equal(hasCapability('receptionist', 'canManageOnlineCourses'), false);
// Her online routes: exactly the three of 53c486b; the room shape is unchanged.
const id = '11111111-2222-4333-8444-555555555555';
for (const path of ['/online', `/online/${id}`, `/online/room/${id}`]) assert.equal(receptionistCanAccess(path), true, path);
assert.equal(isOnlineRoomPath(`/online/room/${id}`), true);
for (const path of [`/online/${id}/edit`, '/online/new', `/online/room/${id}/x`, '/online/room']) assert.equal(receptionistCanAccess(path), false, path);
// Teacher, parent and student portals stay closed to her.
for (const path of ['/teacher-portal', '/teacher-portal/online', `/teacher-portal/online/${id}`, '/parent-portal',
  '/parent-portal/online', '/student-portal', '/student-portal/online']) {
  assert.equal(receptionistCanAccess(path), false, path);
  assert.equal(loginDestination('receptionist', path), '/crm/leads', path);
}
console.log(`PASS receptionist online and teacher-portal access pinned (${Object.keys(live.functions).length} functions, ${Object.keys(live.policies).length} policies)`);
