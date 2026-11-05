// Courses with dates — close a finished course (plan CDC-r3, migration 128): browser
// flows. Run with the app at localhost:3101 and local Supabase. Synthetic data only;
// every fixture of this run is removed at the end.
//
// 1. Admin and reception: no « Cours terminés à clôturer » card (admin's dashboard sends
//    no list_courses_to_close request), no close or reopen button, and ?vue=a-cloturer
//    says the list is the director's. Closed courses are absent from the enrollment
//    dialog and the receipt form; a finished course not yet closed is marked « terminé
//    le … ». Form dates and One-to-One capacity on the management path (direct write)
//    and the reception path (save_receptionist_group): the window, one date on Yearly,
//    an edit of a closed undated short-programme group, the capacity reset.
// 2. Director: the card and « À clôturer »; the close dialog with one « A suivi ce
//    cours » and one « Terminer sans groupe » (confirm disabled until both are chosen),
//    the database after it, « Groupes actifs » one lower, the closed page, « Rouvrir le
//    cours »; an empty group closed from its page; an empty course before its end date
//    offers « Laisser en attente » only (S2); a closed online course hides « Ajouter des
//    apprenants » (S3); « Clôturer l'année » with a Summer Camp course still running and
//    a Summer Camp row left waiting, and enabled when it would only mark groups.
// Dates come from the course year (the school year of tomorrow): d(-n) for the past,
// WINDOW_END (31 August of its second year, always after today) and fixed days of its
// second year for the future, so no date leaves the window near 31 August.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
assertLocalFeatureBranch(new URL('../', import.meta.url));

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const APP = 'http://localhost:3101';
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sql = statement => execFileSync('psql', ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8' }).trim();
const run = 'cdc-ui-' + randomUUID().slice(0, 8);
const password = randomBytes(24).toString('base64url');
const users = {};
const pass = message => console.log('PASS', message);

const YEAR = sql('select public.centre_school_year(public.business_date() + 1)');
const AN = YEAR.replace('/', '-');
const FIRST = Number(YEAR.slice(0, 4));
const WINDOW_END = `${FIRST + 1}-08-31`;
const FAR_YEAR = `${FIRST + 6}/${FIRST + 7}`;
const d = n => sql(`select (public.business_date() + ${Number(n)})::text`);
const frDate = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const id = Object.fromEntries(['teacher', 'finished', 'closedFix', 'legacy', 'empty', 'early', 'summer', 'yearly', 'online', 'far',
  'm1', 'm2', 'uAttach', 'uEnd', 'uEarly', 'sMember', 'sWait'].map(key => [key, randomUUID()]));
const name = key => `${run} ${key}`;
const asDirector = statement => sql(`begin; set local request.jwt.claim.sub = '${users.director.id}'; set local role authenticated;
  ${statement}; commit;`);
const directorJson = statement => JSON.parse(sql(`begin; set local request.jwt.claim.sub = '${users.director.id}'; set local role authenticated;
  select (${statement})::text; rollback;`).split('\n').at(-1));

let browser;
async function createUser(key, role) {
  const { data, error } = await db.auth.admin.createUser({ email: `${run}-${key}@example.test`, password, email_confirm: true });
  if (error) throw error;
  users[key] = { id: data.user.id, email: `${run}-${key}@example.test` };
  sql(`update public.profiles set role = '${role}', full_name = '${run} ${key}' where id = '${data.user.id}'`);
}
async function signIn(key, landing, onRequest = null) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', dialog => dialog.accept());
  if (onRequest) page.on('request', onRequest);
  await page.goto(APP + '/login');
  await page.waitForLoadState('networkidle');
  // Prove React is handling events before filling the login fields.
  await page.getByRole('button', { name: 'Connexion par lien magique', exact: true }).click();
  await page.getByRole('button', { name: 'Retour à la connexion par mot de passe', exact: true }).click();
  await page.locator('input[type=email]').fill(users[key].email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(landing);
  return { page, context };
}
const toast = (page, text) => page.getByText(text, { exact: false }).first().waitFor();
const open = async (page, path) => { await page.goto(APP + path); await page.waitForLoadState('networkidle'); };
const card = (page, label) => page.getByRole('link').filter({ hasText: label });
const cardValue = (page, label) => card(page, label).locator('p').first();
const row = (page, key) => page.locator('tbody tr').filter({ hasText: name(key) });
const optionTexts = select => select.locator('option').allTextContents();

// The group form, management and reception paths (D1, Q3, Q4 and the review nits).
async function groupForm(page, receptionist) {
  const tag = receptionist ? 'reception' : 'management';
  await open(page, '/groups');
  await page.getByRole('button', { name: /Nouveau groupe/ }).click();
  const dialog = page.getByRole('dialog');
  const session = dialog.locator('select').nth(0), teacher = dialog.locator('select').nth(3), capacity = dialog.locator('#group-capacity');
  await dialog.locator('#group-name').fill(name(`form ${tag}`));
  await session.selectOption('Mise à niveau');
  await expect(dialog.locator('label[for=group-date-debut]')).toHaveText('Date de début *');
  await teacher.selectOption(id.teacher);
  await dialog.locator('#group-school-year').fill(YEAR);
  await dialog.locator('#group-date-debut').fill(`${FIRST}-05-20`);
  await dialog.locator('#group-date-fin').fill(`${FIRST}-07-20`);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await toast(page, `Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin ${FIRST} au 31 août ${FIRST + 1}).`);
  assert.equal(sql(`select count(*) from public.groups where name = '${name(`form ${tag}`)}'`), '0', 'nothing saved outside the window');
  // One-to-One: capacity 1 and a neutral name; leaving it gives a capacity back (nit).
  await session.selectOption('One-to-One');
  await expect(capacity).toHaveValue('1');
  await expect(capacity).toBeDisabled();
  await session.selectOption('Mise à niveau');
  await expect(capacity).toHaveValue('12');
  await expect(capacity).toBeEnabled();
  await dialog.locator('#group-name').fill('');
  await session.selectOption('One-to-One');
  const start = `${FIRST + 1}-03-02`;
  await dialog.locator('#group-date-debut').fill(start);
  await dialog.locator('#group-date-fin').fill(`${FIRST + 1}-04-10`);
  await expect(dialog.locator('#group-name')).toHaveValue(`Cours individuel · A1 · ${frDate(start)}`);
  await dialog.locator('#group-name').fill(name(`one ${tag}`));
  await teacher.selectOption(id.teacher);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await toast(page, 'Groupe créé');
  assert.equal(sql(`select capacite_max || ':' || date_debut || ':' || date_fin || ':' || categorie from public.groups where name = '${name(`one ${tag}`)}'`),
    `1:${start}:${FIRST + 1}-04-10:Particulier`);
  // A Yearly group may carry one date: the form is never stricter than the database (nit).
  await page.getByRole('button', { name: /Nouveau groupe/ }).click();
  await dialog.locator('#group-name').fill(name(`yearly ${tag}`));
  await expect(dialog.locator('label[for=group-date-debut]')).toHaveText('Date de début');
  await teacher.selectOption(id.teacher);
  await dialog.locator('#group-school-year').fill(YEAR);
  await dialog.locator('#group-date-debut').fill(`${FIRST}-09-15`);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await toast(page, 'Groupe créé');
  assert.equal(sql(`select date_debut || ':' || coalesce(date_fin::text, '-') from public.groups where name = '${name(`yearly ${tag}`)}'`), `${FIRST}-09-15:-`);
  pass(`${tag} group form: the window, One-to-One capacity 1 and its reset, a neutral name, one date on Yearly`);
}

try {
  await createUser('director', 'director');
  await createUser('admin', 'admin');
  await createUser('reception', 'receptionist');
  sql(`
insert into public.teachers(id, full_name, email, contract_type) values ('${id.teacher}', '${run} teacher', '${run}-t@example.test', 'Freelance');
insert into public.groups(id, name, session_type, niveau, categorie, annee, capacite_max, teacher_id, salle, jours, horaire, terme, date_debut, date_fin) values
  ('${id.finished}', '${name('finished')}', 'Mise à niveau', 'C2', 'Ados', '${AN}', 10, '${id.teacher}', 'Salle 2', 'Sam', '10h – 12h', 'Sept–Déc', '${d(-40)}', '${d(-2)}'),
  ('${id.closedFix}', '${name('closedFix')}', 'Mise à niveau', 'C2', 'Ados', '${AN}', 10, '${id.teacher}', 'Salle 3', 'Sam', '14h – 16h', 'Sept–Déc', '${d(-60)}', '${d(-30)}'),
  ('${id.empty}', '${name('empty')}', 'Yearly', 'Child 1', 'Enfants', '${AN}', 12, '${id.teacher}', 'Salle 1', 'Mer', '14h – 16h', 'Sept–Déc', null, null),
  ('${id.early}', '${name('early')}', 'Mise à niveau', 'C1', 'Ados', '${AN}', 10, '${id.teacher}', 'Salle 4', 'Lun', '17h – 19h', 'Sept–Déc', '${d(-5)}', '${WINDOW_END}'),
  ('${id.summer}', '${name('summer')}', 'Summer Camp', 'C2', 'Enfants', '${AN}', 12, '${id.teacher}', 'Salle 3', 'Lun, Mar', '9h – 12h', 'Été', '${d(-10)}', '${WINDOW_END}'),
  ('${id.yearly}', '${name('yearly')}', 'Yearly', 'Child 1', 'Enfants', '${AN}', 12, '${id.teacher}', 'Salle 2', 'Sam', '9h – 11h', 'Sept–Déc', null, null);
insert into public.groups(id, name, session_type, niveau, annee) values
  ('${id.online}', '${name('online')}', 'Online', 'B2', '${AN}'),
  ('${id.far}', '${name('far')}', 'Yearly', 'Child 2', '${FAR_YEAR.replace('/', '-')}');
insert into public.online_courses(group_id, teacher_id, audience, term_start, term_end, status)
  values ('${id.online}', '${id.teacher}', 'adult', '${d(-60)}', '${d(-1)}', 'closed');
-- A short-programme group without dates (created before 128), closed while empty.
alter table public.groups disable trigger groups_course_guard;
insert into public.groups(id, name, session_type, niveau, categorie, annee, capacite_max, teacher_id)
  values ('${id.legacy}', '${name('legacy')}', 'Adults', 'Beginning 1', 'Adultes', '${AN}', 10, '${id.teacher}');
alter table public.groups enable trigger groups_course_guard;
insert into public.students(id, full_name, status, session_type) values
  ('${id.m1}', '${name('m1')}', 'Prospect', 'Mise à niveau'), ('${id.m2}', '${name('m2')}', 'Prospect', 'Mise à niveau'),
  ('${id.uAttach}', '${name('uAttach')}', 'Prospect', 'Mise à niveau'), ('${id.uEnd}', '${name('uEnd')}', 'Prospect', 'Mise à niveau'),
  ('${id.uEarly}', '${name('uEarly')}', 'Prospect', 'Mise à niveau'),
  ('${id.sMember}', '${name('sMember')}', 'Prospect', 'Summer Camp'), ('${id.sWait}', '${name('sWait')}', 'Prospect', 'Summer Camp');
insert into public.enrollments(student_id, group_id, status, session_type, school_year, level) values
  ('${id.m1}', '${id.finished}', 'Validated', 'Mise à niveau', '${YEAR}', 'C2'),
  ('${id.m2}', '${id.finished}', 'Validated', 'Mise à niveau', '${YEAR}', 'C2'),
  ('${id.m1}', '${id.yearly}', 'Validated', 'Yearly', '${YEAR}', 'Child 1'),
  ('${id.sMember}', '${id.summer}', 'Validated', 'Summer Camp', '${YEAR}', 'C2');
insert into public.enrollments(student_id, status, session_type, school_year, level) values
  ('${id.uAttach}', 'Confirmed', 'Mise à niveau', '${YEAR}', 'C2'),
  ('${id.uEnd}', 'Confirmed', 'Mise à niveau', '${YEAR}', null),
  ('${id.uEarly}', 'Confirmed', 'Mise à niveau', '${YEAR}', 'C1'),
  ('${id.sWait}', 'Confirmed', 'Summer Camp', '${YEAR}', 'C2');`);
  asDirector(`select public.close_course('${id.closedFix}', 0); select public.close_course('${id.legacy}', 0)`);
  browser = await chromium.launch({ headless: true });

  // ── Admin ────────────────────────────────────────────────────────────────────
  {
    const calls = [];
    const { page, context } = await signIn('admin', '**/dashboard', request => {
      if (request.url().includes('/rest/v1/rpc/list_courses_to_close')) calls.push(request.url());
    });
    // The dashboard sends its reads together: once « Groupes actifs » shows its number, every read was sent.
    const active = sql(`select (select count(*) from public.groups where closed_at is null)
      - (select count(*) from public.online_courses where status = 'closed')`);
    await expect(cardValue(page, 'Groupes actifs')).toHaveText(active);
    await page.waitForLoadState('networkidle');
    await expect(card(page, 'Cours terminés à clôturer')).toHaveCount(0);
    assert.deepEqual(calls, [], 'D7: the admin dashboard never calls list_courses_to_close');
    pass('admin dashboard: no « Cours terminés à clôturer », no list_courses_to_close request, « Groupes actifs » excludes closed courses');
    await open(page, '/groups');
    assert.deepEqual(await optionTexts(page.getByRole('combobox', { name: 'Vue des groupes' })), ['En cours', 'Clôturés']);
    await expect(row(page, 'finished')).toContainText(`terminé le ${frDate(d(-2))}`);
    await expect(page.getByRole('button', { name: /^Clôturer/ })).toHaveCount(0);
    await expect(row(page, 'closedFix')).toHaveCount(0);
    await open(page, '/groups?vue=a-cloturer');
    await expect(page.getByRole('status').filter({ hasText: 'La liste « À clôturer » est réservée à la direction' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Vue des groupes' })).toHaveValue('en-cours');
    await expect(row(page, 'finished')).toBeVisible();
    await open(page, `/groups/${id.finished}`);
    await expect(page.getByRole('button', { name: 'Clôturer le cours' })).toHaveCount(0);
    await open(page, `/groups/${id.closedFix}`);
    await page.getByRole('status').filter({ hasText: 'Cours clôturé le' }).waitFor();
    await expect(page.getByRole('button', { name: 'Rouvrir le cours' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Ajouter des apprenants/ })).toHaveCount(0);
    pass('admin: views En cours / Clôturés, no close or reopen button, ?vue=a-cloturer explains the director\'s list');
    // The enrollment dialog: the finished course is offered and marked, the closed one is not.
    await open(page, `/students/${id.uAttach}`);
    await page.getByRole('button', { name: 'Modifier l’inscription', exact: true }).click();
    const groups = await optionTexts(page.getByRole('dialog').locator('#enrollment-group'));
    assert.ok(groups.some(text => text.includes(name('finished')) && text.includes(`terminé le ${frDate(d(-2))}`)), groups.join(' | '));
    assert.ok(!groups.some(text => text.includes(name('closedFix'))), 'a closed course is never offered: ' + groups.join(' | '));
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler', exact: true }).click();
    pass('EnrollmentModal: a closed course is absent, a finished one is marked « terminé le … »');
    // An edit of a closed undated short-programme group keeps its frozen fields and saves (nit).
    await open(page, '/groups?vue=clotures');
    await row(page, 'legacy').locator('button').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Cours clôturé : les dates', { exact: false }).waitFor();
    await dialog.locator('#group-name').fill(name('legacy renamed'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await toast(page, 'Groupe mis à jour');
    assert.equal(sql(`select name || ':' || coalesce(date_debut::text, '-') || ':' || (closed_at is not null) from public.groups where id = '${id.legacy}'`),
      `${name('legacy renamed')}:-:true`);
    pass('admin: a closed undated Adults group (before 128) is renamed without dates');
    await groupForm(page, false);
    await context.close();
  }

  // ── Reception ────────────────────────────────────────────────────────────────
  {
    const { page, context } = await signIn('reception', '**/crm/leads');
    await page.goto(APP + '/dashboard');
    await page.waitForURL('**/crm/leads');
    await expect(card(page, 'Cours terminés à clôturer')).toHaveCount(0);
    await open(page, '/groups');
    assert.deepEqual(await optionTexts(page.getByRole('combobox', { name: 'Vue des groupes' })), ['En cours', 'Clôturés']);
    await expect(page.getByRole('button', { name: /^Clôturer/ })).toHaveCount(0);
    await open(page, '/groups?vue=a-cloturer');
    await expect(page.getByRole('status').filter({ hasText: 'La liste « À clôturer » est réservée à la direction' })).toBeVisible();
    await open(page, `/groups/${id.finished}`);
    await page.getByText(`Du ${frDate(d(-40))} au ${frDate(d(-2))}`, { exact: false }).first().waitFor();
    await expect(page.getByRole('button', { name: 'Clôturer le cours' })).toHaveCount(0);
    await open(page, `/groups/${id.closedFix}`);
    await expect(page.getByRole('button', { name: 'Rouvrir le cours' })).toHaveCount(0);
    pass('reception: no dashboard card, no close or reopen button, ?vue=a-cloturer explains the director\'s list');
    // The receipt form: the closed course is absent; the finished one is marked.
    await open(page, `/receipts/new?student_id=${id.uAttach}`);
    const field = label => page.locator('label').filter({ hasText: label }).locator('select');
    await field('Session *').selectOption('Mise à niveau');
    await field('Année scolaire *').selectOption(YEAR);
    await field('Niveau (facultatif)').selectOption('C2');
    await field('Groupe (facultatif)').waitFor();
    const choices = await optionTexts(field('Groupe (facultatif)'));
    assert.ok(choices.some(text => text.includes(name('finished')) && text.includes(`terminé le ${frDate(d(-2))}`)), choices.join(' | '));
    assert.ok(!choices.some(text => text.includes(name('closedFix'))), 'the receipt form never offers a closed course: ' + choices.join(' | '));
    pass('receipt form: a closed course is absent, a finished one is marked « terminé le … »');
    await groupForm(page, true);
    await context.close();
  }

  // ── Director ─────────────────────────────────────────────────────────────────
  {
    const calls = [];
    const { page, context } = await signIn('director', '**/dashboard', request => {
      if (request.url().includes('/rest/v1/rpc/list_courses_to_close')) calls.push(request.url());
    });
    const listed = directorJson('select coalesce(jsonb_agg(x), \'[]\') from public.list_courses_to_close() x');
    const toClose = listed.filter(item => item.kind === 'online' || Number(item.live_count) > 0).length;
    assert.ok(listed.some(item => item.group_id === id.finished), JSON.stringify(listed));
    assert.ok(![id.early, id.closedFix, id.legacy, id.online].some(group => listed.some(item => item.group_id === group)), JSON.stringify(listed));
    await expect(cardValue(page, 'Cours terminés à clôturer')).toHaveText(String(toClose));
    assert.ok(calls.length >= 1, 'the director\'s dashboard reads the finished-course list (the request listener works)');
    const activeBefore = Number(sql(`select (select count(*) from public.groups where closed_at is null)
      - (select count(*) from public.online_courses where status = 'closed')`));
    await expect(cardValue(page, 'Groupes actifs')).toHaveText(String(activeBefore));
    await card(page, 'Cours terminés à clôturer').click();
    await page.waitForURL('**/groups?vue=a-cloturer');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('combobox', { name: 'Vue des groupes' })).toHaveValue('a-cloturer');
    await expect(row(page, 'finished')).toContainText('terminé le');
    await expect(row(page, 'early')).toHaveCount(0);
    pass(`director: the card (${toClose}) opens « À clôturer », which lists the finished course`);
    // The close dialog: every unplaced row needs a choice before the close is enabled (Q14).
    await row(page, 'finished').getByRole('button', { name: 'Clôturer le cours' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('2 apprenants', { exact: false }).waitFor();
    await expect(dialog).toContainText('1 deviennent Ancien apprenant, 1 restent Inscrits');
    await expect(dialog.getByTestId('unplaced-row')).toHaveCount(2);
    const submit = dialog.getByRole('button', { name: 'Clôturer le cours', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('radiogroup', { name: `Choix pour ${name('uAttach')}` }).getByLabel('A suivi ce cours').check();
    await expect(dialog.getByText('Ajoute le cours à son historique', { exact: false })).toBeVisible();
    await expect(submit).toBeDisabled();
    await dialog.getByRole('radiogroup', { name: `Choix pour ${name('uEnd')}` }).getByLabel('Terminer sans groupe').check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await toast(page, 'Cours clôturé : 4 inscriptions terminées');
    const enrollmentsOf = `select string_agg(s.full_name || '=' || e.status || ':' || coalesce(e.group_id::text, '-') || ':' || coalesce(e.ended_group_id::text, '-'), ',' order by s.full_name)
      from public.enrollments e join public.students s on s.id = e.student_id where e.session_type = 'Mise à niveau' and s.id in ('${id.m1}', '${id.m2}', '${id.uAttach}', '${id.uEnd}')`;
    assert.equal(sql(enrollmentsOf), [`${name('m1')}=Ended:-:${id.finished}`, `${name('m2')}=Ended:-:${id.finished}`,
      `${name('uAttach')}=Ended:-:${id.finished}`, `${name('uEnd')}=Ended:-:-`].join(','));
    assert.equal(sql(`select string_agg(full_name || '=' || status, ',' order by full_name) from public.students where id in ('${id.m1}', '${id.m2}', '${id.uAttach}', '${id.uEnd}')`),
      [`${name('m1')}=Enrolled`, `${name('m2')}=Alumni`, `${name('uAttach')}=Alumni`, `${name('uEnd')}=Alumni`].join(','));
    assert.equal(sql(`select (closed_at is not null) || ':' || (closed_by = '${users.director.id}') from public.groups where id = '${id.finished}'`), 'true:true');
    pass('director: closes with one « A suivi ce cours » and one « Terminer sans groupe »; enrollments, files and the mark as expected');
    await open(page, '/dashboard');
    await expect(cardValue(page, 'Groupes actifs')).toHaveText(String(activeBefore - 1));
    pass('« Groupes actifs » is one lower after the close');
    await open(page, `/groups/${id.finished}`);
    await page.getByRole('status').filter({ hasText: 'Cours clôturé le' }).waitFor();
    await expect(page.getByRole('button', { name: /Ajouter des apprenants/ })).toHaveCount(0);
    await page.getByRole('heading', { name: 'Anciens apprenants du cours' }).waitFor();
    await expect(page.locator('table').last().locator('tbody tr')).toHaveCount(3);
    await page.getByRole('button', { name: 'Rouvrir le cours' }).click();
    await toast(page, 'Cours rouvert : 4 inscriptions rétablies');
    assert.equal(sql(`select closed_at is null from public.groups where id = '${id.finished}'`), 't');
    assert.equal(sql(enrollmentsOf), [`${name('m1')}=Validated:${id.finished}:-`, `${name('m2')}=Validated:${id.finished}:-`,
      `${name('uAttach')}=Confirmed:-:-`, `${name('uEnd')}=Confirmed:-:-`].join(','));
    pass('director: the closed page (no placement, past learners), then « Rouvrir le cours » restores every row');
    // OA2: an empty group closes from its page at any time.
    await open(page, `/groups/${id.empty}`);
    await page.getByRole('button', { name: 'Clôturer le cours' }).click();
    await dialog.getByText('Aucun apprenant dans ce cours', { exact: false }).waitFor();
    await dialog.getByRole('button', { name: 'Clôturer le cours', exact: true }).click();
    await toast(page, 'Cours clôturé : 0 inscription terminée');
    assert.equal(sql(`select closed_at is not null from public.groups where id = '${id.empty}'`), 't');
    pass('director: closes an empty undated group from its page');
    // S2: an empty course before its end date: « Laisser en attente » only, nothing sent.
    await open(page, '/groups');
    await row(page, 'early').getByRole('button', { name: 'Clôturer', exact: true }).click();
    await dialog.getByText('Le cours n’est pas terminé : ces inscriptions restent en attente de leur groupe.').waitFor();
    await expect(dialog.getByTestId('unplaced-row').filter({ hasText: name('uEarly') })).toContainText('Laisser en attente');
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await expect(dialog.getByText('A suivi ce cours')).toHaveCount(0);
    await expect(dialog.getByText('Terminer sans groupe')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Clôturer le cours', exact: true }).click();
    await toast(page, 'Cours clôturé : 0 inscription terminée');
    assert.equal(sql(`select (g.closed_at is not null) || ':' || e.status || ':' || coalesce(e.group_id::text, '-') from public.groups g, public.enrollments e
      where g.id = '${id.early}' and e.student_id = '${id.uEarly}'`), 'true:Confirmed:-');
    pass('S2: before its end date the dialog offers « Laisser en attente » only; the paid row stays waiting');
    // S3: a closed online course takes no learner.
    await open(page, `/groups/${id.online}`);
    await page.getByRole('status').filter({ hasText: 'Cours en ligne clôturé sur sa page Cours en ligne.' }).waitFor();
    await expect(page.getByRole('button', { name: /Ajouter des apprenants/ })).toHaveCount(0);
    pass('S3: a closed online course\'s page hides « Ajouter des apprenants »');
    // « Clôturer l'année »: the running Summer Camp course and its waiting row are kept.
    assert.equal(sql(`select string_agg(outcome, ',' order by outcome) from academic_security.year_close_rows('${YEAR}')
      where student_id in ('${id.sMember}', '${id.sWait}')`), 'kept_later,kept_waiting');
    const preview = directorJson(`public.close_school_year_preview('${YEAR}')`);
    await open(page, '/students');
    await page.getByRole('button', { name: 'Clôturer l’année', exact: true }).click();
    const yearDialog = page.getByRole('dialog');
    const yearInput = yearDialog.locator('input').first(), status = yearDialog.getByRole('status');
    await yearInput.fill(YEAR);
    await expect(status).toContainText(`${preview.to_end} inscription(s) active(s) seront terminées`);
    await expect(status).toContainText(`${preview.kept_in_later_courses} inscription(s) d’un cours qui se termine plus tard restent en cours.`);
    const byProgramme = Object.entries(preview.kept_waiting_unplaced.by_programme).filter(([, n]) => Number(n) > 0)
      .sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([programme, n]) => `${programme} ${n}`).join(', ');
    assert.match(byProgramme, /Summer Camp [1-9]/);
    await expect(status).toContainText(`${preview.kept_waiting_unplaced.total} inscription(s) payée(s) sans groupe restent en attente de leur cours (${byProgramme})`);
    // Only groups to mark: the button is enabled (nit); it is never clicked here.
    const far = directorJson(`public.close_school_year_preview('${FAR_YEAR}')`);
    assert.equal(Number(far.to_end), 0, JSON.stringify(far));
    assert.ok(Number(far.groups_to_mark) >= 1, JSON.stringify(far));
    await yearInput.fill(FAR_YEAR);
    await expect(status).toContainText('0 inscription(s) active(s) seront terminées');
    await expect(status).toContainText(`${far.groups_to_mark} groupe(s) seront marqués clôturés.`);
    const closeYear = yearDialog.getByRole('button', { name: 'Clôturer', exact: true });
    await expect(closeYear).toBeDisabled();
    await yearDialog.locator('input').nth(1).fill('Fin d’année (test, non envoyé)');
    await expect(closeYear).toBeEnabled();
    await yearDialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.equal(sql(`select closed_at is null from public.groups where id = '${id.far}'`), 't', 'the year close was not run');
    pass('year-close dialog: Summer Camp kept in its running course and waiting (by programme); enabled with groups to mark only; not run');
    await context.close();
  }
} finally {
  await browser?.close();
  const students = `select id from public.students where full_name like '${run} %'`;
  const groups = `select id from public.groups where name like '${run} %' or teacher_id = '${id.teacher}'`;
  const actors = Object.values(users).map(user => `'${user.id}'`).join(',') || `'${randomUUID()}'`;
  sql(`begin;
set local eh.enrollment_command = on;
delete from maintenance.course_close_journal where group_id in (${groups}) or group_id in ('${id.online}', '${id.far}');
delete from public.activity_log where actor_id in (${actors}) or target_id in (${students})
  or target_id in (select id from public.enrollments where student_id in (${students})) or target_id in (${groups});
delete from public.enrollments where student_id in (${students});
delete from public.students where id in (${students});
delete from public.online_courses where group_id = '${id.online}';
delete from public.groups where id in (${groups}) or id in ('${id.online}', '${id.far}');
delete from public.teachers where id = '${id.teacher}';
-- The synthetic director may be the database's only one: removed under the local teardown guard.
alter table public.profiles disable trigger role_security_guard;
delete from auth.users where id in (${actors});
update role_security.director_guard set director_count = (select count(*) from public.profiles where role = 'director');
alter table public.profiles enable trigger role_security_guard;
commit;`);
  console.log('course close browser: fixtures removed');
}
