// Real local Auth + production pages; synthetic read fixtures exercise UI failure
// and content stress. Existing O3/receptionist suites prove real RPC/write guards.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, webkit } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
assertLocalFeatureBranch();
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const password=randomBytes(24).toString('base64url'),run='uif-'+randomUUID(),users=[];
const leadId=randomUUID(),contactId=randomUUID(),taskId=randomUUID(),studentId=randomUUID();
const longName='أسماء عبد الرحمن بن عبد الله · Marie-Claire de la Roche Saint André';
const program='Programme annuel · Anglais pour jeunes apprenants et préparation internationale';
const task={id:taskId,lead_id:leadId,task_type:'center_visit',version:1,assigned_to:null,due_at:'2030-06-14T09:35:00Z',local_date:'2030-06-14',local_time:'10:35:00',scheduled_end_at:null};
const card={id:leadId,contact_id:contactId,contact_name:longName,learner_name:'Apprenant distinct · أحمد',learner_age:null,program,status:'NEW',owner_id:null,owner_name:null,source_label:'Site web',next_task:task,failed_attempts:0};
const lead={...card,version:1,phone:'+212612345678',contact:{phone_e164:'+212612345678',whatsapp_e164:'+212698765432',email:null},open_tasks:[task],open_task_count:1,placement_count:0,enrollment:null,unreachable_eligible:false};
const student={id:studentId,full_name:longName,status:'Enrolled',session_type:'Yearly',niveau_cefr:'Child 1',payment_status:'Soldé',payment_balance:0,plan_type:'Standard',pending_enrollments:[],groupe_id:null};
const answers={total:6,rows:[{id:randomUUID(),source_label:'Site web · Demande synthétique',occurred_at:'2026-10-01T10:00:00Z',answers:[{label:'Tranche d’âge',display_value:'13–17 ans'},{label:'Déplacement au centre',value:'Possible le mercredi'},{label:'Programme souhaité',value:program},{label:'Question complémentaire',value:'Réponse complète conservée'}]}]};
let browser,page,phase,hold=null;
// Drain the previous route's reads/prefetches before replacing its document.
async function drainReads(){await page.waitForTimeout(600);await page.waitForLoadState('networkidle');}
async function navigate(url){if(!hold)await drainReads();await page.goto(url);}
async function login(user){await navigate(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(u=>u.pathname!='/login');}
async function noOverflow(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),phase+' viewport overflow');}
async function studentsTableKeyboard(){
 const region=page.getByRole('region',{name:'Tableau des apprenants, défilement horizontal',exact:true});
 await region.waitFor();await region.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
 assert(await region.evaluate(el=>document.activeElement===el));
 const focus=await region.evaluate(el=>{const style=getComputedStyle(el);return {width:style.outlineWidth,style:style.outlineStyle,offset:style.outlineOffset,transition:style.transition,visible:el.matches(':focus-visible')};});
 assert.equal(focus.width,'2px',JSON.stringify(focus));assert.equal(focus.style,'solid');assert.equal(focus.offset,'2px');
 assert.equal(await region.evaluate(el=>getComputedStyle(el).overflowX),'auto');
 await page.mouse.click(700,10);await region.focus();assert.equal(await region.evaluate(el=>getComputedStyle(el).outlineWidth),'2px','explicit region focus survives preceding pointer input');
}
async function sidebarResize(){
 await page.setViewportSize({width:768,height:1024});await navigate(app+'/students');await studentsTableKeyboard();
 const trigger=page.getByRole('button',{name:'Ouvrir le menu',exact:true,includeHidden:true}),menu=page.getByRole('dialog',{name:'Menu de navigation',exact:true});
 await trigger.click();await menu.waitFor();assert(await page.locator('#main-content').evaluate(el=>el.inert));
 await page.setViewportSize({width:1440,height:900});await menu.waitFor({state:'detached'});
 // lg:hidden hides the menu at once; the min-width listener unmounts it a frame later and clears
 // inert in that same commit. Wait for the unmount itself, not only for the menu to be hidden.
 await page.getByRole('dialog',{name:'Menu de navigation',exact:true,includeHidden:true}).waitFor({state:'detached'});
 assert(!(await page.locator('#main-content').evaluate(el=>el.inert)),'desktop main content is not inert');
 assert(!(await trigger.evaluate(el=>document.activeElement===el)),'desktop resize does not focus a hidden trigger');
 const search=page.getByRole('searchbox',{name:'Rechercher un apprenant',exact:true});
 await search.focus();assert(await search.evaluate(el=>document.activeElement===el));await search.click();await search.fill('absent');
 await page.waitForURL(u=>u.searchParams.get('q')==='absent');await search.fill('');await page.waitForURL(u=>!u.searchParams.has('q'));
 await page.setViewportSize({width:768,height:1024});assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 await trigger.click();await menu.waitFor();await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});
 assert(!(await page.locator('#main-content').evaluate(el=>el.inert)));assert(await trigger.evaluate(el=>document.activeElement===el),'normal close restores visible trigger focus');
 await trigger.click();await menu.waitFor();await page.mouse.click(700,500);await menu.waitFor({state:'detached'});
 assert(!(await page.locator('#main-content').evaluate(el=>el.inert)),'backdrop close clears inert');
 await trigger.click();await menu.waitFor();await menu.getByRole('button',{name:'CRM',exact:true}).click();await menu.getByRole('link',{name:'Opportunités',exact:true}).click();await menu.waitFor({state:'detached'});
 await page.waitForURL(u=>u.pathname==='/crm/leads');assert(!(await page.locator('#main-content').evaluate(el=>el.inert)),'navigation close clears inert');
}
async function touchTargets(){const targets=await page.locator('.operational button:visible,.operational select:visible,.operational input:visible,.operational [data-touch-target]:visible').evaluateAll(nodes=>nodes.map(el=>({name:el.getAttribute('aria-label')||el.textContent,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})));assert(targets.every(t=>t.height>=44&&t.width>=44),phase+' '+JSON.stringify(targets));}
async function visibleFirstResult(locator){const box=await locator.first().boundingBox();assert(box && box.y < (await page.evaluate(()=>innerHeight)),phase+' result/state above first mobile fold '+JSON.stringify(box));}
try {
 for(const role of ['receptionist','director']) {
  const email=`${run}-${role}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name='UIF synthetic' where id='${user.id}'`);
 }
 for(const engine of (process.argv.includes('--webkit-only')?[webkit]:[chromium,webkit])) {
  browser=await engine.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[],transportErrors=[],cancelled=[],external=[],requests=[];let crmMode='ready',studentMode='ready',detailMode='ready',placementMode='ready',financeMode='ready',monthlyMode='ready',rejectDashboard=false;hold=null;
  await ctx.route(u=>!['localhost','127.0.0.1'].includes(u.hostname),r=>{external.push(new URL(r.request().url()).hostname);return r.abort();});
  await ctx.route('**/monitoring**',route=>route.fulfill({status:200,body:'{}'}));
  await ctx.route('**/rest/v1/**',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':app,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}});
   const url=new URL(route.request().url()),name=url.pathname.split('/').at(-1),args=route.request().postDataJSON();
   requests.push({name,args,url:url.toString()});
   const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':app,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-expose-headers':'content-range','content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'*'},body:JSON.stringify(data)});
   const failure=()=>json({message:'Synthetic safe read failure'},500);
   if(name==='profiles'||name==='apply_pending_role'||name==='recover_missing_profile')return route.continue();
   if(url.pathname.includes('/rpc/')) {
    if(name==='save_receptionist_student')return json({});
    if(name==='crm_list_staff')return json({total:1,rows:[{id:users[0].id,name:'UIF synthetic',display_label:'UIF synthetic · Réception',role:'receptionist'}]});
    if(name==='crm_get_opportunity_filter_options')return json({rows:args.p_kind==='program'?[{kind:'interest',value:program}]:[{kind:'website',value:'Site web'}],has_more:false});
    if(name==='crm_get_opportunities') {
     if(hold)await hold;
     if(crmMode==='error')return failure();if(crmMode==='unavailable')return json(null);
     const rows=crmMode==='empty'||args.p_query==='absent'?[]:[card];const counts={NEW:rows.length,CONTACTING:0,ENGAGED:0,QUALIFIED:0,CONVERTED:0,LOST:0,NOT_QUALIFIED:0};
     return json({as_of:'2030-06-14T09:00:00Z',total:rows.length,counts,pages:args.p_layout==='list'?{[args.p_stage||'list']:{rows,has_more:false}}:Object.fromEntries(['NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED'].map(s=>[s,{rows:s==='NEW'?rows:[],has_more:false}]))});
    }
    if(name==='crm_get_work_queue') { if(hold)await hold;if(crmMode==='error')return failure();if(crmMode==='unavailable')return json(null);return json({rows:crmMode==='empty'?[]:[{...task,lead:card}],counts:{overdue:0,today:1,tomorrow:0,upcoming:0},has_more:false,boundaries:{d1:'2030-06-15T00:00:00Z'}}); }
    if(name==='crm_get_workspace_detail')return json(lead);
    if(name==='crm_get_operational_acquisition_summary')return json({first_inquiry:{channel:'website',source_label:'Site web',occurred_at:'2026-10-01T10:00:00Z'},latest_inquiry:{channel:'website',source_label:'Site web',occurred_at:'2026-10-01T10:00:00Z'}});
    if(name==='crm_get_form_answers')return json(args.p_offset===0?answers:{rows:[{...answers.rows[0],id:randomUUID(),source_label:'Demande antérieure'}],total:6});
    if(name==='crm_list_open_tasks')return json([task]);
    if(name==='crm_get_timeline'||name==='crm_list_placements'||name==='crm_list_intake_review')return json({rows:[],total:0,has_more:false});
    if(name==='search_students_page') {
     if(hold)await hold;
     if(studentMode==='error')return failure();
     if(studentMode==='unavailable')return json(null);
     const rows=studentMode==='empty'||args.p_search==='absent'?[]:[student];return json({rows,count:rows.length?41:0,total:41});
    }
    if(name==='get_finance_charge_summary'||name==='get_monthly_finance_summary') {
     const mode=name==='get_finance_charge_summary'?financeMode:monthlyMode;
     if(mode==='error')return failure();if(mode==='missing')return json(null);if(mode==='malformed')return json({encaisse:null});
     return json(name==='get_finance_charge_summary'?{total_encaisse:0}:{encaisse:0,restant:0,total:0,count:0});
    }
    assert.fail('Unexpected RPC in presentation harness: '+name);
   }
   if(name==='placement_tests' && placementMode==='error')return failure();
   if(name==='groups' && rejectDashboard)return route.abort();
   if(name==='students') {if(url.searchParams.has('id') && detailMode==='error')return failure();return json(url.searchParams.has('id') && detailMode!=='missing'?[student]:[]);}
   if(name==='receipts')return json(url.searchParams.has('student_id')?[{id:randomUUID(),receipt_number:'SYNTHETIC-UIF',date:'2026-10-01',net_amount_snapshot:1000,montant_paye:300,balance_after_snapshot:700,statut_paiement:'Acompte versé'}]:[]);
   return json([]);
  });
  page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('requestfailed',r=>{const failure=r.failure()?.errorText||'';if(/cancel|abort/i.test(failure))cancelled.push(new URL(r.url()).pathname);});page.on('pageerror',e=>{if(rejectDashboard && e.message.includes('/rest/v1/groups') && e.message.includes('access control checks'))return;if(e.name==='Fetch API cannot load http' && e.message.includes('access control checks'))transportErrors.push({message:e.message,phase});else errors.push(e.message);});await page.clock.install();await login(users[0]);
  if(process.argv.includes('--students-touch-only')) {
   for(const width of [768,720,390,375,320]) {
    phase=engine.name()+' '+width+' Students touch targets';await page.setViewportSize({width,height:1024});await navigate(app+'/students');
    const record=page.getByRole('link',{name:longName,exact:true});await record.waitFor();await noOverflow();await touchTargets();
    const target=await record.evaluate(el=>{const box=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);return {width:box.width,height:box.height,lines:range.getClientRects().length,overflow:el.scrollWidth>el.clientWidth+1,text:el.textContent};});
    assert.equal(target.text,longName);assert(!target.overflow,phase+' name overflows target');assert(target.lines>1,phase+' long name wraps');
    if(width===768)await studentsTableKeyboard();
    console.log('PASS '+phase+' '+JSON.stringify(target));
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await ctx.close();await browser.close();browser=null;continue;
  }
  if(process.argv.includes('--table-only')) {phase=engine.name()+' Students table accessibility';await page.setViewportSize({width:768,height:1024});await navigate(app+'/students');await studentsTableKeyboard();await noOverflow();await touchTargets();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await ctx.close();await browser.close();browser=null;console.log('PASS '+engine.name()+' named keyboard-focusable Students table region and tablet touch targets');continue;}
  if(process.argv.includes('--corrections-only')) {phase=engine.name()+' Students focus/sidebar resize';await sidebarResize();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await ctx.close();await browser.close();browser=null;console.log('PASS '+engine.name()+' Students 2px focus at 768 and sidebar 768→1440 resize, pointer/focus, Escape/backdrop/navigation restoration');continue;}
  const sheet=page.getByRole('dialog'),search=page.getByRole('searchbox',{name:'Rechercher un prospect',exact:true});
  if(!process.argv.includes('--responsive-only')) {
  phase=engine.name()+' reset/debounce';await navigate(app+'/crm/leads?view=mine&layout=list&contact='+contactId+'&lead='+leadId);await page.getByRole('dialog').getByText('Résumé de la dernière demande',{exact:true}).waitFor();
  await sheet.getByText('13–17 ans',{exact:true}).waitFor();
  assert(await sheet.getByText('WhatsApp +212698765432',{exact:true}).count(),'RCC-B1 header destinations: Tél. … · WhatsApp …');assert((await sheet.innerText()).includes('+212698765432'));assert((await sheet.innerText()).includes('+212612345678'));
  const summaryBox=await sheet.getByRole('heading',{name:'Résumé de la dernière demande'}).boundingBox(),placementBox=await sheet.getByRole('heading',{name:'Test de niveau',exact:true}).boundingBox();assert(summaryBox.y<placementBox.y,'answer summary precedes downstream panels');
  await sheet.getByRole('button',{name:'WhatsApp',exact:true}).click();const action=page.getByRole('dialog').last();await action.getByText('WhatsApp : +212698765432',{exact:true}).waitFor();assert.equal(await action.getByRole('link',{name:'Ouvrir WhatsApp'}).getAttribute('href'),'https://wa.me/212698765432');
  await action.getByRole('button',{name:'Annuler',exact:true}).focus();for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await page.locator(':focus').evaluate(el=>el.closest('[role=dialog]')?.querySelector('h2')?.textContent==='Suivi WhatsApp'),'nested dialog focus trap');}await page.keyboard.press('Escape');await page.getByRole('heading',{name:'Suivi WhatsApp',exact:true}).waitFor({state:'hidden'});assert(!requests.some(r=>r.name==='crm_record_whatsapp'));
  await sheet.getByText('Toutes les réponses aux formulaires',{exact:true}).click();await sheet.getByText('Réponse complète conservée',{exact:true}).waitFor();await sheet.getByRole('navigation',{name:'Pagination'}).getByRole('button',{name:'Suivant'}).click();await sheet.getByText('Demande antérieure',{exact:true}).waitFor();
  assert(requests.filter(r=>r.name==='crm_get_form_answers').every(r=>r.args.p_limit===5 && [0,5].includes(r.args.p_offset)));
  await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
  await search.fill('pending');await page.getByRole('button',{name:'Effacer les filtres',exact:true}).click();await page.waitForTimeout(350);
  const resetUrl=new URL(page.url());assert(!resetUrl.searchParams.has('q'));assert.equal(resetUrl.searchParams.get('view'),'mine');assert.equal(resetUrl.searchParams.get('layout'),'list');assert.equal(resetUrl.searchParams.get('contact'),null);assert.equal(await search.inputValue(),'');
  await search.fill('seul');await page.waitForURL(u=>u.searchParams.get('q')==='seul');await page.getByRole('button',{name:'Effacer · Rechercher un prospect'}).click();await page.waitForURL(u=>!u.searchParams.has('q'));assert.equal(new URL(page.url()).searchParams.get('view'),'mine');
  // Every initial/refresh/error state is checked in the real query adapter.
  phase=engine.name()+' CRM read truth';let release;await drainReads();hold=new Promise(r=>{release=r;});await navigate(app+'/crm/leads?layout=list');await page.getByText('Chargement…',{exact:true}).waitFor();release();hold=null;await page.getByTestId('opportunity-row').waitFor();
  await page.getByTestId('opportunity-row').getByRole('button').first().focus();await drainReads();hold=new Promise(r=>{release=r;});const refresh=page.waitForRequest(r=>r.url().endsWith('/rpc/crm_get_opportunities'));await page.clock.fastForward(61000);await refresh;await page.getByText('Actualisation…',{exact:true}).waitFor();assert.equal(await page.getByTestId('opportunity-row').count(),1);assert(await page.locator(':focus').evaluate(el=>!!el.closest('[data-testid=opportunity-row]')),'refresh preserves focused row node');crmMode='error';release();hold=null;await page.clock.fastForward(3000);await page.getByRole('alert').filter({hasText:'Actualisation impossible'}).waitFor();assert.equal(await page.getByTestId('opportunity-row').count(),1);
  crmMode='ready';await page.getByRole('alert').getByRole('button',{name:'Réessayer'}).click();await page.getByRole('alert').filter({hasText:'Actualisation impossible'}).waitFor({state:'hidden'});
  crmMode='error';await navigate(app+'/crm/leads?layout=list&q=failure');await page.clock.fastForward(3000);await page.getByRole('alert').filter({hasText:'Impossible de charger'}).waitFor();assert.equal(await page.getByTestId('opportunity-row').count(),0,'no stale cross-filter rows');
  crmMode='unavailable';await navigate(app+'/crm/leads?layout=list&q=missing');await page.getByText('Informations indisponibles.',{exact:true}).waitFor();
  crmMode='empty';await navigate(app+'/crm/leads?layout=list');await page.getByText('Aucun prospect enregistré. Ajoutez un prospect pour commencer le suivi.',{exact:true}).waitFor();
  crmMode='ready';await navigate(app+'/crm/leads?layout=list&q=absent');await page.getByText('Aucun prospect correspondant à cette vue et ces filtres.',{exact:true}).waitFor();
  console.log('PASS '+engine.name()+' CRM read states and bounded drawer');phase=engine.name()+' Students context';await navigate(app+'/students?status=all_shown&page=2');await page.getByRole('link',{name:longName,exact:true}).first().click();await page.getByRole('heading',{name:longName,exact:true}).waitFor();await page.getByText('Inscrit (dossier)',{exact:true}).waitFor();await page.getByText(/Aucune inscription enregistrée/).waitFor();await page.getByText(/solde après ce paiement/).waitFor();assert.equal(await page.getByRole('button',{name:'Archiver',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:/Corriger/}).count(),0);assert((await page.locator('body').innerText()).includes('700 MAD'));
  await page.getByRole('button',{name:'Retour',exact:true}).click();await page.waitForURL(u=>u.pathname==='/students'&&u.searchParams.get('page')==='2');await page.getByRole('button',{name:'Page précédente'}).click();await page.waitForURL(u=>!u.searchParams.has('page')||u.searchParams.get('page')==='1');
  await page.getByLabel('Rechercher un apprenant').fill('absent');await page.getByText('Aucun apprenant correspondant à ces filtres.',{exact:true}).waitFor();await page.getByRole('button',{name:'Effacer les filtres',exact:true}).first().click();await page.getByRole('link',{name:longName,exact:true}).first().waitFor();
  studentMode='error';await navigate(app+'/students?q=failure');await page.clock.fastForward(3000);await page.getByRole('alert').filter({hasText:'Impossible de charger'}).waitFor();assert.equal(await page.getByRole('link',{name:longName,exact:true}).count(),0);studentMode='ready';await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByRole('link',{name:longName,exact:true}).first().waitFor();
  detailMode='error';await navigate(app+'/students/'+studentId);await page.getByText('Impossible de charger la fiche complète.',{exact:true}).waitFor();assert.equal(await page.getByText(/Aucune inscription enregistrée/).count(),0);detailMode='ready';await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByRole('heading',{name:longName,exact:true}).waitFor();
  detailMode='missing';await navigate(app+'/students/'+studentId);await page.getByText('Apprenant introuvable ou archivé.',{exact:true}).waitFor();detailMode='ready';
  console.log('PASS '+engine.name()+' Students context/read states');  phase=engine.name()+' Tasks read truth';crmMode='ready';await drainReads();hold=new Promise(r=>{release=r;});await navigate(app+'/crm/today');await page.getByText('Chargement…',{exact:true}).first().waitFor();release();hold=null;await page.getByTestId('work-row').waitFor();
  await drainReads();hold=new Promise(r=>{release=r;});const workRefresh=page.waitForRequest(r=>r.url().endsWith('/rpc/crm_get_work_queue'));await page.clock.fastForward(61000);await workRefresh;await page.getByText('Actualisation…',{exact:true}).waitFor();assert.equal(await page.getByTestId('work-row').count(),1);crmMode='error';release();hold=null;await page.clock.fastForward(3000);await page.getByRole('alert').filter({hasText:'Actualisation impossible'}).waitFor();assert.equal(await page.getByTestId('work-row').count(),1);
  crmMode='error';await navigate(app+'/crm/today?bucket=upcoming');await page.clock.fastForward(3000);await page.getByRole('alert').filter({hasText:'Impossible de charger'}).first().waitFor();assert.equal(await page.getByTestId('work-row').count(),0);
  crmMode='unavailable';await navigate(app+'/crm/today?bucket=tomorrow');await page.getByText('Informations indisponibles.',{exact:true}).waitFor();
  crmMode='empty';await navigate(app+'/crm/today?assignee=all');await page.getByText('Aucune tâche dans cette échéance et ce périmètre. Choisissez une autre échéance ou ajustez les filtres.',{exact:true}).waitFor();await navigate(app+'/crm/today');await page.getByRole('button',{name:'Effacer les filtres',exact:true}).last().waitFor();crmMode='ready';
  phase=engine.name()+' Students refreshing/unavailable';studentMode='ready';await drainReads();hold=new Promise(r=>{release=r;});await navigate(app+'/students');await page.getByText('Chargement…',{exact:true}).waitFor();release();hold=null;await page.getByRole('link',{name:longName,exact:true}).first().waitFor();
  await drainReads();hold=new Promise(r=>{release=r;});const studentRefresh=page.waitForRequest(r=>r.url().endsWith('/rpc/search_students_page'));await page.getByRole('combobox',{name:`Catégorie de ${longName}`}).selectOption('Teens (13-17)');await studentRefresh;await page.getByText('Actualisation…',{exact:true}).waitFor();studentMode='error';release();hold=null;await page.clock.fastForward(8000);await page.getByRole('alert').filter({hasText:'Actualisation impossible'}).waitFor();assert.equal(await page.getByRole('link',{name:longName,exact:true}).count(),1);
  studentMode='unavailable';await navigate(app+'/students?q=missing');await page.getByText('Informations indisponibles.',{exact:true}).waitFor();assert.equal(await page.getByText('0 apprenants correspondants',{exact:false}).count(),0);
  studentMode='empty';await navigate(app+'/students');await page.getByText('Aucun dossier dans le périmètre actif. Choisissez Tous les statuts ou ajoutez un apprenant.',{exact:true}).waitFor();studentMode='ready';
  }
  phase=engine.name()+' sidebar resize';await sidebarResize();
  phase=engine.name()+' responsive and keyboard';for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:375,height:812},{width:320,height:812},{width:720,height:450}]) {
   await page.setViewportSize(viewport);
   for(const route of ['/crm/leads?layout=list','/crm/today','/students']) {
    phase=engine.name()+' '+viewport.width+' '+route;await navigate(app+route);await page.waitForLoadState('networkidle');await noOverflow();const result=route.startsWith('/students')?page.getByRole('link',{name:longName,exact:true}):page.getByTestId(route.includes('today')?'work-row':viewport.width<1024?'opportunity-card':'opportunity-row')/* RCC-B1: the List table is desktop-only */;await result.first().waitFor();if(viewport.width<=390)await visibleFirstResult(result);if(viewport.width<=768)await touchTargets();if(route==='/students'&&viewport.width===768)await studentsTableKeyboard();
   }
   await navigate(app+'/students/'+studentId);await page.getByRole('heading',{name:longName,exact:true}).waitFor();await noOverflow();
   await navigate(app+'/crm/leads?lead='+leadId);await sheet.getByRole('heading',{name:longName,exact:true}).waitFor();await noOverflow();const box=await sheet.boundingBox();assert(box.x>=0&&box.x+box.width<=viewport.width+1);if(viewport.width<1024){const close=await sheet.getByRole('button',{name:'Fermer',exact:true}).boundingBox();assert(close.width>=44&&close.height>=44,'drawer close touch target is 44×44');}await page.screenshot({path:join(tmpdir(),`uif-${engine.name()}-${viewport.width}.png`)});await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
  }
  // Real CSS zoom stresses text/control reflow, in addition to the equivalent CSS viewport above.
  await page.setViewportSize({width:1440,height:900});
  for(const route of ['/crm/leads?layout=list','/crm/today','/students','/students/'+studentId]) {
   await navigate(app+route);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.documentElement.style.zoom='2');await page.waitForFunction(()=>getComputedStyle(document.documentElement).zoom==='2');await noOverflow();
   await page.evaluate(()=>document.documentElement.style.zoom='');
  }
  // Probe the actual semantic styles used by shared controls and untouched Radix consumers.
  const contrast=await page.evaluate(()=>{
   const probe=document.createElement('canvas'),paint=probe.getContext('2d');
   const rgb=color=>{paint.fillStyle=color;paint.fillRect(0,0,1,1);return [...paint.getImageData(0,0,1,1).data].slice(0,3);};
   const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   const token=name=>'hsl('+getComputedStyle(document.documentElement).getPropertyValue('--'+name)+')';
   const pairs=[['foreground','background'],['muted-foreground','card'],['primary-foreground','primary'],['accent-foreground','accent'],['destructive-foreground','destructive']].map(([a,b])=>({pair:a+'/'+b,ratio:ratio(token(a),token(b))}));
   const focus=ratio(token('ring'),token('card'));probe.remove();return {pairs,focus,accent:token('accent'),destructive:token('destructive')};
  });assert(contrast.pairs.every(p=>p.ratio>=4.5),JSON.stringify(contrast));assert(contrast.focus>=3);assert.notEqual(contrast.accent,contrast.destructive);
  await page.setViewportSize({width:390,height:844});await navigate(app+'/crm/leads?layout=list');await page.getByTestId('opportunity-card').waitFor();await search.focus();await page.keyboard.press('Tab');const focused=page.locator(':focus');assert.equal(await focused.count(),1);assert(await focused.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'),'visible keyboard focus');
  await page.getByTestId('opportunity-card').getByRole('button').first().focus();await page.keyboard.press('Enter');await sheet.waitFor();for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert(await page.locator(':focus').evaluate(el=>!!el.closest('[role=dialog]')),'drawer focus trap');}await page.keyboard.press('Escape');assert(await page.locator(':focus').evaluate(el=>!!el.closest('[data-testid=opportunity-card]')),'drawer focus returns to row');
  await page.getByRole('button',{name:'Ouvrir le menu'}).click();assert(await page.locator('#main-content').evaluate(el=>el.inert));await page.keyboard.press('Escape');assert(!(await page.locator('#main-content').evaluate(el=>el.inert)));
  await touchTargets();
  phase=engine.name()+' Placement read truth';placementMode='error';await navigate(app+'/placement-tests');await page.getByRole('alert').filter({hasText:'Impossible de charger'}).waitFor();assert.equal(await page.getByText('Aucun test de niveau enregistré.',{exact:false}).count(),0);assert(await page.getByRole('button',{name:'Planifier un test'}).isDisabled());placementMode='ready';await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByText('Aucun test de niveau enregistré. Planifiez un test pour un apprenant existant.',{exact:true}).waitFor();
  await ctx.clearCookies();await page.evaluate(()=>localStorage.clear());await login(users[1]);
  phase=engine.name()+' Dashboard read truth';await navigate(app+'/dashboard');await page.getByText('Aucun reçu enregistré ce mois.',{exact:true}).waitFor();assert((await page.getByRole('link',{name:/Total encaissé/}).innerText()).includes('0 MAD'));
  for(const mode of ['error','missing','malformed']) {
   financeMode=mode;monthlyMode=mode;await navigate(app+'/dashboard');await page.getByText(mode==='error' ? 'Impossible de charger le total encaissé.' : 'Total encaissé indisponible.',{exact:true}).waitFor();assert((await page.getByRole('link',{name:/Total encaissé/}).innerText()).includes('Indisponible'));assert.equal(await page.getByText('Aucun reçu enregistré ce mois.',{exact:true}).count(),0);assert.equal(await page.getByText('0 MAD',{exact:true}).count(),0,'failure never numeric zero');
  }
  financeMode='ready';monthlyMode='ready';rejectDashboard=true;await navigate(app+'/dashboard');await page.getByText('Impossible de charger le tableau de bord.',{exact:true}).waitFor();assert.equal(await page.getByText('Aucun reçu enregistré ce mois.',{exact:true}).count(),0);rejectDashboard=false;
  financeMode='error';await navigate(app+'/dashboard');await page.getByText('Impossible de charger le total encaissé.',{exact:true}).waitFor();await page.getByText('Aucun reçu enregistré ce mois.',{exact:true}).waitFor();financeMode='ready';monthlyMode='error';await page.getByRole('button',{name:'Réessayer',exact:true}).first().click();await page.getByRole('alert').filter({hasText:'Actualisation impossible'}).waitFor();assert((await page.getByRole('link',{name:/Total encaissé/}).innerText()).includes('0 MAD'),'independent successful total remains valid zero');
  assert(requests.filter(r=>r.name==='get_finance_charge_summary').every(r=>!r.args||Object.keys(r.args).length===0));assert(requests.filter(r=>r.name==='get_monthly_finance_summary').every(r=>Object.keys(r.args).join(',')==='p_month_start'));
  await page.waitForLoadState('networkidle');assert.deepEqual(errors,[]);assert(transportErrors.every(error=>cancelled.some(path=>error.message.includes(path))),JSON.stringify({transportErrors,cancelled}));assert.deepEqual(external,[]);
  await ctx.close();await browser.close();browser=null;console.log(`PASS ${engine.name()} UIF ${process.argv.includes('--responsive-only') ? 'focused responsive/zoom/contrast/keyboard/44×44 touch targets plus Dashboard/Placement read truth' : 'CRM/Students/Dashboard/Placement read states, answers/destinations, reset, responsive widths, focus, touch, return context'}`);
 }
} catch(error) {
 console.error(phase,error.message);if(page&&!page.isClosed())await page.screenshot({path:join(tmpdir(),'uif-failure.png'),fullPage:true});throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');sql(`begin;alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);}
}
