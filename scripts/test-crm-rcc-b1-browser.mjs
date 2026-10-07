// RCC-B1 responsive Opportunities acceptance: real local Auth, real pages, synthetic
// fixtures created through guarded RPCs and removed in finally. Chromium + WebKit.
// Every check first reads the active data-band/data-presentation, then asserts that mode.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import { chromium, webkit } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { BAND_QUERIES, historySummary, resolveBand, EVENTS } from '../src/lib/crm/presentation.mjs';
import { enrollmentSchoolYear } from '../src/lib/crm/enrollment.mjs';
assertLocalFeatureBranch();
process.on('unhandledRejection',error=>{console.error('unhandled',error?.message);});
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
const base='http://127.0.0.1:54321',app='http://localhost:3101';assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const run='rcc-b1-'+randomUUID(),password=randomBytes(24).toString('base64url'),users=[];
let browser,actor,page,phase='setup',context;const pageErrors=[],consoleErrors=[],writes=[],external=[];
const rpc=(name,data,id=actor,key=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(id)};set local role authenticated;select public.crm_${name}(${quote(key)},${quote(JSON.stringify(data))}::jsonb);commit;`));
const detail=id=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};select public.crm_get_workspace_detail('${id}');commit;`));
const timeline=id=>JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};set local role authenticated;select public.crm_get_timeline(p_lead=>'${id}',p_limit=>20);commit;`));
const act=(name,id,data={})=>rpc(name,{lead_id:id,expected_version:detail(id).version,...data});
const next=(type='callback')=>({task_type:type,due_at:new Date(Date.now()+3*86400000).toISOString()});
const phone=()=>'06'+String(randomInt(10000000,99999999));
const intake=(name,extra={})=>rpc('create_manual_lead',{display_name:name,learner_name:extra.learner||'Enfant synthétique',phone:phone(),source_label:'Manuel · Téléphone',...extra.data}).lead.id;
const LONG='أسماء عبد الرحمن بن عبد الله · Marie-Claire de la Roche Saint André';
const UNCERTAIN='Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.';
const WIDTHS=[{width:1440,height:900},{width:1280,height:800},{width:1024,height:768},{width:768,height:1024},{width:390,height:844}];
const EDGES=[639,640,767,768,1023,1024];
// B1_PHASES (e.g. 5,9) narrows a local iteration; the acceptance run executes every phase.
const PHASES=process.env.B1_PHASES?.split(','),on=n=>!PHASES||PHASES.includes(String(n));
const isWrite=name=>!/^crm_(get|list|find)_|^crm_enrollment_groups$/.test(name);
const sheet=()=>page.getByRole('dialog').first(),top=()=>page.getByRole('dialog').last();
const fermer=()=>sheet().getByRole('button',{name:'Fermer',exact:true});
// Drain the current route's reads before replacing its document (WebKit reports cancelled fetches as errors).
async function nav(url){await page.waitForTimeout(300);await page.waitForLoadState('networkidle');await page.goto(url);}
async function login(user){await page.goto(app+'/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.waitForTimeout(500);await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));}
async function newContext(engine,options={}){
 context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
 await context.route(url=>!['localhost','127.0.0.1'].includes(url.hostname),route=>{external.push(new URL(route.request().url()).hostname);return route.abort();});
 // E5 stand-in: a document-capture consumer registered before every app listener.
 await context.addInitScript(()=>{window.__b1Consume=false;document.addEventListener('keydown',event=>{if(event.key==='Escape'&&window.__b1Consume){window.__b1Consume=false;event.preventDefault();}},true);});
 page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>{pageErrors.push(`${engine.name()} ${phase}: ${e.message}`);});
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|access control checks/.test(m.text()))consoleErrors.push(`${engine.name()} ${phase}: ${m.text().slice(0,400)}`);});
 page.on('request',r=>{const m=r.url().match(/\/rest\/v1\/rpc\/(crm_[a-z_]+)/);if(m&&isWrite(m[1]))writes.push({name:m[1],phase});});
 await login(users[1]);
}
// Active mode, read from the page and from the shared media queries in the same engine.
async function mode(){return page.evaluate(q=>{const root=document.querySelector('[data-band]');return {band:root?.dataset.band,presentation:root?.dataset.presentation,sm:matchMedia(q.sm).matches,lg:matchMedia(q.lg).matches,coarse:matchMedia('(pointer: coarse)').matches,width:innerWidth,height:innerHeight};},BAND_QUERIES);}
async function assertBand(label){const m=await mode();assert.equal(m.band,resolveBand(m),`${label}: data-band follows the shared sm/lg queries ${JSON.stringify(m)}`);return m;}
async function noOverflow(label){const m=await page.evaluate(()=>{const main=document.getElementById('main-content');return {doc:document.documentElement.scrollWidth-document.documentElement.clientWidth,main:main?main.scrollWidth-main.clientWidth:0,x:window.scrollX};});assert(m.doc<=0&&m.main<=0&&m.x===0,`${phase} ${label}: page-level horizontal overflow ${JSON.stringify(m)}`);}
async function ready(){await page.locator('[data-presentation]').waitFor();await page.locator('[data-testid=opportunity-card]:visible,[data-testid=opportunity-row]:visible').first().waitFor();}
async function gotoLeads(query=''){await nav(app+'/crm/leads'+query);await ready();}
async function setSize(viewport){await page.setViewportSize(viewport);await page.waitForFunction(w=>innerWidth===w,viewport.width);await page.waitForTimeout(150);}
async function targets(scope,label){const small=await scope.evaluate(root=>[...root.querySelectorAll('button,select,input:not([type=checkbox]):not([type=radio]),summary,[data-touch-target]')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(el).visibility!=='hidden';}).map(el=>({name:el.getAttribute('aria-label')||el.textContent.trim().slice(0,40),h:Math.round(el.getBoundingClientRect().height),w:Math.round(el.getBoundingClientRect().width)})).filter(t=>t.h<44||t.w<44));assert.deepEqual(small,[],`${phase} ${label}: touch targets ≥ 44px below lg`);}
async function openDrawer(id,from='leads'){if(from==='leads')await nav(`${app}/crm/leads?lead=${id}`);await sheet().getByRole('heading',{name:'Historique',exact:true}).waitFor();}
async function closeDrawer(){await fermer().click();await page.waitForURL(url=>!url.searchParams.has('lead'));await page.locator('[role=dialog]').waitFor({state:'detached'});}
async function drawerShape(label,ordinary=false){
 const m=await mode(),shape=await sheet().evaluate(el=>{const body=el.querySelector('[data-drawer-body]'),head=el.querySelector('[data-drawer-header]'),r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,overflowY:getComputedStyle(el).overflowY,scrollTop:el.scrollTop,bodyScroll:body.scrollHeight>body.clientHeight,header:head.getBoundingClientRect().height,bodyBelow:body.getBoundingClientRect().top>=head.getBoundingClientRect().bottom-0.5,vw:document.documentElement.clientWidth,vh:innerHeight};});
 if(m.sm){assert(shape.width<=620.5&&Math.abs(shape.right-shape.vw)<1,`${label}: 620px side sheet ${JSON.stringify(shape)}`);}else assert(Math.abs(shape.width-shape.vw)<1&&shape.left<=0.5&&Math.abs(shape.height-shape.vh)<1,`${label}: full-screen phone sheet ${JSON.stringify(shape)}`);
 assert.equal(shape.overflowY,'hidden',`${label}: SheetContent does not scroll`);
 assert(shape.bodyBelow,`${label}: the body never sits under the header`);
 if(ordinary)assert(shape.header<=(m.sm?140:168),`${label}: drawer header height ${shape.header} with ordinary text`);
 assert.equal(await fermer().count(),1,`${label}: exactly one Fermer`);
 return {m,shape};
}
async function fermerPinned(label){
 await sheet().locator('[data-drawer-body]').evaluate(el=>{el.scrollTop=el.scrollHeight;});await page.waitForTimeout(100);
 assert.equal(await sheet().evaluate(el=>el.scrollTop),0,`${label}: SheetContent never scrolls`);
 const box=await fermer().boundingBox(),vp=page.viewportSize();assert(box&&box.y>=0&&box.y+box.height<=vp.height&&box.x+box.width<=vp.width,`${label}: Fermer stays visible ${JSON.stringify(box)}`);
 await sheet().locator('[data-drawer-body]').evaluate(el=>{el.scrollTop=0;});
}
async function focusIs(predicate,label,arg=null){await page.waitForFunction(predicate,arg,{timeout:10000}).catch(async()=>{throw new Error(`${phase} ${label}: focus is on ${await page.evaluate(()=>document.activeElement?.outerHTML?.slice(0,160))}`);});}
// A dialog is ready for Escape once its focus scope has moved focus inside it and the
// Radix layer stack has re-rendered the sheet below it (a few ms after mount).
async function dialogFocused(){await focusIs(()=>{const d=document.querySelectorAll('[role=dialog]');return d.length>1&&d[d.length-1].contains(document.activeElement);},'dialog focused');await page.waitForTimeout(150);}
async function noPopup(label){assert.equal(await page.locator('[role=tooltip],[data-radix-popper-content-wrapper],[role=menu]').count(),0,`${label}: no popup/tooltip open`);}
async function settle(){await page.waitForTimeout(120);}
// Escape sequences E1–E4 for any drawer host; reopen() opens the drawer, restored() checks host focus.
async function escapeSequences(label,reopen,restored){
 phase=label+' E1';await reopen();const more=sheet().getByRole('button',{name:'Autres actions',exact:true});
 assert.equal(await more.getAttribute('title'),null);assert.equal(await more.getAttribute('aria-describedby'),null,'no tooltip on Autres actions (R1)');
 await more.click();await page.locator('[role=menu]').waitFor();await page.keyboard.press('Escape');
 await page.locator('[role=menu]').waitFor({state:'detached'});assert(await sheet().isVisible(),label+' E1: the drawer stays open');
 await focusIs(()=>document.activeElement?.textContent?.trim()==='Autres actions','E1 focus returns to Autres actions');await settle();await noPopup(label+' E1 focus return');
 await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await page.waitForURL(url=>!url.searchParams.has('lead'));await restored();
 phase=label+' E2';await reopen();await sheet().getByRole('button',{name:'Autres actions',exact:true}).click();await page.getByRole('menuitem',{name:'Attribuer un responsable',exact:true}).click();
 await top().getByLabel('Responsable du prospect',{exact:true}).waitFor();await top().getByRole('button',{name:'Annuler',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);await focusIs(()=>document.activeElement?.textContent?.trim()==='Autres actions','E2 focus returns to Autres actions');await settle();await noPopup(label+' E2');
 await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await restored();
 phase=label+' E4';await reopen();await sheet().getByRole('button',{name:'Note',exact:true}).focus();await page.keyboard.press('Enter');await top().getByLabel('Note',{exact:true}).waitFor();await dialogFocused();
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);assert(await sheet().getByRole('heading',{name:'Historique'}).isVisible(),'E4: only the Dialog closed');
 await focusIs(()=>document.activeElement?.textContent?.trim()==='Note','E4 focus returns to Note');await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await restored();
}
try {
 assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean local policy baseline');
 for(const role of ['director','receptionist']){
  const email=`${run}-${role}@example.invalid`;
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(response.status,200);const user=await response.json();users.push({id:user.id,email,role});sql(`update public.profiles set role=${quote(role)},full_name=${quote('B1 synthétique '+role)} where id='${user.id}'`);
 }
 actor=users[1].id;rpc('create_followup_policy',{weekly_hours:Object.fromEntries([1,2,3,4,5,6,7].map(i=>[i,[['09:00','20:00']]]))},users[0].id);
 // Synthetic fixture through the real guarded commands: every stage except CONVERTED.
 const fresh=[];for(let i=0;i<27;i++)fresh.push(intake(`B1 nouveau ${String(i).padStart(2,'0')}`));
 const contacting=[];for(let i=0;i<4;i++){const id=intake(`B1 contact ${i}`),d=detail(id);rpc('record_call_outcome',{lead_id:id,expected_version:d.version,task_id:d.next_task.id,expected_task_version:d.next_task.version,outcome:'no_answer'});contacting.push(id);}
 const engaged=[];for(let i=0;i<3;i++){const id=intake(`B1 discussion ${i}`);act('record_conversation',id,{channel:'in_person',note:'Échange synthétique',next_task:next()});engaged.push(id);}
 const qualified=[];for(let i=0;i<5;i++){const id=intake(`B1 qualifié ${i}`,{learner:`B1 apprenant qualifié ${i}`});act('qualify_lead',id,{conversation_channel:'whatsapp',note:'Projet synthétique',qualification_step:'center_visit',next_task:next('center_visit')});qualified.push(id);}
 const lost=intake('B1 perdu');act('close_lost',lost,{reason:'price'});const nq=intake('B1 non qualifié');act('close_not_qualified',nq,{reason:'outside_scope'});
 // Rich prospect: long mixed name, history noise, a second open task (E3).
 const rich=intake(LONG,{learner:'Apprenant distinct · أحمد',data:{learner_age:9,program_interest_text:'Programme annuel · Anglais pour jeunes apprenants'}});
 for(let i=0;i<4;i++)act('add_note',rich,{note:`Note synthétique ${i}`});act('record_whatsapp',rich,{kind:'whatsapp_sent'});
 {const d=detail(rich);rpc('record_call_outcome',{lead_id:rich,expected_version:d.version,task_id:d.next_task.id,expected_task_version:d.next_task.version,outcome:'no_answer'});}
 sql(`insert into public.crm_tasks(lead_id,task_type,due_at,assigned_to,source_kind,source_key) values('${rich}','center_visit',now()+interval '4 days','${actor}','manual',${quote(run+':second')})`);
 // Tâches: an overdue task assigned to the receptionist. Calendar: a booked placement tomorrow.
 const taskLead=intake('B1 tâche en retard');sql(`update public.crm_tasks set due_at=now()-interval '1 minute',assigned_to='${actor}' where lead_id='${taskLead}' and status='open'`);
 const day=sql("select to_char((now() at time zone 'Africa/Casablanca')::date+1,'YYYY-MM-DD')");
 const calendarLead=intake('B1 calendrier');act('qualify_lead',calendarLead,{conversation_channel:'phone',note:'Test souhaité',qualification_step:'placement_test',next_task:next('confirm_placement_test')});
 {const d=detail(calendarLead);rpc('book_placement_test',{lead_id:calendarLead,expected_version:d.version,task_id:d.next_task.id,expected_task_version:d.next_task.version,date_test:day,heure:'10:00',examinateur:'Examinateur B1'});}
 const total=Number(sql(`select count(*) from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='${actor}')`));
 const ordinaryCard=fresh[5];
 console.log(`fixture: ${total} synthetic prospects (27 Nouveau, 4+1 Contact en cours, 3 En discussion, 6 Qualifié, 1 Perdu, 1 Non qualifié, overdue task, booked test)`);

 // B1_ENGINES narrows a local iteration; the acceptance run uses both engines.
 for(const engine of (process.env.B1_ENGINES||'chromium,webkit').split(',').map(name=>({chromium,webkit})[name])){
  const E=engine.name();browser=await engine.launch({headless:true});await newContext(engine);
  const startCalls=[];page.on('request',r=>{if(r.url().endsWith('/rpc/crm_start_enrollment'))startCalls.push(r.postDataJSON());});
  let opportunities=null;page.on('response',async r=>{if(r.url().endsWith('/rpc/crm_get_opportunities')&&r.ok()){const args=r.request().postDataJSON();if(!args.p_cursor&&!(args.p_layout==='board'&&args.p_stage)){const data=await r.json().catch(()=>null);if(data)opportunities={args,data};}}});

  if(on(1)){
  // 1. Width matrix: band parity, default presentation, budgets, containment, cards, overflow.
  for(const viewport of WIDTHS){
   phase=`${E} ${viewport.width}`;await setSize(viewport);await gotoLeads();const m=await assertBand(phase);
   assert.equal(m.presentation,m.band==='desktop'?'board':'stage-list',`${phase}: default presentation (D7)`);
   await noOverflow('default');
   if(m.band!=='desktop'){await targets(page.locator('#main-content'),'main');assert.equal(await page.locator('[data-testid=opportunity-card]:visible').first().evaluate(card=>{const b=card.querySelector('button');const [p,l]=b.querySelectorAll('span span');return p.getBoundingClientRect().bottom<=l.getBoundingClientRect().top+1&&Math.abs(p.getBoundingClientRect().left-l.getBoundingClientRect().left)<1;}),true,`${phase}: identity stacks vertically under the touch rule`);}
   const budget=await page.evaluate(()=>{const card=[...document.querySelectorAll('[data-testid=opportunity-card]')].find(c=>c.getClientRects().length);const second=[...document.querySelectorAll('[data-testid=opportunity-card]')].filter(c=>c.getClientRects().length)[1];const region=document.querySelector('[data-board-region]');return {first:card?.getBoundingClientRect().top,second:second?.getBoundingClientRect().top,region:region?.getBoundingClientRect().height,vh:innerHeight};});
   if(m.presentation==='board'){assert(budget.first<=300,`${phase}: first board card at ${budget.first}px`);if(m.lg&&m.height>=640)assert(budget.region>=0.55*budget.vh,`${phase}: board region ${budget.region}px ≥ 55%`);}
   else if(m.band==='tablet')assert(budget.first<=340,`${phase}: first tablet card at ${budget.first}px`);
   else {assert(budget.first<=360,`${phase}: first phone card at ${budget.first}px`);assert(budget.second<budget.vh,`${phase}: two results begin in the first viewport`);}
   if(m.presentation==='board'){
    const columns=await page.evaluate(()=>{const region=document.querySelector('[data-board-region]').getBoundingClientRect();return [...document.querySelectorAll('[data-board-stage]')].map(c=>{const r=c.getBoundingClientRect();return r.left>=region.left-1&&r.right<=region.right+1;}).filter(Boolean).length;});
    if(m.width>=1280)assert.equal(columns,5,`${phase}: 5/5 stages visible`);else{assert(columns>=3,`${phase}: ≥3 stages visible with the sidebar (${columns})`);await page.getByRole('group',{name:'Aller à l’étape'}).waitFor();}
    assert.equal(await page.getByRole('region',{name:'Tableau des opportunités, défilement horizontal'}).evaluate(el=>getComputedStyle(el).overflowX),'auto');
   }
   if(m.lg)assert(await page.locator('.operational-sidebar:not(#mobile-sidebar)').first().isVisible());else await page.getByRole('button',{name:'Ouvrir le menu',exact:true}).waitFor();
   // Card readability: long names wrap; ordinary desktop board card ≤ 150px.
   const longCard=page.locator(`[data-testid=opportunity-card][data-lead-id="${rich}"]:visible`);if(await longCard.count())assert(await longCard.evaluate(c=>c.scrollWidth<=c.clientWidth+1),`${phase}: long name wraps without clipping`);
   if(m.presentation==='board'){const h=await page.locator(`[data-testid=opportunity-card][data-lead-id="${ordinaryCard}"]`).evaluate(c=>c.getBoundingClientRect().height);assert(h<=150,`${phase}: ordinary card ${h}px ≤ 150`);}
   await page.screenshot({path:join(tmpdir(),`b1-${E}-${viewport.width}.png`)});
   // Drawer at each width: shape, single pinned Fermer, body order, close/Back.
   await openDrawer(rich);const {m:dm}=await drawerShape(phase+' drawer');await fermerPinned(phase+' drawer');
   const order=await sheet().evaluate(el=>['Prochaine action','Actions rapides','Toutes les prochaines actions','Demande','Test de niveau','Inscription','Historique'].map(t=>{const n=[...el.querySelectorAll('h3,p,summary,section[aria-label]')].find(x=>(x.getAttribute('aria-label')||x.textContent.trim()).startsWith(t));return n?n.getBoundingClientRect().top:null;}));
   assert(order.every(v=>v!==null)&&order.every((v,i)=>!i||v>order[i-1]),`${phase}: drawer body order ${JSON.stringify(order)}`);
   if(dm.band!=='desktop')await targets(sheet(),'drawer');
   await noOverflow('drawer');await page.screenshot({path:join(tmpdir(),`b1-${E}-${viewport.width}-drawer.png`)});
   if(dm.sm){await page.mouse.click(10,Math.round(viewport.height/2));await page.locator('[role=dialog]').waitFor({state:'detached'});}else await closeDrawer();
   await page.waitForURL(url=>!url.searchParams.has('lead'));
   // Dialog bounds and sticky footer (call dialog from the drawer's primary action).
   await openDrawer(fresh[1]);await drawerShape(phase+' ordinary drawer',true);await sheet().getByRole('button',{name:'Enregistrer un appel',exact:true}).click();await top().getByLabel('Résultat de l’appel',{exact:true}).waitFor();
   const dialogBox=await top().evaluate(el=>{const r=el.getBoundingClientRect(),f=el.querySelector('[data-dialog-footer]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,fb:f.bottom,ft:f.top,vw:innerWidth,vh:innerHeight,scroll:el.scrollHeight>el.clientHeight};});
   assert(dialogBox.top>=0&&dialogBox.bottom<=dialogBox.vh&&dialogBox.left>=0&&dialogBox.right<=dialogBox.vw,`${phase}: dialog within viewport ${JSON.stringify(dialogBox)}`);
   assert(dialogBox.fb<=dialogBox.bottom+1&&dialogBox.fb>=dialogBox.bottom-2,`${phase}: sticky footer at the dialog bottom ${JSON.stringify(dialogBox)}`);
   await noOverflow('dialog');await top().getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);await closeDrawer();
  }
  console.log(`PASS ${E} widths 1440/1280/1024/768/390: band parity, default presentation, budgets, board containment, card readability, drawer shape/order/single pinned Fermer, dialogs, zero page overflow`);

  }
  if(on(2)){
  // 2. Breakpoint edges: CSS-visible layout matches the JS band on both sides.
  for(const width of EDGES){
   phase=`${E} edge ${width}`;await setSize({width,height:900});await gotoLeads();const m=await assertBand(phase);
   if(width===767||width===768)assert.equal(m.band,'tablet',`${phase}: 767 and 768 both resolve to the tablet band`);
   assert.equal(m.presentation,m.band==='desktop'?'board':'stage-list');await noOverflow('edge');
   if(m.presentation==='stage-list'){const columns=await page.evaluate(()=>new Set([...document.querySelectorAll('[data-testid=opportunity-card]')].filter(c=>c.getClientRects().length).slice(0,4).map(c=>Math.round(c.getBoundingClientRect().left))).size);assert.equal(columns,m.band==='phone'?1:2,`${phase}: card columns`);}
   if(m.lg)assert(await page.locator('.operational-sidebar:not(#mobile-sidebar)').first().isVisible());else await page.getByRole('button',{name:'Ouvrir le menu',exact:true}).waitFor();
   if(m.band!=='desktop'){await page.getByRole('button',{name:'Tableau',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('layout')==='board');await page.locator('[data-board-region]').waitFor();assert.equal((await mode()).presentation,'board');await noOverflow('toggled board');
    if(width>=976){const visible=await page.evaluate(()=>{const region=document.querySelector('[data-board-region]').getBoundingClientRect();return [...document.querySelectorAll('[data-board-stage]')].filter(c=>{const r=c.getBoundingClientRect();return r.left>=region.left-1&&r.right<=region.right+1;}).length;});assert.equal(visible,5,`${phase}: 1023/1024 without the sidebar fits 5/5 stages with Tableau active`);}
    await gotoLeads();}
   await openDrawer(rich);await drawerShape(phase+' drawer');
   const grid=await sheet().getByRole('button',{name:'Autres actions',exact:true}).evaluate(b=>{const p=b.parentElement.getBoundingClientRect(),r=b.getBoundingClientRect();return Math.abs(r.width-p.width)<2;});assert.equal(grid,!m.sm,`${phase}: quick actions grid (full-width Autres actions only on phone)`);
   await closeDrawer();
  }
  console.log(`PASS ${E} edges 639/640, 767/768, 1023/1024: band = shared queries; card columns, sheet width, quick-action grid and shell follow the resolved band`);

  }
  if(on(3)){
  // 3. Stage chips (phone/tablet): chip set per view, counts, URL sync, pager reset, no commands.
  for(const width of [768,390,767,640,639]){
   phase=`${E} chips ${width}`;await setSize({width,height:900});opportunities=null;await gotoLeads();const m=await assertBand(phase);assert.equal(m.presentation,'stage-list');
   await page.waitForFunction(()=>true);const chips=page.getByRole('group',{name:'Étapes'});await chips.waitFor();
   const names=await chips.getByRole('button').evaluateAll(bs=>bs.map(b=>b.textContent.trim()));
   assert.deepEqual(names.map(n=>n.replace(/\s*[0-9—]+$/,'')),['Tous','Nouveau','Contact en cours','En discussion','Qualifié','Inscription confirmée']);
   await page.waitForFunction(()=>true);assert(opportunities,'list read observed');const {data}=opportunities;
   assert.equal(names[0],`Tous ${data.total}`,'Tous = total for the view and filters');
   for(const [i,key] of ['NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED'].entries())assert.equal(names[i+1].split(' ').at(-1),String(data.counts[key]),`${key} chip count`);
   const writesBefore=writes.length,stageRead=page.waitForRequest(r=>r.url().endsWith('/rpc/crm_get_opportunities')&&r.postDataJSON()?.p_stage==='CONTACTING');await chips.getByRole('button',{name:/^Contact en cours/}).click();const stageArgs=(await stageRead).postDataJSON();await page.waitForURL(url=>url.searchParams.get('stage')==='CONTACTING');
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid=opportunity-card]')].filter(c=>c.getClientRects().length).every(c=>c.dataset.stage==='CONTACTING'));
   assert.equal(await chips.getByRole('button',{name:/^Contact en cours/}).getAttribute('aria-pressed'),'true');assert.equal(stageArgs.p_layout,'list');assert.equal(stageArgs.p_cursor??null,null,'chip resets list paging');
   assert.equal(await page.locator('[data-testid=opportunity-card]:visible .inline-flex').count(),0,'single-stage cards hide the stage badge');
   await page.getByRole('button',{name:/^Filtres/}).click();const statut=top().getByLabel('Statut',{exact:true});await statut.waitFor();assert.equal(await statut.inputValue(),'CONTACTING','chips and Statut stay synchronized');
   await statut.selectOption('QUALIFIED');await page.waitForURL(url=>url.searchParams.get('stage')==='QUALIFIED');await top().getByRole('button',{name:'Voir les résultats',exact:true}).click();await page.locator('[role=dialog]').waitFor({state:'detached'});
   assert.equal(await chips.getByRole('button',{name:/^Qualifié/}).getAttribute('aria-pressed'),'true');
   await chips.getByRole('button',{name:/^Tous/}).click();await page.waitForURL(url=>!url.searchParams.has('stage'));
   // Dragging a card onto a chip does nothing.
   if(engine===chromium){await page.locator('[data-testid=opportunity-card]:visible').first().dragTo(chips.getByRole('button',{name:/^Qualifié/}));await settle();assert.equal(await page.locator('[role=dialog]').count(),0,'a chip is never a drop target');}
   assert.equal(writes.length,writesBefore,`${phase}: chip navigation issues no CRM command`);
   await gotoLeads('?view=closed');const closedChips=await page.getByRole('group',{name:'Étapes'}).getByRole('button').evaluateAll(bs=>bs.map(b=>b.textContent.trim().replace(/\s*[0-9—]+$/,'')));assert.deepEqual(closedChips,['Tous','Perdu','Non qualifié'],'closed view chips');
   await noOverflow('chips');
  }
  console.log(`PASS ${E} stage chips at 768/767/640/639/390: chip set per view, Tous = total, counts = counts, URL/Statut sync, pager reset, zero CRM commands, no drop target`);

  }
  if(on(4)){
  // 4. Board scroll restoration around crm:refresh; paging reset unchanged.
  for(const viewport of [{width:1024,height:768},{width:768,height:1024}]){
   phase=`${E} scroll ${viewport.width}`;await setSize(viewport);await gotoLeads('?layout=board');const m=await assertBand(phase);assert.equal(m.presentation,'board');
   const newColumn=page.locator('[data-board-stage="NEW"]');await newColumn.getByRole('button',{name:'Voir les suivants',exact:true}).click();await newColumn.getByRole('button',{name:'Précédents',exact:true}).waitFor();
   const region=page.locator('[data-board-region]'),max=await region.evaluate(el=>el.scrollWidth-el.clientWidth);
   const saved=await region.evaluate((el,target)=>{el.scrollLeft=target;return el.scrollLeft;},Math.min(260,max));
   await page.locator(`[data-board-stage="ENGAGED"] [data-testid=opportunity-card] button`).first().click();await sheet().getByRole('heading',{name:'Historique'}).waitFor();
   assert.equal(await region.evaluate(el=>el.scrollLeft),saved,'board stays mounted beneath the drawer');
   await sheet().getByRole('button',{name:'Note',exact:true}).click();await top().getByLabel('Note',{exact:true}).fill('Note B1 rafraîchissement');await top().getByRole('button',{name:'Enregistrer',exact:true}).click();await top().getByText('Action enregistrée.',{exact:false}).waitFor();await top().getByRole('button',{name:'Terminé',exact:true}).click();
   await closeDrawer();await newColumn.getByRole('button',{name:'Voir les suivants',exact:true}).waitFor();
   assert.equal(await newColumn.getByRole('button',{name:'Précédents',exact:true}).count(),0,'refresh still remounts the board: column paging back on page 1');
   const restored=await page.locator('[data-board-region]').evaluate(el=>({left:el.scrollLeft,max:el.scrollWidth-el.clientWidth}));
   assert(Math.abs(restored.left-Math.min(saved,restored.max))<=24,`${phase}: scroll restored ${JSON.stringify({saved,restored})}`);assert.equal(await page.evaluate(()=>window.scrollX),0);
  }
  console.log(`PASS ${E} board refresh at 1024 and 768 (Tableau): paging reset kept, horizontal scroll restored (≤24px), window.scrollX = 0`);

  }
  if(on(5)){
  // 5. Escape layering E1–E5 in Opportunities (1440, 390), Tâches and Calendar (390).
  const headingFocused=()=>focusIs(()=>document.activeElement?.tagName==='H1'||!!document.activeElement?.closest('[data-lead-id],[data-testid=work-row],[data-testid=calendar-event]'),'host focus restoration');
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   await setSize(viewport);await gotoLeads();
   await escapeSequences(`${E} Opportunités ${viewport.width}`,async()=>{const card=page.locator(`[data-testid=opportunity-card][data-lead-id="${engaged[0]}"]:visible button`).first();await card.scrollIntoViewIfNeeded();await card.focus();await page.keyboard.press('Enter');await sheet().getByRole('heading',{name:'Historique'}).waitFor();},()=>focusIs(id=>document.activeElement?.closest('[data-lead-id]')?.dataset.leadId===id,'focus returns to the opening card',engaged[0]));
   // E3 open-task menu; E5 popup-first order with the injected consumer.
   phase=`${E} E3 ${viewport.width}`;await openDrawer(rich);await sheet().getByText(/^Toutes les prochaines actions/).click();const option=sheet().getByRole('button',{name:/^Plus d’options/}).first();await option.click();await page.locator('[role=menu]').waitFor();
   await page.keyboard.press('Escape');await page.locator('[role=menu]').waitFor({state:'detached'});assert(await sheet().isVisible());await focusIs(()=>document.activeElement?.getAttribute('aria-label')?.startsWith('Plus d’options'),'E3 focus returns to the row trigger');await settle();
   await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await headingFocused();
   phase=`${E} E5 ${viewport.width}`;await openDrawer(rich);await sheet().getByRole('button',{name:'Autres actions',exact:true}).click();await page.locator('[role=menu]').waitFor();
   await page.evaluate(()=>{window.__b1Consume=true;});await page.keyboard.press('Escape');await page.waitForTimeout(400);
   assert.equal(await page.evaluate(()=>window.__b1Consume),false,'the stand-in consumed the first Escape');
   assert.equal(await page.locator('[role=menu][data-state=open]').count(),1,'E5: an already consumed Escape closes no registered popup');assert(await page.locator('[role=dialog]').first().isVisible(),'E5: the drawer remains open (aria-hidden behind the modal menu)');
   await page.keyboard.press('Escape');await page.locator('[role=menu]').waitFor({state:'detached'});assert(await sheet().isVisible());await settle();
   await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});
   // E4 busy: a pending command ignores Escape.
   phase=`${E} E4 busy ${viewport.width}`;await openDrawer(rich);await sheet().getByRole('button',{name:'Note',exact:true}).click();await top().getByLabel('Note',{exact:true}).fill('Note en attente');
   let release;const held=new Promise(resolve=>{release=resolve;});await page.route('**/rest/v1/rpc/crm_add_note',async route=>{await held;await route.fulfill({status:502,contentType:'text/plain',body:'Bad Gateway'});});
   await top().getByRole('button',{name:'Enregistrer',exact:true}).click();await top().getByRole('button',{name:'Enregistrement…'}).waitFor();await page.keyboard.press('Escape');await settle();
   assert.equal(await page.locator('[role=dialog]').count(),2,'E4: a busy dialog ignores Escape');release();await top().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();await page.unroute('**/rest/v1/rpc/crm_add_note');
   await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);await settle();await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});
  }
  await setSize({width:390,height:844});
  await escapeSequences(`${E} Tâches 390`,async()=>{await nav(app+'/crm/today?bucket=overdue');const row=page.locator('[data-testid=work-row]').filter({hasText:'B1 tâche en retard'});await row.getByRole('button',{name:'Voir le prospect',exact:true}).focus();await page.keyboard.press('Enter');await sheet().getByRole('heading',{name:'Historique'}).waitFor();},()=>focusIs(()=>!!document.activeElement?.closest('[data-testid=work-row]')||document.activeElement?.tagName==='H1','Tâches focus restoration'));
  phase=`${E} Tâches drawer 390`;await nav(app+'/crm/today?bucket=overdue');await page.locator('[data-testid=work-row]').filter({hasText:'B1 tâche en retard'}).getByRole('button',{name:'Voir le prospect',exact:true}).click();await drawerShape(phase);await fermerPinned(phase);await noOverflow('tâches drawer');await page.goBack();await page.locator('[role=dialog]').waitFor({state:'detached'});
  const calendarEvent=()=>page.locator(`[data-event-key="placement:${detail(calendarLead).next_placement.id}"]`);
  await escapeSequences(`${E} Calendrier 390`,async()=>{await nav(`${app}/placement-tests?view=calendar&date=${day}`);await calendarEvent().focus();await page.keyboard.press('Enter');await sheet().getByRole('heading',{name:'Historique'}).waitFor();},()=>focusIs(()=>!!document.activeElement?.closest('[data-testid=calendar-event]')||document.activeElement?.tagName==='H1','Calendar focus restoration'));
  phase=`${E} Calendar drawer 390`;await nav(`${app}/placement-tests?view=calendar&date=${day}`);await calendarEvent().click();await sheet().getByRole('heading',{name:'Historique'}).waitFor();await drawerShape(phase);await fermerPinned(phase);await noOverflow('calendar drawer');
  await page.goBack();await page.locator('[role=dialog]').waitFor({state:'detached'});assert.equal(new URL(page.url()).searchParams.get('view'),'calendar','Back closes the Calendar sheet');
  // E6 filter sheet; no Radix Select/Popover/tooltip anywhere in the drawer or filter sheet.
  phase=`${E} E6 390`;await gotoLeads();await page.getByRole('button',{name:/^Filtres/}).click();const filterSheet=top();await filterSheet.getByRole('heading',{name:'Filtres'}).waitFor();
  assert.equal(await filterSheet.locator('button[role=combobox],[aria-haspopup=listbox],[aria-haspopup=dialog],[role=tooltip]').count(),0,'filter sheet controls stay native');
  assert.equal(await filterSheet.getByRole('button',{name:'Fermer',exact:true}).count(),1);
  await filterSheet.getByLabel('Responsable',{exact:true}).focus();await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await focusIs(()=>document.activeElement?.textContent?.trim().startsWith('Filtres'),'E6 focus returns to Filtres');
  await openDrawer(rich);assert.equal(await sheet().locator('button[role=combobox],[aria-haspopup=listbox],[aria-haspopup=dialog],[role=tooltip]').count(),0,'drawer adds no Radix Select/Popover/tooltip');await closeDrawer();
  console.log(`PASS ${E} Escape E1–E6: menu → drawer, dialog return, open-task menu, dialog above drawer (and busy), order independence, filter sheet; Opportunities 1440/390, Tâches 390, Calendar 390; Calendar/Tâches phone sheets`);

  }
  if(on(6)){
  // 6. History and Demande at 1440 and 390, including per-read failure isolation.
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   phase=`${E} history ${viewport.width}`;await setSize(viewport);await openDrawer(rich);
   const rows=timeline(rich).rows,summary=historySummary(rows).map(r=>EVENTS[r.event_type]);
   const shown=await sheet().locator(`[id] > div > ol > li p:nth-child(2), [id] > ol > li p:nth-child(2)`).allInnerTexts();
   const historyList=sheet().getByRole('heading',{name:'Historique'}).locator('xpath=..').locator('ol > li');
   const collapsed=(await historyList.locator('p:nth-child(2)').allInnerTexts()).map(t=>t.split(' · ')[0]);
   assert(collapsed.length<=3,'collapsed shows ≤ 3');assert.deepEqual(collapsed,summary.map(t=>t.split(' · ')[0]),'collapsed = latest meaningful exchanges');void shown;
   await sheet().getByText('Derniers échanges',{exact:true}).waitFor();const toggle=sheet().getByRole('button',{name:'Afficher tout l’historique',exact:true});assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   await toggle.click();assert.equal(await historyList.count(),rows.length,'expanded shows the complete first page');assert(await sheet().getByText('Prochaine action planifiée',{exact:true}).count(),'bookkeeping visible when expanded');
   await sheet().getByRole('button',{name:'Charger les plus anciens',exact:true}).waitFor();await sheet().getByRole('button',{name:'Afficher les derniers échanges',exact:true}).click();assert(await historyList.count()<=3);
   phase=`${E} Demande ${viewport.width}`;for(const text of ['Origine du prospect · ','Dernière demande · ','Intérêt déclaré · ','Résumé de la dernière demande','Toutes les réponses aux formulaires'])await sheet().getByText(text,{exact:true}).waitFor();
   await sheet().getByText('Programme annuel · Anglais pour jeunes apprenants',{exact:true}).first().waitFor();
   await closeDrawer();
   await page.route('**/rest/v1/rpc/crm_get_operational_acquisition_summary',route=>route.fulfill({status:500,contentType:'application/json',body:'{"message":"synthetic failure"}'}));
   await openDrawer(rich);await sheet().getByText('Impossible de charger ces informations.').first().waitFor();await sheet().getByText('Origine du prospect · ',{exact:true}).waitFor();await sheet().getByText('Intérêt déclaré · ',{exact:true}).waitFor();
   assert.equal(await sheet().getByText('Dernière demande · ',{exact:true}).count(),0,'a failed acquisition read hides only its own lines');await page.unroute('**/rest/v1/rpc/crm_get_operational_acquisition_summary');await closeDrawer();
  }
  console.log(`PASS ${E} history (≤3 meaningful, expand/collapse, paging) and Demande (all former information, per-read failure isolation) at 1440 and 390`);

  }
  if(on(7)){
  // 7. Phone action reachability, keyboard/focus, dialog above the full-screen sheet, 320 reflow.
  phase=`${E} reachability 390`;await setSize({width:390,height:844});await gotoLeads();
  const card=page.locator(`[data-testid=opportunity-card][data-lead-id="${qualified[0]}"]:visible`);await card.scrollIntoViewIfNeeded();await card.getByRole('button',{name:/^Actions ·/}).click();
  const items=await page.getByRole('menuitem').allInnerTexts();assert.deepEqual(items,['Ouvrir l’inscription','Clôturer comme perdu','Clôturer comme non qualifié','Attribuer un responsable'],'grouped overflow keeps exactly today’s items');assert.equal(await page.locator('[role=menu] [role=separator]').count(),2);await page.keyboard.press('Escape');
  await openDrawer(qualified[0]);for(const name of ['Marquer comme fait','Replanifier','Annuler l’action','Appel','WhatsApp','Note','Planifier','Autres actions',"Commencer l'inscription",'Afficher tout l’historique']){const b=sheet().getByRole('button',{name,exact:true}).first();await b.scrollIntoViewIfNeeded();const box=await b.boundingBox();assert(box&&box.height>=44&&box.x>=0&&box.x+box.width<=390,`${phase}: ${name} reachable ${JSON.stringify(box)}`);}
  await sheet().getByRole('button',{name:'Autres actions',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allInnerTexts(),['Conversation au centre / autre canal','Clôturer comme perdu','Clôturer comme non qualifié','Attribuer un responsable','Réattribuer la prochaine action']);await page.keyboard.press('Escape');await page.locator('[role=menu]').waitFor({state:'detached'});
  phase=`${E} focus trap 390`;const noteButton=sheet().getByRole('button',{name:'Note',exact:true});await noteButton.focus();await page.keyboard.press('Enter');await top().getByLabel('Note',{exact:true}).waitFor();await dialogFocused();
  for(let i=0;i<8;i++){await page.keyboard.press(i%3===2?'Shift+Tab':'Tab');assert(await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]:last-of-type')||document.activeElement===document.querySelectorAll('[role=dialog]')[1]||!!document.querySelectorAll('[role=dialog]')[1]?.contains(document.activeElement)),'focus stays in the dialog');}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);await focusIs(()=>document.activeElement?.textContent?.trim()==='Note','dialog closes back to its trigger');await closeDrawer();
  phase=`${E} keyboard 1440`;await setSize({width:1440,height:900});await gotoLeads();await page.getByRole('searchbox',{name:'Rechercher un prospect'}).focus();
  let reached=false;for(let i=0;i<30&&!reached;i++){await page.keyboard.press('Tab');reached=await page.evaluate(()=>document.activeElement?.matches('[data-board-region]'));}
  assert(reached,'Tab order reaches the board region from the toolbar');await page.waitForTimeout(100);// lets the reduced-motion 0.01ms outline transition finish
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineWidth),'2px','2px focus');
  // WebKit's default Tab model skips buttons (Safari full keyboard access is off).
  if(engine===chromium)await page.keyboard.press('Tab');else await page.locator('[data-board-region] [data-testid=opportunity-card] button').first().focus();assert(await page.evaluate(()=>!!document.activeElement?.closest('[data-testid=opportunity-card]')),'then into the board cards');await page.keyboard.press('Enter');await sheet().getByRole('heading',{name:'Historique'}).waitFor();await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await focusIs(()=>!!document.activeElement?.closest('[data-board-region]'),'focus returns into the board');
  phase=`${E} reflow 320`;await setSize({width:320,height:700});await gotoLeads();await noOverflow('320 list');await openDrawer(rich);await noOverflow('320 drawer');await fermerPinned('320');await closeDrawer();
  console.log(`PASS ${E} phone touch-only reachability (card overflow grouped, every drawer action ≥44px), focus trap and return at 390, Tab order and 2px focus at 1440, 320 reflow`);

  }
  if(on(8)){
  // 8. Phone dialog with the long RCC-A2 uncertain alert; then the error-contract focus.
  phase=`${E} long alert 390`;await setSize({width:390,height:844});await openDrawer(qualified[1]);

  await sheet().getByRole('button',{name:"Commencer l'inscription",exact:true}).click();await top().getByText('1 / 3 · Apprenant').waitFor();
  await top().getByRole('button',{name:'Créer un nouvel apprenant',exact:true}).click();await top().getByRole('button',{name:'Continuer',exact:true}).click();await top().getByText('2 / 3 · Inscription').waitFor();
  await top().getByRole('button',{name:'Choisir une autre date',exact:true}).click();
  const step2=await top().evaluate(el=>{const f=el.querySelector('[data-dialog-footer]').getBoundingClientRect(),r=el.getBoundingClientRect();return {scrolls:el.scrollHeight>el.clientHeight,fb:f.bottom,bottom:r.bottom,top:r.top,vh:innerHeight};});
  assert(step2.scrolls,'step 2 scrolls at 390×844');assert(Math.abs(step2.fb-step2.bottom)<=2&&step2.bottom<=step2.vh,`sticky footer visible while the body scrolls ${JSON.stringify(step2)}`);
  await top().getByRole('button',{name:'Garder la date par défaut',exact:true}).click();await top().getByRole('button',{name:'Continuer',exact:true}).click();await top().getByText('3 / 3 · Vérification').waitFor();
  const responses=[{status:502,contentType:'text/plain',body:'Bad Gateway'},{status:400,contentType:'application/json',body:JSON.stringify({code:'22023',message:'Invalid new learner',details:null,hint:'crm_enrollment.birth_date_future'})}];
  await page.route('**/rest/v1/rpc/crm_start_enrollment',route=>route.fulfill(responses.shift()));startCalls.length=0;
  await top().getByRole('button',{name:'Créer la pré-inscription',exact:true}).click();await top().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
  const footer=await top().evaluate(el=>{const footer=el.querySelector('[data-dialog-footer]'),alert=el.querySelector('[role=alert]');const buttons=[...footer.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {name:b.textContent.trim(),inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};});return {inFooter:footer.contains(alert),buttons,frozen:el.querySelector('fieldset').disabled};});
  assert(footer.inFooter,'the uncertain alert sits in the sticky footer');assert.deepEqual(footer.buttons.map(b=>b.name),['Annuler','Retour','Créer la pré-inscription']);assert(footer.buttons.every(b=>b.inView),`footer buttons visible ${JSON.stringify(footer.buttons)}`);assert(footer.frozen,'frozen state intact');
  for(let i=0;i<10;i++){await page.keyboard.press(i%2?'Shift+Tab':'Tab');assert(await top().evaluate(el=>el.contains(document.activeElement)),'Tab/Shift+Tab stay in the dialog');}
  await noOverflow('long alert');
  await top().getByRole('button',{name:'Créer la pré-inscription',exact:true}).click();await top().getByText('1 / 3 · Apprenant').waitFor();assert.deepEqual(startCalls[1],startCalls[0],'same-key resend');
  const birth=top().getByLabel('Date de naissance (si connue)',{exact:true});await page.waitForFunction(()=>document.activeElement?.getAttribute('data-field')==='birth');
  const visible=await top().evaluate(el=>{const field=document.activeElement.getBoundingClientRect(),footer=el.querySelector('[data-dialog-footer]').getBoundingClientRect(),r=el.getBoundingClientRect();return field.top>=r.top&&field.bottom<=footer.top+1;});assert(visible,'the focused error field is fully visible above the footer');void birth;
  await page.unroute('**/rest/v1/rpc/crm_start_enrollment');await top().getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);await closeDrawer();
  console.log(`PASS ${E} 390×844 enrollment dialog: sticky footer while step 2 scrolls; long uncertain alert in the footer with Annuler/Retour/submit visible; Tab trapped; error field visible above the footer`);

  }
  if(on(9)){
  // 9. Frozen RCC-A2 retry survives breakpoint crossings (I5): same dialog node, same key/payload.
  phase=`${E} frozen across breakpoints`;await setSize({width:390,height:844});const frozenLead=qualified[2+(engine===chromium?0:1)];await openDrawer(frozenLead);
  await sheet().getByRole('button',{name:"Commencer l'inscription",exact:true}).click();await top().getByText('1 / 3 · Apprenant').waitFor();await top().getByRole('button',{name:'Créer un nouvel apprenant',exact:true}).click();
  await top().getByRole('button',{name:'Continuer',exact:true}).click();await top().getByText('2 / 3 · Inscription').waitFor();await top().getByRole('button',{name:'Continuer',exact:true}).click();await top().getByText('3 / 3 · Vérification').waitFor();
  await page.route('**/rest/v1/rpc/crm_start_enrollment',route=>route.fulfill({status:502,contentType:'text/plain',body:'Bad Gateway'}));startCalls.length=0;
  await top().getByRole('button',{name:'Créer la pré-inscription',exact:true}).click();await top().getByRole('alert').filter({hasText:UNCERTAIN}).waitFor();
  const handle=await top().elementHandle(),before=await top().evaluate(el=>el.innerText);const frozen=startCalls[0];assert(frozen?.p_request_key);
  for(const viewport of [{width:700,height:844},{width:390,height:844},{width:1000,height:800},{width:1100,height:800},{width:1000,height:800}]){await setSize(viewport);assert(await handle.evaluate(el=>el.isConnected),`dialog survives ${viewport.width}`);}
  assert.equal(await handle.evaluate(el=>el.innerText),before,'frozen view unchanged after crossing 640 and 1024');assert(await top().evaluate(el=>el.querySelector('fieldset').disabled));
  await page.unroute('**/rest/v1/rpc/crm_start_enrollment');await top().getByRole('button',{name:'Créer la pré-inscription',exact:true}).click();await top().getByText('Pré-inscription créée',{exact:true}).waitFor();
  assert.equal(startCalls.length,2);assert.equal(startCalls[1].p_request_key,frozen.p_request_key,'identical request key');assert.deepEqual(startCalls[1].p_data,frozen.p_data,'identical frozen payload');
  assert.equal(sql(`select count(*) from public.enrollments where student_id=(select student_id from public.crm_leads where id='${frozenLead}')`),'1');await top().getByRole('button',{name:'Terminé',exact:true}).click();await closeDrawer();
  console.log(`PASS ${E} frozen RCC-A2 request across 390→700→390 and 1000→1100→1000: same dialog node, unchanged frozen view, identical key and payload, one enrollment`);
  }
  await context.close();

  if(on(10)){
  // 10. Telephone D2 C: tel: only below 640px with a coarse pointer; recording unchanged.
  for(const [touch,cases] of [[true,[390,639,640,768]],[false,[390,1440]]]){
   await newContext(engine,touch?{hasTouch:true,...(engine===chromium?{isMobile:true}:{})}:{});
   for(const width of cases){
    phase=`${E} telephone ${touch?'coarse':'fine'} ${width}`;await setSize({width,height:900});await openDrawer(fresh[3]);const m=await mode();
    assert.equal(m.coarse,touch,`${phase}: pointer emulation asserted first`);
    await sheet().getByRole('button',{name:'Enregistrer un appel',exact:true}).click();await top().getByLabel('Résultat de l’appel',{exact:true}).waitFor();
    const link=top().getByRole('link',{name:/^Appeler/});const expected=m.coarse&&!m.sm;assert.equal(await link.count(),expected?1:0,`${phase}: tel: link ${expected?'present':'absent'}`);
    for(const text of ['Copier le numéro'])await top().getByRole('button',{name:text,exact:true}).waitFor();await top().getByText(detail(fresh[3]).phone,{exact:true}).waitFor();
    if(expected){assert.match(await link.getAttribute('href'),/^tel:\+212/);const count=sql(`select count(*) from public.crm_activities where lead_id='${fresh[3]}'`);await link.evaluate(node=>node.addEventListener('click',e=>e.preventDefault(),{once:true}));await link.click();await settle();assert.equal(sql(`select count(*) from public.crm_activities where lead_id='${fresh[3]}'`),count,'launching the call records nothing');}
    await top().getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);await closeDrawer();
   }
   await context.close();
  }
  console.log(`PASS ${E} telephone D2 C: coarse <640 → tel: present and records nothing; fine <640, coarse ≥640 and fine ≥640 → absent; number, Copier and recording always available`);
  }
  await browser.close();browser=null;
 }
 assert.deepEqual(external,[],'no external requests');assert.deepEqual(pageErrors,[],'no browser errors');
 console.log(PHASES||process.env.B1_ENGINES?`PARTIAL local iteration only (engines ${process.env.B1_ENGINES||'all'}, phases ${PHASES||'all'})`:'PASS RCC-B1 responsive Opportunities acceptance in Chromium and WebKit');
} catch(error){
 console.error(phase,error.message);if(pageErrors.length)console.error('page errors',pageErrors);if(consoleErrors.length)console.error('console errors',consoleErrors.slice(-6));
 if(page&&!page.isClosed()){await page.screenshot({path:join(tmpdir(),'b1-failure.png'),fullPage:true}).catch(()=>{});console.error('screenshot',join(tmpdir(),'b1-failure.png'));}
 throw error;
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');const linked=JSON.parse(sql(`select coalesce(json_agg(student_id) filter(where student_id is not null),'[]') from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))`));const studentIds=linked.map(quote).join(',')||'null';sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.placement_tests disable trigger crm_placement_integrity;alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_placements as(delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 delete from public.enrollments where student_id in(${studentIds});delete from public.students where id in(${studentIds});alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});commit;`);
 assert.equal(sql(`select count(*) from public.crm_leads`),'0');console.log('PASS synthetic browser fixtures removed; history guards restored');}
}
