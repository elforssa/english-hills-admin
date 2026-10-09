// Performance baseline (Phase 0 of the performance plan): real local Auth and pages,
// synthetic staff created through the local Auth admin API and removed in finally.
// Requires local Supabase and `npm run build && npx next start -p 3101` on this branch.
//
// Measures, per network profile and route, on a cold cache:
//   - time until the page heading renders (`#main-content h1`),
//   - the Supabase requests the browser issued before that heading (the critical chain),
//   - JavaScript transferred.
// Then probes resilience: sustained failure of each session read and an offline navigation.
// It reports current behavior; it asserts nothing about speed. PERF_OUT=<file> writes JSON.
// Chromium DevTools emulation covers latency and bandwidth only, not packet loss.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';

assertLocalFeatureBranch();
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').flatMap(line => { const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/); return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : []; }));
const base = 'http://127.0.0.1:54321', app = 'http://localhost:3101';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'perf baseline runs against local Supabase only');
const sql = s => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: s, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } }).trim();

// center ≈ a busy shared office link; bad ≈ a degraded mobile link.
const PROFILES = {
  lan: null,
  center: { offline: false, latency: 250, downloadThroughput: 2_000_000 / 8, uploadThroughput: 1_000_000 / 8 },
  bad: { offline: false, latency: 600, downloadThroughput: 750_000 / 8, uploadThroughput: 250_000 / 8 },
};
const UNTHROTTLED = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const FLOWS = { receptionist: ['/crm/leads', '/crm/today'], admin: ['/dashboard', '/students', '/finance', '/receipts'] };
const RUNS = Number(process.env.PERF_RUNS || 3);
const run = 'perf-' + randomUUID().slice(0, 8), password = randomBytes(18).toString('base64url'), users = [];
const results = [], probes = [];
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const short = url => url.replace(base, '').split('?')[0].replace(/^\/(rest|auth)\/v1\//, '');

async function measureOnce(page, cdp, path, profile) {
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', PROFILES[profile] || UNTHROTTLED);
  const requests = [], t0 = Date.now();
  const onRequest = request => { if (request.url().startsWith(base)) requests.push({ name: short(request.url()), start: Date.now() - t0 }); };
  page.on('request', onRequest);
  try {
    await page.goto(app + path, { waitUntil: 'commit' });
    await page.locator('#main-content h1').first().waitFor({ timeout: 90_000 });
    const heading = Date.now() - t0;
    await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
    const js = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('/_next/static/') && entry.name.endsWith('.js'))
      .reduce((sum, entry) => sum + (entry.transferSize || 0), 0));
    const critical = requests.filter(request => request.start < heading);
    return { heading, critical, total: requests.length, jsKB: Math.round(js / 1024) };
  } finally {
    page.off('request', onRequest);
  }
}

async function login(page, user) {
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

// A transient failure must not sign staff out or leave a blank page; record what happens today.
async function probe(page, path, label, pattern) {
  await page.route(pattern, route => route.abort('connectionreset'));
  try {
    await page.goto(app + path);
    await page.waitForTimeout(5000);
    const heading = await page.locator('#main-content h1').count();
    const mainText = (await page.locator('#main-content').innerText().catch(() => '')).trim();
    const landed = new URL(page.url()).pathname;
    probes.push({ label, path, landed, heading: heading > 0, blankOnRoute: landed === path && !heading && !mainText });
  } finally {
    await page.unroute(pattern);
  }
}

let browser;
try {
  for (const role of Object.keys(FLOWS)) {
    const email = `${run}-${role}@example.invalid`;
    const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
    assert.equal(response.status, 200, 'synthetic user creation');
    const user = await response.json();
    users.push({ id: user.id, email, role });
    sql(`update public.profiles set role='${role}',full_name='Perf ${role}' where id='${user.id}'`);
  }
  browser = await chromium.launch({ headless: true });
  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await login(page, user);
    for (const profile of Object.keys(PROFILES)) {
      for (const path of FLOWS[user.role]) {
        const samples = [];
        for (let i = 0; i < RUNS; i++) samples.push(await measureOnce(page, cdp, path, profile));
        const typical = samples.find(sample => sample.heading === median(samples.map(s => s.heading)));
        results.push({
          role: user.role, profile, path, runs: RUNS,
          headingMs: typical.heading, criticalRequests: typical.critical.length, totalRequests: typical.total, jsKB: typical.jsKB,
          chain: typical.critical.map(request => `${request.name}@${request.start}`),
        });
      }
    }
    await cdp.send('Network.emulateNetworkConditions', UNTHROTTLED);
    const home = FLOWS[user.role][0];
    await probe(page, home, 'auth user lookup fails', '**/auth/v1/user');
    await probe(page, home, 'profile read fails', '**/rest/v1/profiles*');
    await probe(page, home, 'pending-role RPC fails', '**/rest/v1/rpc/apply_pending_role');
    await context.setOffline(true);
    const offline = await page.goto(app + home).then(() => 'loaded', error => String(error.message).match(/net::[A-Z_]+/)?.[0] || 'failed');
    probes.push({ label: 'offline navigation', path: home, result: offline });
    await context.setOffline(false);
    await context.close();
  }
} finally {
  await browser?.close();
  if (users.length) {
    const ids = users.map(user => `'${user.id}'`).join(',');
    sql(`begin;alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);
  }
}

console.log('profile  route         heading(ms)  critical  total  js(KB)  critical chain');
for (const r of results) {
  console.log(`${r.profile.padEnd(8)} ${r.path.padEnd(13)} ${String(r.headingMs).padStart(11)}  ${String(r.criticalRequests).padStart(8)}  ${String(r.totalRequests).padStart(5)}  ${String(r.jsKB).padStart(6)}  ${r.chain.join(' ')}`);
}
for (const p of probes) console.log('probe:', JSON.stringify(p));
if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, results, probes }, null, 1));
