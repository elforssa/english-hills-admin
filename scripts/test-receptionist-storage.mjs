// Local Supabase and built app only. Synthetic actor and records are removed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';

const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
const base = status.API_URL, appBase = 'http://127.0.0.1:3101';
const student = randomUUID(), enrollment = randomUUID();
const email = `reception-storage-${randomUUID()}@example.invalid`;
const password = randomBytes(24).toString('base64url');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const assets = [];
let actor, localStorageIndex = false;
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = (source, user = 'postgres') => execFileSync('psql', ['-X','-qAt','-h','127.0.0.1','-p','54322','-U',user,'-d','postgres','-v','ON_ERROR_STOP=1'],
  { input: source, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } }).trim();
async function request(path, method = 'GET', body, token = status.SERVICE_ROLE_KEY, headers = {}) {
  const response = await fetch(base + path, { method, redirect: 'error', headers: {
    apikey: token === status.SERVICE_ROLE_KEY ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers,
  }, ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }) });
  const text = await response.text(); let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}
function ok(result) { assert(result.ok, JSON.stringify(result)); return result.data; }
async function app(operation, assetId, session) {
  const cookies = new Map();
  const client = createServerClient(base, status.ANON_KEY, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
  } });
  assert.equal((await client.auth.setSession(session)).error, null);
  const response = await fetch(`${appBase}/api/storage/${operation}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') },
    body: JSON.stringify({ assetId }) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, data: await response.json() };
}
try {
  // The current local Storage container upserts on (bucket_id,name), while its
  // reset schema has only partial/versioned unique indexes. This local-only
  // compatibility index changes no application migration or RLS policy.
  if (sql(`select count(*) from pg_index i join pg_class t on t.oid=i.indrelid
      where t.oid='storage.objects'::regclass and i.indisunique and i.indpred is null
        and i.indnkeyatts=2 and pg_get_indexdef(i.indexrelid) like '%bucket_id%name%'`) === '0') {
    sql('create unique index local_test_storage_upsert_compat on storage.objects(bucket_id,name)', 'supabase_storage_admin');
    localStorageIndex = true;
  }
  actor = ok(await request('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true })).id;
  sql(`update public.profiles set role='receptionist' where id=${q(actor)};
    insert into public.students(id,full_name,status,session_type) values(${q(student)},'Synthetic storage learner','Enrolled','Yearly');
    insert into public.enrollments(id,student_id,status,session_type,school_year) values(${q(enrollment)},${q(student)},'Submitted','Yearly','2026/2027');`);
  const session = ok(await request('/auth/v1/token?grant_type=password', 'POST', { email, password }, status.ANON_KEY));
  const token = session.access_token;
  for (const [purpose, enrollmentId] of [['student_photo', null], ['enrollment_document', enrollment]]) {
    const asset = ok(await request('/rest/v1/rpc/reserve_storage_asset', 'POST', {
      p_purpose: purpose, p_student_id: student, p_teacher_id: null, p_enrollment_id: enrollmentId,
    }, token));
    assets.push(asset);
    ok(await request(`/storage/v1/object/${asset.bucket}/${asset.path}`, 'POST', png, token,
      { 'Content-Type': 'image/png', 'x-upsert': 'false' }));
    const finalized = await app('finalize', asset.id, session);
    assert.equal(finalized.status, 200, JSON.stringify(finalized));
    assert.equal(finalized.data.ref, `asset:${asset.id}`);
    if (purpose === 'student_photo') {
      const version = sql(`select updated_at from public.students where id=${q(student)}`);
      ok(await request('/rest/v1/rpc/save_receptionist_student', 'POST', {
        p_student: student, p_expected_updated_at: version, p_changes: { photo_url: finalized.data.ref },
      }, token));
    } else {
      const version = sql(`select updated_at from public.enrollments where id=${q(enrollment)}`);
      ok(await request('/rest/v1/rpc/append_receptionist_enrollment_document', 'POST', {
        p_enrollment: enrollment, p_expected_updated_at: version, p_asset: finalized.data.ref,
      }, token));
    }
    const signed = await app('sign', asset.id, session);
    assert.equal(signed.status, 200, JSON.stringify(signed));
    assert.equal(typeof signed.data.url, 'string');
  }
  const denied = await request('/rest/v1/rpc/reserve_storage_asset', 'POST', {
    p_purpose: 'teacher_photo', p_student_id: null, p_teacher_id: randomUUID(), p_enrollment_id: null,
  }, token);
  assert.equal(denied.ok, false);
  assert.equal((await app('sign', randomUUID(), session)).status, 403);
  const direct = await request(`/storage/v1/object/authenticated/${assets[0].bucket}/${assets[0].path}`, 'GET', undefined, token);
  assert.equal(direct.ok, false);
  assert.equal(sql(`select count(*) from public.storage_asset_bindings where asset_id in (${assets.map(a => q(a.id)).join(',')})`), '2');
  console.log('PASS receptionist photo/document reserve, upload, finalize, bind, sign and forbidden purposes/direct read');
} finally {
  for (const asset of assets) await request(`/storage/v1/object/${asset.bucket}`, 'DELETE', { prefixes: [asset.path] });
  if (actor) sql(`begin;
    update public.students set photo_url=null where id=${q(student)};
    update public.enrollments set documents_urls='{}'::text[] where id=${q(enrollment)};
    delete from public.storage_asset_bindings where asset_id in (${assets.length ? assets.map(a => q(a.id)).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    delete from public.storage_assets where id in (${assets.length ? assets.map(a => q(a.id)).join(',') : "'00000000-0000-0000-0000-000000000000'"});
    delete from public.enrollments where id=${q(enrollment)};
    delete from public.students where id=${q(student)};
    delete from auth.users where id=${q(actor)};
    delete from public.activity_log where actor_id=${q(actor)} or target_id in (${q(student)},${q(enrollment)});
    commit;`);
  if (localStorageIndex) sql('drop index storage.local_test_storage_upsert_compat', 'supabase_storage_admin');
}
