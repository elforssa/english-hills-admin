// The real room page against Zoom Video SDK (plan OL-r6 adapter addendum, A6 and A7).
// Local only, never in CI: needs the owner's Zoom developer credentials in .env.local
// (read by `next start`, never printed), a production build (`npm run build`), the local
// Supabase stack and a network path to Zoom. Seeds one synthetic adult learner, course
// and open lesson, starts `next start` with ONLINE_VIDEO_PROVIDER=zoom-video, signs the
// learner in, enters the room from the student portal by a full document navigation and
// checks, under the room's own Content-Security-Policy (no CSP bypass):
//   - the join route answers with a zoom-video embed and no room reference;
//   - the UI Toolkit joins the Zoom session (a websocket to a zoom.us host opens, the
//     toolkit renders the participant list with the platform label, no "Verify JWT" error);
//   - every request the browser blocked under the CSP is recorded (none may be a Zoom
//     host), and the telemetry posts are captured and scanned for platform identifiers
//     (the display label, the pass id, the learner's e-mail, the room reference): A7-record;
//   - Quitter returns to the portal by a full document navigation.
// Writes a JSON report (OL_ZOOM_ROOM_REPORT, default scripts/.zoom-room-report.json,
// git-ignored). Removes only this run's fixtures.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';

assertLocalFeatureBranch(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const file = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
}));
if (!file.ONLINE_VIDEO_PROVIDER_API_KEY || !file.ONLINE_VIDEO_PROVIDER_API_SECRET) {
  console.error('SKIP zoom room check: set ONLINE_VIDEO_PROVIDER_API_KEY and ONLINE_VIDEO_PROVIDER_API_SECRET in .env.local');
  process.exit(2);
}
const base = process.env.OL_SUPABASE_URL || file.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.OL_SERVICE_ROLE_KEY || file.SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.OL_DB_CONTAINER || 'supabase_db_hills-admin-next';
const port = process.env.OL_APP_PORT || '3103', app = `http://localhost:${port}`;
const reportPath = process.env.OL_ZOOM_ROOM_REPORT || 'scripts/.zoom-room-report.json';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, 'local Supabase only');
setTimeout(() => { console.error('FAIL zoom room check stalled'); process.exit(1); }, 8 * 60_000).unref();
const sql = statement => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8', timeout: 120_000 }).trim();

const run = 'zoom-room-' + randomUUID().slice(0, 8);
const password = randomBytes(18).toString('base64url');
const ids = { teacher: randomUUID(), adult: randomUUID(), group: randomUUID(), open: randomUUID() };
const roomRef = `eh-${randomBytes(12).toString('hex')}`;
const users = {};
let server, browser, serverLog = '';
const report = { run: new Date().toISOString(), roomRef, join: null, websockets: [], cspBlocked: [], zoomHosts: new Set(), console: [], telemetry: [], results: {} };

async function createUser(role) {
  const email = `${run}-${role}@example.invalid`;
  const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.equal(response.status, 200, 'local Auth user');
  const id = (await response.json()).id;
  sql(`update public.profiles set role='${role}' where id='${id}'`);
  users[role] = { id, email };
}
const pass = (name, ok, detail) => { report.results[name] = { ok, ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail)); if (!ok) process.exitCode = 1; };

try {
  await createUser('student');
  sql(`insert into public.teachers(id, full_name, email, contract_type) values ('${ids.teacher}', 'Sara ${run}', '${run}-teacher@example.invalid', 'Freelance');
    insert into public.students(id, full_name, email, status, session_type, niveau_cefr) values ('${ids.adult}', 'Amal Bennani', '${users.student.email}', 'Enrolled', 'Online', 'B1');
    insert into public.groups(id, name, session_type, niveau) values ('${ids.group}', 'Online B1 ${run}', 'Online', 'B1');
    insert into public.online_courses(group_id, teacher_id, audience, capacity, status, provider, provider_room_ref, term_start, term_end) values
      ('${ids.group}', '${ids.teacher}', 'adult', 8, 'active', 'zoom-video', '${roomRef}', current_date - 1, current_date + 30);
    insert into public.enrollments(student_id, group_id, status, session_type, school_year, level) values ('${ids.adult}', '${ids.group}', 'Validated', 'Online', '2026/2027', 'B1');
    insert into public.online_lessons(id, group_id, starts_at, ends_at, teacher_id) values ('${ids.open}', '${ids.group}', now() + interval '5 minutes', now() + interval '65 minutes', '${ids.teacher}');`);

  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', port], {
    env: { ...process.env, ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'zoom-video', DISABLE_EXTERNAL_EMAIL: 'true',
      NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_DSN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/login`)).ok) break; } catch { /* starting */ }
    if (i > 120 || server.exitCode !== null) throw new Error('server failed to start: ' + serverLog.slice(-1500));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera', 'microphone'] });
  await context.addInitScript(() => {
    window.__cspBlocked = [];
    document.addEventListener('securitypolicyviolation', e => window.__cspBlocked.push({ directive: e.effectiveDirective, blocked: String(e.blockedURI).split('?')[0].slice(0, 160) }));
  });
  const page = await context.newPage();
  const joinBodies = [];
  page.on('response', async response => {
    if (response.url().includes('/api/online/join')) { try { joinBodies.push(await response.text()); } catch { /* navigated */ } }
    try { const host = new URL(response.url()).host; if (host.endsWith('zoom.us')) report.zoomHosts.add(host); } catch { /* ignore */ }
  });
  page.on('websocket', ws => { const host = new URL(ws.url()).host; report.websockets.push({ host, at: new Date().toISOString() }); if (host.endsWith('zoom.us')) report.zoomHosts.add(host); });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) report.console.push({ type: m.type(), text: m.text().slice(0, 240) }); });
  page.on('request', request => {
    try {
      const host = new URL(request.url()).host;
      if (host.includes('telemetry') || host.includes('log-external')) report.telemetry.push({ host, path: new URL(request.url()).pathname, method: request.method(), bytes: (request.postData() || '').length, body: (request.postData() || '').slice(0, 20000) });
    } catch { /* ignore */ }
  });
  page.on('pageerror', error => report.console.push({ type: 'pageerror', text: String(error?.message || error).slice(0, 300) }));
  page.on('requestfailed', request => report.console.push({ type: 'requestfailed', text: `${request.url().split('?')[0].slice(0, 160)} ${request.failure()?.errorText || ''}` }));

  // Sign in and enter the room from the student portal (plain anchor: a document navigation).
  for (let attempt = 0; ; attempt++) {
    await page.goto(app + '/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Adresse email', { exact: true }).fill(users.student.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    if (await page.getByRole('button', { name: 'Se connecter', exact: true }).isEnabled()) {
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      try { await page.waitForURL(app + '/student-portal', { timeout: 20000 }); break; } catch { /* cold server: retry */ }
    }
    if (attempt >= 3) throw new Error('login failed');
  }
  await page.goto(app + '/student-portal/online');
  const card = page.locator('li', { hasText: `Online B1 ${run}` });
  await card.getByRole('link', { name: 'Rejoindre le cours' }).waitFor();
  await page.evaluate(() => { window.__eh_spa_marker = 'portal'; });
  const [roomResponse] = await Promise.all([
    page.waitForResponse(r => r.request().isNavigationRequest() && r.url().includes(`/online/room/${ids.open}`)),
    card.getByRole('link', { name: 'Rejoindre le cours' }).click(),
  ]);
  await page.waitForURL(new RegExp(`/online/room/${ids.open}$`));
  pass('room entered by a full document navigation with room-only headers',
    (await page.evaluate(() => window.__eh_spa_marker)) === undefined && roomResponse.headers()['permissions-policy'] === 'camera=(self), microphone=(self), geolocation=()',
    { permissionsPolicy: roomResponse.headers()['permissions-policy'] });

  // The join route answers with a zoom-video embed; the Zoom session name derives from the room reference and the lesson.
  await page.waitForFunction(() => document.querySelector('[data-testid="zoom-room"]') !== null, null, { timeout: 60000 });
  const join = JSON.parse(joinBodies.at(-1) || '{}');
  report.join = { provider: join.provider, kind: join.embed?.kind, sessionName: join.embed?.sessionName, role: join.role, display_label: join.display_label,
    expiresAt: join.embed?.expiresAt, tokenExpiresAt: join.embed?.tokenExpiresAt, hasToken: typeof join.embed?.token === 'string' };
  pass('join route: zoom-video embed, session per lesson, no room reference field', join.provider === 'zoom-video' && join.embed?.kind === 'zoom-video'
    && join.embed?.sessionName === `${roomRef}.${ids.open}`.toLowerCase() && !joinBodies.some(b => b.includes('"room_ref"')), report.join);

  // The toolkit joins: a websocket to a zoom.us host opens and the participant label appears.
  const started = Date.now();
  while (Date.now() - started < 120000 && !report.websockets.some(w => w.host.endsWith('zoom.us'))) await new Promise(r => setTimeout(r, 1000));
  await new Promise(r => setTimeout(r, 8000));
  const text = await page.evaluate(() => document.body.innerText);
  report.pageUrlAfterJoin = page.url(); report.pageTextAfterJoin = text.slice(0, 400);
  report.toolkitChunkLoaded = await page.evaluate(() => [...document.scripts].some(s => /videosdk|zoom/i.test(s.src)) || [...performance.getEntriesByType('resource')].some(e => /videosdk|zoom/i.test(e.name)));
  const cspBlocked = await page.evaluate(() => window.__cspBlocked);
  report.cspBlocked = cspBlocked;
  const jwtError = report.console.some(c => /Verify JWT|JOIN_MEETING_FAILED/i.test(c.text));
  const wsHosts = [...new Set(report.websockets.map(w => w.host))];
  const toolkitUi = /Join Audio|No other participants|Participants|Leave/i.test(text);
  pass('toolkit joined the Zoom session under the room CSP', wsHosts.some(h => h.endsWith('zoom.us')) && !jwtError && toolkitUi && !text.includes('n’a pas pu être ouverte'),
    { websocketHosts: wsHosts, toolkitUi, jwtError, cspBlockedCount: cspBlocked.length });
  const zoomBlocked = cspBlocked.filter(b => b.blocked.includes('zoom.us'));
  pass('CSP refuses no Zoom host on the room path', zoomBlocked.length === 0, { blocked: [...new Set(zoomBlocked.map(b => b.blocked))].slice(0, 5) });
  // A7-record: what the telemetry carries. The platform identifiers must not appear in it.
  const bodies = report.telemetry.map(t => { try { return decodeURIComponent(t.body); } catch { return t.body; } }).join('\n');
  const userKey = join.embed?.token ? JSON.parse(Buffer.from(join.embed.token.split('.')[1], 'base64url')).user_key : '\u0000';
  // Must never leave the platform: the full name, the e-mail, the learner id, the lesson id.
  const leaks = { fullName: bodies.includes('Amal Bennani'), email: bodies.includes(users.student.email), studentId: bodies.includes(ids.adult), lessonIdOutsideSessionName: bodies.replaceAll(join.embed?.sessionName || '\u0000', '').includes(ids.open) };
  // Already given to Zoom by design (invariant 4) and therefore recorded, not asserted.
  const carried = { displayLabel: bodies.includes('Amal B.'), sessionName: bodies.includes(join.embed?.sessionName || '\u0000'), passUserKey: bodies.includes(userKey) };
  report.telemetrySummary = { requests: report.telemetry.length, hosts: [...new Set(report.telemetry.map(t => t.host))], totalBytes: report.telemetry.reduce((n, t) => n + t.bytes, 0), leaks, carried };
  pass('A7-record: telemetry carries nothing beyond what invariant 4 gives the provider', !Object.values(leaks).some(Boolean), report.telemetrySummary);
  const sample = report.telemetry.find(t => t.body);
  if (sample) { try { const schema = (decodeURIComponent(sample.body).match(/"schema":"([^"]+)"/g) || []).slice(0, 6); console.log('RECORDED telemetry schemas (sample):', JSON.stringify(schema)); } catch { /* ignore */ } }
  console.log('RECORDED Zoom hosts reached under the CSP:', JSON.stringify([...report.zoomHosts].sort()));
  report.sessionNameElements = await page.evaluate(ref => [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && (el.textContent || '').includes(ref))
    .map(el => ({ tag: el.tagName, cls: String(el.className).slice(0, 120), parents: [el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].map(p => p ? `${p.tagName}.${String(p.className).slice(0, 80)}` : '').join(' < ') })), roomRef);
  pass('the technical session name is not displayed to the learner', !(await page.evaluate(() => document.body.innerText)).includes(roomRef), { elements: report.sessionNameElements.slice(0, 3) });
  // Dismiss the toolkit's audio prompt if it is still up, so that Quitter is clickable.
  const notNow = page.getByRole('button', { name: 'Not Now' });
  if (await notNow.count()) await notNow.first().click().catch(() => {});

  // Quitter: full document navigation back to the portal.
  await page.evaluate(() => { window.__eh_spa_marker = 'room'; });
  const [backResponse] = await Promise.all([
    page.waitForResponse(r => r.request().isNavigationRequest() && r.url().endsWith('/student-portal/online')),
    page.getByTestId('room-leave').click(),
  ]);
  await page.waitForURL(app + '/student-portal/online');
  pass('Quitter leaves by a full document navigation', (await page.evaluate(() => window.__eh_spa_marker)) === undefined
    && backResponse.headers()['permissions-policy'] === 'camera=(), microphone=(), geolocation=()', {});
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
  report.zoomHosts = [...report.zoomHosts].sort();
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
  const userIds = Object.values(users).map(u => `'${u.id}'`).join(',') || 'null';
  sql(`begin;
    delete from public.online_join_events where token_id in (select id from public.online_join_tokens where lesson_id = '${ids.open}');
    delete from public.online_join_tokens where lesson_id = '${ids.open}';
    delete from public.online_lessons where group_id = '${ids.group}';
    delete from public.online_courses where group_id = '${ids.group}';
    set eh.enrollment_command = on; delete from public.enrollments where student_id = '${ids.adult}';
    delete from public.students where id = '${ids.adult}';
    delete from public.groups where id = '${ids.group}';
    delete from public.teachers where id = '${ids.teacher}';
    delete from public.activity_log where target_id in ('${ids.adult}','${ids.group}','${ids.teacher}') or actor_id in (${userIds});
    alter table public.profiles disable trigger role_security_guard;
    delete from auth.users where id in (${userIds});
    alter table public.profiles enable trigger role_security_guard;
    update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
    commit;`);
}
