// Run: node scripts/test-batch1-security.mjs
// Requires local Supabase, Docker, and migration 041. Never targets cloud.
// Synthetic fixtures are removed in finally; no existing records are deleted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';

const root = new URL('../', import.meta.url);
assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(), 'codex-migration');
const env = {};
for (const line of readFileSync(new URL('.env.local', root), 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '').trim();
}
const base = 'http://127.0.0.1:54321';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'Refusing non-local environment');
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
const container = 'supabase_db_hills-admin-next';
function sql(statement) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='041'"), '1');
// Receipt fixtures must never trigger an external email webhook.
assert.equal(sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"), '0', 'Refusing configured receipt webhooks');

const batch2 = sql("select count(*) from supabase_migrations.schema_migrations where version='042'") === '1';
const run = `batch1-${randomUUID()}`;
const password = randomBytes(24).toString('base64url');
const roles = ['pending', 'parent', 'student', 'teacher', 'admin', 'director'];
const users = [];
const records = { students: [], teachers: [], receipts: [] };
const pendingEmails = [];
const service = { service: true };
let checks = 0;

async function request(actor, path, method = 'GET', body, extraHeaders = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  const headers = {
    apikey: actor?.service ? env.SUPABASE_SERVICE_ROLE_KEY : env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json', ...extraHeaders,
  };
  if (actor?.token) headers.Authorization = `Bearer ${actor.token}`;
  const response = await fetch(base + path, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, ok: response.ok, data };
}
function success(result) {
  assert.ok(result.ok, `Unexpected HTTP ${result.status} (${result.data?.code || 'no code'})`);
  return result.data;
}
function denied(result) {
  assert.ok([401, 403].includes(result.status), `Expected authorization denial, got ${result.status}`);
}
async function rows(table, id) {
  return success(await request(service, `/rest/v1/${table}?id=eq.${id}&select=*`));
}
async function unchanged(actor, path, method, body, snapshot, label) {
  const before = await snapshot();
  denied(await request(actor, path, method, body));
  assert.deepEqual(await snapshot(), before, label);
  checks++;
}
async function create(table, body) {
  const [row] = success(await request(service, `/rest/v1/${table}`, 'POST', body, { Prefer: 'return=representation' }));
  records[table].push(row.id);
  return row;
}

try {
  for (const role of roles) {
    const email = `${run}-${role}@example.invalid`;
    const user = success(await request(service, '/auth/v1/admin/users', 'POST', {
      email, password, email_confirm: true, user_metadata: { full_name: `${run} ${role}` },
    }));
    const actor = { id: user.id, email, role };
    users.push(actor);
    assert.equal((await rows('profiles', user.id))[0].role, 'pending', 'Auth trigger creates pending profile');
    sql(`update public.profiles set role='${role}' where id='${user.id}';`);
    const session = success(await request(null, '/auth/v1/token?grant_type=password', 'POST', { email, password }));
    actor.token = session.access_token;
    actor.refreshToken = session.refresh_token;
    checks++;
  }
  const anonymous = { role: 'anonymous' };
  const actors = [anonymous, ...users];
  const student = await create('students', { full_name: run });
  const teacher = await create('teachers', { full_name: run, email: `${run}-record@example.invalid` });
  const pending = users.find(u => u.role === 'pending');
  const director = users.find(u => u.role === 'director');

  for (const actor of actors) {
    const target = actor.id || pending.id;
    const profilePath = `/rest/v1/profiles?id=eq.${target}`;
    for (const patch of [
      { role: 'director' }, { email: `${run}-other@example.invalid` },
      { linked_student_id: student.id }, { linked_teacher_id: teacher.id },
      { id: randomUUID() }, { full_name: 'Forbidden mixed patch', role: 'director' },
    ]) {
      await unchanged(actor, profilePath, 'PATCH', patch, () => rows('profiles', target), `${actor.role}: protected profile`);
    }
    await unchanged(actor, '/rest/v1/profiles', 'POST', { id: randomUUID(), role: 'director' },
      () => rows('profiles', target), 'Profile insert');
    await unchanged(actor, profilePath, 'DELETE', undefined, () => rows('profiles', target), 'Profile delete');
    const beforeUpsert = await rows('profiles', target);
    denied(await request(actor, '/rest/v1/profiles?on_conflict=id', 'POST', { id: target, role: 'director' }, { Prefer: 'resolution=merge-duplicates' }));
    assert.deepEqual(await rows('profiles', target), beforeUpsert);
    checks++;
    const email = `${run}-queue-${actor.role}@example.invalid`;
    pendingEmails.push(email);
    const queue = () => request(service, `/rest/v1/pending_roles?email=eq.${email}&select=*`).then(success);
    await unchanged(actor, '/rest/v1/pending_roles', 'POST', { email, role: 'director' }, queue, 'Queue insert');
    sql(`insert into public.pending_roles(email,role) values('${email}','student');`);
    await unchanged(actor, `/rest/v1/pending_roles?email=eq.${email}`, 'PATCH', { role: 'director' }, queue, 'Queue update');
    await unchanged(actor, `/rest/v1/pending_roles?email=eq.${email}`, 'DELETE', undefined, queue, 'Queue delete');
    const before = await queue();
    denied(await request(actor, '/rest/v1/pending_roles?on_conflict=email', 'POST', { email, role: 'director' }, { Prefer: 'resolution=merge-duplicates' }));
    assert.deepEqual(await queue(), before);
    checks++;
    await unchanged(actor, '/rest/v1/rpc/claim_director_if_none', 'POST', {}, () => rows('profiles', target), 'Bootstrap RPC');
    if (actor.id) {
      success(await request(actor, profilePath, 'PATCH', { full_name: `${run} edited`, phone: '0000000000' }, { Prefer: 'return=representation' }));
      assert.equal((await rows('profiles', target))[0].phone, '0000000000');
      const other = actor.id === director.id ? pending.id : director.id;
      const beforeOther = await rows('profiles', other);
      const result = await request(actor, `/rest/v1/profiles?id=eq.${other}`, 'PATCH', { full_name: 'Other user' });
      assert.ok(result.ok || [401, 403].includes(result.status)); // RLS may silently filter.
      assert.deepEqual(await rows('profiles', other), beforeOther);
      checks += 2;
    }
  }
  console.log('PASS profile and pending-role REST matrix');

  // Service-role operations used by the existing authorized API handlers.
  if (batch2) {
    denied(await request(service, `/rest/v1/profiles?id=eq.${pending.id}`, 'PATCH', { role: 'admin' }));
    success(await request(director, '/rest/v1/rpc/change_user_role', 'POST', { p_user_id: pending.id, p_role: 'admin' }));
  } else success(await request(service, `/rest/v1/profiles?id=eq.${pending.id}`, 'PATCH', { role: 'admin' }));
  assert.equal((await rows('profiles', pending.id))[0].role, 'admin');
  sql(`update public.profiles set role='pending' where id='${pending.id}';`);
  for (const role of roles.filter(r => r !== 'pending')) {
    pendingEmails.push(pending.email);
    if (batch2) success(await request(director, '/rest/v1/rpc/prepare_role_invitation', 'POST', { p_email: pending.email, p_role: role }));
    else success(await request(service, '/rest/v1/pending_roles', 'POST', { email: pending.email, role }));
    assert.equal(success(await request(pending, '/rest/v1/rpc/apply_pending_role', 'POST', {})), role);
    assert.equal((await rows('profiles', pending.id))[0].role, role);
    assert.deepEqual(success(await request(service, `/rest/v1/pending_roles?email=eq.${pending.email}`)), []);
    assert.equal(success(await request(pending, '/rest/v1/rpc/apply_pending_role', 'POST', {})), null);
    sql(`update public.profiles set role='pending' where id='${pending.id}';`);
    checks++;
  }
  denied(await request(anonymous, '/rest/v1/rpc/apply_pending_role', 'POST', {}));
  // Real public signup uses the local Auth endpoint (no external mail provider).
  const signupEmail = `${run}-signup@example.invalid`;
  const signup = success(await request(null, '/auth/v1/signup', 'POST', { email: signupEmail, password }));
  const signupUser = signup.user || signup;
  users.push({ id: signupUser.id, email: signupEmail });
  assert.equal((await rows('profiles', signupUser.id))[0].role, 'pending');
  checks++;
  console.log('PASS signup, password login, backend updates and pending-role activation');

  // Optional real Next.js endpoints. Start the app separately with outbound
  // email/Sentry disabled, then run this script with --app. URL is fixed local.
  if (process.argv.includes('--app')) {
    async function appRequest(actor, path, body) {
      const cookies = new Map();
      const client = createServerClient(base, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
        },
      });
      const { error } = await client.auth.setSession({ access_token: actor.token, refresh_token: actor.refreshToken });
      assert.equal(error, null);
      const response = await fetch(`http://127.0.0.1:3101${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
        body: JSON.stringify(body),
      });
      return { ok: response.ok, status: response.status, data: await response.json() };
    }
    const admin = users.find(u => u.role === 'admin');
    for (const [actor, role] of [[admin, 'teacher'], [director, 'admin']]) {
      success(await appRequest(actor, '/api/admin/update-role', { userId: pending.id, role }));
      assert.equal((await rows('profiles', pending.id))[0].role, role);
      sql(`update public.profiles set role='pending' where id='${pending.id}';`);
      // Existing-account invitation queues a role without delivering email.
      pendingEmails.push(pending.email);
      success(await appRequest(actor, '/api/admin/invite', { email: pending.email, role }));
      assert.equal(success(await request(pending, '/rest/v1/rpc/apply_pending_role', 'POST', {})), role);
      sql(`update public.profiles set role='pending' where id='${pending.id}';`);
      checks += 2;
    }
    const beforeDirector = await rows('profiles', director.id);
    denied(await appRequest(admin, '/api/admin/update-role', { userId: director.id, role: 'student' }));
    assert.deepEqual(await rows('profiles', director.id), beforeDirector);
    denied(await appRequest(admin, '/api/admin/invite', { email: pending.email, role: 'director' }));
    checks += 2;
    console.log('PASS existing admin/director HTTP role-change and invitation workflows');
  }

  for (const actor of [...actors, service]) {
    for (const [table, rpc, arg, allowed] of [
      ['students', 'soft_delete_student', 'p_student_id', ['admin', 'director']],
      ['teachers', 'soft_delete_teacher', 'p_teacher_id', ['admin', 'director']],
      ['receipts', 'soft_delete_receipt', 'p_receipt_id', ['director']],
    ]) {
      const body = table === 'students' ? { full_name: run }
        : table === 'teachers' ? { full_name: run, email: `${run}-${randomUUID()}@example.invalid` }
        : { student_id: student.id, date: '2026-01-01', nom_prenom: run, categorie: 'Adultes', niveau: 'A1', type_cours: 'Standard', montant_total: 100, montant_paye: 100, mode_paiement: 'Espèces' };
      const row = await create(table, body);
      const before = await rows(table, row.id);
      const result = await request(actor, `/rest/v1/rpc/${rpc}`, 'POST', { [arg]: row.id });
      if (allowed.includes(actor.role)) {
        success(result);
        assert.ok((await rows(table, row.id))[0].deleted_at);
        success(await request(actor, `/rest/v1/rpc/${rpc}`, 'POST', { [arg]: row.id }));
      } else {
        denied(result);
        assert.deepEqual(await rows(table, row.id), before);
      }
      checks++;
    }
  }
  console.log('PASS soft-delete REST/RPC matrix (including service-key-only denial)');

  // Prove the trigger is a real second barrier even if a future migration
  // accidentally restores broad UPDATE grants. Temporary grants roll back.
  for (const actor of users.filter(u => roles.includes(u.role))) {
    const before = await rows('profiles', actor.id);
    sql(`begin;
      grant update on public.profiles to authenticated;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${actor.id}', true);
      do $$ begin
        begin update public.profiles set email='forbidden@example.invalid' where id=auth.uid();
          raise exception 'Identity trigger unexpectedly allowed';
        exception when insufficient_privilege then null; end;
        begin update public.profiles set role=case when role='director' then 'admin' else 'director' end where id=auth.uid();
          raise exception 'Role trigger unexpectedly allowed';
        exception when insufficient_privilege then null; end;
      end $$;
      rollback;`);
    assert.deepEqual(await rows('profiles', actor.id), before);
    checks++;
  }
  console.log('PASS trigger defense independent of column privileges');

  // PostgreSQL-only corner cases, rolled back in full. Existing director rows
  // are hidden only inside this transaction; none of these changes persist.
  // On 042 the owner temporarily disables the guard solely to construct the
  // otherwise-unreachable zero-director test. ROLLBACK restores the trigger.
  sql(`begin;
    ${batch2 ? 'alter table public.profiles disable trigger role_security_guard;' : ''}
    update public.profiles set role='pending' where role='director';
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${pending.id}', true);
    do $$ begin
      if exists(select 1 from public.profiles where role='director') then raise exception 'Expected no directors'; end if;
      begin perform public.claim_director_if_none(); raise exception 'Bootstrap unexpectedly allowed';
      exception when insufficient_privilege then null; end;
    end $$;
    reset role;
    delete from public.profiles where id='${pending.id}';
    set local role authenticated;
    do $$ begin
      if public.get_my_role() is not null then raise exception 'Expected NULL role'; end if;
      begin perform public.soft_delete_student('${student.id}'); raise exception 'NULL role allowed'; exception when insufficient_privilege then null; end;
      begin perform public.soft_delete_teacher('${teacher.id}'); raise exception 'NULL role allowed'; exception when insufficient_privilege then null; end;
      begin perform public.soft_delete_receipt('${records.receipts[0]}'); raise exception 'NULL role allowed'; exception when insufficient_privilege then null; end;
    end $$;
    reset role;
    select set_config('request.jwt.claim.sub', '', true);
    set local role authenticated;
    do $$ begin
      begin perform public.soft_delete_student('${student.id}'); raise exception 'NULL identity allowed'; exception when insufficient_privilege then null; end;
    end $$;
    rollback;`);
  assert.equal((await rows('students', student.id))[0].deleted_at, null);
  assert.equal((await rows('teachers', teacher.id))[0].deleted_at, null);
  assert.equal((await rows('profiles', director.id))[0].role, 'director');
  const grants = sql(`select bool_and(not has_function_privilege(r, f, 'EXECUTE'))
    from unnest(array['anon','authenticated','service_role']) r
    cross join unnest(array['public.claim_director_if_none()']) f;`);
  assert.equal(grants, 't');
  assert.equal(sql(`select bool_and(not has_function_privilege(r, f, 'EXECUTE'))
    from unnest(array['anon','service_role']) r
    cross join unnest(array['public.soft_delete_student(uuid)', 'public.soft_delete_teacher(uuid)', 'public.soft_delete_receipt(uuid)']) f;`), 't');
  checks += 3;
  console.log(`PASS ${checks} checks; NULL identity/role and zero-director cases included`);
} finally {
  // IDs/emails below were generated by this run, never taken from existing data.
  for (const email of new Set(pendingEmails)) sql(`delete from public.pending_roles where email='${email}';`);
  for (const table of ['receipts', 'students', 'teachers']) {
    for (const id of records[table]) success(await request(service, `/rest/v1/${table}?id=eq.${id}`, 'DELETE'));
  }
  // Owner-only synthetic teardown, never an application bypass. Restore the
  // guard and counter in the same transaction, including when no director
  // existed before the test. IDs were generated exclusively by this run.
  if (users.length) sql(`begin;
    lock table public.profiles in access exclusive mode;
    ${batch2 ? 'alter table public.profiles disable trigger role_security_guard;' : ''}
    delete from auth.users where id in (${users.map(u => "'"+u.id+"'::uuid").join(',')});
    ${batch2 ? "alter table public.profiles enable trigger role_security_guard; update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');" : ''}
    commit;`);
  const ids = [...users.map(u => u.id), ...Object.values(records).flat()];
  if (ids.length) {
    sql(`delete from public.activity_log where target_id in (${ids.map(id => `'${id}'::uuid`).join(',')})
      or actor_id in (${users.map(u => `'${u.id}'::uuid`).join(',')});
      delete from public.rate_limits where user_id in (${users.map(u => `'${u.id}'::uuid`).join(',')});`);
  }
  console.log('Synthetic fixtures and their audit rows cleaned up.');
}
