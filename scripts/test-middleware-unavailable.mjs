// REL-9 (plan SCG-r1): a failed Auth or profile read is a connection problem, never
// "signed out" or "pending". Runs the unmodified middleware body with its Supabase
// client replaced, as scripts/test-middleware-security.mjs does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server.js';
import { receptionistCanAccess, isDirectorAnalyticsPath, isDirectorLifecyclePath, ROLE_HOME, isOnlineRoomPath, familyCanAccess } from '../src/lib/roleAccess.mjs';

const app = 'http://127.0.0.1:3241';
const source = readFileSync(new URL('../src/middleware.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export async function middleware', 'async function middleware')
  .replace('export const config', 'const config');
const cookie = { name: 'session.0', value: 'renewed', options: { path: '/', httpOnly: true } };
let checks = 0;

function run({ user = { id: 'fixture-user' }, userError = null, profile = { role: 'director' }, profileError = null }) {
  const fake = (_url, _key, options) => ({
    auth: { getUser: async () => { options.cookies.setAll([cookie]); return { data: { user }, error: userError }; } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: profileError }) }) }) }),
  });
  const middleware = new Function('createServerClient', 'NextResponse', 'receptionistCanAccess', 'isDirectorAnalyticsPath',
    'isDirectorLifecyclePath', 'ROLE_HOME', 'isOnlineRoomPath', 'familyCanAccess', `${source}\nreturn middleware;`)(fake, NextResponse,
    receptionistCanAccess, isDirectorAnalyticsPath, isDirectorLifecyclePath, ROLE_HOME, isOnlineRoomPath, familyCanAccess);
  return path => middleware(new NextRequest(app + path));
}

async function expectUnavailable(response, label) {
  assert.equal(response.status, 503, `${label}: 503`);
  assert.equal(response.headers.get('location'), null, `${label}: no redirect`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('retry-after'), '5');
  assert.match(response.headers.get('content-type'), /^text\/html/);
  const body = await response.text();
  assert.match(body, /Connexion impossible/);
  assert.doesNotMatch(body, /en attente/i, `${label}: never the pending message`);
  assert.equal(response.cookies.get(cookie.name)?.value, cookie.value, `${label}: refreshed cookie kept`);
  checks += 1;
}

const PROTECTED = ['/dashboard', '/students', '/teacher-portal', '/crm/leads', '/parent-portal'];
const network = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError', status: 0 });
const gateway = Object.assign(new Error('Bad gateway'), { name: 'AuthUnknownError', status: 502 });
const unknown = Object.assign(new Error('Unexpected'), { name: 'AuthUnknownError' });
const limited = Object.assign(new Error('Too many requests'), { name: 'AuthApiError', status: 429 });
const refused = Object.assign(new Error('invalid JWT'), { name: 'AuthApiError', status: 401 });
const missing = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError', status: 400 });
const postgrest = { message: 'TypeError: fetch failed', code: '', details: '', hint: '' };

for (const path of PROTECTED) {
  // A failed profile read: 503, never /unauthorized.
  await expectUnavailable(await run({ profile: null, profileError: postgrest })(path), `profile error ${path}`);
  await expectUnavailable(await run({ profile: null, profileError: { message: 'timeout', code: '57014' } })(path), `profile timeout ${path}`);
  // Auth could not answer: 503, never /login.
  for (const error of [network, gateway, unknown, limited]) {
    await expectUnavailable(await run({ user: null, userError: error })(path), `${error.name} ${path}`);
  }
  // Auth answered: no session → /login; a profile with no row → pending (/unauthorized), as before.
  for (const error of [refused, missing, null]) {
    const r = await run({ user: null, userError: error })(path);
    assert.equal(r.status, 307); assert.equal(new URL(r.headers.get('location')).pathname, '/login'); checks += 1;
  }
  const pending = await run({ profile: null })(path);
  assert.equal(pending.status, 307); assert.equal(new URL(pending.headers.get('location')).pathname, '/unauthorized'); checks += 1;
  const director = await run({})(path);
  assert.equal(director.status, 200); checks += 1;
}
// Public pages and API routes are unchanged by a failure: they pass through.
for (const path of ['/login', '/login/callback', '/unauthorized', '/api/admin/invite']) {
  for (const options of [{ user: null, userError: network }, { profile: null, profileError: postgrest }]) {
    const r = await run(options)(path);
    assert.equal(r.status, 200, `${path} passes through`); assert.equal(r.headers.get('location'), null); checks += 1;
  }
}
console.log(`PASS middleware connection failures answer 503 with retry, never pending or sign-out (${checks} checks)`);
