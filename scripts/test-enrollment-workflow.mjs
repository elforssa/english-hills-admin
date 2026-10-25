import assert from 'node:assert/strict';
import { isPreEnrollment, isPendingPreEnrollment, studentNeedsGroup, groupMemberIds, importedStudentStatus,
  ACTIVE_STUDENT_STATUSES, currentSchoolYear, groupYear, studentGroupIds } from '../src/lib/enrollmentWorkflow.mjs';
// D3-A (EGC): an imported file is a prospect until an enrollment confirms it.
assert.equal(importedStudentStatus(''), 'Prospect');
assert.equal(importedStudentStatus(undefined), 'Prospect');
assert.equal(importedStudentStatus('Enrolled'), 'Prospect');
assert.equal(importedStudentStatus('Trial'), 'Prospect');
assert.equal(importedStudentStatus('Alumni'), 'Alumni');
assert.equal(importedStudentStatus('Inactive'), 'Inactive');
assert.deepEqual(ACTIVE_STUDENT_STATUSES, ['Enrolled', 'Trial'], 'Ancien apprenant is not active');
for (const status of ['Confirmed','Validated','Ended']) assert.equal(isPreEnrollment({status}),false);
for (const status of ['Rejected','Trial','Confirmed','Validated','Ended']) assert.equal(isPendingPreEnrollment({status}),false);
for (const status of ['Submitted','Under Review']) assert.equal(isPendingPreEnrollment({status}),true);
const student = {id:'s',status:'Enrolled',session_type:'Yearly',groupe_id:'yearly'};
const registrations = [{student_id:'s',status:'Validated',group_id:'yearly',session_type:'Yearly'},
  {student_id:'s',status:'Confirmed',group_id:null,session_type:'Adults'}];
assert.equal(studentNeedsGroup(student, registrations),true);
assert.equal(studentNeedsGroup(student, registrations,'Adults'),true);
assert.equal(studentNeedsGroup(student, registrations,'Yearly'),false);
assert.equal(studentNeedsGroup({...student,groupe_id:null},[]),true);
// A pending pre-enrollment is not "Groupe à affecter"; a former learner neither.
assert.equal(studentNeedsGroup({...student,groupe_id:null},[{student_id:'s',status:'Submitted',group_id:null}]),false);
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
// School year: September start, Casablanca civil date; fixed-offset zones at the boundary.
assert.equal(currentSchoolYear(new Date('2026-08-31T23:30:00Z'), 'UTC'), '2025/2026');
assert.equal(currentSchoolYear(new Date('2026-08-31T23:30:00Z'), 'Etc/GMT-1'), '2026/2027', 'UTC+1 is already 1 September');
assert.equal(currentSchoolYear(new Date('2026-09-01T00:00:00Z'), 'UTC'), '2026/2027');
assert.equal(currentSchoolYear(new Date('2027-01-15T12:00:00Z'), 'UTC'), '2026/2027');
assert.equal(currentSchoolYear(new Date('2026-08-31T23:59:59Z'), 'Etc/GMT+1'), '2025/2026', 'UTC-1 is still 31 August');
assert.match(currentSchoolYear(), /^\d{4}\/\d{4}$/);
assert.equal(groupYear('2026/2027'), '2026-2027');
console.log('PASS enrollment queue, placement reporting, roster rule, import defaults and school year');
