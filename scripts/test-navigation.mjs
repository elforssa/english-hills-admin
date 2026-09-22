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
console.log('Navigation URL regressions passed');
