import assert from 'node:assert/strict';
import { prepareSources, receiptPayload, reconcile, splitCents } from './lib/payment-tracking-sync.mjs';

assert.deepEqual(splitCents(1000, 3), [334, 333, 333]);
assert.deepEqual(splitCents(2, 3), [1, 1, 0]);

const csv = `Parent Name,Student Name,Student Age,PHONE,PAYE,RESTE,REMISE,MODE,DATE,LEVEL,NOTES
Family,One,7,0612345678,100,20,10,CASH,10.09.26,L2,
FAMILY,Two,13,,,,,,,L4,
Family,Three,18,,,,,,,L5,
`;
const prepared = prepareSources([{ key: 'annual', label: 'Annual payment tracking 2026', sessionType: 'Yearly', text: csv }]);
assert.equal(prepared.issues.length, 0);
assert.deepEqual(prepared.children.map(child => child.payment.paidCents), [3334, 3333, 3333]);
assert.deepEqual(prepared.children.map(child => child.payment.remainingCents), [667, 667, 666]);
assert.deepEqual(prepared.children.map(child => child.payment.discountCents), [334, 333, 333]);
assert.equal(prepared.children[0].phone, '212612345678');
assert.deepEqual(prepared.children.map(child => child.ageCategory), ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)']);

const existing = [{ id: 'one', full_name: 'One Family', telephone: null, session_type: 'Yearly', notes: null }];
const plan = reconcile(prepared, existing, []);
assert.equal(plan.matches.length, 1);
assert.equal(plan.newStudents.length, 2);
assert.equal(plan.moveToOther.length, 0);

const receipt = receiptPayload(prepared.children[0], 'one');
assert.equal(receipt.montant_total, 43.35);
assert.equal(receipt.montant_paye, 33.34);
assert.equal(receipt.remise, 7.7);
assert.equal(receipt.mode_paiement, 'Espèces');
assert.equal(receipt.date, '2026-09-10');

console.log('payment tracking sync tests passed');
