// Browser helper + real local CORS endpoint; no external landing page is created.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { processExternalJobs } from '../src/lib/crm/intake/worker.mjs';
assert(readFileSync('.git/HEAD','utf8').startsWith('ref: refs/heads/codex/'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(l=>{const m=l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
assert.equal(sql("select count(*) from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')"),'0');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const run=randomUUID(),password=randomBytes(20).toString('hex'),connection=randomUUID(),mapping=randomUUID(),optionalMapping=randomUUID();
let director,receptionist,browser,page,fixtureServer;
const limiterBefore=new Set(sql("select ctid::text from anon_rate_limits where scope='crm_inquiry:hour'").split("\n"));
const users=[];
try {
 for(const role of ['director','receptionist']){
  const email=`phase9-${run}-${role}@example.invalid`;
  const response=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(response.status,200);const user=await response.json();users.push({...user,email});sql(`update profiles set role='${role}' where id='${user.id}'`);
 }
 [director,receptionist]=users;
 sql(`begin;set local request.jwt.claim.sub='${director.id}';select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
 insert into crm_integration_connections(id,provider,connection_key,settings,enabled,created_by,updated_by) values('${connection}','website','test-${run}','{"origin":"http://localhost:3199"}',true,'${director.id}','${director.id}');
 insert into crm_form_mappings(id,channel,connection_id,form_key,form_name,version,field_map,question_labels,default_program_interest_text,default_session_type,effective_from,created_by)
 values('${mapping}','website','${connection}','annual','Programme annuel',1,'{"learner_name":"child"}','{"child":"Apprenant","days":"Jours préférés"}','Annual','Yearly','2020-01-01','${director.id}');
 insert into crm_form_mappings(id,channel,connection_id,form_key,form_name,version,field_map,question_labels,effective_from,created_by)
 values('${optionalMapping}','website','${connection}','general_contact_v1','General contact inquiry',1,'{"program_interest_text":"program_interest"}','{}','2020-01-01','${director.id}');commit;`);
 const centerQuery='select jsonb_build_array((select count(*) from students),(select count(*) from enrollments),(select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events))';
 const centerBefore=sql(centerQuery);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 fixtureServer=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost:3199').pathname;
  if(['/client.mjs','/attribution.mjs'].includes(path)){
   res.setHeader('Content-Type','text/javascript');return res.end(readFileSync('src/lib/crm/website'+path,'utf8'));
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="fr"><title>Fixture locale</title><body>Fixture navigateur uniquement</body></html>');
 });
 await new Promise((resolve,reject)=>{fixtureServer.once('error',reject);fixtureServer.listen(3199,'127.0.0.1',resolve);});
 await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3199/annual?utm_source=facebook&utm_campaign=browser-observed&fbclid=browser-click&email=never-store@example.invalid');
 await context.addCookies([{name:'_fbc',value:'existing-browser-fbc',url:'http://localhost:3199'},{name:'_fbp',value:'existing-browser-fbp',url:'http://localhost:3199'}]);
 const initial=await page.evaluate(async()=>{const m=await import('/client.mjs');return m.captureWebsiteAttribution({consent:true});});
 assert.equal(initial.landing_page,'http://localhost:3199/annual');assert.equal(initial.fbclid,'browser-click');assert.equal(initial.fbc,'existing-browser-fbc');
 await page.goto('http://localhost:3199/contact');
 const result=await page.evaluate(async site=>{
  const m=await import('/client.mjs');const attribution=m.captureWebsiteAttribution({consent:true});
  window.attempt=m.prepareWebsiteInquiry({site_key:site,form_key:'annual',contact:{name:'Sara navigateur site',phone:'0612345678'},answers:{child:'Adam navigateur site',days:['Lundi','Mardi'],landing_page:'https://private.example/?secret',cookies:'must-not-store',utm_campaign:'must-not-store'},attribution,consent:true});
  const response=await m.submitWebsiteInquiry('http://localhost:3101/api/public/crm-inquiry',window.attempt);
  const retry=await m.submitWebsiteInquiry('http://localhost:3101/api/public/crm-inquiry',window.attempt);
  const conflict=await fetch('http://localhost:3101/api/public/crm-inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.attempt,answers:{child:'Changed'}})});
  return {response,retry,status:conflict.status,attribution,key:window.attempt.request_key,stored:sessionStorage.getItem('eh:inquiry-attribution:v1')};
 },`test-${run}`);
 assert.deepEqual(result.attribution,initial);assert.deepEqual(result.response,{success:true,message:'Merci. Votre demande a bien été reçue.'});assert.deepEqual(result.retry,result.response);assert.equal(result.status,409);
 assert(!result.stored.includes('never-store'));assert(!result.stored.includes('Sara'));assert(!result.stored.includes(result.key));
 assert.equal(sql(`select count(*) from crm_ingestion_jobs where connection_id='${connection}'`),'1');
 assert.equal(sql(`select (payload->'answers') ?| array['landing_page','cookies','utm_campaign'] from crm_ingestion_jobs where connection_id='${connection}'`),'f');
 // The actual browser fetch above enforces CORS. Also verify the preflight contract explicitly.
 const options=await page.request.fetch('http://localhost:3101/api/public/crm-inquiry',{method:'OPTIONS',headers:{Origin:'http://localhost:3199','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
 assert.equal(options.status(),204);assert.equal(options.headers()['access-control-allow-origin'],'http://localhost:3199');
 assert.equal((await page.request.get('http://localhost:3101/api/public/crm-inquiry')).status(),405);
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw error;return data;};
 const outcomes=await processExternalJobs({rpc,env:{},provider:'website',fetchImpl:()=>{throw new Error('Website must not call provider');}});
 assert.equal(outcomes.length,1);assert.equal(outcomes[0].status,'done');
 const lead=sql(`select lead_id from crm_submissions where form_mapping_id='${mapping}'`);assert(lead);
 assert.equal(sql(`select count(*) from crm_tasks where lead_id='${lead}'`),'1');
 const attr=JSON.parse(sql(`select to_jsonb(a) from crm_submission_attribution a join crm_submissions s on s.id=a.submission_id where s.form_mapping_id='${mapping}'`));
 assert.equal(attr.provider,'website');assert.equal(attr.utm_campaign,'browser-observed');assert.equal(attr.fbc,'existing-browser-fbc');assert.equal(attr.fbp,'existing-browser-fbp');
 for(const field of ['campaign_id','ad_id','adset_id','page_id','raw_payload'])assert.equal(attr[field],null);
 assert.equal(sql(centerQuery),centerBefore);
 const unnamed=await page.evaluate(async site=>{
  const m=await import('/client.mjs');return m.submitWebsiteInquiry('http://localhost:3101/api/public/crm-inquiry',m.prepareWebsiteInquiry({site_key:site,form_key:'general_contact_v1',contact:{name:'Business contact',email:'business@example.invalid'},answers:{program_interest:'Formation entreprise',company_size:'10-20'},consent:true}));
 },`test-${run}`);
 assert.equal(unnamed.success,true);
 const ambiguous=await page.evaluate(async site=>{
  const m=await import('/client.mjs');return m.submitWebsiteInquiry('http://localhost:3101/api/public/crm-inquiry',m.prepareWebsiteInquiry({site_key:site,form_key:'general_contact_v1',contact:{name:'Sara navigateur site',phone:'0612345678'},answers:{program_interest:'Annual'},consent:true}));
 },`test-${run}`);
 assert.equal(ambiguous.success,true);
 const optionalOutcomes=await processExternalJobs({rpc,env:{},provider:'website',fetchImpl:()=>{throw new Error('Website must not call provider');}});
 assert.equal(optionalOutcomes.length,2);
 const unnamedLead=sql(`select l.id from crm_leads l join crm_contacts c on c.id=l.contact_id where c.email_normalized='business@example.invalid'`);
 assert(unnamedLead);
 assert.equal(sql(`select learner_name is null and learner_name_normalized is null from crm_leads where id='${unnamedLead}'`),'t');
 assert.equal(sql(`select count(*) from crm_tasks where lead_id='${unnamedLead}' and task_type='first_contact'`),'1');
 assert.equal(sql(`select count(*) from crm_submissions where form_mapping_id='${optionalMapping}' and match_status='needs_review'`),'1');
 assert.equal(sql(`select form_answers @> '[{"key":"company_size","value":"10-20"}]'::jsonb from crm_submissions where lead_id='${unnamedLead}'`),'t');
 await page.goto('http://localhost:3101/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));
 await page.getByLabel('Adresse email',{exact:true}).fill(receptionist.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));
 await page.goto(`http://localhost:3101/crm/leads?lead=${lead}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 await expect(page.getByRole('dialog')).toContainText('Adam navigateur site');await expect(page.getByRole('dialog')).toContainText('Site web');
 const content=await page.locator('body').innerText();for(const hidden of ['browser-observed','browser-click','existing-browser-fbc','existing-browser-fbp'])assert(!content.includes(hidden));
 await page.goto('http://localhost:3101/crm/today');
 await expect(page.locator('[data-testid="lead-row"]').filter({hasText:'Business contact'}).first()).toContainText('Apprenant à préciser');
 const review=page.locator('[data-testid="intake-review-item"]').filter({hasText:'Sara navigateur site'});
 await review.locator('summary').click();
 await review.getByLabel('Décision pour la demande').selectOption({label:'Nouveau prospect pour Sara navigateur site'});
 await expect(review.getByLabel('Apprenant (facultatif) de la demande')).toHaveValue('');
 await review.getByRole('button',{name:'Confirmer la décision'}).click();
 await page.getByText('Demande traitée').waitFor();
 assert.equal(sql(`select count(*) from crm_submissions where form_mapping_id='${optionalMapping}' and match_status='needs_review'`),'0');
 assert.equal(sql(`select count(*) from crm_submissions s join crm_leads l on l.id=s.lead_id where s.form_mapping_id='${optionalMapping}' and s.core_fields->>'contact_name'='Sara navigateur site' and l.learner_name is null`),'1');
 assert.equal(sql(`select count(*) from crm_leads l where l.learner_name is null and l.contact_id=(select contact_id from crm_leads where id='${lead}')`),'1');
 assert.equal(sql(`select count(*) from crm_leads where learner_name='Adam navigateur site'`),'1');
 await page.goto('http://localhost:3101/crm/leads');
 await page.getByPlaceholder('Nom du parent, apprenant ou téléphone…').fill('Business contact');
 await expect(page.locator('[data-testid="lead-row"]').filter({hasText:'Business contact'}).first()).toContainText('Apprenant à préciser');
 assert.equal(sql(centerQuery),centerBefore);
 await page.screenshot({path:'/private/tmp/hills-phase9-website-drawer.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/private/tmp/hills-phase9-website-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS browser website ingestion, unnamed lead and saved answers, conservative review/resolution, Today/Prospects, protected attribution, no center side effects');
} finally {
 if(browser)await browser.close();
 if(fixtureServer)await new Promise(resolve=>fixtureServer.close(resolve));
 const newLimiter=sql("select ctid::text from anon_rate_limits where scope='crm_inquiry:hour'").split('\n').filter(id=>id&&!limiterBefore.has(id));
 if(newLimiter.length)sql(`delete from anon_rate_limits where ctid::text in(${newLimiter.map(q).join(',')}) and scope='crm_inquiry:hour'`);
 if(director){sql(`begin;lock table crm_ingestion_jobs,crm_submissions,crm_submission_attribution,crm_leads,crm_tasks,crm_activities,crm_followup_policies,crm_form_mappings in access exclusive mode;
 create temp table cleanup_leads as select l.id,l.contact_id from crm_leads l where first_submission_id in(select id from crm_submissions where form_mapping_id in('${mapping}','${optionalMapping}'));
 delete from crm_ingestion_jobs where connection_id='${connection}';
 alter table crm_submission_attribution disable trigger crm_attribution_immutable;delete from crm_submission_attribution where submission_id in(select id from crm_submissions where form_mapping_id in('${mapping}','${optionalMapping}'));alter table crm_submission_attribution enable trigger crm_attribution_immutable;
 alter table crm_activities disable trigger crm_activities_immutable;alter table crm_submissions disable trigger crm_submission_immutable;
 with t as(delete from crm_tasks where lead_id in(select id from cleanup_leads)),a as(delete from crm_activities where lead_id in(select id from cleanup_leads)),s as(delete from crm_submissions where form_mapping_id in('${mapping}','${optionalMapping}')) delete from crm_leads where id in(select id from cleanup_leads);
 alter table crm_activities enable trigger crm_activities_immutable;alter table crm_submissions enable trigger crm_submission_immutable;
 delete from crm_contacts where id in(select contact_id from cleanup_leads);
 alter table crm_followup_policies disable trigger crm_policy_immutable;delete from crm_followup_policies where created_by='${director.id}';alter table crm_followup_policies enable trigger crm_policy_immutable;
 alter table crm_command_requests disable trigger crm_requests_immutable;delete from crm_command_requests where actor_scope in(${users.map(u=>q(u.id)).join(',')});alter table crm_command_requests enable trigger crm_requests_immutable;
 alter table crm_form_mappings disable trigger crm_mapping_immutable;delete from crm_form_mappings where connection_id='${connection}';alter table crm_form_mappings enable trigger crm_mapping_immutable;delete from crm_integration_connections where id='${connection}';commit;`);}
 for(const user of users)sql(`delete from auth.users where id='${user.id}';delete from rate_limits where user_id='${user.id}';delete from activity_log where actor_id='${user.id}' or target_id='${user.id}'`);
}
