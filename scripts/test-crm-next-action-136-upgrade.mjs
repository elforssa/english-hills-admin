// Local synthetic 130→136 stateful upgrade (one next action, plan RWR-r5, PR A1).
// Run after `supabase db reset --local --version 130 --no-seed`:
//   1. seeds, under the 130 definitions, a policy and three prospects: one with its
//      intake call, one with two open actions (the pre-D1 shape), one closed with
//      work left;
//   2. fingerprints the CRM rows, applies the 136 file directly (the ledger stays at
//      130; `supabase migration up` would also apply any later file);
//   3. proves that no existing row changed (D1 is a separate, owner-approved data
//      step), that the new commands and reads exist with their grants and the data
//      step functions have none, that every reader shows one next action for the
//      pre-D1 shapes, and that d1_plan counts them without writing.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertLocalStack } from './lib/local-stack.mjs';

const port = process.env.CRM_UPGRADE_PORT || '54322';
assertLocalStack({ dbPort: port }); // follow-ups 142 (item 11): this checkout's stack only, before any statement
const psql = (args, input) => execFileSync('psql', ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args],
  { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024 });
const sql = input => psql(['-qAt'], input).trim();
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '130', 'run on a database at migration 130');

const staff = n => `a9136000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const as = (who, body) => `begin; select set_config('request.jwt.claim.sub','${who}',true); set local role authenticated; ${body}; commit;`;

// 1. State on 130.
sql(`insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('${staff(1)}','upg136-director@example.invalid','authenticated','authenticated',now(),now()),
 ('${staff(2)}','upg136-reception@example.invalid','authenticated','authenticated',now(),now());
 update public.profiles set role='director',full_name='Upgrade director' where id='${staff(1)}';
 update public.profiles set role='receptionist',full_name='Upgrade reception' where id='${staff(2)}';`);
const hours = { 1: [['15:00', '20:00']], 2: [['10:00', '12:30'], ['15:20', '20:00']], 3: [['10:00', '12:30'], ['15:20', '20:00']], 4: [['10:00', '12:30'], ['15:20', '20:00']], 5: [['10:00', '12:30'], ['15:20', '20:00']], 6: [['10:00', '13:00']], 7: [] };
sql(as(staff(1), `select public.crm_create_followup_policy(gen_random_uuid(),'${JSON.stringify({ weekly_hours: hours, attempt_offsets: [0, 0, 1, 3, 5] })}'::jsonb)`));
// 142 (deviation 3): crm_create_manual_lead has no API role after the upgrade; the fixture create runs trusted.
const lead = name => JSON.parse(sql(as(staff(2), `reset role; select public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','Upgrade ${name}','learner_name','Upgrade learner','email','upg136-${name}@example.invalid','source_label','Manuel','owner_id','${staff(2)}'))::text`)).split('\n').find(line => line.startsWith('{'))).lead.id;
const single = lead('single'), dupes = lead('dupes'), closed = lead('closed');
// The pre-D1 shapes are written directly, as the live data holds them.
sql(`set session_replication_role=replica;
 insert into public.crm_tasks(lead_id,task_type,status,due_at,assigned_to,source_kind,source_key)
 values('${dupes}','callback','open',now()+interval '2 days','${staff(2)}','manual','upgrade-136:dupe');
 update public.crm_leads set status='LOST',closure_reason='price',closed_at=now() where id='${closed}';
 set session_replication_role=origin;`);
const open130 = sql(`select count(*) from public.crm_tasks where status='open' and lead_id in ('${single}','${dupes}','${closed}')`);
assert.equal(open130, '4', 'pre-D1 shapes: one, two and one open actions');

// 2. Fingerprint the CRM rows on their 130 columns, then apply the file.
const FINGERPRINT = `select jsonb_build_object(
 'tasks',(select md5(string_agg(concat_ws('|',id,lead_id,status,task_type,due_at,version,assigned_to,placement_test_id),',' order by id)) from public.crm_tasks),
 'leads',(select md5(string_agg(concat_ws('|',id,status,version,owner_id,followup_policy_id),',' order by id)) from public.crm_leads),
 'placements',(select md5(coalesce(string_agg(concat_ws('|',id,status,date_test,heure),',' order by id),'')) from public.placement_tests),
 'activities',(select count(*)||':'||md5(coalesce(string_agg(id::text,',' order by id),'')) from public.crm_activities),
 'policies',(select md5(string_agg(concat_ws('|',id,version,weekly_hours,date_exceptions),',' order by id)) from public.crm_followup_policies))::text`;
const before = sql(FINGERPRINT);
const absent = sql("select count(*) from pg_proc where proname in ('crm_log_exchange','crm_change_next_action','crm_get_centre_hours','crm_check_action','crm_list_outside_hours','set_next_action','d1_plan')");
assert.equal(absent, '0', 'the 136 functions are absent at 130');
psql(['-q'], readFileSync('supabase/migrations/136_crm_one_next_action.sql', 'utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '130', 'the file alone does not touch the ledger');

// 3. No row changed; D1 has not run.
assert.equal(sql(FINGERPRINT), before, 'no existing CRM row rewritten by the migration');
assert.equal(sql('select count(*) from public.crm_data_step_journal'), '0', 'D1 not run');

// Grants: public commands and reads for signed-in staff only; data step functions none.
const acl = name => sql(`select coalesce(proacl::text,'') from pg_proc where oid='${name}'::regprocedure`);
for (const name of ['public.crm_log_exchange(uuid,jsonb)', 'public.crm_change_next_action(uuid,jsonb)', 'public.crm_record_appointment_outcome(uuid,jsonb)',
  'public.crm_close_prospect(uuid,jsonb)', 'public.crm_reopen_prospect(uuid,jsonb)', 'public.crm_get_centre_hours()', 'public.crm_check_action(uuid)', 'public.crm_list_outside_hours(integer,integer)',
  'public.crm_set_reception_default_owner(uuid)']) {
  const grants = acl(name);
  assert.match(grants, /authenticated=X\/postgres/, `${name}: authenticated`);
  assert.doesNotMatch(grants, /anon=|service_role=|=X\/postgres,=X|^{=X/, `${name}: no anon, service role or public grant`);
}
for (const name of ['crm_security.d1_plan()', 'crm_security.d1_apply(jsonb)', 'crm_security.d1_revert()'])
  assert.doesNotMatch(acl(name), /authenticated|anon|service_role/, `${name}: no API grant`);

// Readers on the pre-D1 shapes: one next action each, the same everywhere.
const read = (fn, args) => JSON.parse(sql(as(staff(2), `select public.${fn}(${args})::text`)).split('\n').find(line => line.startsWith('{')));
for (const id of [single, dupes]) {
  const detail = read('crm_get_workspace_detail', `'${id}'`), check = read('crm_check_action', `'${id}'`);
  assert.ok(detail.next_action?.id, 'detail shows a next action');
  assert.equal(check.next_action?.id, detail.next_action.id, 'the pre-check shows the same action');
}
const seen = [];
for (const bucket of ['overdue', 'today', 'tomorrow', 'upcoming', 'awaiting'])
  seen.push(...read('crm_get_work_queue', `p_bucket=>'${bucket}',p_assignee_mode=>'all',p_limit=>50`).rows.map(row => row.lead?.id ?? row.lead_id));
assert.equal(seen.filter(id => id === dupes).length, 1, 'the work queue shows the prospect with two open actions once');
assert.equal(seen.filter(id => id === single).length, 1, 'and the single one once');
assert.equal(seen.includes(closed), false, 'a closed prospect is not in the work queue');
assert.equal(read('crm_get_centre_hours', '').calling_hours['7'].length, 0, 'the current hours read the published policy');

// The plan counts the shapes without writing.
const plan = JSON.parse(sql('select crm_security.d1_plan()::text'));
const sampled = rule => JSON.stringify(plan[rule]?.sample ?? []);
assert.ok(sampled('a').includes(dupes), 'd1_plan rule (a) lists the prospect with two open actions');
assert.ok(sampled('d').includes(closed), 'd1_plan rule (d) lists the closed prospect with work left');
assert.ok(!['a', 'b', 'c', 'd'].some(rule => sampled(rule).includes(single)), 'a prospect with one open action needs nothing');
assert.equal(sql(FINGERPRINT), before, 'd1_plan writes nothing');
console.log('PASS 130→136 upgrade: no row rewritten, grants, one next action per prospect before D1, d1_plan read-only');
