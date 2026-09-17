// Local-only large-data report/export fixture. --ui holds the synthetic rows
// for browser inspection until Enter; the finally block removes this run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { paginateAll } from '../src/lib/paginateAll.mjs';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';

const root = new URL('../', import.meta.url);
assertLocalFeatureBranch(root);
const hold = process.argv.includes('--ui');
assert.ok(!hold || process.stdin.isTTY, '--ui requires an interactive terminal for cleanup');
const env = {};
for (const line of readFileSync(new URL('.env.local', root), 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
const base = 'http://127.0.0.1:54321';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'Refusing nonlocal Supabase');
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
const run = 'large-audit-' + randomUUID();
const email = run + '@example.invalid';
const password = randomBytes(24).toString('base64url');
let userId = null;
function sql(statement) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_hills-admin-next',
    'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='071'"), '1');
assert.equal(sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"), '0');
const admin = createClient(base, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) throw createError;
  userId = created.user.id;
  sql("update public.profiles set role='admin', full_name='Synthetic Large Data Admin' where id='" + userId + "';");
  const statement = "insert into public.students(full_name,status,session_type,niveau_cefr) "
    + "select '" + run + "-' || lpad(n::text,4,'0'), 'Enrolled', 'Yearly', 'A1' "
    + "from generate_series(1,1205) n;";
  sql(statement);
  const actor = createClient(base, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await actor.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  const { data: exportData, error: exportError } = await actor.rpc('search_students_page', {
    p_search: run, p_page: 1, p_page_size: 0,
  });
  if (exportError) throw exportError;
  assert.equal(exportData.count, 1205);
  assert.equal(exportData.rows.length, 1205);
  assert.equal(new Set(exportData.rows.map(row => row.id)).size, 1205);
  const pages = [];
  const reportRows = await paginateAll(async (from, to) => {
    pages.push([from, to]);
    return actor.from('students').select('*', { count: 'exact' })
      .order('full_name', { ascending: true }).order('id', { ascending: true }).range(from, to);
  });
  const fromRun = reportRows.filter(row => row.full_name.startsWith(run + '-'));
  assert.equal(fromRun.length, 1205);
  assert.equal(new Set(fromRun.map(row => row.id)).size, 1205);
  assert.ok(pages.length >= 3);
  console.log('PASS local report source and student export: 1,205 synthetic rows, ' + pages.length + ' complete report pages');
  if (hold) {
    console.log('LOCAL SYNTHETIC LARGE-DATA UI FIXTURE ' + JSON.stringify({ email, password, run }));
    console.log('Press Enter after browser checks to remove the fixture.');
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));
    process.stdin.pause();
  }
} finally {
  const prefix = run + '-%';
  const cleanup = 'begin; lock table public.profiles in access exclusive mode; '
    + "create temp table cleanup_students on commit drop as select id from public.students where full_name like '" + prefix + "'; "
    + 'delete from public.students where id in (select id from cleanup_students); '
    + (userId ? "alter table public.profiles disable trigger role_security_guard; delete from auth.users where id='" + userId
      + "'; alter table public.profiles enable trigger role_security_guard; "
      + "update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director'); " : '')
    + 'delete from public.activity_log where target_id in (select id from cleanup_students)'
    + (userId ? " or actor_id='" + userId + "'" : '') + '; commit;';
  sql(cleanup);
  console.log('Synthetic local large-data rows and account removed; role guard restored.');
}
