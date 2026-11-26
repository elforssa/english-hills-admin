// Unit tests of the shared payment panel (RWR-r5 PR C1, plan §6.1, invariant 12): the
// default open balance, « Encaisser sur cet engagement », the amounts, every payment error at
// once (« La remise dépasse le prix »), « Réserver sans paiement », the duplicate rule mirror,
// the new refusal texts and the « Encaisser l’acompte » label; and source checks that both
// payment screens read get_open_balances and show the in-app duplicate panel.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COMMITMENT_CHOICE, DUPLICATE_REASON, PAYMENT_REQUIRED, balanceLine, defaultOpenBalance, duplicateLine, duplicateRule, fetchDuplicates, mad,
  paymentAmounts, paymentErrors, reservedElsewhere, reservedForProspect, selectableCommitments, unlinkedCommitments,
} from '../src/lib/finance/paymentPanel.mjs';
import { enrollmentFailure } from '../src/lib/crm/enrollmentErrors.mjs';
import { taskTitle } from '../src/lib/crm/presentation.mjs';

let count = 0;
const test = (name, fn) => { fn(); count += 1; };

// get_open_balances rows, oldest first.
const legacy = { id: 'l', session_type: 'Legacy', school_year: null, legacy: true, enrollment_id: null, net_amount: 900, paid_amount: 0, balance: 900 };
const reserved = { id: 'r', session_type: 'Yearly', school_year: '2026/2027', legacy: false, enrollment_id: null, reserved_lead_id: 'lead-1', net_amount: 3000, paid_amount: 0, balance: 3000 };
const unlinked = { id: 'u', session_type: 'Yearly', school_year: '2026/2027', legacy: false, enrollment_id: null, net_amount: 2800, paid_amount: 0, balance: 2800 };
const linked = { id: 'k', session_type: 'Adults', school_year: '2026/2027', legacy: false, enrollment_id: 'e', net_amount: 2500, paid_amount: 1000, balance: 1500 };

test('opens on the oldest open balance the screen can collect', () => {
  assert.equal(defaultOpenBalance([legacy, unlinked, linked]).id, 'l');
  assert.equal(defaultOpenBalance([reserved, linked]).id, 'k', 'a prospect’s reservation is collected from the CRM');
  assert.equal(defaultOpenBalance([]), null, 'no balance: « Nouvelle inscription »');
  assert.equal(defaultOpenBalance([{ ...linked, balance: 0 }]), null);
  assert.equal(reservedForProspect(reserved), true);
  assert.equal(reservedForProspect(unlinked), false);
});

test('« Encaisser sur cet engagement » lists unlinked commitments of the same programme and year', () => {
  const rows = [legacy, reserved, unlinked, linked];
  assert.deepEqual(unlinkedCommitments(rows, { sessionType: 'Yearly', schoolYear: '2026/2027' }).map(r => r.id), ['r', 'u']);
  assert.deepEqual(unlinkedCommitments(rows, { sessionType: 'Yearly', schoolYear: '2027/2028' }), []);
  assert.deepEqual(unlinkedCommitments(rows, { sessionType: 'Adults', schoolYear: '2026/2027' }), [], 'a linked charge is not a commitment');
  assert.deepEqual(unlinkedCommitments(rows, { sessionType: 'Legacy', schoolYear: '' }), [], 'legacy never blocks or offers');
});

test('the wizard selects only its own prospect’s reservation (PR #216 review, B2)', () => {
  const rows = unlinkedCommitments([legacy, reserved, unlinked, linked], { sessionType: 'Yearly', schoolYear: '2026/2027' });
  assert.equal(reservedElsewhere(reserved, 'lead-2'), true, 'another prospect’s reservation');
  assert.equal(reservedElsewhere(reserved, 'lead-1'), false, 'this prospect’s own reservation');
  assert.equal(reservedElsewhere(unlinked, 'lead-2'), false);
  assert.equal(reservedElsewhere(reserved, null), true, '« Encaisser » (no prospect) never collects a reservation');
  assert.deepEqual(selectableCommitments(rows, 'lead-2').map(r => r.id), ['u'], 'shown with « Ouvrir le prospect », not selectable');
  assert.deepEqual(selectableCommitments(rows, 'lead-1').map(r => r.id), ['r', 'u']);
  assert.deepEqual(selectableCommitments([reserved], 'lead-2'), [], 'nothing to select: the staff chooses « Nouvelle session » or opens the prospect');
  assert.match(COMMITMENT_CHOICE, /« Nouvelle session »/);
});

test('amounts: price − discount − payments (invariant 12)', () => {
  assert.deepEqual(paymentAmounts({ charge: linked, payment: 500 }), { net: 2500, paidBefore: 1000, today: 500, open: 1500, balanceAfter: 1000 });
  assert.deepEqual(paymentAmounts({ gross: '3000', discount: '250.5', payment: '1000' }), { net: 2749.5, paidBefore: 0, today: 1000, open: 2749.5, balanceAfter: 1749.5 });
  assert.equal(paymentAmounts({ gross: 100, discount: 200 }).net, 0, 'never negative');
  assert.equal(paymentAmounts({ gross: 0.1, discount: 0, payment: 0.3 }).balanceAfter, 0);
});

test('every payment error at once, « La remise dépasse le prix » before submit', () => {
  const errors = paymentErrors({ gross: '1000', discount: '1500', reasonCode: '', payment: '0', paymentMethod: 'Espèces' });
  assert.deepEqual(errors, ['La remise dépasse le prix.', 'Indiquez le motif de la remise.', PAYMENT_REQUIRED]);
  assert.deepEqual(paymentErrors({ gross: '', discount: '', payment: '' }), ['Indiquez le prix brut convenu.', PAYMENT_REQUIRED]);
  assert.deepEqual(paymentErrors({ gross: '1000', discount: '0', payment: '1200', paymentMethod: 'Espèces' }).length, 1);
  assert.equal(paymentErrors({ gross: '1000', discount: '0', payment: '1200', paymentMethod: 'Espèces' })[0], `Le paiement dépasse le prix net de ${mad(1000)}.`);
  assert.deepEqual(paymentErrors({ newCharge: false, payment: '2000', open: 1500, paymentMethod: 'Espèces' }).length, 1);
  assert.match(paymentErrors({ newCharge: false, payment: '2000', open: 1500, paymentMethod: 'Espèces' })[0], /^Le paiement dépasse le solde de /);
  assert.deepEqual(paymentErrors({ gross: '1000', discount: '1000', reasonCode: 'sibling', payment: '0' }), [], '100 % with its reason confirms');
  assert.deepEqual(paymentErrors({ gross: '1000', discount: '200', reasonCode: 'other', reasonText: 'x', payment: '100', paymentMethod: 'Espèces' }),
    ['Précisez le motif de la remise « Autre ».']);
  assert.deepEqual(paymentErrors({ gross: '1000', payment: '-1' }), ['Le paiement ne peut pas être négatif.']);
  assert.deepEqual(paymentErrors({ gross: '1000', payment: '100', paymentMethod: '' }), ['Choisissez le mode de paiement.']);
  assert.deepEqual(paymentErrors({ newCharge: false, payment: '100', open: 1500, paymentMethod: 'Espèces' }), [], 'a commitment needs no price');
});

test('« Réserver sans paiement » (OD-2 = A): a price and a due date, no payment', () => {
  const today = '2026-11-25';
  assert.deepEqual(paymentErrors({ mode: 'reserve', gross: '3000', discount: '0', dueDate: '2026-12-01', today }), []);
  assert.deepEqual(paymentErrors({ mode: 'reserve', gross: '3000', discount: '0', dueDate: '', today }), ['Indiquez la date d’échéance de l’acompte.']);
  assert.deepEqual(paymentErrors({ mode: 'reserve', gross: '3000', discount: '0', dueDate: '2026-11-24', today }), ['L’échéance ne peut pas être dans le passé.']);
  assert.deepEqual(paymentErrors({ mode: 'reserve', gross: '3000', discount: '3000', reasonCode: 'sibling', dueDate: today, today }),
    ['Une remise de 100 % confirme l’inscription : utilisez « Inscrire et encaisser ».']);
  assert.deepEqual(paymentErrors({ mode: 'reserve', gross: '0', dueDate: today, today }), ['Indiquez un prix supérieur à zéro pour réserver.']);
});

test('duplicate rule mirror (§6.1): same charge, or mine within 2 minutes', () => {
  const now = Date.parse('2026-11-25T10:00:00Z');
  const base = { student_id: 's', charge_id: 'c', montant_paye: 500, date: '2026-11-25', actor_id: 'other', created_at: '2026-11-25T08:00:00Z' };
  const ctx = { studentId: 's', chargeId: 'c', amount: 500, date: '2026-11-25', actorId: 'me', now };
  assert.equal(duplicateRule(base, ctx), 'same_charge');
  assert.equal(duplicateRule({ ...base, montant_paye: 400 }, ctx), null, 'an equal instalment on another amount is not flagged');
  assert.equal(duplicateRule({ ...base, date: '2026-11-24' }, ctx), null, 'another day is not flagged');
  assert.equal(duplicateRule({ ...base, charge_id: 'd' }, ctx), null, 'another charge is not flagged');
  assert.equal(duplicateRule({ ...base, charge_id: 'd', actor_id: 'me', created_at: '2026-11-25T09:58:30Z' }, ctx), 'recent_by_you');
  assert.equal(duplicateRule({ ...base, charge_id: 'd', actor_id: 'me', created_at: '2026-11-25T09:57:00Z' }, ctx), null, 'outside 2 minutes');
  assert.equal(duplicateRule({ ...base, voided_at: 'x' }, ctx), null, 'a voided receipt is not a duplicate');
  assert.equal(duplicateRule({ ...base, student_id: 't' }, ctx), null);
  assert.ok(DUPLICATE_REASON.same_charge && DUPLICATE_REASON.recent_by_you);
  assert.equal(duplicateLine({ receipt_number: 'EH-2026-00430', date: '2026-11-25', amount: 500, service_description: 'Yearly · 2026/2027' }),
    'Reçu N° EH-2026-00430 · 25/11/2026 · 500 MAD · Yearly · 2026/2027');
  assert.match(balanceLine(legacy), /^Ancien solde · reste 900 MAD$/);
  assert.equal(mad(1500.5), `${new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1500.5)} MAD`, 'as receiptFinance.money');
  assert.equal(mad(500), '500 MAD');
});

test('new refusals map to French texts and recoveries', () => {
  const failure = hint => enrollmentFailure({ code: '22023', message: 'x', hint });
  assert.equal(failure('eap.unlinked_commitment_exists').recovery, 'balances');
  assert.match(failure('eap.unlinked_commitment_exists').message, /encaissez sur cet engagement, ou choisissez « Nouvelle session »/);
  assert.equal(failure('eap.commitment_unavailable').step, 3);
  assert.equal(failure('eap.reservation_due_required').field, 'dueDate');
  assert.equal(failure('eap.reservation_free').field, 'discount');
  assert.equal(failure('eap.reservation_already_enrolled').step, 2);
  for (const hint of ['eap.reservation_price_required', 'eap.reservation_due_invalid']) assert.doesNotMatch(failure(hint).message, /[A-Z][a-z]+ [a-z]+ required/);
});

test('« Encaisser l’acompte » is the server label, never read from the instruction text', () => {
  assert.equal(taskTitle({ task_type: 'enrollment_followup', instructions: 'Encaisser l’acompte' }), 'Finaliser l’inscription');
  assert.equal(taskTitle({ task_type: 'enrollment_followup', instructions: 'Finaliser l’inscription avec le contact.' }), 'Finaliser l’inscription');
});

// fetchDuplicates never blocks: an error or a throw is « no duplicate ».
const calls = [];
assert.deepEqual(await fetchDuplicates({ rpc: async (n, a) => { calls.push([n, a]); return { data: [{ id: 'x' }], error: null }; } },
  { studentId: 's', chargeId: '', amount: '500', date: '2026-11-25' }), [{ id: 'x' }]);
assert.deepEqual(calls[0], ['find_duplicate_receipts', { p_student: 's', p_charge: null, p_amount: 500, p_date: '2026-11-25' }]);
assert.deepEqual(await fetchDuplicates({ rpc: async () => ({ data: null, error: { code: '42501' } }) }, { studentId: 's', amount: 1, date: 'd' }), []);
assert.deepEqual(await fetchDuplicates({ rpc: async () => { throw new Error('offline'); } }, { studentId: 's', amount: 1, date: 'd' }), []);
assert.deepEqual(await fetchDuplicates({ rpc: async () => { throw new Error('not called'); } }, { studentId: '', amount: 1, date: 'd' }), []);
count += 1;

// Both screens: one read, one panel (invariant 12; §6.1).
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [receiptForm, wizard, list, voidPage, intake] = await Promise.all([read('src/components/receipts/ReceiptForm.jsx'),
  read('src/components/crm/CrmEnrollmentDialog.jsx'), read('src/app/(admin)/receipts/page.jsx'), read('src/app/(admin)/receipts/[id]/edit/page.jsx'),
  read('src/components/crm/CrmIntakeReview.jsx')]);
for (const [name, source] of [['ReceiptForm', receiptForm], ['CrmEnrollmentDialog', wizard]]) {
  assert.match(source, /rpc\('get_open_balances', \{ p_student: form\.student(_id|\.id) \}\)/, `${name} reads get_open_balances`);
  assert.match(source, /<DuplicateReceiptPanel /, `${name} shows the duplicate panel`);
  assert.match(source, /fetchDuplicates\(getBrowserClient\(\)/, `${name} runs the §6.1 check`);
  assert.doesNotMatch(source, /window\.confirm/, `${name} has no browser dialog`);
}
assert.match(receiptForm, /defaultOpenBalance\(rows\)/, 'Encaisser opens on the oldest open balance');
assert.match(wizard, /crm_reserve_without_payment/, 'the wizard offers « Réserver sans paiement »');
assert.match(wizard, /charge_id: f\.charge/, '« Encaisser sur cet engagement » sends the commitment');
assert.match(wizard, /new_session: true/, '« Nouvelle session » is explicit');
assert.match(wizard, /if \(!candidates\.data\?\.total && !birthIssue\) setStep\(2\)/, 'one click for a new learner without matches');
assert.match(wizard, /getLevelsForSession\(next\)\.includes\(context\.recommended_level\)/, 'the test level is re-filled');
assert.doesNotMatch(wizard, /function paymentIssue\(/, 'no first-error-only check');
assert.match(list, /Avec solde/);
assert.match(list, /charge_balances!receipts_charge_id_fkey!inner\(balance\)/);
assert.doesNotMatch(list, /receiptServiceSummary/, 'no repeated session and service');
assert.doesNotMatch(voidPage, /p_idempotency_key: crypto\.randomUUID\(\)/, 'the void page keeps one key per opening');
assert.match(voidPage, /sending\.current/);
assert.doesNotMatch(intake, /p_request: crypto\.randomUUID\(\)/, 'intake review keeps one key per opened item');
assert.match(intake, /retryKey\(request\.current, 'crm_resolve_external_intake', args\)/);
count += 1;

console.log(`Payment panel (RWR-r5 C1): ${count} groups passed.`);
