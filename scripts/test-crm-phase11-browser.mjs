import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
assert(readFileSync('.git/HEAD','utf8').startsWith('ref: refs/heads/codex/'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(l=>{const m=l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const users=[],password=randomBytes(20).toString('hex'),connection=randomUUID(),run=randomUUID(),request=randomUUID();let browser;
try {
 for(const role of ['director','admin','receptionist']){
  const email=`phase11-${randomUUID()}@example.invalid`;
  const response=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});assert.equal(response.status,200);const user=await response.json();users.push({...user,email,role});sql(`update profiles set role='${role}' where id='${user.id}'`);
 }
 sql(`begin;insert into crm_integration_connections(id,provider,connection_key,page_id,api_version,created_by,updated_by,insights_settings) values('${connection}','meta','phase11-demo','119900','v99.0','${users[0].id}','${users[0].id}','{"mode":"mock","enabled":true,"account_id":"119900","currency":"MAD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE"}');
 insert into crm_meta_sync_runs(id,connection_id,request_key,date_from,date_to,config_snapshot,status,completed_at) values('${run}','${connection}','${request}','2026-01-01','2026-01-02','{}','completed',now());
 insert into crm_meta_objects(connection_id,account_id,object_type,external_id,current_name,objective) values('${connection}','119900','campaign','119901','Anglais annuel','OUTCOME_LEADS'),('${connection}','119900','adset','119902','Parents Casablanca',null),('${connection}','119900','ad','119903','Parler avec confiance',null);
 insert into crm_meta_daily_insights(connection_id,sync_run_id,insight_date,account_id,account_timezone,currency,campaign_id,adset_id,ad_id,query_version,spend) values('${connection}','${run}','2026-01-01','119900','Africa/Casablanca','MAD','119901','119902','119903','ad-daily-v1',1200);commit;`);
 browser=await chromium.launch({headless:true});
 for(const user of users){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let analyticsQueries=0;page.on('request',r=>{if(/crm_get_marketing_cohort|crm_insights_diagnostics/.test(r.url()))analyticsQueries++;});
  await page.goto('http://localhost:3101/login');await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));await page.getByLabel('Adresse email',{exact:true}).fill(user.email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(u=>!u.pathname.startsWith('/login'));
  await page.goto('http://localhost:3101/crm/analytics');
  if(user.role!=='director'){
   await page.waitForURL(u=>u.pathname===(user.role==='admin'?'/dashboard':'/crm/today'));assert.equal(analyticsQueries,0);await expect(page.getByTestId('marketing-analytics')).toHaveCount(0);await expect(page.getByRole('link',{name:'Analyse marketing'})).toHaveCount(0);
   const denied=await page.request.post('http://localhost:3101/api/internal/crm/insights/process',{headers:{Origin:'http://localhost:3101'},data:{connection,request:randomUUID()}});assert.equal(denied.status(),403);
  }else{
   await expect(page.getByTestId('marketing-analytics')).toBeVisible();await page.getByLabel('Acquisitions du',{exact:true}).fill('2026-01-01');await page.getByLabel('Acquisitions au',{exact:true}).fill('2026-01-02');await page.getByRole('button',{name:'Anglais annuel',exact:true}).waitFor();await expect(page.locator('tbody')).toContainText(/1[.\s]200/);await expect(page.locator('tbody')).toContainText('—');
   await page.screenshot({path:'/private/tmp/hills-phase11-analytics-desktop.png',fullPage:true});
   await page.getByRole('button',{name:'Anglais annuel',exact:true}).click();await page.getByRole('button',{name:'Parents Casablanca',exact:true}).click();await expect(page.locator('tbody')).toContainText('Parler avec confiance');
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/hills-phase11-analytics-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   await page.getByLabel('Regrouper par').selectOption('adset');await page.getByRole('button',{name:'Parents Casablanca',exact:true}).click();await expect(page.locator('tbody')).toContainText('Parler avec confiance');
   await page.getByRole('button',{name:'Parler avec confiance',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody')).toContainText(/1[.\s]200/);
   sql(`insert into crm_meta_sync_runs(connection_id,request_key,date_from,date_to,config_snapshot,status,error_code) values('${connection}',gen_random_uuid(),'2026-01-01','2026-01-02','{}','partial','provider_unavailable')`);
   await page.getByRole('button',{name:'Actualiser',exact:true}).click();await expect(page.getByText('Une actualisation est en attente ou a échoué.',{exact:false})).toBeVisible();
   const denied=await page.request.post('http://localhost:3101/api/internal/crm/insights/process',{headers:{Origin:'https://evil.invalid'},data:{connection,request:randomUUID()}});assert.equal(denied.status(),403);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS Phase11 director desktop/mobile analytics, drilldown, no unavailable-as-zero, admin/receptionist route/query/API denial and origin protection');
}finally{
 await browser?.close();sql(`begin;delete from crm_meta_daily_insights where connection_id='${connection}';delete from crm_meta_objects where connection_id='${connection}';delete from crm_meta_sync_runs where connection_id='${connection}';delete from crm_integration_connections where id='${connection}';commit;`);
 for(const u of users)sql(`delete from auth.users where id='${u.id}';delete from activity_log where actor_id='${u.id}' or target_id='${u.id}';`);
}
