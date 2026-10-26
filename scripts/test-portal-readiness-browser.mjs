// Portal readiness (plan PRF-r2) browser check, local stack only. Requires the built
// app on 127.0.0.1:3101 (npm run build && npm run start). Seeds a linked teacher, a
// linked parent, a self-linked adult learner and the office login, then checks in
// Chromium: the teacher portal, group page (no phone column), attendance and
// assessments render from the class list; the parent and student portals render
// from the projections; every message composer lists names, never an address; no
// Supabase response received by the teacher's or the parent's browser carries
// another person's address or phone. Removes only this run's fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';

assertLocalFeatureBranch(new URL('../', import.meta.url));
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
}));
const base = 'http://127.0.0.1:54321', container = 'supabase_db_hills-admin-next', app = 'http://localhost:3101';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'local Supabase only');
setTimeout(() => { console.error('FAIL portal browser check stalled'); process.exit(1); }, 8 * 60_000).unref();
const sql = input => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input, encoding: 'utf8', timeout: 120_000 }).trim();
const run = 'portal-ui-' + randomUUID().slice(0, 8), password = randomBytes(18).toString('base64url');
const ids = Object.fromEntries(['teacher', 'group', 'child', 'other', 'adult'].map(k => [k, randomUUID()]));
const users = {};
const phones = { child: '0655' + run.slice(-6), other: '0666' + run.slice(-6), adult: '0677' + run.slice(-6) };
let browser;

async function createUser(key, role) {
  const email = `${run}-${key}@example.invalid`;
  const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.equal(response.status, 200, 'local Auth user');
  const id = (await response.json()).id;
  sql(`update public.profiles set role='${role}', full_name='${run} ${key}' where id='${id}'`);
  users[key] = { id, email };
}
async function signIn(key, home) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Only the local app and the local stack; everything else is refused.
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const bodies = [];
  page.on('response', async response => {
    if (!response.url().startsWith(base)) return;
    try { bodies.push(await response.text()); } catch { /* navigation discarded the body */ }
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(app + '/login'); await page.waitForLoadState('networkidle');
    await page.getByLabel('Adresse email', { exact: true }).fill(users[key].email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    try { await page.waitForURL(app + home, { timeout: 15000 }); return { page, bodies, context }; } catch { /* cold build */ }
  }
  throw new Error('Login failed for ' + key);
}
// Every address or phone of the fixtures except the viewer's own login.
function assertNoContacts(bodies, viewer) {
  const values = [...Object.values(phones), ...Object.values(users).map(u => u.email).filter(e => e !== users[viewer].email)];
  for (const body of bodies) for (const value of values) assert.ok(!body.includes(value), `${viewer} received a contact value`);
}
async function composerOptions(page) {
  await page.getByRole('button', { name: /Nouveau message/ }).click();
  const options = await page.locator('#portal-message-to option').allTextContents();
  await page.getByRole('button', { name: 'Fermer' }).click();
  return options;
}

try {
  for (const [key, role] of [['teacher', 'teacher'], ['parent', 'parent'], ['student', 'student'], ['office', 'admin']]) await createUser(key, role);
  sql(`begin;
    insert into public.app_config(key, value, label) values ('portal_office_profile_id', '${users.office.id}', 'Accueil portail ${run}');
    insert into public.teachers(id, full_name, email, contract_type) values ('${ids.teacher}', 'Prof ${run}', '${users.teacher.email}', 'Freelance');
    update public.profiles set linked_teacher_id = '${ids.teacher}' where id = '${users.teacher.id}';
    insert into public.groups(id, name, session_type, niveau, teacher_id, annee, jours, horaire, salle)
      values ('${ids.group}', 'Groupe ${run}', 'Yearly', 'Child 1', '${ids.teacher}', '2026-2027', 'Lundi', '17:00', 'S1');
    insert into public.students(id, full_name, email, parent_email, telephone, status, age_category, session_type, notes) values
      ('${ids.child}', 'Sara ${run}', null, '${users.parent.email}', '${phones.child}', 'Prospect', 'Young Learners (6-12)', 'Yearly', 'note interne'),
      ('${ids.other}', 'Lina ${run}', null, '${run}-other@example.invalid', '${phones.other}', 'Prospect', 'Young Learners (6-12)', 'Yearly', null),
      ('${ids.adult}', 'Karim ${run}', '${users.student.email}', null, '${phones.adult}', 'Prospect', 'Adults (18+)', 'Yearly', null);
    insert into public.enrollments(student_id, group_id, status, session_type, school_year, level) values
      ('${ids.child}', '${ids.group}', 'Validated', 'Yearly', '2026/2027', 'Child 1'),
      ('${ids.other}', '${ids.group}', 'Validated', 'Yearly', '2026/2027', 'Child 1'),
      ('${ids.adult}', '${ids.group}', 'Validated', 'Yearly', '2026/2027', 'Child 1');
    insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at) values
      ('${ids.child}', 'parent', '${users.parent.id}', '${users.parent.email}', 'active', now()),
      ('${ids.adult}', 'self', '${users.student.id}', '${users.student.email}', 'active', now());
    commit;`);
  browser = await chromium.launch({ headless: true });

  // Teacher: portal, group page, attendance and assessments from the class list.
  const teacher = await signIn('teacher', '/teacher-portal');
  await teacher.page.getByText('Groupe ' + run).first().waitFor();
  await teacher.page.getByText('3 apprenants').waitFor();
  await teacher.page.getByRole('button', { name: 'Messages' }).click();
  const teacherOptions = await composerOptions(teacher.page);
  assert.deepEqual(teacherOptions.sort(), ['Accueil English Hills', `Karim ${run}`, `Parent de Sara ${run}`].sort());
  assert.ok(teacherOptions.every(o => !o.includes('@')));
  await teacher.page.goto(app + '/groups/' + ids.group);
  await teacher.page.getByText('Lina ' + run).waitFor();
  assert.equal(await teacher.page.getByRole('columnheader', { name: 'Téléphone' }).count(), 0, 'no phone column for a teacher');
  assert.equal(await teacher.page.getByText(phones.child).count(), 0);
  await teacher.page.goto(app + '/attendance');
  await teacher.page.locator('select').first().selectOption(ids.group);
  await teacher.page.getByText('Sara ' + run).waitFor();
  await teacher.page.goto(app + '/assessments');
  await teacher.page.getByRole('heading').first().waitFor();
  await teacher.page.waitForLoadState('networkidle');
  assertNoContacts(teacher.bodies, 'teacher');
  await teacher.context.close();
  console.log('PASS teacher portal, group page without phone column, attendance and assessments from the class list; names-only composer');

  // Parent: linked child, payments tab, names-only composer.
  const parent = await signIn('parent', '/parent-portal');
  await parent.page.getByText('Sara ' + run).first().waitFor();
  assert.equal(await parent.page.getByText('Lina ' + run).count(), 0, 'another family\'s learner is never listed');
  await parent.page.getByRole('tab', { name: /^Paiements/ }).click();
  await parent.page.getByText('Aucun paiement enregistré.').waitFor();
  await parent.page.getByRole('tab', { name: /^Messages/ }).click();
  const parentOptions = await composerOptions(parent.page);
  assert.deepEqual(parentOptions.sort(), ['Accueil English Hills', `Prof ${run} — enseignant`].sort());
  await parent.page.waitForLoadState('networkidle');
  assertNoContacts(parent.bodies, 'parent');
  await parent.context.close();
  console.log('PASS parent portal from the projections: linked child only, payments, names-only composer, no contact value received');

  // Student: own record through the self link.
  const student = await signIn('student', '/student-portal');
  await student.page.getByText('Karim ' + run).first().waitFor();
  await student.page.waitForLoadState('networkidle');
  assertNoContacts(student.bodies, 'student');
  await student.context.close();
  console.log('PASS student portal from the self link');
  console.log('PASS portal readiness browser check');
} finally {
  if (browser) await browser.close();
  const userIds = Object.values(users).map(u => `'${u.id}'`).join(',') || 'null';
  sql(`begin;
    delete from public.messages where sender_profile_id in (${userIds}) or recipient_profile_id in (${userIds});
    delete from public.family_links where student_id in ('${ids.child}', '${ids.other}', '${ids.adult}');
    set local eh.enrollment_command = on;
    delete from public.attendance where student_id in ('${ids.child}', '${ids.other}', '${ids.adult}');
    delete from public.enrollments where student_id in ('${ids.child}', '${ids.other}', '${ids.adult}');
    delete from public.students where id in ('${ids.child}', '${ids.other}', '${ids.adult}');
    delete from public.groups where id = '${ids.group}';
    update public.profiles set linked_teacher_id = null where linked_teacher_id = '${ids.teacher}';
    delete from public.teachers where id = '${ids.teacher}';
    delete from public.app_config where key = 'portal_office_profile_id' and label = 'Accueil portail ${run}';
    delete from public.activity_log where actor_id in (${userIds}) or target_id in ('${ids.child}', '${ids.other}', '${ids.adult}', '${ids.group}', '${ids.teacher}');
    alter table public.profiles disable trigger role_security_guard;
    delete from auth.users where id in (${userIds});
    alter table public.profiles enable trigger role_security_guard;
    update role_security.director_guard set director_count = (select count(*) from public.profiles where role = 'director');
    commit;`);
  console.log('Synthetic portal UI fixtures removed.');
}
