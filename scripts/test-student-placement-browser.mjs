// Run with the app at localhost:3101 and local Supabase. Synthetic data only.
// Enrollment and group consistency (plan EGC-r2): every placement creates or uses
// an enrollment; a learner can sit in two programmes' groups; a full group asks
// management for an override reason; "Ancien apprenant" takes the learner off
// every roster; new and imported files start as Prospect.
// Enrollment at payment (EAP, Q3 = B): management places a learner without a paid
// enrollment only with its own logged reason; reception places paid enrollments
// only, from the group page and « Groupe à affecter », and is refused otherwise.
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
  const groupId=randomUUID(), manId=randomUUID(), fullId=randomUUID(), child2Id=randomUUID(), levelledId=randomUUID(), paidId=randomUUID(), seatedId=randomUUID();
  const recPaidId=randomUUID(), recPaid2Id=randomUUID(), recUnpaidId=randomUUID();
  sql(`insert into public.groups(id,name,session_type,niveau,annee,capacite_max) values ('${groupId}','${run} group','Yearly','Child 1','2026-2027',15),
      ('${manId}','${run} man','Mise à niveau','A1','2026-2027',15),('${fullId}','${run} full','Yearly','Child 2','2026-2027',1),
      ('${child2Id}','${run} child2','Yearly','Child 2','2026-2027',15);
    insert into public.students(id,full_name,status,session_type) values ('${paidId}','${run} paid','Prospect','Yearly'),
      ('${seatedId}','${run} seated','Prospect','Yearly'),('${levelledId}','${run} levelled','Prospect','Yearly');
    insert into public.students(id,full_name,status,session_type,niveau_cefr) values ('${recPaidId}','${run} reception paid','Prospect','Yearly','Child 1'),
      ('${recPaid2Id}','${run} reception paid two','Prospect','Yearly','Child 1');
    -- An active file without any enrollment (paid on a historical receipt), as Production holds them.
    set session_replication_role=replica;
    insert into public.students(id,full_name,status,session_type,niveau_cefr) values ('${recUnpaidId}','${run} reception unpaid','Enrolled','Yearly','Child 1');
    set session_replication_role=origin;
    -- Confirmed rows stand for desk payments (the payment confirms, EAP D2).
    insert into public.enrollments(student_id,status,session_type,school_year) values ('${paidId}','Confirmed','Yearly','2026/2027');
    insert into public.enrollments(student_id,status,session_type,level,school_year) values ('${recPaidId}','Confirmed','Yearly','Child 1','2026/2027'),
      ('${recPaid2Id}','Confirmed','Yearly','Child 1','2026/2027');
    insert into public.enrollments(student_id,group_id,status,session_type,level,school_year) values ('${seatedId}','${fullId}','Validated','Yearly','Child 2','2026/2027'),
      ('${levelledId}',null,'Confirmed','Yearly','Child 1','2026/2027');`);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(30000);
  async function groupFilter(){const filter=page.getByRole('combobox',{name:'Filtrer par affectation de groupe'});if(!await filter.isVisible())await page.getByText('Plus de filtres',{exact:false}).click();return filter;}
  async function login(target, landing){
    await target.goto('http://localhost:3101/login');
    await target.waitForLoadState('networkidle');
    // Prove React is handling events before filling the login fields.
    await target.getByRole('button',{name:'Connexion par lien magique',exact:true}).click();
    await target.getByRole('button',{name:'Retour à la connexion par mot de passe',exact:true}).click();
    await target.locator('input[type=email]').fill(email);
    await target.locator('input[type=password]').fill(password);
    await target.locator('button[type=submit]').click();
    await target.waitForURL(landing);
  }
  await login(page,'**/dashboard');
  // D3-A: a new file is a Prospect; no free status select.
  await page.goto('http://localhost:3101/students/new');
  await expect(page.locator('#status')).toHaveCount(0);
  await page.locator('#full_name').fill(run+' manual');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.waitForURL('**/students');
  assert.equal(sql(`select status from public.students where full_name='${run} manual'`).trim(),'Prospect');
  // A new file placed at creation by management: no paid enrollment, so the form asks
  // for the reason (Q3 = B); the placement creates its Validated enrollment and logs it.
  await page.goto('http://localhost:3101/students/new');
  await page.locator('#full_name').fill(run+' placed');
  await page.locator('#niveau_cefr').selectOption('Child 1');
  await page.locator('#groupe_id').selectOption(groupId);
  await expect(page.getByText('Motif de l’affectation sans inscription payée *',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.getByText('Indiquez le motif de l’affectation sans inscription payée.').first().waitFor();
  assert.equal(sql(`select count(*) from public.students where full_name='${run} placed'`).trim(),'0','nothing sent without the reason');
  await page.locator('#without_enrollment_reason').fill('Bourse direction EAP');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.waitForURL('**/students');
  assert.equal(sql(`select s.status||':'||s.groupe_id||':'||e.status||':'||e.school_year from public.students s join public.enrollments e on e.student_id=s.id where s.full_name='${run} placed'`).trim(),
    `Enrolled:${groupId}:Validated:2026/2027`);
  assert.equal(sql(`select count(*) from public.activity_log where actor_id='${userId}' and changed_columns=array['placement_without_enrollment'] and after->>'reason'='Bourse direction EAP' and after->>'author_role'='admin'`).trim(),'1');
  await page.getByRole('searchbox',{name:'Rechercher un apprenant'}).fill(run);
  await expect(page.getByRole('cell',{name:run+' placed',exact:true})).toBeVisible();
  const headers=await page.locator('thead th').allTextContents();
  assert.deepEqual(headers.slice(1,4), ['Catégorie','Groupe','Programme']);
  // EAP: the status filter no longer offers « Essai (dossier) »; « Clôturer l’année » is the director's only.
  const statusOptions=await page.getByRole('combobox',{name:'Filtrer par statut'}).locator('option').allTextContents();
  assert.deepEqual(statusOptions,['Dossiers actifs (inscrits, essai)','Tous les statuts','Inscrit','Prospect','Ancien apprenant','Inactif']);
  await expect(page.getByRole('button',{name:'Clôturer l’année',exact:true})).toHaveCount(0);
  // The pre-registration page is retired: the learner file enrols at the payment.
  await page.goto(`http://localhost:3101/students/${paidId}`);
  await expect(page.getByRole('link',{name:'Inscrire et encaisser',exact:true})).toHaveAttribute('href',`/receipts/new?student_id=${paidId}`);
  await expect(page.getByRole('button',{name:/Nouvelle (pré-)?inscription/})).toHaveCount(0);
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
  // DAT-1: the same learner joins a Mise à niveau group; the Yearly group stays. No
  // paid Mise à niveau enrollment: management gives the dedicated reason (Q3 = B).
  await page.goto(`http://localhost:3101/groups/${manId}`);
  await page.getByRole('button',{name:'Ajouter des apprenants',exact:true}).first().click();
  await expect(page.getByRole('option').filter({hasText:run+' paid'})).toContainText('sans inscription payée');
  await page.getByRole('option').filter({hasText:run+' paid'}).click();
  await page.getByLabel('Motif de l’affectation sans inscription payée *').fill('Remise à niveau offerte');
  await expect(page.getByLabel('Motif du dépassement *')).toHaveCount(0);
  await page.getByRole('button',{name:'Affecter',exact:true}).click();
  await expect.poll(() => sql(`select count(*) from public.enrollments where student_id='${paidId}' and status='Validated'`).trim()).toBe('2');
  assert.equal(sql(`select count(*) from public.activity_log where actor_id='${userId}' and changed_columns=array['placement_without_enrollment'] and after->>'reason'='Remise à niveau offerte'`).trim(),'1');
  assert.equal(sql(`select groupe_id from public.students where id='${paidId}'`).trim(), groupId, 'the main group stays Yearly');
  await page.goto('http://localhost:3101/students');
  await page.getByRole('searchbox',{name:'Rechercher un apprenant'}).fill(run+' paid');
  await expect(page.getByRole('row').filter({has:page.getByRole('cell',{name:run+' paid',exact:true})}).getByText('+1',{exact:true})).toBeVisible();
  await page.screenshot({path:join(tmpdir(),'student-placement-desktop.png'),fullPage:true});
  // SF2 / owner decision 4: direction moves the placed learner to another level's
  // group of the same programme from the enrollment; the move takes the new level.
  await page.goto(`http://localhost:3101/students/${paidId}`);
  await expect(page.getByRole('heading',{name:'Inscriptions et groupes'})).toBeVisible();
  const yearlyId=sql(`select id from public.enrollments where student_id='${paidId}' and session_type='Yearly'`).trim();
  for (const [level,target] of [['Child 2',child2Id],['Child 1',groupId]]) {
    await page.locator('div.rounded-lg.border.p-3').filter({hasText:'Programme annuel'}).getByRole('button',{name:'Modifier l’inscription'}).click();
    await page.locator('#enrollment-level').selectOption(level);
    await page.locator('#enrollment-group').selectOption(target);
    await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => sql(`select id||':'||status||':'||group_id||':'||level from public.enrollments where student_id='${paidId}' and session_type='Yearly'`).trim())
      .toBe(`${yearlyId}:Validated:${target}:${level}`);
  }
  // S1: a dialog left open while the enrollment changed elsewhere is refused, never saved.
  await page.locator('div.rounded-lg.border.p-3').filter({hasText:'Programme annuel'}).getByRole('button',{name:'Modifier l’inscription'}).click();
  sql(`update public.enrollments set notes='Modifié ailleurs' where id='${yearlyId}'`);
  await page.locator('#enrollment-level').selectOption('Child 2');
  await page.locator('#enrollment-group').selectOption(child2Id);
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.getByText('Cette inscription a changé, rechargez.').first().waitFor();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(sql(`select group_id||':'||level from public.enrollments where id='${yearlyId}'`).trim(),`${groupId}:Child 1`,'the stale edit changed nothing');
  // SF-A: an unplaced enrollment that carries a level (as every CRM pre-enrollment
  // does) is placed in a group of another level: its level is saved first, then
  // the placement succeeds with the group's level.
  await page.goto(`http://localhost:3101/students/${levelledId}`);
  await page.locator('div.rounded-lg.border.p-3').filter({hasText:'Programme annuel'}).getByRole('button',{name:'Modifier l’inscription'}).click();
  await page.locator('#enrollment-level').selectOption('Child 2');
  await page.locator('#enrollment-group').selectOption(child2Id);
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => sql(`select status||':'||group_id||':'||level from public.enrollments where student_id='${levelledId}'`).trim())
    .toBe(`Validated:${child2Id}:Child 2`);
  // History: removing the Yearly group from the enrollment keeps it Confirmed.
  await page.goto(`http://localhost:3101/students/${paidId}`);
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
  // D4-A: a full group asks management for an override reason, logged; the learner
  // has no paid enrollment, so the separate EAP reason is asked too (never one for both).
  await page.goto(`http://localhost:3101/groups/${fullId}`);
  await page.getByText('complet',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'Ajouter des apprenants',exact:true}).first().click();
  await page.getByRole('option').filter({hasText:run+' manual'}).click();
  await page.getByLabel('Motif du dépassement *').fill('Accord direction EGC');
  await expect(page.getByRole('button',{name:'Ajouter quand même',exact:true})).toBeDisabled();
  await page.getByLabel('Motif de l’affectation sans inscription payée *').fill('Essai offert par la direction');
  await page.getByRole('button',{name:'Ajouter quand même',exact:true}).click();
  await expect.poll(() => sql(`select count(*) from public.enrollments e join public.students s on s.id=e.student_id where s.full_name='${run} manual' and e.group_id='${fullId}' and e.status='Validated'`).trim()).toBe('1');
  assert.equal(sql(`select count(*) from public.activity_log where actor_id='${userId}' and changed_columns=array['capacity_override'] and after->>'reason'='Accord direction EGC'`).trim(), '1');
  assert.equal(sql(`select count(*) from public.activity_log where actor_id='${userId}' and changed_columns=array['placement_without_enrollment'] and after->>'reason'='Essai offert par la direction'`).trim(), '1');
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
  // Reception (Q3 = B): paid learners are placed from « Groupe à affecter » and the
  // group page; an unpaid one is refused with the French message and stays unplaced.
  sql(`update public.profiles set role='receptionist' where id='${userId}'`);
  const reception=await browser.newPage({viewport:{width:1440,height:1000}});
  reception.setDefaultTimeout(30000);
  await login(reception,'**/crm/leads');
  await reception.goto('http://localhost:3101/students?status=all_shown');
  await reception.getByRole('searchbox',{name:'Rechercher un apprenant'}).fill(run+' reception');
  const recPaidRow=reception.getByRole('row').filter({has:reception.getByRole('link',{name:run+' reception paid',exact:true})});
  await recPaidRow.getByRole('button',{name:/Groupe à affecter/}).click();
  await expect(reception.locator('#enrollment-status')).toHaveCount(0);
  await reception.locator('#enrollment-group').selectOption(groupId);
  await reception.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(reception.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => sql(`select status||':'||group_id from public.enrollments where student_id='${recPaidId}'`).trim()).toBe(`Validated:${groupId}`);
  const recUnpaidRow=reception.getByRole('row').filter({has:reception.getByRole('link',{name:run+' reception unpaid',exact:true})});
  await expect(recUnpaidRow.getByRole('button',{name:/Groupe à affecter/})).toHaveCount(0);
  await expect(recUnpaidRow.getByRole('link',{name:'Inscrire et encaisser',exact:true})).toHaveAttribute('href',`/receipts/new?student_id=${recUnpaidId}`);
  await reception.goto(`http://localhost:3101/groups/${groupId}`);
  await reception.getByRole('button',{name:'Ajouter des apprenants',exact:true}).first().click();
  await reception.getByRole('option').filter({hasText:run+' reception paid two'}).click();
  await expect.poll(() => sql(`select status||':'||group_id from public.enrollments where student_id='${recPaid2Id}'`).trim()).toBe(`Validated:${groupId}`);
  const refused=reception.waitForResponse(response => response.url().includes('/rest/v1/rpc/assign_receptionist_student_group'));
  await reception.getByRole('option').filter({hasText:run+' reception unpaid'}).click();
  const refusal=await refused;
  assert.ok(refusal.status()>=400,'an unpaid placement by reception was accepted');
  assert.equal((await refusal.json()).hint,'eap.paid_enrollment_required');
  await reception.getByText('Inscrivez et encaissez d’abord : l’affectation suit une inscription payée.').first().waitFor();
  assert.equal(sql(`select count(*) from public.enrollments where student_id='${recUnpaidId}'`).trim(),'0');
  assert.equal(sql(`select coalesce(groupe_id::text,'unset') from public.students where id='${recUnpaidId}'`).trim(),'unset');
  console.log('PASS browser: Prospect creation and placement at creation with its reason, list placement, second programme (+1) with its reason, history editing, group page commands, capacity override plus the separate EAP reason, Ancien apprenant, CSV defaults; reception places paid learners and is refused on an unpaid one');
} finally {
  if(browser) await browser.close();
  sql(`begin;
    create temp table cleanup_students as select id from public.students where full_name like '${run}%';
    set local eh.enrollment_command = on; delete from public.enrollments where student_id in(select id from cleanup_students);
    delete from public.students where id in(select id from cleanup_students);
    delete from public.groups where name like '${run}%';
    delete from public.activity_log where target_id in(select id from cleanup_students)${userId ? ` or actor_id='${userId}'` : ''};
    commit;`);
  if(userId) { const {error}=await db.auth.admin.deleteUser(userId); if(error) throw error; }
}
