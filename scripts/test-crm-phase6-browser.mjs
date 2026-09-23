// Local Auth + real UI + RPC regression. Synthetic fixtures are removed in finally.
// No Git subprocesses, production connections, external requests or real data copies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
const head=readFileSync('.git/HEAD','utf8').trim();assert.ok(head.startsWith('ref: refs/heads/codex/'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const normalStudents=[],normalTests=[];
const run='phase6-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
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
async function screenshot(options){await page.evaluate(async()=>{document.querySelectorAll('[role=dialog]').forEach(el=>{el.scrollTop=0;});await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot(options);}
async function save(){await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByText(/Action enregistrée\.|Nouveau prospect créé\./).waitFor();}
async function done(){await dialog().getByRole('button',{name:'Terminé',exact:true}).click();}
async function open(id){await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
async function more(label){await page.getByRole('button',{name:'Autres actions',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();}
async function fillTask(){await dialog().getByLabel('Date et heure · Casablanca',{exact:true}).fill(future);}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));}
try {
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean policy baseline required');
 for(const role of ['director','receptionist','admin']){
  const email=`${run}-${role}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{role:'director'}})});
  assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name=${quote('Accueil synthétique '+role)} where id='${user.id}'`);
 }
 actor=users[1].id;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.setDefaultTimeout(60000);await login(users[1]);
 const hours=Object.fromEntries([2,3,4,5,6].map(i=>[i,[['10:00','12:30'],['15:20','20:00']]]));hours[1]=[['15:00','20:00']];hours[7]=[];rpc('create_followup_policy',{weekly_hours:hours,attempt_offsets:[0,0,1,3,5]},users[0].id);
 const makeLead=(contact,learner)=>{const id=rpc('create_manual_lead',{display_name:contact,learner_name:learner,phone:'0612345678',source_label:'Manuel · Téléphone'}).lead.id;act('qualify_lead',id,{conversation_channel:'phone',note:'Le parent souhaite une inscription',qualification_step:'enrollment',next_task:next('enrollment_followup')});return id;};
 const lead=makeLead('Sara inscription CRM','Adam inscription CRM');
 const placement=rpc('book_placement_test',{lead_id:lead,expected_version:detail(lead).version,date_test:new Date(Date.now()+86400000).toISOString().slice(0,10),heure:'10:30'}).placement.id;
 sql(`begin;set local request.jwt.claim.sub='${actor}';set local role authenticated;update public.placement_tests set status='Résultat saisi',niveau_recommande='Child 2' where id='${placement}';commit;`);
 const counts=()=>JSON.parse(sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.charges),(select count(*) from public.receipts),(select count(*) from public.financial_events),(select count(*) from auth.users),(select count(*) from public.profiles))'));
 const before=counts();await open(lead);await page.getByRole('button',{name:"Commencer l'inscription",exact:true}).waitFor();await screenshot({path:'/private/tmp/hills-phase6-before.png',fullPage:false});
 await page.getByRole('button',{name:"Commencer l'inscription",exact:true}).click();await dialog().getByLabel('Nom de l’apprenant',{exact:true}).waitFor();assert.deepEqual(counts(),before,'opening dialog creates nothing');assert.equal(await dialog().getByLabel('Nom de l’apprenant',{exact:true}).inputValue(),'Adam inscription CRM');await screenshot({path:'/private/tmp/hills-phase6-dialog.png',fullPage:false});
 await dialog().getByRole('button',{name:'Créer un nouvel apprenant',exact:true}).click();
 const decision=dialog().getByLabel('J’ai vérifié les correspondances : il s’agit d’un autre apprenant.',{exact:true});if(await decision.count())await decision.check();
 await dialog().getByRole('button',{name:'Continuer',exact:true}).click();await expect(dialog().getByLabel('Niveau proposé',{exact:true})).toHaveValue('Child 2');assert.equal(await dialog().getByLabel('Démarrage',{exact:true}).locator('option[value="Confirmed"]').count(),0);await dialog().getByLabel('Année scolaire',{exact:true}).fill('2026/2027');await dialog().getByRole('button',{name:'Continuer',exact:true}).click();assert.deepEqual(counts(),before,'review step creates nothing');
 const requests=[];let drop=true;await page.route('**/rest/v1/rpc/crm_start_enrollment',async route=>{requests.push(route.request().postDataJSON());if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 await dialog().getByRole('button',{name:'Créer la pré-inscription',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'Impossible de confirmer'}).waitFor();await dialog().getByRole('button',{name:'Créer la pré-inscription',exact:true}).dblclick();await dialog().getByRole('button',{name:'Terminé',exact:true}).waitFor();assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);await page.unroute('**/rest/v1/rpc/crm_start_enrollment');await done();
 const after=counts();assert.deepEqual(after,[before[0]+1,before[1]+1,...before.slice(2)]);const linked=detail(lead);assert.equal(linked.status,'QUALIFIED');assert.equal(linked.enrollment.status,'Submitted');assert.equal(sql(`select status from public.students where id='${linked.enrollment.student_id}'`),'Prospect');assert.equal(sql(`select count(*) from public.crm_tasks where lead_id='${lead}' and task_type='enrollment_followup' and status='open'`),'1');await page.getByText('Pré-inscription créée · En attente',{exact:true}).waitFor();await screenshot({path:'/private/tmp/hills-phase6-submitted.png',fullPage:false});
 assert.equal(sql(`select student_id is null from public.placement_tests where id='${placement}'`),'t');console.log('PASS explicit enrollment, result prefill, no creation on opening/review, lost-response replay, no finance/auth writes, Submitted stays qualified');
 sql(`update public.crm_tasks set due_at=now()-interval '1 minute' where lead_id='${lead}' and task_type='enrollment_followup'`);await page.goto(app+'/crm/today');await page.getByText(/Finaliser l’inscription/).first().waitFor();
 // A legitimate admin center update is the trigger, never a CRM Converted button.
 sql(`begin;set local request.jwt.claim.sub='${users[2].id}';set local role authenticated;update public.enrollments set status='Confirmed' where id='${linked.enrollment.id}';commit;`);
 await open(lead);assert.equal(detail(lead).status,'CONVERTED');await page.getByRole('dialog').getByText('Converti',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Appel',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:"Commencer l'inscription",exact:true}).count(),0);await page.getByRole('link',{name:"Ouvrir l'apprenant",exact:true}).waitFor();await screenshot({path:'/private/tmp/hills-phase6-converted-drawer.png',fullPage:false});
 await page.getByRole('link',{name:"Ouvrir l'apprenant",exact:true}).click();await page.waitForURL('**/students/'+linked.enrollment.student_id);await page.getByRole('heading',{name:'Adam inscription CRM',exact:true}).waitFor();
 await page.goto(app+'/crm/today');await page.getByRole('heading',{name:'Aujourd’hui',exact:true}).waitFor();await expect(page.getByTestId('lead-row')).toHaveCount(0);
 await page.goto(app+'/crm/leads');await page.getByLabel('Statut',{exact:true}).selectOption('CONVERTED');await page.getByTestId('lead-row').filter({hasText:'Sara inscription CRM'}).waitFor();await screenshot({path:'/private/tmp/hills-phase6-converted.png',fullPage:false});
 await page.setViewportSize({width:390,height:844});await open(lead);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot({path:'/private/tmp/hills-phase6-mobile.png',fullPage:false});await page.setViewportSize({width:1440,height:1000});
 console.log('PASS trusted admin confirmation, converted search, sales actions/queue removed, safe student navigation and mobile');
 // Family candidates share a telephone; explicit selection is mandatory.
 const existing=randomUUID(),sibling=randomUUID(),enrollment=randomUUID();normalStudents.push(existing,sibling);
 sql(`insert into public.students(id,full_name,date_naissance,telephone,status,session_type) values('${existing}','Adam déjà inscrit','2014-05-10','0612345678','Prospect','Yearly'),('${sibling}','Lina même famille','2016-06-11','0612345678','Prospect','Yearly');insert into public.enrollments(id,student_id,session_type,school_year,status,level) values('${enrollment}','${existing}','Yearly','2026/2027','Confirmed','Child 2');`);
 const second=makeLead('Parent inscription existante','Adam déjà inscrit');await open(second);await page.getByRole('button',{name:"Commencer l'inscription",exact:true}).click();await dialog().getByRole('button',{name:'Utiliser cet apprenant',exact:true}).first().waitFor();assert.ok(await dialog().getByRole('button',{name:'Continuer',exact:true}).isDisabled());await dialog().getByText('Lina même famille',{exact:true}).waitFor();await screenshot({path:'/private/tmp/hills-phase6-candidate.png',fullPage:false});
 await dialog().getByText('Adam déjà inscrit',{exact:true}).locator('..').getByRole('button',{name:'Utiliser cet apprenant',exact:true}).click();await dialog().getByRole('button',{name:'Continuer',exact:true}).click();await dialog().getByRole('button',{name:'Rattacher cette inscription',exact:true}).click();await dialog().getByRole('button',{name:'Continuer',exact:true}).click();const existingCounts=counts();await dialog().getByRole('button',{name:'Rattacher cette inscription',exact:true}).click();await dialog().getByRole('button',{name:'Terminé',exact:true}).waitFor();assert.deepEqual(counts(),existingCounts);assert.equal(detail(second).status,'CONVERTED');assert.equal(detail(second).enrollment.id,enrollment);await done();
 assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${second}' and event_type='lead_converted'`),'1');console.log('PASS ambiguous sibling candidates require choice; existing confirmed enrollment links atomically without duplicates');
 // Downgrade remains converted, review indication is visible to a director.
 sql(`begin;set local request.jwt.claim.sub='${users[2].id}';update public.enrollments set status='Rejected' where id='${enrollment}';commit;`);await open(second);assert.equal(detail(second).status,'CONVERTED');assert.equal(await page.getByText(/Direction : cette conversion/).count(),0);
 await context.close();const directorContext=await browser.newContext({viewport:{width:1440,height:1000}});await directorContext.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());page=await directorContext.newPage();page.on('pageerror',e=>pageErrors.push(e.message));await login(users[0]);await open(second);await page.getByText(/Direction : cette conversion nécessite une vérification/).waitFor();assert.deepEqual(pageErrors,[]);
 await page.goto(`${app}/receipts/new?student_id=${linked.enrollment.student_id}`);
 await page.getByText('Apprenant sélectionné',{exact:true}).waitFor();
 await page.getByText('Session *',{exact:true}).locator('..').locator('select').selectOption('Yearly');
 await page.getByText('Année scolaire *',{exact:true}).locator('..').locator('select').selectOption('2026/2027');
 const receiptChoice=page.getByText('Inscription à rattacher',{exact:true}).locator('..').locator('select');await receiptChoice.waitFor();
 await expect(receiptChoice.locator(`option[value="${linked.enrollment.id}"]`)).toContainText('Inscription CRM');
 await expect(receiptChoice.locator('option[value="new"]')).toHaveJSProperty('disabled',true);
 await page.getByText(/Une inscription CRM existe pour ce programme et cette année/).waitFor();
 await receiptChoice.selectOption(linked.enrollment.id);await expect(receiptChoice).toHaveValue(linked.enrollment.id);
 await page.screenshot({path:'/private/tmp/hills-phase6-receipt-selection.png',fullPage:true});
 console.log('PASS receipt CRM marker, disabled implicit duplicate and explicit enrollment selection');
 assert.deepEqual(pageErrors,[]);await directorContext.close();
 console.log('PASS downgrade preserves conversion and director-visible review indication; no browser errors');
} catch(error) {
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4500));await screenshot({path:'/private/tmp/hills-phase6-failure.png',fullPage:true});}throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');const linkedStudents=JSON.parse(sql(`select coalesce(json_agg(student_id) filter(where student_id is not null),'[]') from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))`));const studentIds=[...new Set([...normalStudents,...linkedStudents])].map(quote).join(',')||'null';sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.placement_tests disable trigger crm_placement_integrity;alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_placements as(delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 delete from public.enrollments where student_id in(${studentIds});delete from public.students where id in(${studentIds});delete from auth.users where id in(${ids});delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
 console.log('PASS synthetic browser fixtures removed; history guards restored');
}
