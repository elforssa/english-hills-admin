// RCC-A2 local Auth + real UI acceptance of « Inscrire et encaisser » (EAP, migration 127).
// Synthetic fixtures (receipts and charges included) are removed in finally.
// No Git mutations, production connections, external requests or real data copies.
import assert from 'node:assert/strict';
import { CENTRE_UTC_OFFSET_MINUTES } from '../src/lib/centreClock.mjs';
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
// EAP (migration 127): the CRM enrollment is created only with its payment.
const PAYMENT={gross_amount:3000,discount_amount:0,payment_amount:1000,payment_method:'Espèces'};
const enroll=(enrollment,who=actor)=>rpc('enroll_and_collect',{enrollment,payment:PAYMENT},who);
// A desk payment (receipt form command) that confirms an enrollment of the learner.
const collect=(studentId,who=actor)=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(who)};set local role authenticated;select public.create_charge_payment(${quote(JSON.stringify({student_id:studentId,session_type:'Yearly',school_year:enrollmentSchoolYear(),...PAYMENT,idempotency_key:randomUUID()}))}::jsonb);commit;`));
// A retired-status row exists only as history; the journalled-revert flags let the fixture write one.
const legacy=(lead,studentId,status)=>{const id=randomUUID();sql(`begin;set local eh.membership_sync=on;set local eh.enrollment_command=on;insert into public.enrollments(id,student_id,session_type,school_year,status) values('${id}','${studentId}','Yearly','${enrollmentSchoolYear()}','${status}');update public.crm_leads set student_id='${studentId}',enrollment_id='${id}',version=version+1 where id='${lead}';commit;`);return id;};
const receipts=studentId=>sql(`select count(*) from public.receipts where student_id='${studentId}' and voided_at is null`);
const year=enrollmentSchoolYear();
const UNCERTAIN='Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.';
const PAYMENT_REQUIRED='L’inscription se confirme à l’encaissement : saisissez un paiement.';
const dialog=()=>page.getByRole('dialog').last();
const button=name=>dialog().getByRole('button',{name,exact:true});
async function done(){await button('Terminé').click();}
async function open(id){await page.goto(`${app}/crm/leads?lead=${id}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();}
async function start(id){await open(id);await page.getByRole('button',{name:'Inscrire et encaisser',exact:true}).click();await dialog().getByText('1 / 3 · Apprenant').waitFor();}
async function newLearner(){await button('Créer un nouvel apprenant').click();await button('Continuer').click();await dialog().getByText('2 / 3 · Inscription').waitFor();}
async function toPayment(){await button('Continuer').click();await dialog().getByText('3 / 3 · Paiement').waitFor();}
async function pay(paid='1000',gross='3000'){await dialog().getByLabel('Prix brut convenu',{exact:true}).fill(gross);await dialog().getByLabel('Montant payé aujourd’hui',{exact:true}).fill(paid);}
async function noRaw(){const text=await page.locator('body').innerText();assert(!/crm_enrollment|eap\.|SQLSTATE|\b22023\b|\bPT409\b|\b40001\b|\b42501\b|Invalid new learner|Qualified unlinked|Student unavailable|Enrollment (unavailable|group)|Valid future task|Payment exceeds|Idempotency key|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text),'no raw server text, hint, SQLSTATE or identifier rendered');}
// The centre's wall clock (plan AFU-r1, H7) from the browser's own clock, as the dialog
// computes it: the fixed centre offset, never the browser's time-zone data.
const wall=(delta=0)=>page.evaluate(([ms,offset])=>new Date(Date.now()+ms+offset*60000).toISOString().slice(0,16),[delta,CENTRE_UTC_OFFSET_MINUTES]);
const focused=()=>page.evaluate(()=>({field:document.activeElement?.getAttribute('data-field'),id:document.activeElement?.id,invalid:document.activeElement?.getAttribute('aria-invalid')}));
const startCalls=[];
function watch(target){target.on('request',request=>{if(request.url().endsWith('/rpc/crm_enroll_and_collect'))startCalls.push(request.postDataJSON());});}
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

 // Browser birth bound, no « Démarrage », the desk-guard preview and the paid result.
 const lead1=makeLead('A2 parent principal','A2 Adam principal');await start(lead1);
 const birth=dialog().getByLabel('Date de naissance (si connue)',{exact:true});
 const today=(await wall()).slice(0,10),tomorrow=(await wall(86400000+60000)).slice(0,10);
 assert.equal(await birth.getAttribute('max'),today,'birth max is Casablanca today');
 await birth.fill(tomorrow);await dialog().getByText('La date de naissance ne peut pas être dans le futur.').first().waitFor();
 assert.equal(await birth.getAttribute('aria-invalid'),'true');assert.equal(await dialog().locator('#'+await birth.getAttribute('aria-describedby')).innerText(),'La date de naissance ne peut pas être dans le futur.');
 assert.ok(await button('Continuer').isDisabled(),'future birth blocks step 1');
 await birth.fill(today);assert.equal(await birth.getAttribute('aria-invalid'),null,'today is valid');await birth.fill('');
 await newLearner();
 for(const retired of ['Démarrage','Prochain suivi · Casablanca','Note (facultatif)'])assert.equal(await dialog().getByLabel(retired,{exact:true}).count(),0,`no ${retired}`);
 assert.equal(await dialog().getByLabel('Programme',{exact:true}).locator('option',{hasText:'Autre programme'}).count(),0,'« Autre » is not an enrollment programme');
 await dialog().getByLabel('Groupe (facultatif)',{exact:true}).waitFor();
 await toPayment();
 await pay('0');await dialog().getByLabel('Remise (MAD)',{exact:true}).fill('500');
 await dialog().getByRole('note').filter({hasText:'Indiquez le motif de la remise.'}).waitFor();
 await dialog().getByLabel('Motif de la remise',{exact:true}).selectOption('sibling');
 await dialog().getByRole('note').filter({hasText:PAYMENT_REQUIRED}).waitFor();
 const paymentDate=dialog().getByLabel('Date du paiement',{exact:true});assert.equal(await paymentDate.getAttribute('max'),today,'payment date max is the business date');
 await paymentDate.fill((await wall(-8*86400000)).slice(0,10));await dialog().getByRole('note').filter({hasText:'La date du paiement ne peut pas être antérieure de plus de 7 jours.'}).waitFor();
 startCalls.length=0;await button('Inscrire et encaisser').click();
 await dialog().getByRole('alert').filter({hasText:'La date du paiement ne peut pas être antérieure de plus de 7 jours.'}).waitFor();
 assert.equal((await focused()).field,'paymentDate','the desk-guard field is focused');assert.equal(startCalls.length,0,'nothing sent');
 await paymentDate.fill(today);await button('Inscrire et encaisser').click();
 await dialog().getByRole('alert').filter({hasText:PAYMENT_REQUIRED}).waitFor();assert.equal((await focused()).field,'amount');assert.equal(startCalls.length,0,'a zero payment is never sent');
 await dialog().getByLabel('Montant payé aujourd’hui',{exact:true}).fill('1000');
 await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu \S+$/).waitFor();
 const sent1=startCalls[0];assert.equal(startCalls.length,1);assert.deepEqual(Object.keys(sent1.p_data).sort(),['enrollment','payment']);
 for(const key of ['initial_status','group_id','followup_at','notes'])assert(!(key in sent1.p_data.enrollment),`enrollment omits ${key}`);
 assert(!('idempotency_key' in sent1.p_data.payment),'the payment key is derived by the server');
 assert.equal(sent1.p_data.enrollment.birth_date,null);assert.equal(sent1.p_data.enrollment.learner_name,'A2 Adam principal');
 assert.deepEqual([sent1.p_data.payment.gross_amount,sent1.p_data.payment.discount_amount,sent1.p_data.payment.discount_reason_code,sent1.p_data.payment.payment_amount,sent1.p_data.payment.payment_method],[3000,500,'sibling',1000,'Espèces']);
 const saved1=detail(lead1);assert.equal(saved1.status,'CONVERTED','paid at once: converted');assert.equal(saved1.enrollment.status,'Confirmed');
 assert.equal(receipts(saved1.enrollment.student_id),'1');assert.equal(saved1.open_tasks?.length||0,0,'open tasks cancelled by the conversion');
 await dialog().getByText('Groupe à affecter',{exact:true}).waitFor();await dialog().getByText('Prospect converti : le suivi commercial est terminé.',{exact:true}).waitFor();
 await dialog().getByRole('link',{name:'Ouvrir le reçu',exact:true}).waitFor();
 assert.equal(await dialog().getByRole('status').filter({hasText:'Inscription confirmée · reçu'}).count(),1,'one in-dialog confirmation');assert.equal(await page.locator('[data-sonner-toast]').count(),0,'no additional toast');await noRaw();await done();
 const section=page.getByRole('dialog').locator('#crm-enrollment');
 await section.getByRole('link',{name:"Ouvrir l'apprenant",exact:true}).waitFor();assert.equal(await section.getByRole('button',{name:'Inscrire et encaisser'}).count(),0,'exactly one action');assert.equal(await section.getByText(/Finaliser|Continuer l/).count(),0);
 console.log('PASS birth bound, no Démarrage/follow-up/Autre, desk-guard preview and focus, zero payment refused before sending, paid result converts the prospect');

 // Ouvrir l'apprenant lands on the learner file; Retour returns to the prospect.
 await section.getByRole('link',{name:"Ouvrir l'apprenant",exact:true}).click();
 await page.waitForURL(url=>url.pathname===`/students/${saved1.enrollment.student_id}`);await page.getByRole('heading',{name:'A2 Adam principal',exact:true}).waitFor();
 await page.screenshot({path:join(tmpdir(),'hills-rcc-a2-open.png'),fullPage:false});
 await page.getByRole('button',{name:'Retour',exact:true}).click();await page.waitForURL(url=>url.pathname==='/crm/leads'&&url.searchParams.get('lead')===lead1);
 await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 console.log('PASS Ouvrir l’apprenant and Retour to CRM');

 // Linked learner without lead identity data: preselected, no candidates, no new learner.
 const linkedStudent=student('A2 Lina rattachée','2016-02-03');const lead2=makeLead('A2 parent rattaché','A2 temporaire');
 sql(`update public.crm_leads set student_id='${linkedStudent}',learner_name=null,learner_birth_date=null where id='${lead2}'`);
 const candidateCalls=[];page.on('request',request=>{if(request.url().endsWith('/rpc/crm_find_student_candidates'))candidateCalls.push(1);});
 const studentsBefore=sql('select count(*) from public.students');
 await start(lead2);await dialog().getByText('Apprenant rattaché à ce prospect : A2 Lina rattachée · 2016-02-03',{exact:true}).waitFor();
 await dialog().getByText('Ce prospect est déjà rattaché à cet apprenant ; l’inscription sera créée pour lui. Pour changer d’apprenant, contactez la direction.',{exact:true}).waitFor();
 assert.equal(await button('Créer un nouvel apprenant').count(),0);assert.equal(await dialog().getByLabel('Nom de l’apprenant',{exact:true}).count(),0);
 await button('Continuer').click();await dialog().getByText('2 / 3 · Inscription').waitFor();await dialog().getByText('A2 Lina rattachée',{exact:true}).first().waitFor();await toPayment();await pay();
 startCalls.length=0;await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();
 const sent2=startCalls[0].p_data.enrollment;assert.equal(sent2.student_choice,'existing');assert.equal(sent2.student_id,linkedStudent);
 for(const key of ['learner_name','birth_date','candidate_review','confirm_new'])assert(!(key in sent2),`linked payload omits ${key}`);
 assert.equal(candidateCalls.length,0,'no candidate query on the linked path');assert.equal(sql('select count(*) from public.students'),studentsBefore,'no learner created');
 await dialog().getByText(/^A2 Lina rattachée · Programme annuel/).waitFor();await done();assert.equal(detail(lead2).enrollment.student_id,linkedStudent);
 console.log('PASS linked learner preselected without lead name/birth, payload omits learner_name/birth_date, no candidate query, no new learner');
 // A one-character lead name never blocks an active linked learner.
 const shortLinked=student('A2 Malik court');const leadShort=makeLead('A2 parent court','A2 temporaire court');
 sql(`update public.crm_leads set student_id='${shortLinked}',learner_name='A' where id='${leadShort}'`);candidateCalls.length=0;
 await start(leadShort);await dialog().getByText('Apprenant rattaché à ce prospect : A2 Malik court · 2015-03-01',{exact:true}).waitFor();
 assert.equal(await button('Créer un nouvel apprenant').count(),0);assert.equal(await dialog().getByLabel('Nom de l’apprenant',{exact:true}).count(),0);assert.equal(await button('Continuer').isDisabled(),false,'one-character lead name does not block');
 await button('Continuer').click();await dialog().getByText('2 / 3 · Inscription').waitFor();await toPayment();await pay();await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();await done();
 assert.equal(detail(leadShort).enrollment.student_id,shortLinked);assert.equal(candidateCalls.length,0);
 // A deleted linked learner shows the safe unavailable state; no candidate or new-learner path.
 const goneLinked=student('A2 Nadia archivée');sql(`update public.students set deleted_at=now() where id='${goneLinked}'`);const leadGone=makeLead('A2 parent archivé','A2 Nadia archivée');
 sql(`update public.crm_leads set student_id='${goneLinked}' where id='${leadGone}'`);candidateCalls.length=0;
 await start(leadGone);await dialog().getByText('Le dossier de l’apprenant rattaché à ce prospect n’est plus actif. Contactez la direction.',{exact:true}).waitFor();
 assert.equal(await button('Créer un nouvel apprenant').count(),0);assert.equal(await dialog().getByLabel('Nom de l’apprenant',{exact:true}).count(),0);assert.equal(await button('Utiliser cet apprenant').count(),0);
 assert.ok(await button('Continuer').isDisabled(),'submission unavailable');assert.equal(candidateCalls.length,0,'no candidate query');await noRaw();await button('Annuler').click();
 assert.equal(detail(leadGone).enrollment,null);
 console.log('PASS linked learner with a one-character lead name enrolls; a deleted linked learner shows the unavailable state without candidate or new-learner paths');

 // An open « Finaliser l’inscription » task is closed by the conversion; nothing about it is sent.
 const lead3=makeLead('A2 parent suivi','A2 Nora suivi','enrollment','enrollment_followup');const kept=detail(lead3).open_tasks.find(t=>t.task_type==='enrollment_followup');
 await start(lead3);await newLearner();assert.equal(await dialog().getByText(/suivi d’inscription est déjà prévu|Choisir une autre date/).count(),0,'no follow-up choice');
 await toPayment();await pay();startCalls.length=0;await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();
 assert(!('followup_at' in startCalls[0].p_data.enrollment));assert.equal(sql(`select status from public.crm_tasks where id='${kept.id}'`),'cancelled','the conversion cancels the follow-up');await done();
 console.log('PASS an existing enrollment follow-up is cancelled by the paid conversion; no follow-up value sent');

 // Group: placed after the payment on re-read rows; a placement refusal never undoes the payment.
 const group=randomUUID();fixtureGroups.push(group);sql(`insert into public.groups(id,name,session_type,niveau,annee) values('${group}','A2 groupe enfants','Yearly','Child 2','${year}')`);
 const lead4=makeLead('A2 parent groupe','A2 Yanis groupe');await start(lead4);await newLearner();
 await dialog().getByLabel('Niveau proposé',{exact:true}).selectOption('Child 2');await dialog().getByLabel('Groupe (facultatif)',{exact:true}).selectOption(group);await toPayment();
 await dialog().getByText('Groupe après encaissement : A2 groupe enfants',{exact:true}).waitFor();await pay();startCalls.length=0;
 const placed=page.waitForResponse(response=>response.url().endsWith('/rpc/place_learner_in_group'));
 await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();assert.equal((await placed).status(),200);
 assert(!('group_id' in startCalls[0].p_data.enrollment),'the group is never sent with the enrollment');
 await dialog().getByText('Groupe : A2 groupe enfants',{exact:true}).waitFor();await done();
 const placedEnrollment=detail(lead4).enrollment;assert.equal(sql(`select status||'|'||group_id from public.enrollments where id='${placedEnrollment.id}'`),`Validated|${group}`);
 const lead4b=makeLead('A2 parent groupe refusé','A2 Yasmine groupe');await start(lead4b);await newLearner();
 await dialog().getByLabel('Niveau proposé',{exact:true}).selectOption('Child 2');await dialog().getByLabel('Groupe (facultatif)',{exact:true}).selectOption(group);await toPayment();await pay();
 sql(`update public.groups set niveau='Child 3' where id='${group}'`);
 await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();
 await dialog().getByText('Groupe non affecté : Le groupe doit correspondre au programme et au niveau de l’inscription. Apprenant inscrit — groupe à affecter.',{exact:true}).waitFor();
 const refusedEnrollment=detail(lead4b).enrollment;assert.equal(sql(`select status||'|'||coalesce(group_id::text,'') from public.enrollments where id='${refusedEnrollment.id}'`),'Confirmed|','paid, not placed');
 assert.equal(receipts(refusedEnrollment.student_id),'1','the payment stands');assert.equal(detail(lead4b).status,'CONVERTED');await noRaw();await done();
 console.log('PASS group placed after the payment (Validated); a placement refusal keeps the receipt and the Confirmed enrollment');

 // Free enrollment (Q1): 100 % discount with its reason confirms without a receipt.
 const leadFree=makeLead('A2 parent gratuit','A2 Sofia gratuite');await start(leadFree);await newLearner();await toPayment();
 await pay('0');await dialog().getByLabel('Remise (MAD)',{exact:true}).fill('3000');await dialog().getByLabel('Motif de la remise',{exact:true}).selectOption('director_approval');
 await dialog().getByRole('note').filter({hasText:'Remise de 100 % : inscription confirmée sans paiement (visible dans Contrôles).'}).waitFor();
 assert.equal(await dialog().getByText('Envoyer aussi le reçu par e-mail').count(),0,'no e-mail without a receipt');
 await button('Inscrire et encaisser').click();await dialog().getByText('Inscription confirmée sans paiement (remise 100 %)',{exact:true}).waitFor();
 const free=detail(leadFree);assert.equal(free.status,'CONVERTED');assert.equal(receipts(free.enrollment.student_id),'0');
 assert.equal(sql(`select count(*) from public.charges where enrollment_id='${free.enrollment.id}' and discount_amount=gross_amount`),'1');assert.equal(await dialog().getByRole('link',{name:'Ouvrir le reçu'}).count(),0);await done();
 console.log('PASS free enrollment (100 % discount with reason) confirms without a receipt and converts');

 // Race: another actor enrolls the prospect first; the panel never claims this request's work.
 const lead5=makeLead('A2 parent course','A2 Ines course');await start(lead5);await newLearner();await toPayment();await pay();
 enroll(newPayload(lead5,'A2 Ines course'),users[2].id);
 await button('Inscrire et encaisser').click();await dialog().getByText('Inscription déjà rattachée',{exact:true}).waitFor();
 await dialog().getByText('Une inscription a été rattachée à ce prospect entre-temps. Vérifiez-la avant de poursuivre.',{exact:true}).waitFor();
 assert.equal(await dialog().getByText(/reçu|remise 100/).count(),0,'no payment wording');
 assert.equal(sql(`select count(*) from public.students where full_name='A2 Ines course'`),'1','exactly one learner');assert.equal(receipts(detail(lead5).enrollment.student_id),'1','exactly one receipt');await noRaw();await done();
 console.log('PASS discovered race result is never presented as this request’s enrollment or payment');

 // Race: the opportunity is linked to a learner while the dialog submits a new learner.
 const lead6=makeLead('A2 parent lien','A2 Omar lien');await start(lead6);await newLearner();await toPayment();await pay();
 const raced=student('A2 Omar déjà rattaché');sql(`update public.crm_leads set student_id='${raced}' where id='${lead6}'`);
 await button('Inscrire et encaisser').click();await dialog().getByText('Apprenant rattaché à ce prospect : A2 Omar déjà rattaché · 2015-03-01',{exact:true}).waitFor();
 await dialog().getByRole('alert').filter({hasText:'Ce prospect est déjà rattaché à un apprenant. L’inscription doit être créée pour cet apprenant.'}).waitFor();
 assert.equal(sql(`select count(*) from public.students where full_name='A2 Omar lien'`),'0','no duplicate learner');assert.equal(receipts(raced),'0','the refused request collected nothing');
 await button('Continuer').click();await toPayment();await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();await done();
 assert.equal(detail(lead6).enrollment.student_id,raced);assert.equal(receipts(raced),'1');
 console.log('PASS linkage race moves the dialog to the linked learner, payment kept; exactly that learner enrolled and paid once');

 // Linked elsewhere: explained before submit, no dead end.
 const twice=student('A2 Sami double');const twiceEnrollment=randomUUID();sql(`insert into public.enrollments(id,student_id,session_type,school_year,status) values('${twiceEnrollment}','${twice}','Yearly','${year}','Confirmed')`);
 const owner=makeLead('A2 parent premier','A2 Sami premier');enroll({lead_id:owner,expected_version:detail(owner).version,student_choice:'existing',student_id:twice,session_type:'Yearly',school_year:year,enrollment_id:twiceEnrollment,expected_enrollment_updated_at:sql(`select to_json(updated_at) from public.enrollments where id='${twiceEnrollment}'`).replaceAll('"','')});
 const lead7=makeLead('A2 parent second','A2 Sami double');await start(lead7);
 await dialog().getByText('A2 Sami double',{exact:true}).locator('..').getByRole('button',{name:'Utiliser cet apprenant',exact:true}).click();await button('Continuer').click();
 await dialog().getByText('Cet apprenant a déjà une inscription pour ce programme et cette année, rattachée à un autre prospect. Choisissez un autre programme ou une autre année, ou clôturez ce prospect comme doublon.',{exact:true}).waitFor();
 assert.equal(await dialog().getByText('Choisissez l’inscription existante pour éviter un doublon.').count(),0);assert.ok(await button('Continuer').isDisabled());await button('Annuler').click();
 console.log('PASS linked-elsewhere explanation replaces the dead-end selection prompt');

 // Q12: an enrollment already paid at the desk is linked without a payment; an unpaid
 // Confirmed row is refused by the server and the dialog moves to the payment step.
 const deskPaid=student('A2 Rim payée');collect(deskPaid);const deskEnrollment=sql(`select id from public.enrollments where student_id='${deskPaid}'`);
 const leadPaid=makeLead('A2 parent payé','A2 Rim payée');await start(leadPaid);
 await dialog().getByText('A2 Rim payée',{exact:true}).locator('..').getByRole('button',{name:'Utiliser cet apprenant',exact:true}).click();await button('Continuer').click();
 await button('Rattacher cette inscription payée').click();await button('Continuer').click();await dialog().getByText('3 / 3 · Vérification').waitFor();
 assert.equal(await dialog().getByLabel('Montant payé aujourd’hui',{exact:true}).count(),0,'no payment step for a paid link');
 startCalls.length=0;await button('Rattacher cette inscription payée').click();await dialog().getByText('Inscription payée rattachée',{exact:true}).waitFor();
 assert.deepEqual(Object.keys(startCalls[0].p_data),['enrollment'],'no payment object');assert.equal(startCalls[0].p_data.enrollment.enrollment_id,deskEnrollment);
 assert.equal(detail(leadPaid).status,'CONVERTED');assert.equal(receipts(deskPaid),'1','no second receipt');await done();
 const unpaid=student('A2 Hind impayée'),unpaidEnrollment=randomUUID();sql(`insert into public.enrollments(id,student_id,session_type,school_year,status) values('${unpaidEnrollment}','${unpaid}','Yearly','${year}','Confirmed')`);
 const leadUnpaid=makeLead('A2 parent impayé','A2 Hind impayée');await start(leadUnpaid);
 await dialog().getByText('A2 Hind impayée',{exact:true}).locator('..').getByRole('button',{name:'Utiliser cet apprenant',exact:true}).click();await button('Continuer').click();
 await button('Rattacher cette inscription payée').click();await button('Continuer').click();startCalls.length=0;await button('Rattacher cette inscription payée').click();
 await dialog().getByRole('alert').filter({hasText:'Aucun paiement n’est enregistré pour cette inscription : saisissez le paiement pour la confirmer.'}).waitFor();
 await dialog().getByText('3 / 3 · Paiement').waitFor();assert.equal(detail(leadUnpaid).status,'QUALIFIED','the refused link rolled back the conversion');
 await pay();await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();
 assert.equal(startCalls[1].p_data.enrollment.enrollment_id,unpaidEnrollment);assert(startCalls[1].p_data.payment,'the payment is sent on the same enrollment');
 assert.equal(startCalls[1].p_request_key,startCalls[0].p_request_key,'one request key per dialog opening');
 assert.equal(detail(leadUnpaid).status,'CONVERTED');assert.equal(receipts(unpaid),'1');await noRaw();await done();
 console.log('PASS Q12 paid enrollment linked without a payment; an unpaid one is refused and collected on the payment step');

 // Uncertain transport failure, hinted, desk-guard and hint-less definite rejections (stubbed).
 const lead8=makeLead('A2 parent erreurs','A2 Rania erreurs');await start(lead8);await newLearner();await toPayment();await pay();
 const responses=[{status:502,contentType:'text/plain',body:'Bad Gateway'},{status:400,contentType:'application/json',body:JSON.stringify({code:'22023',message:'Invalid new learner',details:null,hint:'crm_enrollment.birth_date_future'})},
  {status:400,contentType:'application/json',body:JSON.stringify({code:'22023',message:'Indiquez le motif de la remise.',details:null,hint:null})},
  {status:400,contentType:'application/json',body:JSON.stringify({code:'22023',message:'Invalid new learner',details:null,hint:null})}];
 await page.route('**/rest/v1/rpc/crm_enroll_and_collect',route=>route.fulfill(responses.shift()));startCalls.length=0;
 await button('Inscrire et encaisser').click();await dialog().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
 assert.equal(await dialog().getByText(/rien n’a été enregistré/).count(),0,'uncertain never says nothing was saved');await noRaw();
 await button('Inscrire et encaisser').click();await dialog().getByText('1 / 3 · Apprenant').waitFor();
 assert.deepEqual(startCalls[1],startCalls[0],'uncertain retry resends the identical request with the same key');
 await dialog().getByRole('alert').filter({hasText:'La date de naissance ne peut pas être dans le futur.'}).waitFor();
 const birth8=dialog().getByLabel('Date de naissance (si connue)',{exact:true});assert.equal((await focused()).field,'birth');assert.equal(await birth8.getAttribute('aria-invalid'),'true');
 await button('Continuer').click();await dialog().getByText('2 / 3 · Inscription').waitFor();await toPayment();await button('Inscrire et encaisser').click();
 await dialog().getByRole('alert').filter({hasText:'Indiquez le motif de la remise.'}).waitFor();await dialog().getByText('3 / 3 · Paiement').waitFor();assert.equal((await focused()).field,'reasonCode','the server desk-guard text focuses its field');
 await button('Inscrire et encaisser').click();
 await dialog().getByRole('alert').filter({hasText:'L’inscription n’a pas pu être créée et rien n’a été enregistré. Réessayez ; si le problème persiste, contactez la direction.'}).waitFor();
 assert.equal(new Set(startCalls.map(call=>call.p_request_key)).size,1,'one request key per dialog opening, reused after definite rejections');await noRaw();
 await page.unroute('**/rest/v1/rpc/crm_enroll_and_collect');
 await dialog().getByText('2 / 3 · Inscription').waitFor();await toPayment();// hint-less 22023 keeps today's step 2
 await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();await done();
 assert.equal(sql(`select count(*) from public.students where full_name='A2 Rania erreurs'`),'1');
 console.log('PASS uncertain 5xx keeps key/payload and never says nothing saved; hinted and desk-guard reasons focus their field; hint-less definite uses the safe fallback');

 // Contextual actions, spot checks: NEW, historical pré-inscription/essai, refused and post-confirmation changes.
 const sectionText=async id=>{await open(id);return page.getByRole('dialog').locator('#crm-enrollment').innerText();};
 const fresh=rawLead('A2 parent nouveau','A2 Lea nouveau');let text=await sectionText(fresh);
 assert.match(text,/Qualifiez le projet avant de commencer une inscription\./);assert.equal(await page.getByRole('button',{name:'Inscrire et encaisser'}).count(),0);
 const historical=makeLead('A2 parent historique','A2 Lou historique');legacy(historical,student('A2 Lou historique'),'Submitted');text=await sectionText(historical);
 assert.match(text,/Pré-inscription créée · En attente|Soumise/);assert.match(text,/Ancienne pré-inscription archivée ; relancez « Inscrire et encaisser » si le prospect s’inscrit\./);
 assert.match(text,/Ouvrir l'apprenant/);assert.doesNotMatch(text,/Continuer l'inscription|Finaliser/);assert.equal(await page.getByRole('button',{name:'Inscrire et encaisser'}).count(),0);
 const trial=makeLead('A2 parent essai','A2 Zoé essai');legacy(trial,student('A2 Zoé essai'),'Trial');act('close_lost',trial,{reason:'not_interested'});text=await sectionText(trial);
 assert.match(text,/Ancienne pré-inscription archivée/);assert.doesNotMatch(text,/Continuer l'inscription/);
 const refused=makeLead('A2 parent refusée','A2 Zoe refusée');legacy(refused,student('A2 Zoe refusée'),'Rejected');
 text=await sectionText(refused);assert.match(text,/Inscription refusée\. Ce prospect reste rattaché à cette inscription/);assert.doesNotMatch(text,/Finaliser|Continuer l'inscription/);
 const changed=makeLead('A2 parent changé','A2 Adel changé');enroll(newPayload(changed,'A2 Adel changé'));const changedEnrollment=detail(changed).enrollment.id;
 text=await sectionText(changed);assert.match(text,/Ouvrir l'apprenant/);assert.doesNotMatch(text,/Cette inscription a changé/);
 sql(`begin;set local request.jwt.claim.sub='${users[2].id}';set local eh.enrollment_command=on;update public.enrollments set status='Ended',ended_at=now(),group_id=null where id='${changedEnrollment}';commit;`);
 assert.equal(detail(changed).status,'CONVERTED');
 text=await sectionText(changed);assert.match(text,/Cette inscription a changé après sa confirmation\. Elle est signalée pour vérification par la direction\./);assert.doesNotMatch(text,/Continuer l'inscription|Finaliser/);
 console.log('PASS contextual actions: NEW, historical pré-inscription and essai (one row), refused and changed-after-confirmation states');
 assert.deepEqual(pageErrors,[]);await context.close();

 // A lost response is replayed with the same key: one learner, enrollment, receipt and activity.
 context=await browser.newContext({viewport:{width:1440,height:1000}});await newPage(context);
 const lead11=makeLead('A2 parent perte','A2 Maya perte');await start(lead11);await newLearner();await toPayment();await pay();
 let drop=true;await page.route('**/rest/v1/rpc/crm_enroll_and_collect',async route=>{if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 startCalls.length=0;await button('Inscrire et encaisser').click();await dialog().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
 await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();
 assert.equal(startCalls.length,2);assert.deepEqual(startCalls[1],startCalls[0],'byte-identical same-key resend');
 await dialog().getByText('Cette inscription était déjà enregistrée : rien n’a été saisi deux fois.',{exact:true}).waitFor();await page.unroute('**/rest/v1/rpc/crm_enroll_and_collect');
 const lost=detail(lead11);assert.equal(sql(`select count(*) from public.students where full_name='A2 Maya perte'`),'1');assert.equal(sql(`select count(*) from public.enrollments where student_id='${lost.enrollment.student_id}'`),'1');
 assert.equal(receipts(lost.enrollment.student_id),'1','one receipt');
 assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${lead11}' and event_type='enrollment_started'`),'1');
 await done();
 console.log('PASS lost response replayed with the same key; exactly one student, enrollment, receipt and activity');
 // B1 regression: a real refetch that already reflects the committed request must not
 // change the frozen request, its presentation or its uncertain-retry message.
 const leadFrozen=makeLead('A2 parent gel','A2 Lucas gel');await start(leadFrozen);await newLearner();await toPayment();await pay();
 drop=true;await page.route('**/rest/v1/rpc/crm_enroll_and_collect',async route=>{if(drop){drop=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 startCalls.length=0;await button('Inscrire et encaisser').click();await dialog().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
 assert.equal(sql(`select count(*) from public.students where full_name='A2 Lucas gel'`),'1','the first request committed');
 const refetched=page.waitForResponse(response=>response.url().endsWith('/rpc/crm_get_enrollment_context'));
 const drawerRefetched=page.waitForResponse(response=>response.url().endsWith('/rpc/crm_get_workspace_detail'));
 await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
 const refreshedContext=await (await refetched).json();await drawerRefetched;
 assert.equal(refreshedContext.linked_student?.available,true,'the refetched context already reflects the committed enrollment');
 await page.waitForTimeout(1000);
 await dialog().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
 assert.equal(await dialog().getByText(/Apprenant rattaché à ce prospect/).count(),0,'refetched state does not change the frozen request');
 await dialog().getByText('Création d’un nouvel apprenant',{exact:true}).waitFor();
 await button('Inscrire et encaisser').click();await dialog().getByText(/^Inscription confirmée · reçu /).waitFor();
 assert.equal(startCalls.length,2);assert.equal(startCalls[1].p_request_key,startCalls[0].p_request_key,'same request key');
 assert.deepEqual(startCalls[1].p_data,startCalls[0].p_data,'identical frozen business payload');assert(startCalls[0].p_data.enrollment.learner_name==='A2 Lucas gel');
 assert.equal(await dialog().getByText('Inscription déjà rattachée').count(),0,'own replay, not a discovered result');await page.unroute('**/rest/v1/rpc/crm_enroll_and_collect');
 const frozenLead=detail(leadFrozen);assert.equal(sql(`select count(*) from public.students where full_name='A2 Lucas gel'`),'1');
 assert.equal(sql(`select count(*) from public.enrollments where student_id='${frozenLead.enrollment.student_id}'`),'1');assert.equal(receipts(frozenLead.enrollment.student_id),'1');
 assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${leadFrozen}' and event_type='enrollment_started'`),'1');
 await done();assert.deepEqual(pageErrors,[]);
 console.log('PASS B1 frozen uncertain request: refetch reflecting the commit changes nothing; same key and payload replay to this dialog’s own success; one learner/enrollment/receipt; no browser errors');
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
 set local english_hills.receipt_test_cleanup = 'on';delete from public.financial_events where actor_id in(${ids});delete from public.financial_requests where actor_id in(${ids});delete from public.receipts where student_id in(${studentIds});delete from public.charges where student_id in(${studentIds});
 set local eh.enrollment_command = on; set local eh.membership_sync = on; delete from public.enrollments where student_id in(${studentIds});delete from public.students where id in(${studentIds});delete from public.groups where id in(${groupIds});alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
 console.log('PASS synthetic browser fixtures removed; history guards restored');
}
