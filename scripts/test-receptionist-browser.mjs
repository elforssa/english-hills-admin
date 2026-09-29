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
const sql = statement => execFileSync('psql', ['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } }).trim();
const run = 'receptionist-browser-' + randomUUID(), email = run + '@example.invalid';
const password = randomBytes(24).toString('base64url');
const student = randomUUID(), group = randomUUID();
const readyStudent = randomUUID(), unsetStudent = randomUUID();
const teacher = randomUUID(), teacherName = run + ' teacher';
const readyName = run + ' ready', unsetName = run + ' unset';
let user, browser;
try {
  const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: 'director' } }) });
  assert.equal(response.status, 200); user = (await response.json()).id;
  sql(`update public.profiles set role='receptionist' where id='${user}';
    insert into public.groups(id,name,session_type,niveau) values('${group}','${run}','Yearly','Child 1');
    insert into public.students(id,full_name,status,session_type,niveau_cefr) values
      ('${student}','${run}','Prospect','Yearly',null),
      ('${readyStudent}','${readyName}','Enrolled','Yearly','Child 1'),
      ('${unsetStudent}','${unsetName}','Enrolled','Yearly',null);
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
  await page.goto(app + '/login?returnTo=/finance');
  await page.waitForLoadState('networkidle');
  // Wait for React hydration before filling controlled login inputs on a cold dev build.
  await page.getByRole('button', { name: 'Connexion par lien magique', exact: true }).click();
  await page.getByRole('button', { name: 'Retour à la connexion par mot de passe', exact: true }).click();
  await page.getByLabel('Adresse email', { exact: true }).waitFor();
  await page.getByLabel('Adresse email', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(app + '/crm/today');
  await page.getByRole('heading', { name: 'Aujourd’hui', exact: true }).waitFor();
  assert.equal(sql(`select role from public.profiles where id='${user}'`), 'receptionist');
  assert(authHeader, 'Authenticated receptionist requests were not observed');
  const authHeaders = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: authHeader };
  const profileResponse = await page.request.get(`${base}/rest/v1/profiles?select=id,role&id=eq.${user}`, { headers: authHeaders });
  assert.equal(profileResponse.status(), 200);
  assert.deepEqual(await profileResponse.json(), [{ id: user, role: 'receptionist' }]);
  for (const button of await page.locator('nav button').all()) await button.click();
  const links = await page.locator('nav a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  for (const path of ['/crm/today','/crm/leads','/students','/students/new','/groups','/attendance','/timetable','/premium-sessions','/assessments','/placement-tests','/enrollments','/receipts','/receipts/new','/teachers','/settings']) assert(links.includes(path), `Missing navigation: ${path}`);
  for (const path of ['/finance','/reports','/payroll','/teachers/new','/integrations','/settings/users']) assert(!links.includes(path), `Forbidden navigation: ${path}`);
  console.log('PASS stored receptionist role, real login, forged metadata ignored and permitted sidebar');

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
  for (const label of ['Filtrer par statut','Filtrer par paiement','Filtrer par catégorie',
    'Filtrer par affectation de groupe','Filtrer par session','Filtrer par niveau',
    'Filtrer par complétude','Filtrer par source','Filtrer par formule']) {
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
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(sql(`select groupe_id from public.students where id='${readyStudent}'`), group);
  console.log('PASS shared student filters, payment state, safe category edit and checked group assignment');

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
    '/timetable','/attendance','/premium-sessions','/assessments','/receipts','/receipts/new',
    `/receipts/${student}/print`,'/teachers',`/teachers/${student}`,`/teachers/${student}/edit`]) {
    const allowed = await page.request.get(app + path, { maxRedirects: 0 });
    assert.equal(allowed.status(), 200, `Server access for ${path}`);
  }
  for (const path of ['/finance','/crm/analytics','/dashboard','/reports','/activity-log',
    '/receipts/deletions','/payroll','/teachers/new','/students/import','/settings/users','/integrations']) {
    const requestsBeforeRedirect = pageRequests.length;
    const blocked = await page.request.get(app + path, { maxRedirects: 0 });
    assert.equal(blocked.status(), 307, 'Server denial for ' + path);
    assert.equal(new URL(blocked.headers().location, app).pathname, '/crm/today');
    await page.goto(app + path); await page.waitForURL(app + '/crm/today');
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
} finally {
  if (browser) await browser.close();
  if (user) sql(`begin;
    create temporary table phase1_cleanup_ids on commit drop as
      select id from public.placement_tests where student_name='${run}'
      union select id from public.enrollments where student_id='${student}'
      union select unnest(array['${user}'::uuid,'${student}'::uuid,
        '${readyStudent}'::uuid,'${unsetStudent}'::uuid,'${teacher}'::uuid,'${group}'::uuid]);
    delete from public.placement_tests where student_name='${run}';
    delete from public.enrollments where student_id='${student}';
    delete from public.students where id in ('${student}','${readyStudent}','${unsetStudent}');
    delete from public.groups where id='${group}';
    delete from public.teachers where id='${teacher}';
    delete from auth.users where id='${user}';
    delete from public.activity_log where actor_id='${user}' or target_id in (select id from phase1_cleanup_ids);
    delete from public.rate_limits where user_id='${user}'; commit;`);
  console.log('Removed this browser run’s synthetic fixtures');
}
