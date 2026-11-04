// Enrollment and group command wrappers (plan EGC-r2): payloads, the changed-fields
// rule (ACA-5) and the French error text, PT409 through isRecordConflict (ADR-009).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as actions from '../src/lib/academic/membershipActions.mjs';
import {
  changedEnrollmentFields, DUPLICATE_ENROLLMENT_MESSAGE, EAP_REASON_TEXT, EGC_REASON_TEXT, ENROLLMENT_CHANGED_MESSAGE, ENROLLMENT_EDIT_FIELDS,
  GROUP_HISTORY_MESSAGE, eapReason, endLearner, groupDeleteErrorMessage, membershipErrorMessage, placeLearnerInGroup, removeLearnerFromGroup,
  reopenEnrollment, saveEnrollmentChanges,
} from '../src/lib/academic/membershipActions.mjs';
import { recordConflictMessage } from '../src/lib/conflictErrors.mjs';

const calls = [];
const client = { rpc: (name, args) => { calls.push([name, args]); return Promise.resolve({ data: null, error: null }); } };
const student = { id: 's1', updated_at: '2026-10-01T10:00:00Z' };
const enrollment = { id: 'e1', updated_at: '2026-10-02T10:00:00Z' };
await placeLearnerInGroup(client, { student, group: 'g1' });
await placeLearnerInGroup(client, { student, group: 'g1', enrollment, overrideReason: 'Accord' });
await placeLearnerInGroup(client, { student, group: 'g1', schoolYear: '2026/2027', withoutEnrollmentReason: 'Bourse direction' });
await removeLearnerFromGroup(client, { student, group: 'g1', enrollment });
await endLearner(client, { student, finalStatus: 'Alumni', reason: 'Fin', enrollmentIds: [] });
await reopenEnrollment(client, enrollment);
await saveEnrollmentChanges(client, enrollment, { notes: 'x' });
assert.deepEqual(calls, [
  ['place_learner_in_group', { p_student: 's1', p_group: 'g1', p_student_updated_at: student.updated_at, p_enrollment: null,
    p_school_year: null, p_enrollment_updated_at: null, p_capacity_override_reason: null, p_without_enrollment_reason: null }],
  ['place_learner_in_group', { p_student: 's1', p_group: 'g1', p_student_updated_at: student.updated_at, p_enrollment: 'e1',
    p_school_year: null, p_enrollment_updated_at: enrollment.updated_at, p_capacity_override_reason: 'Accord', p_without_enrollment_reason: null }],
  // EAP (Q3 = B): the reason to place without a paid enrollment travels apart from the capacity override.
  ['place_learner_in_group', { p_student: 's1', p_group: 'g1', p_student_updated_at: student.updated_at, p_enrollment: null,
    p_school_year: '2026/2027', p_enrollment_updated_at: null, p_capacity_override_reason: null, p_without_enrollment_reason: 'Bourse direction' }],
  ['remove_learner_from_group', { p_student: 's1', p_group: 'g1', p_student_updated_at: student.updated_at, p_enrollment: 'e1',
    p_enrollment_updated_at: enrollment.updated_at }],
  ['end_learner', { p_student: 's1', p_student_updated_at: student.updated_at, p_final_status: 'Alumni', p_reason: 'Fin', p_enrollments: null }],
  ['reopen_enrollment', { p_enrollment: 'e1', p_expected_updated_at: enrollment.updated_at }],
  ['save_enrollment_changes', { p_enrollment: 'e1', p_expected_updated_at: enrollment.updated_at, p_changes: { notes: 'x' } }],
], 'the commands receive the expected versions and named arguments');

// ACA-5: only changed allow-listed fields; programme and year once set never travel.
// EAP: the status is never edited, so it never travels; no command creates an enrollment.
assert.deepEqual(ENROLLMENT_EDIT_FIELDS, ['level', 'date_inscription', 'notes', 'session_type', 'school_year']);
assert.equal('createEnrollment' in actions, false, 'createEnrollment is gone');
const original = { status: 'Confirmed', level: null, notes: '', session_type: 'Yearly', school_year: '2026/2027', group_id: 'g1' };
assert.deepEqual(changedEnrollmentFields(original, { ...original, status: 'Validated' }), {}, 'a status change never travels');
assert.deepEqual(changedEnrollmentFields(original, { ...original, notes: 'Appel', group_id: 'g2', session_type: 'Adults' }), { notes: 'Appel' });
assert.deepEqual(changedEnrollmentFields({ ...original, school_year: null }, { ...original, school_year: '2026/2027' }), { school_year: '2026/2027' });
assert.deepEqual(changedEnrollmentFields(original, { ...original, level: '' }), {});

// French text: stale and duplicate conflicts (PT409), egc reasons, constraint names, online reasons.
assert.equal(membershipErrorMessage({ code: 'PT409', hint: 'egc.stale' }), ENROLLMENT_CHANGED_MESSAGE);
assert.equal(membershipErrorMessage({ code: 'PT409', hint: 'egc.duplicate_enrollment' }), DUPLICATE_ENROLLMENT_MESSAGE);
assert.equal(membershipErrorMessage({ code: 'PT409', message: 'Student unavailable or stale' }), recordConflictMessage());
assert.equal(membershipErrorMessage({ code: '23514', hint: 'egc.capacity' }), EGC_REASON_TEXT.capacity);
assert.equal(membershipErrorMessage({ code: '23514', hint: 'egc.group_level_locked' }), EGC_REASON_TEXT.group_level_locked);
assert.equal(membershipErrorMessage({ code: '42501', hint: 'egc.history_protected' }), EGC_REASON_TEXT.history_protected);
assert.equal(membershipErrorMessage({ code: '23514', hint: 'online.capacity' }), 'Ce cours en ligne est complet.');
assert.equal(membershipErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "enrollments_one_active_programme_year"' }),
  DUPLICATE_ENROLLMENT_MESSAGE);
assert.equal(membershipErrorMessage({ code: '23514', message: 'new row for relation "enrollments" violates check constraint "enrollments_confirmed_has_programme"' }),
  EGC_REASON_TEXT.programme_required);
assert.equal(membershipErrorMessage({ code: '42501', message: 'Forbidden' }), 'Vous n’avez pas accès à cette action.');
assert.equal(groupDeleteErrorMessage({ code: '23503', message: 'update or delete on table "groups" violates foreign key constraint' }), GROUP_HISTORY_MESSAGE);
assert.equal(membershipErrorMessage(null), '');
for (const [reason, text] of Object.entries(EGC_REASON_TEXT)) {
  assert.equal(membershipErrorMessage({ code: '23514', hint: `egc.${reason}` }), text, reason);
  assert(!/[A-Z]{2,}_|undefined/.test(text), `${reason}: French text only`);
}
// EAP refusals in French (migration 127): every eap.* hint the server raises.
const migration = readFileSync('supabase/migrations/127_enrollment_at_payment.sql', 'utf8');
for (const [reason, text] of Object.entries(EAP_REASON_TEXT)) {
  assert.equal(membershipErrorMessage({ code: '23514', hint: `eap.${reason}` }), text, reason);
  assert.equal(eapReason(`eap.${reason}`), reason);
}
for (const reason of ['paid_enrollment_required', 'placement_reason_required', 'archived_not_reopenable', 'status_retired']) {
  assert.ok(migration.includes(`hint = 'eap.${reason}'`) || migration.includes(`hint='eap.${reason}'`), `127 raises eap.${reason}`);
  assert.ok(migration.includes(EAP_REASON_TEXT[reason]), `127 says the same text for eap.${reason}`);
}
assert.equal(membershipErrorMessage({ code: '23514', hint: 'eap.archived_not_reopenable' }),
  'Une pré-inscription archivée ne se rouvre pas : inscrivez et encaissez.', '« Rouvrir l’inscription » on an archived row');
assert.equal(eapReason('eap.unknown'), null);
assert.equal(eapReason('egc.capacity'), null);
console.log('PASS membership actions: command payloads, changed fields only, French refusals (egc and eap) and PT409 conflicts; no enrollment creation, no status edit');
