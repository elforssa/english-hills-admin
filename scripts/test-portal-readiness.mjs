// Portal readiness (plan PRF-r2) cross-role denial suite through real local sessions:
// PostgREST with real JWTs and the built app's routes with real cookie sessions.
// Local-only; requires the app on 127.0.0.1:3101 (npm run build && npm run start).
// Covers the REST half of T-01..T-04 (direct reads empty, projections free of
// staff-only keys and of any other person's address or phone), T-09/T-10/T-12/T-14
// (links, not addresses), T-17/T-20 through /api/admin/invite, T-35 through
// /api/email/send, T-37/T-38 (origin guard on every guarded route, exempt routes
// untouched) and T-39 (anonymous reads). Removes only this run's fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { CROSS_ORIGIN_ERROR, CONTENT_TYPE_ERROR } from '../src/lib/http/requestOrigin.mjs';

const root = new URL('../', import.meta.url);
assertLocalFeatureBranch(root);
const env = {};
for (const line of readFileSync(new URL('.env.local', root), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '').trim();
}
const base = 'http://127.0.0.1:54321', container = 'supabase_db_hills-admin-next', app = 'http://127.0.0.1:3101';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'Refusing non-local environment');
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
function sql(input) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
assert.equal(sql("select count(*) from pg_proc where proname = 'portal_learner_record'"), '1', 'migration 122 applied');
assert.equal(sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"), '0');
const run = 'portal-' + randomUUID().slice(0, 8), password = randomBytes(24).toString('base64url');
const users = [], ids = Object.fromEntries(['t1', 't2', 'g1', 'childA', 'childB', 'adult', 'receipt', 'charge'].map(k => [k, randomUUID()]));
const shared = Array.from({ length: 5 }, () => randomUUID());
let checks = 0, officeConfigured = false;

async function request(actor, path, method = 'GET', body, extra = {}) {
  const res = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(actor?.token ? { Authorization: 'Bearer ' + actor.token } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}
const ok = r => { assert.ok(r.ok, JSON.stringify(r)); return r.data; };
const rpc = (actor, name, args = {}) => request(actor, '/rest/v1/rpc/' + name, 'POST', args);
const emptyOrRefused = r => r.ok ? assert.deepEqual(r.data, [], JSON.stringify(r)) : assert.ok([401, 403].includes(r.status), JSON.stringify(r));
async function makeUser(role, label = role) {
  const email = `${run}-${label}@example.invalid`;
  const res = await fetch(base + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.ok(res.ok); const u = await res.json(); const actor = { id: u.id, email, role }; users.push(actor);
  sql(`update public.profiles set role='${role}', full_name='${run} ${label}' where id='${u.id}';`);
  const session = ok(await request(null, '/auth/v1/token?grant_type=password', 'POST', { email, password }));
  actor.token = session.access_token; actor.refreshToken = session.refresh_token;
  return actor;
}
// A route call as a signed-in browser would make it (cookie session); headers overridable.
async function route(actor, path, body, headers = { 'Content-Type': 'application/json', Origin: app }) {
  const cookies = new Map();
  if (actor) {
    const client = createServerClient(base, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: items => items.forEach(({ name, value }) => cookies.set(name, value)) } });
    assert.equal((await client.auth.setSession({ access_token: actor.token, refresh_token: actor.refreshToken })).error, null);
  }
  const res = await fetch(app + path, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { ...headers, ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; ') } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

const STAFF_KEYS = ['notes', 'referral_source', 'photo_consent_at', 'plan_type', 'premium_start_date', 'premium_end_date', 'deleted_at',
  'documents_urls', 'registration_request_id', 'registration_payload_hash', 'consent_at', 'consent_policy_version', 'consent_source',
  'payment_note', 'void_reason', 'voided_by', 'actor_id', 'actor_name', 'email_delivery_status', 'email_request_id', 'email_attempt_count',
  'email_last_attempted_at', 'email_last_error', 'idempotency_key', 'legacy', 'photo_consent', 'created_by', 'legacy_receipt_id',
  'examinateur', 'crm_lead_id', 'email', 'telephone', 'parent_email', 'date_naissance', 'to_user_email', 'from_user_email', 'recipient_email'];
function keys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keys(v, found));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { found.add(k); keys(v, found); }
  return found;
}

try {
  const admin = await makeUser('admin'), receptionist = await makeUser('receptionist'), office = await makeUser('admin', 'office');
  const teacher = await makeUser('teacher'), teacher2 = await makeUser('teacher', 'teacher2');
  const parent = await makeUser('parent'), unlinked = await makeUser('parent', 'unlinked'), student = await makeUser('student');
  const pending = await makeUser('pending');
  const phones = { childA: '0611' + run.slice(-6), childB: '0622' + run.slice(-6), adult: '0633' + run.slice(-6), teacher: '0644' + run.slice(-6) };
  const otherFamily = `${run}-other-family@example.invalid`, placeholder = `${run}-placeholder@example.invalid`;
  sql(`begin;
    insert into public.app_config(key, value, label) values ('portal_office_profile_id', '${office.id}', 'Accueil portail ${run}');
    insert into public.teachers(id, full_name, email, contract_type, telephone) values
      ('${ids.t1}', '${run} Teacher One', '${teacher.email}', 'Freelance', '${phones.teacher}'),
      ('${ids.t2}', '${run} Teacher Two', '${teacher2.email}', 'Freelance', null);
    update public.profiles set linked_teacher_id = '${ids.t1}' where id = '${teacher.id}';
    update public.profiles set linked_teacher_id = '${ids.t2}' where id = '${teacher2.id}';
    insert into public.groups(id, name, session_type, niveau, teacher_id, annee) values ('${ids.g1}', '${run} G1', 'Yearly', 'Child 1', '${ids.t1}', '2026-2027');
    insert into public.students(id, full_name, email, parent_email, telephone, date_naissance, status, notes, age_category, session_type) values
      ('${ids.childA}', 'Sara ${run}', null, '${parent.email}', '${phones.childA}', '2016-01-01', 'Prospect', 'staff note', 'Young Learners (6-12)', 'Yearly'),
      ('${ids.childB}', 'Lina ${run}', null, '${otherFamily}', '${phones.childB}', '2016-02-01', 'Prospect', null, 'Young Learners (6-12)', 'Yearly'),
      ('${ids.adult}', 'Karim ${run}', '${student.email}', null, '${phones.adult}', '1990-01-01', 'Prospect', 'adult note', 'Adults (18+)', 'Yearly');
    insert into public.students(id, full_name, parent_email, status, age_category, session_type)
      select unnest(array['${shared.join("','")}']::uuid[]), 'Shared ${run}', '${placeholder}', 'Prospect', 'Young Learners (6-12)', 'Yearly';
    insert into public.enrollments(student_id, group_id, status, session_type, school_year, level, notes) values
      ('${ids.childA}', '${ids.g1}', 'Validated', 'Yearly', '2026/2027', 'Child 1', 'enrollment note'),
      ('${ids.childB}', '${ids.g1}', 'Validated', 'Yearly', '2026/2027', 'Child 1', null),
      ('${ids.adult}', '${ids.g1}', 'Validated', 'Yearly', '2026/2027', 'Child 1', null);
    set local session_replication_role = replica;
    insert into public.charges(id, student_id, session_type, service_description, gross_amount, school_year, created_by)
      values ('${ids.charge}', '${ids.childA}', 'Yearly', 'Yearly · 2026/2027', 3000, '2026/2027', '${admin.id}');
    insert into public.receipts(id, student_id, charge_id, receipt_number, date, nom_prenom, telephone, email, montant_total, montant_paye,
      mode_paiement, payment_note, actor_name, email_delivery_status, legacy, school_year_snapshot, session_type)
      values ('${ids.receipt}', '${ids.childA}', '${ids.charge}', 'EH-${run}', current_date, 'Sara ${run}', '${phones.childB}', '${otherFamily}',
        3000, 1000, 'Espèces', 'internal note', 'Staff Name', 'failed', false, '2026/2027', 'Yearly');
    commit;`);
  officeConfigured = true;

  // T-17/T-20 through the invite route: the parent account (already registered) is
  // linked to the confirmed learner at once; the placeholder pattern is refused.
  ok(await route(admin, '/api/admin/invite', { email: parent.email, role: 'parent', studentIds: [ids.childA] }));
  const refusedPlaceholder = await route(admin, '/api/admin/invite', { email: placeholder, role: 'parent', studentIds: [shared[0]] });
  assert.equal(refusedPlaceholder.status, 403); assert.equal(refusedPlaceholder.data.reason, 'portal.shared_address');
  assert.match(refusedPlaceholder.data.error, /^Adresse partagée par plusieurs familles/);
  const byReception = await route(receptionist, '/api/admin/invite', { email: parent.email, role: 'parent', studentIds: [ids.childA] });
  assert.equal(byReception.status, 403);
  ok(await rpc(admin, 'link_family_student', { p_profile_id: student.id, p_student_id: ids.adult }));
  checks += 5;
  console.log('PASS invitation route: links the confirmed learner, refuses the placeholder and reception');

  // T-01: no portal role reads the D2 tables directly; T-39: anonymous reads are refused or empty.
  for (const actor of [teacher, teacher2, parent, unlinked, student, pending, null]) {
    for (const table of ['students', 'enrollments', 'receipts', 'charges', 'charge_balances', 'legacy_receipt_reconciliation', 'family_links']) {
      emptyOrRefused(await request(actor, `/rest/v1/${table}?select=*`)); checks++;
    }
  }
  for (const table of ['messages', 'notifications', 'groups', 'app_config', 'announcements', 'profiles', 'attendance', 'placement_tests', 'certificates']) {
    emptyOrRefused(await request(null, `/rest/v1/${table}?select=*`)); checks++;
  }
  console.log('PASS direct reads: portal roles and anonymous requests get no learner, enrollment, finance or link row');

  // T-03/T-04 key and value scan of every portal response.
  ok(await rpc(parent, 'portal_send_message', { p_recipient_key: 'teacher:' + ids.t1, p_subject: run, p_body: 'Question du parent.' }));
  ok(await rpc(teacher, 'portal_send_message', { p_recipient_key: 'parent:' + ids.childA, p_subject: run, p_body: 'Réponse.' }));
  const contacts = [parent.email, unlinked.email, student.email, teacher.email, teacher2.email, office.email, otherFamily, placeholder,
    ...Object.values(phones)];
  const responses = {
    parent: [await rpc(parent, 'portal_my_learners'), await rpc(parent, 'portal_learner_record', { p_student_id: ids.childA }),
      await rpc(parent, 'portal_message_recipients'), await rpc(parent, 'portal_my_messages', { p_box: 'inbox' }),
      await rpc(parent, 'portal_my_messages', { p_box: 'sent' })],
    student: [await rpc(student, 'portal_my_learners'), await rpc(student, 'portal_learner_record', { p_student_id: ids.adult }),
      await rpc(student, 'portal_message_recipients'), await rpc(student, 'portal_my_messages', { p_box: 'inbox' })],
    teacher: [await rpc(teacher, 'portal_teacher_roster'), await rpc(teacher, 'portal_message_recipients'),
      await rpc(teacher, 'portal_my_messages', { p_box: 'inbox' }), await rpc(teacher, 'portal_my_messages', { p_box: 'sent' })],
  };
  for (const [role, list] of Object.entries(responses)) for (const response of list) {
    const data = ok(response), text = JSON.stringify(data);
    const leaked = [...keys(data)].filter(k => STAFF_KEYS.includes(k));
    assert.deepEqual(leaked, [], `${role} response carries staff-only keys`);
    for (const value of contacts) assert.ok(!text.includes(value), `${role} response carries a contact value`);
    checks += 2;
  }
  const record = ok(responses.parent[1]);
  assert.equal(record.receipts.length, 1); assert.equal(record.receipts[0].is_legacy, false);
  assert.equal(Number(record.charges[0].balance), 2000);
  assert.deepEqual(ok(responses.teacher[0]).map(r => r.student_id).sort(), [ids.childA, ids.childB, ids.adult].sort());
  checks += 3;
  console.log('PASS projections: no staff-only key and no other person\'s address or phone in any portal response');

  // T-09/T-10/T-14: links, not addresses.
  assert.deepEqual(ok(await rpc(parent, 'portal_my_learners')).map(r => r.student_id), [ids.childA]);
  assert.deepEqual(ok(await rpc(unlinked, 'portal_my_learners')), []);
  sql(`update public.students set parent_email = '${unlinked.email}' where id = '${ids.childA}';`);
  assert.deepEqual(ok(await rpc(parent, 'portal_my_learners')).map(r => r.student_id), [ids.childA], 'a dossier edit removes nothing');
  assert.deepEqual(ok(await rpc(unlinked, 'portal_my_learners')), [], 'nor grants anything');
  const notLinked = await rpc(unlinked, 'portal_learner_record', { p_student_id: ids.childA });
  assert.equal(notLinked.status, 403); assert.equal(notLinked.data.hint, 'portal.not_linked');
  checks += 5;
  console.log('PASS family access follows staff-approved links, never the dossier address');

  // T-35 through the route: a portal caller names only the saved message; `to` is ignored.
  const noMessage = await route(parent, '/api/email/send', { to: `${run}-attacker@example.invalid`, subject: 'x', body: 'y' });
  assert.equal(noMessage.status, 403);
  const [saved] = ok(await rpc(parent, 'portal_send_message', { p_recipient_key: 'office', p_subject: run, p_body: 'Pour l’accueil.' }));
  ok(await route(parent, '/api/email/send', { message_id: saved, to: `${run}-attacker@example.invalid` }));
  const othersMessage = await route(student, '/api/email/send', { message_id: saved });
  assert.equal(othersMessage.status, 403);
  assert.equal(sql(`select recipient_profile_id from public.messages where id = '${saved}'`), office.id);
  checks += 4;
  console.log('PASS e-mail route: portal notices only for the caller\'s saved message, sent to its recipient account');

  // T-12: revoking the link ends access and the rows about the learner at once.
  const [link] = ok(await rpc(admin, 'list_family_links', { p_student_id: ids.childA }));
  ok(await rpc(admin, 'revoke_family_link', { p_link_id: link.id, p_reason: 'Fin de test' }));
  assert.deepEqual(ok(await rpc(parent, 'portal_my_learners')), []);
  assert.deepEqual(ok(await rpc(parent, 'portal_my_messages', { p_box: 'inbox' })).filter(m => m.student_id === ids.childA), []);
  const again = await rpc(admin, 'revoke_family_link', { p_link_id: link.id, p_reason: 'Encore' });
  assert.equal(again.status, 409); assert.equal(again.data.code, 'PT409'); assert.equal(again.data.hint, 'portal.link_not_active');
  checks += 5;
  console.log('PASS revocation: access and messages end at once; a second revoke is a PT409 conflict');

  // T-37/T-38: every guarded route refuses a missing or foreign Origin and a non-JSON body,
  // before authentication; the exempt routes keep their own authentication.
  const guarded = ['/api/admin/invite', '/api/admin/update-role', '/api/admin/payroll', '/api/email/send', '/api/storage/sign',
    '/api/storage/finalize', '/api/online/join', '/api/online/courses/activate', '/api/online/courses/close',
    '/api/online/lessons/cancel', '/api/online/lessons/reschedule'];
  for (const path of guarded) for (const actor of [admin, null]) {
    for (const [headers, status, error] of [
      [{ 'Content-Type': 'application/json' }, 403, CROSS_ORIGIN_ERROR],
      [{ 'Content-Type': 'application/json', Origin: 'https://english-hills.com' }, 403, CROSS_ORIGIN_ERROR],
      [{ 'Content-Type': 'application/json', Origin: app, 'Sec-Fetch-Site': 'cross-site' }, 403, CROSS_ORIGIN_ERROR],
      [{ 'Content-Type': 'text/plain', Origin: app }, 415, CONTENT_TYPE_ERROR],
    ]) {
      const r = await route(actor, path, '{}', headers);
      assert.equal(r.status, status, path + ' ' + JSON.stringify(headers)); assert.equal(r.data?.error, error); checks++;
    }
  }
  for (const [path, method] of [['/api/webhooks/online/fake', 'POST'], ['/api/cron/crm-intake', 'GET'], ['/api/cron/crm-lifecycle', 'GET'],
    ['/api/public/inscription', 'POST']]) {
    const res = await fetch(app + path, { method, redirect: 'manual', ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}) });
    const data = await res.json().catch(() => null);
    assert.ok(![CROSS_ORIGIN_ERROR, CONTENT_TYPE_ERROR].includes(data?.error), path + ' must keep its own authentication');
    checks++;
  }
  console.log(`PASS origin guard: ${guarded.length} routes refuse cross-origin and non-JSON requests; exempt routes unchanged`);
  console.log(`PASS portal readiness REST/HTTP suite: ${checks} checks`);
} finally {
  const userIds = users.map(u => `'${u.id}'`).join(',') || 'null';
  const students = [ids.childA, ids.childB, ids.adult, ...shared].map(id => `'${id}'`).join(',');
  sql(`begin;
    delete from public.messages where sender_profile_id in (${userIds}) or recipient_profile_id in (${userIds});
    delete from public.family_links where student_id in (${students});
    delete from public.pending_roles where invited_by in (${userIds});
    set local session_replication_role = replica;
    delete from public.receipts where id = '${ids.receipt}';
    delete from public.charges where id = '${ids.charge}';
    set local session_replication_role = origin;
    set local eh.enrollment_command = on;
    delete from public.enrollments where student_id in (${students});
    delete from public.students where id in (${students});
    delete from public.groups where id = '${ids.g1}';
    update public.profiles set linked_teacher_id = null where linked_teacher_id in ('${ids.t1}', '${ids.t2}');
    delete from public.teachers where id in ('${ids.t1}', '${ids.t2}');
    ${officeConfigured ? `delete from public.app_config where key = 'portal_office_profile_id' and label = 'Accueil portail ${run}';` : ''}
    delete from public.activity_log where actor_id in (${userIds}) or target_id in (${students}, '${ids.t1}', '${ids.t2}', '${ids.g1}', '${ids.receipt}');
    delete from public.rate_limits where user_id in (${userIds});
    alter table public.profiles disable trigger role_security_guard;
    delete from auth.users where id in (${userIds});
    alter table public.profiles enable trigger role_security_guard;
    update role_security.director_guard set director_count = (select count(*) from public.profiles where role = 'director');
    commit;`);
  console.log('Synthetic portal fixtures removed.');
}
