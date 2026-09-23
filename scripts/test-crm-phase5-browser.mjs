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
const run='phase5-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
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
 const lead=rpc('create_manual_lead',{display_name:'Sara test CRM',learner_name:'Adam test CRM',phone:'0612345678',source_label:'Manuel · Téléphone'}).lead.id;
 act('qualify_lead',lead,{conversation_channel:'phone',note:'Le parent souhaite un test',qualification_step:'placement_test',next_task:next('confirm_placement_test')});
 const counts=()=>sql('select jsonb_build_array((select count(*) from public.students),(select count(*) from public.enrollments),(select count(*) from public.charges),(select count(*) from public.receipts))');
 const before=counts();await open(lead);await page.getByRole('button',{name:'Réserver un test',exact:true}).waitFor();await screenshot({path:'/private/tmp/hills-phase5-before.png',fullPage:false});
 await page.getByRole('button',{name:'Réserver un test',exact:true}).click();
 assert.equal(await dialog().getByRole('combobox').count(),0,'booking has no student/status/level selector');
 assert.equal(await dialog().getByLabel('Niveau recommandé').count(),0,'no fake booking result');
 const futureDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 await dialog().getByLabel('Date *',{exact:true}).fill(futureDate);await dialog().getByLabel('Heure',{exact:true}).fill('10:30');await dialog().getByLabel('Examinateur',{exact:true}).fill('Examinateur test');
 await screenshot({path:'/private/tmp/hills-phase5-booking.png',fullPage:false});
 const requests=[];let drop=true;
 await page.route('**/rest/v1/rpc/crm_book_placement_test',async route=>{requests.push(route.request().postDataJSON());if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'Impossible de confirmer'}).waitFor();
 await dialog().getByRole('button',{name:'Enregistrer',exact:true}).dblclick();await page.getByRole('button',{name:'Voir le test',exact:true}).waitFor();assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);await page.unroute('**/rest/v1/rpc/crm_book_placement_test');
 assert.equal(before,counts());assert.equal(detail(lead).status,'QUALIFIED');assert.equal(detail(lead).open_tasks.length,0);const pid=detail(lead).next_placement.id;assert.equal(detail(lead).next_placement.niveau_recommande,null);
 assert.equal(sql(`select count(*) from public.placement_tests where crm_lead_id='${lead}'`),'1');await screenshot({path:'/private/tmp/hills-phase5-scheduled.png',fullPage:false});
 console.log('PASS qualified booking, exact network replay/double-click, no fake A1, no student/enrollment/finance writes');
 await page.getByRole('button',{name:'Reprogrammer',exact:true}).click();
 const todayDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await dialog().getByLabel('Date *',{exact:true}).fill(todayDate);await dialog().getByLabel('Heure',{exact:true}).fill('23:59');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByRole('button',{name:'Voir le test',exact:true}).waitFor();
 assert.equal(detail(lead).next_placement.id,pid);assert.equal(detail(lead).next_placement.heure,'23:59');
 await page.goto(app+'/crm/today');await page.getByText('Test de niveau · Parent : Sara test CRM',{exact:true}).waitFor();assert.equal(await page.getByTestId('lead-row').count(),0,'scheduled appointment is not missing-next-action');await screenshot({path:'/private/tmp/hills-phase5-agenda.png',fullPage:true});
 console.log('PASS same-row reschedule and one appointment in Agenda, without a fake task or missing-action warning');
 await page.goto(app+'/placement-tests');const row=page.getByRole('row').filter({hasText:'Adam test CRM'});await row.getByText('Prospect CRM',{exact:true}).waitFor();await row.getByRole('button',{name:/Test du/}).click();
 await dialog().getByLabel('Statut',{exact:true}).selectOption('Résultat saisi');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();
 assert.equal(sql(`select status from public.placement_tests where id='${pid}'`),'Planifié','result requires explicit level');
 await dialog().getByLabel('Niveau recommandé',{exact:true}).selectOption('A2');await dialog().getByLabel('Score',{exact:true}).fill('72');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 assert.equal(before,counts());assert.equal(detail(lead).status,'QUALIFIED');assert.equal(detail(lead).open_tasks.length,1);assert.equal(detail(lead).next_task.task_type,'post_test_followup');
 await open(lead);await page.getByText('Niveau recommandé : A2',{exact:true}).first().waitFor();await screenshot({path:'/private/tmp/hills-phase5-result.png',fullPage:false});
 sql(`update public.crm_tasks set due_at=now()-interval '1 minute' where lead_id='${lead}' and task_type='post_test_followup'`);
 await page.goto(app+'/crm/today');await page.getByText('Résultat du test disponible',{exact:true}).waitFor();assert.equal(await page.getByTestId('lead-row').count(),1);await screenshot({path:'/private/tmp/hills-phase5-followup.png',fullPage:true});
 assert.doesNotMatch(await page.locator('body').innerText(),/placement_test_id|crm_lead_id|source_key|post_test_followup/);
 console.log('PASS existing placement page edits, explicit result, one followup, qualified lifecycle and humanized Today');
 await page.setViewportSize({width:390,height:844});await open(lead);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot({path:'/private/tmp/hills-phase5-mobile.png',fullPage:false});await context.close();
 // Existing admin result email behavior is intercepted locally; no message is sent.
 const adminContext=await browser.newContext({viewport:{width:1440,height:1000}});await adminContext.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());page=await adminContext.newPage();await login(users[2]);
 const sid=randomUUID();normalStudents.push(sid);sql(`insert into public.students(id,full_name,status,session_type,parent_email) values('${sid}','Normal placement test','Prospect','Other','parent@example.invalid')`);
 const normal=randomUUID();normalTests.push(normal);sql(`insert into public.placement_tests(id,student_id,student_name,date_test,niveau_recommande) values('${normal}','${sid}','Normal placement test',current_date,'A1')`);
 const emails=[];await page.route('**/api/email/send',async route=>{emails.push(route.request().postDataJSON());await route.fulfill({status:200,contentType:'application/json',body:'{"success":true,"id":"local-intercept"}'});});
 await page.goto(app+'/placement-tests');const normalRow=page.getByRole('row').filter({hasText:'Normal placement test'});await normalRow.getByRole('button',{name:/Test du/}).click();await dialog().getByLabel('Statut',{exact:true}).selectOption('Résultat saisi');await dialog().getByLabel('Niveau recommandé',{exact:true}).selectOption('A2');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal(emails.length,1);assert.match(emails[0].body,/Niveau recommandé : A2/);
 const crmRow=page.getByRole('row').filter({hasText:'Adam test CRM'});assert.equal(await crmRow.locator('svg.lucide-trash2').count(),0,'admin cannot see CRM delete control');
 await normalRow.getByRole('button',{name:/Test du/}).click();await dialog().getByLabel('Notes',{exact:true}).fill('Précision du résultat');await dialog().getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal(emails.length,1,'ordinary result edit does not resend email');
 await adminContext.close();assert.deepEqual(pageErrors,[]);console.log('PASS mobile, linked delete hidden for admin, and existing non-CRM result email behavior (intercepted, never sent)');
} catch(error) {
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4000));await screenshot({path:'/private/tmp/hills-phase5-failure.png',fullPage:true});}
 throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.placement_tests disable trigger crm_placement_integrity;alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_placements as(delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where actor_id in(${ids}) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 ${normalTests.length ? `delete from public.placement_tests where id in(${normalTests.map(quote).join(',')});` : ''}
 ${normalStudents.length ? `delete from public.students where id in(${normalStudents.map(quote).join(',')});` : ''}
 delete from auth.users where id in(${ids});delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
 console.log('PASS synthetic browser fixtures removed; history guards restored');
}
