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
import { assertLocalStack } from './lib/local-stack.mjs';
assertLocalStack({ dbPort: '54322', apiUrl: 'http://127.0.0.1:54321' }); // follow-ups 142 (item 11): this checkout's stack only, before any statement
assertLocalFeatureBranch();
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const run='rcc-a1-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
let browser,actor;const pageErrors=[];
// 142 (deviation 3): crm_create_manual_lead has no API role; the fixture create runs trusted.
const rpc=(name,data,id=actor,key=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(id)};${name==='create_manual_lead'?'':'set local role authenticated;'}select public.crm_${name}(${quote(key)},${quote(JSON.stringify(data))}::jsonb);commit;`));
const detail=id=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};select public.crm_get_workspace_detail('${id}');commit;`));
const act=(name,id,data={})=>rpc(name,{lead_id:id,expected_version:detail(id).version,...data});
// RWR-r5 §4.4: an agreed time must fall inside the centre hours. A Wednesday at 10:30 on the
// centre clock (UTC+0, public.centre_utc_offset) is inside every fixture policy.
const inHours=()=>{const d=new Date(Date.now()+3*86400000);while(d.getUTCDay()!==3)d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)+'T10:30:00Z';};
const next=(type='callback')=>({task_type:type,due_at:inHours()});
const intake=name=>rpc('create_manual_lead',{display_name:name,learner_name:'Enfant synthétique',phone:'0612345678',source_label:'Manuel · Téléphone'}).lead.id;
let page;
// Keep fixture dates future without depending on the machine's timezone. The centre
// clock is UTC+0 (public.centre_utc_offset), so a UTC date is the centre date.
const testDay=new Date(Date.now()+14*86400000);while(testDay.getUTCDay()!==2)testDay.setUTCDate(testDay.getUTCDate()+1);
const tuesday=testDay.toISOString().slice(0,10),future=tuesday+'T16:00';
const dialog=()=>page.getByRole('dialog').last();
const drawer=()=>page.getByRole('dialog').first();
// RWR-r5 §4.9: no success screen; a toast confirms and the form closes.
async function toast(text){await page.locator('[data-sonner-toast]').filter({hasText:text}).first().waitFor();}
async function closed(){await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);}
async function open(id){await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();await drawer().getByTestId('next-action-panel').waitFor();}
// « Noter un échange » from the drawer panel; channel tab, then result.
async function exchange(channel='Téléphone',result){await drawer().getByTestId('next-action-panel').getByRole('button',{name:'Noter un échange',exact:true}).click();await dialog().getByRole('heading',{name:'Noter un échange'}).waitFor();if(channel!=='Téléphone')await dialog().getByRole('tab',{name:channel,exact:true}).click();if(result)await dialog().getByLabel(result,{exact:true}).check();}
async function pick(kind){await dialog().getByLabel(kind,{exact:true}).check();}
async function slot(date,time){await dialog().getByLabel('Date',{exact:true}).fill(date);const select=dialog().getByLabel('Heure',{exact:true});await page.waitForFunction(el=>!el.disabled&&el.options.length>1,await select.elementHandle());if(time)await select.selectOption(time);return select;}
async function submit(){await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();}
async function settle(id,check){for(let i=0;i<100;i++){const d=detail(id);if(check(d))return d;await page.waitForTimeout(100);}throw new Error('server state not reached for '+id);}
// RCC-B1 E2: an Autres actions item opens its dialog after the menu returns focus to its trigger.
async function more(label){await page.getByRole('button',{name:'Autres actions',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length>1);}
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
 const lead=intake(run+' réflexion');await open(lead);
 assert.equal(await drawer().getByRole('button',{name:/Réattribuer/}).count(),0,'no foreground action reassignment');
 assert.equal(await drawer().getByRole('button',{name:/^Responsable/}).count(),0,'owner label is not a reassignment control');
 await drawer().getByText('Nouveau',{exact:true}).first().waitFor();
 // Stale hidden selection: a closure picked after « On a parlé », then the result changed.
 await exchange('Téléphone','On a parlé');await pick('Clôturer');await dialog().getByLabel('Motif',{exact:true}).waitFor();
 await dialog().getByLabel('Pas de réponse',{exact:true}).check();assert.equal(await dialog().getByLabel('Motif',{exact:true}).count(),0,'the picker and its reason are gone');
 const logged=[];page.on('request',request=>{if(request.url().endsWith('/rpc/crm_log_exchange'))logged.push(request.postDataJSON().p_data);});
 await submit();await toast('Pas de réponse enregistré');await closed();
 assert.deepEqual(Object.keys(logged.at(-1)).sort(),['channel','expected_version','lead_id','result'],'no hidden next or close sent');
 let saved=await settle(lead,d=>d.failed_attempts===1);assert.equal(saved.status,'CONTACTING');
 console.log('PASS stale hidden closure choice cannot block a failed-call record');
 // Outcome-led: the parent needs time. « En attente du prospect » sends no browser time;
 // PostgreSQL sets the relance (today + 5 days on the centre clock).
 await exchange('Téléphone','On a parlé');await pick('En attente du prospect');await submit();await toast('Échange enregistré');await closed();
 let sent=logged.at(-1);assert.equal(sent.channel,'phone');assert.equal(sent.result,'spoke');assert.deepEqual(sent.next,{task_type:'awaiting_prospect'});assert(!('note' in sent),'no prose');
 saved=await settle(lead,d=>d.status==='ENGAGED');assert.equal(saved.next_action.task_type,'awaiting_prospect');
 // The preset's midnight (today + n centre days) moved to the first calling window from it, as rcc-a1.sql's
 // oracle does from this policy's hours: a day without hours (the closed Sunday) moves to the next one.
 const presetDue=n=>{const [today,stored]=sql(`select (now() at time zone public.centre_utc_offset())::date::text||'|'||to_char(due_at at time zone public.centre_utc_offset(),'YYYY-MM-DD HH24:MI') from public.crm_tasks where id=${quote(saved.next_action.id)}`).split('|');
  const day=new Date(`${today}T00:00:00Z`);day.setUTCDate(day.getUTCDate()+n);const dow=d=>(d.getUTCDay()+6)%7+1;
  while(!hours[dow(day)].length)day.setUTCDate(day.getUTCDate()+1);return [stored,`${day.toISOString().slice(0,10)} ${hours[dow(day)][0][0]}`];};
 {const [stored,expected]=presetDue(5);assert.equal(stored,expected,'server set the relance five centre days ahead, in the first calling window from that midnight');}
 await drawer().getByText('En discussion',{exact:true}).first().waitFor();
 // « Changer » → team reminder « Dans 2 jours »: a preset, resolved by the server.
 const changed=[];page.on('request',request=>{if(request.url().endsWith('/rpc/crm_change_next_action'))changed.push(request.postDataJSON().p_data);});
 await drawer().getByRole('button',{name:'Changer',exact:true}).click();await pick('Rappel pour l’équipe');assert.equal(await dialog().getByLabel('Date',{exact:true}).count(),0,'a preset needs no browser-computed time');
 await dialog().getByLabel('Quand',{exact:true}).selectOption('in_2_days');await submit();await toast('Prochaine action enregistrée');await closed();
 sent=changed.at(-1);assert.equal(sent.next.due_preset,'in_2_days');assert.equal(sent.next.schedule_kind,'reminder');assert(!('due_at' in sent.next),'no browser time');
 saved=await settle(lead,d=>d.next_action?.schedule_kind==='reminder');
 {const [stored,expected]=presetDue(2);assert.equal(stored,expected,'server resolved « Dans 2 jours » on the centre clock, in the first calling window from that midnight');}
 await drawer().getByText('Rappel interne',{exact:true}).waitFor();
 console.log('PASS outcome-led call: awaiting relance and team reminder resolved by the server, no prose, stage derived, no foreground reassignment');
 // In person, an agreed visit qualifies (OD-11); the visit is always an agreed appointment.
 await exchange('Au centre','On a parlé');await pick('Rendez-vous au centre');assert.equal(await dialog().getByLabel('Quand',{exact:true}).count(),0,'appointments have no presets');
 await slot(tuesday,'16:05');await submit();await toast('Échange enregistré');await closed();
 saved=await settle(lead,d=>d.status==='QUALIFIED');assert.equal(saved.next_action.task_type,'center_visit');assert.equal(saved.open_tasks.length,1);
 assert.equal(sql(`select count(*) from public.crm_activities where lead_id=${quote(lead)} and event_type='conversation_recorded' and channel='in_person' and body is null`),'1');
 // QUALIFIED + a later exchange that keeps the appointment stays QUALIFIED, the same action.
 const visitId=saved.next_action.id;await exchange('WhatsApp','On a échangé');assert(await dialog().getByLabel('Garder l’action actuelle',{exact:true}).count(),'keep is offered while an action exists');await pick('Garder l’action actuelle');await submit();await toast('Échange enregistré');await closed();
 saved=await settle(lead,d=>sql(`select count(*) from public.crm_activities where lead_id=${quote(lead)} and channel='whatsapp'`)!=='0');assert.equal(saved.status,'QUALIFIED');assert.equal(saved.next_action.id,visitId,'keep leaves the appointment untouched');
 console.log('PASS agreed visit is an appointment that qualifies; a later kept exchange stays QUALIFIED on the same action');
 // An agreed callback replaces the appointment only when « Remplace le rendez-vous » is ticked,
 // and only times inside the calling hours are offered; the time is kept exactly.
 await drawer().getByRole('button',{name:'Changer',exact:true}).click();await pick('Rappel convenu');const times=await slot(tuesday);
 const offered=await times.locator('option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));assert(!offered.includes('13:00')&&offered.includes('16:05'),'lunch not offered');await times.selectOption('16:05');
 await submit();await dialog().getByRole('alert').filter({hasText:'Cochez « Remplace » pour changer le rendez-vous.'}).waitFor();assert.equal(detail(lead).next_action.id,visitId,'nothing written without the confirmation');
 await dialog().getByLabel('Remplace le rendez-vous',{exact:true}).check();await submit();await toast('Prochaine action enregistrée');await closed();
 saved=await settle(lead,d=>d.next_action?.task_type==='callback');assert.equal(saved.open_tasks.length,1,'the appointment was replaced, not duplicated');assert.equal(saved.next_action.schedule_kind,'appointment');assert.equal(saved.status,'QUALIFIED');
 assert.equal(sql(`select due_at=(${quote(tuesday+'T16:05')}::timestamp at time zone public.centre_utc_offset()) from public.crm_tasks where id=${quote(saved.next_action.id)}`),'t','agreed callback kept its exact time');
 assert.equal(sql(`select status from public.crm_tasks where id=${quote(visitId)}`),'cancelled');
 console.log('PASS agreed callback inside the hours only, replacement confirmed explicitly, exact time kept, appointment replaced');
 // Presentation labels; stored values unchanged.
 await page.goto(app+'/crm/leads');await page.getByRole('region',{name:'Contact en cours'}).waitFor();await page.getByRole('region',{name:'Inscription confirmée'}).waitFor();
 // Tâches: the agreed callback is labelled; reassignment lives in the row's overflow menu.
 const callback=detail(lead).next_action;
 await page.goto(app+'/crm/today?bucket=upcoming&assignee=all');const row=page.locator(`[data-task-id="${callback.id}"]`);await row.waitFor();
 await row.getByText('Rendez-vous convenu',{exact:true}).waitFor();
 assert.equal(await row.getByRole('button',{name:/Réattribuer/}).count(),0,'no foreground reassignment in the queue');
 await row.getByRole('button',{name:/^Plus d’options/}).click();await page.getByRole('menuitem',{name:'Réattribuer l’action',exact:true}).click();
 await dialog().getByLabel('Responsable de l’action',{exact:true}).selectOption(users[2].id);await submit();await toast('Enregistré');
 await settle(lead,()=>sql(`select assigned_to from public.crm_tasks where id=${quote(callback.id)}`)===users[2].id);
 assert.equal(detail(lead).owner_id,actor,'action reassignment leaves the owner (the creator, §4.6) unchanged');
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
