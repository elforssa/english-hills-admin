// Response headers per path (plan OL-r6 adapter addendum, decisions A6 and A7): only the
// online lesson room may use the camera and microphone and reach the Zoom hosts; every
// other path keeps the global headers; the room entry sits after the catch-all so its
// values win; the Zoom hosts are explicit, never a wildcard that would admit the
// toolkit's telemetry host. Evaluates next.config.mjs the way Next.js does. Run by npm test.
import assert from 'node:assert/strict';
import config, { GLOBAL_PERMISSIONS_POLICY, ROOM_PERMISSIONS_POLICY, ZOOM_CONNECT_HOSTS, ZOOM_SCRIPT_HOSTS } from '../next.config.mjs';

const rules = await config.headers();
assert.equal(rules[0].source, '/(.*)', 'the catch-all comes first');
const room = rules.find(rule => rule.source === '/online/room/:path*');
assert.ok(room, 'a room-path entry exists');
assert.ok(rules.indexOf(room) > 0, 'the room entry comes after the catch-all, so its values win');
const header = (rule, key) => rule.headers.find(h => h.key === key)?.value;

// Next.js applies every matching rule in order; the later value wins for the same key.
function effective(path) {
  const result = {};
  for (const rule of rules) {
    const pattern = rule.source === '/(.*)' ? /.*/ : new RegExp('^' + rule.source.replace(':path*', '.*') + '$');
    if (pattern.test(path)) for (const h of rule.headers) result[h.key] = h.value;
  }
  return result;
}

// Global paths: camera and microphone blocked, no Zoom host, no wasm-unsafe-eval.
for (const path of ['/', '/login', '/dashboard', '/students', '/online', '/online/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
  '/student-portal/online', '/parent-portal/online', '/teacher-portal/online', '/teacher-portal/online/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b', '/api/online/join']) {
  const h = effective(path);
  assert.equal(h['Permissions-Policy'], GLOBAL_PERMISSIONS_POLICY, path);
  assert.ok(!h['Content-Security-Policy'].includes('zoom.us') && !h['Content-Security-Policy'].includes('wasm-unsafe-eval'), `${path}: no Zoom host or wasm in the global CSP`);
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.ok(h['Strict-Transport-Security']);
}

// The room path: camera and microphone for the document itself, the Zoom hosts, wasm, and
// every other global header kept.
for (const path of ['/online/room/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b', '/online/room/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b?student=3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0c'.split('?')[0]]) {
  const h = effective(path);
  assert.equal(h['Permissions-Policy'], ROOM_PERMISSIONS_POLICY, path);
  assert.equal(h['Permissions-Policy'], 'camera=(self), microphone=(self), geolocation=()');
  const csp = Object.fromEntries(h['Content-Security-Policy'].split('; ').map(d => [d.split(' ')[0], d]));
  assert.ok(csp['script-src'].includes("'wasm-unsafe-eval'"), 'wasm allowed for the SDK');
  for (const host of ZOOM_SCRIPT_HOSTS) { assert.ok(csp['script-src'].includes(host)); assert.ok(csp['worker-src'].includes(host)); }
  for (const host of ZOOM_CONNECT_HOSTS) assert.ok(csp['connect-src'].includes(host), host);
  assert.ok(csp['media-src'].includes('https://st1.zoom.us'));
  assert.equal(csp['frame-ancestors'], "frame-ancestors 'none'");
  assert.equal(csp['object-src'], "object-src 'none'");
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.ok(h['Strict-Transport-Security'] && h['X-Content-Type-Options']);
  // A7-block: explicit https hosts only; the telemetry host is not admitted by any directive.
  assert.ok(!h['Content-Security-Policy'].includes('https://*.zoom.us'), 'no https wildcard over zoom.us');
  assert.ok(!h['Content-Security-Policy'].includes('zoom.com'), 'no zoom.com host');
  assert.ok(!h['Content-Security-Policy'].includes('telemetry'), 'telemetry host never listed');
  assert.ok(!/Cross-Origin-(Opener|Embedder)-Policy/.test(Object.keys(h).join(' ')), 'no COOP/COEP in the pilot');
}
// The room entry itself sets only the two headers it overrides.
assert.deepEqual(room.headers.map(h => h.key).sort(), ['Content-Security-Policy', 'Permissions-Policy']);
assert.equal(header(rules[0], 'Permissions-Policy'), GLOBAL_PERMISSIONS_POLICY);
console.log('PASS online room headers: camera, microphone and the explicit Zoom hosts on /online/room/* only; global headers elsewhere; no COOP/COEP; telemetry host not admitted');
