// Portal readiness (plan PRF-r2) unit and static checks; dependency-free, run by npm test.
// T-36: every API route exporting POST/PUT/PATCH/DELETE, directly or by re-export,
// calls the request-origin guard first or is an explicit exemption. T-37/T-38: the
// guard refuses a missing or foreign Origin (403) and a non-JSON body (415).
// T-35: portal e-mail notices use the fixed sender and no Reply-To; display names
// are sanitised. The REST and HTTP halves are scripts/test-portal-readiness.mjs.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestOriginRefusal, CROSS_ORIGIN_ERROR, CONTENT_TYPE_ERROR } from '../src/lib/http/requestOrigin.mjs';
import { portalNoticeEmail, senderAddress, staffEmailOptions } from '../src/lib/emailSender.mjs';
import { sanitizeDisplayName } from '../src/lib/displayName.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;

// ── T-37/T-38: the guard itself ─────────────────────────────────────────────
const APP = 'https://admin.english-hills.com';
const req = (headers) => new Request(APP + '/api/admin/invite', { method: 'POST', headers, body: '{}' });
const json = { 'content-type': 'application/json' };
assert.equal(requestOriginRefusal(req({ ...json, origin: APP })), null, 'same-origin JSON passes');
assert.equal(requestOriginRefusal(req({ 'content-type': 'application/json; charset=utf-8', origin: APP, 'sec-fetch-site': 'same-origin' })), null);
// The origin the browser targeted (scheme + Host), e.g. a local server reporting localhost in request.url.
const local = (headers) => new Request('http://localhost:3101/api/storage/sign', { method: 'POST', headers, body: '{}' });
assert.equal(requestOriginRefusal(local({ ...json, host: '127.0.0.1:3101', origin: 'http://127.0.0.1:3101' })), null);
assert.deepEqual(requestOriginRefusal(local({ ...json, host: '127.0.0.1:3101', origin: 'http://127.0.0.1:3999' })).status, 403);
assert.deepEqual(requestOriginRefusal(local({ ...json, host: '127.0.0.1:3101', origin: 'https://127.0.0.1:3101' })).status, 403);
checks += 3;
for (const [headers, label] of [
  [{ ...json }, 'missing Origin'],
  [{ ...json, origin: 'https://english-hills.com' }, 'the public site (same site, other origin)'],
  [{ ...json, origin: 'https://evil.example' }, 'a foreign origin'],
  [{ ...json, origin: 'null' }, 'an opaque origin'],
  [{ ...json, origin: APP, 'sec-fetch-site': 'same-site' }, 'Sec-Fetch-Site same-site'],
  [{ ...json, origin: APP, 'sec-fetch-site': 'cross-site' }, 'Sec-Fetch-Site cross-site'],
]) {
  assert.deepEqual(requestOriginRefusal(req(headers)), { status: 403, error: CROSS_ORIGIN_ERROR }, label);
  checks++;
}
for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonx', '']) {
  assert.deepEqual(requestOriginRefusal(req({ origin: APP, ...(type ? { 'content-type': type } : {}) })),
    { status: 415, error: CONTENT_TYPE_ERROR }, 'content type ' + (type || 'missing'));
  checks++;
}

// ── T-36: static coverage of every state-changing route ─────────────────────
// Exempt by design: they authenticate themselves (webhook signatures, scheduler
// bearers, the public origin policy, the internal CRM same-origin check).
const EXEMPT = [/^webhooks\//, /^cron\//, /^public\//, /^internal\/crm\//];
function routes(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? routes(path) : entry.name === 'route.js' ? [path] : [];
  });
}
// Follows `export { POST } from '...'` to the file that holds the handler.
function handlerSource(file, seen = new Set()) {
  if (seen.has(file)) throw new Error('re-export cycle at ' + file);
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  const reexport = text.match(/export\s*\{[^}]*\b(?:POST|PUT|PATCH|DELETE)\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/);
  if (!reexport) return text;
  const target = reexport[1].startsWith('@/') ? join(root, 'src', reexport[1].slice(2)) : resolve(dirname(file), reexport[1]);
  const candidates = [target, target + '.js', target + '.mjs', join(target, 'route.js')];
  const found = candidates.find(existsSync);
  assert.ok(found, 'unresolved re-export in ' + file);
  return handlerSource(found, seen);
}
const apiRoot = join(root, 'src', 'app', 'api');
const guarded = [];
const exempt = [];
for (const file of routes(apiRoot)) {
  const rel = relative(apiRoot, file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');
  if (!/export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b|export\s*\{[^}]*\b(?:POST|PUT|PATCH|DELETE)\b/.test(text)) continue;
  if (EXEMPT.some(pattern => pattern.test(rel))) { exempt.push(rel); continue; }
  const source = handlerSource(file);
  const guard = source.indexOf('rejectCrossOrigin(request)');
  assert.ok(guard > 0, `${rel} must call rejectCrossOrigin(request) or be an explicit exemption`);
  for (const later of ['getServerClient(', 'storageRequest(request', 'request.json(', 'readBoundedJson(']) {
    const at = source.indexOf(later, source.indexOf('export'));
    assert.ok(at === -1 || guard < at, `${rel}: the origin guard runs before ${later}`);
  }
  guarded.push(rel);
  checks++;
}
assert.deepEqual(guarded.sort(), ['admin/invite/route.js', 'admin/payroll/route.js', 'admin/update-role/route.js',
  'email/send/route.js', 'online/courses/activate/route.js', 'online/courses/close/route.js', 'online/join/route.js',
  'online/lessons/cancel/route.js', 'online/lessons/reschedule/route.js', 'storage/finalize/route.js', 'storage/sign/route.js'],
  'the D10 route list');
assert.ok(exempt.includes('internal/crm/intake/process/route.js') && exempt.includes('public/inscription/route.js')
  && exempt.some(r => r.startsWith('webhooks/')), 'the exemptions are the self-authenticating routes');
// The re-exported intake handler resolves to the meta handler, which keeps its own same-origin check.
assert.match(handlerSource(join(apiRoot, 'internal/crm/intake/process/route.js')), /request\.headers\.get\('origin'\) !== new URL\(request\.url\)\.origin/);
checks++;

// ── T-35: fixed sender, no personal Reply-To, sanitised names ──────────────
assert.equal(senderAddress('English Hills <notify@example.test>'), 'notify@example.test');
assert.equal(senderAddress('notify@example.test'), 'notify@example.test');
assert.equal(senderAddress(undefined), null);
const notice = portalNoticeEmail({ fromName: 'Parent de Sara', subject: 'Absence', body: 'Texte', sender: 'notify@example.test' });
assert.deepEqual(notice.options, { from: 'English Hills <notify@example.test>' }, 'portal notices: fixed sender, no Reply-To');
assert.match(notice.body, /^Bonjour,\n\nParent de Sara vous a envoyé un message/);
assert.equal(notice.subject, 'Nouveau message English Hills : Absence');
const forged = portalNoticeEmail({ fromName: 'Evil" <attacker@example.test>\r\nBcc: x@example.test', subject: 's', body: 'b', sender: 'n@example.test' });
assert.equal(forged.options.from, 'English Hills <n@example.test>');
assert.doesNotMatch(forged.body.split('\n\n')[1], /[<>"\r]|\nBcc/, 'the sender name cannot inject headers or addresses');
assert.deepEqual(staffEmailOptions({ profileName: 'Dir <x@example.test>', sender: 'n@example.test', office: 'office@example.test' }),
  { replyTo: 'office@example.test', from: 'Dir x@example.test <n@example.test>' }, 'staff: sanitised name, office Reply-To');
assert.deepEqual(staffEmailOptions({ profileName: '', sender: 'n@example.test', office: null, html: true }), { html: true });
assert.equal(sanitizeDisplayName('  A\u0000B\u007f"C"  <D>  '), 'ABC D');
const route = readFileSync(join(apiRoot, 'email/send/route.js'), 'utf8');
const portalBranch = route.slice(route.indexOf('PortalNoticeSchema.safeParse'));
assert.doesNotMatch(portalBranch.slice(0, portalBranch.indexOf('try {')), /parsed\.data\.to\b|replyTo/,
  'the portal branch never reads the caller\'s `to` nor sets a Reply-To');
checks += 8;

console.log(`PASS portal readiness unit: ${checks} checks (origin guard, ${guarded.length} guarded routes, ${exempt.length} exemptions, e-mail sender rules)`);
