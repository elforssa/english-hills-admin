// Destructive LOCAL synthetic acceptance (plan NRC-r2, ADR-009): every former
// retryable-conflict path answers at once over real HTTP. On a PostgREST that
// retries the old code without limit (the CI stack runs 14.5), a prompt HTTP 409
// is the proof that PT409 is not retried. Run on a database at the current
// migrations (119 or later); the CI step resets it afterwards. Never reads
// .env.local or accepts a URL from the environment.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { createStudentOnce } from '../src/lib/studentCreate.mjs';

assertLocalFeatureBranch();
const processEnv = { ...process.env, PGPASSWORD: 'postgres', SUPABASE_TELEMETRY_DISABLED: '1', DISABLE_EXTERNAL_EMAIL: 'true' };
const pgArgs = ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = s => execFileSync('psql', pgArgs, { input: s, encoding: 'utf8', env: processEnv, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const cli = args => execFileSync('supabase', args, { encoding: 'utf8', env: processEnv, timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const status = JSON.parse(cli(['status', '-o', 'json']));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
const latest = Math.max(...readdirSync('supabase/migrations').map(name => Number(/^(\d+)_/.exec(name)?.[1] ?? 0)));
assert(latest >= 119);
assert.equal(sql('select max(version::integer) from supabase_migrations.schema_migrations'), String(latest), 'run on a database at the current migrations');
const postgrest = execFileSync('docker', ['exec', 'supabase_rest_hills-admin-next', 'postgrest', '--version'], { encoding: 'utf8' }).trim();
console.log(`Versions: PostgreSQL ${sql('show server_version')}; PostgREST ${postgrest}; supabase-js ${JSON.parse(readFileSync('node_modules/@supabase/supabase-js/package.json')).version}`);

const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } };
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
async function staff(role) {
  const email = `nrc-${role}-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('hex');
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'director' } });
  assert.ifError(error);
  sql(`update public.profiles set role=${q(role)} where id=${q(data.user.id)}`);
  const client = createClient(status.API_URL, status.ANON_KEY, options);
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: data.user.id, client };
}
const director = await staff('director'), receptionist = await staff('receptionist'), admin = await staff('admin');
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const old = '2000-01-01T00:00:00Z';

// Synthetic fixtures, created through the real commands where one exists.
const fx = JSON.parse(sql(`
set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub=${q(director.id)};
create temp table fx(k text primary key, v text);
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["08:00","21:00"]],"2":[["08:00","21:00"]],"3":[["08:00","21:00"]],"4":[["08:00","21:00"]],"5":[["08:00","21:00"]],"6":[["08:00","21:00"]],"7":[["08:00","21:00"]]}}');
insert into fx select 'lead', crm_create_manual_lead(gen_random_uuid(),'{"display_name":"NRC guardian","learner_name":"NRC learner","phone":"0612345601","source_label":"Manual"}')->'lead'->>'id';
insert into fx select 'qualified', crm_create_manual_lead(gen_random_uuid(),'{"display_name":"NRC qualified","learner_name":"NRC qualified learner","phone":"0612345602","source_label":"Manual"}')->'lead'->>'id';
insert into fx select 'task', id::text from crm_tasks where lead_id=(select v::uuid from fx where k='lead') and status='open' limit 1;
insert into fx select 'meta', crm_save_meta_connection('{"connection_key":"nrc-meta","page_id":"119001","api_version":"v99.0"}')->>'id';
insert into fx select 'mapping', crm_publish_meta_form_mapping((select v::uuid from fx where k='meta'),'{"form_key":"119002","field_map":{},"effective_from":"2020-01-01Z"}')->>'id';
select crm_configure_insights((select v::uuid from fx where k='meta'),1,'{"mode":"mock","enabled":true,"account_id":"1190","currency":"MAD","timezone":"Africa/Casablanca","api_version":"v99.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":7}');
insert into fx select 'website', crm_save_website_connection('{"connection_key":"nrc-website","origin":"https://nrc.example.invalid"}')->>'id';
insert into fx select 'failed_run', crm_request_insights_sync((select v::uuid from fx where k='meta'),gen_random_uuid(),'2026-01-01','2026-01-02');
set request.jwt.claim.role='service_role'; set request.jwt.claim.sub='';
select crm_fail_insights_sync((c->>'id')::uuid,(c->>'lease_token')::uuid,'invalid_data',0) from crm_claim_insights_sync() c;
set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub=${q(director.id)};
insert into fx select 'pending_run', crm_request_insights_sync((select v::uuid from fx where k='meta'),gen_random_uuid(),'2026-01-01','2026-01-02');
set request.jwt.claim.role='service_role'; set request.jwt.claim.sub='';
insert into fx select 'running_run', crm_claim_insights_sync()->>'id';
reset request.jwt.claim.role; reset request.jwt.claim.sub;
update crm_leads set status='QUALIFIED' where id=(select v::uuid from fx where k='qualified');
insert into fx select 'candidate', crm_security.candidate_token((select v::uuid from fx where k='qualified'),'NRC qualified learner','2015-03-04');
insert into placement_tests(id,student_name,date_test,heure,crm_lead_id) values(gen_random_uuid(),'NRC qualified learner',${q(day(3))},'10:30',(select v::uuid from fx where k='qualified'));
insert into fx select 'placement', id::text from placement_tests where crm_lead_id=(select v::uuid from fx where k='qualified');
insert into fx values('lease', gen_random_uuid()::text);
insert into crm_ingestion_jobs(id,connection_id,external_key,event_kind,payload,payload_hash,status,lease_token,lease_until)
values(gen_random_uuid(),(select v::uuid from fx where k='meta'),'119001:119003','leadgen','{}',repeat('a',64),'processing',(select v::uuid from fx where k='lease'),now()+interval '1 hour'),
 (gen_random_uuid(),(select v::uuid from fx where k='website'),'nrc-website:'||gen_random_uuid(),'website_inquiry','{}',repeat('b',64),'processing',(select v::uuid from fx where k='lease'),now()+interval '1 hour');
insert into fx select 'meta_job', id::text from crm_ingestion_jobs where external_key='119001:119003';
insert into fx select 'website_job', id::text from crm_ingestion_jobs where event_kind='website_inquiry' and connection_id=(select v::uuid from fx where k='website');
insert into crm_external_deliveries(id,activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,status,lease_token,lease_until)
select gen_random_uuid(),a.id,a.lead_id,(select v::uuid from fx where k='meta'),'qualified',now(),'nrc-delivery-1',0,'sending',(select v::uuid from fx where k='lease'),now()+interval '1 hour'
from crm_activities a where a.lead_id=(select v::uuid from fx where k='lead') order by a.created_at limit 1;
insert into fx select 'delivery', id::text from crm_external_deliveries where provider_event_id='nrc-delivery-1';
insert into crm_lifecycle_eligibility_policies(id,connection_id,form_mapping_id,version,notice_version,notice_text_digest,adult_field_key,adult_accepted_values,
  sharing_field_key,sharing_accepted_values,notice_field_key,notice_accepted_values,effective_from,effective_until,created_by,lifecycle_model,allowed_event_kinds)
values(gen_random_uuid(),(select v::uuid from fx where k='meta'),(select v::uuid from fx where k='mapping'),1,'notice-v1',repeat('a',64),'adult_confirmed','["yes"]',
  'meta_share','["yes"]','notice_version','["notice-v1"]',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',${q(director.id)},'r4_stage_entry',
  '["intake","not_qualified","lost","qualified","converted"]');
insert into fx select 'lifecycle_policy', id::text from crm_lifecycle_eligibility_policies where connection_id=(select v::uuid from fx where k='meta');
insert into students(id,full_name,status,session_type,niveau_cefr) values(gen_random_uuid(),'NRC receptionist learner','Enrolled','Yearly','Child 1');
insert into fx select 'student', id::text from students where full_name='NRC receptionist learner';
insert into teachers(id,full_name,email,contract_type) values(gen_random_uuid(),'NRC teacher','nrc-teacher@example.invalid','Freelance'),(gen_random_uuid(),'NRC online teacher','nrc-online@example.invalid','Freelance');
insert into fx select 'teacher', id::text from teachers where email='nrc-teacher@example.invalid';
insert into groups(id,name,session_type,niveau) values(gen_random_uuid(),'NRC Yearly','Yearly','Child 1'),(gen_random_uuid(),'NRC Online','Online','B1');
insert into fx select 'group', id::text from groups where name='NRC Yearly';
insert into fx select 'online_group', id::text from groups where name='NRC Online';
insert into enrollments(id,student_id,status,session_type,school_year) values(gen_random_uuid(),(select v::uuid from fx where k='student'),'Submitted','Yearly','2026/2027');
insert into fx select 'enrollment', id::text from enrollments where student_id=(select v::uuid from fx where k='student');
set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub=${q(director.id)};
select online_save_course((select v::uuid from fx where k='online_group'),null,jsonb_build_object('teacher_id',(select id from teachers where email='nrc-online@example.invalid'),
  'audience','adult','term_start',(now() at time zone 'Africa/Casablanca')::date-7,'term_end',(now() at time zone 'Africa/Casablanca')::date+70));
reset request.jwt.claim.role; reset request.jwt.claim.sub;
insert into online_lessons(id,group_id,starts_at,ends_at,teacher_id,status,is_substitute)
select gen_random_uuid(),(select v::uuid from fx where k='online_group'),now()+interval '2 days',now()+interval '2 days 1 hour',id,'scheduled',false from teachers where email='nrc-online@example.invalid';
insert into fx select 'lesson', id::text from online_lessons where group_id=(select v::uuid from fx where k='online_group');
select jsonb_object_agg(k,v) from fx;`).split('\n').pop());
const id = key => { assert(fx[key], `fixture ${key}`); return fx[key]; };
const wrongLease = randomUUID();

// Every table in public, as one digest: a refused call changes no row anywhere.
const fingerprint = () => sql(`select md5(string_agg(tablename || ':' || (xpath('/row/c/text()', query_to_xml(format(
  'select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) as c from public.%I t', ',', '', tablename), false, true, '')))[1]::text, ',' order by tablename))
  from pg_tables where schemaname = 'public'`);
const rollbacks = () => Number(sql('select xact_rollback from pg_stat_database where datname = current_database()'));

const ONLINE_STALE = ['Ce cours a changé ; actualisez puis réessayez.', 'online.stale'];
const lead = id('lead'), qualified = id('qualified'), task = id('task');
// [label, caller, rpc, args, message, hint]
const CASES = [
  // Receptionist operational RPCs (096) and the payment entry point.
  ['save_receptionist_student', receptionist, 'save_receptionist_student', { p_student: id('student'), p_expected_updated_at: old, p_changes: { telephone: '0600000001' } }, 'Student unavailable or stale'],
  ['save_receptionist_teacher_operations', receptionist, 'save_receptionist_teacher_operations', { p_teacher: id('teacher'), p_expected_updated_at: old, p_changes: { telephone: '0600000002' } }, 'Teacher unavailable or stale'],
  ['save_receptionist_group', receptionist, 'save_receptionist_group', { p_group: id('group'), p_expected_updated_at: old, p_changes: { name: 'NRC renamed' } }, 'Group unavailable or stale'],
  ['assign_receptionist_student_group', receptionist, 'assign_receptionist_student_group', { p_student: id('student'), p_enrollment: null, p_group: id('group'), p_student_updated_at: old, p_enrollment_updated_at: null }, 'Student unavailable or stale'],
  ['append_receptionist_enrollment_document', receptionist, 'append_receptionist_enrollment_document', { p_enrollment: id('enrollment'), p_expected_updated_at: old, p_asset: 'enrollment-documents/nrc.pdf' }, 'Enrollment unavailable or stale'],
  ['save_receptionist_premium_session', receptionist, 'save_receptionist_premium_session', { p_session: randomUUID(), p_expected_updated_at: old, p_changes: { status: 'Cancelled' } }, 'Premium session unavailable or stale'],
  ['save_receptionist_premium_membership', receptionist, 'save_receptionist_premium_membership', { p_membership: randomUUID(), p_expected_updated_at: old }, 'Membership unavailable or stale'],
  ['save_receptionist_premium_attendance', receptionist, 'save_receptionist_premium_attendance', { p_session: randomUUID(), p_student: id('student'), p_status: 'Present', p_expected_updated_at: old }, 'Premium attendance unavailable'],
  // CRM lead, placement and enrollment commands (stale versions).
  ['crm_complete_task via command', director, 'crm_complete_task', { p_request_key: randomUUID(), p_data: { lead_id: lead, expected_version: 999, task_id: task, expected_task_version: 1, outcome: 'completed', note: 'NRC', next_task: { task_type: 'callback', due_at: new Date(Date.now() + 86400000).toISOString() } } }, 'Stale lead version; refresh and retry'],
  ['crm_record_conversation_decision', director, 'crm_record_conversation_decision', { p_request_key: randomUUID(), p_data: { lead_id: lead, expected_version: 999, task_id: task, expected_task_version: 1, decision: 'callback', note: 'NRC', next_task: { task_type: 'callback', due_at: new Date(Date.now() + 86400000).toISOString() } } }, 'Stale lead version; refresh and retry'],
  ['crm_book_placement_test', director, 'crm_book_placement_test', { p_request_key: randomUUID(), p_data: { lead_id: qualified, expected_version: 999, date_test: day(2), heure: '10:30', examinateur: 'NRC', notes: 'NRC' } }, 'Stale lead version; refresh and retry'],
  ['crm_update_placement_test', director, 'crm_update_placement_test', { p_request_key: randomUUID(), p_data: { placement_id: id('placement'), expected_updated_at: old, notes: 'NRC' } }, 'Stale placement version; refresh and retry'],
  ['crm_start_enrollment', director, 'crm_start_enrollment', { p_request_key: randomUUID(), p_data: { lead_id: qualified, expected_version: 999, student_choice: 'new', learner_name: 'NRC qualified learner', birth_date: '2015-03-04', session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', candidate_review: id('candidate'), confirm_new: true } }, 'Stale lead version; refresh and retry', 'crm_enrollment.lead_changed'],
  ['crm_resolve_meta_intake', director, 'crm_resolve_meta_intake', { p_request: randomUUID(), p_submission: randomUUID(), p_action: 'reject', p_data: {} }, 'Intake already resolved or configuration blocked'],
  ['crm_resolve_external_intake via crm_resolve_meta_intake', director, 'crm_resolve_external_intake', { p_request: randomUUID(), p_submission: randomUUID(), p_action: 'reject', p_data: {} }, 'Intake already resolved or configuration blocked'],
  // Director configuration (stale connection or policy versions) and busy Insights runs.
  ['crm_save_meta_connection', director, 'crm_save_meta_connection', { p_data: {}, p_id: id('meta'), p_version: 999 }, 'Refresh connection version'],
  ['crm_save_website_connection', director, 'crm_save_website_connection', { p_data: {}, p_id: id('website'), p_version: 999 }, 'Refresh connection version'],
  ['crm_configure_insights', director, 'crm_configure_insights', { p_connection: id('meta'), p_version: 999, p_data: {} }, 'Refresh connection'],
  ['crm_configure_lifecycle', director, 'crm_configure_lifecycle', { p_connection: id('meta'), p_version: 999, p_data: {} }, 'Refresh connection'],
  ['crm_disable_lifecycle', director, 'crm_disable_lifecycle', { p_connection: id('meta'), p_version: 999 }, 'Refresh connection'],
  ['crm_publish_lifecycle_policy', director, 'crm_publish_lifecycle_policy', { p_connection: id('meta'), p_connection_version: 999, p_data: {} }, 'Refresh connection'],
  ['crm_retire_lifecycle_policy', director, 'crm_retire_lifecycle_policy', { p_policy: id('lifecycle_policy'), p_version: 99 }, 'Refresh policy version'],
  ['crm_request_insights_sync', director, 'crm_request_insights_sync', { p_connection: id('meta'), p_request: randomUUID(), p_from: '2026-01-02', p_to: '2026-01-03' }, 'Overlapping synchronization already queued'],
  ['crm_retry_insights_sync', director, 'crm_retry_insights_sync', { p_run: id('failed_run') }, 'Overlapping run'],
  // Online helpers through one course and one lesson command.
  ['online_save_course via course_for_update', director, 'online_save_course', { p_group: id('online_group'), p_expected_version: 7, p_course: { capacity: 8 } }, ...ONLINE_STALE],
  ['online_update_lesson via lesson_for_update', director, 'online_update_lesson', { p_lesson: id('lesson'), p_expected_version: 99, p_changes: { minutes: 60 }, p_scope: 'this' }, ...ONLINE_STALE],
  // Server workers with a lost lease, as service_role.
  ['crm_fail_meta_job', null, 'crm_fail_meta_job', { p_job: id('meta_job'), p_lease: wrongLease, p_code: 'network' }, 'Stale lease'],
  ['crm_finalize_meta_job', null, 'crm_finalize_meta_job', { p_job: id('meta_job'), p_lease: wrongLease, p_mapping: id('mapping'), p_data: {} }, 'Stale lease'],
  ['crm_get_meta_job_mapping', null, 'crm_get_meta_job_mapping', { p_job: id('meta_job'), p_lease: wrongLease, p_form: '119002', p_occurred: new Date().toISOString() }, 'Stale lease'],
  ['crm_finalize_website_job', null, 'crm_finalize_website_job', { p_job: id('website_job'), p_lease: wrongLease, p_mapping: randomUUID(), p_data: {} }, 'Stale lease'],
  ['crm_get_website_job_mapping', null, 'crm_get_website_job_mapping', { p_job: id('website_job'), p_lease: wrongLease }, 'Stale lease'],
  ['crm_fail_insights_sync', null, 'crm_fail_insights_sync', { p_run: id('running_run'), p_lease: wrongLease, p_code: 'network', p_rows: 0 }, 'Stale lease'],
  ['crm_finish_insights_sync', null, 'crm_finish_insights_sync', { p_run: id('running_run'), p_lease: wrongLease, p_data: {} }, 'Stale lease'],
  ['crm_begin_external_attempt', null, 'crm_begin_external_attempt', { p_delivery: id('delivery'), p_lease: wrongLease }, 'Stale/unprepared delivery'],
  ['crm_block_external_delivery', null, 'crm_block_external_delivery', { p_delivery: id('delivery'), p_lease: wrongLease, p_code: 'delivery_held' }, 'Stale/started lease'],
  ['crm_get_external_delivery', null, 'crm_get_external_delivery', { p_delivery: id('delivery'), p_lease: wrongLease }, 'Stale lease'],
  ['crm_prepare_external_delivery', null, 'crm_prepare_external_delivery', { p_delivery: id('delivery'), p_lease: wrongLease, p_payload: {} }, 'Stale lease'],
  ['crm_finish_external_attempt', null, 'crm_finish_external_attempt', { p_delivery: id('delivery'), p_lease: wrongLease, p_result: {} }, 'Stale lease'],
  ['crm_retry_external_delivery via lifecycle_lock_delivery', director, 'crm_retry_external_delivery', { p_delivery: randomUUID() }, 'Delivery missing']
];

let maxMs = 0, calls = 0;
async function refused([label, caller, name, args, message, hint = null]) {
  const before = fingerprint(), start = performance.now();
  const res = await (caller?.client || service).rpc(name, args).abortSignal(AbortSignal.timeout(5000));
  const ms = performance.now() - start; calls++; maxMs = Math.max(maxMs, ms);
  assert(res.error, `${label}: unexpected success`);
  assert.notEqual(res.error.name, 'AbortError', `${label}: no answer within 5 s (retried?)`);
  assert(ms < 2000, `${label}: answered in ${Math.round(ms)} ms`);
  assert.deepEqual([res.status, res.error.code, res.error.message, res.error.hint ?? null], [409, 'PT409', message, hint], label);
  assert.equal(fingerprint(), before, `${label}: a row changed`);
}

const baseline = rollbacks();
for (const testCase of CASES) await refused(testCase);

// Busy (class B): a held enrollment-intent lock refuses a payment at once, no replay.
const holder = spawn('psql', pgArgs, { env: processEnv, stdio: ['pipe', 'pipe', 'pipe'] });
let held = '';
holder.stdout.on('data', chunk => { held += chunk; });
holder.stdin.write(`begin; select pg_advisory_xact_lock(hashtextextended('crm:enrollment-intent:'||${q(id('student'))}::uuid,0)); select 'LOCK_READY';\n`);
for (let i = 0; i < 100 && !held.includes('LOCK_READY'); i++) await new Promise(r => setTimeout(r, 50));
assert(held.includes('LOCK_READY'), 'lock holder ready');
try {
  await refused(['create_charge_payment (held intent lock)', receptionist, 'create_charge_payment',
    { p_payload: { student_id: id('student'), idempotency_key: randomUUID(), amount: 100, payment_method: 'Espèces' } },
    'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.']);
} finally {
  holder.stdin.end('rollback;\n');
  await new Promise(resolve => holder.on('close', resolve));
}
console.log(`PASS ${calls} former-retry paths: HTTP 409 PT409 with today's message and hint, no row changed, slowest ${Math.round(maxMs)} ms`);

// Quiet period: nothing keeps re-running in the server.
await new Promise(r => setTimeout(r, 3000));
const grew = rollbacks() - baseline;
assert(grew <= calls + 25, `xact_rollback grew by ${grew} for ${calls} refused calls: a retry loop is running`);
assert.equal(sql("select count(*) from pg_stat_activity where usename = 'authenticator' and state = 'active' and pid <> pg_backend_pid()"), '0', 'no authenticator backend still active');
const current = sql(`select to_json(updated_at) #>> '{}' from public.students where id=${q(id('student'))}`);
const ok = await receptionist.client.rpc('save_receptionist_student', { p_student: id('student'), p_expected_updated_at: current, p_changes: { telephone: '0600000009' } });
assert.ifError(ok.error);
assert.equal(sql(`select telephone from public.students where id=${q(id('student'))}`), '0600000009');
console.log(`PASS quiet period: xact_rollback +${grew} for ${calls} calls, no active authenticator backend, a normal save succeeds afterwards`);

// REL-4 on the real insert paths: one id from first send to success never gives two rows.
const learner = randomUUID(), payload = { full_name: 'NRC once learner', date_naissance: '2014-05-10', status: 'Enrolled', session_type: 'Yearly' };
assert.equal((await createStudentOnce(admin.client, learner, payload)).status, 'created');
assert.equal((await createStudentOnce(admin.client, learner, payload)).status, 'replayed', 'a resend after a lost answer replays');
assert.equal((await createStudentOnce(admin.client, learner, { ...payload, full_name: 'NRC once edited' })).status, 'already_created');
assert.equal(sql(`select count(*) from public.students where id=${q(learner)} or full_name like 'NRC once %'`), '1', 'one row for one id');
sql(`update public.students set deleted_at=now() where id=${q(learner)}`);
assert.equal((await createStudentOnce(admin.client, learner, payload)).status, 'deleted');
const desk = randomUUID(), changes = { full_name: 'NRC desk learner', session_type: 'Yearly' };
const first = await receptionist.client.rpc('save_receptionist_student', { p_student: desk, p_expected_updated_at: null, p_changes: changes });
assert.ifError(first.error);
const again = await receptionist.client.rpc('save_receptionist_student', { p_student: desk, p_expected_updated_at: null, p_changes: changes });
assert.ifError(again.error); assert.deepEqual(again.data, first.data, 'identical receptionist create replays the same row');
const edited = await receptionist.client.rpc('save_receptionist_student', { p_student: desk, p_expected_updated_at: null, p_changes: { ...changes, full_name: 'NRC desk edited' } });
assert.deepEqual([edited.error?.code, edited.error?.message], ['23505', 'Student create identity conflict']);
assert.equal(sql(`select count(*) from public.students where id=${q(desk)} or full_name like 'NRC desk %'`), '1');
console.log('PASS REL-4: same-id admin insert and receptionist create give one row; replays, edits and deleted learners are recognised');
