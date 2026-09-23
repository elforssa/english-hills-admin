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
let user, browser;
try {
  const response = await fetch(base + '/auth/v1/admin/users', { method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: 'director' } }) });
  assert.equal(response.status, 200); user = (await response.json()).id;
  sql(`update public.profiles set role='receptionist' where id='${user}';
    insert into public.groups(id,name,session_type,niveau) values('${group}','${run}','Yearly','Child 1');
    insert into public.students(id,full_name,status,session_type) values('${student}','${run}','Prospect','Yearly');`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return ['127.0.0.1','localhost'].includes(host) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(app + '/login?returnTo=/finance');
  // Wait for hydration before dispatching form events against the real app.
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(app + '/placement-tests');
  await page.getByRole('heading', { name: 'Tests de niveau' }).waitFor();
  await page.getByRole('button', { name: 'Apprenants', exact: true }).click();
  await page.getByRole('button', { name: 'Inscriptions', exact: true }).click();
  const links = await page.locator('nav a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  assert.deepEqual(new Set(links), new Set(['/students','/placement-tests','/enrollments','/settings']));
  console.log('PASS real receptionist login, forged metadata ignored, permitted home and sidebar');

  await page.getByRole('button', { name: 'Planifier un test' }).click();
  await page.getByPlaceholder('Ou saisir le nom manuellement...').fill(run);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(sql(`select count(*) from public.placement_tests where student_name='${run}' and student_id is null`), '1');
  await page.goto(app + '/students');
  await page.getByLabel('Rechercher un apprenant').fill(run);
  await page.getByRole('link', { name: run, exact: true }).click();
  await page.getByRole('heading', { name: run, exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: /Encaisser|Nouveau reçu|Corriger/ }).count(), 0);
  await page.getByRole('button', { name: 'Nouvelle pré-inscription' }).click();
  await page.getByLabel('Statut', { exact: true }).selectOption('Trial');
  await page.getByLabel('Groupe', { exact: true }).selectOption(group);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(sql(`select status from public.students where id='${student}'`), 'Trial');
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${student}' and group_id='${group}' and status='Trial'`), '1');
  console.log('PASS prospect placement creation, student search/detail and operational trial enrollment');

  await page.goto(app + '/settings');
  await page.getByRole('heading', { name: 'Mon compte', exact: true }).waitFor();
  await page.getByLabel('Nom', { exact: true }).fill('Phase 1 self-service');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Compte mis à jour', { exact: true }).waitFor();
  assert.equal(sql(`select full_name from public.profiles where id='${user}'`), 'Phase 1 self-service');
  for (const path of ['/finance','/reports','/teachers','/students/new',`/students/${student}/edit`,'/settings/users','/integrations']) {
    const blocked = await page.request.get(app + path, { maxRedirects: 0 });
    assert.equal(blocked.status(), 307, 'Server denial for ' + path);
    assert.equal(new URL(blocked.headers().location, app).pathname, '/placement-tests');
    await page.goto(app + path); await page.waitForURL(app + '/placement-tests');
  }
  for (const path of ['/api/admin/invite','/api/admin/update-role','/api/admin/payroll','/api/email/send']) {
    const result = await page.request.post(app + path, { data: { role: 'director', userId: user, email } });
    assert.equal(result.status(), 403, path);
  }
  console.log('PASS own-account update, direct URL restrictions and independent API denial');
} finally {
  if (browser) await browser.close();
  if (user) sql(`begin;
    create temporary table phase1_cleanup_ids on commit drop as
      select id from public.placement_tests where student_name='${run}'
      union select id from public.enrollments where student_id='${student}'
      union select unnest(array['${user}'::uuid,'${student}'::uuid,'${group}'::uuid]);
    delete from public.placement_tests where student_name='${run}';
    delete from public.enrollments where student_id='${student}';
    delete from public.students where id='${student}';
    delete from public.groups where id='${group}';
    delete from auth.users where id='${user}';
    delete from public.activity_log where actor_id='${user}' or target_id in (select id from phase1_cleanup_ids);
    delete from public.rate_limits where user_id='${user}'; commit;`);
  console.log('Removed this browser run’s synthetic fixtures');
}
