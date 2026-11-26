// Local synthetic Work and Calendar upgrade through D1 to 137 (plan RWR-r5, PR A2, M-A2).
// Run after `supabase db reset --local --version 136 --no-seed`. Every step commits, as on a
// real database:
//   1. commits the shared 10k Work and Calendar fixture under the 136 definitions. It holds
//      the pre-D1 shapes: several open actions per prospect (Q04), planned tests without their
//      appointment (Q29), an active prospect with no action (Q05) and a closed prospect with a
//      planned test (Q07);
//   2. proves the 137 file refuses on that state (its D1 post-check precondition) and changes
//      nothing;
//   3. runs D1 as the director: d1_plan, its exact counts, d1_apply(counts), committed;
//   4. applies the 137 file in one transaction as the migration runner does (the ledger stays
//      at 136): no row changed, index valid, D1 functions gone;
//   5. runs the bounded-read acceptance (scripts/test-crm-work-calendar.sql, then the
//      receptionist UX reads), rolled back, on the D1-processed rows.
// Five assertions of the read suite describe the pre-D1 fixture shape itself (a second open
// visit, eight open action types, the taskless prospect in « À traiter », appointments not
// assigned to the owner). D1 removes those shapes by design, so they are left out of step 5
// by name; they keep running unchanged on the pre-D1 fixture at 136
// (scripts/test-crm-work-calendar-local.mjs, same CI step).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { workCalendarFixture } from './lib/crm-work-calendar-fixture.mjs';
import { assertLocalStack } from './lib/local-stack.mjs';
assertLocalStack({ dbPort: '54322' }); // follow-ups 142 (item 11): this checkout's stack only, before any statement

const base = ['-X', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const env = { ...process.env, PGPASSWORD: 'postgres' };
const psql = (args, input) => execFileSync('psql', [...base, ...args], { input, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
const sql = input => psql(['-qAt'], input).trim();
const director = 'a3000000-0000-0000-0000-000000000001';
const asDirector = body => `begin; select set_config('request.jwt.claim.sub','${director}',true); ${body}; commit;`;
const file137 = readFileSync('supabase/migrations/137_crm_one_next_action_enforce.sql', 'utf8');
const ledger = () => sql('select max(version) from supabase_migrations.schema_migrations');
const FINGERPRINT = `select jsonb_build_object(
 'tasks',(select md5(string_agg(concat_ws('|',id,lead_id,status,task_type,due_at,version,assigned_to,placement_test_id,review_flag),',' order by id)) from public.crm_tasks),
 'leads',(select md5(string_agg(concat_ws('|',id,status,version,owner_id,followup_policy_id,merged_into_lead_id),',' order by id)) from public.crm_leads),
 'placements',(select md5(coalesce(string_agg(concat_ws('|',id,status,date_test,heure,updated_at),',' order by id),'')) from public.placement_tests),
 'activities',(select count(*) from public.crm_activities),
 'journal',(select count(*) from public.crm_data_step_journal))::text`;

assert.equal(ledger(), '136', 'run on a database at migration 136');
assert.equal(sql('select count(*) from public.crm_leads'), '0', 'start from an empty CRM');

// 1. The fixture, committed under 136.
sql(workCalendarFixture() + '\ncommit;');
assert.equal(sql("select count(*) from (select lead_id from public.crm_tasks where status='open' group by lead_id having count(*)>1) x"), '7999', 'pre-D1: 7999 prospects with several open actions');

// 2. The 137 file refuses while the pre-D1 duplicates remain, and changes nothing.
const before = sql(FINGERPRINT);
const early = spawnSync('psql', [...base, '-1', '-q'], { input: file137, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
assert.notEqual(early.status, 0, '137 must refuse before D1');
assert.match(early.stderr, /M-A2 refused: D1 post-checks are not all 0 \(Q04 7999, Q05 active with no action 1, Q07 open actions 0, Q07 planned tests 1, Q29 120\)/, 'refused on Q04 (and Q05, Q07, Q29) before D1');
assert.match(early.stderr, /crm_next_action\.d1_postchecks/, 'with the post-check hint');
assert.equal(sql("select to_regclass('public.crm_tasks_one_open_per_lead') is null and to_regprocedure('crm_security.d1_apply(jsonb)') is not null"), 't', 'nothing applied');
assert.equal(sql(FINGERPRINT), before, 'the refused file changed no row');
assert.equal(ledger(), '136', 'ledger unchanged');
console.log('PASS 137 refused on the pre-D1 fixture: Q04 7999, Q05 1, Q07 planned tests 1, Q29 120; nothing changed');

// 3. D1, committed, as the director, with its exact counts.
const plan = JSON.parse(sql(asDirector('select crm_security.d1_plan()::text')).split('\n').find(line => line.startsWith('{')));
assert.deepEqual(Object.fromEntries(['a', 'b', 'c', 'd', 'tests_cancelled'].map(rule => [rule, plan[rule].count])),
  { a: 7999, b: 120, c: 1, d: 1, tests_cancelled: 1 }, 'D1 dry-run counts');
assert.equal(plan.c.after_five_failures, 1, 'the taskless prospect has five failed calls');
const applied = JSON.parse(sql(asDirector(`select (crm_security.d1_apply('${JSON.stringify(plan)}'::jsonb)->'applied')::text`)).split('\n').find(line => line.startsWith('{')));
assert.deepEqual(applied, { a: 7999, b: 120, c: 1, d: 1 }, 'D1 applied with its counts');
assert.equal(sql(`select count(*) from public.crm_leads l where l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
 and (select count(*) from public.crm_tasks t where t.lead_id=l.id and t.status='open')<>1`), '0', 'D1: every active prospect has exactly one open action');
console.log('PASS D1 committed: a 7999, b 120, c 1, d 1, one test cancelled');

// 4. The 137 file, one transaction; no row changed.
const afterD1 = sql(FINGERPRINT);
psql(['-1', '-q'], file137);
assert.equal(ledger(), '136', 'the file alone does not touch the ledger');
assert.equal(sql(FINGERPRINT), afterD1, 'no row changed by the migration');
assert.equal(sql("select indisvalid and indisunique from pg_index where indexrelid='public.crm_tasks_one_open_per_lead'::regclass"), 't', 'index valid');
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname like 'd1\\_%'"), '0', 'D1 functions dropped');
console.log('PASS 137 applied after D1 on 10k prospects: no row changed, index valid, D1 gone');

// 5. Bounded reads on the D1-processed rows, rolled back. D1 closed ~32k actions in one
// transaction: refresh the planner statistics first, as the fixture does after loading
// (autovacuum would, given time).
sql('analyze public.crm_tasks; analyze public.crm_leads; analyze public.placement_tests; analyze public.crm_activities;');
const preD1Shape = [
  'assignee AND owner, no fallback',
  'eight task types in fixture',
  'genuine visit duration preserved',
  'unrelated malformed legacy time cannot crash public Opportunities',
  'taskless exhausted prospect attention retained',
];
let reads = readFileSync('scripts/test-crm-work-calendar.sql', 'utf8');
for (const label of preD1Shape) {
  const lines = reads.split('\n').filter(line => line.trimStart().startsWith('perform pg_temp.ok(') && line.trimEnd().endsWith(`,'${label}');`));
  assert.equal(lines.length, 1, `exactly one pre-D1 shape assertion « ${label} »`);
  reads = reads.replace(lines[0], ` -- pre-D1 fixture shape, asserted at 136 only: ${label}`);
}
reads = reads.replace('rollback;', () => readFileSync('scripts/test-crm-receptionist-ux.sql', 'utf8') + '\nrollback;');
const header = `begin;
set local statement_timeout='45s';
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL %',label; end if; end $$;
create function pg_temp.denied(s text,code text default '22023') returns void language plpgsql as $$ begin
 begin execute s; exception when others then if sqlstate=code then return; end if; raise; end; raise exception 'Unexpected success: %',s; end $$;
-- The committed fixture's numbering, as the rollback-only harness keeps it in a temp table.
create temp table fixture as select substring(learner_name from '^O3 learner ([0-9]+)$')::int i,id lead,first_submission_id first_touch,latest_submission_id last_touch
 from public.crm_leads where learner_name ~ '^O3 learner [0-9]+$';
select pg_temp.ok((select count(*)=10000 and count(distinct i)=10000 from fixture),'committed fixture numbering');
set local request.jwt.claim.sub='a3000000-0000-0000-0000-000000000003';
`;
const output = psql(['-q'], header + reads);
console.log(output.trim());
assert.match(output, /PASS A14-A19 work\/calendar buckets, filters, cursors, roles and fixed projections/);
assert.match(output, /PASS receptionist server-oracle displays and staff references across pages/);
assert.equal(sql(FINGERPRINT), afterD1, 'the read acceptance rolled back');
console.log(`PASS Work and Calendar fixture → 136 → D1 → 137: bounded reads after 137 (pre-D1 shape assertions left to the 136 run: ${preD1Shape.length})`);
