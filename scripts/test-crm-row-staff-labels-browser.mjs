// UIF-r1a: real local Auth/RPCs, >50 synthetic staff, no directory scan.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, webkit } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
assertLocalFeatureBranch();
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]] : [];
}));
const base = 'http://127.0.0.1:54321', app = 'http://localhost:3101';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
const sql = s => execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const quote = s => "'"+String(s).replaceAll("'","''")+"'";
const run = 'uif-row-staff-'+randomUUID(), password = randomBytes(24).toString('base64url'), users = [];
const sharedName = 'Équipe UIF doublon', uniqueName = 'UIF nom unique';
let browser, actor;
const rpc = (name,data,id=actor) => JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(id)};set local role authenticated;select public.crm_${name}(${quote(randomUUID())},${quote(JSON.stringify(data))}::jsonb);commit;`));
const read = query => JSON.parse(sql(`begin;set local request.jwt.claim.sub=${quote(actor)};set local role authenticated;select ${query};commit;`));
try {
  assert.equal(sql('select count(*) from public.crm_followup_policies'),'0','clean synthetic policy baseline');
  for (const role of ['director','receptionist']) {
    const email = `${run}-${role}@example.invalid`;
    const response = await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
    assert.equal(response.status,200);const user = await response.json();users.push({id:user.id,email,role});
    sql(`update public.profiles set role=${quote(role)},full_name=${quote(sharedName)} where id=${quote(user.id)}`);
  }
  actor = users[1].id;
  // Shared UUID prefix deliberately forces 109's variable-length reference rule.
  for (let i=1;i<=52;i++) {
    const id = 'ac110000-0000-0000-0000-'+String(i).padStart(12,'0');
    sql(`insert into auth.users(id,email,aud,role) values(${quote(id)},${quote(`${run}-${i}@example.invalid`)},'authenticated','authenticated');update public.profiles set role='receptionist',full_name=${quote(i===1?uniqueName:sharedName)} where id=${quote(id)}`);
    users.push({id,role:'receptionist'});
  }
  const first = read('public.crm_list_staff(50,0)'), second = read('public.crm_list_staff(50,50)');
  assert.equal(first.rows.length,50);assert(second.rows.length>=2 && second.rows.length<=50);
  const candidates = second.rows.filter(p=>users.some(u=>u.id===p.id) && p.name===sharedName);
  assert(candidates.length>=2,'two synthetic identities outside page 1');
  const [owner,assignee] = candidates;
  assert.notEqual(owner.id,assignee.id);assert(!first.rows.some(p=>[owner.id,assignee.id].includes(p.id)));
  const staffRows = [...first.rows,...second.rows];
  assert.equal(new Set(staffRows.map(p=>p.display_label)).size,staffRows.length);
  assert.equal(staffRows.find(p=>p.name===uniqueName).display_label,uniqueName);
  assert.equal(staffRows.find(p=>p.id===users[0].id).display_label,sharedName+' · Direction');
  assert(owner.display_label.startsWith(sharedName+' · Accueil · Réf. '));
  assert(assignee.display_label.startsWith(sharedName+' · Accueil · Réf. '));
  assert(!owner.display_label.includes(owner.id));assert(!assignee.display_label.includes(assignee.id));
  for (const row of staffRows) assert.deepEqual(Object.keys(row).sort(),['display_label','id','name','role']);
  // Independent SQL oracle: migration 109's exact pre-amendment picker body.
  const original = readFileSync('supabase/migrations/109_crm_operational_scheduled_display.sql','utf8');
  const start = original.indexOf('create or replace function public.crm_list_staff(');
  const end = original.indexOf('end $$;',start)+8;
  const oracle = original.slice(start,end).replace('public.crm_list_staff','pg_temp.uif_109_list_staff');
  const expected = JSON.parse(sql(`begin;${oracle};set local request.jwt.claim.sub=${quote(actor)};select pg_temp.uif_109_list_staff(100,0);rollback;`));
  assert.deepEqual(staffRows,expected.rows,'exact migration-109 label authority, including colliding references');
  const hours = Object.fromEntries([1,2,3,4,5,6,7].map(i=>[i,[['09:00','20:00']]]));
  rpc('create_followup_policy',{weekly_hours:hours},users[0].id);
  const lead = rpc('create_manual_lead',{display_name:'UIF stable row identity',learner_name:'Apprenant synthétique',phone:'0612345678',source_label:'Manuel · Téléphone'}).lead.id;
  sql(`update public.crm_leads set owner_id=${quote(owner.id)} where id=${quote(lead)};update public.crm_tasks set assigned_to=${quote(assignee.id)},due_at=now()-interval '1 hour' where lead_id=${quote(lead)} and status='open'`);
  const detail = read(`public.crm_get_workspace_detail(${quote(lead)})`);
  const task = detail.open_tasks[0];
  assert.equal(detail.owner_display_label,owner.display_label);
  assert.equal(task.assignee_display_label,assignee.display_label);
  assert.equal(detail.next_task.assignee_display_label,assignee.display_label);
  assert.equal(sql("select has_function_privilege('authenticated','crm_security.staff_display_label(uuid)','execute') or has_function_privilege('anon','crm_security.staff_display_label(uuid)','execute') or has_function_privilege('service_role','crm_security.staff_display_label(uuid)','execute')"),'f');
  console.log('PASS 54-staff fixture, exact 109 SQL oracle, drawer/open-task labels and private helper denial');
  for (const engine of [chromium,webkit]) {
    browser = await engine.launch({headless:true});
    const ctx = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    const external = [], errors = [], requests = [], payloads = [], pending = new Set();
    await ctx.route(url=>!['localhost','127.0.0.1'].includes(url.hostname),route=>{external.push(new URL(route.request().url()).hostname);return route.abort();});
    const page = await ctx.newPage();page.setDefaultTimeout(20000);
    // Drain route reads/prefetches before replacing the document (WebKit).
    const navigate = async url => { await page.waitForTimeout(600);await page.waitForLoadState('networkidle');await page.goto(url); };
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.url().includes('/rest/v1/'))requests.push({name:new URL(r.url()).pathname.split('/').at(-1),args:r.postDataJSON()});});
    page.on('response',r=>{
      if(!r.ok() || !/\/rpc\/crm_(list_staff|get_opportunities|get_work_queue|get_workspace_detail|list_open_tasks)$/.test(new URL(r.url()).pathname))return;
      const work=r.json().then(data=>payloads.push({name:new URL(r.url()).pathname.split('/').at(-1),data}));pending.add(work);work.finally(()=>pending.delete(work));
    });
    await navigate(app+'/login');
    await page.waitForFunction(()=>Object.keys(document.querySelector('#email')||{}).some(k=>k.startsWith('__reactProps')));
    await page.getByLabel('Adresse email',{exact:true}).fill(users[1].email);
    await page.getByLabel('Mot de passe',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(u=>u.pathname!='/login');
    const pageStaff = async (next,previous,select) => {
      await page.getByRole('button',{name:next,exact:true}).click();
      await select.locator(`option[value="${owner.id}"]`).waitFor({state:'attached'});
      await page.getByRole('button',{name:previous,exact:true}).click();
      await select.locator(`option[value="${owner.id}"]`).waitFor({state:'detached'});
    };
    for (const layout of ['board','list']) {
      await navigate(app+'/crm/leads?layout='+layout);
      const row=layout==='board'?page.locator(`[data-testid="opportunity-card"][data-lead-id="${lead}"]`):page.getByTestId('opportunity-row').filter({hasText:'UIF stable row identity'});
      await row.getByText(owner.display_label,{exact:layout==='list'}).waitFor();
      const before=await row.innerText();
      await page.getByText('Plus de filtres',{exact:false}).click();
      await pageStaff('Responsables suivants','Responsables précédents',page.getByLabel('Responsable',{exact:true}));
      assert.equal(await row.innerText(),before,'unchanged '+layout+' owner across picker pages');
      console.log('PASS '+engine.name()+' '+layout+' initial owner and stable picker pages');
    }
    await navigate(app+'/crm/today?bucket=overdue&assignee=all');
    const row=page.locator(`[data-task-id="${task.id}"]`);
    await row.getByText('Responsable de la tâche : '+assignee.display_label+' · Responsable du prospect : '+owner.display_label,{exact:false}).waitFor();
    const before=await row.innerText();
    await pageStaff('Équipe suivante','Équipe précédente',page.getByLabel('Responsable de la tâche',{exact:true}));
    assert.equal(await row.innerText(),before,'unchanged task assignee/owner across picker pages');
    await row.getByRole('button',{name:'Voir le prospect',exact:true}).click();
    const drawer=page.getByRole('dialog').first();await drawer.getByText('Historique',{exact:true}).waitFor();
    await drawer.getByRole('button',{name:'Responsable du prospect : '+owner.display_label,exact:true}).waitFor();
    await drawer.getByText('Responsable de la tâche : '+assignee.display_label,{exact:true}).waitFor();
    // Current assignment stays labelled when absent from the bounded dialog page.
    await drawer.getByRole('button',{name:'Responsable du prospect : '+owner.display_label,exact:true}).click();
    let dialog=page.getByRole('dialog').last(),select=dialog.getByLabel('Responsable du prospect',{exact:true});
    await select.waitFor();assert.equal(await select.locator('option:checked').textContent(),owner.display_label);
    for (const button of ['Suivants','Précédents']) {
      await dialog.getByRole('button',{name:button,exact:true}).click();
      // Cached picker pages need not issue another transport request.
      await select.locator(`option[value="${first.rows[0].id}"]`).waitFor({state:button==='Suivants'?'detached':'attached'});
      assert.equal(await select.locator('option:checked').textContent(),owner.display_label);
    }
    await dialog.getByRole('button',{name:'Annuler',exact:true}).click();
    await drawer.getByRole('button',{name:'Réattribuer l’action',exact:true}).click();
    dialog=page.getByRole('dialog').last();select=dialog.getByLabel('Responsable de l’action',{exact:true});await select.waitFor();
    assert.equal(await select.locator('option:checked').textContent(),assignee.display_label);
    await dialog.getByRole('button',{name:'Annuler',exact:true}).click();
    await page.waitForLoadState('networkidle');await Promise.all([...pending]);
    for (const request of requests.filter(r=>r.name==='crm_list_staff')) {
      assert.equal(request.args.p_limit,50);assert([0,50].includes(request.args.p_offset),'only explicit bounded picker pages');
    }
    assert(!requests.some(r=>r.name==='crm_reassign'),'picker navigation never changes assignment');
    for (const {name,data} of payloads) {
      if(name==='crm_list_staff')for(const p of data.rows)assert.deepEqual(Object.keys(p).sort(),['display_label','id','name','role']);
      if(name==='crm_get_opportunities')for(const p of Object.values(data.pages))for(const l of p.rows)if(l.id===lead)assert.equal(l.owner_display_label,owner.display_label);
      if(name==='crm_get_work_queue')for(const t of data.rows) {
        assert.deepEqual(Object.keys(t).sort(),['assigned_to','assignee_display_label','assignee_name','attempt_ordinal','due_at','id','lead','lead_id','local_date','local_time','scheduled_end_at','task_type','version']);
        assert.deepEqual(Object.keys(t.lead).sort(),['contact_name','id','learner_name','owner_display_label','owner_id','owner_name','program','status','version']);
        if(t.id===task.id){assert.equal(t.assignee_display_label,assignee.display_label);assert.equal(t.lead.owner_display_label,owner.display_label);assert.notEqual(t.assigned_to,t.lead.owner_id);}
      }
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await ctx.close();await browser.close();browser=null;
    console.log('PASS '+engine.name()+' 54-staff Board/List, task assignee ≠ owner, drawer/current selection, initial outside-page-1 identity, stable 1→2→1 pages, 109 duplicate/reference rule, bounded picker and fixed safe fields');
  }
} finally {
 if(browser)await browser.close();
 if(users.length){const ids=users.map(u=>quote(u.id)).join(',');sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 -- Transaction-only teardown indexes prevent quadratic FK probes on the large synthetic fixture.
 create index o3_test_cleanup_activity_task on public.crm_activities(task_id,lead_id);
 create index o3_test_cleanup_activity_prior on public.crm_activities(supersedes_activity_id,lead_id);
 create index o3_test_cleanup_task_source on public.crm_tasks(source_activity_id,lead_id);
 create index o3_test_cleanup_task_completion on public.crm_tasks(completion_activity_id,lead_id);
 create index o3_test_cleanup_task_prior on public.crm_tasks(supersedes_task_id,lead_id);
 create index o3_test_cleanup_lead_conversion on public.crm_leads(conversion_activity_id,id,enrollment_id);
 alter table public.placement_tests disable trigger crm_placement_integrity;alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submission_attribution disable trigger crm_attribution_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id), removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id) select count(*) from removed_tasks;
 delete from public.crm_submission_attribution where submission_id in(select id from public.crm_submissions where resolved_by in(${ids}) or lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))));
 delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})));
 with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_activities as(delete from public.crm_activities where actor_id in(${ids}) returning id),removed_submissions as(delete from public.crm_submissions where resolved_by in(${ids}) or lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids}))) returning id),removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${ids})) returning id) select count(*) from removed_leads;
 delete from public.crm_contacts where created_by in(${ids});delete from public.crm_command_requests where actor_scope in(${ids});delete from public.crm_followup_policies where created_by in(${ids});
 alter table public.placement_tests enable trigger crm_placement_integrity;alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submission_attribution enable trigger crm_attribution_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
 alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${ids});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;delete from public.activity_log where actor_id in(${ids}) or target_id in(${ids});delete from public.rate_limits where user_id in(${ids});drop index public.o3_test_cleanup_activity_task,public.o3_test_cleanup_activity_prior,public.o3_test_cleanup_task_source,public.o3_test_cleanup_task_completion,public.o3_test_cleanup_task_prior,public.o3_test_cleanup_lead_conversion;commit;`);}
 console.log('PASS synthetic staff/CRM fixtures removed and history/security guards restored');
}
