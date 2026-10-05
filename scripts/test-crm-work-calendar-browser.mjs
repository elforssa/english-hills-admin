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
assertLocalFeatureBranch();
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const run='o3-work-browser-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
let browser,actor;const pageErrors=[];const legacyIds=[];
const rpc=(name,data,id=actor,key=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(id)};set local role authenticated;select public.crm_${name}(${quote(key)},${quote(JSON.stringify(data))}::jsonb);commit;`));
const detail=id=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};select public.crm_get_workspace_detail('${id}');commit;`));
const act=(name,id,data={})=>rpc(name,{lead_id:id,expected_version:detail(id).version,...data});
const next=(type='callback')=>({task_type:type,due_at:new Date(Date.now()+3*86400000).toISOString()});
const intake=name=>rpc('create_manual_lead',{display_name:name,learner_name:'Enfant synthétique',phone:'0612345678',source_label:'Manuel · Téléphone'}).lead.id;
let page,phase;
// Keep fixture dates future without depending on the machine's timezone.
const testDay=new Date(Date.now()+14*86400000);while(testDay.getUTCDay()!==2)testDay.setUTCDate(testDay.getUTCDate()+1);
const future=testDay.toISOString().slice(0,10)+'T13:00';
const dialog=()=>page.getByRole('dialog').last();
async function save(){const outcome=dialog().getByLabel('Résultat de l’appel',{exact:true});if(await outcome.count() && !(await outcome.inputValue())) await outcome.selectOption('no_answer');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByText(/Action enregistrée\.|Nouveau prospect créé\./).waitFor();}
async function done(){await dialog().getByRole('button',{name:'Terminé',exact:true}).click();}
async function open(id){await page.waitForLoadState('networkidle');await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
async function more(label){await page.getByRole('button',{name:'Autres actions',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();}
async function closeDrawer(){await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('lead'));await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForLoadState('networkidle');}
async function fillTask(){await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).fill(future);}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.waitForTimeout(500);await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));await page.getByRole('heading',{name:'Pipeline admissions',exact:true}).waitFor();await page.getByTestId('opportunity-card').first().waitFor();await page.waitForLoadState('networkidle');}
try {
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean local synthetic baseline');
 for(const role of ['director','receptionist']) {
  const email=`${run}-${role}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name=${quote('O3 synthetic '+role)} where id='${user.id}'`);
 }
 actor=users[1].id;const hours=Object.fromEntries([1,2,3,4,5,6,7].map(i=>[i,[['09:00','20:00']]]));rpc('create_followup_policy',{weekly_hours:hours},users[0].id);
 const lead=intake('Parent · '+'NomLong'.repeat(18)),taskless=intake('Sans prochaine action'),closed=intake('Rendez-vous clos');
 act('qualify_lead',closed,{conversation_channel:'in_person',note:'Projet réel synthétique',qualification_step:'placement_test',next_task:next('confirm_placement_test')});
 const day=sql("select to_char((now() at time zone 'Africa/Casablanca')::date+1,'YYYY-MM-DD')");
 const prepared=detail(closed);rpc('book_placement_test',{lead_id:closed,expected_version:prepared.version,task_id:prepared.next_task.id,expected_task_version:prepared.next_task.version,date_test:day,heure:'10:00',examinateur:'Libellé examinateur'});
 act('close_lost',closed,{reason:'price'});
 sql(`update public.crm_leads set owner_id='${users[0].id}',conversion_review_required=true where id='${lead}';
 update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='Synthetic taskless fixture' where lead_id='${taskless}';
 update public.crm_tasks set due_at=now()-interval '1 minute',assigned_to='${actor}' where lead_id='${lead}';`);
 const types=['first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup'];
 const taskIds=[];
 for(let i=0;i<40;i++)taskIds.push(sql(`insert into public.crm_tasks(lead_id,task_type,due_at,assigned_to,source_kind,source_key) values('${lead}',${quote(types[i%8])},now()-interval '1 hour'+make_interval(secs=>${i}),'${actor}','manual',${quote(run+':task:'+i)}) returning id`));
 sql(`insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key) values('${lead}','callback',now()-interval '1 minute','manual',${quote(run+':unassigned')});`);
 for(const [bucket,expr] of [['today',"now()+(((((now() at time zone 'Africa/Casablanca')::date+1)::timestamp at time zone 'Africa/Casablanca')-now())/2)"],['tomorrow',"((now() at time zone 'Africa/Casablanca')::date+1)::timestamp at time zone 'Africa/Casablanca'"],['upcoming',"((now() at time zone 'Africa/Casablanca')::date+2)::timestamp at time zone 'Africa/Casablanca'"]])
  sql(`insert into public.crm_tasks(lead_id,task_type,due_at,assigned_to,source_kind,source_key) values('${lead}','center_visit',${expr},'${actor}','manual',${quote(run+':'+bucket)})`);
 for(let i=0;i<114;i++)legacyIds.push(sql(`insert into public.placement_tests(student_name,date_test,heure,status,notes,examinateur) values(${quote('Legacy appointment '+i)},${i<3?quote(day):`(${quote(day)}::date+2)`},${i===0?'null':i===1?quote('invalid'):quote('11:00')},${quote(i===2?'Passé':'Planifié')},'PRIVATE EXCLUDED NOTE','Examiner label') returning id`));
 const legacy=legacyIds[0],completed=legacyIds[2];
 const external=[],errors=[],requests=[],eventPayloads=[],workPayloads=[];
 for(const engine of [chromium,webkit]) {
  browser=await engine.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await ctx.route(url=>!['localhost','127.0.0.1'].includes(url.hostname),route=>{external.push(new URL(route.request().url()).hostname);return route.abort();});
  page=await ctx.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER_ERROR',phase,e.message);});
  page.on('request',r=>{if(r.url().includes('/rest/v1/'))requests.push({path:new URL(r.url()).pathname,url:r.url(),args:r.postDataJSON()});});
  const payloadReads=new Set();
  page.on('response',r=>{
   const target=r.url().endsWith('/rpc/crm_get_admissions_calendar')?eventPayloads:r.url().endsWith('/rpc/crm_get_work_queue')?workPayloads:null;
   if(!r.ok()||!target)return;
   const pending=r.json().then(payload=>target.push(payload));payloadReads.add(pending);
   pending.then(()=>payloadReads.delete(pending),error=>{errors.push(error.message);payloadReads.delete(pending);});
  });
  await page.clock.install();await login(users[1]);phase=engine.name()+' Tasks';await page.goto(app+'/crm/today?bucket=overdue');await page.getByTestId('work-row').first().waitFor();
  assert.equal(await page.getByLabel('Responsable de la tâche').inputValue(),'me');assert.equal(await page.getByTestId('work-row').count(),25,'bounded task page, multiple tasks of same lead');
  const first=await page.getByTestId('work-row').first().getAttribute('data-task-id');
  await page.getByRole('button',{name:'Suivantes',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId!==id,first);
  const second=await page.getByTestId('work-row').evaluateAll(ns=>ns.map(n=>n.dataset.taskId));assert(!second.includes(first));
  await page.getByRole('button',{name:'Précédentes',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId===id,first);
  for(const label of ['Premier contact','Appel de suivi','Rappel','Suivi WhatsApp','Préparer un test de niveau','Rappeler le parent · Résultat disponible','Visite au centre','Finaliser l’inscription'])assert(await page.getByTestId('work-row').filter({hasText:label}).count()>0,label);
  await page.getByLabel('Responsable du prospect').selectOption('me');await page.getByText('Aucune tâche dans cette échéance.',{exact:true}).waitFor();
  await page.getByLabel('Responsable du prospect').selectOption(users[0].id);await page.getByTestId('work-row').first().waitFor();
  await page.getByLabel('Responsable de la tâche').selectOption('unassigned');await page.waitForFunction(()=>document.querySelectorAll('[data-testid=work-row]').length===1);assert.equal(await page.getByTestId('work-row').count(),1);
  await page.getByLabel('Responsable de la tâche').selectOption('me');await page.waitForFunction(()=>document.querySelectorAll('[data-testid=work-row]').length===25);
  // Independent cursors: leaving and returning to a bucket preserves its page.
  await page.getByRole('button',{name:'Suivantes',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId!==id,first);
  const remembered=await page.getByTestId('work-row').first().getAttribute('data-task-id');
  await page.getByRole('button',{name:/^Demain/}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-testid=work-row]').length===1);assert.equal(await page.getByTestId('work-row').count(),1);
  await page.getByRole('button',{name:/^En retard/}).click();await page.waitForFunction(id=>document.querySelector('[data-testid=work-row]')?.dataset.taskId===id,remembered);
  await page.getByRole('link',{name:/À surveiller/}).click();await page.getByTestId('opportunity-row').filter({hasText:'Sans prochaine action'}).waitFor();
  await page.goto(app+'/crm/today?bucket=overdue');await page.getByTestId('work-row').first().waitFor();
  // Exact chosen task, including stale rejection and explicit renewed confirmation.
  const reassigned=engine===chromium?taskIds[1]:taskIds[2];
  const row=page.locator(`[data-task-id="${reassigned}"]`);await row.getByRole('button',{name:'Réattribuer',exact:true}).click();await dialog().getByLabel('Responsable de l’action').waitFor();
  sql(`update public.crm_tasks set version=version+1 where id='${reassigned}'`);
  await dialog().getByLabel('Responsable de l’action').selectOption(users[0].id);await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').waitFor();
  assert.equal(sql(`select assigned_to from crm_tasks where id='${reassigned}'`),actor,'stale intent denied');
  await save();await done();assert.equal(sql(`select assigned_to from crm_tasks where id='${reassigned}'`),users[0].id);assert.equal(detail(lead).owner_id,users[0].id);await closeDrawer();
  assert(requests.some(r=>r.path.endsWith('/rpc/crm_reassign')&&r.args?.p_data?.task_id===reassigned&&Number.isInteger(r.args.p_data.expected_task_version)),'exact task/version reassignment command');
  const calling=page.getByTestId('work-row').filter({hasText:'Premier contact'}).first();await calling.getByRole('button',{name:'Résultat d’appel',exact:true}).click();await dialog().getByLabel('Résultat de l’appel',{exact:true}).waitFor();await dialog().getByRole('button',{name:'Annuler',exact:true}).click();await closeDrawer();
  // Keyboard, Back and task return context.
  const opener=page.getByTestId('work-row').first().getByRole('button',{name:'Voir le prospect',exact:true});await opener.focus();await page.keyboard.press('Enter');await dialog().getByText('Historique',{exact:true}).waitFor();assert(new URL(page.url()).searchParams.has('bucket'));
  await page.goBack();await page.getByRole('dialog').waitFor({state:'hidden'});await opener.waitFor();
  phase=engine.name()+' Calendar';requests.length=0;await page.goto(app+'/placement-tests?view=calendar&date='+day);await page.getByTestId('calendar-event').first().waitFor();await page.waitForLoadState('networkidle');
  assert(!requests.some(r=>/\/(students|groups|placement_tests)$/.test(r.path)),'calendar rendering has no eager table populations');
  assert.equal(await page.getByTestId('calendar-event').count(),100);await page.getByText('D’autres rendez-vous restent à charger. Cette page ne couvre pas toute la période.',{exact:true}).waitFor();
  const keys=await page.getByTestId('calendar-event').evaluateAll(ns=>ns.map(n=>n.dataset.eventKey));assert.equal(new Set(keys).size,keys.length);
  await page.getByText('Heure non précisée',{exact:true}).waitFor();assert(await page.getByTestId('calendar-event').filter({hasText:'Libellé examinateur'}).count());
  assert(keys.includes('placement:'+detail(closed).next_placement.id),'closed still-planned test visible');
  assert(!keys.includes('placement:'+completed));await page.getByLabel('Inclure les tests terminés').click();await page.waitForURL(url=>url.searchParams.get('completed')==='1');assert(await page.getByLabel('Inclure les tests terminés').isChecked());await page.locator(`[data-event-key="placement:${completed}"]`).waitFor();await page.getByLabel('Inclure les tests terminés').click();await page.waitForURL(url=>!url.searchParams.has('completed'));assert(!(await page.getByLabel('Inclure les tests terminés').isChecked()));await page.locator(`[data-event-key="placement:${completed}"]`).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Suivants',exact:true}).click();await page.waitForFunction(first=>document.querySelector('[data-testid=calendar-event]')?.dataset.eventKey!==first,keys[0]);assert(await page.getByTestId('calendar-event').count()<100);
  await page.getByRole('button',{name:'Précédents',exact:true}).click();await page.locator(`[data-event-key="placement:${legacy}"]`).waitFor();
  const legacyButton=page.locator(`[data-event-key="placement:${legacy}"]`);await legacyButton.click();await dialog().getByRole('heading',{name:'Modifier le test',exact:true}).waitFor();assert.equal(await dialog().getByLabel('Heure',{exact:true}).inputValue(),'');
  assert(requests.filter(r=>r.path==='/rest/v1/students'||r.path==='/rest/v1/groups').every(r=>{const u=new URL(r.url);return u.searchParams.has('id')||Number(u.searchParams.get('limit'))<=26&&u.searchParams.has('limit');}),'modal option reads are bounded');await dialog().getByRole('button',{name:'Annuler',exact:true}).click();
  const linkedButton=page.locator(`[data-event-key="placement:${detail(closed).next_placement.id}"]`);await linkedButton.click();await dialog().getByText('Historique',{exact:true}).waitFor();await dialog().getByText('Perdu',{exact:true}).first().waitFor();
  await page.goBack();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(new URL(page.url()).searchParams.get('view'),'calendar');assert.equal(new URL(page.url()).searchParams.get('date'),day);
  for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:720,height:450}]) {
   phase=engine.name()+' viewport '+viewport.width;await page.setViewportSize(viewport);await page.waitForLoadState('networkidle');
   for(const route of ['/crm/today?bucket=overdue','/placement-tests?view=calendar&date='+day]) {
    await page.goto(app+route);await page.waitForLoadState('networkidle');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no body overflow');
    await page.screenshot({path:join(tmpdir(),`o3-work-${engine.name()}-${viewport.width}-${route.startsWith('/crm')?'tasks':'calendar'}-overview.png`)});
    const button=route.startsWith('/crm')?page.getByTestId('work-row').first().getByRole('button',{name:'Voir le prospect'}):page.locator(`[data-event-key="placement:${detail(closed).next_placement.id}"]`);
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
  await page.getByText('Aucune tâche dans cette échéance.',{exact:true}).waitFor();
  // Real query interval; the server still owns all scheduling and bucket logic.
  await page.goto(app+'/crm/today?bucket=overdue');await page.waitForLoadState('networkidle');
  const minuteRead=page.waitForResponse(r=>r.url().endsWith('/rpc/crm_get_work_queue')&&r.ok());
  await page.clock.fastForward(61000);await minuteRead;
  const focusRead=page.waitForResponse(r=>r.url().endsWith('/rpc/crm_get_work_queue')&&r.ok());
  await page.clock.fastForward(16000);await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));await focusRead;
  await page.waitForLoadState('networkidle');await Promise.allSettled([...payloadReads]);assert.deepEqual(errors,[]);await ctx.close();await browser.close();browser=null;console.log(`PASS ${engine.name()} task types/pages/AND filters/exact-task stale guards/Calendar/legacy/Back/responsive/reduced motion`);
 }
 assert.deepEqual(external,[],'no external browser/provider requests');
 assert(!requests.some(r=>r.path.endsWith('/rpc/crm_get_lead_detail')||r.path.endsWith('/rpc/crm_get_submission_attribution')));
 for(const payload of workPayloads)for(const row of payload.rows){assert.deepEqual(Object.keys(row).sort(),['assigned_to','assignee_name','attempt_ordinal','due_at','id','lead','lead_id','scheduled_end_at','task_type','version']);assert(!JSON.stringify(row).includes('conversion_review_required'));}
 for(const payload of eventPayloads)for(const row of payload.rows)assert.deepEqual(Object.keys(row).sort(),['assigned_to','assignee_name','display_name','ends_at','examiner_label','id','kind','lead_id','local_date','local_time','placement_status','stage','starts_at','student_id','task_type','task_version','updated_at']);
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
 alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submission_attribution enable trigger crm_attribution_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});drop index public.o3_test_cleanup_activity_task,public.o3_test_cleanup_activity_prior,public.o3_test_cleanup_task_source,public.o3_test_cleanup_task_completion,public.o3_test_cleanup_task_prior,public.o3_test_cleanup_lead_conversion;commit;`);}
 assert.equal(sql("select count(*) from pg_indexes where schemaname='public' and indexname like 'o3_test_cleanup_%'"),'0');
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0');
 console.log('PASS synthetic browser fixtures removed; history guards restored; no teardown indexes retained');
}
