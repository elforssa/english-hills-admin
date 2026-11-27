// Local synthetic 136→137 stateful upgrade (one next action enforced, plan RWR-r5, PR A2).
// Run after `supabase db reset --local --version 136 --no-seed`. Every step commits, as on
// a real database:
//   1. seeds, under the 136 definitions, prospects in the pre-D1 shapes (two open actions,
//      a planned test without its appointment, closed with work left) and proves the 137
//      file refuses on them (its D1 post-check precondition), changing nothing;
//   2. runs D1 committed as the director (d1_plan, d1_apply), fingerprints the CRM rows,
//      applies the 137 file in one transaction as the migration runner does (the ledger
//      stays at 136), and proves no row changed, the index is valid, the D1 functions
//      are gone and the old wrappers are refused for authenticated;
//   3. drives the writers as signed-in staff, each in its own committed transaction, on the
//      D1-processed prospects and a new one: intake resubmission, exchange, reassignment,
//      test result, close and reopen, « Inscrire et encaisser » keeping the planned test;
//   4. proves a real COMMIT refuses a second open action, an active prospect without one
//      and a closed prospect with work left (the deferred triggers fire at COMMIT);
//   5. runs the restore file, then re-applies 137 on the restored state.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { openSlotSql } from './lib/centre-days.mjs';
import { assertLocalStack } from './lib/local-stack.mjs';

const port = process.env.CRM_UPGRADE_PORT || '54322';
assertLocalStack({ dbPort: port }); // follow-ups 142 (item 11): this checkout's stack only, before any statement
const base = ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const env = { ...process.env, PGPASSWORD: 'postgres' };
const psql = (args, input) => execFileSync('psql', [...base, ...args], { input, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
const sql = input => psql(['-qAt'], input).trim();
const refused = (args, input) => {
  const run = spawnSync('psql', [...base, ...args], { input, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  assert.notEqual(run.status, 0, `expected a refusal:\n${input.slice(0, 300)}`);
  return run.stderr;
};
const json = out => JSON.parse(out.split('\n').find(line => line.startsWith('{')));
const ledger = () => sql('select max(version) from supabase_migrations.schema_migrations');
assert.equal(ledger(), '136', 'run on a database at migration 136');
const file137 = readFileSync('supabase/migrations/137_crm_one_next_action_enforce.sql', 'utf8');
const restore137 = readFileSync('scripts/rollback/137_crm_one_next_action_enforce_restore.sql', 'utf8');

const staff = n => `a9137000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const as = (who, body) => `begin; select set_config('request.jwt.claim.sub','${who}',true); set local role authenticated; ${body}; commit;`;
const call = (who, fn, payload) => json(sql(as(who, `select public.${fn}(gen_random_uuid(),${payload})::text`)));
const trustedCall = (who, fn, payload) => json(sql(as(who, `reset role; select public.${fn}(gen_random_uuid(),${payload})::text`)));
const version = lead => sql(`select version from public.crm_leads where id='${lead}'`);
const openActions = lead => Number(sql(`select count(*) from public.crm_tasks where lead_id='${lead}' and status='open'`));
const nextAction = lead => sql(`select concat_ws('|',task_type,assigned_to,placement_test_id) from public.crm_tasks where id=crm_security.next_action_id('${lead}')`);

// 1. State on 136, in the pre-D1 shapes.
sql(`insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('${staff(1)}','upg137-director@example.invalid','authenticated','authenticated',now(),now()),
 ('${staff(2)}','upg137-admin@example.invalid','authenticated','authenticated',now(),now()),
 ('${staff(3)}','upg137-reception@example.invalid','authenticated','authenticated',now(),now());
 update public.profiles set role='director',full_name='Upgrade director' where id='${staff(1)}';
 update public.profiles set role='admin',full_name='Upgrade admin' where id='${staff(2)}';
 update public.profiles set role='receptionist',full_name='Upgrade reception' where id='${staff(3)}';`);
const hours = { 1: [['09:00', '20:00']], 2: [['09:00', '20:00']], 3: [['09:00', '20:00']], 4: [['09:00', '20:00']], 5: [['09:00', '20:00']], 6: [['09:00', '20:00']], 7: [['09:00', '20:00']] };
sql(as(staff(1), `select public.crm_create_followup_policy(gen_random_uuid(),'${JSON.stringify({ weekly_hours: hours, attempt_offsets: [0, 0, 1, 3, 5] })}'::jsonb)`));
// 142 (deviation 3): crm_create_manual_lead has no API role after the upgrade; the fixture create runs trusted.
const lead = name => trustedCall(staff(3), 'crm_create_manual_lead', `jsonb_build_object('display_name','Upgrade ${name}','learner_name','Upgrade learner ${name}','email','upg137-${name}@example.invalid','source_label','Manuel','owner_id','${staff(3)}')`).lead.id;
const dupes = lead('dupes'), testOnly = lead('test'), closed = lead('closed'), single = lead('single');
sql(`begin; set local session_replication_role=replica;
 insert into public.crm_tasks(lead_id,task_type,status,due_at,assigned_to,source_kind,source_key)
 values('${dupes}','callback','open',now()+interval '2 days','${staff(3)}','manual','upgrade-137:dupe');
 update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='Fixture' where lead_id='${testOnly}' and status='open';
 insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur)
 values('Upgrade learner test',((now() at time zone public.centre_utc_offset())::date+3),'11:00','Planifié','${testOnly}','Fixture');
 update public.crm_leads set status='QUALIFIED' where id='${testOnly}';
 update public.crm_leads set status='LOST',closure_reason='price',closed_at=now() where id='${closed}';
 commit;`);
const test = sql(`select id from public.placement_tests where crm_lead_id='${testOnly}'`);

// The 137 file refuses before D1 and changes nothing.
const early = refused(['-1', '-q'], file137);
assert.match(early, /M-A2 refused: D1 post-checks are not all 0/, 'refused before D1');
assert.match(early, /crm_next_action\.d1_postchecks/, 'with the post-check hint');
assert.equal(sql("select to_regclass('public.crm_tasks_one_open_per_lead') is null and to_regprocedure('crm_security.d1_apply(jsonb)') is not null"), 't', 'nothing applied');
assert.ok(has('authenticated', 'public.crm_close_lost(uuid,jsonb)'), 'old wrappers still granted');

// 2. D1, committed, as the director; then the 137 file in one transaction.
const plan = sql(`begin; select set_config('request.jwt.claim.sub','${staff(1)}',true); select crm_security.d1_plan()::text; commit;`).split('\n').find(l => l.startsWith('{'));
sql(`begin; select set_config('request.jwt.claim.sub','${staff(1)}',true); select crm_security.d1_apply('${plan}'::jsonb); commit;`);
assert.equal(openActions(dupes), 1, 'D1: one action on the duplicate prospect');
assert.equal(nextAction(testOnly).split('|')[2], test, 'D1: an appointment carries the planned test');
assert.equal(openActions(closed), 0, 'D1: the closed prospect holds nothing');
const FINGERPRINT = `select jsonb_build_object(
 'tasks',(select md5(string_agg(concat_ws('|',id,lead_id,status,task_type,due_at,version,assigned_to,placement_test_id,review_flag),',' order by id)) from public.crm_tasks),
 'leads',(select md5(string_agg(concat_ws('|',id,status,version,owner_id,followup_policy_id,merged_into_lead_id),',' order by id)) from public.crm_leads),
 'placements',(select md5(coalesce(string_agg(concat_ws('|',id,status,date_test,heure,updated_at),',' order by id),'')) from public.placement_tests),
 'activities',(select count(*)||':'||md5(coalesce(string_agg(id::text,',' order by id),'')) from public.crm_activities),
 'journal',(select count(*) from public.crm_data_step_journal))::text`;
const before = sql(FINGERPRINT);
// placement_tests table and column privileges, as sorted (object, grantee, privilege) rows.
const PLACEMENT_ACL = `select string_agg(x,',' order by x) from (
 select 'table:'||a.grantee::regrole||':'||a.privilege_type x from pg_class c, aclexplode(c.relacl) a where c.oid='public.placement_tests'::regclass
 union all select t.attname||':'||a.grantee::regrole||':'||a.privilege_type from pg_attribute t, aclexplode(t.attacl) a
 where t.attrelid='public.placement_tests'::regclass and t.attacl is not null) s`;
const acl136 = sql(PLACEMENT_ACL);
psql(['-1', '-q'], file137);
assert.equal(ledger(), '136', 'the file alone does not touch the ledger');
assert.equal(sql(FINGERPRINT), before, 'no row changed by the migration');
assert.equal(sql(`select indisvalid and indisunique from pg_index where indexrelid='public.crm_tasks_one_open_per_lead'::regclass`), 't', 'index valid');
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname like 'd1\\_%'"), '0', 'D1 functions dropped');
assert.equal(sql("select has_table_privilege('anon','public.placement_tests','select') or has_any_column_privilege('anon','public.placement_tests','insert') or has_table_privilege('authenticated','public.placement_tests','truncate')"), 'f', '137: placement_tests anon grants and TRUNCATE revoked');
assert.equal(sql("select has_table_privilege('authenticated','public.placement_tests','delete')"), 't', '137: authenticated keeps DELETE (Admissions page)');
function has(role, fn) { return sql(`select has_function_privilege('${role}','${fn}','execute')`) === 't'; }
for (const fn of ['crm_add_note', 'crm_record_call_outcome', 'crm_record_whatsapp', 'crm_record_conversation', 'crm_record_conversation_decision', 'crm_qualify_lead',
  'crm_schedule_task', 'crm_complete_task', 'crm_cancel_task', 'crm_close_lost', 'crm_close_not_qualified', 'crm_reopen_lead']) {
  assert.equal(has('authenticated', `public.${fn}(uuid,jsonb)`), false, `${fn} revoked`);
  assert.match(refused(['-qAt'], as(staff(3), `select public.${fn}(gen_random_uuid(),'{}'::jsonb)`)), /permission denied for function/, `${fn} refused for authenticated`);
}
console.log('PASS 137 refused before D1; applied after D1 with no row changed, index valid, D1 gone, twelve wrappers refused');

// 3. Writers, each committed, as signed-in staff.
// Intake: a new manual prospect, and a resubmission attached to a D1 prospect (the review
// queue's attach path, under the lifecycle barrier, from a trusted session).
const fresh = lead('fresh');
assert.equal(openActions(fresh), 1, 'intake: one action');
sql(`begin; select set_config('request.jwt.claim.sub','${staff(3)}',true);
 insert into public.crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash)
 values('b9137000-0000-4000-8000-000000000001','website',now(),now(),'server','{"contact_name":"Upgrade parent","program_interest_text":"Annual English"}','[]','Upgrade resubmission','needs_review',encode(sha256('upg137'::bytea),'hex'));
 select crm_security.lifecycle_barrier(true);
 select crm_security.accept_external_submission('b9137000-0000-4000-8000-000000000001',null,'${dupes}');
 commit;`);
assert.equal(openActions(dupes), 1, 'intake resubmission on a D1 prospect: one action');
call(staff(3), 'crm_log_exchange', `'{"lead_id":"${dupes}","expected_version":${version(dupes)},"channel":"phone","result":"no_answer"}'::jsonb`);
assert.equal(openActions(dupes), 1, 'exchange: one action');
call(staff(1), 'crm_reassign', `'{"lead_id":"${dupes}","expected_version":${version(dupes)},"owner_id":"${staff(2)}"}'::jsonb`);
assert.equal(nextAction(dupes).split('|')[1], staff(2), 'reassignment: the one action follows the new owner');
call(staff(3), 'crm_close_prospect', `'{"lead_id":"${dupes}","expected_version":${version(dupes)},"status":"LOST","reason":"price"}'::jsonb`);
assert.equal(openActions(dupes), 0, 'close: no action');
call(staff(3), 'crm_reopen_prospect', `'{"lead_id":"${dupes}","expected_version":${version(dupes)},"reason":"Revient","next":{"task_type":"callback","due_preset":"tomorrow"}}'::jsonb`);
assert.equal(openActions(dupes), 1, 'reopen: one action');
// « Inscrire et encaisser » on the D1 appointment that carries the planned test.
const token = sql(`select crm_security.candidate_token('${testOnly}',(select learner_name from public.crm_leads where id='${testOnly}'),null)`);
call(staff(3), 'crm_enroll_and_collect', `jsonb_build_object('enrollment',jsonb_build_object('lead_id','${testOnly}','expected_version',${version(testOnly)},'student_choice','new',
 'learner_name','Upgrade learner test','candidate_review','${token}','session_type','Yearly','school_year','2026/2027'),
 'payment',jsonb_build_object('gross_amount',1500,'payment_amount',500,'payment_method','Espèces'))`);
assert.equal(sql(`select status from public.crm_leads where id='${testOnly}'`), 'CONVERTED', 'enrol and collect: converted');
assert.equal(openActions(testOnly), 0, 'converted: no action');
assert.equal(sql(`select status from public.placement_tests where id='${test}'`), 'Planifié', 'converted: the planned test kept');
// A test result through the CRM command on a new appointment with a test, at 11:00 on an open
// day (computed as postgres: the command runs as the staff role, which cannot read crm_security).
const visitAt = sql(`select (${openSlotSql(2, '11:00')})::text`);
call(staff(3), 'crm_log_exchange', `jsonb_build_object('lead_id','${single}','expected_version',${version(single)},'channel','phone','result','spoke','next',
 jsonb_build_object('task_type','center_visit','with_test',true,'due_at','${visitAt}'))`);
const test2 = nextAction(single).split('|')[2];
assert.ok(test2, 'appointment with a test');
call(staff(3), 'crm_update_placement_test', `(select jsonb_build_object('placement_id',id,'expected_updated_at',updated_at,'expected_version',${version(single)},
 'date_test',date_test,'heure',heure,'status','Résultat saisi','niveau_recommande','B1') from public.placement_tests where id='${test2}')`);
assert.equal(nextAction(single).split('|')[0], 'post_test_followup', 'test result: « Proposer l\'inscription » is the one action');
console.log('PASS committed writers after 137: intake, resubmission, exchange, reassignment, close, reopen, enrol and collect keeping the test, test result');

// 4. A real COMMIT refuses each broken state; nothing is written.
const fp = sql(FINGERPRINT);
assert.match(refused(['-q'], `begin; insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key) values('${fresh}','callback',now()+interval '1 day','manual','upg137:second'); commit;`),
  /crm_tasks_one_open_per_lead/, 'a second open action refused');
assert.match(refused(['-q'], `begin; update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='x' where lead_id='${fresh}' and status='open'; commit;`),
  /crm_next_action\.exactly_one/, 'an active prospect without an action refused at COMMIT');
assert.match(refused(['-q'], `begin; update public.crm_leads set status='LOST',closure_reason='price',closed_at=now() where id='${fresh}'; commit;`),
  /crm_next_action\.closed_has_action/, 'a closed prospect with work left refused at COMMIT');
assert.equal(sql(FINGERPRINT), fp, 'the refused transactions wrote nothing');
console.log('PASS real COMMIT refuses a second action, an active prospect without one and a closed prospect with work left');

// 5. The restore file, then 137 again.
psql(['-q'], restore137);
assert.equal(sql("select to_regclass('public.crm_tasks_one_open_per_lead') is null and not exists(select 1 from pg_trigger where tgname in ('crm_next_action_presence','crm_planned_test_placement'))"), 't', 'restore: index and triggers dropped');
assert.ok(has('authenticated', 'public.crm_close_lost(uuid,jsonb)') && has('authenticated', 'public.crm_reopen_lead(uuid,jsonb)'), 'restore: wrappers re-granted');
assert.equal(sql(FINGERPRINT), fp, 'restore: no row changed');
assert.equal(sql(PLACEMENT_ACL), acl136, 'restore: placement_tests grants exactly as 136 left them');
assert.match(refused(['-q'], restore137), /migration 137 is not applied/, 'restore refuses a second run');
psql(['-1', '-q'], file137);
assert.equal(sql(`select indisvalid from pg_index where indexrelid='public.crm_tasks_one_open_per_lead'::regclass`), 't', '137 re-applied after the restore');
assert.equal(sql(FINGERPRINT), fp, 're-apply: no row changed');
console.log('PASS 136→137 stateful upgrade, restore and re-apply');
