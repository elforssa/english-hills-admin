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
const submittedStudent = randomUUID(), reviewStudent = randomUUID(), confirmedStudent = randomUUID(), multipleStudent = randomUUID();
const validatedStudent = randomUUID(), validatedEnrollment = randomUUID();
const submittedEnrollment = randomUUID(), reviewEnrollment = randomUUID(), confirmedEnrollment = randomUUID();
const multipleSubmitted = randomUUID(), multipleReview = randomUUID(), incompatibleGroup = randomUUID(), wrongLevelGroup = randomUUID();
const teacher = randomUUID(), teacherName = run + ' teacher';
const readyName = run + ' ready', unsetName = run + ' unset';
const submittedName = run + ' submitted', reviewName = run + ' review';
const confirmedName = run + ' confirmed', multipleName = run + ' multiple', validatedName = run + ' validated legacy';
let user, browser, pdfStudent;
const portalUsers = [];
try {
  const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: 'director' } }) });
  assert.equal(response.status, 200); user = (await response.json()).id;
  sql(`update public.profiles set role='receptionist' where id='${user}';
    insert into public.groups(id,name,session_type,niveau) values
      ('${group}','${run}','Yearly','Child 1'),
      ('${incompatibleGroup}','${run} incompatible','Adults','Beginning 1'),
      ('${wrongLevelGroup}','${run} wrong level','Yearly','Child 2');
    insert into public.students(id,full_name,status,session_type,niveau_cefr,groupe_id) values
      ('${student}','${run}','Prospect','Yearly',null,null),
      ('${readyStudent}','${readyName}','Enrolled','Yearly','Child 1',null),
      ('${unsetStudent}','${unsetName}','Enrolled','Yearly',null,null),
      ('${submittedStudent}','${submittedName}','Enrolled','Yearly','Child 1','${group}'),
      ('${reviewStudent}','${reviewName}','Enrolled','Yearly','Child 1','${group}'),
      ('${confirmedStudent}','${confirmedName}','Enrolled','Yearly','Child 1',null),
      ('${multipleStudent}','${multipleName}','Enrolled','Yearly','Child 1',null),
      ('${validatedStudent}','${validatedName}','Enrolled','Yearly','Child 1','${group}');
    insert into public.enrollments(id,student_id,status,session_type,level,school_year) values
      ('${submittedEnrollment}','${submittedStudent}','Submitted','Yearly','Child 1','2026/2027'),
      ('${reviewEnrollment}','${reviewStudent}','Under Review','Yearly','Child 1','2026/2027'),
      ('${confirmedEnrollment}','${confirmedStudent}','Confirmed','Yearly','Child 1','2026/2027'),
      ('${multipleSubmitted}','${multipleStudent}','Submitted','Yearly','Child 1','2026/2027'),
      ('${multipleReview}','${multipleStudent}','Under Review','Yearly','Child 1','2027/2028');
    -- Simulate a legacy unassigned Validated row. Current triggers reject creation
    -- of this state; the checked assignment must still allow its repair.
    set session_replication_role=replica;
    insert into public.enrollments(id,student_id,status,session_type,level,school_year)
      values('${validatedEnrollment}','${validatedStudent}','Validated','Yearly','Child 1','2026/2027');
    set session_replication_role=origin;
    insert into public.teachers(id,full_name,email,telephone,contract_type,taux_horaire,salaire_mensuel,iban,notes)
      values('${teacher}','${teacherName}','${run}-teacher@example.invalid','0600000000',
        'Freelance',900,10000,'PRIVATE-BANK','PRIVATE-HR');`);
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
  for (const path of ['/crm/today','/crm/leads','/students','/students/new','/groups','/attendance','/timetable','/assessments','/placement-tests','/placement-tests?view=calendar','/enrollments','/receipts','/receipts/new','/teachers','/settings']) assert(links.includes(path), `Missing navigation: ${path}`);
  for (const path of ['/finance','/reports','/payroll','/teachers/new','/integrations','/settings/users']) assert(!links.includes(path), `Forbidden navigation: ${path}`);
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
  await page.getByRole('button', { name: 'Nouvelle pré-inscription' }).click();
  await page.getByLabel('Statut', { exact: true }).selectOption('Trial');
  await page.getByLabel('Groupe', { exact: true }).selectOption(group);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(sql(`select status from public.students where id='${student}'`), 'Trial');
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${student}' and group_id='${group}' and status='Trial'`), '1');
  console.log('PASS prospect placement creation, student search/detail and operational trial enrollment');

  await page.goto(app + `/groups/${group}`);
  await page.getByRole('heading', { name: run, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ajouter des apprenants' }).click();
  const picker = page.getByRole('dialog');
  await picker.getByText(readyName, { exact: true }).waitFor();
  assert.equal(await picker.getByText(unsetName, { exact: true }).count(), 0);
  console.log('PASS group picker offers matching level and excludes unset-level dossier');

  await page.goto(app + '/students');
  await page.getByLabel('Rechercher un apprenant').fill(readyName);
  const readyRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: readyName, exact: true }) });
  await readyRow.getByText('Aucun engagement').waitFor();
  assert.equal(await readyRow.getByRole('combobox', { name: `Session de ${readyName}` }).count(), 0);
  assert.equal(await readyRow.getByRole('combobox', { name: `Niveau de ${readyName}` }).count(), 0);
  const categorySave = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_receptionist_student'));
  const listRefresh = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/search_students_page'));
  await readyRow.getByRole('combobox', { name: `Catégorie de ${readyName}` }).selectOption('Teens (13-17)');
  assert.equal((await categorySave).status(), 200);
  await listRefresh;
  assert.equal(sql(`select age_category from public.students where id='${readyStudent}'`), 'Teens (13-17)');
  await readyRow.getByRole('button', { name: 'Groupe à affecter' }).click();
  await page.getByRole('combobox', { name: 'Groupe compatible' }).selectOption(group);
  const groupSave = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/assign_receptionist_student_group'));
  await page.getByRole('button', { name: 'Affecter', exact: true }).click();
  const groupResult = await groupSave;
  assert.equal(groupResult.status(), 200, await groupResult.text());
  assert.equal(groupResult.request().postDataJSON().p_enrollment, null);
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(sql(`select groupe_id from public.students where id='${readyStudent}'`), group);
  console.log('PASS shared student filters, payment state, safe category edit and dossier-only assignment');

  const assignmentVersions = JSON.parse(sql(`select json_build_object(
    'student',s.updated_at,'enrollment',e.updated_at)::text
    from public.students s join public.enrollments e on e.student_id=s.id
    where e.id='${submittedEnrollment}'`));
  const assignmentState = () => sql(`select jsonb_build_object(
    'student',to_jsonb(s),'enrollment',to_jsonb(e))::text
    from public.students s join public.enrollments e on e.student_id=s.id
    where e.id='${submittedEnrollment}'`);
  const stateBeforeRejections = assignmentState();
  for (const [targetGroup, kind] of [[incompatibleGroup, 'wrong-session'], [wrongLevelGroup, 'same-session wrong-level']]) {
    const incompatible = await page.request.post(`${base}/rest/v1/rpc/assign_receptionist_student_group`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: { p_student: submittedStudent, p_enrollment: submittedEnrollment, p_group: targetGroup,
        p_student_updated_at: assignmentVersions.student, p_enrollment_updated_at: assignmentVersions.enrollment },
    });
    assert(incompatible.status() >= 400, `${kind} enrollment/group assignment was accepted`);
    assert.equal(assignmentState(), stateBeforeRejections, `${kind} rejection changed persisted student/enrollment state`);
  }

  async function assertFilterKeepsAction(name, studentId) {
    await page.goto(app + '/students?status=all_shown');
    await page.getByLabel('Rechercher un apprenant').fill(name);
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
    await row.getByRole('button', { name: /Groupe à affecter/ }).waitFor();
    await row.getByText(run, { exact: true }).waitFor(); // existing dossier group
    await page.getByText('Plus de filtres',{exact:false}).click();
    const filtered = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/search_students_page')
      && response.request().postDataJSON()?.p_group === 'unassigned');
    await page.getByRole('combobox', { name: 'Filtrer par affectation de groupe' }).selectOption('unassigned');
    const result = await filtered;
    assert.equal(result.status(), 200);
    assert((await result.json()).rows.some(item => item.id === studentId), `${name} disappeared from the group filter`);
    await row.getByRole('button', { name: /Groupe à affecter/ }).waitFor();
  }
  await assertFilterKeepsAction(submittedName, submittedStudent);
  await assertFilterKeepsAction(reviewName, reviewStudent);
  await assertFilterKeepsAction(validatedName, validatedStudent);

  async function assignEnrollmentFromList(name, enrollmentId, expectedStatus) {
    await page.goto(app + '/students?status=all_shown');
    await page.getByLabel('Rechercher un apprenant').fill(name);
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
    await row.getByRole('button', { name: /Groupe à affecter/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#enrollment-group').waitFor();
    assert.equal(await dialog.locator(`#enrollment-group option[value="${incompatibleGroup}"]`).count(), 0);
    assert.equal(await dialog.locator(`#enrollment-group option[value="${wrongLevelGroup}"]`).count(), 0);
    await dialog.locator('#enrollment-group').selectOption(group);
    const saved = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_receptionist_enrollment'));
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 200, await response.text());
    const body = response.request().postDataJSON();
    assert.equal(body.p_enrollment, enrollmentId, `Wrong enrollment selected for ${name}`);
    assert.equal(body.p_group, group);
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(sql(`select group_id from public.enrollments where id='${enrollmentId}'`), group);
    assert.equal(sql(`select status from public.enrollments where id='${enrollmentId}'`), expectedStatus);
  }
  await assignEnrollmentFromList(submittedName, submittedEnrollment, 'Submitted');
  await assignEnrollmentFromList(reviewName, reviewEnrollment, 'Under Review');
  await assignEnrollmentFromList(confirmedName, confirmedEnrollment, 'Validated');
  await assignEnrollmentFromList(validatedName, validatedEnrollment, 'Validated');
  assert.equal(sql(`select groupe_id from public.students where id='${validatedStudent}'`), group);

  await page.goto(app + '/students?status=all_shown');
  await page.getByLabel('Rechercher un apprenant').fill(multipleName);
  const multipleRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: multipleName, exact: true }) });
  const assignmentWritesBefore = pageRequests.filter(path => /\/rpc\/(?:save_receptionist_enrollment|assign_receptionist_student_group)$/.test(path)).length;
  await multipleRow.getByRole('button', { name: /Choisir l’inscription à affecter \(2\)/ }).click();
  const chooser = page.getByRole('dialog');
  await chooser.getByRole('heading', { name: /Choisir une inscription/ }).waitFor();
  await chooser.getByRole('button', { name: new RegExp(multipleSubmitted.slice(0, 8)) }).waitFor();
  await chooser.getByRole('button', { name: new RegExp(multipleReview.slice(0, 8)) }).waitFor();
  assert.equal(pageRequests.filter(path => /\/rpc\/(?:save_receptionist_enrollment|assign_receptionist_student_group)$/.test(path)).length,
    assignmentWritesBefore, 'Multiple enrollments were assigned before explicit selection');
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${multipleStudent}' and group_id is not null`), '0');
  await chooser.getByRole('button', { name: new RegExp(`En cours d’examen.*${multipleReview.slice(0, 8)}`) }).click();
  const chosenDialog = page.getByRole('dialog');
  await chosenDialog.locator('#enrollment-group').selectOption(group);
  const chosenSave = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_receptionist_enrollment'));
  await chosenDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const chosenResponse = await chosenSave;
  assert.equal(chosenResponse.status(), 200, await chosenResponse.text());
  assert.equal(chosenResponse.request().postDataJSON().p_enrollment, multipleReview);
  await chosenDialog.waitFor({ state: 'hidden' });
  assert.equal(sql(`select group_id from public.enrollments where id='${multipleReview}'`), group);
  assert.equal(sql(`select coalesce(group_id::text,'unset') from public.enrollments where id='${multipleSubmitted}'`), 'unset');
  console.log('PASS enrollment-aware assignment: Submitted, Under Review, Confirmed, legacy Validated, explicit multiple choice and incompatible denials');

  await page.goto(app + `/students/${readyStudent}`);
  await page.getByRole('heading', { name: readyName, exact: true }).waitFor();
  await page.goto(app + `/students/${readyStudent}/edit`);
  await page.getByRole('heading', { name: 'Modifier l’apprenant' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Email apprenant' }).getAttribute('readonly'), '');
  assert.equal(await page.getByRole('combobox', { name: 'Groupe assigné' }).count(), 0);
  await page.goto(app + '/students/new');
  await page.getByRole('heading', { name: 'Ajouter un apprenant' }).waitFor();
  await page.getByRole('combobox', { name: 'Session' }).waitFor();
  console.log('PASS shared student detail and bounded create/edit form');

  const teacherListResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/get_teacher_operations'));
  await page.goto(app + '/teachers');
  const teacherList = await teacherListResponse;
  assert.equal(teacherList.status(), 200);
  const allowedTeacherKeys = ['id','full_name','email','telephone','certifications','niveaux_autorises','photo_url','updated_at'].sort();
  const teacherRows = await teacherList.json();
  assert(teacherRows.some(row => row.id === teacher));
  for (const row of teacherRows) assert.deepEqual(Object.keys(row).sort(), allowedTeacherKeys);
  await page.goto(app + `/teachers/${teacher}`);
  await page.getByRole('heading', { name: teacherName }).waitFor();
  await page.goto(app + `/teachers/${teacher}/edit`);
  await page.getByRole('textbox', { name: 'Nom complet' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Nom complet' }).inputValue(), teacherName);
  const rawTeacher = await page.request.get(`${base}/rest/v1/teachers?select=id,iban,salaire_mensuel,taux_horaire,notes&id=eq.${teacher}`, { headers: authHeaders });
  assert([200, 401, 403].includes(rawTeacher.status()));
  if (rawTeacher.status() === 200) assert.deepEqual(await rawTeacher.json(), []);
  console.log('PASS authenticated teacher response projection and base-table HR isolation');

  await page.goto(app + '/receipts');
  await page.getByRole('heading', { name: 'Reçus de paiement' }).waitFor();
  await Promise.all(payloadChecks);
  assert(financePayloads.length > 0, 'No operational finance response was inspected');
  const forbiddenFinanceKeys = /"(?:salary|salaire_mensuel|taux_horaire|iban|payroll|financial_events|profit|roas|cac|total_revenue|net_revenue)"\s*:/i;
  for (const payload of financePayloads) assert(!forbiddenFinanceKeys.test(JSON.stringify(payload)), 'Management or HR key leaked in operational response');
  assert(!pageRequests.some(path => forbiddenPageData.test(path)), 'Allowed page preloaded a restricted data endpoint');
  for (const rpc of ['get_finance_summary','get_finance_charge_summary','get_referral_breakdown']) {
    const denied = await page.request.post(`${base}/rest/v1/rpc/${rpc}`, { headers: { ...authHeaders, 'Content-Type': 'application/json' }, data: {} });
    assert([401, 403].includes(denied.status()), `${rpc} was not denied`);
  }
  console.log('PASS operational finance responses omit management fields and analytics RPCs deny reception');

  await page.goto(app + '/settings');
  await page.getByRole('heading', { name: 'Mon compte', exact: true }).waitFor();
  await page.getByLabel('Nom', { exact: true }).fill('Phase 1 self-service');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Compte mis à jour', { exact: true }).waitFor();
  assert.equal(sql(`select full_name from public.profiles where id='${user}'`), 'Phase 1 self-service');
  for (const path of ['/students/new',`/students/${student}/edit`,'/groups',`/groups/${group}`,
    '/timetable','/attendance','/assessments','/receipts','/receipts/new',
    `/receipts/${student}/print`,'/teachers',`/teachers/${student}`,`/teachers/${student}/edit`]) {
    const allowed = await page.request.get(app + path, { maxRedirects: 0 });
    assert.equal(allowed.status(), 200, `Server access for ${path}`);
  }
  for (const path of ['/finance','/crm/analytics','/dashboard','/reports','/activity-log',
    '/receipts/deletions','/payroll','/teachers/new','/students/import','/settings/users','/integrations']) {
    const requestsBeforeRedirect = pageRequests.length;
    const blocked = await page.request.get(app + path, { maxRedirects: 0 });
    assert.equal(blocked.status(), 307, 'Server denial for ' + path);
    assert.equal(new URL(blocked.headers().location, app).pathname, '/crm/leads');
    await page.goto(app + path); await page.waitForURL(app + '/crm/leads');
    await page.waitForLoadState('networkidle');
    assert(!pageRequests.slice(requestsBeforeRedirect).some(requestPath => forbiddenPageData.test(requestPath)),
      `Restricted data preloaded before redirect from ${path}`);
  }
  for (const path of ['/api/admin/invite','/api/admin/update-role','/api/admin/payroll','/api/email/send']) {
    const result = await page.request.post(app + path, { data: { role: 'director', userId: user, email } });
    assert.equal(result.status(), 403, path);
  }
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
    insert into public.students(id,full_name,status,email,parent_email) values('${pdfStudent}','${run} pdf','Enrolled','${studentUser.email}','${parentUser.email}');`);
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
    sql(`begin;
    delete from public.financial_events where actor_id='${user}';
    delete from public.financial_requests where actor_id='${user}';
    create temporary table pdf_cleanup_receipts on commit drop as
      select id from public.receipts where student_id='${pdfStudent}';
    delete from public.receipts where student_id='${pdfStudent}';
    delete from public.charges where student_id='${pdfStudent}';
    delete from public.students where id='${pdfStudent}';
    delete from public.rate_limits where user_id in (${portalIds});
    delete from auth.users where id in (${portalIds});
    delete from public.activity_log where actor_id in (${portalIds}) or target_id in (${portalIds})
      or target_id in (select id from pdf_cleanup_receipts) or target_id='${pdfStudent}'; commit;`);
  }
  if (user) sql(`begin;
    create temporary table phase1_cleanup_ids on commit drop as
      select id from public.placement_tests where student_name='${run}'
      union select id from public.enrollments where student_id in ('${student}','${submittedStudent}',
        '${reviewStudent}','${confirmedStudent}','${multipleStudent}','${validatedStudent}')
      union select unnest(array['${user}'::uuid,'${student}'::uuid,
        '${readyStudent}'::uuid,'${unsetStudent}'::uuid,'${submittedStudent}'::uuid,
        '${reviewStudent}'::uuid,'${confirmedStudent}'::uuid,'${multipleStudent}'::uuid,
        '${validatedStudent}'::uuid,'${teacher}'::uuid,'${group}'::uuid,
        '${incompatibleGroup}'::uuid,'${wrongLevelGroup}'::uuid]);
    delete from public.placement_tests where student_name='${run}';
    delete from public.enrollments where student_id in ('${student}','${submittedStudent}',
      '${reviewStudent}','${confirmedStudent}','${multipleStudent}','${validatedStudent}');
    delete from public.students where id in ('${student}','${readyStudent}','${unsetStudent}',
      '${submittedStudent}','${reviewStudent}','${confirmedStudent}','${multipleStudent}',
      '${validatedStudent}');
    delete from public.groups where id in ('${group}','${incompatibleGroup}','${wrongLevelGroup}');
    delete from public.teachers where id='${teacher}';
    delete from auth.users where id='${user}';
    delete from public.activity_log where actor_id='${user}' or target_id in (select id from phase1_cleanup_ids);
    delete from public.rate_limits where user_id='${user}'; commit;`);
  console.log('Removed this browser run’s synthetic fixtures');
}
