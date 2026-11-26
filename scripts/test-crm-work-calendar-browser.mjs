// Local Auth + real UI + RPC regression. Synthetic fixtures are removed in finally.
// No Git mutations, production connections, external requests or real data copies.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, webkit } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { cancelledFetches } from './lib/webkit-cancelled-fetch.mjs';
import { openDaySql } from './lib/centre-days.mjs';
assertLocalFeatureBranch();
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const run='o3-work-browser-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
let browser,actor;const pageErrors=[];const legacyIds=[];
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
let page,phase;
const dialog=()=>page.getByRole('dialog').last();
async function open(id){await page.waitForLoadState('networkidle');await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
async function closeDrawer(){await page.getByRole('button',{name:'Fermer',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('lead'));await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForLoadState('networkidle');}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.waitForTimeout(500);await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));await page.getByRole('heading',{name:'Pipeline admissions',exact:true}).waitFor();await page.getByTestId('opportunity-card').first().waitFor();await page.waitForLoadState('networkidle');}
try {
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean local synthetic baseline');
 for(const role of ['director','receptionist','receptionist']) {
  const email=`${run}-${role}-${users.length}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name=${quote('Équipe accueil')} where id='${user.id}'`);
 }
 actor=users[1].id;const hours=Object.fromEntries([1,2,3,4,5,6,7].map(i=>[i,[['09:00','20:00']]]));rpc('create_followup_policy',{weekly_hours:hours},users[0].id);
 const lead=intake('Parent · '+'NomLong'.repeat(18)),taskless=intake('Sans prochaine action'),closed=intake('Rendez-vous clos');
 act('qualify_lead',closed,{conversation_channel:'in_person',note:'Projet réel synthétique',qualification_step:'placement_test',next_task:next('confirm_placement_test')});
 const day=sql("select to_char((now() at time zone public.centre_utc_offset())::date+1,'YYYY-MM-DD')");
 // Booked tests are appointments, refused outside opening hours: the first day from tomorrow where 10:00 and
 // 11:00 are open (tomorrow can be the closed Sunday or Monday morning). The Calendar shows 7 days from `day`.
 const bookDay=sql(`select ${openDaySql(1,['10:00','11:00'])}`);
 const prepared=detail(closed);rpc('book_placement_test',{lead_id:closed,expected_version:prepared.version,task_id:prepared.next_task.id,expected_task_version:prepared.next_task.version,date_test:bookDay,heure:'10:00',examinateur:'Libellé examinateur'});
 const closedTest=detail(closed).next_placement.id;
 act('close_lost',closed,{reason:'price'});
 // RWR-r5 §4.9 and invariant 2: closing cancels the test and the calendar excludes closed
 // prospects, so the linked event checks use a prospect whose booked test is still open.
 const booked=intake('Rendez-vous ouvert');act('qualify_lead',booked,{conversation_channel:'in_person',note:'Projet réel synthétique',qualification_step:'placement_test',next_task:next('confirm_placement_test')});
 {const d=detail(booked);rpc('book_placement_test',{lead_id:booked,expected_version:d.version,task_id:d.next_task.id,expected_task_version:d.next_task.version,date_test:bookDay,heure:'11:00',examinateur:'Libellé examinateur'});}
 const bookedEvent='center_visit:'+detail(booked).next_task.id;
 sql(`update public.crm_leads set owner_id='${users[0].id}',conversion_review_required=true where id='${lead}';
 -- M-A2 (137): an active prospect with no open action is refused (23514); « Sans prochaine action » stays
 -- a NEW prospect with its first contact, so « À traiter » still lists it (priority 2) for the search below.
 begin;do $fixture$ declare t public.crm_tasks%rowtype;begin
 begin
  for t in select * from public.crm_tasks where lead_id='${taskless}' and status='open' loop perform crm_security.finish_task(t,true,'Synthetic missing action',gen_random_uuid()::text);end loop;
  set constraints all immediate;
  raise exception 'FAIL work-calendar: an active prospect without an action was accepted';
 exception when check_violation then null;
 end;
 set constraints all deferred;
end $fixture$;commit;
 update public.crm_tasks set due_at=now()-interval '1 minute',assigned_to='${actor}' where lead_id='${lead}';`);
 const types=['first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup'];
 // RWR-r5 §4.2: the work queue is one row per prospect (its next action), so a paged
 // queue needs 40 prospects with one action each, not 40 actions on one prospect.
 const taskIds=[],queueLeads=[];
 for(let i=0;i<40;i++){const id=intake('File synthétique '+i);queueLeads.push(id);taskIds.push(sql(`update public.crm_tasks set task_type=${quote(types[i%8])},due_at=now()-interval '1 hour'+make_interval(secs=>${i}),assigned_to='${actor}' where lead_id='${id}' and status='open' returning id`));}
 const unassignedLead=intake('File non attribuée');queueLeads.push(unassignedLead);
 sql(`update public.crm_tasks set task_type='callback',due_at=now()-interval '1 minute',assigned_to=null where lead_id='${unassignedLead}' and status='open';
 update public.crm_leads set owner_id='${users[0].id}' where id in(${queueLeads.map(quote).join(',')});`);
 for(let i=0;i<114;i++)legacyIds.push(sql(`insert into public.placement_tests(student_name,date_test,heure,status,notes,examinateur) values(${quote('Legacy appointment '+i)},${i<3?quote(day):`(${quote(day)}::date+2)`},${i===0?'null':i===1?quote('invalid'):quote('11:00')},${quote(i===2?'Passé':'Planifié')},'PRIVATE EXCLUDED NOTE','Examiner label') returning id`));
 const legacy=legacyIds[0],completed=legacyIds[2];
 const visitLead=intake('UX scheduled visit');
 const visit=sql(`update public.crm_tasks set task_type='center_visit',due_at=(${quote(day)}::date+time '10:35') at time zone public.centre_utc_offset(),
 scheduled_end_at=(${quote(day)}::date+time '11:05') at time zone public.centre_utc_offset(),assigned_to='${actor}' where lead_id='${visitLead}' and status='open' returning id`);
 // Owned like the queue fixture, so « Demain » under the owner filter shows exactly this visit.
 sql(`update public.crm_leads set owner_id='${users[0].id}' where id='${visitLead}'`);
 const visitTask=detail(visitLead).next_task;
 // RWR-r5 §4.9: the card, the queue row and the drawer all show the server's action label.
 const expected=detail(visitLead).next_action.label;
 const staffRows=JSON.parse(sql(`begin;set local request.jwt.claim.sub='${actor}';select public.crm_list_staff();commit;`)).rows;
 const labels=users.map(u=>staffRows.find(p=>p.id===u.id).display_label);
 assert.equal(new Set(labels).size,users.length);
 const external=[],errors=[],requests=[],eventPayloads=[],workPayloads=[];
 for(const engine of [chromium,webkit]) {
  browser=await engine.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  // Controlled browser tzdata disagreement: operational reads must still use PG.
  await ctx.addInitScript(()=>{
   const Original=Intl.DateTimeFormat;
   Intl.DateTimeFormat=function(locale,options){return new Original(locale,options?.timeZone==='Africa/Casablanca'?{...options,timeZone:'Etc/GMT+8'}:options);};
   Intl.DateTimeFormat.prototype=Original.prototype;Intl.DateTimeFormat.supportedLocalesOf=Original.supportedLocalesOf.bind(Original);
  });
  await ctx.route(url=>!['localhost','127.0.0.1'].includes(url.hostname),route=>{external.push(new URL(route.request().url()).hostname);return route.abort();});
  page=await ctx.newPage();page.setDefaultTimeout(60000);const fetches=cancelledFetches(page);page.on('pageerror',e=>{if(fetches.take(e,`${phase}: ${e.message}`))return;errors.push(e.message);console.error('BROWSER_ERROR',phase,e.message);});
  page.on('request',r=>{if(r.url().includes('/rest/v1/'))requests.push({path:new URL(r.url()).pathname,url:r.url(),args:r.postDataJSON()});});
  const payloadReads=new Set();
  page.on('response',r=>{
   const target=r.url().endsWith('/rpc/crm_get_admissions_calendar')?eventPayloads:r.url().endsWith('/rpc/crm_get_work_queue')?workPayloads:null;
   if(!r.ok()||!target)return;
   const pending=r.json().then(payload=>target.push(payload));payloadReads.add(pending);
   pending.then(()=>payloadReads.delete(pending),error=>{errors.push(error.message);payloadReads.delete(pending);});
  });
  await page.clock.install();await login(users[1]);phase=engine.name()+' Tasks';await page.goto(app+'/crm/today?bucket=overdue');await page.getByTestId('work-row').first().waitFor();
  for(const label of ['Responsable de la tâche','Responsable du prospect']) {
   for(let i=0;i<users.length;i++)assert.equal(await page.getByLabel(label).locator(`option[value="${users[i].id}"]`).textContent(),labels[i]);
  }
  await page.goto(app+'/crm/leads');await page.getByRole('button',{name:/^Filtres/}).click();await page.getByLabel('Responsable',{exact:true}).waitFor();
  for(let i=0;i<users.length;i++)assert.equal(await page.getByLabel('Responsable',{exact:true}).locator(`option[value="${users[i].id}"]`).textContent(),labels[i]);
  // Same center visit in Calendar, Tasks and drawer; browser ICU is wrong.
  await page.locator(`[data-testid=opportunity-card][data-lead-id="${visitLead}"]`).getByText(expected,{exact:false}).waitFor();
  const browserTime=await page.evaluate(stamp=>new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Casablanca',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp)),visitTask.due_at);
  assert.notEqual(browserTime,visitTask.local_time.slice(0,5),'forced browser/server disagreement established');
  await page.goto(app+'/placement-tests?view=calendar&date='+day+'&kind=center_visit');
  await page.locator(`[data-event-key="center_visit:${visit}"]`).getByText('10:35',{exact:false}).waitFor();
  await page.locator(`[data-event-key="center_visit:${visit}"]`).getByText('jusqu’à 11:05',{exact:true}).waitFor();
  await page.goto(app+'/crm/today?bucket=tomorrow');await page.locator(`[data-task-id="${visit}"]`).getByText(expected,{exact:false}).first().waitFor();
  await page.locator(`[data-task-id="${visit}"]`).getByRole('button',{name:'Voir le prospect'}).click();
  await dialog().getByText('Historique',{exact:true}).waitFor();
  await dialog().getByTestId('next-action-label').filter({hasText:expected}).waitFor();await closeDrawer();
  console.log('PASS identical server Casablanca display under deliberately divergent browser tzdata; shared distinguishable staff labels');
  await page.goto(app+'/crm/today?bucket=overdue');await page.getByTestId('work-row').first().waitFor();
  // RWR-r5 invariant 10 / §4.6: the default view is « Moi + non attribué ».
  assert.equal(await page.getByLabel('Responsable de la tâche').inputValue(),'me_or_unassigned');assert.equal(await page.getByTestId('work-row').count(),25,'bounded page, one row per prospect');
  const first=await page.getByTestId('work-row').first().getAttribute('data-task-id');
  await page.getByRole('button',{name:'Suivant',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId!==id,first);
  const second=await page.getByTestId('work-row').evaluateAll(ns=>ns.map(n=>n.dataset.taskId));assert(!second.includes(first));
  await page.getByRole('button',{name:'Précédent',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId===id,first);
  for(const label of ['Premier contact','Appel de suivi','Rappel','À faire par nous (WhatsApp)','Confirmer le test de niveau','Proposer l’inscription','Rendez-vous au centre','Finaliser l’inscription'])assert(await page.getByTestId('work-row').filter({hasText:label}).count()>0,label);
  await page.getByLabel('Responsable du prospect').selectOption('me');await page.getByText('Aucun prospect dans cette échéance et ce périmètre. Choisissez une autre échéance ou ajustez les filtres.',{exact:true}).waitFor();
  await page.getByLabel('Responsable du prospect').selectOption(users[0].id);await page.getByTestId('work-row').first().waitFor();
  await page.getByLabel('Responsable de la tâche').selectOption('unassigned');await page.waitForFunction(()=>document.querySelectorAll('[data-testid=work-row]').length===1);assert.equal(await page.getByTestId('work-row').count(),1);
  await page.getByLabel('Responsable de la tâche').selectOption('me');await page.waitForFunction(()=>document.querySelectorAll('[data-testid=work-row]').length===25);
  // Independent cursors: leaving and returning to a bucket preserves its page.
  await page.getByRole('button',{name:'Suivant',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId!==id,first);
  const remembered=await page.getByTestId('work-row').first().getAttribute('data-task-id');
  await page.getByRole('button',{name:/^Demain/}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-testid=work-row]').length===1);assert.equal(await page.getByTestId('work-row').count(),1);
  await page.getByRole('button',{name:/^En retard/}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId===id,remembered);
  await page.getByRole('link',{name:/À traiter/}).click();await page.waitForURL(url=>url.searchParams.get('view')==='attention');
  // The 40 overdue queue prospects fill the first page; the search narrows to the taskless one.
  await page.getByRole('searchbox',{name:'Rechercher un prospect'}).fill('Sans prochaine action');await page.getByTestId('opportunity-row').filter({hasText:'Sans prochaine action'}).first().waitFor();
  await page.goto(app+'/crm/today?bucket=overdue');await page.getByTestId('work-row').first().waitFor();
  // Exact chosen task, including stale rejection and explicit renewed confirmation.
  const reassigned=engine===chromium?taskIds[1]:taskIds[2];
  const row=page.locator(`[data-task-id="${reassigned}"]`);await row.getByRole('button',{name:/^Plus d’options/}).click();await page.getByRole('menuitem',{name:'Réattribuer l’action',exact:true}).click();await dialog().getByLabel('Responsable de l’action').waitFor();
  sql(`update public.crm_tasks set version=version+1 where id='${reassigned}'`);
  await dialog().getByLabel('Responsable de l’action').selectOption(users[0].id);await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').waitFor();
  assert.equal(sql(`select assigned_to from crm_tasks where id='${reassigned}'`),actor,'stale intent denied');
  // §4.9 (PR #208 review, Important 1): never adopted silently — save stays disabled until « Recharger ».
  await dialog().getByText('Ce prospect a été modifié, rechargez.',{exact:true}).waitFor();assert(await dialog().getByRole('button',{name:'Enregistrer',exact:true}).isDisabled(),'save disabled until reload');
  await dialog().getByRole('button',{name:'Recharger',exact:true}).click();await dialog().getByTestId('reloaded-state').waitFor();
  await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByText('Enregistré',{exact:true}).waitFor();assert.equal(sql(`select assigned_to from crm_tasks where id='${reassigned}'`),users[0].id);await closeDrawer();
  assert(requests.some(r=>r.path.endsWith('/rpc/crm_reassign')&&r.args?.p_data?.task_id===reassigned&&Number.isInteger(r.args.p_data.expected_task_version)),'exact task/version reassignment command');
  const calling=page.getByTestId('work-row').filter({hasText:'Premier contact'}).first();await calling.getByRole('button',{name:'Noter un échange',exact:true}).click();await dialog().getByRole('heading',{name:'Noter un échange'}).waitFor();await dialog().getByRole('button',{name:'Annuler',exact:true}).click();await closeDrawer();
  // Keyboard, Back and task return context.
  const opener=page.getByTestId('work-row').first().getByRole('button',{name:'Voir le prospect',exact:true});await opener.focus();await page.keyboard.press('Enter');await dialog().getByText('Historique',{exact:true}).waitFor();assert(new URL(page.url()).searchParams.has('bucket'));
  await page.goBack();await page.getByRole('dialog').waitFor({state:'hidden'});await opener.waitFor();
  phase=engine.name()+' Calendar';requests.length=0;await page.goto(app+'/placement-tests?view=calendar&date='+day);await page.getByTestId('calendar-event').first().waitFor();await page.waitForLoadState('networkidle');
  assert(!requests.some(r=>/\/(students|groups|placement_tests)$/.test(r.path)),'calendar rendering has no eager table populations');
  assert.equal(await page.getByTestId('calendar-event').count(),100);await page.getByText('D’autres rendez-vous restent à charger. Cette page ne couvre pas toute la période.',{exact:true}).waitFor();
  const keys=await page.getByTestId('calendar-event').evaluateAll(ns=>ns.map(n=>n.dataset.eventKey));assert.equal(new Set(keys).size,keys.length);
  await page.getByText('Heure non précisée',{exact:true}).waitFor();assert(await page.getByTestId('calendar-event').filter({hasText:'Libellé examinateur'}).count());
  assert(keys.includes(bookedEvent),'a booked test is one appointment event (§4.2)');assert(!keys.some(k=>k.endsWith(closedTest)),'the closed prospect’s cancelled test is not shown (§4.9)');
  assert.equal(sql(`select status from public.placement_tests where id='${closedTest}'`)==='Planifié',false,'invariant 2: closing left no planned test');
  assert(!keys.includes('placement:'+completed));await page.getByLabel('Inclure terminés').click();await page.waitForURL(url=>url.searchParams.get('completed')==='1');assert(await page.getByLabel('Inclure terminés').isChecked());await page.locator(`[data-event-key="placement:${completed}"]`).waitFor();await page.getByLabel('Inclure terminés').click();await page.waitForURL(url=>!url.searchParams.has('completed'));assert(!(await page.getByLabel('Inclure terminés').isChecked()));await page.locator(`[data-event-key="placement:${completed}"]`).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Suivants',exact:true}).click();await page.waitForFunction(first=>document.querySelector('[data-testid=calendar-event]')?.dataset.eventKey!==first,keys[0]);assert(await page.getByTestId('calendar-event').count()<100);
  await page.getByRole('button',{name:'Précédents',exact:true}).click();await page.locator(`[data-event-key="placement:${legacy}"]`).waitFor();
  const legacyButton=page.locator(`[data-event-key="placement:${legacy}"]`);await legacyButton.click();await dialog().getByRole('heading',{name:'Modifier le test',exact:true}).waitFor();assert.equal(await dialog().getByLabel('Heure',{exact:true}).inputValue(),'');
  assert(requests.filter(r=>r.path==='/rest/v1/students'||r.path==='/rest/v1/groups').every(r=>{const u=new URL(r.url);return u.searchParams.has('id')||Number(u.searchParams.get('limit'))<=26&&u.searchParams.has('limit');}),'modal option reads are bounded');await dialog().getByRole('button',{name:'Annuler',exact:true}).click();
  const linkedButton=page.locator(`[data-event-key="${bookedEvent}"] button`).first();await linkedButton.click();await dialog().getByText('Historique',{exact:true}).waitFor();await dialog().getByTestId('next-action-label').filter({hasText:'avec test'}).waitFor();
  await page.goBack();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(new URL(page.url()).searchParams.get('view'),'calendar');assert.equal(new URL(page.url()).searchParams.get('date'),day);
  for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:720,height:450}]) {
   phase=engine.name()+' viewport '+viewport.width;await page.setViewportSize(viewport);await page.waitForLoadState('networkidle');
   for(const route of ['/crm/today?bucket=overdue','/placement-tests?view=calendar&date='+day]) {
    await page.goto(app+route);await page.waitForLoadState('networkidle');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no body overflow');
    await page.screenshot({path:join(tmpdir(),`o3-work-${engine.name()}-${viewport.width}-${route.startsWith('/crm')?'tasks':'calendar'}-overview.png`)});
    const button=route.startsWith('/crm')?page.getByTestId('work-row').first().getByRole('button',{name:'Voir le prospect'}):page.locator(`[data-event-key="${bookedEvent}"] button`).first();
    await button.click();await dialog().getByText('Historique',{exact:true}).waitFor();await page.waitForFunction(()=>{const b=document.querySelector('[role=dialog]')?.getBoundingClientRect();return b&&b.x>=-1&&b.right<=innerWidth+1;});
    await page.screenshot({path:join(tmpdir(),`o3-work-${engine.name()}-${viewport.width}-${route.startsWith('/crm')?'tasks':'calendar'}.png`)});await closeDrawer();
   }
  }
  // Loading/error/retry on real RPC transport; empty state uses a genuine filter.
  let releaseRead;
  const blockedRead=new Promise(resolve=>{releaseRead=resolve;});
  const readUrl='**/rest/v1/rpc/crm_get_work_queue';
  await page.route(readUrl,async route=>{await blockedRead;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Synthetic read failure'})});});
  await page.goto(app+'/crm/today?assignee='+users[0].id+'&owner=unassigned&bucket=today');
  await page.getByText('Chargement…',{exact:true}).waitFor();releaseRead();
  await page.getByRole('alert').filter({hasText:'Impossible de charger ces informations.'}).waitFor();
  await page.unroute(readUrl);
  await page.getByRole('alert').getByRole('button',{name:'Réessayer',exact:true}).click();
  await page.getByText('Aucun prospect dans cette échéance et ce périmètre. Choisissez une autre échéance ou ajustez les filtres.',{exact:true}).waitFor();
  // Real query interval; the server still owns all scheduling and bucket logic.
  await page.goto(app+'/crm/today?bucket=overdue');await page.waitForLoadState('networkidle');
  const minuteRead=page.waitForResponse(r=>r.url().endsWith('/rpc/crm_get_work_queue')&&r.ok());
  await page.clock.fastForward(61000);await minuteRead;
  const focusRead=page.waitForResponse(r=>r.url().endsWith('/rpc/crm_get_work_queue')&&r.ok());
  await page.clock.fastForward(16000);await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));await focusRead;
  await page.waitForLoadState('networkidle');await Promise.allSettled([...payloadReads]);assert.deepEqual(errors,[]);assert.deepEqual(fetches.uncancelled(),[],'every WebKit fetch error is a cancelled request');await ctx.close();await browser.close();browser=null;console.log(`PASS ${engine.name()} task types/pages/AND filters/exact-task stale guards/Calendar/legacy/Back/responsive/reduced motion`);
 }
 assert.deepEqual(external,[],'no external browser/provider requests');
 assert(!requests.some(r=>r.path.endsWith('/rpc/crm_get_lead_detail')||r.path.endsWith('/rpc/crm_get_submission_attribution')));
 // RWR-r5 §4.9: rows add the next action, the D1 review flag and the sibling count (work queue),
 // and the appointment outcome state and test link (calendar). No notes, scores or provider data.
 for(const payload of workPayloads)for(const row of payload.rows){assert.deepEqual(Object.keys(row).sort(),['assigned_to','assignee_display_label','assignee_name','attempt_ordinal','due_at','family','followup_reason','id','lead','lead_id','local_date','local_time','next_action','review_flag','schedule_kind','scheduled_end_at','siblings','task_type','version']);assert(!JSON.stringify(row).includes('conversion_review_required'));}
 for(const payload of eventPayloads)for(const row of payload.rows)assert.deepEqual(Object.keys(row).sort(),['assigned_to','assignee_name','display_name','end_local_date','end_local_time','ends_at','examiner_label','id','kind','lead_id','lead_version','local_date','local_time','outcome_code','outcome_enabled','placement_status','placement_test_id','stage','starts_at','student_id','task_status','task_type','task_version','updated_at','with_test']);
 console.log('PASS actual fixed RPC response shapes; no technical/score/notes/provider payload or browser Meta activity');
} catch(error) {
 console.error(phase,error.message);
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:join(tmpdir(), 'hills-phase4-failure.png'),fullPage:true});}
 throw error;
} finally {
 if(browser)await browser.close();
 if(legacyIds.length)sql(`delete from public.placement_tests where id in(${legacyIds.map(quote).join(',')}) and crm_lead_id is null`);
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 -- Transaction-only teardown indexes prevent quadratic FK probes on the large synthetic fixture.
 create index o3_test_cleanup_activity_task on public.crm_activities(task_id,lead_id);
 create index o3_test_cleanup_activity_prior on public.crm_activities(supersedes_activity_id,lead_id);
 create index o3_test_cleanup_task_source on public.crm_tasks(source_activity_id,lead_id);
 create index o3_test_cleanup_task_completion on public.crm_tasks(completion_activity_id,lead_id);
 create index o3_test_cleanup_task_prior on public.crm_tasks(supersedes_task_id,lead_id);
 create index o3_test_cleanup_lead_conversion on public.crm_leads(conversion_activity_id,id,enrollment_id);
 alter table public.placement_tests disable trigger crm_placement_integrity;alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submission_attribution disable trigger crm_attribution_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id), removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id) select count(*) from removed_tasks;
 delete from public.crm_submission_attribution where submission_id in(select id from public.crm_submissions where resolved_by in(${ids}) or lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))));
 delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})));
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where actor_id in(${ids}) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) or lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 set constraints all immediate;alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submission_attribution enable trigger crm_attribution_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});drop index public.o3_test_cleanup_activity_task,public.o3_test_cleanup_activity_prior,public.o3_test_cleanup_task_source,public.o3_test_cleanup_task_completion,public.o3_test_cleanup_task_prior,public.o3_test_cleanup_lead_conversion;commit;`);}
 assert.equal(sql("select count(*) from pg_indexes where schemaname='public' and indexname like 'o3_test_cleanup_%'"),'0');
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0');
 console.log('PASS synthetic browser fixtures removed; history guards restored; no teardown indexes retained');
}
