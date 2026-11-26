// RWR-r5 PR C2 (migration 141) — every writing button the PR adds or changes, clicked in the
// real UI on the local stack, and the database checked after each:
//   §6.2 level tests: « Planifier un test » (a learner books, a prospect is routed to its file),
//        one planned test per person, « Déplacer », « Annuler le test » (reason required),
//        « Noter absent », « Résultat » after the start time, « Supprimer le test » (direction);
//   §6.3 attendance: today's groups by default, « Non saisi » until « Tous présents », the
//        counter, the save, a day outside the class days, a closed date refused for reception
//        and saved by the director with « Séance exceptionnelle »; the group day toggles;
//   §6.4 learner files: birth date never after today and at least a year ago, the category
//        against the programme, the cards/table toggle and the /students-directory redirect,
//        « Adultes autorisés au retrait » hidden on an adults-only file;
//   §6.5 (OD-9 A): no online programme for reception, « Nouveau groupe en ligne » for the
//        direction only.
// Dates come from the server (business date, the hours this run publishes); a test is put
// in the past in SQL (the start-time rule is time-based). Synthetic rows removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { openDaySql } from './lib/centre-days.mjs';
import { LIVE_POLICY, createLead, createStaff, localEnv, q, removeStaff, sql } from './lib/crm-next-action-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = process.env.CRM_LOCAL_APP || 'http://localhost:3101', run = 'desk-academics-' + randomUUID().slice(0, 8);
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const TODAY = `(now() at time zone public.centre_utc_offset())::date`;
const today = sql(`select ${TODAY}::text`), twoDaysAgo = sql(`select (${TODAY}-2)::text`);
const dow = sql(`select extract(isodow from ${TODAY})::int`) | 0;
const DAY_NAMES = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' };
const otherDay = dow % 7 + 1; // tomorrow's weekday: never today
const id = Object.fromEntries(['teacher', 'gAll', 'gOther', 'learner', 'absentee', 'deleted', 'roster', 'roster2', 'adult', 'absentTest', 'deletedTest'].map(k => [k, randomUUID()]));
const name = k => `${run} ${k}`;
let browser, page, users = [], phase = 'setup';
const errors = [];
const dialog = () => page.getByRole('dialog').last();
const one = statement => sql(statement).split('\n').pop();

async function login(user) {
  await page.context().clearCookies();
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}
const placementRow = text => page.getByRole('row').filter({ hasText: text });
async function openTest(text, date) {
  await page.goto(app + '/placement-tests');
  await placementRow(text).getByRole('button', { name: date ? `Test du ${date}` : /^Test du/, exact: !!date }).click();
  await page.getByTestId('student-test-dialog').getByTestId('test-status').waitFor();
  return page.getByTestId('student-test-dialog');
}
const testRow = learner => sql(`select status||'|'||coalesce(heure,'')||'|'||date_test||'|'||coalesce(niveau_recommande,'')||'|'||coalesce(cancel_reason,'') from public.placement_tests where student_id=${q(learner)} order by created_at desc limit 1`);

try {
  users = await createStaff(env, run, ['director', 'receptionist']);
  const [director, reception] = users;
  // Published hours for this run: the live week, and the centre closed two days ago (§4.5).
  sql(`${as(director.id)}select public.crm_create_followup_policy(gen_random_uuid(),${q(JSON.stringify({ ...LIVE_POLICY, date_exceptions: [twoDaysAgo] }))}::jsonb);commit;`);
  assert.equal(sql(`select crm_security.closed_dates(crm_security.current_policy_id())::text`), `{${twoDaysAgo}}`);
  sql(`begin;
   insert into public.teachers(id,full_name,email) values (${q(id.teacher)},${q(name('teacher'))},${q(run + '-teacher@example.invalid')});
   insert into public.groups(id,name,session_type,niveau,annee,teacher_id,class_days) values
    (${q(id.gAll)},${q(name('every day'))},'Yearly','Child 1','2026-2027',${q(id.teacher)},array[1,2,3,4,5,6,7]::smallint[]),
    (${q(id.gOther)},${q(name('other day'))},'Yearly','Child 1','2026-2027',${q(id.teacher)},array[${otherDay}]::smallint[]);
   insert into public.students(id,full_name,status,session_type,niveau_cefr,date_naissance) values
    (${q(id.learner)},${q(name('learner'))},'Prospect','Yearly',null,(${TODAY}-interval '9 years')::date),
    (${q(id.absentee)},${q(name('absentee'))},'Prospect','Yearly',null,(${TODAY}-interval '10 years')::date),
    (${q(id.deleted)},${q(name('deleted'))},'Prospect','Yearly',null,null),
    (${q(id.roster)},${q(name('roster'))},'Enrolled','Yearly','Child 1',null),
    (${q(id.roster2)},${q(name('roster2'))},'Enrolled','Yearly','Child 1',null),
    (${q(id.adult)},${q(name('adult'))},'Prospect','Adults',null,null);
   select set_config('eh.membership_sync','on',true), set_config('eh.enrollment_command','on',true);
   insert into public.enrollments(student_id,group_id,status,session_type,level,school_year) values
    (${q(id.roster)},${q(id.gAll)},'Validated','Yearly','Child 1','2026/2027'),
    (${q(id.roster2)},${q(id.gOther)},'Validated','Yearly','Child 1','2026/2027');
   select set_config('eh.membership_sync','',true), set_config('eh.enrollment_command','',true);
   -- Planned tests that already started (yesterday): one to mark absent, one to delete.
   insert into public.placement_tests(id,student_id,student_name,date_test,heure,status) values
    (${q(id.absentTest)},${q(id.absentee)},${q(name('absentee'))},${TODAY}-1,'10:00','Planifié'),
    (${q(id.deletedTest)},${q(id.deleted)},${q(name('deleted'))},${TODAY}-1,'11:00','Planifié');
   commit;`);
  const lead = createLead(reception.id, name('prospect'));
  const day1 = one(`select ${openDaySql(1, ['10:00'])}`), day2 = one(`select ${openDaySql(2, ['11:00'])}`);
  assert.match(day1, /^\d{4}-\d\d-\d\d$/); assert.match(day2, /^\d{4}-\d\d-\d\d$/);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: !!process.env.CRM_LOCAL_APP });
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await login(reception);

  // ===== §6.2 Level tests.
  phase = 'book through the picker';
  await page.goto(app + '/placement-tests');
  await page.getByRole('button', { name: 'Planifier un test', exact: true }).click();
  await dialog().getByLabel('Nom, téléphone ou e-mail', { exact: true }).fill(name('learner'));
  await dialog().locator(`[data-testid=people-result][data-kind=student][data-id="${id.learner}"]`).click();
  let box = page.getByTestId('student-test-dialog');
  await box.getByLabel('Date', { exact: true }).fill(day1);
  await box.getByRole('button', { name: 'Planifier le test', exact: true }).click();
  await box.getByText('Indiquez l’heure du test.', { exact: false }).waitFor();
  assert.equal(one(`select count(*) from public.placement_tests where student_id=${q(id.learner)}`), '0', 'nothing booked without a time');
  await box.getByLabel('Heure', { exact: true }).fill('10:00');
  await box.getByRole('button', { name: 'Planifier le test', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  assert.equal(testRow(id.learner), `Planifié|10:00|${day1}||`, 'booked, no level (§6.2)');
  await placementRow(name('learner')).getByText('Planifié', { exact: true }).first().waitFor();
  console.log('PASS book: the picker finds the learner, the time is required, the test is Planifié without a level');

  phase = 'one planned test per person';
  await page.getByRole('button', { name: 'Planifier un test', exact: true }).click();
  await dialog().getByLabel('Nom, téléphone ou e-mail', { exact: true }).fill(name('learner'));
  await dialog().locator(`[data-testid=people-result][data-id="${id.learner}"]`).click();
  box = page.getByTestId('student-test-dialog');
  await box.getByLabel('Date', { exact: true }).fill(day2);
  await box.getByLabel('Heure', { exact: true }).fill('11:00');
  await box.getByRole('button', { name: 'Planifier le test', exact: true }).click();
  await box.getByRole('alert').filter({ hasText: 'Un test est déjà planifié pour cette personne' }).waitFor();
  assert.equal(one(`select count(*) from public.placement_tests where student_id=${q(id.learner)}`), '1');
  await box.getByRole('button', { name: 'Fermer', exact: true }).first().click();
  // The dirty guard asks before dropping the typed date.
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abandonner', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  console.log('PASS a second planned test for the same person is refused, in French');

  phase = 'prospect routed';
  await page.getByRole('button', { name: 'Planifier un test', exact: true }).click();
  await dialog().getByLabel('Nom, téléphone ou e-mail', { exact: true }).fill(name('prospect'));
  await dialog().locator(`[data-testid=people-result][data-kind=prospect][data-id="${lead}"]`).click();
  await page.waitForURL(url => url.pathname === '/crm/leads' && url.searchParams.get('lead') === lead);
  assert.equal(one(`select count(*) from public.placement_tests where crm_lead_id=${q(lead)}`), '0', 'nothing booked for a prospect from the picker');
  console.log('PASS a prospect is routed to its file (its test is booked with the appointment)');

  phase = 'move';
  box = await openTest(name('learner'));
  assert.equal(await box.getByRole('radio', { name: 'Absent', exact: true }).count(), 0, 'no « Absent » before the start time');
  assert.equal(await box.getByRole('radio', { name: 'Résultat', exact: true }).count(), 0, 'no result before the start time');
  await box.getByRole('radio', { name: 'Déplacer', exact: true }).click();
  await box.getByLabel('Date', { exact: true }).fill(day2);
  await box.getByLabel('Heure', { exact: true }).fill('11:00');
  await box.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  assert.equal(testRow(id.learner), `Planifié|11:00|${day2}||`);
  console.log('PASS « Déplacer » moves the same test');

  phase = 'stale write';
  // Someone else edits the test while the dialog is open (ADR-009): refused, nothing
  // overwritten, and the form is rebuilt from the stored test.
  box = await openTest(name('learner'));
  await box.getByRole('radio', { name: 'Déplacer', exact: true }).click();
  await box.getByLabel('Heure', { exact: true }).fill('10:30');
  sql(`update public.placement_tests set examinateur='Autre poste', updated_at=clock_timestamp() where student_id=${q(id.learner)} and status='Planifié'`);
  await box.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await box.getByRole('alert').filter({ hasText: 'Ce test a été modifié entre-temps' }).waitFor();
  assert.equal(testRow(id.learner), `Planifié|11:00|${day2}||`, 'nothing overwritten');
  await box.getByRole('radio', { name: 'Déplacer', exact: true }).click();
  assert.equal(await box.getByLabel('Heure', { exact: true }).inputValue(), '11:00', 'the form shows the stored test');
  assert.equal(await box.getByLabel('Examinateur (facultatif)', { exact: true }).inputValue(), 'Autre poste');
  await box.getByRole('button', { name: 'Fermer', exact: true }).first().click();
  await box.waitFor({ state: 'hidden' });
  console.log('PASS a stale edit is refused in French and the form reloads the stored test');

  phase = 'cancel';
  box = await openTest(name('learner'));
  await box.getByRole('radio', { name: 'Annuler le test', exact: true }).click();
  await box.getByRole('button', { name: 'Annuler le test', exact: true }).last().click();
  await box.getByRole('alert').filter({ hasText: 'Indiquez le motif de l’annulation.' }).waitFor();
  assert.equal(testRow(id.learner).split('|')[0], 'Planifié');
  await box.getByLabel('Motif de l’annulation', { exact: true }).fill('Famille indisponible');
  await box.getByRole('button', { name: 'Annuler le test', exact: true }).last().click();
  await box.waitFor({ state: 'hidden' });
  assert.equal(testRow(id.learner), `Annulé|11:00|${day2}||Famille indisponible`);
  await placementRow(name('learner')).getByText('Annulé', { exact: true }).first().waitFor();
  console.log('PASS « Annuler le test » needs a reason and keeps it');

  phase = 'result after the start';
  // A new test after the cancellation, then moved to yesterday in SQL (the rule is time-based).
  await page.getByRole('button', { name: 'Planifier un test', exact: true }).click();
  await dialog().getByLabel('Nom, téléphone ou e-mail', { exact: true }).fill(name('learner'));
  await dialog().locator(`[data-testid=people-result][data-id="${id.learner}"]`).click();
  box = page.getByTestId('student-test-dialog');
  await box.getByLabel('Date', { exact: true }).fill(day1);
  await box.getByLabel('Heure', { exact: true }).fill('10:00');
  await box.getByRole('button', { name: 'Planifier le test', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  sql(`begin;set local session_replication_role=replica;update public.placement_tests set date_test=${TODAY}-1 where student_id=${q(id.learner)} and status='Planifié';commit;`);
  box = await openTest(name('learner'), sql(`select (${TODAY}-1)::text`));
  assert.equal(await box.getByTestId('test-status').innerText(), 'Passé', '« Passé » is derived from the time');
  assert.equal(await box.getByRole('radio', { name: 'Déplacer', exact: true }).count(), 0, 'a started test is not moved');
  await box.getByRole('radio', { name: 'Résultat', exact: true }).click();
  const levels = await box.getByLabel('Niveau recommandé', { exact: true }).locator('option').allInnerTexts();
  assert.ok(levels.includes('Child 1') && !levels.includes('A1') && !levels.includes('Beginning 1'), 'levels of the programme for the age: ' + levels);
  await box.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await box.getByRole('alert').filter({ hasText: 'niveau' }).waitFor();
  await box.getByLabel('Niveau recommandé', { exact: true }).selectOption('Child 1');
  await box.getByLabel('Score (facultatif)', { exact: true }).fill('64');
  await box.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  assert.equal(testRow(id.learner).split('|').slice(0, 1).concat(testRow(id.learner).split('|')[3]).join('|'), 'Résultat saisi|Child 1');
  console.log('PASS « Résultat » after the start time: « Passé » shown, levels by programme and age, level required');

  phase = 'absent';
  box = await openTest(name('absentee'));
  await box.getByRole('radio', { name: 'Absent', exact: true }).click();
  await box.getByRole('button', { name: 'Noter absent', exact: true }).click();
  await box.waitFor({ state: 'hidden' });
  assert.equal(one(`select status from public.placement_tests where id=${q(id.absentTest)}`), 'Absent');
  box = await openTest(name('absentee'));
  await box.getByText('Ce test est terminé', { exact: false }).waitFor();
  await box.getByRole('button', { name: 'Fermer', exact: true }).first().click();
  assert.equal(await placementRow(name('absentee')).getByRole('button', { name: 'Supprimer le test' }).count(), 0, 'reception does not delete a test');
  console.log('PASS « Noter absent » closes the test; reception has no delete');

  // ===== §6.4 Learner files.
  phase = 'learner form';
  await page.goto(app + '/students/new');
  await page.locator('#full_name').fill(name('new file'));
  await page.locator('#date_naissance').fill(sql(`select (${TODAY}+1)::text`));
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('La date de naissance ne peut pas être dans le futur.', { exact: true }).first().waitFor();
  await page.locator('#date_naissance').fill(sql(`select (${TODAY}-interval '6 months')::date::text`));
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('La date de naissance doit remonter à au moins un an.', { exact: true }).first().waitFor();
  assert.equal(await page.locator('#date_naissance').getAttribute('max'), sql(`select (${TODAY}-interval '1 year')::date::text`), 'the picker stops a year ago');
  await page.locator('#date_naissance').fill(sql(`select (${TODAY}-interval '30 years')::date::text`));
  await page.locator('#session_type').selectOption('Adults');
  await page.locator('#age_category').selectOption('Adults (18+)');
  await page.locator('#session_type').selectOption('Yearly');
  assert.ok(!(await page.locator('#age_category option').allInnerTexts()).includes('Entreprise'), 'only the categories that fit the programme');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('La catégorie d’âge ne correspond pas au programme ou au niveau.', { exact: true }).first().waitFor();
  assert.equal(one(`select count(*) from public.students where full_name=${q(name('new file'))}`), '0', 'nothing saved');
  console.log('PASS learner form: future and too-recent birth dates, the category against the programme, nothing saved');

  phase = 'adults-only file';
  await page.goto(`${app}/students/${id.adult}`);
  await page.getByRole('heading', { name: name('adult') }).first().waitFor();
  assert.equal(await page.getByText('Adultes autorisés au retrait', { exact: true }).count(), 0, 'hidden on an adults-only file');
  await page.goto(`${app}/students/${id.learner}`);
  await page.getByText('Adultes autorisés au retrait', { exact: true }).first().waitFor();
  console.log('PASS « Adultes autorisés au retrait » hidden on an adults-only programme');

  phase = 'cards and table';
  await page.goto(`${app}/students-directory?q=${encodeURIComponent(run)}`);
  await page.waitForURL(url => url.pathname === '/students' && url.searchParams.get('view') === 'cards' && url.searchParams.get('q') === run);
  await page.getByTestId('students-cards').getByText(name('roster'), { exact: true }).waitFor(); // an enrolled file: in the default scope
  await page.getByRole('group', { name: 'Affichage' }).getByRole('button', { name: 'Tableau', exact: true }).click();
  await page.waitForURL(url => !url.searchParams.has('view'));
  await page.getByRole('region', { name: /Tableau des apprenants/ }).waitFor();
  assert.equal(await page.getByTestId('students-cards').isVisible(), false, 'the cards are the phone list only in the table view');
  const rosterRow = page.getByRole('row').filter({ hasText: name('roster') });
  await rosterRow.first().waitFor();
  assert.equal(await rosterRow.getByRole('combobox', { name: `Catégorie de ${name('roster')}` }).count(), 0, 'no inline category');
  await page.getByRole('group', { name: 'Affichage' }).getByRole('button', { name: 'Cartes', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('view') === 'cards');
  await page.getByTestId('students-cards').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Annuaire', exact: true }).count(), 0, 'one learners list in the menu');
  console.log('PASS one learners list: /students-directory redirects to the cards view, the toggle keeps the URL');

  // ===== §6.3 Attendance (reception).
  phase = 'attendance today';
  await page.goto(app + '/attendance');
  assert.equal(await page.locator('#attendance-date').inputValue(), today, 'today by default');
  const groupOptions = async () => page.locator('#attendance-group option').allInnerTexts();
  await page.waitForFunction(text => [...document.querySelectorAll('#attendance-group option')].some(o => o.textContent.includes(text)), name('every day'));
  assert.ok(!(await groupOptions()).some(t => t.includes(name('other day'))), 'a group without class today is not offered');
  await page.locator('#attendance-group').selectOption(id.gAll);
  const counts = page.getByTestId('attendance-counts');
  await counts.getByText('1 non saisi', { exact: true }).waitFor();
  await page.getByTestId('not-recorded').first().waitFor();
  assert.equal(await page.getByRole('button', { name: /^Enregistrer les présences/ }).isDisabled(), true, 'nothing to save before a mark');
  await page.getByRole('button', { name: 'Tous présents', exact: true }).click();
  await counts.getByText('1 présent', { exact: true }).waitFor();
  await counts.getByText('0 non saisi', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Enregistrer les présences (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les présences', exact: true }).waitFor();
  assert.equal(one(`select string_agg(status,',') from public.attendance where group_id=${q(id.gAll)} and session_date=${q(today)}`), 'Présent');
  console.log('PASS attendance: today and today\'s groups, « Non saisi » until « Tous présents », the counter, the save');

  phase = 'attendance other day';
  await page.getByLabel('Tous les groupes', { exact: false }).check();
  await page.locator('#attendance-group').selectOption(id.gOther);
  await page.getByRole('status').filter({ hasText: 'Ce groupe n’a pas cours ce jour-là' }).waitFor();
  console.log('PASS a group outside its class days: shown on request, with the notice');

  phase = 'attendance closed date (reception)';
  await page.locator('#attendance-group').selectOption(id.gAll);
  await page.locator('#attendance-date').fill(twoDaysAgo);
  await counts.getByText('1 non saisi', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tous présents', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les présences (1)', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Le centre est fermé ce jour-là.' }).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: /^Séance exceptionnelle/ }).count(), 0, 'no override for reception');
  assert.equal(one(`select count(*) from public.attendance where group_id=${q(id.gAll)} and session_date=${q(twoDaysAgo)}`), '0');
  console.log('PASS a closed date is refused for reception, the marks stay on screen');

  // ===== §6.3 Group days and §6.5 (reception).
  phase = 'group days';
  await page.goto(app + '/groups');
  await page.getByRole('button', { name: `Modifier le groupe ${name('other day')}`, exact: true }).click();
  const groupDialog = dialog();
  assert.equal(await groupDialog.getByRole('button', { name: DAY_NAMES[otherDay], exact: true }).getAttribute('aria-pressed'), 'true');
  const sessions = await groupDialog.locator('#group-session option').evaluateAll(options => options.map(o => o.value));
  assert.ok(!sessions.includes('Online') && !sessions.includes('Online One-to-One') && sessions.includes('Yearly'), 'no online programme for reception: ' + sessions);
  await groupDialog.getByRole('button', { name: DAY_NAMES[dow], exact: true }).click();
  assert.equal(await groupDialog.getByRole('button', { name: DAY_NAMES[dow], exact: true }).getAttribute('aria-pressed'), 'true');
  await groupDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await groupDialog.waitFor({ state: 'hidden' });
  assert.equal(one(`select class_days::text from public.groups where id=${q(id.gOther)}`), `{${[dow, otherDay].sort((a, b) => a - b).join(',')}}`);
  await page.goto(app + '/attendance');
  await page.waitForFunction(text => [...document.querySelectorAll('#attendance-group option')].some(o => o.textContent.includes(text)), name('other day'));
  console.log('PASS the day toggles save class_days; the group then meets today');

  phase = 'online (reception)';
  await page.goto(app + '/online');
  await page.getByRole('heading').first().waitFor();
  assert.equal(await page.getByRole('button', { name: /Nouveau groupe en ligne/ }).count() + await page.getByRole('link', { name: /Nouveau groupe en ligne/ }).count(), 0, 'reception does not create online groups');
  console.log('PASS « Nouveau groupe en ligne » hidden for reception');

  // ===== Director: closed-date override, delete, online creation.
  phase = 'director override';
  await login(director);
  await page.goto(app + '/attendance');
  await page.locator('#attendance-date').fill(twoDaysAgo);
  await page.waitForFunction(text => [...document.querySelectorAll('#attendance-group option')].some(o => o.textContent.includes(text)), name('every day'));
  await page.locator('#attendance-group').selectOption(id.gAll);
  await page.getByRole('button', { name: 'Tous présents', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les présences (1)', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Le centre est fermé ce jour-là.' }).waitFor();
  await page.getByLabel('Séance exceptionnelle : enregistrer malgré la fermeture (direction)', { exact: true }).check();
  await page.getByRole('button', { name: 'Enregistrer les présences (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les présences', exact: true }).waitFor();
  assert.equal(one(`select string_agg(status,',') from public.attendance where group_id=${q(id.gAll)} and session_date=${q(twoDaysAgo)}`), 'Présent');
  console.log('PASS the director records a closed date with « Séance exceptionnelle »');

  phase = 'director delete';
  await page.goto(app + '/placement-tests');
  page.once('dialog', d => d.accept());
  await placementRow(name('deleted')).getByRole('button', { name: 'Supprimer le test' }).first().click();
  await page.getByText('Test supprimé', { exact: true }).first().waitFor();
  assert.equal(one(`select count(*) from public.placement_tests where id=${q(id.deletedTest)}`), '0');
  console.log('PASS « Supprimer le test » (direction) through delete_placement_test');

  phase = 'online (director)';
  await page.goto(app + '/online');
  await page.getByRole('link', { name: /Nouveau groupe en ligne/ }).first().waitFor();
  console.log('PASS « Nouveau groupe en ligne » shown for the direction');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS desk academics browser suite');
} catch (error) {
  console.error(phase, error.message);
  if (page) await page.screenshot({ path: join(tmpdir(), 'hills-desk-academics-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  sql(`begin;
   delete from public.attendance where group_id in (${q(id.gAll)},${q(id.gOther)});
   delete from public.placement_tests where student_id in (${[id.learner, id.absentee, id.deleted].map(q).join(',')});
   select set_config('eh.membership_sync','on',true), set_config('eh.enrollment_command','on',true);
   delete from public.enrollments where student_id in (${q(id.roster)},${q(id.roster2)});
   delete from public.students where id in (${[id.learner, id.absentee, id.deleted, id.roster, id.roster2, id.adult].map(q).join(',')}) or full_name=${q(name('new file'))};
   delete from public.groups where id in (${q(id.gAll)},${q(id.gOther)});
   delete from public.teachers where id=${q(id.teacher)};
   commit;`);
  removeStaff(users.map(u => u.id));
  console.log('PASS synthetic browser fixtures removed');
}
