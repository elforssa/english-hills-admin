// Standalone local regression: node scripts/test-middleware-security.mjs
// Builds a real production Next server against an in-memory fake Auth/PostgREST
// server, then checks HTTP role gates and ProtectedRoute in Chromium. No database,
// production credentials, emails or storage are used.
import assert from 'node:assert/strict';
import { receptionistCanAccess, isDirectorAnalyticsPath, ROLE_HOME } from '../src/lib/roleAccess.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { NextRequest, NextResponse } from 'next/server.js';
import { createServerClient } from '@supabase/ssr';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const base = 'http://127.0.0.1:55431';
const app = 'http://127.0.0.1:3241';
const key = 'middleware-local-test';
let checks = 0;
const roles = ['anonymous', 'missing', 'pending', 'unknown', 'teacher', 'parent', 'student', 'admin', 'director', 'receptionist'];
const teacherPaths = ['/teacher-portal', '/attendance', '/assessments', '/portfolios', '/learning-assessments', '/groups', '/timetable', '/premium-sessions', '/dashboard', '/', '/settings'];
function expected(role, path) {
  if (role === 'anonymous') return '/login';
  if (['missing', 'pending', 'unknown'].includes(role)) return '/unauthorized';
  if (role === 'admin' && (path === '/crm/analytics' || path.startsWith('/crm/analytics/'))) return '/dashboard';
  if (['admin', 'director'].includes(role)) return null;
  if (role === 'receptionist') return receptionistCanAccess(path) ? null : '/crm/today';
  if (role === 'teacher') return teacherPaths.some(p => path === p || path.startsWith(p + '/')) ? null : '/teacher-portal';
  return path === '/' + role + '-portal' || path === '/settings' ? null : '/' + role + '-portal';
}
function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? pages(new URL(e.name + '/', dir)) : e.name === 'page.jsx' ? [new URL(e.name, dir).pathname] : []);
}
const routes = pages(new URL('src/app/(admin)/', root)).map(p => p.split('/src/app/(admin)')[1].replace('/page.jsx', '').replace('[id]', '00000000-0000-4000-8000-000000000001'));
assert.ok(routes.length >= 36, 'Expected protected admin routes to be present');
assert.equal(existsSync(new URL('middleware.js', root)), false);
const mockEnv = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: base,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
  SUPABASE_SERVICE_ROLE_KEY: key,
  DISABLE_EXTERNAL_EMAIL: 'true',
  NEXT_PUBLIC_SENTRY_DSN: '',
  SENTRY_DSN: '',
  SENTRY_AUTH_TOKEN: '',
  RESEND_API_KEY: '',
  TURNSTILE_SECRET_KEY: '',
};
async function buildAgainstMockAuth() {
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: root, env: mockEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, 'Mock Auth build failed:\n' + output.slice(-4000));
  console.log('PASS isolated production build against ' + base);
}
await buildAgainstMockAuth();
const manifest = JSON.parse(readFileSync(new URL('.next/server/middleware-manifest.json', root)));
assert.ok(manifest.middleware['/'], 'Production build must contain middleware');
assert.ok(manifest.sortedMiddleware.includes('/'));
for (const path of routes) {
  assert.ok(manifest.middleware['/'].matchers.some(m => new RegExp(m.regexp).test(path)), 'Matcher missing ' + path);
  checks++;
}
console.log('PASS active production middleware manifest; all ' + routes.length + ' route patterns matched');

// Execute the unmodified middleware body with only its Auth dependency replaced.
const middlewareSource = readFileSync(new URL('src/middleware.js', root), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export async function middleware', 'async function middleware')
  .replace('export const config', 'const config');
for (const role of roles) {
  const cookies = [
    { name: 'session.0', value: 'renewed-part-0', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true } },
    { name: 'session.1', value: 'renewed-part-1', options: { path: '/', maxAge: 3600 } },
    { name: 'obsolete.2', value: '', options: { path: '/', maxAge: 0 } },
  ];
  const fake = (_url, _key, options) => ({
    auth: { getUser: async () => {
      options.cookies.setAll(cookies.slice(0, 1));
      options.cookies.setAll(cookies.slice(1));
      return { data: { user: role === 'anonymous' ? null : { id: 'fixture-user' } } };
    } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role === 'missing' ? null : { role } }) }) }) }),
  });
  const middleware = new Function('createServerClient', 'NextResponse', 'receptionistCanAccess', 'isDirectorAnalyticsPath', 'ROLE_HOME', middlewareSource + '\nreturn middleware;')(fake, NextResponse, receptionistCanAccess, isDirectorAnalyticsPath, ROLE_HOME);
  for (const path of ['/dashboard', '/teachers', '/login', '/login/callback', '/api/admin/invite']) {
    const r = await middleware(new NextRequest(app + path));
    for (const cookie of cookies) {
      const actual = r.cookies.get(cookie.name);
      assert.ok(actual); assert.equal(actual.value, cookie.value); assert.equal(actual.path, '/');
      if (cookie.options.httpOnly) assert.equal(actual.httpOnly, true);
      if (cookie.options.secure) assert.equal(actual.secure, true);
      if (cookie.options.maxAge !== undefined) assert.equal(actual.maxAge, cookie.options.maxAge);
    }
    if (!path.startsWith('/login') && !path.startsWith('/api/')) {
      const target = expected(role, path);
      assert.equal(r.status, target ? 307 : 200);
      if (target) assert.equal(new URL(r.headers.get('location'), app).pathname, target);
    }
    checks++;
  }
}
console.log('PASS refreshed chunk/deletion cookies on redirects and pass-through responses');

const users = Object.fromEntries(roles.filter(r => r !== 'anonymous').map(role => [role, {
  id: randomUUID(), email: role + '@middleware.example.invalid', role: 'authenticated',
  aud: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, created_at: new Date().toISOString(),
}]));
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
function session(role, expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -100 : 3600);
  return { access_token: encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: users[role].id, role: 'authenticated', aud: 'authenticated', exp, test_role: role }) + '.test-signature',
    refresh_token: 'refresh-' + role, expires_in: expired ? -100 : 3600, expires_at: exp, token_type: 'bearer', user: users[role] };
}
let refreshes = 0;
const unexpected = [];
const stub = createServer(async (req, res) => {
  const url = new URL(req.url, base);
  let body = ''; for await (const c of req) body += c;
  let data = {}; try { data = JSON.parse(body || '{}'); } catch { /* invalid body rejected below */ }
  let role;
  try { role = JSON.parse(Buffer.from((req.headers.authorization || '').split('.')[1], 'base64url')).test_role; } catch { /* anonymous */ }
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/auth/v1/user') return send(users[role] ? 200 : 401, users[role] || { message: 'No user' });
  if (url.pathname === '/auth/v1/token') {
    const selected = String(data.refresh_token || '').replace('refresh-', '');
    if (users[selected]) { refreshes++; return send(200, session(selected)); }
    if (data.auth_code === 'local-callback-code') return send(200, session('parent'));
    if (data.auth_code === 'local-receptionist-code') return send(200, session('receptionist'));
    return send(400, { message: 'Invalid fixture token' });
  }
  if (url.pathname === '/rest/v1/profiles') {
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const selected = Object.keys(users).find(r => users[r].id === id);
    const profile = selected && selected !== 'missing' ? { id, role: selected, email: users[selected].email } : null;
    return send(200, req.headers.accept?.includes('application/vnd.pgrst.object') ? profile : profile ? [profile] : []);
  }
  if (url.pathname === '/rest/v1/rpc/apply_pending_role') return send(200, null);
  if (url.pathname === '/rest/v1/rpc/check_rate_limit') return send(200, true);
  unexpected.push(req.method + ' ' + url.pathname); return send(500, { message: 'Unexpected test request' });
});
let server;
try {
  stub.listen(55431, '127.0.0.1'); await once(stub, 'listening');
  // Explicit allowlist: never inherit cloud URLs, service keys, Sentry or email tokens.
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3241'], {
    cwd: root, env: mockEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; server.stdout.on('data', d => { output += d; }); server.stderr.on('data', d => { output += d; });
  for (let i = 0; ; i++) {
    try { if ((await fetch(app + '/login')).ok) break; } catch { /* starting */ }
    if (i > 100 || server.exitCode !== null) throw Error('Local Next server failed to start: ' + output.slice(-1500));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  async function cookie(role, expired = false) {
    if (role === 'anonymous') return '';
    const jar = new Map();
    const client = createServerClient(base, key, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cs => cs.forEach(c => jar.set(c.name, c.value)) } });
    assert.equal((await client.auth.setSession(session(role))).error, null);
    if (expired) {
      const name = [...jar.keys()].find(k => k.endsWith('auth-token'));
      assert.ok(name, 'Expected unchunked fixture session');
      jar.set(name, 'base64-' + Buffer.from(JSON.stringify(session(role, true))).toString('base64url'));
    }
    return [...jar].map(([k, v]) => k + '=' + v).join('; ');
  }
  for (const role of roles) {
    const Cookie = await cookie(role);
    for (const path of routes) {
      const r = await fetch(app + path, { headers: { Cookie }, redirect: 'manual' });
      const target = expected(role, path);
      assert.equal(r.status, target ? 307 : 200, role + ' ' + path);
      if (target) { assert.equal(new URL(r.headers.get('location'), app).pathname, target, role + ' ' + path); assert.ok(!(await r.text()).includes('self.__next_f')); }
      else await r.arrayBuffer();
      checks++;
    }
    for (const path of ['/dashboard', '/groups/00000000-0000-4000-8000-000000000001']) {
      for (const extras of [{ RSC: '1' }, { RSC: '1', 'Next-Router-Prefetch': '1', purpose: 'prefetch' }]) {
        const r = await fetch(app + path + '?_rsc=fixture', { headers: { Cookie, ...extras }, redirect: 'manual' });
        const target = expected(role, path);
        assert.equal(r.status, target ? 307 : 200, 'RSC ' + role + ' ' + path);
        if (target) assert.equal(new URL(r.headers.get('location'), app).pathname, target);
        await r.arrayBuffer(); checks++;
      }
    }
    if (!['admin', 'director'].includes(role)) for (const path of ['/api/admin/invite', '/api/admin/update-role', '/api/admin/payroll']) {
      const r = await fetch(app + path, { method: 'POST', headers: { Cookie, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(r.status, role === 'anonymous' ? 401 : 403, path + ' ' + role); checks++;
    }
  }
  console.log('PASS direct HTTP full role/route matrix, RSC/prefetch and independent API 401/403 gates');
  const beforeRefresh = refreshes;
  for (const role of ['parent', 'missing', 'admin']) {
    const r = await fetch(app + '/dashboard', { headers: { Cookie: await cookie(role, true) }, redirect: 'manual' });
    assert.equal(r.status, role === 'admin' ? 200 : 307);
    assert.ok(r.headers.getSetCookie().some(c => c.includes('auth-token=')), 'Refreshed cookies lost'); checks++;
  }
  assert.ok(refreshes >= beforeRefresh + 3);
  const callback = await fetch(app + '/login/callback?code=local-callback-code', {
    headers: { Cookie: 'sb-127-auth-token-code-verifier=base64-' + Buffer.from(JSON.stringify('local-verifier')).toString('base64url') }, redirect: 'manual',
  });
  assert.equal(callback.status, 307);
  assert.equal(new URL(callback.headers.get('location')).pathname, '/parent-portal');
  assert.ok(callback.headers.getSetCookie().some(c => c.includes('auth-token=')));
  checks++;
  const receptionistCallback = await fetch(app + '/login/callback?code=local-receptionist-code&next=/finance', {
    headers: { Cookie: 'sb-127-auth-token-code-verifier=base64-' + Buffer.from(JSON.stringify('local-verifier')).toString('base64url') }, redirect: 'manual',
  });
  assert.equal(receptionistCallback.status, 307);
  assert.equal(new URL(receptionistCallback.headers.get('location'), app).pathname, '/crm/today');
  assert.ok(receptionistCallback.headers.getSetCookie().some(c => c.includes('auth-token=')));
  checks++;
  assert.deepEqual(unexpected, []);
  console.log('PASS HTTP expired-session renewal, refreshed redirect cookies and code-exchange callback');

  const browserBundle = await build({
    entryPoints: [fileURLToPath(new URL('fixtures/protected-route-browser.jsx', import.meta.url))],
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{
      name: 'guard-fixture-hooks',
      setup(bundle) {
        bundle.onResolve({ filter: /^(next\/navigation|@\/context\/AuthContext)$/ }, args => ({ path: args.path, namespace: 'guard-hooks' }));
        bundle.onLoad({ filter: /.*/, namespace: 'guard-hooks' }, args => ({
          contents: args.path === 'next/navigation'
            ? 'export const usePathname = () => window.__guardFixture.pathname; export const useRouter = () => window.__guardFixture.router;'
            : 'export const useAuth = () => window.__guardFixture.actor;',
          loader: 'js',
        }));
      },
    }],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', r => r.abort());
    const page = await context.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: browserBundle.outputFiles[0].text });
    const results = await page.evaluate(({ roles, routes }) => window.runProtectedRouteCases(roles, routes), { roles, routes });
    for (const row of results) {
      const target = row.loading ? null : row.explicit ? '/unauthorized' : expected(row.role, row.path);
      if (row.loading) {
        assert.equal(row.mounts, 0); assert.equal(row.effects, 0); assert.equal(row.queries, 0);
        assert.deepEqual(row.redirects, []); checks++; continue;
      }
      assert.equal(row.mounts, target ? 0 : 1, JSON.stringify(row));
      assert.equal(row.effects, target ? 0 : 1); assert.equal(row.queries, target ? 0 : 1);
      if (target) {
        assert.equal(row.redirects.length, 1);
        assert.equal(row.redirects[0].split('?')[0], target);
      } else assert.deepEqual(row.redirects, []);
      checks++;
    }
    console.log('PASS real React DOM: disallowed children never render, mount effects or initiate queries');
  } finally { await browser.close(); }
  console.log('PASS middleware security: ' + checks + ' checks');
} finally {
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
  stub.closeAllConnections(); await new Promise(resolve => stub.close(resolve));
}
