// RCC-A2 local Auth + real UI acceptance. Synthetic fixtures are removed in finally.
// No Git mutations, production connections, external requests or real data copies.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { enrollmentSchoolYear } from '../src/lib/crm/enrollment.mjs';
assertLocalFeatureBranch();
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const run='rcc-a2-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[],fixtureStudents=[],fixtureGroups=[];
let browser,actor,page;const pageErrors=[];
const rpc=(name,data,id=actor,key=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(id)};set local role authenticated;select public.crm_${name}(${quote(key)},${quote(JSON.stringify(data))}::jsonb);commit;`));
const detail=id=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};select public.crm_get_workspace_detail('${id}');commit;`));
const act=(name,id,data={},who=actor)=>rpc(name,{lead_id:id,expected_version:detail(id).version,...data},who);
const next=(type='callback')=>({task_type:type,due_at:new Date(Date.now()+3*86400000).toISOString()});
const phone=()=>'06'+String(randomInt(10000000,99999999));
const rawLead=(contact,learner)=>rpc('create_manual_lead',{display_name:contact,learner_name:learner,phone:phone(),source_label:'Manuel · Téléphone'}).lead.id;
const makeLead=(contact,learner,step='placement_test',task='confirm_placement_test')=>{const id=rawLead(contact,learner);act('qualify_lead',id,{conversation_channel:'phone',note:'Projet confirmé',qualification_step:step,next_task:next(task)});return id;};
const student=(name,birth='2015-03-01')=>{const id=randomUUID();fixtureStudents.push(id);sql(`insert into public.students(id,full_name,date_naissance,telephone,status,session_type) values('${id}',${quote(name)},'${birth}',${quote(phone())},'Prospect','Yearly')`);return id;};
const newPayload=(lead,name)=>({lead_id:lead,expected_version:detail(lead).version,student_choice:'new',learner_name:name,candidate_review:sql(`select crm_security.candidate_token('${lead}',${quote(name)},null)`),session_type:'Yearly',school_year:enrollmentSchoolYear()});
const year=enrollmentSchoolYear();
const UNCERTAIN='Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.';
const DEFAULT_LINE='Suivi « Finaliser l’inscription » : demain, au prochain créneau d’appel autorisé.';
const dialog=()=>page.getByRole('dialog').last();
const button=name=>dialog().getByRole('button',{name,exact:true});
async function done(){await button('Terminé').click();}
async function open(id){await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
async function start(id){await open(id);await page.getByRole('button',{name:"Commencer l'inscription",exact:true}).click();await dialog().getByText('1 / 3 · Apprenant').waitFor();}
async function newLearner(){await button('Créer un nouvel apprenant').click();await button('Continuer').click();await dialog().getByText('2 / 3 · Inscription').waitFor();}
async function toReview(){await button('Continuer').click();await dialog().getByText('3 / 3 · Vérification').waitFor();}
async function noRaw(){const text=await page.locator('body').innerText();assert(!/crm_enrollment|SQLSTATE|\b22023\b|\b40001\b|\b42501\b|Invalid new learner|Qualified unlinked|Student unavailable|Enrollment (unavailable|group)|Valid future task|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text),'no raw server text, hint, SQLSTATE or identifier rendered');}
// Casablanca wall clock from the browser's own clock and tz data, which the dialog uses;
// Node and browser tz data may disagree on Morocco's offset.
const wall=(delta=0)=>page.evaluate(ms=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Date.now()+ms)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;},delta);
const focused=()=>page.evaluate(()=>({field:document.activeElement?.getAttribute('data-field'),id:document.activeElement?.id,invalid:document.activeElement?.getAttribute('aria-invalid')}));
const civil=task=>{const [d,t]=sql(`select to_char(due_at at time zone 'Africa/Casablanca','DD/MM/YYYY'),to_char(due_at at time zone 'Africa/Casablanca','HH24:MI') from public.crm_tasks where id='${task}'`).split('|');return `${d} à ${t}`;};
const startCalls=[];
function watch(target){target.on('request',request=>{if(request.url().endsWith('/rpc/crm_start_enrollment'))startCalls.push(request.postDataJSON());});}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.waitForTimeout(500);await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));}
async function newPage(context){await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.setDefaultTimeout(60000);watch(page);await login(users[1]);}
try {
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean policy baseline required');
 for(const role of ['director','receptionist','admin']){
  const email=`${run}-${role}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{role:'director'}})});
  assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name=${quote('Accueil synthétique '+role)} where id='${user.id}'`);
 }
 actor=users[1].id;
 browser=await chromium.launch({headless:true});let context=await browser.newContext({viewport:{width:1440,height:1000}});await newPage(context);
 const hours=Object.fromEntries([2,3,4,5,6].map(i=>[i,[['10:00','12:30'],['15:20','20:00']]]));hours[1]=[['15:00','20:00']];hours[7]=[];rpc('create_followup_policy',{weekly_hours:hours,attempt_offsets:[0,0,1,3,5]},users[0].id);

 // Browser birth bound, default-first follow-up and the created result.
 const lead1=makeLead('A2 parent principal','A2 Adam principal');await start(lead1);
 const birth=dialog().getByLabel('Date de naissance (si connue)',{exact:true});
 const today=(await wall()).slice(0,10),tomorrow=(await wall(86400000+60000)).slice(0,10);
 assert.equal(await birth.getAttribute('max'),today,'birth max is Casablanca today');
 await birth.fill(tomorrow);await dialog().getByText('La date de naissance ne peut pas être dans le futur.').first().waitFor();
 assert.equal(await birth.getAttribute('aria-invalid'),'true');assert.equal(await dialog().locator('#'+await birth.getAttribute('aria-describedby')).innerText(),'La date de naissance ne peut pas être dans le futur.');
 assert.ok(await button('Continuer').isDisabled(),'future birth blocks step 1');
 await birth.fill(today);assert.equal(await birth.getAttribute('aria-invalid'),null,'today is valid');await birth.fill('');
 await newLearner();
 await dialog().getByText(DEFAULT_LINE,{exact:true}).waitFor();assert.equal(await dialog().getByLabel('Prochain suivi · Casablanca',{exact:true}).count(),0,'no input by default');
 await button('Choisir une autre date').click();const due=dialog().getByLabel('Prochain suivi · Casablanca',{exact:true});
 assert.ok((await due.getAttribute('min'))<=await wall(60000),'follow-up min is Casablanca now');
 await due.fill(await wall(-86400000));await dialog().getByText('Cette date de suivi est passée. Choisissez une date future ou gardez le suivi par défaut.').first().waitFor();
 assert.equal(await due.getAttribute('aria-invalid'),'true');assert.ok(await button('Continuer').isDisabled(),'past follow-up blocked on change');
 await button('Garder la date par défaut').click();await dialog().getByText(DEFAULT_LINE,{exact:true}).waitFor();
 await toReview();await dialog().getByText(DEFAULT_LINE,{exact:true}).waitFor();
 startCalls.length=0;await button('Créer la pré-inscription').click();await dialog().getByText('Pré-inscription créée',{exact:true}).waitFor();
 const sent1=startCalls[0].p_data;assert(!('followup_at' in sent1),'default sends no follow-up');assert.equal(sent1.birth_date,null);assert.equal(sent1.learner_name,'A2 Adam principal');
 const saved1=detail(lead1);const task1=saved1.open_tasks.find(t=>t.task_type==='enrollment_followup');
 await dialog().getByText(`Suivi « Finaliser l’inscription » prévu le ${civil(task1.id)}.`,{exact:true}).waitFor();
 await dialog().getByText('Le prospect reste qualifié : l’inscription n’est pas encore confirmée. Elle reste à confirmer par le parcours habituel.',{exact:true}).waitFor();
 assert.equal(await dialog().getByRole('status').filter({hasText:'Pré-inscription créée'}).count(),1,'one in-dialog confirmation');assert.equal(await page.locator('[data-sonner-toast]').count(),0,'no additional toast');await noRaw();await done();
 const section=page.getByRole('dialog').locator('#crm-enrollment');
 await section.getByRole('link',{name:"Continuer l'inscription",exact:true}).waitFor();await section.getByText('Pré-inscription en attente de confirmation.',{exact:true}).waitFor();
 assert.equal(await section.getByRole('link',{name:"Ouvrir l'apprenant",exact:true}).count(),0,'exactly one action');assert.equal(await section.getByText(/Finaliser/).count(),0);
 assert.equal(saved1.status,'QUALIFIED');
 console.log('PASS birth bound, default follow-up presentation, created result with server civil time, Continuer in the drawer');

 // Continuer lands on the learner file with the CRM-linked enrollment focused; Retour returns.
 await section.getByRole('link',{name:"Continuer l'inscription",exact:true}).click();
 await page.waitForURL(url=>url.pathname===`/students/${saved1.enrollment.student_id}`&&url.searchParams.get('enrollment')===saved1.enrollment.id);
 await page.getByText('Inscription liée au prospect CRM',{exact:true}).waitFor();
 await page.waitForFunction(id=>document.activeElement?.id===`enrollment-${id}`,saved1.enrollment.id);
 await page.getByRole('button',{name:'Nouvelle pré-inscription',exact:true}).waitFor();
 assert.equal(await page.getByText('Inscription liée au prospect CRM').count(),1);
 await page.screenshot({path:join(tmpdir(),'hills-rcc-a2-continue.png'),fullPage:false});
 await page.getByRole('button',{name:'Retour',exact:true}).click();await page.waitForURL(url=>url.pathname==='/crm/leads'&&url.searchParams.get('lead')===lead1);
 await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 for(const param of [randomUUID(),'not-a-uuid']){await page.goto(`${app}/students/${saved1.enrollment.student_id}?enrollment=${param}`);await page.getByRole('heading',{name:'A2 Adam principal',exact:true}).waitFor();await page.getByRole('button',{name:'Nouvelle pré-inscription',exact:true}).waitFor();assert.equal(await page.getByText('Inscription liée au prospect CRM').count(),0);}
 console.log('PASS Continuer highlight/focus after async load, Retour to CRM, unknown parameter behaves as today, Nouvelle pré-inscription unchanged');

 // Linked learner without lead identity data: preselected, no candidates, no new learner.
 const linkedStudent=student('A2 Lina rattachée','2016-02-03');const lead2=makeLead('A2 parent rattaché','A2 temporaire');
 sql(`update public.crm_leads set student_id='${linkedStudent}',learner_name=null,learner_birth_date=null where id='${lead2}'`);
 const candidateCalls=[];page.on('request',request=>{if(request.url().endsWith('/rpc/crm_find_student_candidates'))candidateCalls.push(1);});
 const studentsBefore=sql('select count(*) from public.students');
 await start(lead2);await dialog().getByText('Apprenant rattaché à ce prospect : A2 Lina rattachée · 2016-02-03',{exact:true}).waitFor();
 await dialog().getByText('Ce prospect est déjà rattaché à cet apprenant ; l’inscription sera créée pour lui. Pour changer d’apprenant, contactez la direction.',{exact:true}).waitFor();
 assert.equal(await button('Créer un nouvel apprenant').count(),0);assert.equal(await dialog().getByLabel('Nom de l’apprenant',{exact:true}).count(),0);
 await button('Continuer').click();await dialog().getByText('2 / 3 · Inscription').waitFor();await dialog().getByText('A2 Lina rattachée',{exact:true}).first().waitFor();await toReview();
 startCalls.length=0;await button('Créer la pré-inscription').click();await dialog().getByText('Pré-inscription créée',{exact:true}).waitFor();
 const sent2=startCalls[0].p_data;assert.equal(sent2.student_choice,'existing');assert.equal(sent2.student_id,linkedStudent);
 for(const key of ['learner_name','birth_date','candidate_review','confirm_new'])assert(!(key in sent2),`linked payload omits ${key}`);
 assert.equal(candidateCalls.length,0,'no candidate query on the linked path');assert.equal(sql('select count(*) from public.students'),studentsBefore,'no learner created');
 await dialog().getByText(/^A2 Lina rattachée · Programme annuel/).waitFor();await done();assert.equal(detail(lead2).enrollment.student_id,linkedStudent);
 console.log('PASS linked learner preselected without lead name/birth, payload omits learner_name/birth_date, no candidate query, no new learner');

 // Existing enrollment follow-up: shown, kept, never sent.
 const lead3=makeLead('A2 parent suivi','A2 Nora suivi','enrollment','enrollment_followup');const kept=detail(lead3).open_tasks.find(t=>t.task_type==='enrollment_followup');
 await start(lead3);await newLearner();
 await dialog().getByText(`Un suivi d’inscription est déjà prévu le ${civil(kept.id)}. Il est conservé.`,{exact:true}).waitFor();
 assert.equal(await button('Choisir une autre date').count(),0);assert.equal(await dialog().getByLabel('Prochain suivi · Casablanca',{exact:true}).count(),0);
 await toReview();startCalls.length=0;await button('Créer la pré-inscription').click();
 await dialog().getByText(`Le suivi d’inscription déjà prévu est conservé : ${civil(kept.id)}.`,{exact:true}).waitFor();assert(!('followup_at' in startCalls[0].p_data));await done();
 console.log('PASS existing enrollment follow-up shown, kept and reported; no follow-up value sent');

 // Server field reason: the group changed meanwhile; step 2, Groupe focused and invalid.
 const group=randomUUID();fixtureGroups.push(group);sql(`insert into public.groups(id,name,session_type,niveau) values('${group}','A2 groupe enfants','Yearly','Child 2')`);
 const lead4=makeLead('A2 parent groupe','A2 Yanis groupe');await start(lead4);await newLearner();
 await dialog().getByLabel('Niveau proposé',{exact:true}).selectOption('Child 2');await dialog().getByLabel('Groupe',{exact:true}).selectOption(group);await toReview();
 sql(`update public.groups set niveau='Child 3' where id='${group}'`);const before4=sql('select count(*) from public.students');
 await button('Créer la pré-inscription').click();await dialog().getByText('2 / 3 · Inscription').waitFor();
 await dialog().getByRole('alert').filter({hasText:'Le groupe choisi ne correspond plus au programme ou au niveau. Choisissez un autre groupe.'}).waitFor();
 assert.deepEqual(await focused(),{field:'group',id:await dialog().getByLabel('Groupe',{exact:true}).getAttribute('id'),invalid:'true'},'Groupe focused and invalid');
 assert.equal(sql('select count(*) from public.students'),before4);await noRaw();await button('Annuler').click();
 console.log('PASS server reason navigates to its step and field with aria-invalid and focus; nothing saved');

 // Race: another actor completes the enrollment first; the panel never claims creation.
 const lead5=makeLead('A2 parent course','A2 Ines course');await start(lead5);await newLearner();await toReview();
 rpc('start_enrollment',newPayload(lead5,'A2 Ines course'),users[2].id);
 await button('Créer la pré-inscription').click();await dialog().getByText('Inscription déjà rattachée',{exact:true}).waitFor();
 await dialog().getByText('Une inscription a été rattachée à ce prospect entre-temps. Vérifiez-la avant de poursuivre.',{exact:true}).waitFor();
 assert.equal(await dialog().getByText(/Pré-inscription créée$|Essai démarré/).count(),0,'no creation wording');
 assert.equal(sql(`select count(*) from public.students where full_name='A2 Ines course'`),'1','exactly one learner');await noRaw();await done();
 console.log('PASS discovered race result is never presented as this request’s creation');

 // Race: the opportunity is linked to a learner while the dialog submits a new learner.
 const lead6=makeLead('A2 parent lien','A2 Omar lien');await start(lead6);await newLearner();await toReview();
 const raced=student('A2 Omar déjà rattaché');sql(`update public.crm_leads set student_id='${raced}' where id='${lead6}'`);
 await button('Créer la pré-inscription').click();await dialog().getByText('Apprenant rattaché à ce prospect : A2 Omar déjà rattaché · 2015-03-01',{exact:true}).waitFor();
 await dialog().getByRole('alert').filter({hasText:'Ce prospect est déjà rattaché à un apprenant. L’inscription doit être créée pour cet apprenant.'}).waitFor();
 assert.equal(sql(`select count(*) from public.students where full_name='A2 Omar lien'`),'0','no duplicate learner');
 await button('Continuer').click();await toReview();await button('Créer la pré-inscription').click();await dialog().getByText('Pré-inscription créée',{exact:true}).waitFor();await done();
 assert.equal(detail(lead6).enrollment.student_id,raced);
 console.log('PASS linkage race moves the dialog to the linked learner; exactly that learner enrolled');

 // Linked elsewhere: explained before submit, no dead end.
 const twice=student('A2 Sami double');const twiceEnrollment=randomUUID();sql(`insert into public.enrollments(id,student_id,session_type,school_year,status) values('${twiceEnrollment}','${twice}','Yearly','${year}','Submitted')`);
 const owner=makeLead('A2 parent premier','A2 Sami premier');rpc('start_enrollment',{lead_id:owner,expected_version:detail(owner).version,student_choice:'existing',student_id:twice,session_type:'Yearly',school_year:year,enrollment_id:twiceEnrollment,expected_enrollment_updated_at:sql(`select to_json(updated_at) from public.enrollments where id='${twiceEnrollment}'`).replaceAll('"','')});
 const lead7=makeLead('A2 parent second','A2 Sami double');await start(lead7);
 await dialog().getByText('A2 Sami double',{exact:true}).locator('..').getByRole('button',{name:'Utiliser cet apprenant',exact:true}).click();await button('Continuer').click();
 await dialog().getByText('Cet apprenant a déjà une inscription pour ce programme et cette année, rattachée à un autre prospect. Choisissez un autre programme ou une autre année, ou clôturez ce prospect comme doublon.',{exact:true}).waitFor();
 assert.equal(await dialog().getByText('Choisissez l’inscription existante pour éviter un doublon.').count(),0);assert.ok(await button('Continuer').isDisabled());await button('Annuler').click();
 console.log('PASS linked-elsewhere explanation replaces the dead-end selection prompt');

 // Uncertain transport failure, hinted and hint-less definite rejections (stubbed).
 const lead8=makeLead('A2 parent erreurs','A2 Rania erreurs');await start(lead8);await newLearner();await toReview();
 const responses=[{status:502,contentType:'text/plain',body:'Bad Gateway'},{status:400,contentType:'application/json',body:JSON.stringify({code:'22023',message:'Invalid new learner',details:null,hint:'crm_enrollment.birth_date_future'})},
  {status:400,contentType:'application/json',body:JSON.stringify({code:'22023',message:'Invalid new learner',details:null,hint:null})}];
 await page.route('**/rest/v1/rpc/crm_start_enrollment',route=>route.fulfill(responses.shift()));startCalls.length=0;
 await button('Créer la pré-inscription').click();await dialog().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
 assert.equal(await dialog().getByText(/rien n’a été enregistré/).count(),0,'uncertain never says nothing was saved');await noRaw();
 await button('Créer la pré-inscription').click();await dialog().getByText('1 / 3 · Apprenant').waitFor();
 assert.deepEqual(startCalls[1],startCalls[0],'uncertain retry resends the identical request with the same key');
 await dialog().getByRole('alert').filter({hasText:'La date de naissance ne peut pas être dans le futur.'}).waitFor();
 const birth8=dialog().getByLabel('Date de naissance (si connue)',{exact:true});assert.equal((await focused()).field,'birth');assert.equal(await birth8.getAttribute('aria-invalid'),'true');
 await button('Continuer').click();await dialog().getByText('2 / 3 · Inscription').waitFor();await toReview();await button('Créer la pré-inscription').click();
 await dialog().getByRole('alert').filter({hasText:'L’inscription n’a pas pu être créée et rien n’a été enregistré. Réessayez ; si le problème persiste, contactez la direction.'}).waitFor();
 assert.notEqual(startCalls[2].p_request_key,startCalls[1].p_request_key,'a definite 22023 discards the key');await noRaw();
 await page.unroute('**/rest/v1/rpc/crm_start_enrollment');
 await dialog().getByText('2 / 3 · Inscription').waitFor();await toReview();// hint-less 22023 keeps today's step 2
 await button('Créer la pré-inscription').click();await dialog().getByText('Pré-inscription créée',{exact:true}).waitFor();await done();
 assert.equal(sql(`select count(*) from public.students where full_name='A2 Rania erreurs'`),'1');
 console.log('PASS uncertain 5xx keeps key/payload and never says nothing saved; hinted reason focuses its field; hint-less definite uses the safe fallback');

 // Contextual actions, spot checks across reopened, closed, refused and post-confirmation changes.
 const sectionText=async id=>{await open(id);return page.getByRole('dialog').locator('#crm-enrollment').innerText();};
 const fresh=rawLead('A2 parent nouveau','A2 Lea nouveau');let text=await sectionText(fresh);
 assert.match(text,/Qualifiez le projet avant de commencer une inscription\./);assert.equal(await page.getByRole('button',{name:"Commencer l'inscription"}).count(),0);
 const started=name=>{const id=makeLead('A2 parent '+name,'A2 '+name);rpc('start_enrollment',newPayload(id,'A2 '+name));return id;};
 const closed=started('Lou clos');act('close_lost',closed,{reason:'not_interested'});text=await sectionText(closed);
 assert.match(text,/Prospect clôturé : l’inscription reste visible/);assert.doesNotMatch(text,/Continuer l'inscription/);
 act('reopen_lead',closed,{reason:'Le parent rappelle',next_task:next()});const reopened=detail(closed).status;assert(['NEW','CONTACTING','ENGAGED'].includes(reopened),reopened);
 text=await sectionText(closed);assert.match(text,/Ce prospect a été rouvert\. Qualifiez-le à nouveau pour poursuivre l’inscription\./);assert.match(text,/Ouvrir l'apprenant/);assert.doesNotMatch(text,/Continuer l'inscription|Finaliser/);
 const refused=started('Zoe refusée');sql(`begin;set local request.jwt.claim.sub='${users[2].id}';update public.enrollments set status='Rejected' where id='${detail(refused).enrollment.id}';commit;`);
 text=await sectionText(refused);assert.match(text,/Inscription refusée\. Ce prospect reste rattaché à cette inscription/);assert.doesNotMatch(text,/Finaliser|Continuer l'inscription/);
 const changed=started('Adel changé');const changedEnrollment=detail(changed).enrollment.id;
 sql(`begin;set local request.jwt.claim.sub='${users[2].id}';update public.enrollments set status='Confirmed' where id='${changedEnrollment}';commit;`);
 text=await sectionText(changed);assert.match(text,/Ouvrir l'apprenant/);assert.doesNotMatch(text,/Cette inscription a changé/);
 sql(`begin;set local request.jwt.claim.sub='${users[2].id}';update public.enrollments set status='Submitted' where id='${changedEnrollment}';commit;`);
 assert.equal(detail(changed).status,'CONVERTED');assert.equal(sql(`select conversion_review_required from public.crm_leads where id='${changed}'`),'t','server flags director review');
 text=await sectionText(changed);assert.match(text,/Cette inscription a changé après sa confirmation\. Elle est signalée pour vérification par la direction\./);assert.doesNotMatch(text,/Continuer l'inscription|Finaliser/);
 console.log('PASS contextual actions: NEW, closed, reopened, refused and changed-after-confirmation states');
 assert.deepEqual(pageErrors,[]);await context.close();

 // Fixed browser clocks: a stale follow-up is blocked at submit; a lost response is
 // replayed with the same key after the chosen follow-up time has passed.
 context=await browser.newContext({viewport:{width:1440,height:1000}});await newPage(context);
 const lead10=makeLead('A2 parent horloge','A2 Hugo horloge');await start(lead10);await newLearner();
 await button('Choisir une autre date').click();const stale=await wall(3*60000);await dialog().getByLabel('Prochain suivi · Casablanca',{exact:true}).fill(stale);await toReview();
 await page.clock.setFixedTime(new Date(Date.now()+10*60000));startCalls.length=0;
 await button('Créer la pré-inscription').click();await dialog().getByText('2 / 3 · Inscription').waitFor();
 await dialog().getByRole('alert').filter({hasText:'Cette date de suivi est passée. Choisissez une date future ou gardez le suivi par défaut.'}).waitFor();
 assert.equal(startCalls.length,0,'nothing sent');assert.equal((await focused()).field,'due');assert.equal(await dialog().getByLabel('Prochain suivi · Casablanca',{exact:true}).inputValue(),stale,'not moved automatically');
 await button('Garder la date par défaut').click();await toReview();await button('Créer la pré-inscription').click();await dialog().getByText('Pré-inscription créée',{exact:true}).waitFor();await done();
 console.log('PASS a follow-up that became past while the dialog was open returns to step 2 unchanged');
 await page.clock.setFixedTime(new Date());
 const lead11=makeLead('A2 parent perte','A2 Maya perte');await start(lead11);await newLearner();
 await button('Choisir une autre date').click();await dialog().getByLabel('Prochain suivi · Casablanca',{exact:true}).fill(await wall(5*60000));await toReview();
 let drop=true;await page.route('**/rest/v1/rpc/crm_start_enrollment',async route=>{if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 startCalls.length=0;await button('Créer la pré-inscription').click();await dialog().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
 await page.clock.setFixedTime(new Date(Date.now()+10*60000));
 await button('Créer la pré-inscription').click();await dialog().getByText('Pré-inscription créée',{exact:true}).waitFor();
 assert.equal(startCalls.length,2);assert.deepEqual(startCalls[1],startCalls[0],'byte-identical same-key resend after the follow-up time passed');assert(startCalls[0].p_data.followup_at);
 await dialog().getByText(/^Suivi « Finaliser l’inscription » prévu le [0-9]{2}\/[0-9]{2}\/[0-9]{4} à [0-9]{2}:[0-9]{2}\.$/).waitFor();await page.unroute('**/rest/v1/rpc/crm_start_enrollment');
 const lost=detail(lead11);assert.equal(sql(`select count(*) from public.students where full_name='A2 Maya perte'`),'1');assert.equal(sql(`select count(*) from public.enrollments where student_id='${lost.enrollment.student_id}'`),'1');
 assert.equal(sql(`select count(*) from public.crm_tasks where lead_id='${lead11}' and task_type='enrollment_followup' and status='open'`),'1');
 assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead11}' and event_type='enrollment_started'`),'1');
 await done();assert.deepEqual(pageErrors,[]);
 console.log('PASS lost response replayed with the same key after the follow-up time passed; exactly one student, enrollment, follow-up and activity; no browser errors');
} catch(error) {
 console.error(error.message);
 if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-4500));await page.screenshot({path:join(tmpdir(),'hills-rcc-a2-failure.png'),fullPage:true});}throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');const linkedStudents=JSON.parse(sql(`select coalesce(json_agg(student_id) filter(where student_id is not null),'[]') from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))`));const studentIds=[...new Set([...fixtureStudents,...linkedStudents])].map(quote).join(',')||'null';const groupIds=fixtureGroups.map(quote).join(',')||'null';sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.placement_tests disable trigger crm_placement_integrity;alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_placements as(delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 delete from public.enrollments where student_id in(${studentIds});delete from public.students where id in(${studentIds});delete from public.groups where id in(${groupIds});alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
 console.log('PASS synthetic browser fixtures removed; history guards restored');
}
