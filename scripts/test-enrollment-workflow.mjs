import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOpenEnrollment, studentNeedsGroup, groupMemberIds, importedStudentStatus, LIVE_ENROLLMENT_STATUSES, MEMBERSHIP_STATUSES,
  ACTIVE_STUDENT_STATUSES, currentSchoolYear, groupYear, studentGroupIds } from '../src/lib/enrollmentWorkflow.mjs';
import * as workflow from '../src/lib/enrollmentWorkflow.mjs';
// D3-A (EGC): an imported file is a prospect until an enrollment confirms it.
assert.equal(importedStudentStatus(''), 'Prospect');
assert.equal(importedStudentStatus(undefined), 'Prospect');
assert.equal(importedStudentStatus('Enrolled'), 'Prospect');
assert.equal(importedStudentStatus('Trial'), 'Prospect');
assert.equal(importedStudentStatus('Alumni'), 'Alumni');
assert.equal(importedStudentStatus('Inactive'), 'Inactive');
assert.deepEqual(ACTIVE_STUDENT_STATUSES, ['Enrolled', 'Trial'], 'Ancien apprenant is not active');
// EAP (migration 127): only a paid enrollment is live; the pre-enrollment helpers are gone.
assert.deepEqual(LIVE_ENROLLMENT_STATUSES, ['Confirmed', 'Validated']);
assert.deepEqual(MEMBERSHIP_STATUSES, ['Validated', 'Trial'], 'a Trial row placed before the archive is still a member, as the database counts it');
for (const name of ['PENDING_PRE_ENROLLMENT_STATUSES', 'isPreEnrollment', 'isPendingPreEnrollment']) assert.equal(name in workflow, false, name);
// « Ancien apprenant » and « Clôturer l’année » end every row not yet ended or refused.
for (const status of ['Submitted','Under Review','Trial','Confirmed','Validated']) assert.equal(isOpenEnrollment({status}),true,status);
for (const status of ['Ended','Rejected']) assert.equal(isOpenEnrollment({status}),false,status);
const student = {id:'s',status:'Enrolled',session_type:'Yearly',groupe_id:'yearly'};
const registrations = [{student_id:'s',status:'Validated',group_id:'yearly',session_type:'Yearly'},
  {student_id:'s',status:'Confirmed',group_id:null,session_type:'Adults'}];
assert.equal(studentNeedsGroup(student, registrations),true);
assert.equal(studentNeedsGroup(student, registrations,'Adults'),true);
assert.equal(studentNeedsGroup(student, registrations,'Yearly'),false);
assert.equal(studentNeedsGroup({...student,groupe_id:null},[]),true);
// A paid enrollment elsewhere is placed from its own row; an old unpaid
// pre-enrollment no longer holds an active file back; a former learner is never listed.
assert.equal(studentNeedsGroup({...student,groupe_id:null},[{student_id:'s',status:'Confirmed',group_id:null,session_type:'Adults'}],'Yearly'),false);
assert.equal(studentNeedsGroup({...student,groupe_id:null},[{student_id:'s',status:'Submitted',group_id:null}]),true);
assert.equal(studentNeedsGroup({...student,groupe_id:null,status:'Alumni'},[]),false);
assert.equal(studentNeedsGroup({...student,groupe_id:null,status:'Prospect'},[]),false);
registrations[1]={...registrations[1],status:'Validated',group_id:'adults'};
assert.equal(studentNeedsGroup(student, registrations),false);
assert.deepEqual([...groupMemberIds([student],registrations,'yearly')],['s']);
assert.deepEqual([...groupMemberIds([student],registrations,'adults')],['s']);
assert.deepEqual(studentGroupIds(student, registrations), ['yearly','adults'], 'main group first, then the second programme');
registrations[1]={...registrations[1],status:'Confirmed',group_id:null};
assert.equal(groupMemberIds([student],registrations,'adults').size,0);
// An ended enrollment is no membership; an archived learner is nobody's member.
assert.equal(groupMemberIds([student],[{student_id:'s',status:'Ended',group_id:null,ended_group_id:'adults'}],'adults').size,0);
assert.equal(groupMemberIds([{...student,deleted_at:'2026-10-01'}],registrations,'yearly').size,0);
assert.equal(groupMemberIds([], registrations, 'yearly').size, 0, 'only the learners passed in (RLS-visible) count');
// H8 (D-8): enrollment-only; a file group without a membership enrollment is nobody's roster.
assert.equal(groupMemberIds([{...student,groupe_id:'other'}],[],'other').size,0,'the file group alone is not a membership');
// School year: 1 September to 31 August on the centre clock (UTC+0, plan AFU-r1).
assert.equal(currentSchoolYear(new Date('2026-08-31T23:30:00Z')), '2025/2026', '23:30 on 31 August is still August');
assert.equal(currentSchoolYear(new Date('2026-09-01T00:00:00Z')), '2026/2027');
assert.equal(currentSchoolYear(new Date('2027-01-15T12:00:00Z')), '2026/2027');
assert.equal(currentSchoolYear(new Date('2027-07-10T12:00:00Z')), '2026/2027', 'July belongs to the ending year');
assert.match(currentSchoolYear(), /^\d{4}\/\d{4}$/);
assert.equal(groupYear('2026/2027'), '2026-2027');
// No screen of this release reads a pre-enrollment queue.
for (const file of ['src/app/(admin)/dashboard/page.jsx', 'src/lib/reportData.mjs', 'src/app/(admin)/students/page.jsx',
  'src/app/(admin)/students/[id]/page.jsx', 'src/components/students/EnrollmentModal.jsx']) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), /isPreEnrollment|isPendingPreEnrollment|PENDING_PRE_ENROLLMENT_STATUSES|'Submitted'|'Under Review'/, file);
}
console.log('PASS live enrollments, placement reporting, roster rule, import defaults and school year');
