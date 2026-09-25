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
const { ROLE_HOME, loginDestination, receptionistCanAccess } = await import('../src/lib/roleAccess.mjs');
for (const [role, home] of Object.entries(ROLE_HOME)) assert.equal(loginDestination(role), home);
assert.equal(loginDestination('pending', '/students'), '/unauthorized');
for (const path of ['/crm/today', '/crm/leads', '/students', '/enrollments', '/settings', '/placement-tests', '/students/00000000-0000-0000-0000-000000000001']) {
  assert.equal(receptionistCanAccess(path), true);
  assert.equal(loginDestination('receptionist', path), path);
}
for (const path of ['/finance', '/students/new', '/students/00000000-0000-0000-0000-000000000001/edit', '/settings/users', '/integrations', '//example.com', '/\\example.com']) {
  assert.equal(loginDestination('receptionist', path), '/crm/today');
}
console.log('PASS receptionist login destinations and exact operational route boundaries');
