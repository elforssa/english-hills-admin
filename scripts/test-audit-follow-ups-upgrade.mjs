// Destructive LOCAL synthetic upgrade rehearsal for Batch H (plan AFU-r1, H7): run
// after `supabase db reset --local --version 124 --no-seed`.
// 1. The 124 bodies of the probed functions, with the zone name (and the CRM policy
//    timezone column) set to 'UTC', give exactly what the 125 bodies give over a grid
//    of instants across midnight, 23:00–24:00 and New Year. 'UTC' reads the same in
//    every tzdata release, so the proof does not depend on the server's Casablanca data.
// 2. The function catalog changes only where the plan says; the restore script returns
//    it exactly to 124; the migration applies again; no row of the touched tables changes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.AFU_PORT || '54322';
const psql = (input) => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' },
  maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const json = (input) => JSON.parse(psql(input).split('\n').pop());
const MIGRATION = 'supabase/migrations/125_audit_follow_ups.sql';
const RESTORE = 'scripts/rollback/125_audit_follow_ups_restore.sql';
assert.equal(psql('select max(version) from supabase_migrations.schema_migrations'), '124', 'run on a database at migration 124');
let checks = 0;

const POLICY = 'afe00000-0000-4000-8000-000000000001';
const AUTHOR = 'afe00000-0000-4000-8000-000000000002';
psql(`insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
  values ('${AUTHOR}', 'afu-upgrade@example.test', 'authenticated', 'authenticated', now(), now(), now())`);
psql(`insert into public.crm_followup_policies(id, version, weekly_hours, date_exceptions, stale_contacting_minutes, effective_from, created_by)
  values ('${POLICY}', 9001, '{"1":[["09:00","12:00"],["14:00","19:00"]],"2":[["09:00","19:00"]],"3":[["09:00","19:00"]],
    "4":[["09:00","19:00"]],"5":[["09:00","19:00"]],"6":[["10:00","13:00"]]}', '[]', 1440, now(), '${AUTHOR}')`);

const GRID = ['2026-10-29 08:59:59+00', '2026-10-29 09:00:00+00', '2026-10-29 18:30:00+00', '2026-10-29 22:59:59+00',
  '2026-10-29 23:00:00+00', '2026-10-29 23:30:00+00', '2026-10-29 23:59:59+00', '2026-10-30 00:00:00+00',
  '2026-12-31 23:30:00+00', '2027-01-01 00:00:00+00', '2027-08-31 23:30:00+00', '2027-09-01 00:00:00+00', '2026-11-01 12:00:00+00'];
const probe = `select jsonb_agg(jsonb_build_object(
    'at', g.at,
    'business_date', public.business_date(g.at),
    'local_date', online_security.local_date(g.at),
    'local_time', online_security.local_time(g.at),
    'french_when', online_security.french_when(g.at),
    'scheduled_civil', crm_security.scheduled_civil(g.at),
    'work_boundaries', (select to_jsonb(w) from crm_security.work_boundaries(g.at) w),
    'enrollment_year', crm_security.enrollment_year(jsonb_populate_record(null::public.enrollments, jsonb_build_object('created_at', g.at))),
    'next_window', crm_security.next_window('${POLICY}', g.at),
    'attempt_due', crm_security.attempt_due('${POLICY}', public.business_date(g.at), 3, g.at, g.at)) order by g.at)
  from unnest(array[${GRID.map(at => `timestamptz '${at}'`).join(', ')}]) g(at)`;
const today = `select jsonb_build_object('academic', academic_security.today() = (now() at time zone 'UTC')::date,
  'online', online_security.today() = (now() at time zone 'UTC')::date, 'business', public.business_date() = (now() at time zone 'UTC')::date)`;

// The 124 logic read at UTC: each probed body with the zone (or the policy column) set to 'UTC'.
const PROBED = ['public.business_date', 'online_security.local_date', 'online_security.local_time', 'online_security.french_when',
  'crm_security.scheduled_civil', 'crm_security.work_boundaries', 'crm_security.enrollment_year', 'crm_security.next_window',
  'crm_security.attempt_due', 'academic_security.today', 'online_security.today'];
const body = (name) => psql(`select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname || '.' || p.proname = '${name}'`);
const atUtc = PROBED.map((name) => {
  const text = body(name);
  assert.match(text, /at time zone ('Africa\/Casablanca'|p\.timezone)/i, `${name} reads the zone at 124`);
  return `${text.replace(/at time zone 'Africa\/Casablanca'/gi, "at time zone 'UTC'").replace(/at time zone p\.timezone\b/gi, "at time zone 'UTC'")};`;
}).join('\n');
const before = json(`begin;\n${atUtc}\n${probe};`);
const beforeToday = json(`begin;\n${atUtc}\n${today};`);
checks += 2;

const catalog = () => json(`select jsonb_object_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    md5(p.prosrc) || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(p.proconfig::text, '') || ':' || coalesce(p.proacl::text, ''))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog', 'information_schema')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`);
const rows = () => json(`select jsonb_build_object(${['students', 'groups', 'enrollments', 'charges', 'receipts', 'crm_tasks', 'crm_followup_policies']
  .map(t => `'${t}', (select coalesce(md5(string_agg(to_jsonb(x)::text, ',' order by x.id)), '') from public.${t} x)`).join(', ')})`);
const catalog124 = catalog();
const rows124 = rows();

psql(readFileSync(MIGRATION, 'utf8'));
const after = json(probe);
assert.deepEqual(after, before, 'every probed function gives the 124 result read at UTC');
assert.deepEqual(json(today), beforeToday);
assert.deepEqual(Object.values(json(today)), [true, true, true], 'today is the UTC date');
checks += 3;
// The one-hour CRM correction, stated: a 09:00 window opens at 09:00Z.
assert.equal(psql(`select crm_security.next_window('${POLICY}', timestamptz '2026-10-29 08:30:00+00') = timestamptz '2026-10-29 09:00:00+00'`), 't');
assert.equal(psql(`select public.business_date(timestamptz '2026-12-31 23:30:00+00')`), '2026-12-31');
checks += 2;

const catalog125 = catalog();
const changed = Object.keys({ ...catalog124, ...catalog125 }).filter(k => catalog124[k] !== catalog125[k]).map(k => k.replace(/\(.*$/, '')).sort();
const expected = ['academic_security.check_group_year', 'academic_security.guard_enrollment_group_year', 'academic_security.guard_group_year',
  'public.centre_school_year', 'public.centre_utc_offset', 'public.business_date', 'public.create_charge_payment_financial',
  'public.crm_start_enrollment', 'public.save_receptionist_enrollment', 'public.crm_enrollment_groups',
  ...['academic_security.today', 'online_security.today', 'online_security.local_date', 'online_security.local_time', 'online_security.french_when',
    'online_security.pattern_slots', 'public.online_update_lesson', 'public.attendance_student_in_group', 'public.count_today_dismissals',
    'public.enforce_dismissal_integrity', 'public.create_public_registration', 'public.guard_premium_homework_write',
    'public.portal_request_reenrollment', 'public.list_activity_log', 'public.crm_get_today', 'public.crm_get_admissions_calendar',
    'crm_security.command', 'crm_security.enrollment_year', 'crm_security.opportunity_card', 'crm_security.reminder_due',
    'crm_security.opportunity_ids', 'crm_security.work_boundaries', 'crm_security.placement_integrity', 'crm_security.placement_summary',
    'crm_security.scheduled_civil', 'crm_security.next_window', 'crm_security.attempt_due', 'crm_security.accept_external_submission']].sort();
assert.deepEqual(changed, expected, 'the catalog changes only where the plan says');
// Every re-created function keeps its security posture, configuration and grants.
for (const key of Object.keys(catalog124)) {
  if (catalog125[key] !== catalog124[key]) assert.equal(catalog125[key].split(':').slice(1).join(':'), catalog124[key].split(':').slice(1).join(':'), key);
}
assert.equal(psql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and (p.prosrc ~* 'at time zone\\s+''Africa/Casablanca''' or p.prosrc ~* 'at time zone\\s+p\\.timezone' or p.prosrc ~* 'timezone\\(''Africa/Casablanca''')
    and n.nspname || '.' || p.proname <> 'academic_security.egc_cleanup_c1'`), '0', 'no time computation reads the zone name');
assert.deepEqual(rows(), rows124, 'no row changes');
checks += 4;

psql(readFileSync(RESTORE, 'utf8'));
assert.deepEqual(catalog(), catalog124, 'the restore returns the function catalog exactly to 124');
assert.equal(psql(`select count(*) from pg_trigger where tgname in ('enrollment_group_year_guard', 'groups_year_guard')`), '0');
psql(readFileSync(MIGRATION, 'utf8'));
assert.deepEqual(catalog(), catalog125, 'the migration applies again after a restore');
assert.deepEqual(rows(), rows124);
checks += 4;
// Published policy versions are immutable (by trigger); the synthetic one is removed as owner.
psql(`set session_replication_role = replica; delete from public.crm_followup_policies where id = '${POLICY}';
  delete from auth.users where id = '${AUTHOR}'; set session_replication_role = origin;`);
console.log(`PASS Batch H upgrade 124 → 125: ${checks} checks (UTC equivalence over ${GRID.length} instants, catalog manifest, restore round trip)`);
