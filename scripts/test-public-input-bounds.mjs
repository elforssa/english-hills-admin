// Public input bounds (audit COD-1/COD-2): request bodies are capped before parsing and
// validation failures return a fixed message on /api/email/send. The retired public
// registration route (plan Enrollment at payment, D4) answers 410 before any parsing:
// no body is read, however large or malformed. Dependency-free; run by npm test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server.js';
import { readBoundedJson } from '../src/lib/boundedJson.mjs';

const LIMIT = 32 * 1024;
const post = (body, headers = {}) => new Request('http://127.0.0.1/api', { method: 'POST', headers, body, duplex: 'half' });
const stream = bytes => new ReadableStream({ start(controller) {
  for (let sent = 0; sent < bytes; sent += 4096) controller.enqueue(new Uint8Array(Math.min(4096, bytes - sent)).fill(32));
  controller.close();
} });
assert.deepEqual(await readBoundedJson(post('{"a":1}'), 64), { data: { a: 1 } });
assert.deepEqual(await readBoundedJson(post('{"a":'), 64), { status: 400 });
assert.deepEqual(await readBoundedJson(post('{}', { 'content-length': String(LIMIT + 1) }), LIMIT), { status: 413 });
assert.deepEqual(await readBoundedJson(post(stream(LIMIT + 1)), LIMIT), { status: 413 }, 'streamed body capped without Content-Length');

const sendRoute = readFileSync(new URL('../src/app/api/email/send/route.js', import.meta.url), 'utf8');
assert.match(sendRoute, /readBoundedJson\(request, /, 'email/send caps the body');
assert.doesNotMatch(sendRoute, /request\.json\(|flatten\(|details:|error\.issues/, 'email/send never parses unbounded or echoes issues');

// The retired registration route: 410 with the fixed French message, body never read.
const source = readFileSync(new URL('../src/app/api/public/inscription/route.js', import.meta.url), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(source, /readBoundedJson|request\.json|request\.text|request\.body|request\.headers|zod/, 'nothing is parsed');
assert.match(source, /export async function POST\(\)/, 'the handler does not even take the request');
const POST = new Function('NextResponse', source.replace(/^import .*;\n/gm, '')
  .replace('export async function POST', 'async function POST') + '\nreturn POST;')(NextResponse);
for (const [body, headers] of [
  ['{', { 'content-type': 'application/json' }],
  [stream(LIMIT * 4), { 'content-type': 'application/json' }],
  ['{}', { 'content-type': 'text/plain', 'content-length': String(LIMIT * 4) }],
]) {
  const request = post(body, headers);
  const response = await POST(request);
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: 'Les inscriptions en ligne sont fermées. Contactez le centre.' });
  assert.equal(request.bodyUsed, false, 'the body is never read');
}
console.log('PASS public input bounds: capped bodies, fixed validation errors, retired registration answers 410 before parsing');
