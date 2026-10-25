// Enrollment and group command wrappers (plan EGC-r2): payloads, the changed-fields
// rule (ACA-5) and the French error text, PT409 through isRecordConflict (ADR-009).
import assert from 'node:assert/strict';
import {
  changedEnrollmentFields, DUPLICATE_ENROLLMENT_MESSAGE, EGC_REASON_TEXT, ENROLLMENT_CHANGED_MESSAGE, GROUP_HISTORY_MESSAGE,
  endLearner, groupDeleteErrorMessage, membershipErrorMessage, placeLearnerInGroup, removeLearnerFromGroup, reopenEnrollment,
  saveEnrollmentChanges,
} from '../src/lib/academic/membershipActions.mjs';
import { recordConflictMessage } from '../src/lib/conflictErrors.mjs';

const calls = [];
const client = { rpc: (name, args) => { calls.push([name, args]); return Promise.resolve({ data: null, error: null }); } };
const student = { id: 's1', updated_at: '2026-10-01T10:00:00Z' };
const enrollment = { id: 'e1', updated_at: '2026-10-02T10:00:00Z' };
await placeLearnerInGroup(client, { student, group: 'g1' });
await placeLearnerInGroup(client, { student, group: 'g1', enrollment, overrideReason: 'Accord' });
await removeLearnerFromGroup(client, { student, group: 'g1', enrollment });
await endLearner(client, { student, finalStatus: 'Alumni', reason: 'Fin', enrollmentIds: [] });
await reopenEnrollment(client, enrollment);
await saveEnrollmentChanges(client, enrollment, { notes: 'x' });
assert.deepEqual(calls, [
  ['place_learner_in_group', { p_student: 's1', p_group: 'g1', p_student_updated_at: student.updated_at, p_enrollment: null,
    p_school_year: null, p_enrollment_updated_at: null, p_capacity_override_reason: null }],
  ['place_learner_in_group', { p_student: 's1', p_group: 'g1', p_student_updated_at: student.updated_at, p_enrollment: 'e1',
    p_school_year: null, p_enrollment_updated_at: enrollment.updated_at, p_capacity_override_reason: 'Accord' }],
  ['remove_learner_from_group', { p_student: 's1', p_group: 'g1', p_student_updated_at: student.updated_at, p_enrollment: 'e1',
    p_enrollment_updated_at: enrollment.updated_at }],
  ['end_learner', { p_student: 's1', p_student_updated_at: student.updated_at, p_final_status: 'Alumni', p_reason: 'Fin', p_enrollments: null }],
  ['reopen_enrollment', { p_enrollment: 'e1', p_expected_updated_at: enrollment.updated_at }],
  ['save_enrollment_changes', { p_enrollment: 'e1', p_expected_updated_at: enrollment.updated_at, p_changes: { notes: 'x' } }],
], 'the commands receive the expected versions and named arguments');

// ACA-5: only changed allow-listed fields; programme and year once set never travel.
const original = { status: 'Submitted', level: null, notes: '', session_type: 'Yearly', school_year: '2026/2027', group_id: 'g1' };
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
console.log('PASS membership actions: command payloads, changed fields only, French refusals and PT409 conflicts');
