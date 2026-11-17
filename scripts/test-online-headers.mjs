// Response headers per path (plan OL-r6 adapter addendum, decisions A6 and A7): only the
// online lesson room may use the camera and microphone and reach the Zoom hosts; every
// other path keeps the global headers; the room entry sits after the catch-all so its
// values win; connect-src admits the zoom.us hosts (A7-record: Zoom's regional signalling
// hosts are chosen per session, so they cannot be listed), and nothing else changes.
// Whiteboard (plan online-classroom-tools.md, OCT-r3, D2 and the owner's S1 decision of
// 2026-11-15): the room path's script-src and style-src gain exactly two path-scoped
// whiteboard sources (the Production host and the development key's host), connect-src
// gains blob:, script-src never has blob:, worker-src is what it is on main, no wildcard
// in script-src, style-src or worker-src, and the catch-all policy is unchanged.
// Evaluates next.config.mjs the way Next.js does, as the Production build and as a
// development build. Run by npm test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import config, { GLOBAL_PERMISSIONS_POLICY, ROOM_PERMISSIONS_POLICY, ZOOM_CONNECT_HOSTS, ZOOM_SCRIPT_HOSTS, ZOOM_WHITEBOARD_SOURCES } from '../next.config.mjs';

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
  // A7-record: zoom.us hosts over https and wss in connect-src only; no zoom.com; script and
  // worker sources stay explicit (source.zoom.us); no Zoom host in frame-src, style-src or form-action.
  assert.ok(csp['connect-src'].includes('https://*.zoom.us') && csp['connect-src'].includes('wss://*.zoom.us'));
  assert.ok(!h['Content-Security-Policy'].includes('zoom.com'), 'no zoom.com host');
  assert.ok(!csp['script-src'].includes('*.zoom.us') && !csp['worker-src'].includes('*.zoom.us'), 'script and worker sources stay explicit');
  for (const directive of ['frame-src', 'form-action', 'default-src', 'font-src', 'img-src', 'base-uri', 'object-src']) assert.ok(!csp[directive].includes('zoom'), directive);
  assert.ok(!/Cross-Origin-(Opener|Embedder)-Policy/.test(Object.keys(h).join(' ')), 'no COOP/COEP in the pilot');
}
// The room entry itself sets only the two headers it overrides.
assert.deepEqual(room.headers.map(h => h.key).sort(), ['Content-Security-Policy', 'Permissions-Policy']);
assert.equal(header(rules[0], 'Permissions-Policy'), GLOBAL_PERMISSIONS_POLICY);

// ---- Whiteboard sources (OCT-r3 D2, S1 decision of 2026-11-15) ----
// The two approved sources, written here on purpose: a change to the list in
// next.config.mjs must change this test too, and needs a new owner decision.
const WHITEBOARD = ['https://us04st1.zoom.us/web_client_whiteboard/', 'https://us05st1.zoom.us/web_client_whiteboard/'];
assert.deepEqual(ZOOM_WHITEBOARD_SOURCES, WHITEBOARD, 'exactly the Production source and the development-key source');
// What `main` shipped before PR A (00e9756), per build; PR A may differ from it only by
// the additions listed below.
const MAIN = {
  production: {
    global: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://challenges.cloudflare.com https://*.ingest.de.sentry.io https://*.sentry.io; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' https://challenges.cloudflare.com; upgrade-insecure-requests",
    room: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com 'wasm-unsafe-eval' https://source.zoom.us; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://challenges.cloudflare.com https://*.ingest.de.sentry.io https://*.sentry.io https://zoom.us https://*.zoom.us wss://*.zoom.us; media-src 'self' blob: https://st1.zoom.us; worker-src 'self' blob: https://source.zoom.us; frame-src 'self' https://challenges.cloudflare.com; upgrade-insecure-requests",
  },
};
const split = policy => Object.fromEntries(policy.split('; ').map(d => [d.split(' ')[0], d.split(' ').slice(1)]));
function checkWhiteboard(policies, label, main) {
  const global = split(policies.global), roomCsp = split(policies.room);
  // The catch-all: no whiteboard source, no Zoom host, and byte-for-byte what main sent.
  assert.ok(!policies.global.includes('zoom') && !policies.global.includes('web_client_whiteboard'), `${label}: the catch-all has no Zoom source`);
  assert.ok(!global['connect-src'].includes('blob:') && !global['script-src'].includes('blob:'), `${label}: the catch-all gains no blob:`);
  if (main) assert.equal(policies.global, main.global, `${label}: the catch-all policy is byte-for-byte unchanged`);
  // script-src and style-src: the two sources, each once, and no other Zoom source than
  // the library host that was already there.
  for (const directive of ['script-src', 'style-src']) {
    for (const source of WHITEBOARD) assert.equal(roomCsp[directive].filter(s => s === source).length, 1, `${label}: ${directive} has ${source} once`);
    const zoomSources = roomCsp[directive].filter(s => s.includes('zoom'));
    assert.deepEqual(zoomSources, directive === 'script-src' ? ['https://source.zoom.us', ...WHITEBOARD] : WHITEBOARD, `${label}: ${directive} has no other Zoom source`);
    assert.deepEqual(roomCsp[directive].filter(s => !global[directive].includes(s)), directive === 'script-src' ? ["'wasm-unsafe-eval'", 'https://source.zoom.us', ...WHITEBOARD] : WHITEBOARD,
      `${label}: ${directive} differs from the catch-all by the approved sources only`);
  }
  // A7 as kept by D2: no blob: in script-src; no wildcard in script-src, style-src or worker-src.
  assert.ok(!roomCsp['script-src'].some(s => s.startsWith('blob')), `${label}: no blob: in script-src`);
  assert.ok(!roomCsp['script-src'].some(s => /^(data|filesystem|https?|wss?):?$/.test(s)), `${label}: no bare scheme in script-src`);
  for (const directive of ['script-src', 'style-src', 'worker-src']) assert.ok(!roomCsp[directive].some(s => s.includes('*')), `${label}: no wildcard in ${directive}`);
  // Path-scoped: each source ends with the whiteboard path and a slash, on an exact host.
  for (const source of WHITEBOARD) assert.match(source, /^https:\/\/us0[45]st1\.zoom\.us\/web_client_whiteboard\/$/);
  // worker-src: exactly what main has.
  assert.deepEqual(roomCsp['worker-src'], ["'self'", 'blob:', 'https://source.zoom.us'], `${label}: worker-src unchanged`);
  // connect-src gains blob: and nothing else.
  assert.deepEqual(roomCsp['connect-src'].filter(s => !global['connect-src'].includes(s)), [...ZOOM_CONNECT_HOSTS, 'blob:'], `${label}: connect-src gains the Zoom hosts (A7) and blob: only`);
  // Every other directive of the room policy is the catch-all's, except media-src (A6).
  for (const directive of Object.keys(roomCsp)) if (!['script-src', 'style-src', 'connect-src', 'worker-src', 'media-src'].includes(directive)) assert.deepEqual(roomCsp[directive], global[directive], `${label}: ${directive} unchanged`);
  assert.deepEqual(Object.keys(roomCsp), Object.keys(global), `${label}: same directives in the same order`);
  if (main) {
    // Against main's room policy: the three additions and nothing else.
    const before = split(main.room);
    for (const directive of Object.keys(roomCsp)) {
      const added = roomCsp[directive].filter(s => !before[directive].includes(s));
      assert.deepEqual(added, { 'script-src': WHITEBOARD, 'style-src': WHITEBOARD, 'connect-src': ['blob:'] }[directive] || [], `${label}: ${directive} gains only the approved additions over main`);
      assert.deepEqual(before[directive].filter(s => !roomCsp[directive].includes(s)), [], `${label}: ${directive} loses nothing`);
    }
    assert.equal(policies.room.split('; ').find(d => d.startsWith('worker-src ')), main.room.split('; ').find(d => d.startsWith('worker-src ')), `${label}: worker-src byte-for-byte as on main`);
  }
}
// This process: whatever build mode npm test runs in.
checkWhiteboard({ global: header(rules[0], 'Content-Security-Policy'), room: header(room, 'Content-Security-Policy') }, 'this build');
// The Production build and a development build, each evaluated in its own process (the
// configuration reads NODE_ENV when it is imported).
const evaluate = env => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
  `const { default: config } = await import(${JSON.stringify(new URL('../next.config.mjs', import.meta.url).href)});
   const rules = await config.headers();
   const value = source => rules.find(rule => rule.source === source).headers.find(h => h.key === 'Content-Security-Policy').value;
   console.log(JSON.stringify({ global: value('/(.*)'), room: value('/online/room/:path*') }));`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', ...env } }).trim().split('\n').pop());
const production = evaluate({ NODE_ENV: 'production' });
checkWhiteboard(production, 'Production build', MAIN.production);
assert.ok(!production.room.includes("'unsafe-eval'") && !production.room.includes('127.0.0.1'));
assert.equal(production.room, "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com 'wasm-unsafe-eval' https://source.zoom.us https://us04st1.zoom.us/web_client_whiteboard/ https://us05st1.zoom.us/web_client_whiteboard/; style-src 'self' 'unsafe-inline' https://us04st1.zoom.us/web_client_whiteboard/ https://us05st1.zoom.us/web_client_whiteboard/; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://challenges.cloudflare.com https://*.ingest.de.sentry.io https://*.sentry.io https://zoom.us https://*.zoom.us wss://*.zoom.us blob:; media-src 'self' blob: https://st1.zoom.us; worker-src 'self' blob: https://source.zoom.us; frame-src 'self' https://challenges.cloudflare.com; upgrade-insecure-requests",
  'the Production room policy, in full');
checkWhiteboard(evaluate({ NODE_ENV: 'development' }), 'development build');
console.log('PASS online room whiteboard sources: two path-scoped sources in script-src and style-src, blob: in connect-src only, worker-src as on main, no wildcard, catch-all unchanged');
// [Reliability PR] /online/meeting/<lesson> is reserved for the Zoom Meeting SDK room (plan
// online-room-reliability.md, section 6, D14): outside /online/room/*, it carries exactly
// the catch-all headers today, and no rule names it.
{
  const catchAll = Object.fromEntries(rules[0].headers.map(h => [h.key, h.value]));
  for (const path of ['/online/meeting/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b', '/online/meeting', '/online/meeting/x/y'])
    assert.deepEqual(effective(path), catchAll, `${path}: the catch-all headers only`);
  assert.ok(!rules.some(rule => rule.source.includes('meeting')), 'no header rule for the reserved path yet');
  assert.ok(!/online\/meeting/.test(readFileSync(new URL('../src/middleware.js', import.meta.url), 'utf8')), 'the middleware does not name it either');
}

console.log('PASS online room headers: camera, microphone and the Zoom hosts on /online/room/* only; global headers elsewhere; no COOP/COEP; script and worker sources explicit; /online/meeting/* reserved with the catch-all headers only');
