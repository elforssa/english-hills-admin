// Local-only migration 047 authorization regression suite.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const env = {};
for (const line of readFileSync(new URL('.env.local', root), 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '').trim();
}
const base = 'http://127.0.0.1:54321';
const container = 'supabase_db_hills-admin-next';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'Refusing non-local environment');
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
const service = { service: true };
const users = [], ids = { students: [], receipts: [], messages: [], pending_roles: [] };
const run = `auth047-${randomUUID()}`;
let checks = 0;

function sql(input) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
const q = value => `'${String(value).replaceAll("'", "''")}'`;
async function request(actor, path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, redirect: 'error', headers: {
      apikey: actor?.service ? env.SUPABASE_SERVICE_ROLE_KEY : env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ...(actor?.service ? { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } : actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}),
      'Content-Type': 'application/json', Prefer: 'return=representation',
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text(); let data = null;
  try { data = JSON.parse(text); } catch { /* empty error body */ }
  return { ok: response.ok, status: response.status, data, text };
}
async function user(role, label = role) {
  const email = `${run}-${label}@example.invalid`, password = randomBytes(18).toString('base64url');
  const made = await request(service, '/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  assert.ok(made.ok, made.text); users.push(made.data.id);
  sql(`update public.profiles set role=${q(role)} where id=${q(made.data.id)};`);
  const login = await request(null, '/auth/v1/token?grant_type=password', 'POST', { email, password });
  assert.ok(login.ok, login.text);
  return { id: made.data.id, email, role, token: login.data.access_token };
}
function insert(table, row) {
  const id = randomUUID(); ids[table].push(id);
  const cols = ['id', ...Object.keys(row)];
  sql(`insert into public.${table}(${cols.join(',')}) values(${[id, ...Object.values(row)].map(v => v === null ? 'null' : typeof v === 'boolean' ? String(v) : q(v)).join(',')});`);
  return id;
}
async function visible(actor, table) {
  const result = await request(actor, `/rest/v1/${table}?select=*&order=id`);
  assert.ok(result.ok, result.text); return result.data;
}
function messageRow(id) { return JSON.parse(sql(`select row_to_json(m) from public.messages m where id=${q(id)};`)); }

assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='047'"), '1');
for (const name of ['receipts student read', 'messages self update', 'pending_roles self read']) {
  assert.equal(sql(`select count(*) from pg_policies where schemaname='public' and policyname=${q(name)};`), '0'); checks++;
}
assert.equal(sql("select prosecdef and 'search_path=pg_catalog, pg_temp'=any(proconfig) from pg_proc where oid='public.mark_message_read(uuid)'::regprocedure;"), 't'); checks++;

try {
  const student = await user('student');
  const parent = await user('parent');
  const otherParent = await user('parent', 'other-parent');
  const teacher = await user('teacher');
  const admin = await user('admin');
  const director = await user('director');
  const child = insert('students', { full_name: `${run} Child`, email: student.email, parent_email: parent.email });
  const otherChild = insert('students', { full_name: `${run} Other`, parent_email: otherParent.email });
  const receipt = insert('receipts', { student_id: child, date: '2026-09-13', nom_prenom: run, telephone: '000', categorie: 'Enfants', niveau: 'A1', type_cours: 'Standard', montant_total: '100', montant_paye: '50', mode_paiement: 'Espèces' });
  insert('receipts', { student_id: otherChild, date: '2026-09-13', nom_prenom: `${run} Other`, telephone: '000', categorie: 'Enfants', niveau: 'A1', type_cours: 'Standard', montant_total: '100', montant_paye: '50', mode_paiement: 'Espèces' });

  assert.deepEqual(await visible(student, 'receipts'), []); checks++;
  assert.deepEqual((await visible(parent, 'receipts')).map(r => r.id), [receipt]); checks++;
  assert.deepEqual(await visible(otherParent, 'receipts').then(rows => rows.map(r => r.student_id)), [otherChild]); checks++;
  assert.equal((await visible(admin, 'receipts')).length, 2); checks++;
  assert.equal((await visible(director, 'receipts')).length, 2); checks++;
  assert.deepEqual(await visible(teacher, 'receipts'), []); checks++;

  const message = insert('messages', { from_user_email: admin.email, to_user_email: parent.email, subject: run, body: 'original', read: false });
  const before = messageRow(message);
  for (const patch of [{ read: true }, { body: 'forged' }, { subject: 'forged' }, { from_user_email: parent.email }, { to_user_email: parent.email }, { updated_at: '2000-01-01T00:00:00Z' }]) {
    const response = await request(parent, `/rest/v1/messages?id=eq.${message}`, 'PATCH', patch);
    assert.ok(!response.ok || response.data.length === 0); assert.deepEqual(messageRow(message), before); checks++;
  }
  const marked = await request(parent, '/rest/v1/rpc/mark_message_read', 'POST', { p_message_id: message });
  assert.ok(marked.ok); assert.equal(marked.data, true);
  const after = messageRow(message); assert.deepEqual({ ...after, read: false }, before); checks += 2;
  for (const actor of [otherParent, teacher, student]) {
    const denied = await request(actor, '/rest/v1/rpc/mark_message_read', 'POST', { p_message_id: message });
    assert.equal(denied.ok, false); checks++;
  }
  assert.equal((await request(null, '/rest/v1/rpc/mark_message_read', 'POST', { p_message_id: message })).ok, false); checks++;

  const queue = insert('pending_roles', { email: parent.email, role: 'teacher', invited_by: director.id, target_user_id: parent.id, expires_at: '2026-09-20T00:00:00Z' });
  assert.deepEqual(await visible(parent, 'pending_roles'), []); checks++;
  assert.deepEqual(await visible(student, 'pending_roles'), []); checks++;
  assert.equal((await visible(admin, 'pending_roles')).some(r => r.id === queue), true); checks++;
  assert.equal((await visible(director, 'pending_roles')).some(r => r.id === queue), true); checks++;

  console.log(`PASS migration 047 authorization cleanup: ${checks} checks`);
} finally {
  let cleanup = 'begin;';
  for (const table of ['pending_roles', 'messages', 'receipts', 'students']) if (ids[table].length) cleanup += `delete from public.${table} where id in (${ids[table].map(q).join(',')});`;
  if (users.length) cleanup += `alter table public.profiles disable trigger role_security_guard; delete from auth.users where id in (${users.map(q).join(',')}); alter table public.profiles enable trigger role_security_guard; update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director'); delete from public.activity_log where actor_id in (${users.map(q).join(',')}) or target_id in (${[...Object.values(ids).flat(), ...users].map(q).join(',')});`;
  sql(cleanup + 'commit;');
  console.log('Synthetic migration 047 fixtures removed.');
}
