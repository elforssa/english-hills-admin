// REL-8 (plan SCG-r1): every finance command and every learner, enrollment, group,
// teacher or attendance save refreshes the cached screens that depend on it. A
// closed list of write calls (RPC names as quoted literals); every module that makes one must call a helper from
// src/lib/cacheInvalidation.mjs (or, for the receipt deletion, refresh everything).
// A new write call must be added here.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { FINANCE_KEYS, LEARNER_KEYS, invalidateAfterFinance, invalidateAfterLearnerSave } from '../src/lib/cacheInvalidation.mjs';

const FINANCE = ["'create_charge_payment'", "'void_financial_receipt'", "'void_financial_charge'", "'delete_mistaken_receipt'",
  "'retry_receipt_email'", 'Payroll.update(', 'Payroll.delete(', "'/api/admin/payroll'"];
const LEARNER = ["'save_receptionist_student'", "'save_receptionist_enrollment'", "'assign_receptionist_student_group'",
  "'save_receptionist_group'", "'soft_delete_student'", "'append_receptionist_enrollment_document'",
  "'save_receptionist_teacher_operations'", "'soft_delete_teacher'", "'save_attendance'", 'placeLearnerInGroup(',
  'removeLearnerFromGroup(', 'reopenEnrollment(', 'restoreStudent(', 'endLearner(', 'closeSchoolYear(',
  'createEnrollment(', 'saveEnrollmentChanges(', 'createStudentOnce(', 'Teacher.update(', 'Teacher.create(',
  "from('students').update", "from('enrollments').delete", "from('groups').update", "from('groups').insert",
  "from('groups').delete"];
// Libraries that only wrap a call; their callers are checked instead.
const LIBRARIES = new Set(['src/lib/academic/membershipActions.mjs', 'src/lib/studentCreate.mjs', 'src/lib/crm/queries.js',
  'src/lib/entities.js', 'src/lib/portal.js']);

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? files(`${dir}/${e.name}`) : /\.(m?js|jsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
let checks = 0;
const found = { finance: new Set(), learner: new Set() };
for (const file of files('src')) {
  if (LIBRARIES.has(file) || file.startsWith('src/app/api/')) continue;
  const text = readFileSync(file, 'utf8');
  // A quoted name is an RPC: only its call form counts (not a filter value or a longer name).
  const hits = list => list.filter(token => (token.startsWith("'") && !token.startsWith("'/")
    ? new RegExp(`rpc\\(\\s*${token}`).test(text) : text.includes(token)));
  const finance = hits(FINANCE);
  const learner = hits(LEARNER);
  if (finance.length) {
    found.finance.add(file);
    assert.ok(/invalidateAfterFinance\(/.test(text) || /invalidateQueries\(\)/.test(text),
      `${file} calls ${finance.join(', ')} without invalidateAfterFinance`);
    checks += 1;
  }
  if (learner.length) {
    found.learner.add(file);
    assert.ok(/invalidateAfterLearnerSave\(/.test(text), `${file} calls ${learner.join(', ')} without invalidateAfterLearnerSave`);
    checks += 1;
  }
}
// The list reaches the known screens (a renamed call would otherwise pass silently).
for (const file of ['src/app/(admin)/receipts/new/page.jsx', 'src/app/(admin)/receipts/[id]/edit/page.jsx',
  'src/app/(admin)/finance/charges/[id]/edit/page.jsx', 'src/app/(admin)/payroll/page.jsx']) assert.ok(found.finance.has(file), file);
for (const file of ['src/app/(admin)/students/page.jsx', 'src/app/(admin)/students/[id]/page.jsx', 'src/app/(admin)/enrollments/page.jsx',
  'src/app/(admin)/groups/page.jsx', 'src/app/(admin)/groups/[id]/page.jsx', 'src/app/(admin)/attendance/page.jsx',
  'src/app/(admin)/teacher-portal/page.jsx', 'src/components/students/ReceptionistStudentForm.jsx',
  'src/components/students/EnrollmentModal.jsx', 'src/components/students/StudentForm.jsx',
  'src/components/teachers/ReceptionistTeacherForm.jsx', 'src/components/teachers/TeacherForm.jsx']) assert.ok(found.learner.has(file), file);
// CRM commands refresh through useCrmRefresh, which covers learner and finance caches
// too; the enrollment start (a learner, an enrollment, a charge) uses it.
assert.match(readFileSync('src/lib/crm/queries.js', 'utf8'), /invalidateAfterLearnerSave\(client\), invalidateAfterFinance\(client\)/);
assert.match(readFileSync('src/components/crm/CrmEnrollmentDialog.jsx', 'utf8'), /useCrmRefresh\(\)/);

// The helpers refresh every dependent prefix.
const calls = [];
const client = { invalidateQueries: async ({ queryKey }) => { calls.push(queryKey); } };
await invalidateAfterFinance(client);
assert.deepEqual(calls.splice(0), FINANCE_KEYS.map(key => [key]));
await invalidateAfterLearnerSave(client);
assert.deepEqual(calls.splice(0), LEARNER_KEYS.map(key => [key]));
for (const key of ['Receipt', 'Student', 'Enrollment', 'report']) assert.ok(FINANCE_KEYS.includes(key));
for (const key of ['Student', 'Enrollment', 'Group', 'Attendance', 'report']) assert.ok(LEARNER_KEYS.includes(key));
console.log(`PASS cache refresh after every finance command and learner save (${checks} modules, ${found.finance.size} finance, ${found.learner.size} learner)`);
