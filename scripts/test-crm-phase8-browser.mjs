// Local browser integration. All provider I/O is blocked; fixtures are synthetic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
assert(readFileSync('.git/HEAD','utf8').startsWith('ref: refs/heads/codex/'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(l=>{const m=l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
assert.equal(sql("select count(*) from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')"),'0');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const run=randomUUID(),password=randomBytes(20).toString('hex'),connection=randomUUID(),mapping=randomUUID();
let director,receptionist,browser,page;
const users=[];
try {
 for(const role of ['director','receptionist']){
  const email=`phase8-${run}-${role}@example.invalid`;
  const response=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(response.status,200);const user=await response.json();users.push({...user,email});sql(`update profiles set role='${role}' where id='${user.id}'`);
 }
 [director,receptionist]=users;
 sql(`begin;set local request.jwt.claim.sub='${director.id}';select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
 insert into crm_integration_connections(id,connection_key,page_id,api_version,enabled,created_by,updated_by) values('${connection}','test-${run}','88888','v99.0',true,'${director.id}','${director.id}');
 insert into crm_form_mappings(id,connection_id,form_key,version,field_map,effective_from,created_by) values('${mapping}','${connection}','3',1,'{}','2020-01-01','${director.id}');commit;`);
 const centerBefore=sql('select jsonb_build_array((select count(*) from students),(select count(*) from enrollments),(select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events))');
 const payload={occurred_at:new Date().toISOString(),core_fields:{contact_name:'Sara demande Meta',phone:'0612345678',program_interest_text:'Annual'},form_answers:[{key:'days',label:'Jours préférés',value:['Lundi','Mardi'],value_type:'array',label_source:'mapping'},{key:'consent',label:'Souhaite un rappel',value:true,value_type:'boolean',label_source:'mapping'},{key:'age',label:'Âge',value:12,value_type:'number',label_source:'mapping'}],source_label:'Meta • Annual',attribution:{external_submission_id:'2',page_id:'88888',form_id:'3',campaign_id:'987654321987654321',attribution_status:'partial'}};
 sql(`begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';select crm_accept_meta_events('[{"page_id":"88888","leadgen_id":"2","form_id":"3","created_time":1700000000}]');select crm_claim_meta_jobs();select crm_finalize_meta_job(id,lease_token,'${mapping}',${q(JSON.stringify(payload))}) from crm_ingestion_jobs where connection_id='${connection}';commit;`);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3101/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));
 await page.getByLabel('Adresse email',{exact:true}).fill(receptionist.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/login'));
 await page.goto('http://localhost:3101/crm/today');
 assert.equal((await page.request.post('http://localhost:3101/api/internal/crm/meta/process', { headers: { Origin: 'http://localhost:3101' } })).status(),403);
 const verify=await page.request.get('http://localhost:3101/api/webhooks/meta/leads?hub.mode=subscribe&hub.verify_token=phase8-local-fixture-verify&hub.challenge=123');assert.equal(verify.status(),200);assert.equal(await verify.text(),'123');
 assert.equal((await page.request.post('http://localhost:3101/api/webhooks/meta/leads',{data:'{}'})).status(),403);
 const raw=JSON.stringify({object:'page',entry:[{id:'777777777',changes:[{field:'leadgen',value:{page_id:'777777777',leadgen_id:'2',form_id:'3',created_time:1700000000}}]}]});
 assert.equal((await page.request.post('http://localhost:3101/api/webhooks/meta/leads',{data:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','phase8-local-fixture-secret').update(raw).digest('hex')}})).status(),200);
 assert.equal(sql("select count(*) from crm_ingestion_jobs where external_key='777777777:2'"),'0');
 const review=page.getByRole('region',{name:'Demandes à vérifier'});await review.waitFor();await review.locator('summary').click();
 await expect(review).toContainText('Lundi, Mardi');await expect(review).toContainText('Oui');await expect(review).toContainText('12');assert(!(await page.locator('body').innerText()).includes('987654321987654321'));
 await page.screenshot({path:'/private/tmp/hills-phase8-review.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/private/tmp/hills-phase8-review-mobile.png',fullPage:true});
 await review.getByLabel('Apprenant de la demande',{exact:true}).fill('Adam demande Meta');await review.getByRole('button',{name:'Confirmer la décision'}).click();await expect(review).toHaveCount(0);
 const lead=sql(`select lead_id from crm_submissions where form_mapping_id='${mapping}'`);
 assert(lead);await page.goto(`http://localhost:3101/crm/leads?lead=${lead}`);await page.getByRole('dialog').getByText('Historique',{exact:true}).waitFor();
 await expect(page.getByRole('dialog')).toContainText('Adam demande Meta');assert(!(await page.locator('body').innerText()).includes('987654321987654321'));
 assert.equal(sql('select jsonb_build_array((select count(*) from students),(select count(*) from enrollments),(select count(*) from placement_tests),(select count(*) from charges),(select count(*) from receipts),(select count(*) from financial_events))'),centerBefore);
 assert.deepEqual(errors,[]);console.log('PASS receptionist intake review, safe typed answers, explicit resolution, normal lead drawer, mobile and no center side effects');
} finally {
 if(browser)await browser.close();
 if(director){sql(`begin;lock table crm_ingestion_jobs,crm_submissions,crm_submission_attribution,crm_leads,crm_tasks,crm_activities,crm_followup_policies,crm_form_mappings in access exclusive mode;
 create temp table cleanup_leads as select l.id,l.contact_id from crm_leads l where first_submission_id in(select id from crm_submissions where form_mapping_id='${mapping}');
 delete from crm_ingestion_jobs where connection_id='${connection}';
 alter table crm_submission_attribution disable trigger crm_attribution_immutable;delete from crm_submission_attribution where submission_id in(select id from crm_submissions where form_mapping_id='${mapping}');alter table crm_submission_attribution enable trigger crm_attribution_immutable;
 alter table crm_activities disable trigger crm_activities_immutable;alter table crm_submissions disable trigger crm_submission_immutable;
 with t as(delete from crm_tasks where lead_id in(select id from cleanup_leads)),a as(delete from crm_activities where lead_id in(select id from cleanup_leads)),s as(delete from crm_submissions where form_mapping_id='${mapping}') delete from crm_leads where id in(select id from cleanup_leads);
 alter table crm_activities enable trigger crm_activities_immutable;alter table crm_submissions enable trigger crm_submission_immutable;
 delete from crm_contacts where id in(select contact_id from cleanup_leads);
 alter table crm_followup_policies disable trigger crm_policy_immutable;delete from crm_followup_policies where created_by='${director.id}';alter table crm_followup_policies enable trigger crm_policy_immutable;
 alter table crm_command_requests disable trigger crm_requests_immutable;delete from crm_command_requests where actor_scope in(${users.map(u=>q(u.id)).join(',')});alter table crm_command_requests enable trigger crm_requests_immutable;
 alter table crm_form_mappings disable trigger crm_mapping_immutable;delete from crm_form_mappings where connection_id='${connection}';alter table crm_form_mappings enable trigger crm_mapping_immutable;delete from crm_integration_connections where id='${connection}';commit;`);}
 for(const user of users)sql(`delete from auth.users where id='${user.id}';delete from rate_limits where user_id='${user.id}';delete from activity_log where actor_id='${user.id}' or target_id='${user.id}'`);
}
