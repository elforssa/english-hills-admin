// Online learning browser check (plan OL-r4 test strategy), local stack and fake provider
// only. Requires a production build (`npm run build`); starts its own `next start` with
// the live gate on and ONLINE_VIDEO_PROVIDER=fake, seeds synthetic users and an active
// course whose lessons sit relative to the current time (the database clock decides the
// join window), then checks: an adult joins from the student portal on a 390 px viewport
// and on desktop; a parent joins for a child; the join button is disabled outside the
// window; the teacher marks attendance and writes the report; no response carries the
// provider room reference; entering the room from the portal and leaving it through
// Quitter are full document navigations and the two documents carry their own headers
// (OL-r6 A6, B1). Removes only this run's fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const base = process.env.OL_SUPABASE_URL || file.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.OL_SERVICE_ROLE_KEY || file.SUPABASE_SERVICE_ROLE_KEY;
const container = process.env.OL_DB_CONTAINER || 'supabase_db_hills-admin-next';
const port = process.env.OL_APP_PORT || '3102', app = `http://localhost:${port}`;
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, 'local Supabase only');
setTimeout(() => { console.error('FAIL online browser check stalled'); process.exit(1); }, 8 * 60_000).unref();
const sql = statement => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8', timeout: 120_000 }).trim();

const run = 'online-browser-' + randomUUID().slice(0, 8);
const password = randomBytes(18).toString('base64url');
const ids = Object.fromEntries(['teacher', 'adult', 'child', 'group', 'kids', 'open', 'later', 'kidsOpen'].map(k => [k, randomUUID()]));
const users = {};
let server, browser, serverLog = '';

async function createUser(role) {
  const email = `${run}-${role}@example.invalid`;
  const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.equal(response.status, 200, 'local Auth user');
  const id = (await response.json()).id;
  sql(`update public.profiles set role='${role}' where id='${id}'`);
  users[role] = { id, email };
  return users[role];
}

async function signIn(context, role, home) {
  const page = await context.newPage();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(app + '/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Adresse email', { exact: true }).fill(users[role].email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    if (!(await page.getByRole('button', { name: 'Se connecter', exact: true }).isEnabled())) continue;
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    try { await page.waitForURL(app + home, { timeout: 15000 }); return page; } catch { /* cold build reload */ }
  }
  throw new Error(`Login failed for ${role}`);
}

function watchJoin(page, seen) {
  page.on('response', async response => {
    if (!response.url().includes('/api/online/')) return;
    try { seen.push(await response.text()); } catch { /* navigation discarded the body */ }
  });
}

try {
  await createUser('student'); await createUser('parent'); await createUser('teacher'); await createUser('director');
  sql(`insert into public.teachers(id, full_name, email, contract_type) values ('${ids.teacher}', 'Sara ${run}', '${users.teacher.email}', 'Freelance');
    insert into public.students(id, full_name, email, parent_email, status, session_type, niveau_cefr) values
      ('${ids.adult}', 'Amal Bennani', '${users.student.email}', null, 'Enrolled', 'Online', 'B1'),
      ('${ids.child}', 'Lina Tazi', null, '${users.parent.email}', 'Enrolled', 'Online', 'A1');
    insert into public.groups(id, name, session_type, niveau) values
      ('${ids.group}', '${run} adultes', 'Online', 'B1'), ('${ids.kids}', '${run} enfants', 'Online', 'A1');
    insert into public.online_courses(group_id, teacher_id, audience, capacity, status, provider, provider_room_ref, term_start, term_end) values
      ('${ids.group}', '${ids.teacher}', 'adult', 8, 'active', 'fake', 'fake-room-${run.slice(-8)}a', current_date - 1, current_date + 30),
      ('${ids.kids}', '${ids.teacher}', 'child', 8, 'active', 'fake', 'fake-room-${run.slice(-8)}b', current_date - 1, current_date + 30);
    insert into public.enrollments(student_id, group_id, status, session_type, school_year, level) values
      ('${ids.adult}', '${ids.group}', 'Validated', 'Online', '2026/2027', 'B1'),
      ('${ids.child}', '${ids.kids}', 'Validated', 'Online', '2026/2027', 'A1');
    insert into public.online_consents(student_id, recorded_by) values ('${ids.child}', '${users.parent.id}');
    insert into public.online_lessons(id, group_id, starts_at, ends_at, teacher_id) values
      ('${ids.open}', '${ids.group}', now() + interval '5 minutes', now() + interval '65 minutes', '${ids.teacher}'),
      ('${ids.later}', '${ids.group}', now() + interval '3 hours', now() + interval '4 hours', '${ids.teacher}'),
      ('${ids.kidsOpen}', '${ids.kids}', now() + interval '5 minutes', now() + interval '65 minutes', '${ids.teacher}');`);

  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', port], {
    env: { ...process.env, ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'fake', DISABLE_EXTERNAL_EMAIL: 'true',
      NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_DSN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/login`)).ok) break; } catch { /* starting */ }
    if (i > 120 || server.exitCode !== null) throw new Error('Online check server failed to start: ' + serverLog.slice(-1500));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true });
  const contextOptions = { bypassCSP: process.env.OL_BYPASS_CSP === '1' };
  const bodies = [];

  // Adult learner, phone viewport: lesson list, disabled later lesson, join.
  const phone = await browser.newContext({ ...contextOptions, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let page = await signIn(phone, 'student', '/student-portal');
  watchJoin(page, bodies);
  await page.goto(app + '/student-portal/online');
  const openCard = page.locator('li', { hasText: `${run} adultes` }).filter({ has: page.getByRole('link', { name: 'Rejoindre le cours' }) });
  await openCard.first().waitFor();
  const disabled = page.getByRole('button', { name: /Ouvre à \d{2}:\d{2}/ });
  await disabled.first().waitFor();
  assert.equal(await disabled.first().isDisabled(), true, 'join disabled outside the window');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll at 390 px');
  // Hard navigation into the room: a marker set on the portal document must not survive,
  // and the room document must carry the room-only headers (OL-r6 A6, B1).
  const portalHeaders = (await page.goto(app + '/student-portal/online')).headers();
  assert.equal(portalHeaders['permissions-policy'], 'camera=(), microphone=(), geolocation=()', 'portal document keeps the global Permissions-Policy');
  assert.ok(!portalHeaders['content-security-policy'].includes('zoom.us'), 'portal CSP has no Zoom host');
  await openCard.first().waitFor();
  await page.evaluate(() => { window.__eh_spa_marker = 'portal'; });
  const [roomResponse] = await Promise.all([
    page.waitForResponse(r => r.request().isNavigationRequest() && r.url().includes(`/online/room/${ids.open}`)),
    openCard.first().getByRole('link', { name: 'Rejoindre le cours' }).click(),
  ]);
  await page.waitForURL(new RegExp(`/online/room/${ids.open}$`));
  assert.equal(await page.evaluate(() => window.__eh_spa_marker), undefined, 'entering the room is a full document navigation');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type), 'navigate', 'a new navigation entry');
  assert.equal(roomResponse.headers()['permissions-policy'], 'camera=(self), microphone=(self), geolocation=()', 'room document allows camera and microphone');
  assert.ok(roomResponse.headers()['content-security-policy'].includes('https://source.zoom.us') && roomResponse.headers()['content-security-policy'].includes("'wasm-unsafe-eval'"), 'room CSP admits the Zoom hosts');
  assert.ok(!roomResponse.headers()['content-security-policy'].includes('telemetry'), 'room CSP never lists the telemetry host');
  assert.equal(roomResponse.headers()['cross-origin-embedder-policy'], undefined, 'no COEP in the pilot');
  await page.getByText('Salle de cours (fournisseur de test)').waitFor();
  await page.getByText('Amal B.', { exact: true }).waitFor();
  assert.ok(!(await page.content()).includes('fake-room-'), 'no room reference in the page');
  console.log('PASS adult learner joins from the student portal on a 390 px viewport; later lesson disabled; hard navigation in with room-only headers');
  // Hard navigation out through Quitter: back to the portal document with the global headers.
  await page.evaluate(() => { window.__eh_spa_marker = 'room'; });
  const [backResponse] = await Promise.all([
    page.waitForResponse(r => r.request().isNavigationRequest() && r.url().endsWith('/student-portal/online')),
    page.getByTestId('room-leave').click(),
  ]);
  await page.waitForURL(app + '/student-portal/online');
  assert.equal(await page.evaluate(() => window.__eh_spa_marker), undefined, 'leaving the room is a full document navigation');
  assert.equal(backResponse.headers()['permissions-policy'], 'camera=(), microphone=(), geolocation=()', 'portal document after Quitter keeps the global headers');
  assert.ok(!backResponse.headers()['content-security-policy'].includes('zoom.us'));
  console.log('PASS Quitter leaves the room with a full document navigation back to the portal');

  // Adult learner, desktop.
  const desktop = await browser.newContext({ ...contextOptions, viewport: { width: 1280, height: 800 } });
  page = await signIn(desktop, 'student', '/student-portal');
  watchJoin(page, bodies);
  await page.goto(app + `/online/room/${ids.open}`);
  await page.getByText('Salle de cours (fournisseur de test)').waitFor();
  await page.goto(app + `/online/room/${ids.later}`);
  await page.getByText('La salle n’est pas ouverte à cette heure.').waitFor();
  await page.getByText(/La salle ouvre à \d{2}:\d{2}/).waitFor();
  console.log('PASS adult learner joins on desktop; a closed window is refused by the server with French text');

  // Parent for a child (consent recorded).
  const parent = await browser.newContext({ ...contextOptions, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await signIn(parent, 'parent', '/parent-portal');
  watchJoin(page, bodies);
  await page.goto(app + '/parent-portal/online');
  const childCard = page.locator('li', { hasText: 'Lina Tazi' });
  await childCard.getByRole('link', { name: 'Rejoindre le cours' }).click();
  await page.waitForURL(new RegExp(`/online/room/${ids.kidsOpen}\\?student=${ids.child}$`));
  await page.getByText('Lina T.', { exact: true }).waitFor();
  console.log('PASS parent joins the child’s lesson on the parent’s device');

  // Teacher: host pass, attendance and report.
  const teacher = await browser.newContext({ ...contextOptions, viewport: { width: 1280, height: 800 } });
  page = await signIn(teacher, 'teacher', '/teacher-portal');
  watchJoin(page, bodies);
  await page.goto(app + '/teacher-portal/online');
  const lessonCard = page.locator('li', { hasText: `${run} adultes` }).filter({ has: page.getByRole('link', { name: 'Ouvrir la salle' }) });
  await lessonCard.first().getByRole('link', { name: 'Présences' }).click();
  await page.waitForURL(new RegExp(`/teacher-portal/online/${ids.open}$`));
  await page.getByLabel('Présence de Amal B.').selectOption('Présent');
  await page.getByLabel('Compte rendu (deux lignes)').fill('Unité 3 vue. Révision du présent simple.');
  await page.getByRole('button', { name: 'Enregistrer les présences' }).click();
  await page.getByText('Présences enregistrées').waitFor();
  assert.equal(await page.getByText(/@example/).count(), 0, 'no learner e-mail on the teacher page');
  assert.equal(sql(`select status from public.online_attendance where lesson_id='${ids.open}' and student_id='${ids.adult}'`), 'Présent');
  assert.equal(sql(`select report from public.online_lessons where id='${ids.open}'`), 'Unité 3 vue. Révision du présent simple.');
  await page.goto(app + `/online/room/${ids.open}`);
  await page.getByText('Salle de cours (fournisseur de test)').waitFor();
  await page.getByText(/· enseignant$/).waitFor();
  console.log('PASS teacher records attendance and the report; host joins');

  // Director: the staff course page, then a cancellation through the gated lesson route,
  // which writes the family notice and marks it sent (external e-mail disabled).
  const director = await browser.newContext({ ...contextOptions, viewport: { width: 1280, height: 900 } });
  page = await signIn(director, 'director', '/dashboard');
  await page.goto(app + '/online');
  await page.getByRole('link', { name: new RegExp(`${run} adultes`) }).click();
  await page.waitForURL(new RegExp(`/online/${ids.group}$`));
  await page.getByRole('heading', { name: `${run} adultes` }).waitFor();
  const laterTime = sql(`select to_char(starts_at at time zone 'Africa/Casablanca', 'HH24:MI') from public.online_lessons where id='${ids.later}'`);
  const laterRow = page.locator('tr', { hasText: `${laterTime}–` });
  await laterRow.getByRole('button', { name: 'Annuler' }).click();
  await page.getByLabel('Motif (envoyé aux familles)').fill('Enseignante absente');
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByText('Cours annulé, familles prévenues').waitFor();
  assert.equal(sql(`select status || ':' || cancel_reason from public.online_lessons where id='${ids.later}'`), 'cancelled:Enseignante absente');
  assert.equal(sql(`select count(*) || ':' || bool_and(sent) from public.notifications where type='online_lesson_cancelled' and recipient_email='${users.student.email}'`), '1:true');
  console.log('PASS director cancels a lesson from the course page; the family notice is written and marked sent');

  assert.equal(sql(`select count(*) from public.online_join_tokens where lesson_id in ('${ids.open}','${ids.kidsOpen}') and revoked_at is null`), '4',
    'passes issued for the phone learner, desktop learner, child and host');
  assert.ok(bodies.length >= 4 && bodies.every(text => !text.includes('fake-room-') && !text.includes(serviceKey)), 'no room reference or secret in any online response');
  console.log('PASS online learning browser check');
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
  const userIds = Object.values(users).map(u => `'${u.id}'`).join(',') || 'null';
  sql(`begin;
    delete from public.online_join_events where token_id in (select id from public.online_join_tokens where lesson_id in ('${ids.open}','${ids.later}','${ids.kidsOpen}'));
    delete from public.online_join_tokens where lesson_id in ('${ids.open}','${ids.later}','${ids.kidsOpen}');
    delete from public.notifications where type like 'online%' and recipient_email in ('${users.student?.email}','${users.parent?.email}');
    delete from public.online_attendance where lesson_id in ('${ids.open}','${ids.later}','${ids.kidsOpen}');
    delete from public.online_lessons where group_id in ('${ids.group}','${ids.kids}');
    delete from public.online_courses where group_id in ('${ids.group}','${ids.kids}');
    delete from public.online_consents where student_id = '${ids.child}';
    set local eh.enrollment_command = on; delete from public.enrollments where student_id in ('${ids.adult}','${ids.child}');
    delete from public.students where id in ('${ids.adult}','${ids.child}');
    delete from public.groups where id in ('${ids.group}','${ids.kids}');
    delete from public.teachers where id = '${ids.teacher}';
    delete from public.activity_log where target_id in ('${ids.adult}','${ids.child}','${ids.group}','${ids.kids}','${ids.teacher}') or actor_id in (${userIds});
    -- A synthetic director may be the only one: the established cleanup pattern.
    alter table public.profiles disable trigger role_security_guard;
    delete from auth.users where id in (${userIds});
    alter table public.profiles enable trigger role_security_guard;
    update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
    commit;`);
}
