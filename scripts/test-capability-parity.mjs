// The one capability list (plan RPW-r2, ADR-018): CAPABILITIES in src/lib/roleAccess.mjs
// and operational_security.capability_roles() carry the same names and role lists.
import assert from 'node:assert/strict';
import { CAPABILITIES, hasCapability } from '../src/lib/roleAccess.mjs';
import { ROLES, sqlJson } from './lib/receptionist-catalog.mjs';

const database = sqlJson(`select coalesce(json_object_agg(capability, roles order by capability), '{}')
  from operational_security.capability_roles()`);
const js = Object.fromEntries(Object.entries(CAPABILITIES).map(([name, c]) => [c.sql, { name, roles: c.roles }]));

assert.equal(new Set(Object.values(CAPABILITIES).map(c => c.sql)).size, Object.keys(CAPABILITIES).length, 'each JS entry names a distinct database capability');
assert.deepEqual(Object.keys(database).sort(), Object.keys(js).sort(), 'capability names differ between JS and SQL');
const cases = [];
for (const [capability, { name, roles }] of Object.entries(js)) {
  assert.deepEqual([...database[capability]].sort(), [...roles].sort(), `${capability}: role lists differ`);
  for (const role of ROLES) cases.push({ role, capability, expected: hasCapability(role, name) });
}
// The database answer itself, through the function every command calls.
const answers = sqlJson(`select json_agg(operational_security.role_has_capability(c->>'role', c->>'capability') order by ord)
  from jsonb_array_elements('${JSON.stringify(cases).replace(/'/g, "''")}'::jsonb) with ordinality as t(c, ord)`);
cases.forEach((c, i) => assert.equal(answers[i], c.expected, `${c.role} / ${c.capability}`));
// Unknown names and roles are refused on both sides.
assert.equal(hasCapability('admin', 'toString'), false);
assert.equal(sqlJson(`select to_json(operational_security.role_has_capability('director', 'no_such_capability'))`), false);
assert.equal(sqlJson(`select to_json(operational_security.role_has_capability(null, 'manage_crm'))`), false);
// has_capability keeps its 096 shape: definer, fixed search_path, no API grant.
const shape = sqlJson(`select json_build_object('definer', p.prosecdef, 'config', p.proconfig,
    'auth', has_function_privilege('authenticated', p.oid, 'execute'), 'anon', has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p where p.oid = 'operational_security.has_capability(text)'::regprocedure`);
assert.deepEqual(shape, { definer: true, config: ['search_path=pg_catalog, pg_temp'], auth: false, anon: false });
console.log(`PASS capability parity (${Object.keys(js).length} capabilities x ${ROLES.length} roles)`);
