import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, digest, humanReport, uuid } from './storage-inventory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const LOCAL_URL = 'http://127.0.0.1:54321';
const container = 'supabase_db_hills-admin-next';
const lit = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
const json = value => lit(JSON.stringify(value)) + '::jsonb';

export function guardTarget(url, { apply = false, production = false, confirmProject, linkedProject } = {}) {
  // Deliberately no cloud adapter in 4B. Approval flags are recognized but
  // cannot accidentally turn a loopback-only implementation into a cloud tool.
  if (url !== LOCAL_URL) {
    if (apply && !(production && confirmProject && confirmProject === linkedProject)) throw new Error('Cloud writes require apply, production approval and matching project confirmation; not enabled in Batch 4B');
    throw new Error('Cloud/unknown targets are disabled in Batch 4B, including inventory');
  }
  if (production || confirmProject) throw new Error('Production flags conflict with the local target');
  return { kind: 'local', linkedProjectPresent: Boolean(linkedProject), linkedProjectUsed: false };
}

export function options(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (['--apply', '--production'].includes(k)) out[k.slice(2)] = true;
    else if (['--report', '--evidence', '--confirm-project', '--url', '--checkpoint'].includes(k)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing option value');
      out[k.slice(2)] = args[++i];
    } else throw new Error('Unknown option');
  }
  return out;
}

export function localContext(opts = {}) {
  if (execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() !== 'codex-migration') throw new Error('Requires codex-migration');
  const dockerHost = process.env.DOCKER_HOST || JSON.parse(execFileSync('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  if (typeof dockerHost !== 'string' || !dockerHost.startsWith('unix://')) throw new Error('Requires a local Unix-socket Docker engine');
  const env = {};
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m?.[1] === 'NEXT_PUBLIC_SUPABASE_URL') env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '').trim();
  }
  const linkedPath = resolve(root, 'supabase/.temp/project-ref');
  const linkedProject = existsSync(linkedPath) ? readFileSync(linkedPath, 'utf8').trim() : null;
  const url = opts.url ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const target = guardTarget(url, { apply: opts.apply, production: opts.production, confirmProject: opts['confirm-project'], linkedProject });
  if (env.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_URL) throw new Error('Environment URL mismatch');
  function sql(input) {
    try {
      return execFileSync('docker', ['exec', '-i', container, 'psql', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        { input: 'set standard_conforming_strings=on; set statement_timeout=30000; set lock_timeout=5000;\n' + input, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (error) {
      const changed = String(error.stderr ?? '').includes('Inventory changed; rerun');
      throw new Error(changed ? 'Inventory changed; rerun in an idle environment' : 'Local database operation failed (details suppressed to protect references); no cloud fallback');
    }
  }
  if (sql("select current_database()='postgres' and current_user='postgres' and exists(select 1 from supabase_migrations.schema_migrations where version='045');") !== 't') throw new Error('Local schema identity mismatch');
  return { sql, target, url };
}

// Owner connection bypasses application RLS intentionally so archived rows are
// included. Select only IDs, references and security-relevant flags; never HR,
// names, emails, JWTs or arbitrary object user_metadata.
const rows = query => `(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (${query}) x)`;
export const snapshotQuery = `jsonb_build_object(
 'objects', ${rows("select id,bucket_id,name,version,metadata->>'size' as size,metadata->>'mimetype' as mime_type,created_at,updated_at,owner,owner_id from storage.objects order by id")},
 'references', ${rows(`select * from (
 select 'students' as "table",id as "recordId",'photo_url' as "column",null::int as "index",id as "studentId",null::uuid as "teacherId",deleted_at is not null as archived,photo_url as value from public.students where photo_url is not null and photo_url<>''
 union all select 'teachers',id,'photo_url',null,null,id,deleted_at is not null,photo_url from public.teachers where photo_url is not null and photo_url<>''
 union all select 'portfolios',p.id,'file_url',null,p.student_id,null,s.deleted_at is not null,p.file_url from public.portfolios p left join public.students s on s.id=p.student_id where p.file_url is not null and p.file_url<>''
 union all select 'enrollments',e.id,'documents_urls',(u.n-1)::int,e.student_id,null,s.deleted_at is not null,u.value from public.enrollments e left join public.students s on s.id=e.student_id cross join lateral unnest(e.documents_urls) with ordinality u(value,n) where u.value is not null and u.value<>''
 union all select 'authorized_adults',a.id,'photo_url',null,a.student_id,null,s.deleted_at is not null,a.photo_url from public.authorized_adults a left join public.students s on s.id=a.student_id where a.photo_url is not null and a.photo_url<>''
 ) refs order by "table","recordId","index"`)},
 'assets', ${rows('select * from public.storage_assets order by id')},
 'bindings', ${rows('select * from public.storage_asset_bindings order by id')},
 'studentIds', (select coalesce(jsonb_agg(id order by id),'[]') from public.students),
 'teacherIds', (select coalesce(jsonb_agg(id order by id),'[]') from public.teachers),
 'staffIds', (select coalesce(jsonb_agg(id order by id),'[]') from public.profiles where role in ('admin','director'))
)`;

export function inventory(ctx, evidence = []) {
  const snapshot = JSON.parse(ctx.sql(`begin isolation level repeatable read read only; select ${snapshotQuery}; commit;`));
  const report = classify(snapshot, evidence, ctx.url);
  report.environment = ctx.target;
  return { snapshot, report };
}

export function readEvidence(path) {
  if (!path) return [];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.schemaVersion !== 1 || !Array.isArray(data.reviews)) throw new Error('Invalid evidence schema');
  // Only allow specific fields; no raw URL/token/free-text PII in reports.
  const keys = ['referenceFingerprint', 'objectId', 'objectVersion', 'sha256', 'reviewedBy', 'basis', 'evidenceId'];
  return data.reviews.map(e => Object.fromEntries(keys.map(k => [k, e[k]])));
}

export function saveReport(report, prefix) {
  if (!prefix) return;
  // Exclusive create prevents clobbering source or an earlier review report.
  writeFileSync(prefix + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  writeFileSync(prefix + '.md', humanReport(report), { flag: 'wx', mode: 0o600 });
}

async function checkedBytes(ctx, o, expectedHash, purpose) {
  if (!Number.isSafeInteger(Number(o.size)) || Number(o.size) <= 0 || Number(o.size) > 10485760 || !o.version) throw new Error('Unsupported object size/version');
  // Obtain the key from the LOCAL runtime, not an unchecked service key in an
  // env file. Never transmit a production service key, even to loopback.
  let key;
  try {
    const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
    if (status.API_URL !== LOCAL_URL) throw new Error();
    key = status.SERVICE_ROLE_KEY;
  } catch { throw new Error('Cannot obtain verified local Storage credentials'); }
  if (!key) throw new Error('Missing local Storage credential');
  const path = [o.bucket_id, ...o.object_path.split('/')].map(encodeURIComponent).join('/');
  const r = await fetch(LOCAL_URL + '/storage/v1/object/authenticated/' + path, {
    headers: { apikey: key, Authorization: 'Bearer ' + key }, redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('Local object verification failed');
  const chunks = []; let size = 0;
  for await (const chunk of r.body) { size += chunk.length; if (size > 10485760) throw new Error('Object exceeded size limit'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (size !== Number(o.size) || digest(bytes) !== expectedHash) throw new Error('Reviewed bytes no longer match');
  const type = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) ? 'image/jpeg' : bytes.subarray(0, 4).toString() === '%PDF' ? 'application/pdf' : null;
  if (!type || type !== o.mime_type || purpose.endsWith('_photo') && type === 'application/pdf') throw new Error('Unsupported reviewed content');
  return type;
}

export async function applyBackfill(ctx, snapshot, report) {
  // Recompute from the supplied reviews; never accept candidate state from a
  // serialized dry-run report or checkpoint as authority.
  const checked = classify(snapshot, report.references.filter(r => r.review).map(r => r.review), ctx.url);
  const candidates = checked.candidates;
  const verified = new Map();
  for (const r of candidates) {
    const o = checked.objects.find(o => o.id === r.objectId);
    verified.set(o.id, { r, type: await checkedBytes(ctx, o, r.review.sha256, r.purpose) });
  }
  let body = `begin; lock table public.students,public.teachers,public.portfolios,public.enrollments,public.authorized_adults,public.profiles,public.storage_assets,public.storage_asset_bindings,storage.objects in share row exclusive mode;
    do $backfill$ begin if (${snapshotQuery}) is distinct from ${json(snapshot)} then raise exception 'Inventory changed; rerun'; end if; end $backfill$;`;
  let active = 0, staffOnly = 0;
  for (const o of checked.objects) {
    if (snapshot.assets.some(a => a.bucket_id === o.bucket_id && a.object_path === o.object_path)) continue;
    if (!['documents', 'portfolios'].includes(o.bucket_id)) continue;
    const v = verified.get(o.id), r = v?.r;
    const reviewer = r?.review.reviewedBy;
    if (reviewer && !uuid(reviewer)) throw new Error('Invalid reviewer');
    const provenance = r ? 'batch4b_review:' + digest(r.review) : 'batch4b_unresolved:' + digest([o.id, o.version]);
    body += `insert into public.storage_assets(bucket_id,object_path,purpose,student_id,teacher_id,enrollment_id,uploader_id,state,verified_size,verified_type,object_version,provenance,classified_by)
      values(${lit(o.bucket_id)},${lit(o.object_path)},${lit(r?.purpose ?? 'legacy_unclassified')},${lit(r?.studentId)},${lit(r?.teacherId)},${lit(r?.table === 'enrollments' ? r.recordId : null)},null,${lit(r ? 'active' : 'staff_only')},${r ? Number(o.size) : 'null'},${lit(v?.type)},${lit(o.version)},${lit(provenance)},${lit(reviewer)});`;
    if (r) {
      const col = { students: 'student_photo_id', teachers: 'teacher_photo_id', portfolios: 'portfolio_id', enrollments: 'enrollment_id' }[r.table];
      body += `insert into public.storage_asset_bindings(asset_id,${col},bound_by) select id,${lit(r.recordId)},${lit(reviewer)} from public.storage_assets where bucket_id=${lit(o.bucket_id)} and object_path=${lit(o.object_path)};`;
      active++;
    } else staffOnly++;
  }
  ctx.sql(body + 'commit;');
  return { active, staffOnly, snapshotFingerprint: report.snapshotFingerprint };
}

export async function runCli(args, allowApply) {
  const opts = options(args);
  if (opts.apply && !allowApply) throw new Error('Inventory is read-only');
  const ctx = localContext(opts);
  const { snapshot, report } = inventory(ctx, readEvidence(opts.evidence));
  saveReport(report, opts.report);
  const result = opts.apply ? await applyBackfill(ctx, snapshot, report) : { dryRun: true, verifiedBindings: report.candidates.length };
  if (opts.checkpoint) writeFileSync(opts.checkpoint, JSON.stringify({ schemaVersion: 1, result }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ totals: report.totals, result }, null, 2));
}
