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
const run='o3-browser-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
let browser,actor;const pageErrors=[];
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
async function closeDrawer(){await page.getByRole('button',{name:'Fermer',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('lead'));await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForLoadState('networkidle');}
async function fillTask(){await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).fill(future);}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.waitForTimeout(500);await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));}
try {
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean local policy baseline');
 for(const role of ['director','receptionist']) {
  const email=`${run}-${role}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name=${quote('O3 synthetic '+role)} where id='${user.id}'`);
 }
 actor=users[1].id;const hours=Object.fromEntries([1,2,3,4,5,6,7].map(i=>[i,[['09:00','20:00']]]));rpc('create_followup_policy',{weekly_hours:hours},users[0].id);
 const leads=[];for(let i=0;i<32;i++)leads.push(intake('O3 parent '+i+(i===30 ? ' · '+'NomTrèsLong'.repeat(14) : '')));
 act('close_lost',leads[0],{reason:'price'});act('close_not_qualified',leads[1],{reason:'outside_scope'});
 act('record_conversation',leads[2],{channel:'in_person',note:'Real synthetic discussion',next_task:next()});
 act('qualify_lead',leads[3],{conversation_channel:'whatsapp',note:'Real synthetic project',qualification_step:'center_visit',next_task:next('center_visit')});
 sql(`update public.crm_leads set conversion_review_required=true where id='${leads[3]}'`);
 const failures=[],external=[],requests=[],acquisitions=[];
 for(const engine of (process.argv.includes('--performance-only') ? [] : [chromium,webkit])) {
  browser=await engine.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await ctx.route(url=>!['localhost','127.0.0.1'].includes(url.hostname),route=>{external.push(new URL(route.request().url()).hostname);return route.abort();});
  page=await ctx.newPage();page.on('response',async r=>{if(r.url().endsWith('/rpc/crm_get_operational_acquisition_summary') && r.ok())acquisitions.push(await r.json());});page.on('pageerror',e=>{failures.push(e.message);console.error('BROWSER_ERROR',engine.name(),phase,new URL(page.url()).pathname+new URL(page.url()).search.replace(/lead=[^&]+/g,'lead=synthetic'),e.name,e.message);});page.on('requestfailed',r=>{if(r.url().includes('/rest/v1/rpc/')){const data=r.postDataJSON();console.error('RPC_FAILED',engine.name(),new URL(r.url()).pathname,r.failure()?.errorText,{view:data?.p_view,layout:data?.p_layout,stage:data?.p_stage});}});page.on('request',r=>{if(r.url().includes('/rest/v1/rpc/'))requests.push(r.url().split('/').at(-1));});page.setDefaultTimeout(60000);await login(users[1]);
  await page.getByRole('heading',{name:'Pipeline admissions'}).waitFor();await page.getByTestId('opportunity-card').first().waitFor();
  assert.equal(await page.locator('[aria-label="Tableau des opportunités, défilement horizontal"] > section').count(),5);
  assert(await page.getByRole('button',{name:'Clôturés : 2'}).count());assert.equal(await page.getByTestId('opportunity-card').count(),27);
  const initialIds=await page.getByTestId('opportunity-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.leadId));assert.equal(new Set(initialIds).size,initialIds.length);
  // Drag proposes a command, leaves server stage unchanged, and cancel writes nothing.
  if(engine===chromium) {
   const card=page.getByTestId('opportunity-card').filter({hasText:'O3 parent 31'});const before=sql(`select count(*) from public.crm_activities where lead_id='${leads[31]}'`);
   await card.dragTo(page.getByRole('region',{name:'À contacter'}));await dialog().getByRole('heading',{name:'Enregistrer le résultat de l’appel'}).waitFor();assert.equal(await dialog().getByLabel('Résultat de l’appel').inputValue(),'');
   assert.equal(detail(leads[31]).status,'NEW');await dialog().getByRole('button',{name:'Annuler',exact:true}).click();await closeDrawer();assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${leads[31]}'`),before);
  }
  await page.getByRole('button',{name:'Liste',exact:true}).click();await page.getByTestId('opportunity-row').first().waitFor();assert.equal(await page.getByTestId('opportunity-row').count(),25);
  await page.getByText('Plus de filtres',{exact:false}).click();await page.getByRole('combobox',{name:'Statut',exact:true}).selectOption('NEW');await page.waitForURL(url=>url.searchParams.get('stage')==='NEW');await page.getByText('28 prospects correspondants',{exact:true}).waitFor();await page.getByRole('combobox',{name:'Statut',exact:true}).selectOption('');await page.waitForURL(url=>!url.searchParams.has('stage'));await page.getByText('32 prospects correspondants',{exact:true}).waitFor();
  const firstIds=await page.getByTestId('opportunity-row').evaluateAll(nodes=>nodes.map(n=>n.textContent));await page.getByRole('button',{name:'Suivant',exact:true}).last().click();await page.getByTestId('opportunity-row').filter({hasText:'O3 parent 0'}).waitFor();assert.equal(await page.getByTestId('opportunity-row').count(),7);
  await page.getByRole('button',{name:'Mes prospects',exact:true}).click();await page.getByText('Aucun prospect correspondant à cette vue et ces filtres.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Clôturés',exact:true}).click();await page.getByTestId('opportunity-row').first().waitFor();assert.equal(await page.getByTestId('opportunity-row').count(),2);assert(await page.getByRole('button',{name:'Tableau',exact:true}).isDisabled());
  await page.getByRole('button',{name:'Tous les prospects',exact:true}).click();await page.getByRole('button',{name:'Tableau',exact:true}).click();await page.getByTestId('opportunity-card').first().waitFor();
  const search=page.getByRole('searchbox',{name:'Rechercher un prospect'});await search.pressSequentially('O3 parent 31',{delay:25});await page.waitForURL(url=>url.searchParams.get('q')==='O3 parent 31');await page.getByTestId('opportunity-card').filter({hasText:'O3 parent 31'}).waitFor();assert.equal(await search.inputValue(),'O3 parent 31');await search.fill('');await page.waitForURL(url=>!url.searchParams.has('q'));await page.getByTestId('opportunity-card').filter({hasText:'O3 parent 3'}).first().waitFor();
  phase='rapid programme/search composition';
  sql(`update public.crm_leads set program_interest_text='Programme Anglais annuel',owner_id='${users[0].id}' where id='${leads[0]}';`);
  const facet=JSON.stringify({kind:'interest',value:'Programme Anglais annuel'});
  const contactId=detail(leads[0]).contact_id;
  sql(`update public.crm_contacts set display_name='TEST CRM' where id='${contactId}'`);
  const starting=new URLSearchParams({view:'closed',layout:'list',stage:'LOST',owner:users[0].id,channel:'manual',source:JSON.stringify({kind:'manual',value:'Manuel · Téléphone'}),contact:contactId});
  for(const reverse of [false,true]) {
   await page.goto(app+'/crm/leads?'+starting);await page.getByTestId('opportunity-row').first().waitFor();await page.waitForLoadState('networkidle');
   const search=page.getByRole('searchbox',{name:'Rechercher un prospect',exact:true}),programme=page.getByLabel('Programme',{exact:true});
   const response=page.waitForResponse(r=>r.url().endsWith('/rpc/crm_get_opportunities')&&r.ok()&&r.request().postDataJSON()?.p_query==='TEST CRM'&&r.request().postDataJSON()?.p_program==='Programme Anglais annuel');
   if(reverse) {await search.fill('TEST CRM');await programme.selectOption(facet);}
   else {await programme.selectOption(facet);await search.fill('TEST CRM');}
   const payload=(await response).request().postDataJSON();
   await page.getByTestId('opportunity-row').first().getByRole('button').first().click();
   const url=new URL(page.url());
   for(const [key,value] of starting)assert.equal(url.searchParams.get(key),value,'retained '+key);
   assert.equal(url.searchParams.get('program'),facet);assert.equal(url.searchParams.get('q'),'TEST CRM');assert.equal(url.searchParams.get('lead'),leads[0]);
   assert.equal(payload.p_view,'closed');assert.equal(payload.p_program_kind,'interest');assert.equal(payload.p_program,'Programme Anglais annuel');assert.equal(payload.p_stage,'LOST');assert.equal(payload.p_contact,contactId);assert.equal(payload.p_source_label,'Manuel · Téléphone');assert.equal(payload.p_owner_mode,'staff');assert.equal(payload.p_owner,users[0].id);assert.equal(payload.p_channel,'manual');assert.equal(payload.p_layout,'list');
   await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();await closeDrawer();
   assert.equal(await programme.inputValue(),facet);assert.equal(await search.inputValue(),'TEST CRM');
  }
  sql(`update public.crm_contacts set display_name='O3 parent 0' where id='${contactId}';update public.crm_leads set owner_id=null,program_interest_text=null where id='${leads[0]}'`);
  await page.goto(app+'/crm/leads');await page.getByTestId('opportunity-card').first().waitFor();
  console.log('PASS programme → immediate search and reverse; actual URL/RPC preserve filters, stage/contact and drawer');
  // Keyboard opening, contextual acquisition response, Back and focus return.
  phase='keyboard drawer';const button=page.locator(`[data-testid="opportunity-card"][data-lead-id="${leads[3]}"]`).getByRole('button').first();await button.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').getByText('Acquisition',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('lead'),leads[3]);
  await page.getByRole('dialog').getByText('Première demande',{exact:true}).waitFor();
  assert(acquisitions.length>0,'actual acquisition RPC response observed');for(const summary of acquisitions){assert.deepEqual(Object.keys(summary).sort(),['first_inquiry','latest_inquiry']);for(const inquiry of Object.values(summary))assert.deepEqual(Object.keys(inquiry).sort(),['channel','occurred_at','source_label']);}
  // UI network must only call the narrow summary, never broad detail/attribution.
  assert(!requests.includes('crm_get_lead_detail'));assert(!requests.includes('crm_get_submission_attribution'));
  await closeDrawer();await page.waitForURL(url=>!url.searchParams.has('lead'));await button.waitFor();await page.waitForFunction(id=>document.activeElement?.closest('[data-lead-id]')?.dataset.leadId===id,leads[3]);await page.goBack();await page.getByRole('dialog').getByText('Acquisition',{exact:true}).waitFor();await page.goForward();await page.getByRole('dialog').waitFor({state:'hidden'});assert(!new URL(page.url()).searchParams.has('lead'),'Forward restores the closed drawer URL');
  for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844}]) {
   phase='viewport '+viewport.width;
   if(await page.getByRole('dialog').count())await closeDrawer();
   await page.goto(app+'/crm/leads');await page.waitForLoadState('networkidle');
   await page.setViewportSize(viewport);await page.waitForTimeout(100);await page.waitForLoadState('networkidle');
   if(viewport.width===390) assert(await page.getByRole('button',{name:'Liste',exact:true}).getAttribute('aria-pressed')==='true');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no body overflow');
   await page.getByRole('button',{name:'Qualifiés',exact:true}).click();
   await page.locator(`[data-testid="opportunity-card"][data-lead-id="${leads[3]}"]`).getByRole('button').first().click();
   await page.getByRole('dialog').getByText('Acquisition',{exact:true}).waitFor();await page.waitForFunction(()=>{const box=document.querySelector('[role=dialog]')?.getBoundingClientRect();return box&&box.x>=-1&&box.right<=innerWidth+1;});const box=await page.getByRole('dialog').boundingBox();assert(box.x>=-1 && box.x+box.width<=viewport.width+1,JSON.stringify({viewport,box}));
   await page.waitForLoadState('networkidle');await page.screenshot({path:join(tmpdir(), `o3-${engine.name()}-${viewport.width}.png`),fullPage:false});
  }
  phase='200% viewport';await closeDrawer();await page.goto(app+'/crm/leads?layout=list');await page.waitForLoadState('networkidle');await page.setViewportSize({width:720,height:450});await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'Pipeline admissions'}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200% equivalent CSS viewport');
  assert.deepEqual(failures,[]);await ctx.close();await browser.close();browser=null;console.log(`PASS ${engine.name()} Board/List/Views, cursor bounds, keyboard/Back, acquisition endpoint, responsive/reduced motion`);
 }

 if (!process.argv.includes('--behavior-only')) {
 // Browser read/render budget against the same real 10k/50k fixture as SQL.
 let load=readFileSync('scripts/test-crm-opportunities.sql','utf8');load=load.slice(load.indexOf('begin;'),load.indexOf('do $$ declare r jsonb;'));
 load=load.replace('phone_e164) select id','phone_e164,created_by) select id').replace("lpad(i::text,8,'0') from parents","lpad(i::text,8,'0'),auth.uid() from parents");
 for(let i=1;i<=7;i++)users.push({id:'a3000000-0000-0000-0000-'+String(i).padStart(12,'0')});
 sql(load+'\ncommit;');
 browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900}});page=await ctx.newPage();page.on('request',r=>{const host=new URL(r.url()).hostname;if(!['localhost','127.0.0.1'].includes(host))external.push(host);});page.setDefaultTimeout(60000);await login(users[1]);await page.getByTestId('opportunity-card').first().waitFor();
 const started=performance.now();const responsePromise=page.waitForResponse(r=>r.url().endsWith('/rpc/crm_get_opportunities')&&r.ok());await page.reload({waitUntil:'domcontentloaded'});const readResponse=await responsePromise;const result=await readResponse.json();await page.getByTestId('opportunity-card').first().waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const elapsed=performance.now()-started;const timing=readResponse.request().timing();console.log('Board timing',JSON.stringify({rpc_ms:timing.responseEnd,readStart_ms:timing.startTime-performance.timeOrigin-started,navigation:await page.evaluate(()=>{const t=performance.getEntriesByType('navigation')[0];return {domContentLoaded:t.domContentLoadedEventEnd,load:t.loadEventEnd};})}));
 assert.equal(result.total,10032);assert(await page.getByTestId('opportunity-card').count()<=125);console.log(`O3 first Board RPC+render on 10k fixture: ${elapsed.toFixed(1)}ms`);assert(elapsed<=1000,'first Board <=1s');await ctx.close();
 }
 assert.deepEqual(external,[],'no browser external provider requests');console.log('PASS no browser Meta or broad technical detail requests');
} catch(error) {
 console.error(error.message);
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:join(tmpdir(), 'hills-phase4-failure.png'),fullPage:true});}
 throw error;
} finally {
 if(browser)await browser.close();
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
