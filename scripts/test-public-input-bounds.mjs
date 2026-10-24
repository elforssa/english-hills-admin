// Public input bounds (audit COD-1/COD-2): the anonymous inscription schema is strict,
// request bodies are capped before parsing, and validation failures return a fixed
// message on /api/public/inscription and /api/email/send. Dependency-free; run by npm test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InscriptionSchema, INSCRIPTION_BODY_LIMIT } from '../src/lib/publicInscription.mjs';
import { readBoundedJson } from '../src/lib/boundedJson.mjs';

const valid = { full_name: 'Synthetic Learner', telephone: '0600000000', email: 'learner@example.test', consent: true,
  idempotency_key: '00000000-0000-4000-8000-000000000001' };
assert.equal(InscriptionSchema.safeParse(valid).success, true);
// zod 4 .uuid() is RFC-strict; z.guid() keeps the zod 3 hex-format acceptance.
assert.equal(InscriptionSchema.safeParse({ ...valid, idempotency_key: '11111111-1111-1111-1111-111111111111' }).success, true);

// documents_urls is no longer part of the schema; strict mode refuses it (and any
// other unknown key) with one issue, however large the array.
const forged = InscriptionSchema.safeParse({ ...valid, documents_urls: Array(100_000).fill(0) });
assert.equal(forged.success, false);
assert.ok(forged.error.issues.length <= 2 && JSON.stringify(forged.error.issues).length < 1024, 'bounded issue list');
assert.equal(InscriptionSchema.safeParse({ ...valid, extra: 'x' }).success, false, 'unknown keys refused');

const consent = InscriptionSchema.safeParse({ ...valid, consent: false });
assert.equal(consent.error.issues.find(issue => issue.path[0] === 'consent')?.message,
  'Consentement requis pour soumettre le formulaire.', 'zod 4 custom consent message kept');

const post = (body, headers = {}) => new Request('http://127.0.0.1/api', { method: 'POST', headers, body, duplex: 'half' });
const stream = bytes => new ReadableStream({ start(controller) {
  for (let sent = 0; sent < bytes; sent += 4096) controller.enqueue(new Uint8Array(Math.min(4096, bytes - sent)).fill(32));
  controller.close();
} });
assert.deepEqual(await readBoundedJson(post('{"a":1}'), 64), { data: { a: 1 } });
assert.deepEqual(await readBoundedJson(post('{"a":'), 64), { status: 400 });
assert.deepEqual(await readBoundedJson(post('{}', { 'content-length': String(INSCRIPTION_BODY_LIMIT + 1) }), INSCRIPTION_BODY_LIMIT), { status: 413 });
assert.deepEqual(await readBoundedJson(post(stream(INSCRIPTION_BODY_LIMIT + 1)), INSCRIPTION_BODY_LIMIT), { status: 413 }, 'streamed body capped without Content-Length');

for (const path of ['../src/app/api/public/inscription/route.js', '../src/app/api/email/send/route.js']) {
  const route = readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(route, /readBoundedJson\(request, /, `${path} caps the body`);
  assert.doesNotMatch(route, /request\.json\(|flatten\(|details:|error\.issues/, `${path} never parses unbounded or echoes issues`);
}
console.log('PASS public input bounds: strict inscription schema, capped bodies, fixed validation errors');
