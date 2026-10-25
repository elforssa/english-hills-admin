// Run with the app at localhost:3101 and local Supabase. Synthetic data only.
// Enrollment and group consistency (plan EGC-r2): every placement creates or uses
// an enrollment; a learner can sit in two programmes' groups; a full group asks
// management for an override reason; "Ancien apprenant" takes the learner off
// every roster; new and imported files start as Prospect.
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
  const groupId=randomUUID(), manId=randomUUID(), fullId=randomUUID(), paidId=randomUUID(), prospectId=randomUUID(), seatedId=randomUUID();
  sql(`insert into public.groups(id,name,session_type,niveau,annee,capacite_max) values ('${groupId}','${run} group','Yearly','Child 1','2026-2027',15),
      ('${manId}','${run} man','Mise à niveau','A1','2026-2027',15),('${fullId}','${run} full','Yearly','Child 2','2026-2027',1);
    insert into public.students(id,full_name,status,session_type) values ('${paidId}','${run} paid','Prospect','Yearly'),
      ('${prospectId}','${run} prospect','Prospect','Yearly'),('${seatedId}','${run} seated','Prospect','Yearly');
    insert into public.enrollments(student_id,status,session_type,school_year) values ('${paidId}','Confirmed','Yearly','2026/2027'),('${prospectId}','Submitted','Yearly','2026/2027');
    insert into public.enrollments(student_id,group_id,status,session_type,level,school_year) values ('${seatedId}','${fullId}','Validated','Yearly','Child 2','2026/2027');`);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(30000);
  async function groupFilter(){const filter=page.getByRole('combobox',{name:'Filtrer par affectation de groupe'});if(!await filter.isVisible())await page.getByText('Plus de filtres',{exact:false}).click();return filter;}
  await page.goto('http://localhost:3101/login');
  await page.waitForLoadState('networkidle');
  // Prove React is handling events before filling the login fields.
  await page.getByRole('button',{name:'Connexion par lien magique',exact:true}).click();
  await page.getByRole('button',{name:'Retour à la connexion par mot de passe',exact:true}).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  // D3-A: a new file is a Prospect; no free status select.
  await page.goto('http://localhost:3101/students/new');
  await expect(page.locator('#status')).toHaveCount(0);
  await page.locator('#full_name').fill(run+' manual');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.waitForURL('**/students');
  assert.equal(sql(`select status from public.students where full_name='${run} manual'`).trim(),'Prospect');
  // A new file placed at creation: the placement creates its Validated enrollment.
  await page.goto('http://localhost:3101/students/new');
  await page.locator('#full_name').fill(run+' placed');
  await page.locator('#niveau_cefr').selectOption('Child 1');
  await page.locator('#groupe_id').selectOption(groupId);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.waitForURL('**/students');
  assert.equal(sql(`select s.status||':'||s.groupe_id||':'||e.status||':'||e.school_year from public.students s join public.enrollments e on e.student_id=s.id where s.full_name='${run} placed'`).trim(),
    `Enrolled:${groupId}:Validated:2026/2027`);
  await page.getByRole('searchbox',{name:'Rechercher un apprenant'}).fill(run);
  await expect(page.getByRole('cell',{name:run+' placed',exact:true})).toBeVisible();
  const headers=await page.locator('thead th').allTextContents();
  assert.deepEqual(headers.slice(1,4), ['Catégorie','Groupe','Programme']);
  // Confirmed registrations are absent from pre-registration even before group assignment.
  await page.goto('http://localhost:3101/enrollments');
  await expect(page.getByRole('cell',{name:run+' prospect',exact:true})).toBeVisible();
  await expect(page.getByRole('cell',{name:run+' paid',exact:true})).toHaveCount(0);
  await expect(page.getByRole('cell',{name:run+' manual',exact:true})).toHaveCount(0);
  await page.locator('select').first().selectOption('all');
  await expect(page.getByRole('cell',{name:run+' paid',exact:true})).toHaveCount(0);
  // "Groupe à affecter" → place the paid enrollment from the list.
  await page.goto('http://localhost:3101/students');
  await page.getByRole('searchbox',{name:'Rechercher un apprenant'}).fill(run);
  await (await groupFilter()).selectOption('unassigned');
  const paidRow=page.getByRole('row').filter({has:page.getByRole('cell',{name:run+' paid',exact:true})});
  await paidRow.getByRole('button',{name:/Groupe à affecter/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#enrollment-group').selectOption(groupId);
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(paidRow).toHaveCount(0);
  assert.equal(sql(`select status from public.enrollments where student_id='${paidId}'`).trim(),'Validated');
  await (await groupFilter()).selectOption('');
  await expect(paidRow.getByText(run+' group',{exact:true})).toBeVisible();
  // ACA-7: in a group, programme and level cells are read-only links to the file.
  await expect(page.getByRole('combobox',{name:`Session de ${run} paid`,exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.sm\\:hidden').getByText(run+' group',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:join(tmpdir(),'student-placement-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  // DAT-1: the same learner joins a Mise à niveau group; the Yearly group stays.
  await page.goto(`http://localhost:3101/groups/${manId}`);
  await page.getByRole('button',{name:'Ajouter des apprenants',exact:true}).first().click();
  await page.getByRole('option').filter({hasText:run+' paid'}).click();
  await expect.poll(() => sql(`select count(*) from public.enrollments where student_id='${paidId}' and status='Validated'`).trim()).toBe('2');
  assert.equal(sql(`select groupe_id from public.students where id='${paidId}'`).trim(), groupId, 'the main group stays Yearly');
  await page.goto('http://localhost:3101/students');
  await page.getByRole('searchbox',{name:'Rechercher un apprenant'}).fill(run+' paid');
  await expect(page.getByRole('row').filter({has:page.getByRole('cell',{name:run+' paid',exact:true})}).getByText('+1',{exact:true})).toBeVisible();
  await page.screenshot({path:join(tmpdir(),'student-placement-desktop.png'),fullPage:true});
  // History: removing the Yearly group from the enrollment keeps it Confirmed.
  await page.goto(`http://localhost:3101/students/${paidId}`);
  await expect(page.getByRole('heading',{name:'Inscriptions et groupes'})).toBeVisible();
  await expect(page.getByText('Groupe principal',{exact:false})).toBeVisible();
  await page.locator('div.rounded-lg.border.p-3').filter({hasText:'Programme annuel'}).getByRole('button',{name:'Modifier l’inscription'}).click();
  await page.locator('#enrollment-group').selectOption('');
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => sql(`select status from public.enrollments where student_id='${paidId}' and session_type='Yearly'`).trim()).toBe('Confirmed');
  // Group page: re-assignment and removal go through the commands.
  await page.goto(`http://localhost:3101/groups/${groupId}`);
  await page.getByRole('button',{name:'Ajouter des apprenants',exact:true}).first().click();
  await page.getByRole('option').filter({hasText:run+' paid'}).click();
  await expect.poll(() => sql(`select status from public.enrollments where student_id='${paidId}' and session_type='Yearly'`).trim()).toBe('Validated');
  await page.getByRole('button',{name:'Terminé',exact:true}).click();
  const rosterRow=page.getByRole('row').filter({has:page.getByRole('link',{name:run+' paid',exact:true})});
  page.once('dialog', dialog => dialog.accept());
  await rosterRow.getByRole('button',{name:'Retirer'}).click();
  await expect(rosterRow).toHaveCount(0);
  assert.equal(sql(`select status from public.enrollments where student_id='${paidId}' and session_type='Yearly'`).trim(),'Confirmed');
  // D4-A: a full group asks management for an override reason, logged.
  await page.goto(`http://localhost:3101/groups/${fullId}`);
  await page.getByText('complet',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'Ajouter des apprenants',exact:true}).first().click();
  await page.getByRole('option').filter({hasText:run+' manual'}).click();
  await page.getByLabel('Motif du dépassement *').fill('Accord direction EGC');
  await page.getByRole('button',{name:'Ajouter quand même',exact:true}).click();
  await expect.poll(() => sql(`select count(*) from public.enrollments e join public.students s on s.id=e.student_id where s.full_name='${run} manual' and e.group_id='${fullId}' and e.status='Validated'`).trim()).toBe('1');
  assert.equal(sql(`select count(*) from public.activity_log where actor_id='${userId}' and changed_columns=array['capacity_override'] and after->>'reason'='Accord direction EGC'`).trim(), '1');
  // ACA-3: "Ancien apprenant" ends the enrollments and takes the learner off the rosters.
  await page.goto(`http://localhost:3101/students/${paidId}`);
  await page.getByRole('button',{name:'Ancien apprenant',exact:true}).click();
  await page.getByLabel('Motif *').fill('Programme terminé');
  await page.getByRole('button',{name:'Confirmer',exact:true}).click();
  await expect.poll(() => sql(`select status from public.students where id='${paidId}'`).trim()).toBe('Alumni');
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${paidId}' and status<>'Ended'`).trim(), '0');
  await page.goto(`http://localhost:3101/groups/${manId}`);
  await expect(page.getByRole('link',{name:run+' paid',exact:true})).toHaveCount(0);
  await page.goto(`http://localhost:3101/students/${paidId}`);
  await expect(page.getByText('Terminée',{exact:false}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Rouvrir l’inscription'}).first()).toBeVisible();
  // CSV: Enrolled rows import as Prospect, with a notice.
  await page.goto('http://localhost:3101/students/import');
  await page.locator('textarea').fill('full_name,session_type,status\n'+run+' imported,Yearly,Enrolled');
  await expect(page.getByText('seront importées en Prospect',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Importer 1 apprenant(s)',exact:true}).click();
  await expect.poll(() => sql(`select status from public.students where full_name='${run} imported'`).trim()).toBe('Prospect');
  console.log('PASS browser: Prospect creation and placement at creation, list placement, second programme (+1), history editing, group page commands, capacity override, Ancien apprenant and CSV defaults');
} finally {
  if(browser) await browser.close();
  sql(`begin;
    create temp table cleanup_students as select id from public.students where full_name like '${run}%';
    set eh.enrollment_command = on; delete from public.enrollments where student_id in(select id from cleanup_students);
    delete from public.students where id in(select id from cleanup_students);
    delete from public.groups where name like '${run}%';
    delete from public.activity_log where target_id in(select id from cleanup_students)${userId ? ` or actor_id='${userId}'` : ''};
    commit;`);
  if(userId) { const {error}=await db.auth.admin.deleteUser(userId); if(error) throw error; }
}
