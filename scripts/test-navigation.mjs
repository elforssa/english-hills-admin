import assert from 'node:assert/strict';
import { safeReturnTo, recordHref, listHref } from '../src/lib/navigation.mjs';

const collection = listHref('/students', { payment: 'due', status: 'all_shown', page: 3, q: 'Amal' });
assert.equal(collection, '/students?payment=due&status=all_shown&page=3&q=Amal');
assert.equal(safeReturnTo(collection), collection);
assert.equal(safeReturnTo('/receipts?q=Amal&page=3'), '/receipts?q=Amal&page=3');
assert.equal(safeReturnTo('/students/00000000-0000-4000-8000-000000000001'), '/students/00000000-0000-4000-8000-000000000001');
for (const unsafe of ['//other.example', '/settings', '/students/collections?payment=due', 'https://other.example', '/students\\evil', '/students/%5cevil']) {
  assert.equal(safeReturnTo(unsafe), '/students');
}
assert.equal(recordHref('/students/1', collection), `/students/1?returnTo=${encodeURIComponent(collection)}`);
assert.equal(listHref('/receipts', { q: '', page: 1 }), '/receipts');
const studentId = '00000000-0000-4000-8000-000000000001';
const receiptId = '00000000-0000-4000-8000-000000000002';
const originalList = '/students?status=all_shown&payment=due&page=3&q=Amal';
const profile = recordHref(`/students/${studentId}`, originalList);
const receipt = recordHref(`/receipts/${receiptId}/print`, profile);
assert.equal(safeReturnTo(new URL(receipt, 'https://english-hills.local').searchParams.get('returnTo')), profile);
assert.equal(safeReturnTo(new URL(profile, 'https://english-hills.local').searchParams.get('returnTo')), originalList);
for (const path of ['/attendance?term=Sept%E2%80%93D%C3%A9c', '/assessments?q=Amal', '/payroll', '/finance', '/groups?session=Yearly', `/groups/${studentId}?returnTo=%2Ftimetable%3Fterm%3DEt%C3%A9`, '/timetable?term=Et%C3%A9']) {
  assert.equal(safeReturnTo(path), path);
}
for (const unsafe of ['/students/%2e%2e/finance', '/groups/%2fetc', '/student-portal', '/students?returnTo=https%3A%2F%2Fevil.example', `/students/${studentId}?returnTo=%2Fsettings`]) {
  assert.equal(safeReturnTo(unsafe), '/students');
}
console.log('Navigation URL regressions passed');

// Role-aware login defaults cannot reopen an unauthorized receptionist page.
const { ROLE_HOME, loginDestination, receptionistCanAccess, hasCapability } = await import('../src/lib/roleAccess.mjs');
for (const [role, home] of Object.entries(ROLE_HOME)) assert.equal(loginDestination(role), home);
assert.equal(loginDestination('pending', '/students'), '/unauthorized');
for (const path of ['/crm/today', '/crm/leads', '/students', '/students-directory', '/students/new',
  '/enrollments', '/settings', '/placement-tests', '/groups', '/timetable', '/attendance',
  '/premium-sessions', '/assessments', '/receipts', '/receipts/new', '/teachers',
  '/students/00000000-0000-0000-0000-000000000001',
  '/students/00000000-0000-0000-0000-000000000001/edit',
  '/groups/00000000-0000-0000-0000-000000000001',
  '/teachers/00000000-0000-0000-0000-000000000001',
  '/teachers/00000000-0000-0000-0000-000000000001/edit',
  '/receipts/00000000-0000-0000-0000-000000000001/print']) {
  assert.equal(receptionistCanAccess(path), true);
  assert.equal(loginDestination('receptionist', path), path);
}
for (const path of ['/finance', '/students/import', '/students/00000000-0000-0000-0000-000000000001/delete',
  '/teachers/new', '/teachers/00000000-0000-0000-0000-000000000001/payroll', '/payroll',
  '/receipts/deletions', '/receipts/00000000-0000-0000-0000-000000000001/delete',
  '/settings/users', '/settings?tab=users', '/integrations', '/crm/analytics', '/crm/integrations/lifecycle',
  '/students/%2fetc', '/groups/not-a-uuid', '//example.com', '/\\example.com']) {
  assert.equal(loginDestination('receptionist', path), '/crm/leads');
}
for (const role of ['director', 'admin', 'receptionist']) {
  for (const capability of ['canManageStudents','canManageGroups','canManageFinanceOperations','canManageTeacherOperations'])
    assert.equal(hasCapability(role, capability), true);
}
for (const role of ['teacher','parent','student','pending',null]) {
  for (const capability of ['canManageStudents','canManageFinanceOperations','canManageTeacherOperations'])
    assert.equal(hasCapability(role, capability), false);
}
for (const capability of ['canViewFinanceAnalytics','canManageUsers','canManageSystemSettings',
  'canViewTeacherCompensation','canManagePayroll','canManageIntegrations','canCorrectFinance',
  'canImportStudents','canExportStudents','canEditStudentProgramme'])
  assert.equal(hasCapability('receptionist', capability), false);
for (const role of ['director', 'admin']) {
  for (const capability of ['canImportStudents', 'canExportStudents', 'canEditStudentProgramme'])
    assert.equal(hasCapability(role, capability), true);
}
assert.equal(hasCapability('director', 'canCorrectFinance'), true);
assert.equal(hasCapability('admin', 'canCorrectFinance'), false);
assert.equal(hasCapability('director', 'unknown'), false);
console.log('PASS receptionist login destinations and exact operational route boundaries');

assert.equal(safeReturnTo('/crm/leads?view=mine&layout=list&lead=00000000-0000-0000-0000-000000000001'), '/crm/leads?view=mine&layout=list&lead=00000000-0000-0000-0000-000000000001');
assert.equal(safeReturnTo('/crm/leads/anything'), '/students');
