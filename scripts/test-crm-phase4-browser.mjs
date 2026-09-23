// Local Auth + real UI + RPC regression. Synthetic fixtures are removed in finally.
// No Git subprocesses, production connections, external requests or real data copies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
const head=readFileSync('.git/HEAD','utf8').trim();assert.ok(head.startsWith('ref: refs/heads/codex/'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const run='phase4-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
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
async function save(){await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByText(/Action enregistrée\.|Nouveau prospect créé\./).waitFor();}
async function done(){await dialog().getByRole('button',{name:'Terminé',exact:true}).click();}
async function open(id){await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
async function more(label){await page.getByRole('button',{name:'Autres actions',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();}
async function fillTask(){await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).fill(future);}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));}
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
 assert.equal(new URL(page.url()).pathname,'/crm/today');await page.getByRole('heading',{name:'Aujourd’hui',exact:true}).waitFor();
 assert.deepEqual(new Set(await page.locator('nav a').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')))),new Set(['/crm/today','/crm/leads','/placement-tests','/students','/enrollments','/settings']));
 await page.getByRole('button',{name:'Ajouter un prospect',exact:true}).click();await dialog().getByLabel('Nom du contact',{exact:true}).fill(run);await dialog().getByLabel('Nom de l’apprenant',{exact:true}).fill('Adam synthétique');await dialog().getByLabel('Téléphone',{exact:true}).fill('06 12 34 56 78');
 await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'calendrier de suivi'}).waitFor();
 const hours=Object.fromEntries([2,3,4,5,6].map(i=>[i,[['10:00','12:30'],['15:20','20:00']]]));hours[1]=[['15:00','20:00']];hours[7]=[];rpc('create_followup_policy',{weekly_hours:hours,attempt_offsets:[0,0,1,3,5]},users[0].id);
 const centerBefore=sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.placement_tests))');
 await save();await dialog().getByRole('button',{name:'Continuer avec le nouveau prospect'}).click();await page.waitForURL(url=>url.searchParams.has('lead'));const lead=new URL(page.url()).searchParams.get('lead');assert.equal(detail(lead).status,'NEW');
 assert.equal(sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.placement_tests))'),centerBefore);
 console.log('PASS receptionist home/sidebar, no-policy error, manual intake, first task, no center records');
 // URL survives reload and browser back/forward.
 await page.reload();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('lead'));await page.goBack();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 // Opening links does not log; suppress protocol navigation only in this test.
 await page.getByRole('button',{name:'Appel',exact:true}).click();const activityBefore=sql(`select count(*) from public.crm_activities where lead_id='${lead}'`);
 const tel=dialog().getByRole('link',{name:/Appeler/});assert.equal(await tel.getAttribute('href'),'tel:+212612345678');await tel.evaluate(node=>node.addEventListener('click',e=>e.preventDefault(),{once:true}));await tel.click();assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead}'`),activityBefore);
 await save();await done();await page.waitForFunction(()=>document.activeElement?.textContent==='Appel',null,{timeout:3000});assert.equal(detail(lead).failed_attempts,1);assert.equal(detail(lead).status,'CONTACTING');assert.equal(detail(lead).open_tasks.length,1);
 await page.getByRole('button',{name:'WhatsApp',exact:true}).click();const wa=dialog().getByRole('link',{name:'Ouvrir WhatsApp'});assert.equal(await wa.getAttribute('href'),'https://wa.me/212612345678');await wa.evaluate(node=>node.addEventListener('click',e=>e.preventDefault(),{once:true}));const waBefore=sql(`select count(*) from public.crm_activities where lead_id='${lead}'`);await wa.click();assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead}'`),waBefore);await save();await done();assert.equal(detail(lead).status,'CONTACTING');assert.equal(detail(lead).failed_attempts,1);
 console.log('PASS tel/WhatsApp links never log; explicit failed call and sent message preserve correct lifecycle');
 // Note conflict refresh and double submit.
 await page.getByRole('button',{name:'Note',exact:true}).click();await dialog().getByLabel('Note',{exact:true}).fill('Note après conflit');act('add_note',lead,{note:'Modification concurrente'});
 await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'actualisées'}).waitFor();await dialog().getByRole('button',{name:'Enregistrer',exact:true}).dblclick();await dialog().getByText(/Action enregistrée/).waitFor();await done();assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead}' and body='Note après conflit'`),'1');assert.equal(detail(lead).status,'CONTACTING');
 // Committed response lost in transit: retry keeps exact key/payload even after refresh.
 await page.getByRole('button',{name:'Note',exact:true}).click();await dialog().getByLabel('Note',{exact:true}).fill('Réponse perdue');const attempts=[];let drop=true;
 await page.route('**/rest/v1/rpc/crm_add_note',async route=>{attempts.push(route.request().postDataJSON());if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'Impossible de confirmer'}).waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await save();await done();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead}' and body='Réponse perdue'`),'1');await page.unroute('**/rest/v1/rpc/crm_add_note');
 await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await dialog().getByLabel('Que souhaitez-vous enregistrer ?').selectOption('meaningful_whatsapp_conversation');await fillTask();await save();await done();assert.equal(detail(lead).status,'ENGAGED');assert.equal(detail(lead).failed_attempts,0);assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Casablanca',hour:'2-digit',minute:'2-digit'}).format(new Date(detail(lead).next_task.due_at)),'15:20');
 console.log('PASS stale lead refresh, exact retry after lost response, WhatsApp conversation and server lunch adjustment');
 // Task optimistic version, reschedule same identity.
 const task=detail(lead).next_task;await page.getByRole('button',{name:'Replanifier',exact:true}).first().click();await fillTask();sql(`update public.crm_tasks set version=version+1 where id='${task.id}'`);await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'actualisées'}).waitFor();await save();await done();assert.equal(detail(lead).next_task.id,task.id);
 await more('Qualifier / avancer');await fillTask();await save();await done();assert.equal(detail(lead).status,'QUALIFIED');assert.ok(detail(lead).open_tasks.some(t=>t.task_type==='confirm_placement_test'));assert.equal(sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.placement_tests))'),centerBefore);
 await more('Clôturer comme perdu');assert.ok(await dialog().getByLabel('Motif',{exact:true}).locator('option[value="unreachable"]').isDisabled());await dialog().getByLabel('Motif',{exact:true}).selectOption('other');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();assert.equal(detail(lead).status,'QUALIFIED');await dialog().getByLabel('Note',{exact:true}).fill('Projet abandonné');await save();await done();assert.equal(detail(lead).status,'LOST');assert.equal(await page.getByRole('button',{name:'Appel',exact:true}).count(),0);
 await page.getByRole('button',{name:'Rouvrir le prospect'}).click();await dialog().getByLabel('Motif',{exact:true}).fill('Le parent revient');await fillTask();await save();await done();assert.equal(detail(lead).status,'ENGAGED');
 await more('Clôturer comme non qualifié');await dialog().getByLabel('Motif',{exact:true}).selectOption('age_not_suitable');await save();await done();assert.equal(detail(lead).status,'NOT_QUALIFIED');
 console.log('PASS task stale version, qualification without placement booking, Lost eligibility/required explanation, reopen and Not Qualified');
 // New -> conversation -> qualified via the supported compound command.
 const compound=intake('Qualification synthétique');await open(compound);await more('Qualifier / avancer');await dialog().getByLabel('Note',{exact:true}).fill('Projet confirmé au téléphone');await fillTask();await save();await done();assert.equal(detail(compound).status,'QUALIFIED');
 // Non-call completion and cancellation preserve an explicit next action.
 await page.getByRole('button',{name:'Marquer comme fait',exact:true}).click();await dialog().getByLabel('Résultat de l’action',{exact:true}).fill('Préparation terminée');await fillTask();await save();await done();assert.ok(detail(compound).open_tasks.every(t=>t.task_type==='callback'));
 await page.getByRole('button',{name:'Annuler l’action',exact:true}).click();await dialog().getByLabel('Motif',{exact:true}).fill('Autre créneau demandé');await fillTask();await save();await done();assert.ok(detail(compound).next_task);
 console.log('PASS non-call completion and reasoned cancellation with replacement task');
 // Four historical attempts after a conversation, then the real fifth UI call.
 for(const state of ['ENGAGED','QUALIFIED']){
  const id=intake('Cycle synthétique '+state);sql(`update public.crm_leads set created_at=now()-interval '12 days' where id='${id}'`);
  act('record_conversation',id,{channel:'phone',note:'Conversation synthétique',occurred_at:new Date(Date.now()-10*86400000).toISOString(),next_task:next('center_visit')});
  if(state==='QUALIFIED')act('qualify_lead',id,{qualification_step:'center_visit',next_task:next('center_visit')});
  for(let i=0;i<4;i++)act('record_call_outcome',id,{outcome:'no_answer',occurred_at:new Date(Date.now()-(8-i)*86400000).toISOString()});
  // Complete the existing non-call follow-up while the next call slot stays open.
  for(const visit of detail(id).open_tasks.filter(t=>t.task_type==='center_visit'))act('complete_task',id,{task_id:visit.id,expected_task_version:visit.version,outcome:'Visite terminée'});
  await open(id);await page.getByRole('button',{name:'Appel',exact:true}).click();await save();await done();assert.equal(detail(id).open_tasks.length,0);await page.getByText('5 appels infructueux effectués',{exact:true}).waitFor();assert.equal(detail(id).failed_attempts,5);assert.equal(detail(id).status,state);await page.getByRole('button',{name:'Clôturer : injoignable',exact:true}).click();await save();await done();assert.equal(detail(id).status,'LOST');
 }
 console.log('PASS ENGAGED and QUALIFIED fifth failures retain lifecycle until explicit unreachable closure');
 // Decide before saving: the conversation and business outcome are one RPC.
 const spoke=intake('Conversation synthétique');await open(spoke);await page.getByRole('button',{name:'Appel',exact:true}).click();await dialog().getByLabel('Résultat de l’appel').selectOption('spoke_with_contact');await dialog().getByLabel('Note',{exact:true}).fill('Conversation et rappel convenu');await fillTask();await page.screenshot({path:'/private/tmp/hills-phase4-call.png',fullPage:false});await save();assert.equal(detail(spoke).status,'ENGAGED');assert.equal(detail(spoke).open_tasks.length,1);await done();
 for (const decision of ['qualify','lost','not_qualified']) {
  const id=intake('Décision '+decision);await open(id);await page.getByRole('button',{name:'Appel',exact:true}).click();
  await dialog().getByLabel('Résultat de l’appel').selectOption('spoke_with_contact');await dialog().getByLabel('Quelle suite donner ?').selectOption(decision);
  await dialog().getByLabel('Note',{exact:true}).fill('Le parent confirme sa décision');
  if(decision==='qualify'){await fillTask();await page.screenshot({path:'/private/tmp/hills-phase4-qualification.png',fullPage:false});}
  else assert.equal(await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).count(),0,'closure requires no dummy task');
  if(decision==='qualify') {
   const attempts=[];let drop=true;
   await page.route('**/rest/v1/rpc/crm_record_conversation_decision',async route=>{attempts.push(route.request().postDataJSON());if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
   await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'Impossible de confirmer'}).waitFor();
   await save();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);await page.unroute('**/rest/v1/rpc/crm_record_conversation_decision');
  } else await save();
  await done();const saved=detail(id);assert.equal(saved.status,{qualify:'QUALIFIED',lost:'LOST',not_qualified:'NOT_QUALIFIED'}[decision]);
  assert.equal(saved.open_tasks.length,decision==='qualify'?1:0);assert.ok(!saved.open_tasks.some(t=>t.task_type==='callback'));
  assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${id}' and event_type='conversation_recorded'`),'1');
 }
 await open(spoke);
 await more('Attribuer un responsable');await dialog().getByLabel('Responsable du prospect').selectOption(users[2].id);await save();await done();assert.equal(detail(spoke).owner_id,users[2].id);
 // Candidate suggestions explicitly disclose creation and never merge.
 await page.goto(app+'/crm/leads');await page.getByRole('button',{name:'Ajouter un prospect',exact:true}).click();await page.screenshot({path:'/private/tmp/hills-phase4-manual.png',fullPage:false});await dialog().getByLabel('Nom du contact',{exact:true}).fill('Autre contact synthétique');await dialog().getByLabel('Nom de l’apprenant',{exact:true}).fill('Autre enfant');await dialog().getByLabel('Téléphone',{exact:true}).fill('00212612345678');await save();await dialog().getByText(/Le nouveau prospect est déjà créé/).waitFor();await dialog().getByRole('button',{name:'Continuer avec le nouveau prospect'}).click();
 // Observational queue exceptions and safe flexible answers are real rendered data.
 const overdue=intake('Urgence synthétique'),stale=intake('Relance synthétique'),taskless=intake('Sans action synthétique');
 sql(`begin;set local request.jwt.claim.sub='${actor}';update public.crm_tasks set due_at=now()-interval '7 days' where lead_id='${overdue}';
 update public.crm_leads set status='CONTACTING',created_at=now()-interval '4 days' where id='${stale}';update public.crm_tasks set due_at=now()+interval '3 days' where lead_id='${stale}';
 do $fixture$ declare t public.crm_tasks%rowtype;begin for t in select * from public.crm_tasks where lead_id='${taskless}' loop perform crm_security.finish_task(t,true,'Synthetic missing action',gen_random_uuid()::text);end loop;end $fixture$;
 alter table public.crm_submissions disable trigger crm_submission_immutable;
 update public.crm_submissions set form_answers='[{"key":"age","label":"Âge déclaré","value":8,"value_type":"number","label_source":"synthetic"},{"key":"days","label":"Jours souhaités","value":["Mercredi","Samedi"],"value_type":"array","label_source":"synthetic"},{"key":"ready","label":"Disponible","value":true,"value_type":"boolean","label_source":"synthetic"},{"key":"campaign_id","label":"Campagne","value":"PRIVATE-SENTINEL","value_type":"string","label_source":"synthetic"},{"key":"leadgen_id","label":"Référence","value":"PRIVATE-SENTINEL","value_type":"string","label_source":"synthetic"},{"key":"financial_balance","label":"Solde","value":"PRIVATE-SENTINEL","value_type":"string","label_source":"synthetic"}]' where lead_id='${lead}';
 alter table public.crm_submissions enable trigger crm_submission_immutable;commit;`);
 await page.goto(app+'/crm/today');await page.getByTestId('lead-row').first().waitFor();assert.match(await page.getByTestId('lead-row').first().innerText(),/Urgence synthétique/);await page.getByText('Prochaine action manquante',{exact:true}).waitFor();await page.getByText('Contact à relancer',{exact:true}).waitFor();await page.screenshot({path:'/private/tmp/hills-phase4-today.png',fullPage:true});await page.getByTestId('lead-row').first().getByRole('button',{name:'Voir',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('lead')===overdue);
 await open(lead);await page.screenshot({path:'/private/tmp/hills-phase4-detail.png',fullPage:false});await page.getByText('Réponses aux formulaires',{exact:true}).click();await page.getByText('Mercredi · Samedi',{exact:true}).waitFor();await page.getByText('Oui',{exact:true}).waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE-SENTINEL|campaign_id/);
 console.log('PASS Today overdue ordering, missing/stale indicators, Today drawer and safe scalar/array/boolean form answers');
 // Search + mobile screenshot; no technical fields leak in UI or read responses.
 await page.goto(app+'/crm/leads');await page.getByLabel('Rechercher un prospect').fill('0612345678');await page.getByTestId('lead-row').first().waitFor();assert.ok(await page.getByTestId('lead-row').count()>0);
 await page.screenshot({path:'/private/tmp/hills-phase4-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.getByTestId('lead-row').first().getByRole('button',{name:'Voir',exact:true}).click();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.getByRole('dialog').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});const box=await page.getByRole('dialog').boundingBox();assert.ok(box.x>=-1 && box.x+box.width<=391 && box.width>=380,'mobile drawer fits viewport');await page.screenshot({path:'/private/tmp/hills-phase4-mobile.png',fullPage:false});
 const body=await page.locator('body').innerText();assert.doesNotMatch(body,/campaign_id|adset_id|ad_id|fbclid|raw_payload|payload_hash|source_key/);
 console.log('PASS compound qualification, successful call, safe reassignment, honest candidate handling, search, URL/mobile and no technical UI fields');
 // A mutation from page 2 resets the live Today queue, without snapshot infrastructure.
 await page.setViewportSize({width:1440,height:1000});
 for(let i=0;i<28;i++)intake('File accueil '+i);
 await page.goto(app+'/crm/today');const pager=page.getByRole('navigation',{name:'Pagination'}).first();
 await pager.getByRole('button',{name:'Suivant',exact:true}).click();await pager.getByText(/^26–/).waitFor();
 await page.getByTestId('lead-row').first().getByRole('button',{name:'Voir',exact:true}).click();await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Note',exact:true}).click();await dialog().getByLabel('Note',{exact:true}).fill('Mise à jour depuis la deuxième page');await save();await done();
 await page.getByRole('button',{name:'Close',exact:true}).click();await pager.getByText(/^1–25/).waitFor();
 assert.equal(await page.getByTestId('lead-row').count(),25);
 console.log('PASS live queue reset to page 1 after a mutation; bounded unique cards');
 await context.close();
 // Each role uses real local Auth; direct routes and read RPCs independently gated.
 for(const user of users.filter(u=>u.role!=='receptionist')){
  const ctx=await browser.newContext();await ctx.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());page=await ctx.newPage();await login(user);
  for(const path of ['/crm/today','/crm/leads']){const response=await page.request.get(app+path,{maxRedirects:0});assert.equal(response.status(),['director','admin'].includes(user.role)?200:307,`${user.role} ${path}`);}
  await ctx.close();
 }
 assert.deepEqual(pageErrors,[]);console.log('PASS real director/admin access and teacher/parent/student/pending route denial; no browser errors');
} catch(error) {
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:'/private/tmp/hills-phase4-failure.png',fullPage:true});}
 throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');sql(`begin;
 lock table public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where actor_id in(${ids}) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 delete from auth.users where id in(${ids});delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
 console.log('PASS synthetic browser fixtures removed; history guards restored');
}
