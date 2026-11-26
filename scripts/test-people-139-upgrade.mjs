// Destructive LOCAL synthetic upgrade rehearsal 138 → 139 (people identity, plan RWR-r5
// PR B1, M-B1). Run after `supabase db reset --local --version 138 --no-seed`:
//   1. seeds, at 138, students whose stored phone 139 would refuse (letters, a placeholder,
//      a short number), one readable without « + » (« 212… ») and a CRM contact with raw
//      phones only;
//   2. applies the 139 file (the ledger stays at 138) and proves no existing row changed
//      (the new merge columns are null) and that system updates of the bad-phone rows still
//      succeed; only a change of the telephone itself is checked;
//   3. applies the restore file: refused while a merged student exists; then the functions,
//      triggers, policies and indexes are the 138 ones again; only the additive tables and
//      columns stay; a second run refuses (139 is no longer applied);
//   4. applies 139 again on top of the restore (review of #217): the additive objects are
//      created only if absent, the catalog equals the first 139 and a row kept by the
//      restore survives; then restores again, so the lane ends where it did before.
//   node scripts/test-people-139-upgrade.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.PEOPLE_UPGRADE_PORT || '54322';
const psql = (args, input = '', ok = true) => {
  try {
    const out = execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args],
      { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (!ok) assert.fail('expected a refusal, the statement succeeded');
    return out;
  } catch (error) {
    if (ok || error.code === 'ERR_ASSERTION') throw error;
    return String(error.stderr || error.message);
  }
};
const sql = input => psql([], input);
const fails = input => psql([], input, false);
const json = input => JSON.parse(sql(input));
const MIGRATION = 'supabase/migrations/139_people_identity.sql';
const RESTORE = 'scripts/rollback/139_people_identity_restore.sql';
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '138', 'run on a database at migration 138');

const catalog = () => json(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text,p.prorettype::regtype::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'tables',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind='r' and relnamespace in ('public'::regnamespace,'crm_security'::regnamespace,'maintenance'::regnamespace)),
 'columns',(select jsonb_object_agg(table_schema||'.'||table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema in ('public','crm_security')),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','crm_security')),
 'policies',(select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(p)) from pg_policies p),
 'triggers',(select jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(t.tgenabled,pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal))::text`);
const diff = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).sort();
// Row hashes over the columns that existed at 138 (139 adds merged_into_student_id, merged_at).
const touched = ['students', 'authorized_adults', 'crm_contacts', 'crm_leads', 'crm_tasks', 'family_links'];
const hashes = () => Object.fromEntries(touched.filter(t => sql(`select to_regclass('public.${t}') is not null`) === 't').map(t =>
  [t, sql(`select count(*)||':'||md5(coalesce(string_agg((to_jsonb(x)-'merged_into_student_id'-'merged_at')::text,'' order by to_jsonb(x)::text),'')) from public.${t} x`)]));

// 1. Seed at 138 (synthetic; invented numbers only).
const ids = { letters: 'b1a00000-0000-4000-8000-000000000001', placeholder: 'b1a00000-0000-4000-8000-000000000002',
  short: 'b1a00000-0000-4000-8000-000000000003', bare: 'b1a00000-0000-4000-8000-000000000004' };
const contact = 'b1a00000-0000-4000-8000-0000000000c1';
sql(`insert into public.students(id,full_name,telephone,status,session_type) values
  ('${ids.letters}','Upgrade lettres synthétique','appeler la mère','Prospect','Yearly'),
  ('${ids.placeholder}','Upgrade fictif synthétique','06 00 00 00 00','Prospect','Yearly'),
  ('${ids.short}','Upgrade court synthétique','06123','Prospect','Yearly'),
  ('${ids.bare}','Upgrade sans plus synthétique','212 6 47 31 90 58','Prospect','Yearly');
 insert into public.crm_contacts(id,display_name,contact_kind,phone_raw,whatsapp_raw) values
  ('${contact}','Upgrade contact synthétique','guardian','00212 6 58 20 47 13','0758204713');`);
const before = catalog(), rows = hashes();

// 2. Apply 139.
psql(['-1', '-f', MIGRATION]);
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '138', 'the file only, the ledger stays');
assert.deepEqual(hashes(), rows, '139 writes no existing row');
assert.equal(sql(`select count(*) from public.students where merged_into_student_id is not null or merged_at is not null`), '0');
const after = catalog();
assert.deepEqual(diff(before.policies, after.policies).filter(k => !/person_match_decisions|student_merge_journal/.test(k)), [], 'no existing policy changed');
assert.equal(sql(`select to_regprocedure('public.find_people(text,text,text,date,integer)') is not null and to_regprocedure('crm_security.d3_plan()') is not null`), 't', '139 functions present');
// D3 and D5 are not run and not granted to any API role.
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname ~ '^d[35]_'
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))`), '0', 'D3 and D5 not granted');
assert.equal(sql(`select count(*) from public.crm_data_step_journal where step in ('d3','d5')`), '0', 'D3 and D5 not run');
// System updates of a row with an old bad number keep working; the number itself is checked.
sql(`update public.students set notes='Upgrade note', status='Prospect' where id in ('${ids.letters}','${ids.placeholder}','${ids.short}')`);
assert.match(fails(`update public.students set telephone='06 12' where id='${ids.letters}'`), /Numéro invalide/);
assert.match(fails(`update public.students set telephone='0600000000' where id='${ids.short}'`), /Numéro fictif/);
assert.equal(sql(`select public.phone_e164(telephone) from public.students where id='${ids.bare}'`), '+212647319058', '« 212… » without « + » is read');
assert.equal(sql(`select crm_security.normalize_phone(phone_raw) from public.crm_contacts where id='${contact}'`), '+212658204713');
console.log('PASS 138 → 139: no row written, D3 and D5 present but not run or granted, system updates of bad phones still succeed');

// 3. Restore.
sql(`update public.students set merged_into_student_id='${ids.bare}', merged_at=now() where id='${ids.letters}'`);
assert.match(fails(readFileSync(RESTORE, 'utf8')), /merged students exist/, 'refused while a student is merged');
assert.equal(sql(`select to_regprocedure('public.find_people(text,text,text,date,integer)') is not null`), 't', 'the refusal changed nothing');
sql(`update public.students set merged_into_student_id=null, merged_at=null where id='${ids.letters}'`);
// A decision recorded under 139 is kept by the restore and must survive a re-apply.
const decision = 'b1a00000-0000-4000-8000-0000000000d1';
sql(`insert into public.person_match_decisions(id,kind_a,id_a,kind_b,id_b,decision) values('${decision}','prospect','${ids.short}','student','${ids.bare}','different_people')`);
sql(readFileSync(RESTORE, 'utf8'));
const restored = catalog();
assert.deepEqual(diff(before.functions, restored.functions), [], 'functions are the 138 ones');
assert.deepEqual(diff(before.triggers, restored.triggers), [], 'triggers are the 138 ones');
assert.deepEqual(diff(before.policies, restored.policies).filter(k => !/person_match_decisions|student_merge_journal/.test(k)), [], 'policies are the 138 ones');
const additive = /person_match_decisions|student_merge_journal|merged_into_student_id|merged_at|students_merge_|students_merged_into_idx/;
for (const part of ['tables', 'columns', 'constraints', 'indexes']) {
  assert.deepEqual(diff(before[part], restored[part]).filter(k => !additive.test(k)), [], `${part}: only the additive tables and columns stay`);
}
assert.match(fails(readFileSync(RESTORE, 'utf8')), /migration 139 is not applied/, 'a second restore refuses');
assert.deepEqual(hashes(), { ...rows, students: hashes().students }, 'no other row changed');
console.log('PASS restore 139: refused while merged, then the 138 functions, triggers and policies; additive tables and columns kept; second run refused');

// 4. Re-apply after the restore, then restore again.
psql(['-1', '-f', MIGRATION]);
const reapplied = catalog();
for (const part of ['functions', 'triggers', 'policies', 'tables', 'columns', 'constraints', 'indexes']) {
  assert.deepEqual(diff(after[part], reapplied[part]), [], `${part}: the re-applied 139 equals the first one`);
}
assert.equal(sql(`select count(*) from public.person_match_decisions where id='${decision}'`), '1', 'the kept decision survives the re-apply');
assert.equal(sql(`select has_table_privilege('service_role','public.person_match_decisions','select') or has_table_privilege('service_role','public.student_merge_journal','select')`), 'f', 'no service_role privilege on the people tables');
sql(readFileSync(RESTORE, 'utf8'));
assert.deepEqual(diff(before.functions, catalog().functions), [], 'restored again: the 138 functions');
sql(`delete from public.person_match_decisions where id='${decision}'`);
sql(`delete from public.students where id in (${Object.values(ids).map(v => `'${v}'`).join(',')}); delete from public.crm_contacts where id='${contact}';`);
console.log('PASS re-apply 139 after its restore: same catalog as the first 139, kept rows survive; restored again');
