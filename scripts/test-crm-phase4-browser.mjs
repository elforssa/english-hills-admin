// Local Auth + real UI + RPC regression (rewritten for the RWR-r5 drawer: one next action,
// « Noter un échange », « Changer », appointment outcomes). Synthetic fixtures are removed in finally.
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
const run='phase4-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
let browser,actor;const pageErrors=[];
// M-A2 (137) revoked these wrappers for API roles: fixture-only calls to them run in a trusted
// session (same JWT claim, same rows); every other call still runs as authenticated.
const REVOKED=new Set(['add_note','record_call_outcome','record_whatsapp','record_conversation','record_conversation_decision','qualify_lead','schedule_task','complete_task','cancel_task','close_lost','close_not_qualified','reopen_lead']);
const rpc=(name,data,id=actor,key=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(id)};${REVOKED.has(name)?'':'set local role authenticated;'}select public.crm_${name}(${quote(key)},${quote(JSON.stringify(data))}::jsonb);commit;`));
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
async function open(id){await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
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
 assert.equal(new URL(page.url()).pathname,'/crm/leads');await page.getByRole('heading',{name:'Pipeline admissions',exact:true}).waitFor();
 await page.getByRole('button',{name:'Apprenants',exact:true}).click();
 const navLinks=await page.locator('nav a').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')));for(const path of ['/crm/today','/crm/leads','/students','/settings'])assert(navLinks.includes(path));
 await page.getByRole('button',{name:'Ajouter un prospect',exact:true}).click();await dialog().getByLabel('Nom du contact',{exact:true}).fill(run);await dialog().getByLabel('Nom de l’apprenant',{exact:true}).fill('Adam synthétique');await dialog().getByLabel('Téléphone',{exact:true}).fill('06 12 34 56 78');
 await submit();await dialog().getByRole('alert').filter({hasText:'calendrier de suivi'}).waitFor();
 const hours=Object.fromEntries([2,3,4,5,6].map(i=>[i,[['10:00','12:30'],['15:20','20:00']]]));hours[1]=[['15:00','20:00']];hours[7]=[];rpc('create_followup_policy',{weekly_hours:hours,attempt_offsets:[0,0,1,3,5]},users[0].id);
 const centerBefore=sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.placement_tests))');
 // RWR-r5 §4.9: no result screen; a toast and the new prospect opens in the drawer.
 await submit();await toast('Prospect créé');await page.waitForURL(url=>url.searchParams.has('lead'));const lead=new URL(page.url()).searchParams.get('lead');assert.equal(detail(lead).status,'NEW');
 await drawer().getByTestId('next-action-panel').waitFor();assert.equal(detail(lead).open_tasks.length,1,'the intake call is the one next action');
 assert.equal(sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.placement_tests))'),centerBefore);
 console.log('PASS receptionist home/sidebar, no-policy error, manual intake with a toast and the drawer, first action, no center records');
 // URL survives reload and browser back/forward.
 await page.reload();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();await page.getByRole('button',{name:'Fermer',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('lead'));await page.goBack();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 // Opening links does not log. RCC-B1 D2 C: no tel: launcher with a mouse at 1440.
 const activities=()=>sql(`select count(*) from public.crm_activities where lead_id='${lead}'`);const activityBefore=activities();
 await exchange();assert.equal(await dialog().getByRole('link',{name:'Appeler'}).count(),0,'no tel: launcher with a mouse');await dialog().getByText('06 12 34 56 78',{exact:false}).or(dialog().getByText('+212612345678')).first().waitFor();
 await dialog().getByRole('button',{name:'Annuler',exact:true}).click();await closed();
 {const desktopPage=page,phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await phone.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());page=await phone.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.setDefaultTimeout(60000);await login(users[1]);
  await open(lead);assert(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches&&!matchMedia('(min-width: 640px)').matches),'phone-width coarse pointer');
  await exchange();const tel=dialog().getByRole('link',{name:'Appeler'});assert.equal(await tel.getAttribute('href'),'tel:+212612345678');await tel.evaluate(node=>node.addEventListener('click',e=>e.preventDefault(),{once:true}));await tel.click();assert.equal(activities(),activityBefore);
  await phone.close();page=desktopPage;}
 // OD-20 = B: « Pas de réponse » saves on one tap; the server keeps the call sequence.
 await drawer().getByRole('button',{name:'Pas de réponse',exact:true}).click();await toast('Pas de réponse enregistré');
 let saved=await settle(lead,d=>d.failed_attempts===1);assert.equal(saved.status,'CONTACTING');assert.equal(saved.open_tasks.length,1,'one next action after a failed call');
 // Invariant 15: within the 3-hour gap the tap opens the form with the warning and the override.
 await drawer().getByText(/^Appel · Prochain essai possible à [0-9]{2}:[0-9]{2}$/).waitFor();await drawer().getByRole('button',{name:'Pas de réponse',exact:true}).click();
 await dialog().getByText('Tentative réelle (hors délai)',{exact:true}).waitFor();assert.equal(await dialog().getByLabel('Pas de réponse',{exact:true}).isChecked(),true);await dialog().getByRole('button',{name:'Annuler',exact:true}).click();await closed();assert.equal(detail(lead).failed_attempts,1);
 await exchange('WhatsApp');const wa=dialog().getByRole('link',{name:'06 12 34 56 78'});// B1: national form shown, E.164 linkassert.equal(await wa.getAttribute('href'),'https://wa.me/212612345678');await wa.evaluate(node=>node.addEventListener('click',e=>e.preventDefault(),{once:true}));const waBefore=activities();await wa.click();assert.equal(activities(),waBefore);
 await dialog().getByLabel('Message envoyé',{exact:true}).check();await submit();await toast('Échange enregistré');await closed();
 assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead}' and event_type='whatsapp_sent'`),'1');assert.equal(detail(lead).status,'CONTACTING','a sent message is not a conversation');
 console.log('PASS tel/WhatsApp links never log; one-tap failed call, 3-hour gap warning, sent message keeps the lifecycle');
 // Stale prospect: the draft stays, « Recharger » shows the current action, then a double click saves once.
 await exchange('Autre','Simple note');await dialog().getByLabel('Note',{exact:true}).fill('Note après conflit');act('add_note',lead,{note:'Modification concurrente'});
 await submit();await dialog().getByRole('alert').filter({hasText:'Ce prospect a été modifié, rechargez.'}).waitFor();assert(await dialog().getByRole('button',{name:'Enregistrer',exact:true}).isDisabled(),'save disabled until reload');
 assert.equal(await dialog().getByLabel('Note',{exact:true}).inputValue(),'Note après conflit','the draft stays');
 await dialog().getByRole('button',{name:'Recharger',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Recharger'));
 await dialog().getByRole('button',{name:'Enregistrer',exact:true}).dblclick();await toast('Échange enregistré');await closed();assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead}' and body='Note après conflit'`),'1');assert.equal(detail(lead).status,'CONTACTING');
 // Committed response lost in transit: the retry resends the exact key and payload.
 await exchange('Autre','Simple note');await dialog().getByLabel('Note',{exact:true}).fill('Réponse perdue');const attempts=[];let drop=true;
 await page.route('**/rest/v1/rpc/crm_log_exchange',async route=>{attempts.push(route.request().postDataJSON());if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 await submit();await dialog().getByRole('alert').filter({hasText:'Impossible de confirmer'}).waitFor();await submit();await toast('Échange enregistré');await closed();
 assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead}' and body='Réponse perdue'`),'1');await page.unroute('**/rest/v1/rpc/crm_log_exchange');
 // A WhatsApp conversation with an agreed callback: only slots inside the calling hours are offered.
 await exchange('WhatsApp','On a échangé');await pick('Rappel convenu');const times=await slot(tuesday);
 const offered=await times.locator('option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));assert(offered.includes('15:20')&&!offered.includes('13:00')&&!offered.includes('12:30'),'Tuesday lunch closure is not offered: '+offered.join(','));
 await times.selectOption('15:20');await dialog().getByLabel('Note (facultative)',{exact:true}).fill('Conversation réelle enregistrée explicitement');await submit();await toast('Échange enregistré');await closed();
 saved=await settle(lead,d=>d.status==='ENGAGED');const scheduledTask=saved.next_action;
 const stored=JSON.parse(sql(`select jsonb_build_object('weekday',extract(isodow from due_at at time zone public.centre_utc_offset()),'time',to_char(due_at at time zone public.centre_utc_offset(),'HH24:MI'),'date',to_char(due_at at time zone public.centre_utc_offset(),'YYYY-MM-DD'),'kind',schedule_kind) from public.crm_tasks where id=${quote(scheduledTask.id)}`));
 assert.deepEqual(stored,{weekday:2,time:'15:20',date:tuesday,kind:'appointment'},'agreed callback stored at the chosen centre time, never moved');
 await drawer().getByTestId('next-action-label').filter({hasText:/15:20/}).waitFor();await drawer().getByText('Rendez-vous convenu',{exact:true}).waitFor();
 console.log('PASS stale prospect reload, exact retry after a lost response, WhatsApp conversation and slots inside the hours');
 // « Changer »: our step replaces the callback; a concurrent change makes the form stale first.
 await drawer().getByRole('button',{name:'Changer',exact:true}).click();await dialog().getByRole('heading',{name:'Changer la prochaine action'}).waitFor();await pick('À faire par nous');await dialog().getByLabel('Quand',{exact:true}).selectOption('tomorrow');
 await dialog().getByText(/^Remplace : /).waitFor();act('add_note',lead,{note:'Autre modification concurrente'});await submit();await dialog().getByRole('alert').filter({hasText:'rechargez'}).waitFor();
 await dialog().getByRole('button',{name:'Recharger',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Recharger'));await submit();await toast('Prochaine action enregistrée');await closed();
 saved=await settle(lead,d=>d.next_action?.task_type==='whatsapp_followup');assert.equal(saved.open_tasks.length,1,'the change replaced the callback');
 // On a parlé + appointment with a test: qualification is implied (OD-11); no center record.
 await exchange('Téléphone','On a parlé');await pick('Rendez-vous au centre');await slot(tuesday,'16:05');await dialog().getByLabel('Avec test de niveau',{exact:true}).check();await submit();await toast('Échange enregistré');await closed();
 saved=await settle(lead,d=>d.status==='QUALIFIED');assert.equal(saved.next_action.task_type,'center_visit');assert.equal(saved.open_tasks.length,1);
 // §4.2: the appointment carries its planned test; no student, enrolment or other record.
 assert.equal(sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.placement_tests))'),JSON.stringify(JSON.parse(centerBefore).map((n,i)=>i===2?n+1:n)).replaceAll(',',', '),'one planned test, no other center record');
 assert.equal(sql(`select count(*) from public.crm_tasks t join public.placement_tests p on p.id=t.placement_test_id where t.id='${saved.next_action.id}' and p.status='Planifié' and p.student_id is null`),'1','the appointment carries the planned test');
 // The appointment outcomes wait for its start (crm_appointment.before_start).
 for(const label of ['Venu · s’inscrit','Venu · reviendra','Venu · pas intéressé','Absent'])assert(await drawer().getByTestId('appointment-outcome').getByRole('button',{name:label,exact:true}).isDisabled(),label+' disabled before the start');
 await more('Clôturer comme perdu');assert.ok(await dialog().getByLabel('Motif',{exact:true}).locator('option[value="unreachable"]').isDisabled());await dialog().getByLabel('Motif',{exact:true}).selectOption('other');await submit();assert.equal(detail(lead).status,'QUALIFIED');await dialog().getByLabel('Note',{exact:true}).fill('Projet abandonné');await submit();await toast('Enregistré');await closed();
 saved=await settle(lead,d=>d.status==='LOST');assert.equal(saved.open_tasks.length,0,'closing cancels the appointment');
 await page.getByRole('button',{name:'Rouvrir le prospect'}).click();await dialog().getByLabel('Motif',{exact:true}).fill('Le parent revient');await fillTask();await submit();await toast('Enregistré');await closed();assert.equal((await settle(lead,d=>d.status!=='LOST')).status,'ENGAGED');
 await more('Clôturer comme non qualifié');await dialog().getByLabel('Motif',{exact:true}).selectOption('age_not_suitable');await submit();await toast('Enregistré');await closed();assert.equal((await settle(lead,d=>d.status!=='ENGAGED')).status,'NOT_QUALIFIED');
 console.log('PASS Changer with stale reload, implied qualification by appointment, outcomes before start, Lost eligibility/required explanation, reopen and Not Qualified');
 // Four historical attempts after a conversation, then the real fifth UI call (one tap).
 for(const state of ['ENGAGED','QUALIFIED']){
  const id=intake('Cycle synthétique '+state);sql(`update public.crm_leads set created_at=now()-interval '12 days' where id='${id}'`);
  act('record_conversation',id,{channel:'phone',note:'Conversation synthétique',occurred_at:new Date(Date.now()-10*86400000).toISOString(),next_task:next('callback')});
  if(state==='QUALIFIED')act('qualify_lead',id,{qualification_step:'other',note:'Projet confirmé',next_task:next('callback')});
  for(let i=0;i<4;i++)act('record_call_outcome',id,{outcome:'no_answer',occurred_at:new Date(Date.now()-(8-i)*86400000).toISOString()});
  await open(id);await drawer().getByRole('button',{name:'Pas de réponse',exact:true}).click();await toast('Pas de réponse enregistré');
  const fifth=await settle(id,d=>d.failed_attempts===5);assert.equal(fifth.status,state);assert.equal(fifth.open_tasks.length,1,'one next action after the fifth');assert.equal(fifth.next_action.task_type,'awaiting_prospect','T7b: awaiting after the fifth');
  await drawer().getByText('5 appels infructueux · séquence automatique terminée',{exact:true}).waitFor();await drawer().getByRole('button',{name:'Clôturer : injoignable',exact:true}).click();await submit();await toast('Enregistré');await closed();assert.equal((await settle(id,d=>d.status==='LOST')).closure_reason,'unreachable');
 }
 console.log('PASS ENGAGED and QUALIFIED fifth failures retain lifecycle, wait for the prospect, until explicit unreachable closure');
 // Decide before saving: the conversation and its outcome are one RPC.
 for (const decision of ['qualify','lost','not_qualified']) {
  const id=intake('Décision '+decision);await open(id);await exchange('Téléphone','On a parlé');
  await pick({qualify:'Rendez-vous au centre',lost:'Pas intéressé',not_qualified:'Pas pour nous'}[decision]);await dialog().getByLabel('Note (facultative)',{exact:true}).fill('Le parent confirme sa décision');
  if(decision==='qualify'){await slot(tuesday,'16:05');await page.screenshot({path:join(tmpdir(), 'hills-phase4-qualification.png'),fullPage:false});}
  else {assert.equal(await dialog().getByLabel('Date',{exact:true}).count(),0,'closure requires no dummy date');await dialog().getByLabel('Motif',{exact:true}).selectOption(decision==='lost'?'not_interested':'age_not_suitable');}
  if(decision==='qualify') {
   const attempts=[];let drop=true;
   await page.route('**/rest/v1/rpc/crm_log_exchange',async route=>{attempts.push(route.request().postDataJSON());if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
   await submit();await dialog().getByRole('alert').filter({hasText:'Impossible de confirmer'}).waitFor();
   await submit();await toast('Échange enregistré');assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);await page.unroute('**/rest/v1/rpc/crm_log_exchange');
  } else {await submit();await toast('Prospect clôturé');}
  await closed();const after=await settle(id,d=>d.status!=='NEW');assert.equal(after.status,{qualify:'QUALIFIED',lost:'LOST',not_qualified:'NOT_QUALIFIED'}[decision]);
  assert.equal(after.open_tasks.length,decision==='qualify'?1:0);assert.ok(!after.open_tasks.some(t=>t.task_type==='callback'),'the intake call is replaced');
  assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${id}' and event_type='conversation_recorded'`),'1');
 }
 const spoke=intake('Conversation synthétique');act('record_conversation',spoke,{channel:'phone',note:'Conversation et rappel convenu',next_task:next('callback')});await open(spoke);
 const assignedTask=detail(spoke).next_action;const priorAssignee=sql(`select coalesce(assigned_to::text,'') from crm_tasks where id='${assignedTask.id}'`);
 await more('Attribuer un responsable');await dialog().getByLabel('Responsable du prospect').selectOption(users[2].id);await submit();await toast('Enregistré');await closed();assert.equal((await settle(spoke,d=>d.owner_id===users[2].id)).owner_id,users[2].id);
 // RWR-r5 §4.6: the next action's assignee is re-derived from the new owner.
 assert.notEqual(priorAssignee,users[2].id);assert.equal(sql(`select assigned_to from crm_tasks where lead_id='${spoke}' and status='open'`),users[2].id,'owner reassignment moves the open action to the new owner');
 await more('Réattribuer la prochaine action');await dialog().getByLabel('Responsable de l’action').selectOption(users[0].id);await submit();await toast('Enregistré');await closed();await settle(spoke,()=>sql(`select assigned_to from crm_tasks where lead_id='${spoke}' and status='open'`)===users[0].id);assert.equal(detail(spoke).owner_id,users[2].id,'explicit action reassignment preserves owner');
 // Candidate suggestions never merge. RWR-r5 B1 (§5.2): the same number now opens the duplicate
 // gate first; nothing is created before each match is answered, then the new prospect opens
 // (the yellow « Contact existant possible » block is left for e-mail-only matches).
 await page.goto(app+'/crm/leads');await page.getByRole('button',{name:'Ajouter un prospect',exact:true}).click();await page.screenshot({path:join(tmpdir(), 'hills-phase4-manual.png'),fullPage:false});await dialog().getByLabel('Nom du contact',{exact:true}).fill('Autre contact synthétique');await dialog().getByLabel('Nom de l’apprenant',{exact:true}).fill('Autre enfant');await dialog().getByLabel('Téléphone',{exact:true}).fill('00212612345678');await submit();await dialog().getByTestId('duplicate-gate').waitFor();assert.equal(sql(`select count(*) from crm_contacts where display_name='Autre contact synthétique'`),'0','nothing created before the answer');for(const match of await dialog().getByTestId('duplicate-match').all())await match.getByLabel('Même famille, autre personne',{exact:true}).check();await submit();await page.waitForURL(url=>url.searchParams.has('lead'));const manual=new URL(page.url()).searchParams.get('lead');assert.equal(sql(`select count(*) from crm_contacts where display_name='Autre contact synthétique'`),'1','created after the answer');assert.equal(sql(`select count(*)>0 and bool_and(decision='same_family') from person_match_decisions where (kind_a='prospect' and id_a='${manual}') or (kind_b='prospect' and id_b='${manual}')`),'t','the answers are recorded');
 // Observational queue exceptions and safe flexible answers are real rendered data.
 const overdue=intake('Urgence synthétique'),stale=intake('Relance synthétique'),taskless=intake('Sans action synthétique');
 sql(`begin;set local request.jwt.claim.sub='${actor}';update public.crm_tasks set due_at=now()-interval '7 days' where lead_id='${overdue}';
 update public.crm_leads set status='CONTACTING',created_at=now()-interval '4 days' where id='${stale}';update public.crm_tasks set due_at=now()+interval '3 days' where lead_id='${stale}';
 -- M-A2 (137): an active prospect with no open action is refused (23514, crm_next_action.exactly_one);
 -- « Sans action synthétique » stays a NEW prospect with its first contact, listed in « À traiter » (priority 2).
 do $fixture$ declare t public.crm_tasks%rowtype;begin
 begin
  for t in select * from public.crm_tasks where lead_id='${taskless}' and status='open' loop perform crm_security.finish_task(t,true,'Synthetic missing action',gen_random_uuid()::text);end loop;
  set constraints all immediate;
  raise exception 'FAIL phase4: an active prospect without an action was accepted';
 exception when check_violation then null;
 end;
 set constraints all deferred;
end $fixture$;
 alter table public.crm_submissions disable trigger crm_submission_immutable;
 update public.crm_submissions set form_answers='[{"key":"age","label":"Âge déclaré","value":8,"value_type":"number","label_source":"synthetic"},{"key":"days","label":"Jours souhaités","value":["Mercredi","Samedi"],"value_type":"array","label_source":"synthetic"},{"key":"ready","label":"Disponible","value":true,"value_type":"boolean","label_source":"synthetic"},{"key":"campaign_id","label":"Campagne","value":"PRIVATE-SENTINEL","value_type":"string","label_source":"synthetic"},{"key":"leadgen_id","label":"Référence","value":"PRIVATE-SENTINEL","value_type":"string","label_source":"synthetic"},{"key":"financial_balance","label":"Solde","value":"PRIVATE-SENTINEL","value_type":"string","label_source":"synthetic"}]' where lead_id='${lead}';
 alter table public.crm_submissions enable trigger crm_submission_immutable;commit;`);
 await page.goto(app+'/crm/today?assignee=all&bucket=overdue');await page.getByTestId('work-row').first().waitFor();assert.match(await page.getByTestId('work-row').first().innerText(),/Urgence synthétique/);await page.screenshot({path:join(tmpdir(), 'hills-phase4-today.png'),fullPage:true});await page.getByTestId('work-row').first().getByRole('button',{name:'Voir le prospect',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('lead')===overdue);
 await page.goto(app+'/crm/leads?view=attention&layout=list');await page.getByTestId('opportunity-row').filter({hasText:'Sans action synthétique'}).waitFor();await page.getByTestId('opportunity-row').filter({hasText:'Relance synthétique'}).waitFor();
 await open(lead);await page.screenshot({path:join(tmpdir(), 'hills-phase4-detail.png'),fullPage:false});
 // RCC-B1 D1: the Demande summary legitimately repeats up to three answers, so assert the
 // expanded full-answer projection itself: the <details> opened by its own summary.
 const fullAnswers=page.getByRole('dialog').locator('details',{has:page.getByText('Toutes les réponses aux formulaires',{exact:true})});
 await fullAnswers.locator('summary').click();assert.equal(await fullAnswers.evaluate(el=>el.open),true);
 await fullAnswers.getByText('Mercredi · Samedi',{exact:true}).waitFor();await fullAnswers.getByText('Oui',{exact:true}).waitFor();
 const fullAnswer=label=>fullAnswers.getByText(label,{exact:true}).locator('xpath=following-sibling::dd[1]');
 assert.equal(await fullAnswer('Jours souhaités').innerText(),'Mercredi · Samedi');assert.equal(await fullAnswer('Disponible').innerText(),'Oui');
 assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE-SENTINEL|campaign_id/);
 console.log('PASS Today overdue ordering, missing/stale indicators, Today drawer and safe scalar/array/boolean form answers');
 // Search + mobile screenshot; no technical fields leak in UI or read responses.
 await page.goto(app+'/crm/leads?layout=board');await page.getByLabel('Rechercher un prospect').fill('0612345678');await page.getByTestId('opportunity-card').first().waitFor();assert.ok(await page.getByTestId('opportunity-card').count()>0);
 await page.screenshot({path:join(tmpdir(), 'hills-phase4-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.getByTestId('opportunity-card').first().getByRole('button').first().click();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 const body=await page.locator('body').innerText();assert.doesNotMatch(body,/campaign_id|adset_id|ad_id|fbclid|raw_payload|payload_hash|source_key|whatsapp_followup|awaiting_prospect/);
 console.log('PASS conversation decisions, safe reassignment, honest candidate handling, search, URL/mobile and no technical UI fields');
 // A mutation from page 2 resets the live Today queue, without snapshot infrastructure.
 await page.setViewportSize({width:1440,height:1000});
 for(let i=0;i<28;i++)intake('File accueil '+i);
 sql("update public.crm_tasks set due_at=now()-interval '2 minutes' where lead_id in (select id from public.crm_leads where contact_id in(select id from public.crm_contacts where display_name like 'File accueil %'))");
 await page.goto(app+'/crm/today?assignee=all&bucket=overdue');await page.getByTestId('work-row').first().waitFor();const firstTask=await page.getByTestId('work-row').first().getAttribute('data-task-id');
 await page.getByRole('button',{name:'Suivant',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId!==id,firstTask);
 await page.getByTestId('work-row').first().getByRole('button',{name:'Voir le prospect',exact:true}).click();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 await exchange('Autre','Simple note');await dialog().getByLabel('Note',{exact:true}).fill('Mise à jour depuis la deuxième page');await submit();await toast('Échange enregistré');await closed();
 await page.getByRole('button',{name:'Fermer',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId===id,firstTask);
 assert.equal(await page.getByTestId('work-row').count(),25);
 console.log('PASS live queue reset to page 1 after a mutation; bounded unique rows');
 await context.close();
 // Each role uses real local Auth; direct routes and read RPCs independently gated.
 for(const user of users.filter(u=>u.role!=='receptionist')){
  const ctx=await browser.newContext();await ctx.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());page=await ctx.newPage();await login(user);
  for(const path of ['/crm/today','/crm/leads']){const response=await page.request.get(app+path,{maxRedirects:0});assert.equal(response.status(),['director','admin'].includes(user.role)?200:307,`${user.role} ${path}`);}
  await ctx.close();
 }
 assert.deepEqual(pageErrors,[]);console.log('PASS real director/admin access and teacher/parent/student/pending route denial; no browser errors');
} catch(error) {
 console.error(error.message);
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:join(tmpdir(), 'hills-phase4-failure.png'),fullPage:true});}
 throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.placement_tests disable trigger crm_placement_integrity;alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 -- RWR-r5 §4.2: an appointment « avec test de niveau » carries a planned test row.
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id) select count(*) from removed_tasks;
 delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})));
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where actor_id in(${ids}) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 -- RWR-r5 B1 (139): the duplicate-gate answers reference their author.
 delete from public.person_match_decisions where decided_by in(${ids});
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 -- M-A2 (137): the deferred checks fire once the prospects are gone, before the ALTER.
 set constraints all immediate;alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
 console.log('PASS synthetic browser fixtures removed; history guards restored');
}
