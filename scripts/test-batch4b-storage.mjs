// Synthetic local Storage/API fixtures only. Run sequentially with other suites.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalize, digest, classify, humanReport } from './lib/storage-inventory.mjs';
import { localContext, inventory, applyBackfill, guardTarget, LOCAL_URL, saveReport, readEvidence } from './lib/storage-inventory-local.mjs';

let checks = 0;
function check(test) { test(); checks++; }
for (const form of ['sign/', 'public/', 'authenticated/', '']) {
  check(() => assert.deepEqual(normalize(`${LOCAL_URL}/storage/v1/object/${form}documents/a%20b.png?token=EXPIRED_SECRET`, LOCAL_URL), { bucket_id: 'documents', object_path: 'a b.png' }));
}
check(() => assert.deepEqual(normalize('documents/a%20b.png', LOCAL_URL), { bucket_id: 'documents', object_path: 'a%20b.png' }));
for (const ref of ['asset:no', 'http://[', 'documents/../a', `${LOCAL_URL}/storage/v1/object/sign/documents/%2e%2e/a`, `${LOCAL_URL}/storage/v1/object/sign/documents/%zz`, 'documents/a\\b']) check(() => assert.equal(normalize(ref, LOCAL_URL).state, 'ambiguous'));
for (const ref of ['https://evil.example/a?token=SECRET', 'https://project.supabase.co/storage/v1/object/sign/documents/a', 'data:text/plain,secret']) check(() => assert.equal(normalize(ref, LOCAL_URL).state, 'unknown_external'));
for (const target of ['https://project.supabase.co', 'http://localhost:54321', LOCAL_URL + '.evil', 'http://127.0.0.1:54322', 'http://user:secret@127.0.0.1:54321']) {
  for (const opts of [{}, { apply: true }, { apply: true, production: true, confirmProject: 'project', linkedProject: 'project' }]) check(() => assert.throws(() => guardTarget(target, opts)));
}
check(() => assert.equal(guardTarget(LOCAL_URL, { linkedProject: 'cloud-link' }).linkedProjectUsed, false));
check(() => assert.throws(() => guardTarget(LOCAL_URL, { production: true })));

const ctx = localContext();
assert.equal(ctx.sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"), '0');
const baseline = inventory(ctx);
assert.equal(baseline.report.totals.objects + baseline.report.totals.references + baseline.snapshot.assets.length + baseline.snapshot.bindings.length, 0,
  'Use an idle local database with empty storage/registry/references; refusing to classify unrelated fixtures');
const policies = ctx.sql("select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='storage';");
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
assert.equal(status.API_URL, LOCAL_URL);
const key = status.SERVICE_ROLE_KEY;
const run = 'batch4b-' + randomUUID(), file = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const objects = [], records = {}, users = [];
const dir = mkdtempSync(join(tmpdir(), 'batch4b-report-'));
const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
async function api(path, method, body, contentType = 'application/json') {
  const r = await fetch(LOCAL_URL + path, { method, headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': contentType }, body: contentType === 'application/json' ? JSON.stringify(body) : body, redirect: 'error' });
  assert.ok(r.ok, 'Synthetic local API failed'); return r;
}
function record(table, data) {
  const id = randomUUID(); (records[table] ??= []).push(id);
  ctx.sql(`insert into public.${table} (${['id', ...Object.keys(data)].join(',')}) values(${[id, ...Object.values(data)].map(v => v === null ? 'null' : quote(v)).join(',')});`);
  return id;
}
async function object(bucket, label) {
  const path = run + '/' + label;
  objects.push({ bucket, path });
  await api('/storage/v1/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), 'POST', file, 'image/png');
  return bucket + '/' + path;
}
let outcome;
try {
  const user = await (await api('/auth/v1/admin/users', 'POST', { email: run + '@example.invalid', password: randomBytes(24).toString('hex'), email_confirm: true })).json();
  users.push(user.id); ctx.sql(`update public.profiles set role='admin' where id=${quote(user.id)};`);
  const sid = record('students', { full_name: run, photo_url: await object('documents', 'student.png') });
  record('teachers', { full_name: run, email: run + '-teacher@example.invalid', photo_url: await object('documents', 'teacher.png') });
  record('portfolios', { student_id: sid, title: run, project_type: 'Other', file_url: await object('portfolios', 'portfolio.png') });
  const enrollmentId = record('enrollments', { student_id: sid });
  const document = await object('documents', 'enrollment.png');
  ctx.sql(`update public.enrollments set documents_urls=array[${quote(document)},${quote(document)}] where id=${quote(enrollmentId)};`);
  const encoded = await object('documents', 'encoded space.png');
  record('students', { full_name: run, photo_url: LOCAL_URL + '/storage/v1/object/sign/' + encoded.replace(' ', '%20') + '?token=EXPIRED_SECRET' });
  const shared = await object('documents', 'shared.png');
  record('students', { full_name: run, parent_email: run + '-family1@example.invalid', photo_url: shared });
  record('students', { full_name: run, parent_email: run + '-family2@example.invalid', photo_url: shared });
  record('students', { full_name: run, photo_url: 'documents/' + run + '/missing.png' });
  record('students', { full_name: run, photo_url: 'https://evil.example/photo?token=SECRET' });
  record('students', { full_name: run, photo_url: 'http://[' });
  record('students', { full_name: run, photo_url: await object('documents', 'archived.png'), deleted_at: '2025-01-01' });
  record('authorized_adults', { student_id: sid, full_name: run, telephone: '000000', relation: 'Autre', photo_url: await object('documents', 'adult.png') });
  await object('portfolios', 'orphan.png');
  const first = inventory(ctx);
  check(() => assert.equal(first.report.totals.objects, 9));
  check(() => assert.equal(first.report.totals.references, 13));
  check(() => assert.equal(first.report.candidates.length, 0));
  const ownerOnly = structuredClone(first.snapshot);
  ownerOnly.objects.forEach(o => { o.owner_id = user.id; });
  check(() => assert.equal(classify(ownerOnly, [], LOCAL_URL).candidates.length, 0));
  check(() => assert.equal(first.report.totals.referenceStates.conflicting, 2));
  check(() => assert.equal(first.report.totals.referenceStates.missing_object, 1));
  check(() => assert.equal(first.report.totals.referenceStates.unknown_external, 1));
  check(() => assert.equal(first.report.totals.objectStates.orphan_object, 1));
  const evidence = first.report.references.filter(r => r.reason === 'independent_review_required').map(r => {
    const o = first.report.objects.find(o => o.id === r.objectId);
    return { referenceFingerprint: r.fingerprint, objectId: o.id, objectVersion: o.version, sha256: digest(file), reviewedBy: user.id, basis: 'independent_content_review', evidenceId: 'synthetic-original-file' };
  });
  const second = inventory(ctx, evidence);
  const evidencePath = join(dir, 'synthetic-evidence.json');
  writeFileSync(evidencePath, JSON.stringify({ schemaVersion: 1, reviews: evidence }), { flag: 'wx', mode: 0o600 });
  check(() => assert.deepEqual(readEvidence(evidencePath), evidence));
  const cli = (script, args) => JSON.parse(execFileSync(process.execPath, ['scripts/' + script, ...args], { encoding: 'utf8' }));
  const cliDry = cli('backfill-storage-assets.mjs', ['--evidence', evidencePath, '--report', join(dir, 'cli-dry')]);
  check(() => assert.equal(cliDry.result.dryRun, true));
  for (const [script, args] of [
    ['inventory-storage.mjs', ['--apply']],
    ['backfill-storage-assets.mjs', ['--apply', '--url', 'https://project.supabase.co']],
    ['backfill-storage-assets.mjs', ['--apply', '--url', 'https://project.supabase.co', '--production', '--confirm-project', 'project']],
  ]) check(() => assert.throws(() => execFileSync(process.execPath, ['scripts/' + script, ...args], { stdio: 'pipe' })));
  check(() => assert.equal(second.report.candidates.length, 5));
  check(() => assert.equal(second.report.totals.referenceStates.verified, 6));
  check(() => assert.equal(second.report.snapshotFingerprint, first.report.snapshotFingerprint));
  check(() => assert.equal(JSON.stringify(second.report).includes('EXPIRED_SECRET'), false));
  check(() => assert.equal(JSON.stringify(second.report).includes('evil.example'), false));
  check(() => assert.ok(humanReport(second.report).includes('authorized_adults')));
  saveReport(second.report, join(dir, 'dry-run'));
  check(() => assert.equal(JSON.parse(readFileSync(join(dir, 'dry-run.json'))).totals.objects, 9));
  check(() => assert.throws(() => saveReport(second.report, join(dir, 'dry-run'))));
  check(() => assert.deepEqual(inventory(ctx).snapshot, first.snapshot));
  const stale = evidence.map(e => ({ ...e, objectVersion: 'stale' }));
  check(() => assert.equal(inventory(ctx, stale).report.candidates.length, 0));
  const candidateKey = r => `${r.table}:${r.recordId}:${r.objectId}`;
  const candidateKeys = report => report.candidates.map(candidateKey).sort();
  const singleClaimCandidate = second.report.candidates.find(candidate =>
    second.report.references.filter(r => r.objectId === candidate.objectId).length === 1);
  assert.ok(singleClaimCandidate, 'Fixture must include a verified object with exactly one database claim');
  const duplicateEvidence = evidence.find(e => e.referenceFingerprint === singleClaimCandidate.fingerprint);
  assert.ok(duplicateEvidence, 'Selected candidate must have independent review evidence');
  const duplicateReport = classify(first.snapshot, [...evidence, duplicateEvidence], LOCAL_URL);
  check(() => assert.deepEqual(
    candidateKeys(duplicateReport),
    candidateKeys(second.report).filter(key => key !== candidateKey(singleClaimCandidate)),
  ));
  const reversed = classify({ ...first.snapshot,
    objects: [...first.snapshot.objects].reverse(),
    references: [...first.snapshot.references].reverse(),
    assets: [...first.snapshot.assets].reverse(),
    bindings: [...first.snapshot.bindings].reverse(),
  }, [...evidence].reverse(), LOCAL_URL);
  check(() => assert.deepEqual(candidateKeys(reversed), candidateKeys(second.report)));
  const duplicateProofs = evidence.map(e => ({ ...e }));
  const duplicateRef = first.report.references.find(r => r.table === 'enrollments' && r.index === 1);
  duplicateProofs.find(e => e.referenceFingerprint === duplicateRef.fingerprint).objectVersion = 'contradiction';
  check(() => assert.equal(classify(first.snapshot, duplicateProofs, LOCAL_URL).candidates.some(r => r.table === 'enrollments'), false));
  const forged = evidence.map(e => ({ ...e, reviewedBy: randomUUID() }));
  check(() => assert.equal(inventory(ctx, forged).report.candidates.length, 0));
  const wrongHash = inventory(ctx, evidence.map(e => ({ ...e, sha256: '0'.repeat(64) })));
  await assert.rejects(applyBackfill(ctx, wrongHash.snapshot, wrongHash.report)); checks++;
  check(() => assert.deepEqual(inventory(ctx).snapshot, first.snapshot));
  // A concurrent reference change must invalidate the whole transaction.
  ctx.sql(`update public.students set photo_url='documents/${run}/changed.png' where id=${quote(sid)};`);
  await assert.rejects(applyBackfill(ctx, second.snapshot, second.report)); checks++;
  check(() => assert.equal(inventory(ctx).snapshot.assets.length, 0));
  ctx.sql(`update public.students set photo_url=${quote(objects[0].bucket + '/' + objects[0].path)} where id=${quote(sid)};`);
  const ready = inventory(ctx, evidence);
  const result = await applyBackfill(ctx, ready.snapshot, ready.report);
  check(() => assert.equal(result.active, 5)); check(() => assert.equal(result.staffOnly, 4));
  const after = inventory(ctx, evidence);
  check(() => assert.equal(after.snapshot.bindings.length, 5));
  check(() => assert.deepEqual(after.snapshot.references, ready.snapshot.references));
  check(() => assert.deepEqual(after.snapshot.objects, ready.snapshot.objects));
  for (const a of after.snapshot.assets.filter(a => a.state === 'staff_only')) {
    check(() => assert.equal(a.purpose, 'legacy_unclassified'));
    check(() => assert.ok(!after.snapshot.bindings.some(b => b.asset_id === a.id)));
  }
  const repeat = await applyBackfill(ctx, after.snapshot, after.report);
  check(() => assert.equal(repeat.active + repeat.staffOnly, 0));
  check(() => assert.deepEqual(inventory(ctx).snapshot, after.snapshot));
  const cliApply = cli('backfill-storage-assets.mjs', ['--apply', '--evidence', evidencePath, '--checkpoint', join(dir, 'checkpoint.json')]);
  check(() => assert.equal(cliApply.result.active + cliApply.result.staffOnly, 0));
  check(() => assert.equal(JSON.parse(readFileSync(join(dir, 'checkpoint.json'))).schemaVersion, 1));
  // Existing asset: references: simulate the reference in-memory without
  // rewriting legacy columns (the backfill must never do this).
  const existing = structuredClone(after.snapshot);
  const bound = existing.bindings.find(b => b.student_photo_id === sid);
  existing.references.find(r => r.recordId === sid).value = 'asset:' + bound.asset_id;
  check(() => assert.equal(classify(existing, [], LOCAL_URL).references.find(r => r.recordId === sid).state, 'verified'));
  existing.assets.find(a => a.id === bound.asset_id).student_id = randomUUID();
  check(() => assert.equal(classify(existing, [], LOCAL_URL).references.find(r => r.recordId === sid).state, 'conflicting'));
  existing.references.find(r => r.recordId === sid).value = 'asset:' + randomUUID();
  check(() => assert.equal(classify(existing, [], LOCAL_URL).references.find(r => r.recordId === sid).state, 'missing_object'));
  for (const o of objects) {
    const r = await fetch(LOCAL_URL + '/storage/v1/object/authenticated/' + o.bucket + '/' + o.path.split('/').map(encodeURIComponent).join('/'), { headers: { apikey: key, Authorization: 'Bearer ' + key }, redirect: 'error' });
    check(() => assert.equal(r.status, 200));
    const bytes = Buffer.from(await r.arrayBuffer()); check(() => assert.equal(digest(bytes), digest(file)));
  }
  // Read schema rejection without consuming an arbitrary manifest.
  check(() => assert.throws(() => readEvidence(join(dir, 'dry-run.json'))));
  check(() => assert.equal(ctx.sql("select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='storage';"), policies));
  outcome = { checks, result, totals: second.report.totals, reports: dir };
} finally {
  // Delete only this run's exact objects and rows. No guard/policy disabling.
  for (const bucket of ['documents', 'portfolios']) {
    const paths = objects.filter(o => o.bucket === bucket).map(o => o.path);
    if (paths.length) await api('/storage/v1/object/' + bucket, 'DELETE', { prefixes: paths });
  }
  const assetWhere = objects.map(o => `(bucket_id=${quote(o.bucket)} and object_path=${quote(o.path)})`).join(' or ') || 'false';
  const ids = [...Object.values(records).flat(), ...users];
  let cleanup = `begin; delete from public.storage_asset_bindings where asset_id in (select id from public.storage_assets where ${assetWhere}); delete from public.storage_assets where ${assetWhere};`;
  for (const table of ['authorized_adults', 'portfolios', 'enrollments', 'students', 'teachers']) if (records[table]?.length) cleanup += `delete from public.${table} where id in (${records[table].map(quote)});`;
  if (users.length) cleanup += `delete from auth.users where id in (${users.map(quote)});`;
  if (ids.length) cleanup += `delete from public.activity_log where target_id in (${ids.map(quote)});`;
  ctx.sql(cleanup + 'commit;');
  assert.equal(inventory(ctx).report.totals.objects + inventory(ctx).snapshot.assets.length, 0);
  if (users.length) assert.equal(ctx.sql(`select count(*) from auth.users where id in (${users.map(quote)});`), '0');
  console.log('Synthetic local fixture cleanup completed.');
}
console.log(JSON.stringify(outcome, null, 2));
