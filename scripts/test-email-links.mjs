// E-mail links that work (plan ELW-r3, ADR-017): unit and source checks, no database.
//   node scripts/test-email-links.mjs
// Parameter parsing and the closed lists; the routing table (type × activation mark ×
// role); the classification of real auth-js errors from a stub Auth server; the same
// answer on both request forms (B5); the Sentry and Speed Insights filters (B4); the
// invite route's re-invitation send (D2) with its Supabase clients stubbed; and source
// scans for rule L1, shouldCreateUser: false and the four templates.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import {
  LINK_TYPES, parseLinkParams, isActivated, destinationFor, routeAfterVerify, classifyVerifyError,
  MESSAGES, requestOutcome, requestMessage, isSamePassword, passwordErrorMessage, parseLoginMode,
  parseLoginError, LOGIN_MODES, REQUEST_COOLDOWN_SECONDS,
} from '../src/lib/authLinks.mjs';
import { ROLE_HOME } from '../src/lib/roleAccess.mjs';
import { scrubRoute, scrubVitalEvent } from '../src/lib/rumScrub.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
let checks = 0;
const TOKEN = 'a3f1c9e0b2d84f6a9c1e7b5d3f0a2c4e6b8d0f1a3c5e7b9d1f3a5c7e';

// ── 1. Parameter parsing ────────────────────────────────────────────────────
const params = (query) => new URLSearchParams(query);
assert.deepEqual([...LINK_TYPES], ['invite', 'email', 'magiclink', 'recovery']);
for (const type of LINK_TYPES) {
  assert.deepEqual(parseLinkParams(params(`token_hash=${TOKEN}&type=${type}`)), { tokenHash: TOKEN, type }); checks++;
}
assert.deepEqual(parseLinkParams(params('token_hash=pkce_abc-DEF_123&type=email')), { tokenHash: 'pkce_abc-DEF_123', type: 'email' });
assert.deepEqual(parseLinkParams(params(`token_hash=${'a'.repeat(200)}&type=invite`)).tokenHash.length, 200);
checks += 2;
for (const query of [
  '', `token_hash=${TOKEN}`, `type=invite`, `token_hash=&type=invite`, `token_hash=${'a'.repeat(201)}&type=invite`,
  'token_hash=a%20b&type=invite', 'token_hash=../x&type=invite', 'token_hash=a/b&type=invite', 'token_hash=a.b&type=invite',
  'token_hash=a%2Fb&type=invite', `token_hash=${TOKEN}&type=signup`, `token_hash=${TOKEN}&type=Invite`,
  `token_hash=${TOKEN}&type=email_change`, `token_hash=${TOKEN}&type=`, `token_hash=${TOKEN}&type=invite%00`,
]) {
  assert.equal(parseLinkParams(params(query)), null, query); checks++;
}
assert.equal(parseLinkParams(null), null); checks++;
// A destination parameter is never part of the parse, plain or hostile.
for (const next of ['/students', '//evil.example', '/\\evil.example', '%2F%2Fevil.example', 'https://evil.example', '/%2e%2e/x']) {
  const parsed = parseLinkParams(params(`token_hash=${TOKEN}&type=invite&next=${encodeURIComponent(next)}&returnTo=${encodeURIComponent(next)}`));
  assert.deepEqual(Object.keys(parsed).sort(), ['tokenHash', 'type']);
  assert.ok(!JSON.stringify(parsed).includes('evil')); checks++;
}
assert.deepEqual([...LOGIN_MODES], ['password', 'link', 'reset']);
for (const mode of LOGIN_MODES) { assert.equal(parseLoginMode(mode), mode); checks++; }
for (const raw of [null, '', 'magic', 'RESET', 'reset ', '<script>', 'link/x']) { assert.equal(parseLoginMode(raw), null, String(raw)); checks++; }
for (const raw of ['callback_failed', 'missing_code']) {
  assert.deepEqual(parseLoginError(raw), { message: MESSAGES.callbackFailed, mode: 'link' }); checks++;
}
for (const raw of [null, '', 'unknown', 'toString', '__proto__', 'constructor', '<b>x</b>', 'callback_failed ']) {
  assert.equal(parseLoginError(raw), null, String(raw)); checks++;
}
assert.equal(REQUEST_COOLDOWN_SECONDS, 60); checks++;
console.log('PASS link, mode and error parameters are closed lists; no destination parameter is read');

// ── 2. Routing table (section 1) ────────────────────────────────────────────
const ROLES = ['pending', ...Object.keys(ROLE_HOME)];
for (const role of ROLES) {
  assert.equal(destinationFor(role), ROLE_HOME[role] || '/unauthorized'); checks++;
}
assert.equal(destinationFor('pending'), '/unauthorized');
assert.equal(destinationFor(null), '/unauthorized');
assert.equal(destinationFor('unknown'), '/unauthorized');
checks += 3;
for (const blank of [null, undefined, {}, { full_name: null }, { full_name: '' }, { full_name: '   ' }, { full_name: 42 }]) {
  assert.equal(isActivated(blank), false, JSON.stringify(blank)); checks++;
}
assert.equal(isActivated({ full_name: 'Amal B' }), true); checks++;
for (const type of LINK_TYPES) {
  for (const role of ROLES) {
    // No mark: always the activation form, never apply_pending_role() first (B2), whatever the role.
    assert.deepEqual(routeAfterVerify(type, { full_name: '', role }), { step: 'activation', applyPendingRole: false }, `${type} ${role}`);
    assert.deepEqual(routeAfterVerify(type, null), { step: 'activation', applyPendingRole: false });
    const marked = routeAfterVerify(type, { full_name: 'Amal B', role });
    const expected = type === 'invite' ? { step: 'destination', applyPendingRole: false }
      : type === 'recovery' ? { step: 'new-password', applyPendingRole: false }
        : { step: 'destination', applyPendingRole: true };
    assert.deepEqual(marked, expected, `${type} ${role} marked`);
    checks += 3;
  }
}
assert.throws(() => routeAfterVerify('signup', { full_name: 'x' })); checks++;
console.log('PASS routing table: no mark → activation form without apply_pending_role(); mark → new password or the stored role\'s destination');

// ── 3. Real auth-js errors from a stub Auth server ──────────────────────────
let script = { status: 200, body: {} };
const seen = [];
const stub = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  seen.push(`${req.method} ${new URL(req.url, 'http://x').pathname}`);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'u1', aud: 'authenticated', email: 'u1@example.invalid' }));
    return;
  }
  res.writeHead(script.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(script.body));
});
stub.listen(0, '127.0.0.1'); await once(stub, 'listening');
const stubUrl = `http://127.0.0.1:${stub.address().port}`;
const closed = createServer(); closed.listen(0, '127.0.0.1'); await once(closed, 'listening');
const closedUrl = `http://127.0.0.1:${closed.address().port}`;
await new Promise((resolve) => closed.close(resolve));
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const client = (url) => createClient(url, 'anon-test-key', {
  auth: { flowType: 'pkce', storage: memory(), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});
// auth-js logs the deliberate "no answer" cases to stderr; keep the output readable.
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const answer = (status, body = {}) => { script = { status, body }; };
const apiError = (status, code, msg) => ({ code: status, error_code: code, msg });

try {
  // Verification: 4xx → used; no answer, 5xx, 429 → connection (the token stays usable).
  for (const [status, body, expected] of [
    [403, apiError(403, 'otp_expired', 'Email link is invalid or has expired'), 'used'],
    [400, apiError(400, 'validation_failed', 'bad'), 'used'],
    [422, apiError(422, 'unexpected', 'x'), 'used'],
    [404, apiError(404, 'not_found', 'x'), 'used'],
    [429, apiError(429, 'over_request_rate_limit', 'slow down'), 'connection'],
    [500, apiError(500, 'unexpected_failure', 'x'), 'connection'],
    [502, { message: 'bad gateway' }, 'connection'],
    [503, { message: 'unavailable' }, 'connection'],
  ]) {
    answer(status, body);
    const { error } = await client(stubUrl).auth.verifyOtp({ token_hash: TOKEN, type: 'invite' });
    assert.ok(error, `verify ${status} fails`);
    assert.equal(classifyVerifyError(error), expected, `verify ${status}`); checks++;
  }
  {
    const { error } = await quiet(() => client(closedUrl).auth.verifyOtp({ token_hash: TOKEN, type: 'invite' }));
    assert.equal(error.status, 0);
    assert.equal(classifyVerifyError(error), 'connection'); checks++;
  }
  console.log('PASS verify errors: used/expired/invalid → used-link screen; no answer, 5xx, 429 → connection (token kept)');

  // Both request forms (B5): every answer → the same sentence; only a rejected fetch differs.
  const forms = {
    link: (sb) => sb.auth.signInWithOtp({ email: 'x@example.invalid', options: { emailRedirectTo: 'http://127.0.0.1/login/callback', shouldCreateUser: false } }),
    reset: (sb) => sb.auth.resetPasswordForEmail('x@example.invalid', { redirectTo: 'http://127.0.0.1/login/callback' }),
  };
  for (const [name, send] of Object.entries(forms)) {
    const texts = new Set();
    for (const [status, body] of [
      [200, {}], [400, apiError(400, 'otp_disabled', 'Signups not allowed for otp')],
      [422, apiError(422, 'email_address_invalid', 'Email address is invalid')],
      [429, apiError(429, 'over_email_send_rate_limit', 'For security purposes, you can only request this after 57 seconds.')],
      [500, apiError(500, 'unexpected_failure', 'Error sending magic link email')],
    ]) {
      answer(status, body);
      let error = null;
      try { ({ error } = await send(client(stubUrl))); } catch (thrown) { error = thrown; }
      if (status !== 200) assert.ok(error, `${name} ${status} is an error`);
      assert.equal(requestOutcome(error), 'sent', `${name} ${status}`);
      texts.add(requestMessage(error)); checks++;
    }
    assert.deepEqual([...texts], [MESSAGES.requestSent], `${name}: one sentence for every answer`);
    let error = null;
    try { ({ error } = await quiet(() => send(client(closedUrl)))); } catch (thrown) { error = thrown; }
    assert.equal(requestOutcome(error), 'connection');
    assert.equal(requestMessage(error), MESSAGES.connection);
    assert.equal(requestOutcome(new TypeError('Failed to fetch')), 'connection');
    assert.equal(requestOutcome(null), 'sent');
    checks += 4;
  }
  console.log('PASS request forms: success, 400, 422, 429 and 500 give the same sentence; only no answer shows the connection message');

  // Password changes: closed French map; same_password counts as already set.
  const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const session = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: 9999999999 })}.test-signature`,
    refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user: { id: 'u1' } };
  const signedIn = async (url) => {
    const sb = client(url === closedUrl ? stubUrl : url);
    assert.equal((await sb.auth.setSession(session)).error, null);
    if (url === closedUrl) sb.auth.url = closedUrl;
    return sb;
  };
  for (const [status, body, expected, same] of [
    [422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }, MESSAGES.passwordFailed, true],
    [422, { code: 422, error_code: 'weak_password', msg: 'Password is too weak', weak_password: { reasons: ['length'] } }, MESSAGES.weakPassword, false],
    [401, apiError(401, 'bad_jwt', 'invalid JWT'), MESSAGES.sessionExpired, false],
    [403, apiError(403, 'session_not_found', 'Session not found'), MESSAGES.sessionExpired, false],
    [429, apiError(429, 'over_request_rate_limit', 'x'), MESSAGES.tooManyAttempts, false],
    [500, apiError(500, 'unexpected_failure', 'Database error'), MESSAGES.passwordFailed, false],
  ]) {
    const sb = await signedIn(stubUrl);
    answer(status, body);
    const { error } = await sb.auth.updateUser({ password: 'Nouveau-mot-2026' });
    assert.ok(error, `updateUser ${status}`);
    assert.equal(isSamePassword(error), same, `same_password ${status}`);
    assert.equal(passwordErrorMessage(error), expected, `message ${status} ${body.error_code}`);
    assert.ok(!Object.values(MESSAGES).includes(error.message), 'Auth text is never one of ours'); checks += 3;
  }
  {
    const sb = await signedIn(closedUrl);
    const { error } = await quiet(() => sb.auth.updateUser({ password: 'Nouveau-mot-2026' }));
    assert.equal(passwordErrorMessage(error), MESSAGES.connection); checks++;
  }
  console.log('PASS password changes: closed French map; same_password treated as already set');
} finally {
  stub.closeAllConnections(); await new Promise((resolve) => stub.close(resolve));
}

// ── 4. Sentry (B4) and Speed Insights ───────────────────────────────────────
const importPure = async (path) => import(`data:text/javascript;base64,${Buffer.from(read(path)).toString('base64')}`);
const { scrubEvent, scrubBreadcrumb } = await importPure('src/lib/sentry-scrub.js');
const linkPath = `/auth/confirm?token_hash=${TOKEN}&type=invite`;
{
  const crumb = scrubBreadcrumb({ category: 'navigation', data: { from: linkPath, to: `${linkPath}#x` } });
  assert.equal(crumb.data.from, '/auth/confirm'); assert.equal(crumb.data.to, '/auth/confirm');
  const fetchCrumb = scrubBreadcrumb({ category: 'fetch', data: { url: `/auth/confirm?token_hash=${TOKEN}`, method: 'GET' } });
  assert.equal(fetchCrumb.data.url, '/auth/confirm');
  const message = scrubBreadcrumb({ category: 'console', message: `opened ${linkPath} then /x?a=1` });
  assert.ok(!message.message.includes(TOKEN)); assert.ok(!message.message.includes('?'));
  const event = scrubEvent({
    message: `Failed on ${linkPath}`,
    exception: { values: [{ value: `TypeError at token_hash=${TOKEN}&type=recovery` }, { value: `see https://admin.example/auth/confirm?token_hash=${TOKEN}` }] },
    request: { url: linkPath },
    extra: { page: linkPath, nested: { from: linkPath } },
    tags: {},
  });
  const serialized = JSON.stringify([crumb, fetchCrumb, message, event]);
  assert.ok(!serialized.includes(TOKEN), 'no token anywhere'); assert.ok(!serialized.includes('type=invite'));
  assert.equal(event.request.url, '/auth/confirm');
  assert.match(event.exception.values[0].value, /token_hash=\[redacted\]/);
  assert.equal(event.exception.values[1].value, 'see https://admin.example/auth/confirm');
  // Unchanged behaviour: an absolute address still loses its query; a plain sentence is kept.
  assert.equal(scrubBreadcrumb({ data: { url: 'https://x.example/a?b=c#d' } }).data.url, 'https://x.example/a');
  assert.equal(scrubEvent({ message: 'Échec du chargement (50/100) : réessayez ?' }).message, 'Échec du chargement (50/100) : réessayez ?');
  checks += 11;
}
{
  const vital = scrubVitalEvent({ type: 'vital', url: `https://admin.english-hills.com${linkPath}`, route: linkPath });
  assert.equal(vital.url, 'https://admin.english-hills.com/auth/confirm');
  assert.equal(vital.route, '/auth/confirm');
  assert.equal(scrubRoute(`${linkPath}#f`), '/auth/confirm');
  checks += 3;
}
console.log('PASS Sentry breadcrumbs (relative from/to), events and free text, and Speed Insights carry no token');

// ── 5. Invite route: re-invitation of a confirmed, never-activated account (D2) ──
const routeCalls = [];
let fixture;
globalThis.__inviteFixture = {
  getServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'staff-1' } }, error: null }) },
    from: (table) => ({ select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => {
      if (table !== 'profiles') throw Error('unexpected table');
      if (id === 'staff-1') return { data: { role: fixture.actorRole || 'director' }, error: null };
      routeCalls.push(`read-role:${id}`);
      // Reception's own client cannot read a pending profile (RLS): no row.
      return fixture.actorRole === 'receptionist' ? { data: null, error: null } : fixture.targetRead;
    } }) }) }),
    rpc: async (name, args) => {
      if (name === 'consume_rate_limit') return { data: true, error: null };
      routeCalls.push(`rpc:${name}:${args.p_email}`);
      return { data: structuredClone(fixture.result), error: null };
    },
  }),
  getServiceRoleClient: () => ({
    auth: { admin: { inviteUserByEmail: async (email, options) => {
      routeCalls.push(`invite:${email}:${options.redirectTo}`); return { error: fixture.inviteError || null };
    } } },
    from: (table) => ({ select: (columns) => ({ eq: (_c, id) => ({ maybeSingle: async () => {
      if (table !== 'profiles' || columns !== 'role') throw Error('unexpected service read');
      routeCalls.push(`service-read-role:${id}`);
      return fixture.targetRead;
    } }) }) }),
  }),
  createClient: (url, key, options) => ({ auth: { signInWithOtp: async (args) => {
    routeCalls.push(`otp:${JSON.stringify({ url, key, flow: options.auth.flowType, persist: options.auth.persistSession, ...args })}`);
    return { error: fixture.otpError || null };
  } } }),
};
const routeBundle = await build({
  entryPoints: [fileURLToPath(new URL('src/app/api/admin/invite/route.js', root))],
  bundle: true, write: false, format: 'esm', platform: 'node', external: ['next', 'next/*', 'zod'],
  plugins: [{
    name: 'invite-route-stubs',
    setup(b) {
      b.onResolve({ filter: /^next\/server$/ }, () => ({ path: 'next/server.js', external: true }));
      b.onResolve({ filter: /^(@\/lib\/supabase|@\/lib\/supabase-admin|@supabase\/supabase-js)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /^@\// }, (a) => ({ path: fileURLToPath(new URL(`src/${a.path.slice(2)}`, root)) }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        loader: 'js',
        contents: a.path === '@/lib/supabase' ? 'export const getServerClient = (...x) => globalThis.__inviteFixture.getServerClient(...x);'
          : a.path === '@/lib/supabase-admin' ? 'export const getServiceRoleClient = (...x) => globalThis.__inviteFixture.getServiceRoleClient(...x);'
            : 'export const createClient = (...x) => globalThis.__inviteFixture.createClient(...x);',
      }));
    },
  }],
});
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
const routeModuleUrl = new URL(`file://${fileURLToPath(new URL('scripts/.tmp-invite-route.mjs', root))}`);
const { writeFileSync, unlinkSync } = await import('node:fs');
writeFileSync(routeModuleUrl, routeBundle.outputFiles[0].text);
let POST;
try { ({ POST } = await import(routeModuleUrl.href)); } finally { unlinkSync(routeModuleUrl); }
const origin = 'https://admin.english-hills.com';
const invite = (body) => POST(new Request(`${origin}/api/admin/invite`, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
const confirmedPending = { success: true, alreadyRegistered: true, needsDelivery: false, userId: 'u-pending', role: 'admin', email: 'p@example.invalid' };
async function runInvite(name, f, body = { email: 'P@Example.invalid', role: 'admin' }) {
  fixture = { targetRead: { data: { role: 'pending' }, error: null }, ...f };
  routeCalls.length = 0;
  const response = await invite(body);
  const json = await response.json();
  assert.ok(!('queueId' in json), `${name}: no queue id in the answer`);
  return { status: response.status, json, calls: [...routeCalls] };
}
const otpCall = (calls) => calls.filter((c) => c.startsWith('otp:')).map((c) => JSON.parse(c.slice(4)));
for (const result of [confirmedPending, { ...confirmedPending, queueId: 'q-1' }]) {
  const { status, json, calls } = await runInvite('pending', { result });
  assert.equal(status, 200); assert.equal(json.userId, 'u-pending');
  const sent = otpCall(calls);
  assert.equal(sent.length, 1, 'one sign-in e-mail');
  assert.deepEqual(sent[0], { url: 'http://supabase.test', key: 'anon-test-key', flow: 'implicit', persist: false,
    email: 'p@example.invalid', options: { shouldCreateUser: false, emailRedirectTo: `${origin}/inscription-compte` } });
  assert.ok(calls.includes('read-role:u-pending')); assert.ok(!calls.some((c) => c.startsWith('invite:')));
  checks += 5;
}
for (const role of Object.keys(ROLE_HOME)) {
  const { status, calls } = await runInvite(`active ${role}`, { result: { ...confirmedPending, role }, targetRead: { data: { role }, error: null } });
  assert.equal(status, 200); assert.deepEqual(otpCall(calls), [], `active ${role}: no e-mail`); checks += 2;
}
{
  const { status, json, calls } = await runInvite('send fails', { result: confirmedPending, otpError: { status: 429, message: 'rate' } });
  assert.equal(status, 502);
  assert.deepEqual(json, { error: "Envoi non confirmé. Réessayez l'invitation; aucun rôle existant n'a été modifié." });
  assert.equal(otpCall(calls).length, 1); checks += 3;
}
{
  const { status, calls } = await runInvite('role read fails', { result: confirmedPending, targetRead: { data: null, error: { message: 'timeout' } } });
  assert.equal(status, 502); assert.deepEqual(otpCall(calls), []); checks += 2;
}
{
  const { status, calls } = await runInvite('no user id', { result: { ...confirmedPending, userId: null } });
  assert.equal(status, 200); assert.deepEqual(otpCall(calls), []); assert.ok(!calls.some((c) => c.startsWith('read-role'))); checks += 3;
}
{
  const { status, calls } = await runInvite('new address', { result: { success: true, alreadyRegistered: false, needsDelivery: true, userId: null, role: 'admin', email: 'p@example.invalid', queueId: 'q-2' } });
  assert.equal(status, 200); assert.deepEqual(otpCall(calls), []);
  assert.deepEqual(calls.filter((c) => c.startsWith('invite:')), [`invite:p@example.invalid:${origin}/inscription-compte`]); checks += 3;
}
{
  const { status, json } = await runInvite('invite fails', { result: { ...confirmedPending, needsDelivery: true }, inviteError: { message: 'x' } });
  assert.equal(status, 502); assert.match(json.error, /^Envoi non confirmé/); checks += 2;
}
// RPW-r2 review N2: reception's family invitation of a confirmed pending account sends the
// same sign-in e-mail; the role is read server-side only for her, and only the role.
{
  const family = { ...confirmedPending, role: 'parent' };
  const body = { email: 'P@Example.invalid', role: 'parent', studentIds: ['00000000-0000-4000-8000-000000000001'] };
  const { status, json, calls } = await runInvite('reception pending', { actorRole: 'receptionist', result: family }, body);
  assert.equal(status, 200); assert.equal(json.userId, 'u-pending');
  assert.equal(otpCall(calls).length, 1, 'reception: one sign-in e-mail');
  assert.ok(calls.includes('service-read-role:u-pending') && !calls.includes('read-role:u-pending'), 'reception: server-side role read');
  const active = await runInvite('reception active', { actorRole: 'receptionist', result: family, targetRead: { data: { role: 'parent' }, error: null } }, body);
  assert.equal(active.status, 200); assert.deepEqual(otpCall(active.calls), [], 'reception: an active account gets no e-mail');
  const failed = await runInvite('reception read fails', { actorRole: 'receptionist', result: family, targetRead: { data: null, error: { message: 'x' } } }, body);
  assert.equal(failed.status, 502); assert.deepEqual(otpCall(failed.calls), []);
  const staff = await runInvite('reception staff role', { actorRole: 'receptionist', result: family }, { email: 'p@example.invalid', role: 'admin' });
  assert.equal(staff.status, 403); assert.ok(!staff.calls.some((c) => c.startsWith('rpc:prepare')), 'reception: no staff invitation call');
  const director = await runInvite('director pending', { result: family }, body);
  assert.ok(director.calls.includes('read-role:u-pending') && !director.calls.some((c) => c.startsWith('service-read')), 'director: own client, as before');
  checks += 9;
}
console.log('PASS invite route: a confirmed pending account gets one sign-in e-mail (shouldCreateUser: false), reception included; active accounts none; 502 on failure; no queue id');

// ── 6. Source scans ─────────────────────────────────────────────────────────
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? files(path) : /\.(m?jsx?)$/.test(name) ? [path] : [];
  });
}
const srcDir = fileURLToPath(new URL('src', root));
const sources = Object.fromEntries(files(srcDir).map((p) => [p.slice(srcDir.length + 1), readFileSync(p, 'utf8')]));
const using = (pattern) => Object.keys(sources).filter((p) => pattern.test(sources[p])).sort();
assert.deepEqual(using(/\bverifyOtp\b/), ['app/auth/confirm/ConfirmClient.jsx'], 'verifyOtp only on the landing page');
assert.deepEqual(using(/\bresetPasswordForEmail\b/), ['app/(auth)/login/page.jsx']);
assert.deepEqual(using(/\bsignInWithOtp\b/), ['app/(auth)/login/page.jsx', 'app/api/admin/invite/route.js']);
for (const path of using(/\bsignInWithOtp\b/)) {
  const calls = sources[path].split(/\bsignInWithOtp\(/).slice(1);
  assert.ok(calls.length >= 1);
  for (const call of calls) assert.match(call.slice(0, 600), /shouldCreateUser:\s*false/, `${path}: shouldCreateUser: false`);
  checks++;
}
checks += 3;
{
  const confirm = sources['app/auth/confirm/ConfirmClient.jsx'];
  const handler = confirm.slice(confirm.indexOf('async function handleVerify'), confirm.indexOf('async function handleUseForAnotherAccount'));
  assert.equal(confirm.match(/\bverifyOtp\(/g).length, 1);
  assert.match(handler, /\.verifyOtp\(\{ token_hash: link\.tokenHash, type: link\.type \}\)/, 'verifyOtp only inside the click handler');
  const effect = confirm.slice(confirm.indexOf('useEffect('), confirm.indexOf('const go = useCallback'));
  assert.doesNotMatch(effect, /verifyOtp|tokenHash\s*[,}]|token_hash/, 'the mount effect never sends the token');
  assert.match(confirm, /onClick=\{handleVerify\}/);
  assert.doesNotMatch(confirm, /console\.|\.get\('(next|returnTo|redirect\w*)'\)|returnTo/, 'no logs, no destination parameter');
  assert.doesNotMatch(confirm, /dangerouslySetInnerHTML/);
  // apply_pending_role() only on the routes that follow a marked account.
  assert.equal(confirm.match(/apply_pending_role/g).length, 2);
  assert.match(confirm, /if \(route\.applyPendingRole\) \{\s*const \{ data: applied, error: applyError \} = await sb\.rpc\('apply_pending_role'\)/);
  const server = sources['app/auth/confirm/page.jsx'];
  assert.doesNotMatch(server, /searchParams|use client|headers\(\)/, 'the server part never reads the parameters');
  assert.match(server, /robots: \{ index: false, follow: false/); assert.match(server, /referrer: 'no-referrer'/);
  const activation = sources['app/inscription-compte/page.jsx'];
  assert.doesNotMatch(activation, /verifyOtp/);
  const forward = activation.slice(activation.indexOf("searchParams.get('token_hash')"), activation.indexOf('const sb = getBrowserClient();'));
  assert.match(forward, /window\.location\.replace\(`\/auth\/confirm\?\$\{forward\.toString\(\)\}`\);\s*return;/);
  assert.doesNotMatch(forward, /sb\.|auth\./, 'the forward makes no Auth call');
  // Submit order (B7): password, then the name, then apply_pending_role().
  const submit = activation.slice(activation.indexOf('async function handleSubmit'));
  const order = ['updateUser({ password })', ".update({ full_name: fullName })", "rpc('apply_pending_role')"].map((s) => submit.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'password → name → role');
  assert.match(submit, /if \(updateError && !isSamePassword\(updateError\)\)/);
  assert.doesNotMatch(activation, /updateError\.message|\.message \|\|/, 'Auth text never shown');
  assert.doesNotMatch(activation, /isActivated\(profile\) \|\| .*role|role === 'pending'/, 'the role never decides the form');
  checks += 18;
}
{
  const login = sources['app/(auth)/login/page.jsx'];
  assert.match(login, /resetPasswordForEmail\(trimmedEmail, \{\s*redirectTo: `\$\{window\.location\.origin\}\/login\/callback`,/);
  assert.match(login, /emailRedirectTo: `\$\{window\.location\.origin\}\/login\/callback\$\{next\}`/);
  assert.match(login, /setError\(requestMessage\(requestError\)\)/);
  assert.doesNotMatch(login.slice(login.indexOf('async function handleRequestSubmit'), login.indexOf('function switchTo')), /\.message/, 'request forms never show Auth text');
  assert.doesNotMatch(login, /searchParams\.get\('error'\)\s*[)}]?\s*<|\{searchParams/, 'nothing from the address is rendered');
  checks += 5;
}
{
  const middleware = read('src/middleware.js');
  assert.match(middleware, /\n {2}'\/auth\/confirm',\n/);
  assert.match(middleware, /if \(pathname === '\/auth\/confirm'\) response\.headers\.set\('Referrer-Policy', 'no-referrer'\);/);
  assert.doesNotMatch(middleware, /startsWith\('\/auth/);
  assert.equal(read('src/lib/authLinks.mjs').includes('console.'), false);
  checks += 4;
}
// Templates: the /auth/confirm link with the expected type, a marker, no ConfirmationURL or {{ .Token }}.
const config = read('supabase/config.toml');
for (const [name, type] of [['invite', 'invite'], ['magic_link', 'email'], ['confirmation', 'email'], ['recovery', 'recovery']]) {
  const html = read(`supabase/templates/${name}.html`);
  assert.ok(html.includes(`href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}"`), `${name} link`);
  assert.equal(html.match(/href=/g).length, 1, `${name}: one link`);
  assert.ok(html.includes(`<!-- eh-template: ${name} -->`));
  assert.doesNotMatch(html, /ConfirmationURL|\{\{\s*\.Token\s*\}\}|RedirectTo/);
  assert.match(config, new RegExp(`\\[auth\\.email\\.template\\.${name}\\]\\nsubject = "[^"]+"\\ncontent_path = "\\./supabase/templates/${name}\\.html"`));
  // The repository template is the plan's exact text.
  assert.ok(read('docs/architecture/plans/email-links-that-work.md').includes('```html\n' + html + '```'), `${name} matches the plan`);
  checks += 6;
}
console.log('PASS source: verifyOtp only in the click handler, no verification on /inscription-compte, shouldCreateUser: false, the four templates');

// The unchanged modules of the manifest still hold their behaviour.
assert.match(read('src/app/(auth)/login/callback/route.js'), /exchangeCodeForSession\(code\)/);
assert.doesNotMatch(read('src/context/AuthContext.jsx'), /auth\/confirm|token_hash/);
checks += 2;
console.log(`PASS e-mail links unit suite (${checks} checks)`);
