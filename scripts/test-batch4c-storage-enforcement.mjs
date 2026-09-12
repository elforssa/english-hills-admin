// Local-only Batch 4C enforcement suite. Requires migrations through 046.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';

const root = new URL('../', import.meta.url);
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: root, encoding: 'utf8' }));
const base = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
const container = 'supabase_db_hills-admin-next';
const appBase = process.env.BATCH4C_APP_URL ?? 'http://127.0.0.1:3101';
const run = `batch4c-${randomUUID()}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const users = [], records = {}, assets = [];
let checks = 0;

function sql(input) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function fixtureRows(table) {
  const ids = records[table] ?? [];
  return ids.length
    ? `(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.${table} t where t.id in (${ids.map(q).join(',')}))`
    : `'[]'::jsonb`;
}
function snapshot() {
  return sql(`select jsonb_build_object(
    'objects',(select coalesce(jsonb_agg(jsonb_build_array(id,bucket_id,name,owner_id,version,metadata) order by id),'[]'::jsonb) from storage.objects),
    'assets',(select coalesce(jsonb_agg(jsonb_build_array(id,bucket_id,object_path,purpose,state,student_id,teacher_id,enrollment_id,uploader_id,object_version) order by id),'[]'::jsonb) from public.storage_assets),
    'bindings',(select coalesce(jsonb_agg(jsonb_build_array(asset_id,student_photo_id,teacher_photo_id,portfolio_id,enrollment_id) order by asset_id),'[]'::jsonb) from public.storage_asset_bindings),
    'business',jsonb_build_object(
      'students',${fixtureRows('students')}, 'teachers',${fixtureRows('teachers')},
      'portfolios',${fixtureRows('portfolios')}, 'enrollments',${fixtureRows('enrollments')},
      'authorized_adults',${fixtureRows('authorized_adults')}
    )
  );`);
}
async function request(actor, path, method = 'GET', body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method, redirect: 'error',
    headers: {
      apikey: actor?.service ? serviceKey : anonKey,
      ...(actor?.service ? { Authorization: `Bearer ${serviceKey}` } : actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}),
      'Content-Type': 'application/json', Prefer: 'return=representation', ...headers,
    },
    ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
  });
  const text = await response.text(); let data = null;
  try { data = JSON.parse(text); } catch { /* binary and empty responses are expected in Storage probes */ }
  return { status: response.status, ok: response.ok, data, text };
}
function ok(result) { assert.ok(result.ok, JSON.stringify(result)); return result.data; }
async function objectHashes() {
  const unique = [...new Map(assets.filter(a => a.bucket && a.path).map(a => [a.id, a])).values()].sort((a, b) => a.id.localeCompare(b.id));
  return Object.fromEntries(await Promise.all(unique.map(async asset => {
    const path = [asset.bucket, ...asset.path.split('/')].map(encodeURIComponent).join('/');
    const response = await fetch(`${base}/storage/v1/object/authenticated/${path}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return [asset.id, { status: response.status, sha256: response.ok ? createHash('sha256').update(bytes).digest('hex') : null }];
  })));
}
async function denied(action, label = 'denied operation') {
  const before = snapshot(), bytesBefore = await objectHashes(); const result = await action();
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(snapshot(), before, `${label} changed storage, registry, or business rows`);
  assert.deepEqual(await objectHashes(), bytesBefore, `${label} changed object bytes`); checks++;
}
async function hidden(action) {
  const before = snapshot(), bytesBefore = await objectHashes(); const result = await action();
  assert.ok(!result.ok || (Array.isArray(result.data) && result.data.length === 0), JSON.stringify(result));
  assert.equal(snapshot(), before, 'hidden operation changed storage, registry, or business rows');
  assert.deepEqual(await objectHashes(), bytesBefore, 'hidden operation changed object bytes'); checks++;
}
async function user(role, label = role) {
  const email = `${run}-${label}@example.invalid`, password = randomBytes(18).toString('base64url');
  const created = await request({ service: true }, '/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  assert.ok(created.ok, JSON.stringify(created));
  const actor = { id: created.data.id, email, role, password }; users.push(actor);
  sql(`update public.profiles set role=${q(role)} where id=${q(actor.id)};`);
  const session = await request(null, '/auth/v1/token?grant_type=password', 'POST', { email, password });
  assert.ok(session.ok, JSON.stringify(session)); actor.token = session.data.access_token; actor.refreshToken = session.data.refresh_token; return actor;
}
async function create(table, row, actor = { service: true }) {
  const data = ok(await request(actor, `/rest/v1/${table}`, 'POST', row));
  const result = Array.isArray(data) ? data[0] : data; (records[table] ??= []).push(result.id); return result;
}
async function patch(actor, table, id, row) { return request(actor, `/rest/v1/${table}?id=eq.${id}`, 'PATCH', row); }
async function rpc(actor, name, body) { return request(actor, `/rest/v1/rpc/${name}`, 'POST', body); }
async function reserve(actor, purpose, studentId = null, teacherId = null, enrollmentId = null) {
  const data = ok(await rpc(actor, 'reserve_storage_asset', { p_purpose: purpose, p_student_id: studentId, p_teacher_id: teacherId, p_enrollment_id: enrollmentId }));
  assets.push(data); checks++; return data;
}
async function upload(actor, asset, bytes = png, path = asset.path, contentType = 'image/png', upsert = false) {
  return request(actor, `/storage/v1/object/${asset.bucket}/${path}`, 'POST', bytes,
    { 'Content-Type': contentType, 'x-upsert': String(upsert) });
}
async function finalize(actor, asset, type = 'image/png') {
  const uploadState = ok(await rpc(actor, 'get_storage_upload', { p_asset_id: asset.id }));
  return rawFinalize(actor, asset, Number(uploadState.size), type, uploadState.version);
}
async function rawFinalize(actor, asset, size, type, version) {
  return rpc({ service: true }, 'finalize_storage_asset', {
    p_actor: actor.id, p_asset_id: asset.id, p_size: size, p_type: type, p_version: version,
  });
}
async function app(actor, operation, body) {
  const cookies = new Map();
  if (actor) {
    const client = createServerClient(base, anonKey, {
      cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)) },
    });
    assert.equal((await client.auth.setSession({ access_token: actor.token, refresh_token: actor.refreshToken })).error, null);
  }
  const response = await fetch(`${appBase}/api/storage/${operation}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }, body: JSON.stringify(body),
  });
  const text = await response.text(); let data = null;
  try { data = JSON.parse(text); } catch { /* API always returns JSON; retain response for assertion output */ }
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, ok: response.ok, data, text };
}
async function finalizeViaApp(actor, asset, extras = {}) { return app(actor, 'finalize', { assetId: asset.id, ...extras }); }
async function ready(actor, asset) {
  ok(await upload(actor, asset)); ok(await finalizeViaApp(actor, asset)); checks += 2;
}
function state(assetId) { return sql(`select state from public.storage_assets where id=${q(assetId)}`); }
function signedLifetime(url) {
  const token = new URL(url).searchParams.get('token'); assert.ok(token, 'missing signed Storage token');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); return claims.exp - claims.iat;
}

assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='046'"), '1');
assert.equal(sql("select count(*) from pg_policies where schemaname='storage' and policyname='reserved asset insert'"), '1');
assert.equal(sql("select count(*) from pg_policies where schemaname='storage' and policyname like 'uploads %'"), '0');

try {
  const pending = await user('pending');
  const parent = await user('parent');
  const otherParent = await user('parent', 'other-parent');
  const student = await user('student');
  const otherStudent = await user('student', 'other-student');
  const teacher = await user('teacher');
  const otherTeacher = await user('teacher', 'other-teacher');
  const admin = await user('admin');
  const director = await user('director');
  const missing = await user('pending', 'missing'); sql(`delete from public.profiles where id=${q(missing.id)};`);

  const t = await create('teachers', { full_name: `${run} Teacher`, email: teacher.email });
  const tOther = await create('teachers', { full_name: `${run} Other Teacher`, email: otherTeacher.email });
  const group = await create('groups', { name: `${run} Group`, niveau: 'A1', teacher_id: t.id });
  const otherGroup = await create('groups', { name: `${run} Other Group`, niveau: 'A1', teacher_id: tOther.id });
  const child = await create('students', { full_name: `${run} Child`, email: student.email, parent_email: parent.email, groupe_id: group.id });
  const childTwo = await create('students', { full_name: `${run} Child Two`, parent_email: parent.email, groupe_id: group.id });
  const unrelated = await create('students', { full_name: `${run} Unrelated`, email: otherStudent.email, parent_email: otherParent.email, groupe_id: otherGroup.id });

  // Unsupported identities, forged subjects, and arbitrary reservation arguments fail closed.
  for (const actor of [null, pending, missing, parent, otherParent, otherTeacher]) await denied(() => rpc(actor, 'reserve_storage_asset', { p_purpose: 'portfolio', p_student_id: child.id }));
  for (const body of [
    { p_purpose: 'portfolio', p_student_id: unrelated.id },
    { p_purpose: 'teacher_photo', p_teacher_id: tOther.id },
    { p_purpose: 'legacy_unclassified' },
    { p_purpose: 'portfolio', p_student_id: child.id, p_teacher_id: t.id },
  ]) await denied(() => rpc(student, 'reserve_storage_asset', body));
  checks += 4;

  // Exact reservation inserts only: no guessed key, wrong uploader, expiry, or replay/upsert.
  const photo = await reserve(admin, 'student_photo', child.id);
  await denied(() => upload(admin, photo, png, `assets/${randomUUID()}`));
  await denied(() => upload(teacher, photo));
  const expired = await reserve(admin, 'student_photo', child.id);
  sql(`update public.storage_assets set expires_at=now()-interval '1 second' where id=${q(expired.id)};`);
  await denied(() => upload(admin, expired));
  await denied(() => rawFinalize(admin, photo, png.length, 'image/png', 'forged'));
  ok(await upload(admin, photo)); checks++;
  const uploadState = ok(await rpc(admin, 'get_storage_upload', { p_asset_id: photo.id }));
  await denied(() => rawFinalize(admin, photo, Number(uploadState.size), 'application/pdf', uploadState.version));
  ok(await finalizeViaApp(admin, photo, { actorId: director.id, uploaderId: director.id, path: `assets/${randomUUID()}`, expiresIn: 1 })); checks++;
  assert.equal(sql(`select uploader_id from public.storage_assets where id=${q(photo.id)}`), admin.id); checks++;
  await denied(() => rawFinalize(admin, photo, png.length, 'image/png', sql(`select version from storage.objects where bucket_id=${q(photo.bucket)} and name=${q(photo.path)}`)));
  await denied(() => upload(admin, photo, png, photo.path, 'image/png', true));
  const changed = await patch(admin, 'students', child.id, { photo_url: `asset:${photo.id}` }); ok(changed); checks++;
  assert.equal(state(photo.id), 'active'); checks++;

  // The app signer ignores caller-supplied bucket/path/actor/expiry and fixes
  // signed lifetimes at 300 seconds.
  const signed = ok(await app(parent, 'sign', { assetId: photo.id, bucket: 'portfolios', path: `assets/${randomUUID()}`, actorId: director.id, expiresIn: 1, expiresInSeconds: 999999 }));
  assert.equal(signed.expiresIn, 300); assert.equal(signedLifetime(signed.url), 300);
  assert.ok(new URL(signed.url).pathname.endsWith(`/${photo.path}`)); checks += 3;

  // Registry signer enforces own/related assets, assignment and visibility.
  for (const actor of [admin, director, parent, student, teacher]) { ok(await rpc(actor, 'resolve_storage_asset', { p_asset_id: photo.id })); checks++; }
  for (const actor of [null, pending, missing, otherParent, otherStudent, otherTeacher]) await denied(() => rpc(actor, 'resolve_storage_asset', { p_asset_id: photo.id }));
  await denied(() => app(otherParent, 'sign', { assetId: photo.id, path: photo.path, expiresIn: 999999 }), 'unauthorized app signing');
  const photoTwo = await reserve(director, 'student_photo', childTwo.id); await ready(director, photoTwo);
  ok(await patch(director, 'students', childTwo.id, { photo_url: `asset:${photoTwo.id}` }));
  ok(await rpc(parent, 'resolve_storage_asset', { p_asset_id: photoTwo.id })); checks++;
  await denied(() => rpc(otherParent, 'resolve_storage_asset', { p_asset_id: photoTwo.id }));

  const portfolioAsset = await reserve(admin, 'portfolio', child.id); await ready(admin, portfolioAsset);
  const portfolio = await create('portfolios', { student_id: child.id, title: run, project_type: 'Other', file_url: `asset:${portfolioAsset.id}`, visible_to_parent: true, visible_to_student: true }, admin);
  for (const actor of [admin, director, parent, student, teacher]) { ok(await rpc(actor, 'resolve_storage_asset', { p_asset_id: portfolioAsset.id })); checks++; }
  ok(await patch(admin, 'portfolios', portfolio.id, { visible_to_parent: false }));
  await denied(() => rpc(parent, 'resolve_storage_asset', { p_asset_id: portfolioAsset.id }));
  ok(await patch(admin, 'portfolios', portfolio.id, { visible_to_parent: true, visible_to_student: false }));
  await denied(() => rpc(student, 'resolve_storage_asset', { p_asset_id: portfolioAsset.id }));
  ok(await patch(admin, 'portfolios', portfolio.id, { visible_to_student: true }));
  ok(await patch(admin, 'students', child.id, { groupe_id: otherGroup.id }));
  await denied(() => rpc(teacher, 'resolve_storage_asset', { p_asset_id: portfolioAsset.id }));
  ok(await patch(admin, 'students', child.id, { groupe_id: group.id }));

  // An authenticated caller cannot nominate a different actor to finalize a
  // reservation, and client JSON cannot turn a non-reserved asset valid.
  const actorGuard = await reserve(admin, 'student_photo', child.id); ok(await upload(admin, actorGuard)); checks++;
  await denied(() => finalizeViaApp(director, actorGuard, { actorId: admin.id, uploaderId: admin.id, path: actorGuard.path }), 'forged finalize actor');
  assert.equal(state(actorGuard.id), 'reserved'); checks++;
  ok(await finalizeViaApp(admin, actorGuard, { actorId: director.id, uploaderId: director.id, path: `assets/${randomUUID()}` })); checks++;
  assert.equal(sql(`select uploader_id from public.storage_assets where id=${q(actorGuard.id)}`), admin.id); checks++;
  await denied(() => finalizeViaApp(admin, photo, { state: 'reserved', version: 'forged', actorId: admin.id }), 'forged finalized state');

  // A student can submit only their own portfolio; record trigger forces safe fields.
  const studentPortfolio = await reserve(student, 'portfolio', child.id); await ready(student, studentPortfolio);
  const studentPf = await create('portfolios', { student_id: child.id, title: `${run} Student`, project_type: 'Other', file_url: `asset:${studentPortfolio.id}`, visible_to_parent: false, visible_to_student: false, teacher_note: 'forged' }, student);
  assert.equal(studentPf.visible_to_parent, true); assert.equal(studentPf.visible_to_student, true); assert.equal(studentPf.teacher_note, null); checks += 3;

  // Staff-only purposes never resolve to teachers, parents, or students.
  const teacherPhoto = await reserve(admin, 'teacher_photo', null, t.id); await ready(admin, teacherPhoto);
  ok(await patch(admin, 'teachers', t.id, { photo_url: `asset:${teacherPhoto.id}` }));
  for (const actor of [admin, director]) { ok(await rpc(actor, 'resolve_storage_asset', { p_asset_id: teacherPhoto.id })); checks++; }
  for (const actor of [teacher, parent, student]) await denied(() => rpc(actor, 'resolve_storage_asset', { p_asset_id: teacherPhoto.id }));
  const enrollment = await create('enrollments', { student_id: child.id, status: 'Submitted' });
  const document = await reserve(admin, 'enrollment_document', child.id, null, enrollment.id); await ready(admin, document);
  ok(await patch(admin, 'enrollments', enrollment.id, { documents_urls: [`asset:${document.id}`] }));
  for (const actor of [admin, director]) { ok(await rpc(actor, 'resolve_storage_asset', { p_asset_id: document.id })); checks++; }
  for (const actor of [teacher, parent, student]) await denied(() => rpc(actor, 'resolve_storage_asset', { p_asset_id: document.id }));

  // A malformed non-legacy staff_only state must fail for every identity even
  // though its binding otherwise authorizes it. This is the resolver-state
  // regression that 046 closes.
  const boundStaffOnly = await reserve(admin, 'student_photo', childTwo.id); await ready(admin, boundStaffOnly);
  ok(await patch(admin, 'students', childTwo.id, { photo_url: `asset:${boundStaffOnly.id}` }));
  sql(`update public.storage_assets set state='staff_only' where id=${q(boundStaffOnly.id)};`);
  assert.equal(sql(`select count(*) from public.storage_asset_bindings where asset_id=${q(boundStaffOnly.id)}`), '1'); checks++;
  for (const actor of [admin, director, teacher, parent, student, otherParent, otherStudent, otherTeacher]) await denied(() => rpc(actor, 'resolve_storage_asset', { p_asset_id: boundStaffOnly.id }), 'bound non-legacy staff_only resolution');
  await denied(() => app(admin, 'sign', { assetId: boundStaffOnly.id, expiresIn: 1 }), 'bound non-legacy staff_only signing');

  // Replacement retires, rather than deletes, the previous bytes and binding.
  const replacement = await reserve(director, 'student_photo', child.id); await ready(director, replacement);
  ok(await patch(director, 'students', child.id, { photo_url: `asset:${replacement.id}` }));
  assert.equal(state(photo.id), 'retired'); checks++;
  await denied(() => rpc(admin, 'resolve_storage_asset', { p_asset_id: photo.id }));
  assert.equal(sql(`select count(*) from storage.objects where bucket_id=${q(photo.bucket)} and name=${q(photo.path)}`), '1'); checks++;

  // A deliberately unbound legacy asset is staff-only; ordinary Storage access remains denied.
  const orphanId = randomUUID(), orphanPath = `assets/${orphanId}`;
  ok(await request({ service: true }, `/storage/v1/object/documents/${orphanPath}`, 'POST', png, { 'Content-Type': 'image/png' }));
  sql(`insert into public.storage_assets(id,bucket_id,object_path,purpose,state,object_version,provenance) select ${q(orphanId)},'documents',${q(orphanPath)},'legacy_unclassified','staff_only',version,'synthetic_orphan' from storage.objects where bucket_id='documents' and name=${q(orphanPath)};`);
  assets.push({ id: orphanId, bucket: 'documents', path: orphanPath });
  assert.equal(sql(`select count(*) from public.storage_asset_bindings where asset_id=${q(orphanId)}`), '0'); checks++;
  for (const actor of [admin, director]) { ok(await rpc(actor, 'resolve_storage_asset', { p_asset_id: orphanId })); checks++; }
  for (const actor of [teacher, parent, student, otherParent, otherStudent]) await denied(() => rpc(actor, 'resolve_storage_asset', { p_asset_id: orphanId }));

  // No ordinary direct list/read/sign/update/delete path survives enforcement.
  for (const actor of [admin, parent, student, teacher]) {
    await hidden(() => request(actor, '/storage/v1/object/list/documents', 'POST', { prefix: '' }));
    await denied(() => request(actor, `/storage/v1/object/authenticated/${replacement.bucket}/${replacement.path}`));
    await denied(() => request(actor, `/storage/v1/object/sign/${replacement.bucket}/${replacement.path}`, 'POST', { expiresIn: 999999 }));
    await denied(() => request(actor, `/storage/v1/object/${replacement.bucket}/${replacement.path}`, 'PUT', png, { 'Content-Type': 'image/png', 'x-upsert': 'true' }), 'direct Storage UPDATE');
    await denied(() => request(actor, `/storage/v1/object/${replacement.bucket}/${replacement.path}`, 'DELETE'));
  }
  for (const actor of [null, pending, parent, student, teacher, admin]) {
    await hidden(() => request(actor, '/rest/v1/storage_assets', 'GET'));
    await hidden(() => request(actor, '/rest/v1/storage_asset_bindings', 'GET'));
  }
  await denied(() => patch(admin, 'students', child.id, { photo_url: 'https://example.invalid/legacy' }));
  await denied(() => patch(admin, 'portfolios', portfolio.id, { file_url: 'documents/forged.png' }));
  await denied(() => patch(admin, 'enrollments', enrollment.id, { documents_urls: ['documents/forged.png'] }));
  await denied(() => request(admin, '/rest/v1/authorized_adults', 'POST', { student_id: child.id, full_name: run, telephone: '000', relation: 'Autre', photo_url: 'asset:' + randomUUID() }));

  assert.equal(sql("select count(*) from pg_policies where schemaname='storage' and policyname='reserved asset insert' and cmd='INSERT'"), '1');
  assert.equal(sql("select count(*) from pg_policies where schemaname='storage' and cmd in ('SELECT','UPDATE','DELETE')"), '0');
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname='storage_security' and not ('search_path=pg_catalog, pg_temp'=any(p.proconfig));"), '0');
  checks += 3;
  console.log(`PASS Batch 4C: ${checks} checks`);
} finally {
  const objectPaths = assets.filter(a => a.bucket && a.path).reduce((acc, a) => { (acc[a.bucket] ??= []).push(a.path); return acc; }, {});
  for (const [bucket, prefixes] of Object.entries(objectPaths)) await request({ service: true }, `/storage/v1/object/${bucket}`, 'DELETE', { prefixes });
  const ids = [...Object.values(records).flat(), ...users.map(u => u.id)];
  let cleanup = 'begin;';
  if (assets.length) cleanup += `delete from public.storage_asset_bindings where asset_id in (${assets.map(a => q(a.id)).join(',')}); delete from public.storage_assets where id in (${assets.map(a => q(a.id)).join(',')});`;
  for (const table of ['authorized_adults', 'portfolios', 'enrollments', 'students', 'groups', 'teachers']) if (records[table]?.length) cleanup += `delete from public.${table} where id in (${records[table].map(q).join(',')});`;
  if (users.length) cleanup += `alter table public.profiles disable trigger role_security_guard; delete from auth.users where id in (${users.map(u => q(u.id)).join(',')}); alter table public.profiles enable trigger role_security_guard; update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');`;
  if (ids.length) cleanup += `delete from public.activity_log where actor_id in (${users.map(u => q(u.id)).join(',')}) or target_id in (${ids.map(q).join(',')});`;
  sql(cleanup + 'commit;');
  console.log('Synthetic local fixtures removed.');
}
