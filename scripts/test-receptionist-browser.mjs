// Real local Auth, browser and API checks. Removes only this run's fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';

assertLocalFeatureBranch(new URL('../', import.meta.url));
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
}));
const base = 'http://127.0.0.1:54321', app = 'http://localhost:3101';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base);
// Fail fast instead of stalling CI: bound each blocking SQL call and the whole run.
const sqlTimeoutMs = 120_000, runTimeoutMs = 10 * 60_000;
setTimeout(() => {
  console.error(`FAIL receptionist browser suite stalled: no completion within ${runTimeoutMs / 60_000} minutes`);
  process.exit(1);
}, runTimeoutMs).unref();
const sql = statement => {
  try {
    return execFileSync('docker', ['exec','-i','supabase_db_hills-admin-next',
      'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
      { input: statement, encoding: 'utf8', timeout: sqlTimeoutMs }).trim();
  } catch (error) {
    if (error.code === 'ETIMEDOUT') throw new Error(`SQL stalled for over ${sqlTimeoutMs / 1000} s (lock wait or open transaction): ${statement.slice(0, 200)}`);
    throw error;
  }
};
const run = 'receptionist-browser-' + randomUUID(), email = run + '@example.invalid';
const password = randomBytes(24).toString('base64url');
const student = randomUUID(), group = randomUUID();
const readyStudent = randomUUID(), unsetStudent = randomUUID();
const confirmedStudent = randomUUID(), multipleStudent = randomUUID();
const confirmedEnrollment = randomUUID();
const multipleCurrent = randomUUID(), multipleNext = randomUUID(), incompatibleGroup = randomUUID(), wrongLevelGroup = randomUUID();
// The 2027/2028 enrollment is placed in a group of its own school year (Batch H, H5).
const nextYearGroup = randomUUID();
// RPW-r2 stage 2: a placement without payment (with a reason), a paid enrollment without
// level, a one-seat group taken by an occupant.
const reasonStudent = randomUUID(), levelStudent = randomUUID(), levelEnrollment = randomUUID();
const fullGroup = randomUUID(), occupantStudent = randomUUID();
// RPW-r2 stage 3: a placed young learner (pick-up adults, « Sortie des jeunes », a grade), a
// leaver, a certificate and a leave request to view, a learner placed at creation, a new teacher.
const youngStudent = randomUUID(), leaverStudent = randomUUID(), leaverEnrollment = randomUUID();
const certificate = randomUUID(), leaveRequest = randomUUID();
const teacher = randomUUID(), teacherName = run + ' teacher';
const readyName = run + ' ready', unsetName = run + ' unset';
const confirmedName = run + ' confirmed', multipleName = run + ' multiple';
const reasonName = run + ' reason', levelName = run + ' level', occupantName = run + ' occupant';
const youngName = run + ' young', leaverName = run + ' leaver', createdName = run + ' created', newTeacherName = run + ' new teacher';
// EAP (migration 127): learners created in this run through the learner form and the walk-in desk.
const fileName = run + ' file', walkInName = run + ' walk-in', walkInGroupedName = run + ' walk-in grouped', walkInReplayName = run + ' walk-in replay';
let user, browser, pdfStudent;
const portalUsers = [];
try {
  const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: 'director' } }) });
  assert.equal(response.status, 200); user = (await response.json()).id;
  sql(`update public.profiles set role='receptionist', full_name='${run} reception' where id='${user}';
    insert into public.groups(id,name,session_type,niveau,annee,date_debut,date_fin) values
      ('${group}','${run}','Yearly','Child 1','2026-2027',null,null),
      ('${incompatibleGroup}','${run} incompatible','Adults','Beginning 1','2026-2027','2026-09-01','2027-06-30'),
      ('${wrongLevelGroup}','${run} wrong level','Yearly','Child 2','2026-2027',null,null),
      ('${nextYearGroup}','${run} next year','Yearly','Child 1','2027-2028',null,null);
    insert into public.groups(id,name,session_type,niveau,annee,capacite_max) values
      ('${fullGroup}','${run} full','Yearly','Child 1','2026-2027',1);
    -- Status follows enrollments (EGC); the two Enrolled files without any enrollment
    -- (paid on a historical receipt) are seeded as Production holds them, with
    -- triggers bypassed. EAP: no pre-enrollment exists; the paid (Confirmed) rows
    -- stand for earlier desk payments.
    insert into public.students(id,full_name,status,session_type,niveau_cefr) values
      ('${student}','${run}','Prospect','Yearly',null),
      ('${confirmedStudent}','${confirmedName}','Prospect','Yearly','Child 1'),
      ('${multipleStudent}','${multipleName}','Prospect','Yearly','Child 1'),
      ('${reasonStudent}','${reasonName}','Prospect','Yearly','Child 1'),
      ('${levelStudent}','${levelName}','Prospect','Yearly',null);
    set session_replication_role=replica;
    insert into public.students(id,full_name,status,session_type,niveau_cefr,groupe_id) values
      ('${occupantStudent}','${occupantName}','Enrolled','Yearly','Child 1','${fullGroup}');
    insert into public.students(id,full_name,status,session_type,niveau_cefr) values
      ('${readyStudent}','${readyName}','Enrolled','Yearly','Child 1'),
      ('${unsetStudent}','${unsetName}','Enrolled','Yearly',null),
      ('${leaverStudent}','${leaverName}','Enrolled','Yearly','Child 1');
    insert into public.students(id,full_name,status,session_type,niveau_cefr,groupe_id,age_category) values
      ('${youngStudent}','${youngName}','Enrolled','Yearly','Child 1','${group}','Young Learners (6-12)');
    -- A real member of the group (Validated), so the grade dialog's roster offers it.
    insert into public.enrollments(student_id,status,session_type,level,school_year,group_id) values
      ('${youngStudent}','Validated','Yearly','Child 1','2026/2027','${group}');
    set session_replication_role=origin;
    insert into public.enrollments(id,student_id,status,session_type,level,school_year) values
      ('${confirmedEnrollment}','${confirmedStudent}','Confirmed','Yearly','Child 1','2026/2027'),
      ('${multipleCurrent}','${multipleStudent}','Confirmed','Yearly','Child 1','2026/2027'),
      ('${multipleNext}','${multipleStudent}','Confirmed','Yearly','Child 1','2027/2028'),
      ('${levelEnrollment}','${levelStudent}','Confirmed','Yearly',null,'2026/2027'),
      ('${leaverEnrollment}','${leaverStudent}','Confirmed','Yearly','Child 1','2026/2027');
    insert into public.teachers(id,full_name,email,telephone,contract_type,taux_horaire,salaire_mensuel,iban,notes)
      values('${teacher}','${teacherName}','${run}-teacher@example.invalid','0600000000',
        'Freelance',900,10000,'PRIVATE-BANK','Operational note');
    insert into public.certificates(id,student_id,student_name,niveau_complete,date_emission)
      values('${certificate}','${youngStudent}','${youngName}','Child 1',current_date);
    insert into public.leave_requests(id,teacher_id,teacher_name,date_debut,date_fin,type_conge)
      values('${leaveRequest}','${teacher}','${teacherName}',current_date,current_date+1,'Maladie');`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return ['127.0.0.1','localhost'].includes(host) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  let authHeader;
  const pageRequests = [], financePayloads = [], payloadChecks = [], serverErrors = [];
  const forbiddenPageData = /\/(?:teachers|payroll|financial_events|financial_requests|app_config|crm_integrations)(?:\?|$)|\/rpc\/(?:get_finance_summary|get_finance_charge_summary|get_monthly_finance_summary|get_unpaid_receipts|get_referral_breakdown)(?:\?|$)/;
  const financeOperations = /\/rest\/v1\/(?:receipts|charges|charge_balances)(?:\?|$)|\/rest\/v1\/rpc\/search_students_page(?:\?|$)/;
  page.on('request', request => {
    if (!request.url().startsWith(base + '/rest/v1/')) return;
    const authorization = request.headers().authorization;
    if (authorization?.startsWith('Bearer ') && authorization !== `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`) authHeader = authorization;
    pageRequests.push(new URL(request.url()).pathname);
  });
  page.on('response', response => {
    if (['127.0.0.1','localhost'].includes(new URL(response.url()).hostname) && response.status() >= 500) serverErrors.push(new URL(response.url()).pathname);
    if (!response.url().startsWith(base + '/rest/v1/') || !financeOperations.test(response.url())) return;
    payloadChecks.push(response.json().then(payload => financePayloads.push(payload)).catch(() => {
      // A navigation can discard a response body before Playwright reads it.
      // The assertions below require captured bodies from settled pages.
    }));
  });
  // Cold dev builds may serve the form before hydration. An enabled submit
  // after both controlled fields are filled verifies that React handled input.
  let signedIn = false;
  for (let attempt = 0; attempt < 3 && !signedIn; attempt++) {
    await page.goto(app + '/login?returnTo=/finance');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Adresse email', { exact: true }).fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    if (!(await page.getByRole('button', { name: 'Se connecter', exact: true }).isEnabled())) continue;
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    try {
      await page.waitForURL(app + '/crm/leads', { timeout: 12000 });
      signedIn = true;
    } catch (error) {
      const loginError = await page.locator('.text-red-700').first().textContent().catch(() => null);
      if (loginError) throw new Error(`Local receptionist login failed: ${loginError}`, { cause: error });
      // A cold Next build can trigger a full reload between hydration and submit.
    }
  }
  assert(signedIn, 'Login did not complete after three page loads');
  await page.getByRole('heading', { name: 'Pipeline admissions', exact: true }).waitFor();
  assert.equal(sql(`select role from public.profiles where id='${user}'`), 'receptionist');
  assert(authHeader, 'Authenticated receptionist requests were not observed');
  const authHeaders = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: authHeader };
  const profileResponse = await page.request.get(`${base}/rest/v1/profiles?select=id,role&id=eq.${user}`, { headers: authHeaders });
  assert.equal(profileResponse.status(), 200);
  assert.deepEqual(await profileResponse.json(), [{ id: user, role: 'receptionist' }]);
  for (const button of await page.locator('nav button').all()) { if (await button.getAttribute('aria-expanded') !== 'true') await button.click(); }
  const links = await page.locator('nav a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  for (const path of ['/crm/today','/crm/leads','/students','/students/new','/groups','/attendance','/timetable','/assessments','/placement-tests','/placement-tests?view=calendar','/receipts','/receipts/new','/teachers','/settings',
    // RPW-r2 stage 3.
    '/teachers/new','/dismissal','/portfolios','/learning-assessments','/certificates','/leave-requests',
    // RPW-r2 stage 4.
    '/dashboard','/reports','/notifications','/communications']) assert(links.includes(path), `Missing navigation: ${path}`);
  // EAP: the pre-registration page is retired.
  for (const path of ['/finance','/payroll','/integrations','/settings/users','/enrollments','/activity-log']) assert(!links.includes(path), `Forbidden navigation: ${path}`);
  console.log('PASS stored receptionist role, real login, forged metadata ignored and permitted sidebar');

  // O3-r2 changes the default home, while saved Today links remain usable.
  await page.goto(app + '/crm/today');
  await page.waitForURL(app + '/crm/today');
  await page.getByRole('heading', { name: 'Tâches · Mon travail', exact: true }).waitFor();
  await page.goto(app + '/crm/leads');
  await page.waitForURL(app + '/crm/leads');
  await page.getByRole('heading', { name: 'Pipeline admissions', exact: true }).waitFor();
  console.log('PASS Opportunities landing and direct Today task access');

  await page.goto(app + '/placement-tests');
  await page.getByRole('button', { name: 'Planifier un test' }).click();
  await page.getByPlaceholder('Ou saisir le nom manuellement...').fill(run);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(sql(`select count(*) from public.placement_tests where student_name='${run}' and student_id is null`), '1');
  await page.waitForLoadState('networkidle');
  const studentsRequestStart = pageRequests.length;
  await page.goto(app + '/students');
  await page.waitForLoadState('networkidle');
  const studentListRpcs = pageRequests.slice(studentsRequestStart)
    .filter(path => path.includes('/rpc/'));
  assert(studentListRpcs.includes('/rest/v1/rpc/search_students_page'), 'Shared Students query was not observed');
  assert(studentListRpcs.every(path => [
    '/rest/v1/rpc/search_students_page', '/rest/v1/rpc/apply_pending_role',
  ].includes(path)), `Shared Students loaded an unauthorized RPC: ${studentListRpcs.join(', ')}`);
  await page.getByText('Plus de filtres',{exact:false}).click();
  for (const label of ['Filtrer par statut','Filtrer par paiement','Filtrer par catégorie',
    'Filtrer par affectation de groupe','Filtrer par session','Filtrer par niveau',
    'Filtrer par complétude','Filtrer par source']) {
    await page.getByRole('combobox', { name: label }).waitFor();
  }
  assert.equal(await page.getByRole('button', { name: 'CSV', exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Import CSV' }).count(), 0);
  await page.getByRole('combobox', { name: 'Filtrer par statut' }).selectOption('all_shown');
  await page.getByLabel('Rechercher un apprenant').fill(run);
  await page.getByRole('link', { name: run, exact: true }).click();
  await page.getByRole('heading', { name: run, exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Nouveau reçu' }).count(), 1);
  assert.equal(await page.getByRole('link', { name: /Corriger/ }).count(), 0);
  // EAP (D3, D6): the learner file enrols at the payment; no pre-enrollment, no status select.
  assert.equal(await page.getByRole('button', { name: 'Nouvelle pré-inscription' }).count(), 0);
  await page.getByText('La réception inscrit, encaisse et affecte les groupes ; un groupe complet ou une affectation sans paiement demande un motif.', { exact: true }).waitFor();
  assert.equal(await page.locator('#enrollment-status').count(), 0);

  // « Inscrire et encaisser » at the desk (receipt form): any payment confirms the
  // enrollment; a chosen group is placed right after, on fresh versions.
  const field = label => page.getByText(label, { exact: true }).locator('..');
  async function payAtDesk({ name = null, groupId = '', amount, loseFirstResponse = false }) {
    if (name) {
      await page.goto(app + '/receipts/new');
      await page.getByRole('tab', { name: 'Nouvel apprenant' }).click();
      await field('Nom complet *').locator('input').fill(name);
    } else {
      await page.getByText('Apprenant sélectionné', { exact: true }).waitFor();
    }
    await field('Session *').locator('select').selectOption('Yearly');
    await field('Année scolaire *').locator('select').selectOption('2026/2027');
    await field('Niveau (facultatif)').locator('select').selectOption('Child 1');
    await field('Prix brut convenu *').locator('input').fill('3000');
    await field('Montant payé aujourd’hui *').locator('input').fill(String(amount));
    const groupSelect = field('Groupe (facultatif)').locator('select');
    await groupSelect.waitFor();
    assert.equal(await groupSelect.locator(`option[value="${incompatibleGroup}"]`).count(), 0, 'only groups of the programme, level and year');
    assert.equal(await groupSelect.locator(`option[value="${wrongLevelGroup}"]`).count(), 0);
    if (groupId) await groupSelect.selectOption(groupId);
    const submit = page.getByRole('button', { name: 'Enregistrer et générer le reçu', exact: true });
    let first = null;
    if (loseFirstResponse) {
      // The payment commits but its response is lost, so the first run places nothing;
      // the same key is then sent again and the server replays it.
      const placementCalls = [];
      const countPlacement = request => { if (request.url().includes('/rest/v1/rpc/place_learner_in_group')) placementCalls.push(request); };
      page.on('request', countPlacement);
      await page.route('**/rest/v1/rpc/create_charge_payment', async route => {
        first = await (await route.fetch()).json();
        await route.abort('failed');
      }, { times: 1 });
      const failed = page.waitForEvent('requestfailed', request => request.url().includes('/rest/v1/rpc/create_charge_payment'));
      await submit.click();
      await failed;
      assert.ok(first?.receipt_id && first.enrollment_id && first.replayed === false, 'the lost first run committed');
      assert.equal(sql(`select coalesce(group_id::text,'unset') from public.enrollments where id='${first.enrollment_id}'`), 'unset');
      page.off('request', countPlacement);
      assert.equal(placementCalls.length, 0, 'nothing is placed after a lost response');
    }
    const paid = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/create_charge_payment'));
    const placed = groupId ? page.waitForResponse(response => response.url().includes('/rest/v1/rpc/place_learner_in_group')) : null;
    await submit.click();
    const payment = await paid;
    assert.equal(payment.status(), 200, await payment.text());
    const result = await payment.json();
    if (first) {
      // A replay returns only its charge and receipt; the page reads the enrollment from the charge.
      assert.equal(result.replayed, true);
      assert.equal(result.receipt_id, first.receipt_id, 'the existing receipt, not a second one');
      assert.equal(result.charge_id, first.charge_id);
      assert.equal('enrollment_id' in result, false);
    } else {
      assert.equal(result.enrollment_confirmed, true, 'a payment of any amount confirms');
      assert.equal('enrollment_confirmation_pending' in result, false);
      assert.ok(result.receipt_id && result.enrollment_id);
    }
    const enrollmentId = first ? first.enrollment_id : result.enrollment_id;
    if (placed) {
      const placement = await placed;
      assert.equal(placement.status(), 200, await placement.text());
      assert.equal(placement.request().postDataJSON().p_enrollment, enrollmentId, 'the placement names the paid enrollment');
    }
    await page.waitForURL(new RegExp(`/receipts/${result.receipt_id}/print$`));
    if (first && groupId) await page.getByText('Paiement déjà enregistré — reçu existant affiché. Groupe affecté.', { exact: true }).waitFor();
    return { ...result, enrollment_id: enrollmentId };
  }
  // 1. An existing file, from its learner file, with a group.
  await page.getByRole('link', { name: 'Inscrire et encaisser' }).click();
  await page.waitForURL(new RegExp(`/receipts/new\\?student_id=${student}$`));
  const filePayment = await payAtDesk({ groupId: group, amount: 110 });
  assert.equal(sql(`select status||':'||group_id||':'||school_year from public.enrollments where id='${filePayment.enrollment_id}'`), `Validated:${group}:2026/2027`);
  assert.equal(sql(`select status||':'||groupe_id from public.students where id='${student}'`), `Enrolled:${group}`);
  // 2. Walk-ins from the receipt form, without and with a group.
  const walkIn = await payAtDesk({ name: walkInName, amount: 120 });
  assert.equal(sql(`select status||':'||coalesce(group_id::text,'unset') from public.enrollments where id='${walkIn.enrollment_id}'`), 'Confirmed:unset');
  assert.equal(sql(`select status from public.students where full_name='${walkInName}'`), 'Enrolled');
  const walkInGrouped = await payAtDesk({ name: walkInGroupedName, groupId: group, amount: 130 });
  assert.equal(sql(`select status||':'||group_id from public.enrollments where id='${walkInGrouped.enrollment_id}'`), `Validated:${group}`);
  // 3. A lost first response, sent again with the same key: one receipt, and the chosen group kept.
  const walkInReplay = await payAtDesk({ name: walkInReplayName, groupId: group, amount: 140, loseFirstResponse: true });
  assert.equal(sql(`select status||':'||group_id from public.enrollments where id='${walkInReplay.enrollment_id}'`), `Validated:${group}`);
  assert.equal(sql(`select count(*) from public.receipts r join public.students s on s.id=r.student_id where s.full_name='${walkInReplayName}'`), '1');
  assert.equal(sql(`select count(*) from public.students where full_name='${walkInReplayName}'`), '1');
  console.log('PASS « Inscrire et encaisser »: learner file with group, walk-ins without and with group, a replayed payment keeps its group, any amount confirms, no status select');

  // RPW-r2 (items 9, 12): the group page picker is the management one. An unpaid learner
  // is offered and placed with a logged reason (place_learner_in_group); a dossier without
  // level is offered, as for the direction.
  await page.goto(app + `/groups/${group}`);
  await page.getByRole('heading', { name: run, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ajouter des apprenants' }).click();
  const picker = page.getByRole('dialog', { name: `Ajouter des apprenants à « ${run} »` });
  await picker.getByText(readyName, { exact: true }).waitFor();
  await picker.getByText(unsetName, { exact: true }).waitFor();
  assert.equal(await picker.getByText('Un apprenant grisé n’a pas d’inscription payée : inscrire et encaisser d’abord.', { exact: true }).count(), 0);
  const unpaidOption = picker.getByRole('option').filter({ hasText: readyName });
  assert.notEqual(await unpaidOption.getAttribute('aria-disabled'), 'true', 'an unpaid learner can be picked with a reason');
  assert.match(await unpaidOption.innerText(), /sans inscription payée/);
  await picker.getByRole('option').filter({ hasText: reasonName }).click();
  const reasonDialog = page.getByRole('dialog', { name: 'Affectation sans inscription payée' });
  await reasonDialog.getByLabel('Motif de l’affectation sans inscription payée *').fill('Paiement promis lundi');
  const reasonPlacement = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/place_learner_in_group'));
  await reasonDialog.getByRole('button', { name: 'Affecter', exact: true }).click();
  const reasonResponse = await reasonPlacement;
  assert.equal(reasonResponse.status(), 200, await reasonResponse.text());
  assert.equal(reasonResponse.request().postDataJSON().p_without_enrollment_reason, 'Paiement promis lundi');
  await page.getByText(`${reasonName} ajouté(e) au groupe`).waitFor();
  assert.equal(sql(`select status||':'||group_id from public.enrollments where student_id='${reasonStudent}'`), `Validated:${group}`);
  assert.equal(sql(`select after->>'reason'||':'||(after->>'author_role') from public.activity_log
    where actor_id='${user}' and after->>'kind'='placement_without_enrollment' and after->>'student_id'='${reasonStudent}'`), 'Paiement promis lundi:receptionist');
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${readyStudent}'`), '0');
  assert.equal(sql(`select coalesce(groupe_id::text,'unset') from public.students where id='${readyStudent}'`), 'unset');
  await page.keyboard.press('Escape');
  console.log('PASS group picker: management rule (dossier without level offered), unpaid learner placed with a logged reason (item 12)');

  await page.goto(app + '/students');
  await page.getByLabel('Rechercher un apprenant').fill(readyName);
  const readyRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: readyName, exact: true }) });
  await readyRow.getByText('Aucun engagement').waitFor();
  // RPW-r2 item 2: in no group, she edits programme and level as the admin does.
  assert.equal(await readyRow.getByRole('combobox', { name: `Session de ${readyName}` }).count(), 1);
  assert.equal(await readyRow.getByRole('combobox', { name: `Niveau de ${readyName}` }).count(), 1);
  const categorySave = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_receptionist_student'));
  const listRefresh = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/search_students_page'));
  await readyRow.getByRole('combobox', { name: `Catégorie de ${readyName}` }).selectOption('Teens (13-17)');
  assert.equal((await categorySave).status(), 200);
  await listRefresh;
  assert.equal(sql(`select age_category from public.students where id='${readyStudent}'`), 'Teens (13-17)');
  // An active file without a paid enrollment is enrolled at the payment, never placed from the list.
  assert.equal(await readyRow.getByRole('button', { name: /Groupe à affecter/ }).count(), 0);
  assert.equal(await readyRow.getByRole('link', { name: 'Inscrire et encaisser' }).getAttribute('href'), `/receipts/new?student_id=${readyStudent}`);
  const readyVersion = JSON.parse(sql(`select to_json(updated_at) from public.students where id='${readyStudent}'`));
  const unpaidPlacement = await page.request.post(`${base}/rest/v1/rpc/assign_receptionist_student_group`, {
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    data: { p_student: readyStudent, p_enrollment: null, p_group: group, p_student_updated_at: readyVersion, p_enrollment_updated_at: null },
  });
  assert(unpaidPlacement.status() >= 400, 'a placement without a paid enrollment was accepted');
  // RPW-r2: the retired command passes no reason; the refusal now asks for one.
  assert.equal((await unpaidPlacement.json()).hint, 'eap.placement_reason_required');
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${readyStudent}'`), '0');
  assert.equal(sql(`select coalesce(groupe_id::text,'unset') from public.students where id='${readyStudent}'`), 'unset');
  console.log('PASS shared student filters, payment state, safe category edit; a placement without a paid enrollment and without a reason is refused');

  const assignmentVersions = JSON.parse(sql(`select json_build_object(
    'student',s.updated_at,'enrollment',e.updated_at)::text
    from public.students s join public.enrollments e on e.student_id=s.id
    where e.id='${confirmedEnrollment}'`));
  const assignmentState = () => sql(`select jsonb_build_object(
    'student',to_jsonb(s),'enrollment',to_jsonb(e))::text
    from public.students s join public.enrollments e on e.student_id=s.id
    where e.id='${confirmedEnrollment}'`);
  const stateBeforeRejections = assignmentState();
  for (const [targetGroup, kind] of [[incompatibleGroup, 'wrong-session'], [wrongLevelGroup, 'same-session wrong-level']]) {
    const incompatible = await page.request.post(`${base}/rest/v1/rpc/assign_receptionist_student_group`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: { p_student: confirmedStudent, p_enrollment: confirmedEnrollment, p_group: targetGroup,
        p_student_updated_at: assignmentVersions.student, p_enrollment_updated_at: assignmentVersions.enrollment },
    });
    assert(incompatible.status() >= 400, `${kind} enrollment/group assignment was accepted`);
    assert.equal(assignmentState(), stateBeforeRejections, `${kind} rejection changed persisted student/enrollment state`);
  }

  // "Groupe à affecter" (EGC M2, EAP): only a paid (Confirmed) enrollment without group is listed.
  async function assertFilterAction(name, studentId, listed) {
    await page.goto(app + '/students?status=all_shown');
    await page.getByLabel('Rechercher un apprenant').fill(name);
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
    await row.getByRole('button', { name: /Groupe à affecter/ }).waitFor();
    await page.getByText('Plus de filtres',{exact:false}).click();
    const filtered = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/search_students_page')
      && response.request().postDataJSON()?.p_group === 'unassigned');
    await page.getByRole('combobox', { name: 'Filtrer par affectation de groupe' }).selectOption('unassigned');
    const result = await filtered;
    assert.equal(result.status(), 200);
    assert.equal((await result.json()).rows.some(item => item.id === studentId), listed, `${name} in the group filter`);
    if (listed) await row.getByRole('button', { name: /Groupe à affecter/ }).waitFor();
  }
  await assertFilterAction(confirmedName, confirmedStudent, true);

  async function assignEnrollmentFromList(name, enrollmentId) {
    await page.goto(app + '/students?status=all_shown');
    await page.getByLabel('Rechercher un apprenant').fill(name);
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
    await row.getByRole('button', { name: /Groupe à affecter/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#enrollment-group').waitFor();
    assert.equal(await dialog.locator('#enrollment-status').count(), 0, 'no status select');
    assert.equal(await dialog.locator(`#enrollment-group option[value="${incompatibleGroup}"]`).count(), 0);
    assert.equal(await dialog.locator(`#enrollment-group option[value="${wrongLevelGroup}"]`).count(), 0);
    await dialog.locator('#enrollment-group').selectOption(group);
    // RPW-r2: the management command (place_learner_in_group), as for the direction.
    const saved = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/place_learner_in_group'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 200, await response.text());
    const body = response.request().postDataJSON();
    assert.equal(body.p_enrollment, enrollmentId, `Wrong enrollment selected for ${name}`);
    assert.equal(body.p_group, group);
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(sql(`select status||':'||group_id from public.enrollments where id='${enrollmentId}'`), `Validated:${group}`);
  }
  await assignEnrollmentFromList(confirmedName, confirmedEnrollment);
  assert.equal(sql(`select groupe_id||':'||status from public.students where id='${confirmedStudent}'`), `${group}:Enrolled`);

  // Reception creates the file without a group, enrols and collects from it, then places
  // the paid enrollment from « Groupe à affecter ». RPW-r2 item 1: the shared form offers a
  // group at creation too (checked below with its reason).
  await page.goto(app + '/students/new');
  await page.getByRole('heading', { name: 'Ajouter un apprenant' }).waitFor();
  assert.equal(await page.locator('#groupe_id').count(), 1, 'the shared form offers a group at creation');
  await page.getByRole('textbox', { name: 'Nom complet *' }).fill(fileName);
  await page.getByRole('combobox', { name: 'Session' }).selectOption('Yearly');
  await page.getByRole('combobox', { name: 'Niveau' }).selectOption('Child 1');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
  const fileStudent = new URL(page.url()).pathname.split('/').at(-1);
  assert.equal(sql(`select status||':'||coalesce(groupe_id::text,'unset') from public.students where id='${fileStudent}'`), 'Prospect:unset');
  await page.getByRole('heading', { name: fileName, exact: true }).waitFor();
  await page.getByRole('link', { name: 'Inscrire et encaisser' }).click();
  const filePaid = await payAtDesk({ amount: 140 });
  assert.equal(sql(`select status||':'||coalesce(group_id::text,'unset') from public.enrollments where id='${filePaid.enrollment_id}'`), 'Confirmed:unset');
  await assertFilterAction(fileName, fileStudent, true);
  await assignEnrollmentFromList(fileName, filePaid.enrollment_id);
  assert.equal(sql(`select groupe_id||':'||status from public.students where id='${fileStudent}'`), `${group}:Enrolled`);

  await page.goto(app + '/students?status=all_shown');
  await page.getByLabel('Rechercher un apprenant').fill(multipleName);
  const multipleRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: multipleName, exact: true }) });
  const assignmentWritesBefore = pageRequests.filter(path => /\/rpc\/(?:save_receptionist_enrollment|assign_receptionist_student_group|place_learner_in_group|save_enrollment_changes)$/.test(path)).length;
  await multipleRow.getByRole('button', { name: /Choisir l’inscription à affecter \(2\)/ }).click();
  const chooser = page.getByRole('dialog');
  await chooser.getByRole('heading', { name: /Choisir une inscription/ }).waitFor();
  await chooser.getByRole('button', { name: new RegExp(multipleCurrent.slice(0, 8)) }).waitFor();
  await chooser.getByRole('button', { name: new RegExp(multipleNext.slice(0, 8)) }).waitFor();
  assert.equal(pageRequests.filter(path => /\/rpc\/(?:save_receptionist_enrollment|assign_receptionist_student_group|place_learner_in_group|save_enrollment_changes)$/.test(path)).length,
    assignmentWritesBefore, 'Multiple enrollments were assigned before explicit selection');
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${multipleStudent}' and group_id is not null`), '0');
  await chooser.getByRole('button', { name: new RegExp(`2027/2028.*${multipleNext.slice(0, 8)}`) }).click();
  const chosenDialog = page.getByRole('dialog');
  await chosenDialog.locator('#enrollment-group').selectOption(nextYearGroup);
  const chosenSave = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/place_learner_in_group'));
  await chosenDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const chosenResponse = await chosenSave;
  assert.equal(chosenResponse.status(), 200, await chosenResponse.text());
  assert.equal(chosenResponse.request().postDataJSON().p_enrollment, multipleNext);
  await chosenDialog.waitFor({ state: 'hidden' });
  assert.equal(sql(`select group_id from public.enrollments where id='${multipleNext}'`), nextYearGroup);
  assert.equal(sql(`select coalesce(group_id::text,'unset') from public.enrollments where id='${multipleCurrent}'`), 'unset');
  console.log('PASS paid-enrollment assignment: Confirmed rows only, learner form then payment then placement, explicit multiple choice and incompatible denials');

  // ── RPW-r2 stage 2 (table A items 9-13, C1-1 to C1-3): the management enrollment dialog ──
  // The innermost card of that school year (the section around the cards matches too).
  const enrollmentCard = (year) => page.locator('div.rounded-lg.border').filter({ hasText: year })
    .filter({ has: page.getByRole('button', { name: 'Modifier l’inscription' }) }).last();
  const openEnrollment = async (studentId, name, year) => {
    await page.goto(app + `/students/${studentId}`);
    await page.getByRole('heading', { name, exact: true }).waitFor();
    await enrollmentCard(year).getByRole('button', { name: 'Modifier l’inscription' }).click();
    const dialog = page.getByRole('dialog', { name: 'Modifier l’inscription' });
    await dialog.locator('#enrollment-group').waitFor();
    return dialog;
  };
  // C1-2: every toast she sees is French (no plain-ASCII server text).
  const assertFrenchToast = async (text) => {
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
    await toast.waitFor();
    assert.doesNotMatch(await toast.innerText(), /^[\x00-\x7F]*$/, `plain-ASCII toast: ${await toast.innerText()}`);
  };
  // Item 9: a move to a group of another level; the enrollment takes the new group's level.
  {
    const dialog = await openEnrollment(confirmedStudent, confirmedName, '2026/2027');
    await dialog.locator('#enrollment-level').selectOption('Child 2');
    await dialog.locator('#enrollment-group').selectOption(wrongLevelGroup);
    const moved = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/place_learner_in_group'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const response = await moved;
    assert.equal(response.status(), 200, await response.text());
    await assertFrenchToast('Mis à jour');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(sql(`select group_id||':'||level from public.enrollments where id='${confirmedEnrollment}'`), `${wrongLevelGroup}:Child 2`);
    assert.equal(sql(`select groupe_id from public.students where id='${confirmedStudent}'`), wrongLevelGroup);
  }
  // Item 11 and C1-1: a full group is marked « complet », its reason is asked at once and logged.
  {
    const dialog = await openEnrollment(multipleStudent, multipleName, '2026/2027');
    const fullOption = dialog.locator(`#enrollment-group option[value="${fullGroup}"]`);
    await dialog.locator(`#enrollment-group option[value="${fullGroup}"]`, { hasText: 'complet' }).waitFor({ state: 'attached' });
    assert.match(await fullOption.innerText(), /· complet/);
    assert.doesNotMatch(await dialog.locator(`#enrollment-group option[value="${group}"]`).innerText(), /complet/);
    await dialog.locator('#enrollment-group').selectOption(fullGroup);
    const reason = dialog.getByLabel('Motif du dépassement *');
    await reason.waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), true, 'a reason is required');
    await reason.fill('Accord famille');
    const placed = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/place_learner_in_group'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const response = await placed;
    assert.equal(response.status(), 200, await response.text());
    assert.equal(response.request().postDataJSON().p_capacity_override_reason, 'Accord famille');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(sql(`select group_id from public.enrollments where id='${multipleCurrent}'`), fullGroup);
    assert.equal(sql(`select after->>'reason' from public.activity_log where actor_id='${user}'
      and after->>'kind'='capacity_override' and after->>'student_id'='${multipleStudent}'`), 'Accord famille');
  }
  // C1-3: no other open group of the programme and year: said, and an unchanged save stays disabled.
  {
    const dialog = await openEnrollment(multipleStudent, multipleName, '2027/2028');
    await dialog.getByText('Aucun autre groupe ouvert pour ce programme et cette année : créez-le depuis « Groupes ».').waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), true, 'nothing to save');
    await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  // C1-2: a stale dialog answers in French and reloads.
  {
    const dialog = await openEnrollment(levelStudent, levelName, '2026/2027');
    await dialog.getByLabel('Notes').fill('RPW stale');
    sql(`update public.enrollments set notes='changed elsewhere' where id='${levelEnrollment}'`);
    const stale = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_enrollment_changes'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    assert.equal((await stale).status(), 409);
    await assertFrenchToast('Cette inscription a changé, rechargez.');
    await dialog.waitFor({ state: 'hidden' });
  }
  // Items 10 and 13: the level, date and notes of a paid enrollment not yet placed.
  {
    const dialog = await openEnrollment(levelStudent, levelName, '2026/2027');
    await dialog.locator('#enrollment-level').selectOption('Child 2');
    await dialog.getByLabel('Date').fill('2026-09-15');
    await dialog.getByLabel('Notes').fill('RPW note');
    const saved = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_enrollment_changes'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 200, await response.text());
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(sql(`select level||':'||date_inscription||':'||notes||':'||coalesce(group_id::text,'unset')
      from public.enrollments where id='${levelEnrollment}'`), 'Child 2:2026-09-15:RPW note:unset');
  }
  console.log('PASS stage 2: cross-level move, « complet » with a logged reason, no-other-group message, French conflict, level, date and notes (items 9-13, C1-1 to C1-3)');

  // Review N5: a record that cannot be loaded says so in French; « Enregistrer » stays disabled.
  await page.goto(app + `/students/${randomUUID()}/edit`);
  await page.getByRole('alert').filter({ hasText: 'Fiche introuvable ou inaccessible. Revenez à la liste des apprenants.' }).waitFor();
  assert(await page.getByRole('button', { name: 'Enregistrer' }).isDisabled(), 'N5: no save without a record');
  await page.goto(app + `/students/${readyStudent}`);
  await page.getByRole('heading', { name: readyName, exact: true }).waitFor();
  await page.goto(app + `/students/${readyStudent}/edit`);
  await page.getByRole('heading', { name: 'Modifier l’apprenant' }).waitFor();
  // The shared form (item 1) draws before its record: wait for the loaded file and an enabled save.
  await page.waitForFunction(name => document.querySelector('#full_name')?.value === name, readyName);
  await page.getByRole('button', { name: 'Enregistrer' }).and(page.locator(':enabled')).waitFor();
  // RPW-r2 item 3: the e-mails are editable (refused by the command while a family link holds them).
  assert.equal(await page.getByRole('textbox', { name: 'Email (apprenant)' }).getAttribute('readonly'), null);
  assert.equal(await page.getByRole('combobox', { name: 'Groupe assigné' }).count(), 0);
  // ADR-009: an edit made stale by a second session answers at once with the French
  // conflict text (never the raw "Student unavailable or stale") and reloads the record.
  await page.getByRole('textbox', { name: 'Téléphone' }).fill('0600000111');
  sql(`update public.students set telephone='0600000222',updated_at=now() where id='${readyStudent}'`);
  const staleSave = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_receptionist_student'));
  const staleStart = Date.now();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const staleResponse = await staleSave;
  assert.equal(staleResponse.status(), 409); assert.equal((await staleResponse.json()).code, 'PT409');
  await page.getByText('Cette fiche a été modifiée entre-temps. Les informations sont actualisées : vérifiez puis recommencez.').waitFor();
  assert(Date.now() - staleStart < 5000, 'conflict shown at once');
  assert.equal(await page.getByText('Student unavailable or stale').count(), 0);
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === '0600000222'));
  assert.equal(await page.getByRole('textbox', { name: 'Téléphone' }).inputValue(), '0600000222', 'record reloaded');
  assert(page.url().endsWith(`/students/${readyStudent}/edit`));
  console.log('PASS stale receptionist edit: HTTP 409 PT409 at once, French conflict text, latest record reloaded');
  // Items 2 and 3: source and e-mail of an unplaced learner, saved and the e-mail change logged.
  await page.getByRole('textbox', { name: 'Email (apprenant)' }).fill(`${run}-ready@example.invalid`);
  await page.getByRole('combobox', { name: 'Comment avez-vous connu le centre ?' }).selectOption('Recherche Google');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.waitForURL(app + `/students/${readyStudent}`);
  assert.equal(sql(`select email||':'||referral_source from public.students where id='${readyStudent}'`), `${run}-ready@example.invalid:Recherche Google`);
  assert.equal(sql(`select count(*) from public.activity_log where target_id='${readyStudent}' and after->>'kind'='student_email_change'
    and after->>'author_role'='receptionist' and actor_id='${user}'`), '1');
  await page.goto(app + '/students/new');
  await page.getByRole('heading', { name: 'Ajouter un apprenant' }).waitFor();
  await page.getByRole('combobox', { name: 'Session' }).waitFor();
  console.log('PASS shared student detail and bounded create/edit form');

  const teacherListResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/get_teacher_operations'));
  await page.goto(app + '/teachers');
  const teacherList = await teacherListResponse;
  assert.equal(teacherList.status(), 200);
  // RPW-r2 item 19: the operations read carries notes; never a pay field.
  const allowedTeacherKeys = ['id','full_name','email','telephone','certifications','niveaux_autorises','photo_url','notes','updated_at'].sort();
  const teacherRows = await teacherList.json();
  assert(teacherRows.some(row => row.id === teacher));
  for (const row of teacherRows) assert.deepEqual(Object.keys(row).sort(), allowedTeacherKeys);
  await page.goto(app + `/teachers/${teacher}`);
  await page.getByRole('heading', { name: teacherName }).waitFor();
  await page.goto(app + `/teachers/${teacher}/edit`);
  await page.waitForFunction(name => document.querySelector('#teacher_full_name')?.value === name, teacherName);
  for (const label of ['Type de contrat', 'IBAN (virement salaire)', 'Taux horaire (MAD)', 'Salaire mensuel (MAD)']) {
    assert.equal(await page.getByText(label, { exact: true }).count(), 0, `pay field hidden: ${label}`);
  }
  const rawTeacher = await page.request.get(`${base}/rest/v1/teachers?select=id,iban,salaire_mensuel,taux_horaire,notes&id=eq.${teacher}`, { headers: authHeaders });
  assert([200, 401, 403].includes(rawTeacher.status()));
  if (rawTeacher.status() === 200) assert.deepEqual(await rawTeacher.json(), []);
  console.log('PASS authenticated teacher response projection and base-table HR isolation');

  // ── RPW-r2 stage 3 (items 1, 4-6, 14, 16, 17, 17c, 18, 19, L) ─────────────
  page.on('dialog', dialog => dialog.accept());
  // Item 1: a group at creation, with the reason for a placement without payment.
  await page.goto(app + '/students/new');
  await page.getByRole('heading', { name: 'Ajouter un apprenant' }).waitFor();
  await page.getByRole('textbox', { name: 'Nom complet *' }).fill(createdName);
  await page.getByRole('combobox', { name: 'Session' }).selectOption('Yearly');
  await page.getByRole('combobox', { name: 'Niveau' }).selectOption('Child 1');
  await page.locator('#groupe_id').selectOption(group);
  await page.getByLabel('Motif de l’affectation sans inscription payée *').fill('RPW créé et affecté');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
  const createdStudent = new URL(page.url()).pathname.split('/').at(-1);
  assert.equal(sql(`select groupe_id from public.students where id='${createdStudent}'`), group, 'item 1: placed at creation');
  // Item 4: pick-up adults on the dossier.
  await page.goto(app + `/students/${youngStudent}`);
  await page.getByRole('heading', { name: youngName, exact: true }).waitFor();
  for (const [name, phone] of [['RPW Adulte un', '0600000401'], ['RPW Adulte deux', '0600000402']]) {
    await page.getByRole('button', { name: 'Ajouter un adulte' }).click();
    const form = page.getByRole('form', { name: 'Nouvel adulte autorisé' });
    await form.getByLabel('Nom complet').fill(name);
    await form.getByLabel('Téléphone').fill(phone);
    await form.getByLabel('Relation').selectOption('Parent');
    await form.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.getByText(name, { exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'Modifier RPW Adulte un' }).click();
  await page.getByRole('form', { name: 'Modifier RPW Adulte un' }).getByLabel('Téléphone').fill('0611111401');
  await page.getByRole('form', { name: 'Modifier RPW Adulte un' }).getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Parent · 0611111401').waitFor();
  await page.getByRole('button', { name: 'Retirer RPW Adulte deux' }).click();
  await page.getByText('RPW Adulte deux', { exact: true }).waitFor({ state: 'detached' });
  assert.equal(sql(`select string_agg(full_name||':'||telephone, ',') from public.authorized_adults where student_id='${youngStudent}'`), 'RPW Adulte un:0611111401');
  // Item 5: « Sortie des jeunes », recorded under her name; no edit or delete control.
  await page.goto(app + '/dismissal');
  await page.getByRole('heading', { name: 'Sortie des jeunes apprenants' }).waitFor();
  await page.getByRole('button', { name: 'Enregistrer une sortie' }).click();
  await page.locator('#dismissal-student').selectOption(youngStudent);
  await page.locator('#dismissal-adult').selectOption({ label: 'RPW Adulte un (Parent)' });
  await page.getByRole('button', { name: 'Confirmer la sortie' }).click();
  await page.getByText(/^Sortie enregistrée/).waitFor();
  assert.equal(sql(`select adult_name||':'||staff_name from public.dismissal_logs where student_id='${youngStudent}'`), `RPW Adulte un:${run} reception`);
  // Item 16: grades — add and correct; no delete, no CSV export.
  await page.goto(app + '/assessments');
  await page.getByRole('heading', { name: 'Notes & évaluations' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Export CSV' }).count(), 0, 'item 16: no CSV export');
  await page.getByRole('button', { name: 'Nouvelle note' }).click();
  const gradeDialog = page.getByRole('dialog');
  await gradeDialog.locator('select').nth(1).selectOption(group);
  await gradeDialog.locator('select').nth(0).selectOption(youngStudent);
  await gradeDialog.locator('input[type=number]').first().fill('15');
  await gradeDialog.getByRole('button', { name: 'Enregistrer' }).click();
  await gradeDialog.waitFor({ state: 'hidden' });
  assert.equal(sql(`select note_oral::int from public.assessments where student_id='${youngStudent}'`), '15');
  assert.equal(await page.getByRole('button', { name: 'Supprimer la note' }).count(), 0, 'item 16: no delete');
  // Items 17 and 17c, L: create-only learning records, view-only certificates and leave requests.
  for (const path of ['/portfolios', '/learning-assessments']) {
    await page.goto(app + path);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('button', { name: /^Supprimer/ }).count(), 0, `${path}: no delete`);
  }
  await page.goto(app + '/certificates');
  await page.getByRole('heading', { name: 'Certificats de réussite' }).waitFor();
  await page.getByText(youngName).locator('visible=true').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Nouveau certificat' }).count(), 0, 'item 17c: no issue');
  assert.equal(await page.getByRole('button', { name: 'Supprimer le certificat' }).count(), 0, 'item 17c: no delete');
  await page.goto(app + '/leave-requests');
  await page.getByText(teacherName).locator('visible=true').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Nouvelle demande' }).count(), 0, 'L: no new request');
  assert.equal(await page.getByRole('button', { name: 'Supprimer la demande' }).count(), 0, 'L: no delete');
  assert.equal(await page.getByRole('button', { name: /^Demande du/ }).count(), 0, 'L: no edit dialog');
  // Items 6 and 14: « Ancien apprenant » with its reason, then reopen.
  await page.goto(app + `/students/${leaverStudent}`);
  await page.getByRole('heading', { name: leaverName, exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Archiver' }).count(), 0, 'item 6: « Archiver » stays hidden');
  await page.getByRole('button', { name: 'Ancien apprenant' }).click();
  await page.getByLabel('Motif *').fill('RPW programme terminé');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  await page.getByRole('button', { name: 'Rouvrir l’inscription' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Rouvrir l’inscription'));
  assert.equal(sql(`select status from public.enrollments where id='${leaverEnrollment}'`), 'Confirmed', 'item 14: reopened');
  assert.equal(sql(`select count(*) from public.activity_log where target_id='${leaverEnrollment}' and actor_id='${user}'`) !== '0', true);
  // Items 18 and 19: a teacher record without pay; e-mail and notes of an unlinked teacher.
  await page.goto(app + '/teachers');
  await page.getByRole('link', { name: 'Ajouter', exact: true }).click();
  await page.waitForURL(app + '/teachers/new');
  assert.equal(await page.getByText('Type de contrat', { exact: true }).count(), 0, 'item 18: no contract field');
  await page.getByRole('textbox', { name: 'Nom complet' }).fill(newTeacherName);
  await page.getByRole('textbox', { name: 'Email' }).fill(`${run}-new-teacher@example.invalid`);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.waitForURL(/\/teachers\/[0-9a-f-]{36}$/);
  const newTeacher = new URL(page.url()).pathname.split('/').at(-1);
  assert.equal(sql(`select email||':'||coalesce(contract_type,'none')||':'||coalesce(taux_horaire::text,'none') from public.teachers where id='${newTeacher}'`),
    `${run}-new-teacher@example.invalid:none:none`);
  await page.goto(app + `/teachers/${teacher}/edit`);
  await page.waitForFunction(() => document.querySelector('#teacher_notes')?.value === 'Operational note');
  await page.getByRole('textbox', { name: 'Notes' }).fill('RPW note réception');
  await page.getByRole('textbox', { name: 'Email' }).fill(`${run}-teacher2@example.invalid`);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.waitForURL(app + `/teachers/${teacher}`);
  assert.equal(sql(`select email||':'||notes||':'||iban||':'||taux_horaire::int from public.teachers where id='${teacher}'`),
    `${run}-teacher2@example.invalid:RPW note réception:PRIVATE-BANK:900`, 'item 19: e-mail and notes saved, pay untouched');
  console.log('PASS stage 3: group at creation, programme/source/e-mail (logged), pick-up adults, « Sortie des jeunes », grades, learning records, certificates and leave requests (view), « Ancien apprenant » and reopen, teacher record without pay, teacher e-mail and notes');

  // RPW-r2 stage 4, item 23: messages to a family, a teacher and the staff list; no free address,
  // no delete. Her rows are « office ».
  await page.goto(app + '/communications');
  await page.getByRole('heading', { name: 'Communications' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Supprimer/ }).count(), 0, 'item 23: no delete');
  const sendMessage = async (pick, subject) => {
    await page.getByRole('button', { name: 'Message', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('#message-address').count(), 0, 'item 23: no free address');
    await pick(dialog);
    await dialog.getByRole('textbox').nth(0).waitFor();
    await dialog.locator('input:not([type])').last().fill(subject);
    await dialog.locator('textarea').fill('RPW message body');
    const mailed = page.waitForResponse(response => response.url().endsWith('/api/email/send'));
    await dialog.getByRole('button', { name: 'Envoyer' }).click();
    assert.equal((await mailed).status(), 200, `${subject}: e-mail route`);
    await dialog.waitFor({ state: 'hidden' });
  };
  await sendMessage(async dialog => {
    await dialog.locator('#message-student').selectOption(readyStudent);
    await dialog.getByText(`${run}-ready@example.invalid`).waitFor();
  }, 'RPW famille');
  await page.getByRole('button', { name: 'Message', exact: true }).click();
  assert.equal(await page.getByRole('dialog').locator(`#message-person option[value="staff:${user}"]`).count(), 1, 'item 23: staff picker');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await sendMessage(async dialog => {
    await dialog.locator('#message-person').selectOption(`teacher:${teacher}`);
  }, 'RPW enseignant');
  assert.equal(sql(`select string_agg(to_user_email||':'||channel, ',' order by subject) from public.messages
    where from_user_email='${email}' and subject in ('RPW famille','RPW enseignant')`),
    `${run}-teacher2@example.invalid:portal,${run}-ready@example.invalid:office`);
  // Owner decision 2026-11-21: « office » is office <-> family; her message to a teacher stays
  // « portal » and she still reads it as her own (RLS read as her, not as the owner).
  const own = await page.request.get(`${base}/rest/v1/messages?select=subject&from_user_email=eq.${encodeURIComponent(email)}&subject=in.(%22RPW%20famille%22,%22RPW%20enseignant%22)&order=subject`, { headers: authHeaders });
  assert.deepEqual((await own.json()).map(row => row.subject), ['RPW enseignant', 'RPW famille'], 'item 23: she reads her own messages');
  await page.goto(app + '/notifications');
  await page.getByRole('button', { name: 'Envoyer une notification' }).click();
  assert.equal(await page.getByRole('dialog').getByText('Email destinataire *').count(), 0, 'item 23: notification without a free address');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  // Item 24: the unpaid list shortcut on the CRM home.
  await page.goto(app + '/crm/today');
  assert.equal(await page.getByRole('link', { name: 'À relancer' }).getAttribute('href'), '/students?payment=due');
  // Item 25: the payment note, never the cancellation reason.
  const noteReceipt = sql(`select id from public.receipts where student_id='${student}' order by created_at limit 1`);
  assert(noteReceipt, 'a receipt of the learner file');
  sql(`begin; set local session_replication_role = replica;
    update public.receipts set payment_note='RPW note de paiement', void_reason='RPW motif annulation', voided_at=now(), voided_by='${user}' where id='${noteReceipt}'; commit;`);
  await page.goto(app + `/receipts/${noteReceipt}/print`);
  await page.getByText('RPW note de paiement').waitFor();
  assert.equal(await page.getByText('RPW motif annulation').count(), 0, 'item 25: no cancellation reason');
  sql(`begin; set local session_replication_role = replica;
    update public.receipts set payment_note=null, void_reason=null, voided_at=null, voided_by=null where id='${noteReceipt}'; commit;`);
  // Item 26: Dashboard and Reports with no finance or pay call and no « Charge des enseignants ».
  const financeCalls = /\/rpc\/(?:get_finance_charge_summary|get_monthly_finance_summary|get_finance_year_months|report_payroll_by_teacher)$|\/rest\/v1\/(?:receipts|teachers|payroll)$/;
  const before26 = pageRequests.length;
  await page.goto(app + '/dashboard');
  await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.goto(app + '/reports');
  await page.getByRole('heading', { name: 'Rapports', exact: true }).waitFor();
  await page.getByText('Enseignants actifs').waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByText('Charge des enseignants').count(), 0, 'item 26: no teacher workload');
  assert.equal(await page.getByText('Paie YTD').count(), 0, 'item 26: no payroll panel');
  const finance26 = pageRequests.slice(before26).filter(path => financeCalls.test(path));
  assert.deepEqual(finance26, [], 'item 26: finance or pay call from Dashboard/Reports');
  console.log('PASS stage 4: office messages to a family and a teacher (no free address, no delete), staff picker, notifications, « À relancer », payment note only, Dashboard and Reports without finance');

  const sameOrigin = { Origin: new URL(app).origin, 'Content-Type': 'application/json' };
  // RPW-r2 stage 5, item 7: from the dossier she invites the learner (or the parent) at the
  // dossier's address; the invitation route refuses her any other role.
  sql(`update public.students set parent_email='${run}-ready-parent@example.invalid' where id='${readyStudent}'`);
  await page.goto(app + `/students/${readyStudent}`);
  await page.getByRole('button', { name: `Inviter le parent · ${run}-ready-parent@example.invalid` }).waitFor();
  const invited = page.waitForResponse(response => response.url().endsWith('/api/admin/invite'));
  await page.getByRole('button', { name: `Inviter l’apprenant · ${run}-ready@example.invalid` }).click();
  assert.equal((await invited).status(), 200, 'item 7: learner invitation');
  await page.getByText('Invitation en attente').waitFor();
  await page.getByText('Lien d’invitation perdu ou expiré ? La direction ou l’administration le renvoie', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Inviter l’apprenant/ }).count(), 0, 'item 7: no second learner invitation');
  assert.equal(sql(`select role from public.pending_roles where lower(email)='${run}-ready@example.invalid'`), 'student');
  assert.equal(sql(`select relation||':'||status from public.family_links where student_id='${readyStudent}'`), 'self:pending');
  for (const role of ['teacher', 'admin', 'receptionist']) {
    const other = await page.request.post(app + '/api/admin/invite', { headers: sameOrigin, data: { email: `${run}-other@example.invalid`, role } });
    assert.equal(other.status(), 403, `item 7: /api/admin/invite ${role}`);
  }
  const elsewhere = await page.request.post(app + '/api/admin/invite', { headers: sameOrigin,
    data: { email: `${run}-other@example.invalid`, role: 'parent', studentIds: [readyStudent] } });
  assert.notEqual(elsewhere.status(), 200, 'item 7: an address no dossier carries');
  assert.equal(sql(`select count(*) from public.pending_roles where lower(email)='${run}-other@example.invalid'`), '0');
  // Review N1: a pending staff invitation at the dossier's address is never replaced by hers.
  sql(`delete from public.rate_limits where user_id='${user}';
    update public.students set parent_email='${run}-staff@example.invalid' where id='${readyStudent}';
    insert into public.pending_roles(email, role, invited_by, expires_at)
      values ('${run}-staff@example.invalid', 'admin', (select id from public.profiles where role = 'director' limit 1), now() + interval '7 days')`);
  const staffPending = await page.request.post(app + '/api/admin/invite', { headers: sameOrigin,
    data: { email: `${run}-staff@example.invalid`, role: 'parent', studentIds: [readyStudent] } });
  assert.equal(staffPending.status(), 409, 'N1: pending staff invitation');
  assert.equal((await staffPending.json()).error,
    'Une invitation du personnel est déjà en attente à cette adresse. Seule la direction ou l’administration peut la remplacer.');
  assert.equal(sql(`select role from public.pending_roles where lower(email)='${run}-staff@example.invalid'`), 'admin');
  sql(`delete from public.pending_roles where lower(email)='${run}-staff@example.invalid';
    update public.students set parent_email='${run}-ready-parent@example.invalid' where id='${readyStudent}'`);
  console.log('PASS stage 5: family invitation from the dossier at its address only; staff and teacher invitations refused (route and database); a pending staff invitation is kept (N1); resend note shown');

  await page.goto(app + '/receipts');
  await page.getByRole('heading', { name: 'Reçus de paiement' }).waitFor();
  await Promise.all(payloadChecks);
  assert(financePayloads.length > 0, 'No operational finance response was inspected');
  const forbiddenFinanceKeys = /"(?:salary|salaire_mensuel|taux_horaire|iban|payroll|financial_events|profit|roas|cac|total_revenue|net_revenue)"\s*:/i;
  for (const payload of financePayloads) assert(!forbiddenFinanceKeys.test(JSON.stringify(payload)), 'Management or HR key leaked in operational response');
  assert(!pageRequests.some(path => forbiddenPageData.test(path)), 'Allowed page preloaded a restricted data endpoint');
  for (const rpc of ['get_finance_charge_summary','get_referral_breakdown']) {
    const denied = await page.request.post(`${base}/rest/v1/rpc/${rpc}`, { headers: { ...authHeaders, 'Content-Type': 'application/json' }, data: {} });
    assert([401, 403].includes(denied.status()), `${rpc} was not denied`);
  }
  // Batch E (FIN-12): the two pre-charge finance functions no longer exist for anyone.
  for (const rpc of ['get_finance_summary','get_unpaid_receipts']) {
    const absent = await page.request.post(`${base}/rest/v1/rpc/${rpc}`, { headers: { ...authHeaders, 'Content-Type': 'application/json' }, data: {} });
    assert.equal(absent.status(), 404, `${rpc} still answers`);
    assert.equal((await absent.json()).code, 'PGRST202', `${rpc} is not reported as absent`);
  }
  console.log('PASS operational finance responses omit management fields, analytics RPCs deny reception, obsolete finance RPCs are absent');

  await page.goto(app + '/settings');
  await page.getByRole('heading', { name: 'Mon compte', exact: true }).waitFor();
  await page.getByLabel('Nom', { exact: true }).fill('Phase 1 self-service');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Compte mis à jour', { exact: true }).waitFor();
  assert.equal(sql(`select full_name from public.profiles where id='${user}'`), 'Phase 1 self-service');
  for (const path of ['/students/new',`/students/${student}/edit`,'/groups',`/groups/${group}`,
    '/timetable','/attendance','/assessments','/receipts','/receipts/new',
    `/receipts/${student}/print`,'/teachers',`/teachers/${student}`,`/teachers/${student}/edit`,
    '/teachers/new','/dismissal','/portfolios','/learning-assessments','/certificates','/leave-requests',
    '/dashboard','/reports','/notifications','/communications']) {
    const allowed = await page.request.get(app + path, { maxRedirects: 0 });
    assert.equal(allowed.status(), 200, `Server access for ${path}`);
  }
  // RPW-r2 locked list (plan « Routes »): every typed URL returns to /crm/leads.
  for (const path of ['/finance','/crm/analytics','/activity-log',
    '/receipts/deletions','/payroll','/students/import','/settings/users','/integrations',
    `/finance/charges/${student}/edit`,`/receipts/${student}/edit`,`/receipts/${student}/delete`,'/crm/integrations/lifecycle',
    '/teacher-portal','/teacher-portal/online',`/teacher-portal/online/${student}`,'/parent-portal','/parent-portal/online',
    '/student-portal','/student-portal/online','/settings?section=centre']) {
    const requestsBeforeRedirect = pageRequests.length;
    const blocked = await page.request.get(app + path, { maxRedirects: 0 });
    assert.equal(blocked.status(), 307, 'Server denial for ' + path);
    assert.equal(new URL(blocked.headers().location, app).pathname, '/crm/leads');
    await page.goto(app + path); await page.waitForURL(app + '/crm/leads');
    await page.waitForLoadState('networkidle');
    assert(!pageRequests.slice(requestsBeforeRedirect).some(requestPath => forbiddenPageData.test(requestPath)),
      `Restricted data preloaded before redirect from ${path}`);
  }
  for (const path of ['/api/admin/invite','/api/admin/update-role','/api/admin/payroll']) {
    const result = await page.request.post(app + path, { data: { role: 'director', userId: user, email } });
    assert.equal(result.status(), 403, path);
  }
  // RPW-r2 item 15: she sends staff e-mails, to known addresses only.
  const malformedEmail = await page.request.post(app + '/api/email/send', { headers: sameOrigin, data: { role: 'director', userId: user, email } });
  assert.equal(malformedEmail.status(), 400, '/api/email/send malformed payload');
  const unknownRecipient = await page.request.post(app + '/api/email/send', { headers: sameOrigin, data: { to: 'nobody@example.invalid', subject: 'RPW', body: 'RPW' } });
  assert.equal(unknownRecipient.status(), 403, '/api/email/send unknown recipient');
  assert.equal((await unknownRecipient.json()).error, 'Recipient forbidden');
  assert.deepEqual(serverErrors, [], 'Local 5xx response during receptionist navigation');
  console.log('PASS own-account update, route redirects without sensitive preload and independent API denial');

  // PA on-demand jsPDF: when its chunk cannot load, every receipt PDF caller shows one French
  // toast (never webpack's message or the chunk URL), and once the network returns the next
  // click produces the PDF in the same document. Chunks requested after a page settles are jsPDF's.
  const pdfError = 'Impossible de préparer le PDF. Vérifiez la connexion et réessayez.';
  pdfStudent = randomUUID();
  for (const role of ['parent', 'student']) {
    const portalEmail = `${run}-${role}@example.invalid`;
    const created = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: portalEmail, password, email_confirm: true }) });
    assert.equal(created.status, 200); portalUsers.push({ id: (await created.json()).id, email: portalEmail, role });
  }
  const [parentUser, studentUser] = portalUsers;
  sql(`update public.profiles set role='parent' where id='${parentUser.id}'; update public.profiles set role='student' where id='${studentUser.id}';
    insert into public.students(id,full_name,status,email,parent_email) values('${pdfStudent}','${run} pdf','Enrolled','${studentUser.email}','${parentUser.email}');
    insert into public.family_links(student_id,relation,profile_id,invite_email,status,activated_at) values
      ('${pdfStudent}','parent','${parentUser.id}','${parentUser.email}','active',now()),
      ('${pdfStudent}','self','${studentUser.id}','${studentUser.email}','active',now());`);
  const pdfReceipt = JSON.parse(sql(`begin; alter table public.receipts disable trigger on_receipt_created;
    select set_config('request.jwt.claim.sub','${user}',true); set local role authenticated;
    select public.create_charge_payment(jsonb_build_object('student_id','${pdfStudent}','session_type','Other','service_detail','Synthetic PDF loader','school_year','2026/2027','gross_amount',100,'payment_amount',40,'payment_date',current_date,'payment_method','Espèces','idempotency_key','${randomUUID()}'));
    reset role; alter table public.receipts enable trigger on_receipt_created; commit;`).split('\n').at(-1)).receipt_id;
  const receiptNumber = sql(`select receipt_number from public.receipts where id='${pdfReceipt}'`);
  assert(receiptNumber, 'synthetic receipt number');
  async function failingChunks(target, label) {
    const pageErrors = [], attempts = new Map(); let failing = false;
    target.on('pageerror', error => pageErrors.push(error.message));
    await target.route('**/_next/static/chunks/**', route => {
      if (!failing) return route.fallback();
      attempts.set(route.request().url(), (attempts.get(route.request().url()) || 0) + 1);
      return route.abort('failed');
    });
    const toasts = target.locator('[data-sonner-toast]');
    return {
      // One caller's click while the chunk fails: retried, then exactly one French toast.
      async fail(name, click) {
        await target.waitForLoadState('networkidle'); await toasts.first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
        assert.equal(await toasts.count(), 0, `${label} ${name}: no toast before the click`);
        attempts.clear(); failing = true; await target.evaluate(() => { window.__pdfSameDocument = true; });
        await click();
        await toasts.filter({ hasText: pdfError }).first().waitFor();
        await target.waitForTimeout(600);
        assert.equal(await toasts.count(), 1, `${label} ${name}: exactly one toast`);
        const text = await toasts.first().innerText();
        assert(text.includes(pdfError) && !/Loading|chunk|_next|ChunkLoadError|Impossible de générer/i.test(text), `${label} ${name}: French loader message only (${text})`);
        assert(Math.max(0, ...attempts.values()) >= 3, `${label} ${name}: the chunk is retried (${JSON.stringify([...attempts.values()])})`);
      },
      // The network is back: the next click works in the same document.
      async recover() { failing = false; },
      async done() {
        assert.equal(await target.evaluate(() => window.__pdfSameDocument), true, `${label}: recovered without a reload`);
        assert.deepEqual(pageErrors, [], `${label}: no unhandled browser error`);
        await target.unroute('**/_next/static/chunks/**');
      },
    };
  }
  const download = async (target, click, pattern, label) => {
    const [file] = await Promise.all([target.waitForEvent('download'), click()]);
    assert.match(file.suggestedFilename(), pattern, `${label}: PDF downloaded`);
  };

  await page.goto(app + `/receipts/${pdfReceipt}/print`);
  await page.getByRole('button', { name: 'PDF A5', exact: true }).waitFor();
  let pdf = await failingChunks(page, 'print page');
  await pdf.fail('PDF A5', () => page.getByRole('button', { name: 'PDF A5', exact: true }).click());
  await pdf.fail('Imprimer A5', async () => {
    const [preview] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Imprimer A5', exact: true }).click()]);
    await preview.waitForEvent('close');
  });
  await pdf.recover();
  await download(page, () => page.getByRole('button', { name: 'PDF A5', exact: true }).click(), new RegExp(`^recu-english-hills-${receiptNumber}\\.pdf$`), 'print page');
  const [preview] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Imprimer A5', exact: true }).click()]);
  await page.getByText('PDF A5 prêt', { exact: false }).waitFor(); await preview.close();
  await pdf.done();

  await page.goto(app + '/receipts');
  await page.getByLabel('Rechercher les reçus').fill(receiptNumber);
  await page.getByRole('button', { name: `Sélectionner le reçu ${receiptNumber}`, exact: true }).click();
  pdf = await failingChunks(page, 'bulk');
  await pdf.fail('PDF (1)', () => page.getByRole('button', { name: 'PDF (1)', exact: true }).click());
  await pdf.recover();
  await download(page, () => page.getByRole('button', { name: 'PDF (1)', exact: true }).click(), /^recus-english-hills-\d{4}-\d{2}-\d{2}\.pdf$/, 'bulk');
  await pdf.done();

  for (const [portalUser, landing, tab] of [[parentUser, '/parent-portal', 'tab'], [studentUser, '/student-portal', 'button']]) {
    const portalContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await portalContext.route('**/*', route => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const portal = await portalContext.newPage(); portal.setDefaultTimeout(30000);
    await portal.goto(app + '/login'); await portal.waitForLoadState('networkidle');
    await portal.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(key => key.startsWith('__reactProps')));
    await portal.getByLabel('Adresse email', { exact: true }).fill(portalUser.email);
    await portal.getByLabel('Mot de passe', { exact: true }).fill(password);
    await portal.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await portal.waitForURL(app + landing);
    await portal.getByRole(tab, { name: /^Paiements/ }).click();
    const listButton = portal.getByRole('button', { name: `Télécharger le reçu ${receiptNumber}`, exact: true });
    await listButton.waitFor();
    pdf = await failingChunks(portal, landing);
    await pdf.fail('list', () => listButton.click());
    await pdf.fail('preview', async () => {
      await portal.getByRole('button', { name: receiptNumber, exact: true }).click();
      await portal.getByRole('dialog').getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
    });
    await pdf.recover();
    await download(portal, () => portal.getByRole('dialog').getByRole('button', { name: 'Télécharger le PDF', exact: true }).click(), new RegExp(`^recu-english-hills-${receiptNumber}\\.pdf$`), landing);
    await pdf.done();
    await portalContext.close();
  }
  console.log('PASS receipt PDF loader failure: print (PDF A5, Imprimer A5), bulk, parent and student portals (list and preview) each show one French toast after retries; the next click after the network returns downloads in the same document');
} finally {
  if (browser) await browser.close();
  if (pdfStudent) {
    const portalIds = portalUsers.map(portalUser => `'${portalUser.id}'`).join(',') || 'null';
    // Receipts are never hard-deleted outside this sanctioned local clean-up (Batch E, P2.3a).
    sql(`begin;
    set local english_hills.receipt_test_cleanup = 'on';
    delete from public.financial_events where actor_id='${user}';
    delete from public.financial_requests where actor_id='${user}';
    create temporary table pdf_cleanup_receipts on commit drop as
      select id from public.receipts where student_id='${pdfStudent}';
    delete from public.receipts where student_id='${pdfStudent}';
    delete from public.charges where student_id='${pdfStudent}';
    delete from public.family_links where student_id='${pdfStudent}';
    delete from public.students where id='${pdfStudent}';
    delete from public.rate_limits where user_id in (${portalIds});
    delete from auth.users where id in (${portalIds});
    delete from public.activity_log where actor_id in (${portalIds}) or target_id in (${portalIds})
      or target_id in (select id from pdf_cleanup_receipts) or target_id='${pdfStudent}'; commit;`);
  }
  // EAP: this run's desk payments (learner file, walk-ins, the learner form's file) and
  // the learners created through them. Receipts are never hard-deleted outside this
  // sanctioned local clean-up (Batch E, P2.3a).
  if (user) sql(`begin;
    set local english_hills.receipt_test_cleanup = 'on';
    create temporary table eap_cleanup_students on commit drop as
      select id from public.students where id='${student}' or full_name in ('${fileName}','${walkInName}','${walkInGroupedName}','${walkInReplayName}','${createdName}');
    create temporary table eap_cleanup_ids on commit drop as
      select id from public.receipts where student_id in (select id from eap_cleanup_students)
      union select id from public.charges where student_id in (select id from eap_cleanup_students)
      union select id from eap_cleanup_students;
    delete from public.financial_events where actor_id='${user}';
    delete from public.financial_requests where actor_id='${user}';
    delete from public.receipts where student_id in (select id from eap_cleanup_students);
    delete from public.charges where student_id in (select id from eap_cleanup_students);
    set local eh.enrollment_command = on;
    delete from public.enrollments where student_id in (select id from eap_cleanup_students);
    delete from public.students where id in (select id from eap_cleanup_students) and id <> '${student}';
    delete from public.activity_log where target_id in (select id from eap_cleanup_ids); commit;`);
  if (user) sql(`begin;
    create temporary table phase1_cleanup_ids on commit drop as
      select id from public.placement_tests where student_name='${run}'
      union select id from public.enrollments where student_id in ('${student}',
        '${confirmedStudent}','${multipleStudent}','${readyStudent}','${unsetStudent}',
        '${reasonStudent}','${levelStudent}','${occupantStudent}','${youngStudent}','${leaverStudent}')
      union select id from public.teachers where full_name='${newTeacherName}'
      union select unnest(array['${youngStudent}'::uuid,'${leaverStudent}'::uuid,'${certificate}'::uuid,'${leaveRequest}'::uuid])
      union select unnest(array['${user}'::uuid,'${student}'::uuid,
        '${reasonStudent}'::uuid,'${levelStudent}'::uuid,'${occupantStudent}'::uuid,'${fullGroup}'::uuid,
        '${readyStudent}'::uuid,'${unsetStudent}'::uuid,
        '${confirmedStudent}'::uuid,'${multipleStudent}'::uuid,
        '${teacher}'::uuid,'${group}'::uuid,
        '${incompatibleGroup}'::uuid,'${wrongLevelGroup}'::uuid,'${nextYearGroup}'::uuid]);
    delete from public.placement_tests where student_name='${run}';
    set local eh.enrollment_command = on; delete from public.enrollments where student_id in ('${student}',
      '${confirmedStudent}','${multipleStudent}','${readyStudent}','${unsetStudent}',
      '${reasonStudent}','${levelStudent}','${occupantStudent}','${youngStudent}','${leaverStudent}');
    -- The dismissal history refuses every delete (its trigger); this local clean-up bypasses it.
    set local session_replication_role = replica;
    delete from public.dismissal_logs where student_id='${youngStudent}';
    set local session_replication_role = origin;
    delete from public.authorized_adults where student_id='${youngStudent}';
    delete from public.assessments where student_id='${youngStudent}';
    delete from public.certificates where id='${certificate}';
    delete from public.leave_requests where id='${leaveRequest}';
    delete from public.messages where from_user_email='${email}' or to_user_email='${email}';
    delete from public.family_links where student_id='${readyStudent}';
    delete from public.pending_roles where lower(email) like '${run}-%';
    delete from auth.users where lower(email) like '${run}-%@example.invalid';
    delete from public.students where id in ('${student}','${readyStudent}','${unsetStudent}',
      '${confirmedStudent}','${multipleStudent}','${reasonStudent}','${levelStudent}','${occupantStudent}',
      '${youngStudent}','${leaverStudent}');
    delete from public.groups where id in ('${group}','${incompatibleGroup}','${wrongLevelGroup}','${nextYearGroup}','${fullGroup}');
    delete from public.leave_requests where teacher_id='${teacher}';
    delete from public.teachers where id='${teacher}' or full_name='${newTeacherName}';
    delete from auth.users where id='${user}';
    delete from public.activity_log where actor_id='${user}' or target_id in (select id from phase1_cleanup_ids);
    delete from public.rate_limits where user_id='${user}'; commit;`);
  console.log('Removed this browser run’s synthetic fixtures');
}
