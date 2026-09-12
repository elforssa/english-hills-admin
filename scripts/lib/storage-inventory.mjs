import { createHash } from 'node:crypto';

export const STATES = ['verified', 'conflicting', 'orphan_object', 'missing_object', 'unknown_external', 'ambiguous'];
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const objectKey = o => JSON.stringify([o.bucket_id, o.object_path ?? o.name]);
const bindings = { students: 'student_photo_id', teachers: 'teacher_photo_id', portfolios: 'portfolio_id', enrollments: 'enrollment_id' };
const purposes = { students: 'student_photo', teachers: 'teacher_photo', portfolios: 'portfolio', enrollments: 'enrollment_document' };

// URL parsing is purely lexical: never fetch a reference, follow a redirect,
// inspect a JWT, or treat an expired signature as ownership evidence.
export function normalize(value, origin) {
  if (typeof value !== 'string' || !value || value.trim() !== value || /[\u0000-\u001f\\]/.test(value)) return { state: 'ambiguous', reason: 'malformed_reference' };
  if (value.startsWith('asset:')) return uuid(value.slice(6)) ? { assetId: value.slice(6).toLowerCase() } : { state: 'ambiguous', reason: 'invalid_asset_id' };
  let path = value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    let url;
    try { url = new URL(value); } catch { return { state: 'ambiguous', reason: 'malformed_url' }; }
    if (url.origin !== origin || url.username || url.password) return { state: 'unknown_external', reason: 'unapproved_origin' };
    // Reject dot segments BEFORE URL() silently normalizes them.
    const rawPath = value.slice(value.indexOf('://') + 3).replace(/^[^/]+/, '').split(/[?#]/)[0];
    if (rawPath.split('/').some(s => /^(\.|%2e){1,2}$/i.test(s))) return { state: 'ambiguous', reason: 'noncanonical_path' };
    const match = rawPath.match(/^\/storage\/v1\/object\/(?:sign\/|public\/|authenticated\/)?(documents|portfolios)\/(.+)$/);
    if (!match) return { state: 'ambiguous', reason: 'unknown_storage_url_form' };
    try { path = match[1] + '/' + decodeURIComponent(match[2]); } catch { return { state: 'ambiguous', reason: 'invalid_encoding' }; }
  }
  const match = path.match(/^(documents|portfolios)\/(.+)$/);
  if (!match || /[\u0000-\u001f\\?#]/.test(path) || match[2].split('/').some(s => !s || s === '.' || s === '..')) return { state: 'ambiguous', reason: 'unsupported_key' };
  // Plain bucket/path is already an exact key; never percent-decode it.
  return { bucket_id: match[1], object_path: match[2] };
}

export function referenceIdentity(r) {
  return { table: r.table, recordId: r.recordId, column: r.column, index: r.index, studentId: r.studentId, teacherId: r.teacherId, archived: r.archived, normalized: r.normalized };
}

export function classify(snapshot, evidence = [], origin = 'http://127.0.0.1:54321') {
  const objects = snapshot.objects.map(o => ({ ...o, object_path: o.name }));
  const refs = snapshot.references.map(r => ({ ...r, normalized: normalize(r.value, origin) }));
  for (const r of refs) {
    delete r.value;
    r.fingerprint = digest(referenceIdentity(r));
    r.purpose = purposes[r.table] ?? 'legacy_unclassified';
    const n = r.normalized;
    const a = n.assetId ? snapshot.assets.find(a => a.id === n.assetId) : null;
    const key = a ?? n;
    r.objectId = objects.find(o => objectKey(o) === objectKey(key))?.id ?? null;
    r.state = n.state ?? (!r.objectId ? 'missing_object' : 'ambiguous');
    r.reason = n.reason ?? (!r.objectId ? 'object_or_registry_entry_missing' : 'independent_review_required');
  }
  for (const o of objects) {
    const claims = refs.filter(r => r.objectId === o.id);
    const identities = new Set(claims.map(r => `${r.table}:${r.recordId}`));
    const a = snapshot.assets.find(a => objectKey(a) === objectKey(o));
    o.state = 'orphan_object'; o.reason = 'no_database_reference';
    if (!claims.length) { if (a) { o.state = 'ambiguous'; o.reason = 'registry_without_current_reference'; } continue; }
    for (const r of claims) {
      const relationValid = r.table === 'teachers' ? snapshot.teacherIds.includes(r.teacherId) : snapshot.studentIds.includes(r.studentId);
      const expectedBucket = r.purpose === 'portfolio' ? 'portfolios' : 'documents';
      const typed = bindings[r.table];
      const bound = a && snapshot.bindings.filter(b => b.asset_id === a.id);
      if (identities.size > 1) { r.state = 'conflicting'; r.reason = 'multiple_record_claims'; }
      else if (!typed || r.archived || !relationValid || o.bucket_id !== expectedBucket) { r.state = 'ambiguous'; r.reason = 'unsupported_archived_or_invalid_subject'; }
      else if (a) {
        const valid = a.state === 'active' && a.purpose === r.purpose && a.student_id === r.studentId && a.teacher_id === r.teacherId
          && a.enrollment_id === (r.table === 'enrollments' ? r.recordId : null)
          && a.object_version === o.version && bound.length === 1 && bound[0][typed] === r.recordId;
        r.state = valid ? 'verified' : 'conflicting'; r.reason = valid ? 'consistent_trusted_registry_binding' : 'existing_registry_mismatch';
        r.existingAssetId = a.id;
      } else {
        const proofs = evidence.filter(e => e.referenceFingerprint === r.fingerprint);
        const e = proofs[0];
        const valid = proofs.length === 1 && e.objectId === o.id && e.objectVersion === o.version
          && /^[a-f0-9]{64}$/.test(e.sha256 ?? '') && uuid(e.reviewedBy)
          && snapshot.staffIds.includes(e.reviewedBy) && e.basis === 'independent_content_review'
          && /^[A-Za-z0-9_-]{1,80}$/.test(e.evidenceId ?? '');
        if (proofs.length && !valid) { r.state = 'conflicting'; r.reason = 'invalid_or_stale_review'; }
        else if (valid) { r.state = 'verified'; r.reason = 'reference_plus_independent_content_review'; r.review = { ...e }; }
      }
    }
    o.state = claims.some(r => r.state === 'conflicting') ? 'conflicting' : claims.every(r => r.state === 'verified') ? 'verified' : 'ambiguous';
    o.reason = claims[0].reason;
    for (const r of claims) if (r.state === 'verified' && o.state !== 'verified') {
      r.state = o.state; r.reason = 'another_claim_requires_review';
    }
  }
  const count = rows => Object.fromEntries(STATES.map(s => [s, rows.filter(r => r.state === s).length]));
  for (const r of refs) {
    r.confidence = r.state !== 'verified' ? 'unresolved' : r.existingAssetId ? 'trusted_registry' : 'operator_review_pending_apply_byte_check';
    r.provenance = r.reason;
  }
  return {
    schemaVersion: 1, target: origin, snapshotFingerprint: digest(snapshot),
    totals: { objects: objects.length, references: refs.length, objectStates: count(objects), referenceStates: count(refs) },
    objects, references: refs,
    unresolvedRecords: refs.filter(r => r.state !== 'verified').map(r => ({ table: r.table, recordId: r.recordId, column: r.column, index: r.index, state: r.state, reason: r.reason })),
    // Duplicate occurrences in a single enrollment array produce one binding.
    candidates: refs.filter((r, i) => r.state === 'verified' && !r.existingAssetId && refs.findIndex(x => x.objectId === r.objectId && x.recordId === r.recordId) === i),
  };
}

export function humanReport(report) {
  return '# Storage inventory (sensitive operational metadata)\n\n' +
    `Target: ${report.target}\n\nObjects: ${report.totals.objects}; references: ${report.totals.references}\n\n` +
    STATES.map(s => `- ${s}: ${report.totals.objectStates[s]} objects; ${report.totals.referenceStates[s]} references`).join('\n') +
    '\n\n## Records requiring review\n\n' + report.unresolvedRecords.map(r => `- ${r.table}/${r.recordId} ${r.column}[${r.index ?? ''}]: ${r.state} (${r.reason})`).join('\n') +
    '\n\nExact keys and evidence are in the companion JSON. No URLs or signed tokens are included.\n';
}
