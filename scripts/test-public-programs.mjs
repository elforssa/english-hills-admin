// Public programme subset (plan online-learning.md I5, owner decision Q15 = A): the
// anonymous /inscription form and /api/public/inscription accept exactly today's eight
// programmes; the two online types stay reception-only. Dependency-free; run by npm test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SESSION_TYPES, PUBLIC_SESSION_TYPES, ONLINE_SESSION_TYPES, LEVELS_BY_SESSION, isOnlineSessionType } from '../src/lib/programCatalog.mjs';
import { InscriptionSchema } from '../src/lib/publicInscription.mjs';

assert.deepEqual(ONLINE_SESSION_TYPES, ['Online', 'Online One-to-One']);
assert.deepEqual(PUBLIC_SESSION_TYPES, SESSION_TYPES.filter(s => !ONLINE_SESSION_TYPES.includes(s)));
assert.deepEqual(PUBLIC_SESSION_TYPES, ['Yearly', 'Adults', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One', 'Mise à niveau', 'Other']);
assert.ok(ONLINE_SESSION_TYPES.every(s => SESSION_TYPES.includes(s)), 'staff screens offer both online types');
assert.ok(ONLINE_SESSION_TYPES.every(s => LEVELS_BY_SESSION[s].join() === 'A1,A2,B1,B2,C1,C2'), 'Q3 = A: CEFR levels');
assert.equal(isOnlineSessionType('Online'), true);
assert.equal(isOnlineSessionType('One-to-One'), false);

const valid = { full_name: 'Synthetic Learner', telephone: '0600000000', email: 'learner@example.test', consent: true,
  idempotency_key: '00000000-0000-4000-8000-000000000001' };
for (const session of ONLINE_SESSION_TYPES) {
  const parsed = InscriptionSchema.safeParse({ ...valid, session_type: session });
  assert.equal(parsed.success, false, `${session} refused by the public schema`);
  assert.ok(parsed.error.issues.some(issue => issue.path.join('.') === 'session_type'), `${session} refused on session_type`);
}
assert.equal(InscriptionSchema.safeParse({ ...valid, session_type: 'Adults' }).success, true, 'Adults accepted');
assert.equal(InscriptionSchema.safeParse({ ...valid, session_type: 'Adults', niveau_cefr: 'Beginning 1' }).success, true);
assert.equal(InscriptionSchema.safeParse({ ...valid }).success, true, 'no programme still accepted');

// The public page and route consume the public subset, never the full list.
const page = readFileSync(new URL('../src/app/inscription/page.jsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/app/api/public/inscription/route.js', import.meta.url), 'utf8');
assert.match(page, /PUBLIC_SESSION_TYPES\.map/);
assert.doesNotMatch(page.replaceAll('PUBLIC_SESSION_TYPES', ''), /SESSION_TYPES/);
assert.match(route, /import \{ InscriptionSchema\b[^}]*\} from '@\/lib\/publicInscription\.mjs'/);
assert.doesNotMatch(route, /SESSION_TYPES/);
console.log('PASS public programme subset: online types refused by the public form and API, accepted by staff screens');
