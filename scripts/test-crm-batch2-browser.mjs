// Director lifecycle operations through a real local browser/Auth/PostgREST path.
// Fixtures are synthetic and cleanup restores all append-only guards.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
assert(branch.startsWith('codex/') || (process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_EVENT_NAME==='pull_request'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line=>{
  const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return match?[[match[1],match[2].trim().replace(/^['"]|['"]$/g,'')]]:[];
}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const sql=query=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{
  input:query,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},
}).trim();
const app='http://localhost:3101';
const base=env.NEXT_PUBLIC_SUPABASE_URL;
const connection=randomUUID(),mapping=randomUUID();
const suffix=Date.now().toString();
const pageId=`7${suffix}`.slice(0,14),formId=`8${suffix}`.slice(0,14);
const password=randomBytes(24).toString('hex');
const email=`crm-batch2-browser-${randomUUID()}@example.invalid`;
let user,browser;

try {
  const created=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
  if(created.status!==200) throw new Error(`Local user creation failed: ${created.status} ${await created.text()}`);
  user=await created.json();
  sql(`update public.profiles set role='director' where id='${user.id}';
    insert into public.crm_integration_connections(id,provider,connection_key,page_id,api_version,created_by,updated_by)
    values('${connection}','meta','batch2-browser-${suffix}','${pageId}','v99.0','${user.id}','${user.id}');
    insert into public.crm_form_mappings(id,connection_id,channel,form_key,version,form_name,field_map,effective_from,created_by)
    values('${mapping}','${connection}','meta_instant_form','${formId}',1,'Batch 2 browser form','{}','2020-01-01Z','${user.id}');`);

  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const page=await context.newPage(); page.setDefaultTimeout(60000);
  const pageErrors=[],serverErrors=[],captured=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('response',response=>{
    const url=new URL(response.url());
    if(['localhost','127.0.0.1'].includes(url.hostname) && response.status()>=500) serverErrors.push(`${response.status()} ${url.pathname}`);
    if(/crm_lifecycle_diagnostics|crm_list_external_deliveries|crm_publish_lifecycle_policy|crm_retire_lifecycle_policy|\/api\/internal\/crm\/lifecycle\/process/.test(response.url())){
      captured.push(response.text().then(body=>({url:response.url(),status:response.status(),body})).catch(()=>null));
    }
  });

  await page.goto(app+'/login?returnTo=/crm/integrations/lifecycle');
  await page.getByLabel('Adresse email',{exact:true}).waitFor();
  await page.getByLabel('Adresse email',{exact:true}).fill(email);
  await page.getByLabel('Mot de passe',{exact:true}).fill(password);
  await expect(page.getByRole('button',{name:'Se connecter',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.startsWith('/login'));
  await page.goto(app+'/crm/integrations/lifecycle');
  await expect(page.getByTestId('lifecycle-operations')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Retour de cycle Meta'})).toBeVisible();
  await expect(page.getByText('Non vérifié',{exact:true})).toBeVisible();
  await expect(page.getByText('Fermé',{exact:true})).toBeVisible();
  await expect(page.getByText('Activation bloquée comme prévu',{exact:true})).toBeVisible();
  await expect(page.getByRole('paragraph').filter({hasText:`batch2-browser-${suffix}`})).toBeVisible();
  await expect(page.getByRole('button',{name:'Désactiver'})).toBeDisabled();

  await page.getByLabel('Destination').selectOption(connection);
  await page.getByLabel('Formulaire').selectOption(mapping);
  await page.getByLabel('Version de notice').fill('browser-v1');
  await page.getByLabel('Digest SHA-256 de la notice').fill('a'.repeat(64));
  await page.getByLabel('Clé déclaration adulte').fill('adult_confirmed');
  await page.getByLabel('Valeurs adultes acceptées').fill('yes,true');
  await page.getByLabel('Clé partage Meta').fill('meta_sharing');
  await page.getByLabel('Valeurs partage acceptées').fill('yes,true');
  const start=new Date(Date.now()+5*60*1000),end=new Date(Date.now()+24*60*60*1000);
  const localValue=date=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  await page.getByLabel('Prend effet').fill(localValue(start));
  await page.getByLabel('Expire').fill(localValue(end));
  const publishResponse=page.waitForResponse(response=>response.url().includes('/rest/v1/rpc/crm_publish_lifecycle_policy'));
  await page.getByRole('button',{name:'Publier prospectivement'}).click();
  const published=await publishResponse;
  if(published.status()!==200) throw new Error(`Policy publish failed: ${published.status()} ${await published.text()} ${published.request().postData()}`);
  await expect(page.getByText('Notice browser-v1 · politique v1',{exact:true})).toBeVisible();

  const retireResponse=page.waitForResponse(response=>response.url().includes('/rest/v1/rpc/crm_retire_lifecycle_policy'));
  await page.getByRole('button',{name:'Retirer',exact:true}).click();
  const retired=await retireResponse;
  if(![200,204].includes(retired.status())) throw new Error(`Policy retirement failed: ${retired.status()} ${await retired.text()}`);
  await expect(page.getByRole('button',{name:'Retirée',exact:true})).toBeDisabled();

  const gate=await page.request.get(app+'/api/internal/crm/lifecycle/process');
  assert.equal(gate.status(),200); assert.deepEqual(await gate.json(),{live_server_gate:false});
  const reconcile=await page.request.post(app+'/api/internal/crm/lifecycle/process',{headers:{Origin:app}});
  if(reconcile.status()!==200) throw new Error(`Local reconcile failed: ${reconcile.status()} ${await reconcile.text()}`);
  assert.deepEqual(await reconcile.json(),{reconciled:0,live_delivery_enabled:false});
  const crossOrigin=await page.request.post(app+'/api/internal/crm/lifecycle/process',{headers:{Origin:'https://evil.invalid'}});
  assert.equal(crossOrigin.status(),403);
  await page.waitForLoadState('networkidle');

  const responses=(await Promise.all(captured)).filter(Boolean);
  for(const required of ['crm_lifecycle_diagnostics','crm_list_external_deliveries','crm_publish_lifecycle_policy','crm_retire_lifecycle_policy','/api/internal/crm/lifecycle/process']){
    assert(responses.some(item=>item.url.includes(required) && item.status<400),`Missing successful browser response: ${required}`);
  }
  const exposed=/secret_ref|access_token|source_external_id|form_answers|learner_|phone|email|\"payload\"|adult_accepted_values|sharing_accepted_values/i;
  for(const response of responses) assert(!exposed.test(response.body),`Sensitive field exposed by ${response.url}`);
  assert.deepEqual(pageErrors,[]); assert.deepEqual(serverErrors,[]);
  console.log('PASS director lifecycle controls, publish/retire network responses, fail-closed gate and no sensitive browser payloads');
  await context.close();
} finally {
  await browser?.close();
  if(user){
    sql(`begin;
      alter table public.crm_lifecycle_eligibility_policies disable trigger crm_lifecycle_policy_immutable;
      delete from public.crm_lifecycle_eligibility_policies where connection_id='${connection}';
      alter table public.crm_lifecycle_eligibility_policies enable trigger crm_lifecycle_policy_immutable;
      alter table public.crm_form_mappings disable trigger crm_mapping_immutable;
      delete from public.crm_form_mappings where id='${mapping}';
      alter table public.crm_form_mappings enable trigger crm_mapping_immutable;
      delete from public.crm_integration_connections where id='${connection}';
      delete from public.activity_log where actor_id='${user.id}' or target_id='${user.id}';
      alter table public.profiles disable trigger role_security_guard;
      delete from auth.users where id='${user.id}';
      update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
      alter table public.profiles enable trigger role_security_guard;
      commit;`);
  }
}
