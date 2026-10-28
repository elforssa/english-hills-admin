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
// Per call site: within the next WINDOW lines after a write call, a helper call or a
// delegate that refreshes. Delegates defined in the same module must themselves call a
// helper; a callback prop (onSave, onDone, onRestored) is refreshed by its caller,
// which this scan checks as a call site of the same write.
const WINDOW = 25;
const HELPER = { finance: /invalidateAfterFinance\(|invalidateQueries\(\)/, learner: /invalidateAfterLearnerSave\(/ };
const DELEGATES = ['refreshMemberships(', 'refreshAfterSave(', 'invalidate()', 'onSave(', 'onDone(', 'onRestored('];
// Writes whose refresh happens in a different function, with the reason.
const INDIRECT = {
  "src/app/(admin)/attendance/page.jsx 'save_attendance'": 'saveRow runs inside the session manager; handleSave refreshes after save()',
  "src/app/(admin)/teacher-portal/page.jsx 'save_attendance'": 'saveRow runs inside the session manager; handleSave refreshes after save()',
  'src/components/students/EnrollmentModal.jsx *': 'the management writes run inside saveAsManagement(); the submit handler refreshes once it returns',
};
let checks = 0;
const found = { finance: new Set(), learner: new Set() };
for (const file of files('src')) {
  if (LIBRARIES.has(file) || file.startsWith('src/app/api/')) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (const [kind, list] of [['finance', FINANCE], ['learner', LEARNER]]) {
    for (const token of list) {
      // A quoted name is an RPC: only its call form counts (not a filter value or a longer name).
      const pattern = token.startsWith("'") && !token.startsWith("'/")
        ? new RegExp(`rpc\\(\\s*${token}`) : { test: line => line.includes(token) };
      lines.forEach((line, index) => {
        if (!pattern.test(line)) return;
        found[kind].add(file);
        const reason = INDIRECT[`${file} ${token}`] || INDIRECT[`${file} *`];
        if (reason) {
          assert.ok(HELPER[kind].test(text), `${file}: ${reason}`);
          checks += 1;
          return;
        }
        const window = lines.slice(index, index + WINDOW).join('\n');
        const delegate = DELEGATES.find(d => window.includes(d));
        const refreshed = HELPER[kind].test(window) || (delegate && (['onSave(', 'onDone(', 'onRestored('].includes(delegate)
          || new RegExp(`const ${delegate.replace(/[()]/g, '')} = [^;]*${HELPER[kind].source}`).test(text.replace(/\n/g, ' '))));
        assert.ok(refreshed, `${file}:${index + 1} ${token.trim()} is not followed by a ${kind} cache refresh`);
        checks += 1;
      });
    }
  }
}
// onSave / onDone / onRestored callers refresh: every such prop handler next to a
// write-making component calls a helper.
for (const [file, component] of [['src/app/(admin)/students/page.jsx', 'DossierGroupPlacement'], ['src/app/(admin)/students/page.jsx', 'EnrollmentModal'],
  ['src/app/(admin)/students/page.jsx', 'ArchivedStudentsDialog'], ['src/app/(admin)/students/[id]/page.jsx', 'LeaverDialog'],
  ['src/app/(admin)/students/[id]/page.jsx', 'EnrollmentModal'], ['src/app/(admin)/enrollments/page.jsx', 'EnrollmentModal'],
  ['src/app/(admin)/enrollments/page.jsx', 'YearCloseDialog'], ['src/app/(admin)/groups/page.jsx', 'GroupModal'], ['src/app/(admin)/payroll/page.jsx', 'PayrollModal']]) {
  const text = readFileSync(file, 'utf8');
  const uses = [...text.matchAll(new RegExp(`<${component}\\b[\\s\\S]*?/>`, 'g'))].map(m => m[0]);
  if (!uses.length && component === 'PayrollModal') continue;
  assert.ok(uses.length, `${file}: <${component}> not found`);
  for (const use of uses) {
    const handler = use.match(/on(Save|Done|Restored)=\{[\s\S]*?\}\s*(?=\w+=|\/>)/)?.[0] || '';
    assert.ok(/invalidateAfterLearnerSave\(|invalidateAfterFinance\(|refreshAfterSave\(|invalidate\(\)|load\(\)/.test(handler), `${file}: <${component}> callback does not refresh: ${handler}`);
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
console.log(`PASS cache refresh after every finance command and learner save (${checks} call sites and callbacks; ${found.finance.size} finance, ${found.learner.size} learner modules)`);
