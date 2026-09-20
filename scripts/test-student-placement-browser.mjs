// Run with the app at localhost:3017 and local Supabase. Synthetic data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
assertLocalFeatureBranch(new URL('../', import.meta.url));
const env = {};
for (const line of readFileSync('.env.local','utf8').split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g,'');
}
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
const run = 'placement-ui-' + randomUUID();
const password = randomBytes(24).toString('base64url');
const email = run + '@example.test';
let userId, browser;
const sql = statement => execFileSync('psql', ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement], {encoding:'utf8'});
try {
  const {data,error} = await db.auth.admin.createUser({email,password,email_confirm:true});
  if(error) throw error;
  userId=data.user.id;
  sql(`update public.profiles set role='admin' where id='${userId}'`);
  const groupId=randomUUID(), paidId=randomUUID(), prospectId=randomUUID();
  sql(`insert into public.groups(id,name,session_type,niveau) values ('${groupId}','${run} group','Yearly','Child 1');
    insert into public.students(id,full_name,status,session_type) values ('${paidId}','${run} paid','Enrolled','Yearly'),('${prospectId}','${run} prospect','Prospect','Yearly');
    insert into public.enrollments(student_id,status,session_type,school_year) values ('${paidId}','Confirmed','Yearly','2026/2027'),('${prospectId}','Submitted','Yearly','2026/2027');`);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(30000);
  await page.goto('http://localhost:3017/login');
  await page.waitForLoadState('networkidle');
  // Prove React is handling events before filling the login fields.
  await page.getByRole('button',{name:'Connexion par lien magique',exact:true}).click();
  await page.getByRole('button',{name:'Retour à la connexion par mot de passe',exact:true}).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  await page.goto('http://localhost:3017/students/new');
  await expect(page.locator('#status')).toHaveValue('Enrolled');
  await expect(page.locator('#status')).toBeDisabled();
  await page.locator('#full_name').fill(run+' manual');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.waitForURL('**/students');
  await page.getByRole('textbox',{name:'Rechercher un apprenant'}).fill(run);
  await expect(page.getByRole('cell',{name:run+' manual',exact:true})).toBeVisible();
  const headers=await page.locator('thead th').allTextContents();
  assert.deepEqual(headers.slice(1,4), ['Catégorie','Groupe','Session']);
  await page.getByRole('combobox',{name:'Filtrer par affectation de groupe'}).selectOption('unassigned');
  // Confirmed registrations must be absent even before group assignment.
  await page.goto('http://localhost:3017/enrollments');
  await expect(page.getByRole('cell',{name:run+' prospect',exact:true})).toBeVisible();
  await expect(page.getByRole('cell',{name:run+' paid',exact:true})).toHaveCount(0);
  await page.locator('select').first().selectOption('all');
  await expect(page.getByRole('cell',{name:run+' paid',exact:true})).toHaveCount(0);
  await page.goto('http://localhost:3017/students');
  await page.getByRole('textbox',{name:'Rechercher un apprenant'}).fill(run);
  await page.getByRole('combobox',{name:'Filtrer par affectation de groupe'}).selectOption('unassigned');
  const paidRow=page.getByRole('row').filter({has:page.getByRole('cell',{name:run+' paid',exact:true})});
  await paidRow.getByRole('button',{name:/Groupe à affecter/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#enrollment-group').selectOption(groupId);
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(paidRow).toHaveCount(0);
  await page.getByRole('combobox',{name:'Filtrer par affectation de groupe'}).selectOption('');
  await expect(paidRow.getByText(run+' group',{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.sm\\:hidden').getByText(run+' group',{exact:true})).toBeVisible();
  await page.screenshot({path:'/tmp/student-placement-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'/tmp/student-placement-desktop.png',fullPage:true});
  await page.goto('http://localhost:3017/enrollments');
  await expect(page.getByRole('cell',{name:run+' prospect',exact:true})).toBeVisible();
  await expect(page.getByRole('cell',{name:run+' paid',exact:true})).toHaveCount(0);
  await expect(page.getByRole('cell',{name:run+' manual',exact:true})).toHaveCount(0);
  await page.locator('select').first().selectOption('all');
  await expect(page.getByRole('cell',{name:run+' paid',exact:true})).toHaveCount(0);
  assert.equal(sql(`select status from public.students where full_name='${run} manual'`).trim(),'Enrolled');
  // Enrollment history remains editable after it leaves pre-registration.
  await page.goto(`http://localhost:3017/students/${paidId}`);
  await expect(page.getByRole('heading',{name:'Inscriptions et groupes'})).toBeVisible();
  await page.getByRole('button',{name:'Modifier l’inscription'}).click();
  await page.locator('#enrollment-group').selectOption('');
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Inscrit — groupe à affecter',{exact:true})).toBeVisible();
  // The existing student edit form must synchronize the same enrollment.
  await page.goto(`http://localhost:3017/students/${paidId}/edit`);
  await expect(page.locator('#full_name')).toHaveValue(run+' paid');
  await page.locator('#groupe_id').selectOption(groupId);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.waitForURL('**/students');
  assert.equal(sql(`select status from public.enrollments where student_id='${paidId}'`).trim(),'Validated');
  // Group-page removal and re-assignment also synchronize enrollment records.
  await page.goto(`http://localhost:3017/groups/${groupId}`);
  const rosterRow=page.getByRole('row').filter({has:page.getByRole('link',{name:run+' paid',exact:true})});
  page.once('dialog', dialog => dialog.accept());
  await rosterRow.getByRole('button',{name:'Retirer'}).click();
  await expect(rosterRow).toHaveCount(0);
  assert.equal(sql(`select status from public.enrollments where student_id='${paidId}'`).trim(),'Confirmed');
  await page.getByRole('button',{name:'Ajouter des apprenants',exact:true}).first().click();
  await page.getByRole('option').filter({hasText:run+' paid'}).click();
  await expect.poll(() => sql(`select status from public.enrollments where student_id='${paidId}'`).trim()).toBe('Validated');
  // CSV with no status gets the same default as Add student.
  await page.goto('http://localhost:3017/students/import');
  await page.locator('textarea').fill('full_name,session_type\n'+run+' imported,Yearly');
  await page.getByRole('button',{name:'Importer 1 apprenant(s)',exact:true}).click();
  await expect.poll(() => sql(`select status from public.students where full_name='${run} imported'`).trim()).toBe('Enrolled');
  console.log('PASS browser: manual enrollment, placement/filter, desktop/mobile, history editing, student edit synchronization, group removal/reassignment and CSV defaults');
} finally {
  if(browser) await browser.close();
  sql(`begin;
    create temp table cleanup_students as select id from public.students where full_name like '${run}%';
    delete from public.enrollments where student_id in(select id from cleanup_students);
    delete from public.students where id in(select id from cleanup_students);
    delete from public.groups where name like '${run}%';
    delete from public.activity_log where target_id in(select id from cleanup_students)${userId ? ` or actor_id='${userId}'` : ''};
    commit;`);
  if(userId) { const {error}=await db.auth.admin.deleteUser(userId); if(error) throw error; }
}
