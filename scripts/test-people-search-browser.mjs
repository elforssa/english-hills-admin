// RWR-r5 PR B1 (§5.1, §5.2) — every people search box finds a phone in any format, real UI
// on the local stack. One synthetic prospect and one synthetic student share no number; each
// is searched with six formats of its own number (generated per run: no phone-like literal in
// the repository). Boxes: « Rechercher une personne » (header), the CRM prospect search, the
// students list, the Annuaire (now the list's cards view, C2) and the Nouveau reçu picker. (The Admissions picker calls the
// receipt picker's RPC, search_desk_students, from 6 digits; scripts/test-phone.sql covers it.)
// Also: the « Ajouter un prospect » duplicate gate (nothing is created before an answer) and
// the student form's gate. Synthetic staff, prospects and students are removed in finally.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, removeStaff, sql } from './lib/crm-next-action-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = process.env.CRM_LOCAL_APP || 'http://localhost:3101', run = 'people-' + randomUUID();
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const rpc = (id, name, data) => JSON.parse(sql(`${as(id)}select public.crm_${name}(gen_random_uuid(),${q(JSON.stringify(data))}::jsonb);commit;`).split('\n').pop());
const phone = () => '06' + String(randomInt(10_000_000, 99_999_999));
// Six ways a receptionist types the same number.
const formats = national => {
  const nine = national.slice(1);
  return [
    national,                                                    // 0612345678
    national.replace(/(\d{2})(?=\d)/g, '$1 '),                   // 06 12 34 56 78
    '+212' + nine,                                               // +212612345678
    '+212 ' + nine.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5'), // +212 6 12 34 56 78
    '00212' + nine,                                              // 00212612345678
    national.slice(-7).replace(/(\d{3})(\d{2})(\d{2})/, '$1-$2-$3') // the last 7 digits, with dashes
  ];
};
let browser, page, users = [], students = [], phase = 'setup';
const errors = [];
const dialog = () => page.getByRole('dialog').last();

async function login(user) {
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

try {
  users = await createStaff(env, run, ['director', 'receptionist']);
  const [director, reception] = users;
  rpc(director.id, 'create_followup_policy', LIVE_POLICY);
  const prospectPhone = phone(), studentPhone = phone();
  const lead = rpc(reception.id, 'create_prospect', { display_name: 'Recherche contact synthétique', learner_name: 'Recherche prospect synthétique',
    phone: prospectPhone, source_label: 'Manuel · Téléphone' }).lead.id;
  const student = randomUUID(); students.push(student);
  sql(`insert into public.students(id,full_name,telephone,status,session_type) values(${q(student)},'Recherche apprenant synthétique',${q(studentPhone)},'Prospect','Yearly')`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: !!process.env.CRM_LOCAL_APP });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(`${phase}: ${e.message}`));
  await login(reception);

  const boxes = [
    ['header « Rechercher une personne »', async value => {
      if (!(await page.getByRole('dialog').count())) { await page.goto(`${app}/crm/today`); await page.getByRole('button', { name: 'Rechercher une personne', exact: true }).first().click(); }
      await dialog().getByLabel('Nom, téléphone ou e-mail', { exact: true }).fill(value);
      return dialog().getByTestId('people-results');
    }, [['prospect', lead, 'Recherche prospect synthétique'], ['student', student, 'Recherche apprenant synthétique']]],
    ['CRM prospect search', async value => {
      await page.goto(`${app}/crm/leads?layout=list&q=${encodeURIComponent(value)}`);
      return page.locator('main');
    }, [['prospect', lead, 'Recherche prospect synthétique']]],
    ['students list', async value => {
      await page.goto(`${app}/students?status=all_shown`); // « Tous les statuts »: a student with no enrollment is a Prospect
      await page.getByLabel('Rechercher un apprenant', { exact: true }).fill(value);
      return page.locator('main');
    }, [['student', student, 'Recherche apprenant synthétique']]],
    // RWR-r5 C2 (§6.4): the Annuaire is the list's cards view; its old address redirects there.
    ['Annuaire (cards view)', async value => {
      await page.goto(`${app}/students-directory?status=Prospect`);
      await page.waitForURL(url => url.pathname === '/students' && url.searchParams.get('view') === 'cards' && url.searchParams.get('status') === 'Prospect');
      await page.getByLabel('Rechercher un apprenant', { exact: true }).fill(value);
      return page.getByTestId('students-cards');
    }, [['student', student, 'Recherche apprenant synthétique']]],
    ['Nouveau reçu picker', async value => {
      await page.goto(`${app}/receipts/new`);
      await page.getByPlaceholder('Saisir au moins 2 caractères…', { exact: true }).fill(value);
      return page.locator('main');
    }, [['student', student, 'Recherche apprenant synthétique']]]
  ];
  for (const [box, search, expected] of boxes) {
    phase = box;
    for (const [kind, , name] of expected) {
      for (const value of formats(kind === 'student' ? studentPhone : prospectPhone)) {
        const region = await search(value);
        await region.getByText(name, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 }).catch(() => { throw new Error(`${box}: « ${value} » did not find the ${kind}`); });
      }
    }
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    console.log(`PASS ${box}: ${expected.map(e => e[0]).join(' and ')} found with 6 phone formats`);
  }

  // The header search opens the record and creates nothing.
  phase = 'open from search';
  const before = sql('select count(*) from public.crm_leads');
  await page.goto(`${app}/crm/today`);
  await page.getByRole('button', { name: 'Rechercher une personne', exact: true }).first().click();
  await dialog().getByLabel('Nom, téléphone ou e-mail', { exact: true }).fill(formats(studentPhone)[3]);
  await dialog().locator(`[data-testid=people-result][data-id="${student}"]`).click();
  await page.waitForURL(url => url.pathname === `/students/${student}`);
  assert.equal(sql('select count(*) from public.crm_leads'), before, 'opening a result creates no prospect');
  console.log('PASS the header search opens the student file and creates nothing');

  // « Ajouter un prospect » with the student's number in another format: the gate lists the
  // match, nothing is created; « Personne différente » then creates and records the answer.
  phase = 'create gate';
  await page.goto(`${app}/crm/leads`);
  await page.getByRole('button', { name: 'Ajouter un prospect', exact: true }).click();
  await dialog().getByLabel('Nom du contact', { exact: true }).fill('Doublon synthétique');
  await dialog().getByLabel('Téléphone', { exact: true }).fill(formats(studentPhone)[2]);
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await dialog().locator(`[data-testid=duplicate-match][data-kind=student][data-id="${student}"]`).waitFor();
  assert.equal(sql(`select count(*) from public.crm_contacts where display_name='Doublon synthétique'`), '0', 'nothing created before an answer');
  await dialog().locator(`[data-testid=duplicate-match][data-id="${student}"]`).getByLabel('Personne différente', { exact: true }).check();
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Prospect créé' }).first().waitFor();
  const created = await page.evaluate(() => new URL(location.href).searchParams.get('lead'));
  assert.equal(sql(`select count(*) from public.person_match_decisions where decision='different_people' and ((kind_a='prospect' and id_a=${q(created)} and id_b=${q(student)}) or (kind_b='prospect' and id_b=${q(created)} and id_a=${q(student)}))`), '1', 'the answer is recorded');
  console.log('PASS create gate: the match is listed, nothing is created before « Personne différente », then the answer is recorded');

  // Student form: an invalid number is refused on the field; the same number as the prospect
  // opens the gate.
  phase = 'student form';
  await page.goto(`${app}/students/new`);
  await page.locator('#full_name').fill('Élève doublon synthétique');
  await page.locator('#telephone').fill('12345');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Numéro invalide', { exact: true }).first().waitFor();
  await page.locator('#telephone').fill(formats(prospectPhone)[1]);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator(`[data-testid=duplicate-match][data-kind=prospect][data-id="${lead}"]`).waitFor();
  assert.equal(sql(`select count(*) from public.students where full_name='Élève doublon synthétique'`), '0', 'no student before an answer');
  console.log('PASS student form: invalid number refused, the gate lists the prospect with the same number');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS people search browser suite');
} catch (error) {
  console.error(phase, error.message);
  if (page) await page.screenshot({ path: join(tmpdir(), 'hills-people-search-failure.png') }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  removeStaff(users.map(u => u.id));
  if (students.length) sql(`delete from public.students where id in (${students.map(q).join(',')}) or full_name='Élève doublon synthétique'`);
  console.log('PASS synthetic browser fixtures removed');
}
