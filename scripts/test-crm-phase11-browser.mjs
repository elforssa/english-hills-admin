import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
// Same guard as the Phase 12 matrix: a local codex/ or claude/ branch, or a GitHub Actions pull request.
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
assert(branch.startsWith('codex/') || branch.startsWith('claude/') || (process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_EVENT_NAME==='pull_request'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(l=>{const m=l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const users=[],password=randomBytes(20).toString('hex'),connection=randomUUID(),run=randomUUID(),request=randomUUID();let browser;
// DGI-A live connection: USD spend, a completed live run and a failed run eligible for retry.
const live=randomUUID(),liveRun=randomUUID(),failedRun=randomUUID();
const liveSettings=JSON.stringify({mode:'live',enabled:true,account_id:'119800',currency:'USD',timezone:'Africa/Casablanca',api_version:'v25.0',secret_ref:'CRM_META_INSIGHTS_TOKEN_FIXTURE',refresh_days:28,refresh_interval_hours:6});
const app='http://localhost:3101';
try {
 for(const role of ['director','admin','receptionist']){
  const email=`phase11-${randomUUID()}@example.invalid`;
  const response=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});assert.equal(response.status,200);const user=await response.json();users.push({...user,email,role});sql(`update profiles set role='${role}' where id='${user.id}'`);
 }
 sql(`begin;insert into crm_integration_connections(id,provider,connection_key,page_id,api_version,created_by,updated_by,insights_settings) values('${connection}','meta','phase11-demo','119900','v99.0','${users[0].id}','${users[0].id}','{"mode":"mock","enabled":true,"account_id":"119900","currency":"MAD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE"}');
 insert into crm_meta_sync_runs(id,connection_id,request_key,date_from,date_to,config_snapshot,status,completed_at) values('${run}','${connection}','${request}','2026-01-01','2026-01-02','{}','completed',now());
 insert into crm_meta_objects(connection_id,account_id,object_type,external_id,current_name,objective) values('${connection}','119900','campaign','119901','Anglais annuel','OUTCOME_LEADS'),('${connection}','119900','adset','119902','Parents Casablanca',null),('${connection}','119900','ad','119903','Parler avec confiance',null);
 insert into crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,query_version,spend) values('${connection}','${run}','2026-01-01','119900','Africa/Casablanca','MAD','119901','119902','119903','ad-daily-v1',1200);
 insert into crm_integration_connections(id,provider,connection_key,page_id,api_version,created_by,updated_by,insights_settings) values('${live}','meta','phase11-live-demo','119800','v99.0','${users[0].id}','${users[0].id}','${liveSettings}');
 insert into crm_meta_sync_runs(id,connection_id,request_key,date_from,date_to,config_snapshot,status,completed_at,attempt_count) values('${liveRun}','${live}',gen_random_uuid(),'2026-01-01','2026-01-02','${liveSettings}','completed',now(),1);
 insert into crm_meta_sync_runs(id,connection_id,request_key,date_from,date_to,config_snapshot,status,error_code,attempt_count) values('${failedRun}','${live}',gen_random_uuid(),'2026-01-05','2026-01-06','${liveSettings}','failed','provider_auth',1);
 insert into crm_meta_objects(connection_id,account_id,object_type,external_id,current_name,objective) values('${live}','119800','campaign','119801','Rentrée USD','OUTCOME_LEADS');
 insert into crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,query_version,spend) values('${live}','${liveRun}','2026-01-01','119800','Africa/Casablanca','USD','119801','119802','119803','ad-daily-v1',300);commit;`);
 browser=await chromium.launch({headless:true});
 for(const user of users){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let analyticsQueries=0;page.on('request',r=>{if(/crm_get_marketing_cohort|crm_insights_diagnostics/.test(r.url()))analyticsQueries++;});
  // The scheduler endpoint authenticates only its own bearer, never a browser session.
  for(const headers of [{},{Authorization:'Bearer wrong'}]){const cron=await page.request.get(`${app}/api/cron/crm-insights`,{headers});assert.equal(cron.status(),401);assert.deepEqual(await cron.json(),{error:'Unauthorized'});}
  await page.goto(`${app}/login`);await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(u=>!u.pathname.startsWith('/login'));
  for(const headers of [{},{Authorization:'Bearer wrong'}]){const cron=await page.request.get(`${app}/api/cron/crm-insights`,{headers});assert.equal(cron.status(),401,`${user.role} cron`);}
  await page.goto(`${app}/crm/analytics`);
  if(user.role!=='director'){
   await page.waitForURL(u=>u.pathname===(user.role==='admin'?'/dashboard':'/crm/leads'));assert.equal(analyticsQueries,0);await expect(page.getByTestId('marketing-analytics')).toHaveCount(0);await expect(page.getByRole('link',{name:'Analyse marketing'})).toHaveCount(0);
   for(const target of [connection,live]){const denied=await page.request.post(`${app}/api/internal/crm/insights/process`,{headers:{Origin:app},data:{connection:target,request:randomUUID()}});assert.equal(denied.status(),403);}
  }else{
   await expect(page.getByTestId('marketing-analytics')).toBeVisible();await page.getByLabel('Acquisitions du',{exact:true}).fill('2026-01-01');await page.getByLabel('Acquisitions au',{exact:true}).fill('2026-01-02');await page.getByRole('button',{name:'Anglais annuel',exact:true}).waitFor();await expect(page.locator('tbody')).toContainText(/1[.\s]200/);await expect(page.locator('tbody')).toContainText('—');
   // MAD mock account: ROAS stays visible and the live state is off.
   await expect(page.getByTestId('insights-live-state')).toContainText('désactivée');await expect(page.locator('thead th',{hasText:/^ROAS$/})).toHaveCount(1);
   await page.screenshot({path:join(tmpdir(), 'hills-phase11-analytics-desktop.png'),fullPage:true});
   await page.getByRole('button',{name:'Anglais annuel',exact:true}).click();await page.getByRole('button',{name:'Parents Casablanca',exact:true}).click();await expect(page.locator('tbody')).toContainText('Parler avec confiance');
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(tmpdir(), 'hills-phase11-analytics-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   await page.getByLabel('Regrouper par').selectOption('adset');await page.getByRole('button',{name:'Parents Casablanca',exact:true}).click();await expect(page.locator('tbody')).toContainText('Parler avec confiance');
   await page.getByRole('button',{name:'Parler avec confiance',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody')).toContainText(/1[.\s]200/);
   sql(`insert into crm_meta_sync_runs(connection_id,request_key,date_from,date_to,config_snapshot,status,error_code) values('${connection}',gen_random_uuid(),'2026-01-01','2026-01-02','{}','partial','provider_unavailable')`);
   await page.getByRole('button',{name:'Actualiser',exact:true}).click();await expect(page.getByText('Une actualisation est en attente ou a échoué.',{exact:false})).toBeVisible();
   const denied=await page.request.post(`${app}/api/internal/crm/insights/process`,{headers:{Origin:'https://evil.invalid'},data:{connection,request:randomUUID()}});assert.equal(denied.status(),403);
   // Live USD account: state line on, ROAS card and column replaced by one explanatory line.
   await page.setViewportSize({width:1440,height:1000});
   await page.getByLabel('Compte publicitaire').selectOption({label:'phase11-live-demo · USD'});await page.getByLabel('Regrouper par').selectOption('campaign');
   await page.getByRole('button',{name:'Rentrée USD',exact:true}).waitFor();await expect(page.locator('tbody')).toContainText(/300[,.]?\d*\s*USD/);
   await expect(page.getByTestId('insights-live-state')).toContainText('activée');await expect(page.getByTestId('insights-live-state')).not.toContainText('désactivée');
   await expect(page.getByText('ROAS masqué : les dépenses sont en USD et les encaissements en MAD ; aucune conversion de devise n’est appliquée.',{exact:true})).toBeVisible();
   await expect(page.locator('thead th',{hasText:/^ROAS$/})).toHaveCount(0);await expect(page.getByText('ROAS Meta attribué',{exact:true})).toHaveCount(0);
   await expect(page.getByText('CAC Meta attribué',{exact:true})).toBeVisible();
   // Uncovered dates keep the unavailable warning, never zero.
   await page.getByLabel('Acquisitions au',{exact:true}).fill('2026-01-04');await expect(page.getByText('Dépenses indisponibles : la période n’est pas entièrement synchronisée.',{exact:true})).toBeVisible();
   await page.getByLabel('Acquisitions au',{exact:true}).fill('2026-01-02');
   // Synchronisation panel: French failure label, retry, manual refresh and 31-day-block backfill.
   await page.getByRole('button',{name:'Synchronisation',exact:true}).click();
   await expect(page.getByTestId('insights-sync-panel')).toContainText('Accès Meta refusé (jeton ou autorisation)');
   await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByText('Nouvelle tentative demandée',{exact:true})).toBeVisible();
   assert.equal(sql(`select status||':'||(next_attempt_at<=now())::text||':'||coalesce(error_code,'') from crm_meta_sync_runs where id='${failedRun}'`),'pending:true:');
   await page.getByRole('button',{name:'Actualiser les dépenses maintenant',exact:true}).click();await expect(page.getByText('Actualisation demandée',{exact:true})).toBeVisible();
   assert.equal(sql(`select count(*) from crm_meta_sync_runs where connection_id='${live}' and status='pending' and date_to-date_from=27 and date_to=(now() at time zone 'Africa/Casablanca')::date`),'1');
   await page.getByLabel('Rattrapage du',{exact:true}).fill('2025-10-01');await page.getByLabel('Rattrapage au',{exact:true}).fill('2025-12-03');
   await page.getByRole('button',{name:'Demander le rattrapage',exact:true}).click();await expect(page.getByText('3 bloc(s) demandés',{exact:false})).toBeVisible();
   assert.equal(sql(`select string_agg(date_from||'/'||date_to,',' order by date_from) from crm_meta_sync_runs where connection_id='${live}' and date_from<'2026-01-01'`),'2025-10-01/2025-10-31,2025-11-01/2025-12-01,2025-12-02/2025-12-03');
   // The process route queues a live, enabled connection and returns only the run identifier.
   const queued=await page.request.post(`${app}/api/internal/crm/insights/process`,{headers:{Origin:app},data:{connection:live,request:randomUUID(),from:'2026-02-01',to:'2026-02-02'}});
   assert.equal(queued.status(),202);assert.deepEqual(Object.keys(await queued.json()),['run_id']);
   // Connexion panel: identity locked after a published run; the live switch saves through crm_configure_insights.
   await page.getByRole('button',{name:'Connexion Meta Insights',exact:true}).click();
   await page.getByLabel('Connexion Meta').selectOption({label:'phase11-live-demo'});
   await expect(page.getByLabel('Compte publicitaire (ID)')).toBeDisabled();await expect(page.getByLabel('Compte publicitaire (ID)')).toHaveValue('119800');
   await expect(page.getByTestId('insights-connection-panel')).toContainText('figés depuis la première synchronisation publiée');
   await expect(page.getByLabel('Nom de la référence du jeton')).toHaveValue('CRM_META_INSIGHTS_TOKEN_FIXTURE');
   await page.getByRole('switch',{name:'Synchronisation Meta'}).click();await expect(page.getByText('Configuration Meta Insights enregistrée',{exact:true}).first()).toBeVisible();
   await expect(page.getByTestId('insights-live-state')).toContainText('désactivée');
   assert.equal(sql(`select insights_settings->>'enabled' from crm_integration_connections where id='${live}'`),'false');
   await page.getByRole('switch',{name:'Synchronisation Meta'}).click();await expect(page.getByTestId('insights-live-state')).not.toContainText('désactivée');
   assert.equal(sql(`select (insights_settings->>'enabled')||':'||(insights_settings->>'mode')||':'||(insights_settings->>'currency') from crm_integration_connections where id='${live}'`),'true:live:USD');
   const html=await page.content();assert(!html.includes('access_token'));
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(tmpdir(), 'hills-dgi-a-insights-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS Phase11 director desktop/mobile analytics, drilldown, no unavailable-as-zero, admin/receptionist route/query/API denial and origin protection; DGI-A live state, ROAS replacement, failure label, retry, refresh, backfill blocks, live 202, configuration switch and scheduler 401 for every role');
}finally{
 await browser?.close();sql(`begin;delete from crm_meta_daily_insights where connection_id in ('${connection}','${live}');delete from crm_meta_objects where connection_id in ('${connection}','${live}');delete from crm_meta_sync_runs where connection_id in ('${connection}','${live}');delete from crm_integration_connections where id in ('${connection}','${live}');commit;`);
 for(const u of users){
  sql(`delete from activity_log where actor_id='${u.id}' or target_id='${u.id}';`);
  // The synthetic director may be the only one: remove it the way the Phase 12 matrix does.
  if(sql(`select role from profiles where id='${u.id}'`)==='director')sql(`begin;alter table profiles disable trigger role_security_guard;delete from profiles where id='${u.id}';update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table profiles enable trigger role_security_guard;commit;`);
  sql(`delete from auth.users where id='${u.id}';`);
 }
}
