// Batch C browser contract (plan NRC-r2, ADR-009, REL-4): record conflicts,
// worker mapping, new-learner identity and the CSV import rows. No database.
import assert from 'node:assert/strict';
import { CONFLICT_CODE, isRecordConflict, recordConflictMessage } from '../src/lib/conflictErrors.mjs';
import { metaRpcError } from '../src/lib/crm/meta/protocol.mjs';
import { commandError } from '../src/lib/crm/presentation.mjs';
import { STUDENT_ALREADY_CREATED_MESSAGE, STUDENT_CREATED_THEN_DELETED_MESSAGE, createStudentOnce, isReceptionistIdentityConflict } from '../src/lib/studentCreate.mjs';
import { IMPORT_FINISHED, csvLine, failedLines, fileDigest, importFailureReason, importFinished, importRowId, rowIdentities, rowStatus, rowsToSend } from '../src/lib/studentImport.mjs';

// conflictErrors: PT409 and the legacy code are both a record conflict; nothing else is.
assert.equal(CONFLICT_CODE, 'PT409');
for (const code of ['PT409', '40001']) assert.equal(isRecordConflict({ code, message: 'Student unavailable or stale' }), true, code);
for (const error of [{ code: '40P01' }, { code: '23505' }, { code: '22023' }, { code: '42501' }, { code: 'PGRST301' }, { message: '40001' }, {}, null, undefined]) {
  assert.equal(isRecordConflict(error), false, JSON.stringify(error));
}
assert.equal(recordConflictMessage(), 'Cette fiche a été modifiée entre-temps. Les informations sont actualisées : vérifiez puis recommencez.');
assert(!/stale|unavailable|PT409|40001/i.test(recordConflictMessage()), 'own fixed French text');
assert.equal(commandError({ code: 'PT409', message: 'Stale lead version' }), commandError({ code: '40001', message: 'Stale lead version' }));
console.log('PASS conflict helper: PT409 and legacy code, fixed French text');

// Worker RPCs (classes L and S): an unknown PT409 maps exactly as the old code did.
const workerSites = {
  crm_begin_external_attempt: ['Stale/unprepared delivery', 'Attempt already begun', 'Attempts exhausted'], crm_block_external_delivery: ['Stale/started lease'],
  crm_fail_insights_sync: ['Stale lease'], crm_fail_meta_job: ['Stale lease'], crm_finalize_meta_job: ['Stale lease'], crm_finalize_website_job: ['Stale lease'],
  crm_finish_external_attempt: ['Stale lease', 'Attempt missing'], crm_finish_insights_sync: ['Stale lease'], crm_get_external_delivery: ['Stale lease'],
  crm_get_meta_job_mapping: ['Stale lease'], crm_get_website_job_mapping: ['Stale lease'], crm_prepare_external_delivery: ['Stale lease', 'Frozen payload conflict'],
  crm_enqueue_meta_reconciled: ['crm_reconciliation_lease_lost', 'unknown']
};
for (const [name, messages] of Object.entries(workerSites)) {
  for (const message of messages) {
    const legacy = metaRpcError(name, { code: '40001', message }).code;
    const known = name === 'crm_enqueue_meta_reconciled' && message === 'crm_reconciliation_lease_lost';
    assert.equal(metaRpcError(name, { code: 'PT409', message }).code, known ? 'reconciliation_lease_lost' : legacy, `${name}: ${message}`);
    if (!known) assert.equal(legacy, 'storage_unavailable');
  }
}
console.log('PASS metaRpcError: unknown worker PT409 maps to storage_unavailable as before');

// createStudentOnce with a scripted PostgREST client.
function client({ insert, stored, readError = null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'students');
      return {
        insert(row) { calls.push(['insert', row]); return { select: () => ({ single: async () => insert(row) }) }; },
        select(columns) {
          assert.equal(columns, '*');
          return { eq: (column, value) => { calls.push(['read', column, value]); return { maybeSingle: async () => ({ data: stored, error: readError }) }; } };
        }
      };
    }
  };
}
const ID = 'b0000000-0000-4000-8000-000000000001';
const payload = { full_name: 'Amal Test', date_naissance: '2015-02-03', status: 'Enrolled', id: 'ignored', created_date: 'x', updated_at: 'y' };
const pkey = { code: '23505', message: 'duplicate key value violates unique constraint "students_pkey"', details: `Key (id)=(${ID}) already exists.` };
{
  const c = client({ insert: async row => ({ data: { ...row, created_at: 't' }, error: null }) });
  const result = await createStudentOnce(c, ID, payload);
  assert.equal(result.status, 'created'); assert.equal(result.row.id, ID); assert.equal(result.row.created_date, 't');
  assert.deepEqual(c.calls, [['insert', { full_name: 'Amal Test', date_naissance: '2015-02-03', status: 'Enrolled', id: ID }]], 'our id, server-owned fields stripped');
}
{
  const c = client({ insert: async () => ({ data: null, error: pkey }), stored: { id: ID, full_name: 'Amal Test', date_naissance: '2015-02-03', deleted_at: null } });
  const result = await createStudentOnce(c, ID, payload);
  assert.equal(result.status, 'replayed'); assert.equal(result.row.id, ID); assert.equal(result.message, undefined);
  assert.deepEqual(c.calls[1], ['read', 'id', ID]);
}
{
  const c = client({ insert: async () => ({ data: null, error: pkey }), stored: { id: ID, full_name: 'Amal Changed', date_naissance: '2015-02-03', deleted_at: null } });
  assert.deepEqual(await createStudentOnce(c, ID, payload).then(r => [r.status, r.message]), ['already_created', STUDENT_ALREADY_CREATED_MESSAGE]);
  const birth = client({ insert: async () => ({ data: null, error: pkey }), stored: { id: ID, full_name: 'Amal Test', date_naissance: null, deleted_at: null } });
  assert.equal((await createStudentOnce(birth, ID, payload)).status, 'already_created');
}
for (const stored of [{ id: ID, full_name: 'Amal Test', deleted_at: '2026-10-01T00:00:00Z' }, null]) {
  // The restrictive soft-delete policy hides a deleted row from the read-back (null).
  const c = client({ insert: async () => ({ data: null, error: pkey }), stored });
  assert.deepEqual(await createStudentOnce(c, ID, payload), { status: 'deleted', message: STUDENT_CREATED_THEN_DELETED_MESSAGE });
}
for (const [label, options] of [
  ['other unique constraint', { insert: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "students_email_key"' } }) }],
  ['RLS denial', { insert: async () => ({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }) }],
  ['pkey conflict, read failed', { insert: async () => ({ data: null, error: pkey }), stored: null, readError: { message: 'Failed to fetch' } }]
]) {
  const c = client(options);
  await assert.rejects(createStudentOnce(c, ID, payload), error => error === (options.readError ? pkey : error), label);
}
// An uncertain failure throws, so the form keeps its id and the next send replays it.
await assert.rejects(createStudentOnce(client({ insert: async () => { throw new TypeError('Failed to fetch'); } }), ID, payload), TypeError);
assert.equal(isReceptionistIdentityConflict({ code: '23505', message: 'Student create identity conflict' }), true);
assert.equal(isReceptionistIdentityConflict({ code: '23505', message: 'duplicate key value violates unique constraint "students_pkey"' }), false);
assert.equal(isReceptionistIdentityConflict({ code: 'PT409', message: 'Student create identity conflict' }), false);
console.log('PASS createStudentOnce: created, replayed, already created, deleted, other errors rethrown');

// CSV import ids: same file text and line → same id; any edit → new ids.
const text = 'full_name,email\nAmal,a@example.com\nYassine,\n';
const digest = await fileDigest(text);
assert.match(digest, /^[0-9a-f]{64}$/);
const id2 = await importRowId(digest, 2);
assert.match(id2, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'version-5 layout');
assert.equal(await importRowId(await fileDigest(text), 2), id2, 'deterministic');
assert.notEqual(await importRowId(digest, 3), id2, 'line matters');
assert.notEqual(await importRowId(await fileDigest(text + ' '), 2), id2, 'any edit gives new ids');
assert.notEqual(await importRowId(await fileDigest(text.replace('\n', '\r\n')), 2), id2, 'line endings are part of the text');
const rows = [{ idx: 0, ok: true, data: { full_name: 'Amal' } }, { idx: 1, ok: true, data: { full_name: 'Yassine' } }, { idx: 2, ok: false, data: {} }];
const ids = await rowIdentities(text, rows);
assert.deepEqual(Object.keys(ids), ['2', '3', '4']); assert.equal(ids[2], id2); assert.equal(new Set(Object.values(ids)).size, 3);
assert.deepEqual(await rowIdentities(text, rows), ids);
console.log('PASS import ids: deterministic per file text and CSV line, any edit changes them');

// Row status: a second click sends only failed and pending rows; a finished import is locked.
assert.deepEqual(rowsToSend(rows, {}).map(csvLine), [2, 3], 'invalid rows are never sent');
let statuses = { 2: rowStatus({ status: 'created' }), 3: { state: 'failed', reason: importFailureReason({ code: '', message: 'TypeError: Failed to fetch' }) } };
assert.deepEqual(rowsToSend(rows, statuses).map(csvLine), [3], 'second click: failed rows only');
assert.equal(importFinished(rows, statuses), false);
assert.deepEqual(failedLines(statuses), [{ line: 3, reason: 'Envoi non confirmé : réessayez' }]);
statuses = { ...statuses, 3: rowStatus({ status: 'replayed' }) };
assert.equal(importFinished(rows, statuses), true); assert.deepEqual(rowsToSend(rows, statuses), []); assert.equal(IMPORT_FINISHED, 'Import terminé');
assert.equal(statuses[3].replayed, true);
assert.equal(importFinished([{ idx: 0, ok: false }], {}), false, 'nothing valid is never finished');
assert.deepEqual(rowStatus({ status: 'deleted' }).state, 'failed');
assert.match(rowStatus({ status: 'deleted' }).reason, /supprimé/);
assert.equal(rowStatus({ status: 'already_created' }).state, 'imported');
for (const [error, reason] of [[{ code: '42501', message: 'raw' }, 'Accès refusé'], [{ code: '23505', message: 'raw' }, 'Doublon refusé par la base'],
  [{ code: '22P02', message: 'raw' }, 'Données refusées par la base'], [{ code: '23514', message: 'raw' }, 'Données refusées par la base'],
  [new TypeError('Failed to fetch'), 'Envoi non confirmé : réessayez']]) {
  assert.equal(importFailureReason(error), reason);
}
console.log('PASS import rows: only pending/failed rows re-sent, finished import locked, failed rows listed by line');
