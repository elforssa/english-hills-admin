// RWR-r5 PR C2 — mobile acceptance at 375 × 812 (a phone at the desk), real UI on the local
// stack, as the receptionist: the screens C2 changes fit the width (no sideways scroll), the
// dialogs stay inside the screen, the touch targets of the new controls are at least 44 px,
// and each writing button is clicked and checked in the database:
//   level tests: « Planifier un test » → the picker → « Planifier le test », then « Déplacer »;
//   attendance: « Tous présents » → « Enregistrer les présences (n) »;
//   groups: a day toggle → « Enregistrer »;
//   learners: the cards view and the learner form.
// Dates come from the server (business date, the hours this run publishes). Synthetic rows
// are removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { openDaySql } from './lib/centre-days.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, removeStaff, sql } from './lib/crm-next-action-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = process.env.CRM_LOCAL_APP || 'http://localhost:3101', run = 'mobile-desk-' + randomUUID().slice(0, 8);
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const TODAY = `(now() at time zone public.centre_utc_offset())::date`;
const today = sql(`select ${TODAY}::text`);
const dow = sql(`select extract(isodow from ${TODAY})::int`) | 0, otherDay = dow % 7 + 1;
const DAY_NAMES = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' };
const id = Object.fromEntries(['teacher', 'group', 'other', 'learner', 'roster'].map(k => [k, randomUUID()]));
const name = k => `${run} ${k}`;
const WIDTH = 375;
let browser, page, users = [], phase = 'setup';
const errors = [];
const one = statement => sql(statement).split('\n').pop();

async function login(user) {
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}
async function fits(label) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  assert.ok(scroll <= inner, `${label}: page wider than the screen (${scroll} > ${inner})`);
}
// Dialogs open with a short zoom-in: measure once every animation on the page has finished.
const settle = () => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
async function inside(locator, label) {
  await settle();
  const box = await locator.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= WIDTH + 0.5, `${label}: outside the screen ${JSON.stringify(box)}`);
}
async function tappable(locator, label) {
  await settle();
  const box = await locator.boundingBox();
  assert.ok(box && box.height >= 44 && box.width >= 44, `${label}: touch target under 44 px ${JSON.stringify(box)}`);
}

try {
  users = await createStaff(env, run, ['director', 'receptionist']);
  const [director, reception] = users;
  sql(`${as(director.id)}select public.crm_create_followup_policy(gen_random_uuid(),${q(JSON.stringify(LIVE_POLICY))}::jsonb);commit;`);
  sql(`begin;
   insert into public.teachers(id,full_name,email) values (${q(id.teacher)},${q(name('teacher'))},${q(run + '-teacher@example.invalid')});
   insert into public.groups(id,name,session_type,niveau,annee,teacher_id,class_days) values
    (${q(id.group)},${q(name('every day'))},'Yearly','Child 1','2026-2027',${q(id.teacher)},array[1,2,3,4,5,6,7]::smallint[]),
    (${q(id.other)},${q(name('other day'))},'Yearly','Child 1','2026-2027',${q(id.teacher)},array[${otherDay}]::smallint[]);
   insert into public.students(id,full_name,status,session_type,niveau_cefr,date_naissance) values
    (${q(id.learner)},${q(name('learner'))},'Prospect','Yearly',null,(${TODAY}-interval '9 years')::date),
    (${q(id.roster)},${q(name('roster'))},'Enrolled','Yearly','Child 1',null);
   select set_config('eh.membership_sync','on',true), set_config('eh.enrollment_command','on',true);
   insert into public.enrollments(student_id,group_id,status,session_type,level,school_year) values
    (${q(id.roster)},${q(id.group)},'Validated','Yearly','Child 1','2026/2027');
   select set_config('eh.membership_sync','',true), set_config('eh.enrollment_command','',true);
   commit;`);
  const day1 = one(`select ${openDaySql(1, ['10:00'])}`), day2 = one(`select ${openDaySql(2, ['11:00'])}`);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 812 }, isMobile: true, hasTouch: true, bypassCSP: !!process.env.CRM_LOCAL_APP });
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await login(reception);

  phase = 'level test booking';
  await page.goto(app + '/placement-tests');
  await page.getByRole('button', { name: 'Planifier un test', exact: true }).waitFor();
  await fits('/placement-tests');
  await page.getByRole('button', { name: 'Planifier un test', exact: true }).click();
  const picker = page.getByRole('dialog').last();
  await inside(picker, 'people picker');
  await picker.getByLabel('Nom, téléphone ou e-mail', { exact: true }).fill(name('learner'));
  const result = picker.locator(`[data-testid=people-result][data-id="${id.learner}"]`);
  await tappable(result, 'picker result');
  await result.click();
  let box = page.getByTestId('student-test-dialog');
  await box.getByLabel('Date', { exact: true }).fill(day1);
  await box.getByLabel('Heure', { exact: true }).fill('10:00');
  await inside(box, 'booking dialog');
  await box.getByRole('button', { name: 'Planifier le test', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  assert.equal(one(`select status||'|'||heure||'|'||date_test from public.placement_tests where student_id=${q(id.learner)}`), `Planifié|10:00|${day1}`);
  console.log('PASS 375 px: « Planifier un test » → the picker → booked');

  phase = 'level test move';
  // The phone list shows the test as a card.
  await page.getByRole('button', { name: `Test du ${day1}`, exact: true }).first().click();
  box = page.getByTestId('student-test-dialog');
  await box.getByTestId('test-status').waitFor();
  await inside(box, 'test dialog');
  const move = box.getByRole('radio', { name: 'Déplacer', exact: true });
  await tappable(move, '« Déplacer »');
  await move.click();
  await box.getByLabel('Date', { exact: true }).fill(day2);
  await box.getByLabel('Heure', { exact: true }).fill('11:00');
  await box.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  assert.equal(one(`select heure||'|'||date_test from public.placement_tests where student_id=${q(id.learner)}`), `11:00|${day2}`);
  console.log('PASS 375 px: the test dialog fits, « Déplacer » moves the test');

  phase = 'attendance';
  await page.goto(app + '/attendance');
  await page.waitForFunction(text => [...document.querySelectorAll('#attendance-group option')].some(o => o.textContent.includes(text)), name('every day'));
  await page.locator('#attendance-group').selectOption(id.group);
  await page.getByTestId('attendance-counts').getByText('1 non saisi', { exact: true }).waitFor();
  await fits('/attendance');
  await page.getByRole('button', { name: 'Tous présents', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les présences (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les présences', exact: true }).waitFor();
  assert.equal(one(`select string_agg(status,',') from public.attendance where group_id=${q(id.group)} and session_date=${q(today)}`), 'Présent');
  console.log('PASS 375 px: attendance « Tous présents » and the save');

  phase = 'group days';
  await page.goto(app + '/groups');
  await page.getByRole('button', { name: `Modifier le groupe ${name('other day')}`, exact: true }).click();
  const groupDialog = page.getByRole('dialog').last();
  await inside(groupDialog, 'group dialog');
  const toggle = groupDialog.getByRole('button', { name: DAY_NAMES[dow], exact: true });
  await toggle.scrollIntoViewIfNeeded();
  await tappable(toggle, 'day toggle');
  await toggle.click();
  await groupDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await groupDialog.waitFor({ state: 'hidden' });
  assert.equal(one(`select class_days::text from public.groups where id=${q(id.other)}`), `{${[dow, otherDay].sort((a, b) => a - b).join(',')}}`);
  await fits('/groups');
  console.log('PASS 375 px: the group day toggles (44 px) save class_days');

  phase = 'learners';
  await page.goto(`${app}/students?view=cards&q=${encodeURIComponent(run)}`);
  await page.getByTestId('students-cards').getByText(name('roster'), { exact: true }).waitFor();
  await fits('/students?view=cards');
  await page.goto(app + '/students/new');
  await page.locator('#date_naissance').waitFor();
  await fits('/students/new');
  console.log('PASS 375 px: the cards view and the learner form fit the width');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS mobile reception browser suite');
} catch (error) {
  console.error(phase, error.message);
  if (page) await page.screenshot({ path: join(tmpdir(), 'hills-mobile-reception-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  sql(`begin;
   delete from public.attendance where group_id in (${q(id.group)},${q(id.other)});
   delete from public.placement_tests where student_id=${q(id.learner)};
   select set_config('eh.membership_sync','on',true), set_config('eh.enrollment_command','on',true);
   delete from public.enrollments where student_id=${q(id.roster)};
   delete from public.students where id in (${q(id.learner)},${q(id.roster)});
   delete from public.groups where id in (${q(id.group)},${q(id.other)});
   delete from public.teachers where id=${q(id.teacher)};
   commit;`);
  removeStaff(users.map(u => u.id));
  console.log('PASS synthetic browser fixtures removed');
}
