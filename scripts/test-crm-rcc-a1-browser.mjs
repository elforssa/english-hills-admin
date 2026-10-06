// RCC-A1 local Auth + real UI acceptance. Synthetic fixtures are removed in finally.
// No Git mutations, production connections, external requests or real data copies.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
assertLocalFeatureBranch();
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const run='rcc-a1-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
let browser,actor;const pageErrors=[];
const rpc=(name,data,id=actor,key=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(id)};set local role authenticated;select public.crm_${name}(${quote(key)},${quote(JSON.stringify(data))}::jsonb);commit;`));
const detail=id=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};select public.crm_get_workspace_detail('${id}');commit;`));
const act=(name,id,data={})=>rpc(name,{lead_id:id,expected_version:detail(id).version,...data});
const next=(type='callback')=>({task_type:type,due_at:new Date(Date.now()+3*86400000).toISOString()});
const intake=name=>rpc('create_manual_lead',{display_name:name,learner_name:'Enfant synthétique',phone:'0612345678',source_label:'Manuel · Téléphone'}).lead.id;
let page;
// Keep fixture dates future without depending on the machine's timezone.
const testDay=new Date(Date.now()+14*86400000);while(testDay.getUTCDay()!==2)testDay.setUTCDate(testDay.getUTCDate()+1);
const future=testDay.toISOString().slice(0,10)+'T13:00';
const dialog=()=>page.getByRole('dialog').last();
async function save(){const outcome=dialog().getByLabel('Résultat de l’appel',{exact:true});if(await outcome.count() && !(await outcome.inputValue())) await outcome.selectOption('no_answer');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByText(/Action enregistrée\.|Nouveau prospect créé\./).waitFor();}
async function done(){await dialog().getByRole('button',{name:'Terminé',exact:true}).click();}
async function open(id){await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
async function more(label){await page.getByRole('button',{name:'Autres actions',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();}
async function fillTask(){const preset=dialog().getByLabel('Échéance du rappel',{exact:true});if(await preset.count())await preset.selectOption('exact');await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).fill(future);}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.waitForTimeout(500);await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));}
try {
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean policy baseline required');
 for(const role of ['director','receptionist','admin','teacher','parent','student','pending']){
  const email=`${run}-${role}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{role:'director'}})});
  assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name=${quote('Accueil synthétique '+role)} where id='${user.id}'`);
 }
 actor=users[1].id;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.setDefaultTimeout(60000);await login(users[1]);
 const hours=Object.fromEntries([2,3,4,5,6].map(i=>[i,[['10:00','12:30'],['15:20','20:00']]]));hours[1]=[['15:00','20:00']];hours[7]=[];rpc('create_followup_policy',{weekly_hours:hours,attempt_offsets:[0,0,1,3,5]},users[0].id);
 // Outcome-led call: the parent answered and needs time. The browser sends a preset;
 // PostgreSQL resolves it through the Casablanca policy and derives the stage.
 const lead=intake(run+' réflexion');await open(lead);
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:/Réattribuer/}).count(),0,'no foreground task reassignment');
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:/^Responsable du prospect/}).count(),0,'owner label is not a reassignment control');
 await page.getByRole('dialog').getByText('Nouveau',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Appel',exact:true}).click();
 await dialog().getByLabel('Résultat de l’appel',{exact:true}).selectOption('spoke_with_contact');
 await dialog().getByLabel('Résultat de l’échange',{exact:true}).selectOption('considering');
 await dialog().getByText(/Étape après enregistrement : En discussion\./).waitFor();
 assert.equal(await dialog().getByLabel('Note',{exact:true}).getAttribute('required'),null,'routine prose optional');
 assert.equal(await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).count(),0,'a preset needs no browser-computed time');
 await dialog().getByLabel('Échéance du rappel',{exact:true}).selectOption('in_2_days');
 const calls=[];page.on('request',request=>{if(request.url().endsWith('/rpc/crm_record_conversation_decision'))calls.push(request.postDataJSON());});
 await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByText(/Action enregistrée\./).waitFor();
 assert.equal(calls.length,1);const sent=calls[0].p_data;
 assert.equal(sent.decision,'considering');assert.equal(sent.channel,'phone');assert.equal(sent.next_task.due_preset,'in_2_days');assert.equal(sent.next_task.schedule_kind,'reminder');
 assert(!('due_at' in sent.next_task)&&!('note' in sent)&&!('followup_reason' in sent.next_task),'no browser time, prose or reason marker');
 await dialog().getByText('Prochaine action · Rappel · En réflexion',{exact:true}).waitFor();await dialog().getByText('Rappel interne',{exact:true}).waitFor();
 await done();
 let saved=detail(lead);assert.equal(saved.status,'ENGAGED');assert.equal(saved.next_task.followup_reason,'considering');assert.equal(saved.next_task.schedule_kind,'reminder');
 assert.equal(sql(`select t.due_at=crm_security.next_window(l.followup_policy_id,((now() at time zone 'Africa/Casablanca')::date+2)::timestamp at time zone 'Africa/Casablanca') from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id where t.id=${quote(saved.next_task.id)}`),'t','server resolved the preset against the Casablanca policy');
 const nextSection=page.getByRole('dialog').first().locator('section').filter({has:page.getByText('Prochaine action',{exact:true})});
 await nextSection.getByText('Rappel · En réflexion',{exact:true}).waitFor();await nextSection.getByText('Rappel interne',{exact:true}).waitFor();
 await page.getByRole('dialog').first().getByText('En discussion',{exact:true}).first().waitFor();
 console.log('PASS outcome-led call: En réflexion reminder resolved by the server, no prose, stage derived, no foreground reassignment');
 // In-person agreed visit qualifies; the visit is always an agreed appointment.
 await more('Conversation au centre / autre canal');
 await dialog().getByLabel('Canal de la conversation',{exact:true}).selectOption('in_person');
 await dialog().getByLabel('Résultat de l’échange',{exact:true}).selectOption('center_visit');
 await dialog().locator('p').filter({hasText:/^Rendez-vous convenu$/}).waitFor();
 assert.equal(await dialog().getByLabel('Échéance du rappel',{exact:true}).count(),0,'appointments have no reminder presets');
 await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).fill(future);await save();await done();
 saved=detail(lead);assert.equal(saved.status,'QUALIFIED');assert(saved.open_tasks.some(t=>t.task_type==='center_visit'&&t.schedule_kind==='appointment'));
 assert.equal(sql(`select count(*) from public.crm_activities where lead_id=${quote(lead)} and event_type='conversation_recorded' and channel='in_person' and body is null`),'1');
 // Qualified + needs time stays QUALIFIED with En réflexion metadata, never a new stage.
 await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await dialog().getByLabel('Que souhaitez-vous enregistrer ?').selectOption('meaningful_whatsapp_conversation');
 const results=await dialog().getByLabel('Résultat de l’échange',{exact:true}).locator('option').allTextContents();
 assert(!results.includes('Souhaite visiter le centre')&&results.includes('Intéressé, a besoin de réfléchir'),'a qualified lead is not re-qualified');
 await dialog().getByLabel('Résultat de l’échange',{exact:true}).selectOption('considering');await dialog().getByText(/Étape après enregistrement : Qualifié\./).waitFor();
 await dialog().getByLabel('Échéance du rappel',{exact:true}).selectOption('next_week');await save();await done();
 saved=detail(lead);assert.equal(saved.status,'QUALIFIED');
 assert(saved.open_tasks.some(t=>t.task_type==='whatsapp_followup'&&t.followup_reason==='considering'&&t.schedule_kind==='reminder'),'WhatsApp En réflexion reminder');
 console.log('PASS agreed visit is an appointment; QUALIFIED + needs time stays QUALIFIED with En réflexion metadata');
 // Task completion matches the server's 200-character outcome contract.
 await nextSection.getByRole('button',{name:'Marquer comme fait',exact:true}).click();
 const outcome=dialog().getByLabel('Résultat de l’action',{exact:true});assert.equal(await outcome.getAttribute('maxlength'),'200');
 await outcome.fill('x'.repeat(250));assert.equal((await outcome.inputValue()).length,200);await dialog().getByText('200 / 200 caractères',{exact:true}).waitFor();
 await save();await done();
 assert.equal(sql(`select length(body) from public.crm_activities where lead_id=${quote(lead)} and event_type='task_completed' and actor_id=${quote(actor)} order by occurred_at desc,id desc limit 1`),'200');
 console.log('PASS completion outcome capped at 200 characters and accepted by the server');
 // Presentation labels; stored values unchanged.
 await page.goto(app+'/crm/leads');await page.getByRole('region',{name:'Contact en cours'}).waitFor();await page.getByRole('region',{name:'Inscription confirmée'}).waitFor();
 // Work Queue: agreed appointment labelled, reassignment moved to the row's overflow menu.
 const visit=detail(lead).open_tasks.find(t=>t.task_type==='center_visit');
 await page.goto(app+'/crm/today?bucket=upcoming&assignee=all');const row=page.locator(`[data-task-id="${visit.id}"]`);await row.waitFor();
 await row.getByText('Rendez-vous convenu',{exact:true}).waitFor();
 assert.equal(await row.getByRole('button',{name:/Réattribuer/}).count(),0,'no foreground reassignment in the queue');
 await row.getByRole('button',{name:/^Plus d’options/}).click();await page.getByRole('menuitem',{name:'Réattribuer l’action',exact:true}).click();
 await dialog().getByLabel('Responsable de l’action',{exact:true}).selectOption(users[2].id);await save();await done();
 assert.equal(sql(`select assigned_to from public.crm_tasks where id=${quote(visit.id)}`),users[2].id,'reassignment still available from the overflow menu');
 assert.equal(detail(lead).owner_id,null,'task reassignment leaves the lead owner unchanged');
 assert.deepEqual(pageErrors,[]);
 console.log('PASS Contact en cours / Inscription confirmée labels; queue appointment label; reassignment intact but secondary; no browser errors');
} catch(error) {
 console.error(error.message);
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:join(tmpdir(), 'hills-rcc-a1-failure.png'),fullPage:true});}
 throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');sql(`begin;
 lock table public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where actor_id in(${ids}) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
 console.log('PASS synthetic browser fixtures removed; history guards restored');
}
