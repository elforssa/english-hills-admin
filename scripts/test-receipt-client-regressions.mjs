import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStableIdempotencyKey } from '../src/lib/stableIdempotencyKey.mjs';
import { createInitialChargeCoordinator, createLatestRequestGate, emptyChargeTerms } from '../src/lib/receiptInitialCharge.mjs';
import { buildServiceDescription, receiptSchoolYear, receiptServiceSummary, paymentErrorMessage, PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE, PAYMENT_BUSY_MESSAGE, SCHOOL_YEAR_OPTIONS, DEFAULT_SCHOOL_YEAR } from '../src/lib/receiptPresentation.js';
import { groupMatchesEnrollment } from '../src/lib/academicPrograms.js';
import { deliverReceiptEmail } from '../supabase/functions/sendReceiptEmail/deliveryWorkflow.mjs';
import { receiptEmailDecision, receiptEmailRetryDecision } from '../supabase/functions/sendReceiptEmail/receiptState.mjs';
import { retryingImport } from '../src/lib/retryingImport.mjs';
import { PENDING_PAYMENT_STORAGE_KEY, clearPendingPayment, identicalReceiptPrompt, pendingPaymentSettled, readPendingPayment, recoverPendingPayment, savePendingPayment } from '../src/lib/receiptDraftKey.mjs';
import { PAYROLL_CREATION_ENABLED, PAYROLL_DISABLED_MESSAGE } from '../src/lib/payroll/status.mjs';

let generated = 0;
const stableKey = createStableIdempotencyKey(() => `request-${++generated}`);
assert.equal(stableKey(), 'request-1');
assert.equal(stableKey(), 'request-1');
assert.equal(generated, 1, 'an uncertain browser retry must reuse its request key');

assert.equal(SCHOOL_YEAR_OPTIONS.length, 3);
assert(SCHOOL_YEAR_OPTIONS.includes(DEFAULT_SCHOOL_YEAR));
// Formule retirement: the generated text is session and school year only; a stale plan argument is ignored.
assert.equal(buildServiceDescription({ sessionType: 'Yearly', schoolYear: '2026/2027' }), 'Yearly · 2026/2027');
assert.equal(buildServiceDescription({ sessionType: 'Yearly', planType: 'Standard', schoolYear: '2026/2027' }), 'Yearly · 2026/2027');
assert.equal(buildServiceDescription({ sessionType: 'Adults', schoolYear: '2026/2027' }), 'Adults · 2026/2027');
assert.equal(buildServiceDescription({ sessionType: 'Other', schoolYear: '2026/2027', serviceDetail: 'Examen Cambridge' }), 'Autre · Examen Cambridge · 2026/2027');
assert.equal(receiptSchoolYear({ school_year_snapshot: '2026/2027' }), '2026/2027');
assert.equal(receiptSchoolYear({ service_description: 'Legacy 2024 text only' }), '', 'historical text must not be parsed for a year');
assert.equal(receiptServiceSummary({ session_type: 'Yearly', plan_type: 'Standard', school_year_snapshot: '2026/2027' }), 'Yearly · 2026/2027');
assert.equal(receiptServiceSummary({ session_type: 'Yearly', plan_type: null, school_year_snapshot: '2026/2027' }), 'Yearly · 2026/2027');

// Owner decision Q7: every idempotency conflict shows the receptionist-facing French wording.
assert.equal(PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE, "Ce paiement a peut-être déjà été enregistré. Ne le saisissez pas une deuxième fois : ouvrez la liste des reçus de l'élève et vérifiez d'abord.");
for (const message of ['Idempotency key conflict: request contents changed.', 'Idempotency key conflict: this key belongs to another actor.',
  'Idempotency key conflict: selected enrollment changed.']) {
  assert.equal(paymentErrorMessage({ message }), PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE);
}
assert.equal(paymentErrorMessage({ message: 'Payment exceeds the remaining balance of 10.00 MAD.' }), 'Payment exceeds the remaining balance of 10.00 MAD.');
assert.equal(paymentErrorMessage({}), 'Impossible d’enregistrer le paiement.');
// Record conflicts (ADR-009): the known busy text stays as is under both codes; any other
// conflict gets the French busy guidance, never the raw server text.
const busy = 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.';
for (const code of ['PT409', '40001']) {
  assert.equal(paymentErrorMessage({ code, message: busy }), busy, code);
  assert.equal(paymentErrorMessage({ code, message: 'Student unavailable or stale' }), PAYMENT_BUSY_MESSAGE, code);
}
assert.equal(PAYMENT_BUSY_MESSAGE, 'Un paiement ou une inscription est en cours pour cet apprenant. Actualisez puis réessayez.');

const yearlyStudentInAdults = { session_type: 'Yearly', niveau_cefr: 'Child 1' };
const adultEnrollment = { session_type: 'Adults', level: 'Beginning 1' };
assert.equal(groupMatchesEnrollment({ session_type: 'Adults', niveau: 'Beginning 1' }, adultEnrollment, yearlyStudentInAdults), true);
assert.equal(groupMatchesEnrollment({ session_type: 'Yearly', niveau: 'Child 1' }, adultEnrollment, yearlyStudentInAdults), false);
assert.equal(groupMatchesEnrollment({ session_type: 'Adults', niveau: 'Intermediate 1' }, { session_type: 'Adults' }, yearlyStudentInAdults), true,
  'an unplaced paid enrollment should show all levels in its session');

const searchGate = createLatestRequestGate();
const staleSearch = searchGate.begin();
const currentSearch = searchGate.begin();
assert.equal(searchGate.isCurrent(staleSearch), false, 'older student-search responses must be ignored');
assert.equal(searchGate.isCurrent(currentSearch), true);
searchGate.invalidate();
assert.equal(searchGate.isCurrent(currentSearch), false, 'switching learner modes invalidates pending searches');

assert.deepEqual(receiptEmailDecision({ email: 'family@example.test', voided_at: '2026-09-15T00:00:00Z' }),
  { action: 'skip', reason: 'Receipt was voided before delivery', persistStatus: 'skipped' });
assert.deepEqual(receiptEmailDecision({ email: 'family@example.test', email_delivery_status: 'unknown' }),
  { action: 'skip', reason: 'Historical delivery status is unknown', preserveStatus: true });
assert.deepEqual(receiptEmailDecision({ email: 'family@example.test', email_delivery_status: 'queued' }),
  { action: 'send' });

// Integration-style delivery flow with a mutable mock database and provider:
// unknown -> webhook -> persisted state -> retry attempt -> repeated webhook.
let storedReceipt = { id: 'historical-1', email: 'family@example.test', email_delivery_status: 'unknown' };
let providerSends = 0;
let statusWrites = 0;
const dependencies = {
  loadReceipt: async () => ({ ...storedReceipt }),
  persistStatus: async (_id, status, error) => {
    statusWrites += 1;
    storedReceipt = { ...storedReceipt, email_delivery_status: status, email_last_error: error };
  },
  sendReceipt: async () => { providerSends += 1; return { id: 'provider-1' }; },
};
assert.equal((await deliverReceiptEmail(storedReceipt.id, dependencies)).status, 'skipped');
assert.equal(storedReceipt.email_delivery_status, 'unknown');
assert.equal(statusWrites, 0);

const uncertain = await deliverReceiptEmail('synthetic-queued', {
  loadReceipt: async () => ({ id: 'synthetic-queued', email: 'family@example.test', email_delivery_status: 'queued' }),
  sendReceipt: async () => ({ id: 'provider-accepted' }),
  persistStatus: async () => { throw new Error('database unavailable'); },
});
assert.equal(uncertain.status, 'unknown', 'provider success with failed status write is unknown');
const failedWrite = await deliverReceiptEmail('synthetic-queued', {
  loadReceipt: async () => ({ id: 'synthetic-queued', email: 'family@example.test', email_delivery_status: 'queued' }),
  sendReceipt: async () => { throw new Error('provider failed'); },
  persistStatus: async () => { throw new Error('database unavailable'); },
});
assert.equal(failedWrite.status, 'unknown', 'provider failure with failed status write is unknown');
const retryDecision = receiptEmailRetryDecision(storedReceipt);
assert.equal(retryDecision.allowed, false);
if (retryDecision.allowed) await deliverReceiptEmail(storedReceipt.id, dependencies);
assert.equal((await deliverReceiptEmail(storedReceipt.id, dependencies)).status, 'skipped');
assert.equal(storedReceipt.email_delivery_status, 'unknown');
assert.equal(providerSends, 0);
assert.equal(statusWrites, 0);

await assert.rejects(() => deliverReceiptEmail('lookup-failure', {
  ...dependencies,
  loadReceipt: async () => { throw new Error('database unavailable'); },
}));
assert.equal(storedReceipt.email_delivery_status, 'unknown', 'lookup errors must not rewrite unknown status');

// Deep-link coordination applies once, never overrides later choices, and
// discards stale responses from a previously selected student.
const intended = { id: 'charge-a', session_type: 'Adults' };
const alternate = { id: 'charge-b', session_type: 'Yearly' };
const coordinator = createInitialChargeCoordinator('student-a', 'charge-a');
coordinator.selectStudent('student-a', { fromInitialLink: true });
const initialLoad = coordinator.startChargeLoad('student-a');
assert.deepEqual(coordinator.resolveChargeLoad(initialLoad, [intended, alternate]), { status: 'apply', charge: intended });
coordinator.userSelectedCharge();
const refreshed = coordinator.startChargeLoad('student-a');
assert.deepEqual(coordinator.resolveChargeLoad(refreshed, [intended, alternate]), { status: 'ready' });
assert.deepEqual(emptyChargeTerms(), {
  charge_id: '', session_type: '', school_year: DEFAULT_SCHOOL_YEAR, service_detail: '',
  service_description: '',
  level: '', gross_amount: '', discount_amount: '', due_date: '', payment_amount: '',
});

const switching = createInitialChargeCoordinator('student-a', 'charge-a');
switching.selectStudent('student-a', { fromInitialLink: true });
const staleLoad = switching.startChargeLoad('student-a');
switching.selectStudent('student-b');
const currentLoad = switching.startChargeLoad('student-b');
assert.deepEqual(switching.resolveChargeLoad(staleLoad, [intended]), { status: 'stale' });
assert.deepEqual(switching.resolveChargeLoad(currentLoad, [alternate]), { status: 'ready' });

const missing = createInitialChargeCoordinator('student-a', 'settled-or-missing');
missing.selectStudent('student-a', { fromInitialLink: true });
assert.deepEqual(missing.resolveChargeLoad(missing.startChargeLoad('student-a'), []), { status: 'missing' });
assert.deepEqual(missing.resolveChargeLoad(missing.startChargeLoad('student-a'), [intended]), { status: 'ready' });

const receiptForm = await readFile(new URL('../src/components/receipts/ReceiptForm.jsx', import.meta.url), 'utf8');
assert.match(receiptForm, /useRef\(null\)/);
assert.match(receiptForm, /idempotency_key: idempotencyKey\.current\(\)/);
assert.doesNotMatch(receiptForm, /onSubmit\([^\n]+crypto\.randomUUID/);
assert.match(receiptForm, /startChargeLoad\(form\.student_id\)/);
assert.match(receiptForm, /resolveChargeLoad\(request, rows\)/);
assert.match(receiptForm, /initialCharge\.current\.userSelectedCharge\(\)/);
assert.match(receiptForm, /\.\.\.emptyChargeTerms\(\)/);
assert.match(receiptForm, /Rechercher un apprenant/);
assert.match(receiptForm, /Nouvel apprenant/);
assert.match(receiptForm, /SCHOOL_YEAR_OPTIONS/);
assert.match(receiptForm, /request_email/);
assert.doesNotMatch(receiptForm, /\[charges, form\.charge_id, initialData\.charge_id\]/);

const finance = await readFile(new URL('../src/lib/receiptFinance.js', import.meta.url), 'utf8');
const { receiptAmounts } = await import(`data:text/javascript,${encodeURIComponent(finance)}`);
assert.equal(receiptAmounts({ montant_paye: 125, voided_at: '2026-09-15T00:00:00Z' }).payment, 125,
  'a voided receipt must still display its original issued amount');

// Batch E, release E-1 (PCR-r2 P2.6, P4, P5, P6).
{
  const { BUSINESS_TIME_ZONE, businessMonthStart, financeExportRows, localBusinessDate, receiptNumberLabel, receiptStatus } = await import(`data:text/javascript,${encodeURIComponent(finance)}`);
  // Day boundaries: the zone name, never a fixed offset; boundaries proven with fixed-offset zones
  // so the test does not depend on the installed tzdata (Morocco is UTC+0 since 2026-09-20).
  assert.equal(BUSINESS_TIME_ZONE, 'Africa/Casablanca');
  assert.doesNotMatch(finance, /\+0[01]:00/);
  const lateNewYearsEve = new Date('2026-12-31T23:30:00Z');
  assert.equal(localBusinessDate(lateNewYearsEve, 'Etc/GMT-1'), '2027-01-01', 'UTC+1: already the next day');
  assert.equal(localBusinessDate(lateNewYearsEve, 'Etc/GMT'), '2026-12-31', 'UTC+0: still the same day');
  assert.equal(localBusinessDate(new Date('2026-10-01T00:30:00Z'), 'Etc/GMT+1'), '2026-09-30', 'UTC-1: still the previous day');
  assert.equal(businessMonthStart(new Date('2026-10-31T23:30:00Z'), 'Etc/GMT-1'), '2026-11-01');
  assert.equal(businessMonthStart(new Date('2026-10-31T23:30:00Z'), 'Etc/GMT'), '2026-10-01');

  // "En retard" compares with the business date it is given, not the UTC date.
  const due = { due_date: '2026-10-26', net_amount_snapshot: 100, paid_before_snapshot: 0, montant_paye: 10, balance_after_snapshot: 90 };
  assert.equal(receiptStatus(due, '2026-10-26'), 'Acompte versé');
  assert.equal(receiptStatus(due, '2026-10-27'), 'En retard');
  assert.equal(receiptStatus({ ...due, voided_at: '2026-10-27T00:00:00Z' }, '2026-10-27'), 'Annulé');

  assert.equal(receiptNumberLabel({ receipt_number: 'EH-2026-00425' }), 'EH-2026-00425');
  assert.equal(receiptNumberLabel({ receipt_number: null }), 'Reçu historique', 'historical receipts never print an empty number');

  // FIN-5: ordered by series then numeric suffix; cancelled rows stay with 0 received.
  const rows = financeExportRows([
    { id: 'u1', receipt_number: null, montant_paye: 300, date: '2026-09-10' },
    { id: 'h2', receipt_number: 'EH-HIST-2026-0002', montant_paye: 200, date: '2026-09-11' },
    { id: 'big', receipt_number: 'EH-2026-100000', montant_paye: 50, date: '2026-10-20' },
    { id: 'v', receipt_number: 'EH-2026-00425', montant_paye: 125, date: '2026-10-20', voided_at: '2026-10-21T10:00:00Z', void_reason: 'Erreur de saisie' },
    { id: 'm', receipt_number: 'EH-2026-99999', montant_paye: 75, date: '2026-10-20' },
    { id: 'd', receipt_number: 'EH-2026-00426', montant_paye: 40, date: '2026-10-20', deleted_at: '2026-10-22T10:00:00Z', voided_at: '2026-10-22T10:00:00Z', void_reason: 'Créé par erreur' },
    { id: 'h1', receipt_number: 'EH-HIST-2026-0001', montant_paye: 100, date: '2026-09-10' },
  ], '2026-10-26');
  assert.deepEqual(rows.map((row) => row['N° reçu']), ['EH-2026-00425', 'EH-2026-00426', 'EH-2026-99999', 'EH-2026-100000', 'EH-HIST-2026-0001', 'EH-HIST-2026-0002', '']);
  assert.equal(Object.keys(rows[0])[0], 'N° reçu', 'the receipt number is the first column');
  for (const column of ['Montant reçu', 'Montant annulé', 'Annulé le', "Motif d'annulation"]) assert.ok(column in rows[0], column);
  assert.deepEqual([rows[0]['Montant reçu'], rows[0]['Montant annulé'], rows[0]['Annulé le'], rows[0]["Motif d'annulation"], rows[0].Statut],
    [0, 125, '2026-10-21', 'Erreur de saisie', 'Annulé']);
  assert.deepEqual([rows[1]['Montant reçu'], rows[1]['Montant annulé']], [0, 40], 'a deleted receipt counts as cancelled');
  assert.deepEqual([rows[2]['Montant reçu'], rows[2]['Montant annulé'], rows[2]['Annulé le']], [75, 0, '']);
  assert.equal(rows.reduce((sum, row) => sum + row['Montant reçu'], 0), 725, 'summing « Montant reçu » gives true collections');
}

// FIN-13: the pending key survives a reload and is looked up before re-entry.
{
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  assert.equal(readPendingPayment({ storage }), null);
  assert.equal(savePendingPayment('key-1', { storage, now: 1000 }), true);
  assert.deepEqual(readPendingPayment({ storage }), { key: 'key-1', savedAt: 1000 });
  const recorded = await recoverPendingPayment(async (key) => (key === 'key-1' ? { id: 'r1', receipt_number: 'EH-2026-00430' } : null), { storage });
  assert.deepEqual(recorded, { status: 'recorded', receipt: { id: 'r1', receipt_number: 'EH-2026-00430' } });
  assert.equal(pendingPaymentSettled(recorded), true);
  assert.ok(readPendingPayment({ storage }), 'the caller, not the lookup, clears the key (React strict mode runs the effect twice)');
  clearPendingPayment({ storage });
  assert.deepEqual(await recoverPendingPayment(async () => { throw new Error('unreachable'); }, { storage }), { status: 'none' });
  savePendingPayment('key-2', { storage, now: 2000 });
  const notRecorded = await recoverPendingPayment(async () => null, { storage });
  assert.deepEqual(notRecorded, { status: 'not_recorded' });
  assert.equal(pendingPaymentSettled(notRecorded), true);
  const unknown = await recoverPendingPayment(async () => { throw new Error('network'); }, { storage });
  assert.deepEqual(unknown, { status: 'unknown' });
  assert.equal(pendingPaymentSettled(unknown), false, 'a failed lookup keeps the key for the next load');
  store.set(PENDING_PAYMENT_STORAGE_KEY, '{not json');
  assert.equal(readPendingPayment({ storage }), null);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(savePendingPayment('key-3', { storage: broken }), false, 'blocked storage never breaks the form');
  assert.equal(readPendingPayment({ storage: broken }), null);
  clearPendingPayment({ storage: broken });
  assert.match(identicalReceiptPrompt({ receipt_number: 'EH-2026-00430' }, { paymentDate: '2026-10-26', today: '2026-10-26' }),
    /^Un reçu identique existe déjà aujourd’hui pour cet apprenant, du même montant \(reçu N° EH-2026-00430\)\./);
  assert.match(identicalReceiptPrompt({}, { paymentDate: '2026-10-20', today: '2026-10-26' }), /existe déjà le 2026-10-20 /);

  assert.match(receiptForm, /recoverPendingPayment\(/);
  assert.match(receiptForm, /eq\('idempotency_key', key\)/);
  assert.match(receiptForm, /Ce paiement a déjà été enregistré : reçu N°/);
  assert.match(receiptForm, /if \(todayPayment > 0\) savePendingPayment\(idempotencyKey\.current\(\)\);\n\s+onSubmit\(/);
  assert.match(receiptForm, /window\.confirm\(identicalReceiptPrompt\(/);
  const newReceiptPage = await readFile(new URL('../src/app/(admin)/receipts/new/page.jsx', import.meta.url), 'utf8');
  assert.match(newReceiptPage, /return;\n\s+\}\n\s+clearPendingPayment\(\);/, 'the key is cleared only after a confirmed response');
}

// FIN-5/FIN-9/REL-7 wiring and the five form defaults on the Casablanca date.
{
  const financePage = await readFile(new URL('../src/app/(admin)/finance/page.jsx', import.meta.url), 'utf8');
  assert.match(financePage, /exportToCsv\(financeExportRows\(data\), `finance-\$\{localBusinessDate\(\)\}\.csv`\)/);
  const dashboard = await readFile(new URL('../src/app/(admin)/dashboard/page.jsx', import.meta.url), 'utf8');
  assert.match(dashboard, /const monthStart = businessMonthStart\(\);/);
  assert.doesNotMatch(dashboard, /toISOString/);
  assert.doesNotMatch(dashboard, /monthlyData\.encaisse \/ monthlyData\.total/, 'no rate mixing payments with charges');
  assert.match(dashboard, /Reste à encaisser \(tous engagements\)/);
  assert.match(dashboard, /total_restant/);
  const reports = await readFile(new URL('../src/app/(admin)/reports/page.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(reports, /restant: facture - encaisse/);
  assert.match(reports, /payrollByTeacher\.slice\(0, 12\)/);
  assert.match(reports, /data=\{payrollChart\}/);
  for (const path of ['components/placement/PlacementTestModal.jsx', 'components/students/EnrollmentModal.jsx', 'app/(admin)/certificates/page.jsx',
    'app/(admin)/learning-assessments/page.jsx', 'app/(admin)/parent-portal/page.jsx']) {
    const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/, path);
    assert.match(source, /localBusinessDate\(\)/, path);
  }
  for (const path of ['receipts/[id]/print', 'receipts/[id]/edit', 'receipts/[id]/delete']) {
    const page = await readFile(new URL(`../src/app/(admin)/${path}/page.jsx`, import.meta.url), 'utf8');
    assert.match(page, /receiptNumberLabel\(/, path);
  }
}

// Q9 interim stop: no payslip is created until the accountant validates the rules.
{
  assert.equal(PAYROLL_CREATION_ENABLED, false);
  assert.equal(PAYROLL_DISABLED_MESSAGE, 'Paie désactivée : barème à valider par le comptable.');
  const route = await readFile(new URL('../src/app/api/admin/payroll/route.js', import.meta.url), 'utf8');
  const forbidden = route.indexOf("{ status: 403 }");
  const stop = route.indexOf('{ error: PAYROLL_DISABLED_MESSAGE }, { status: 409 }');
  const insert = route.indexOf(".from('payroll').insert(");
  assert.ok(forbidden > 0 && stop > forbidden && insert > stop, 'the stop runs after the role check and before any write');
  const payrollPage = await readFile(new URL('../src/app/(admin)/payroll/page.jsx', import.meta.url), 'utf8');
  assert.match(payrollPage, /disabled=\{!PAYROLL_CREATION_ENABLED\}/);
  assert.match(payrollPage, /\{modal && PAYROLL_CREATION_ENABLED && <PayrollModal/);
}

const emailFunction = await readFile(new URL('../supabase/functions/sendReceiptEmail/index.ts', import.meta.url), 'utf8');
const currentLookup = emailFunction.indexOf('loadReceipt: loadCurrentReceipt');
const workflowCall = emailFunction.indexOf('deliverReceiptEmail(receiptId');
const providerSend = emailFunction.indexOf('new Resend(apiKey)');
assert.ok(workflowCall >= 0 && currentLookup > workflowCall && providerSend > currentLookup,
  'email delivery must route provider calls through the current-row workflow');
assert.doesNotMatch(emailFunction, /catch \(error\) \{ await track/);
assert.match(emailFunction, /idempotencyKey: `receipt\/\$\{receipt\.id\}`/);
assert.match(emailFunction, /school_year_snapshot/);
assert.doesNotMatch(emailFunction, /À déterminer/);

const receiptPdf = await readFile(new URL('../src/lib/receiptPdf.js', import.meta.url), 'utf8');
assert.match(receiptPdf, /fetch\('\/eh-logo\.png'\)/);
assert.match(receiptPdf, /format: RECEIPT_PAPER_FORMAT/);
assert.match(receiptPdf, /Montant payé aujourd’hui/);
assert.match(receiptPdf, /Solde restant/);
assert.match(receiptPdf, /doc\.text\(receiptNumberLabel\(receipt\), margin, y\)/);
assert.doesNotMatch(receiptPdf, /À déterminer/);

const migration = await readFile(new URL('../supabase/migrations/055_receipt_charge_payments.sql', import.meta.url), 'utf8');
assert.doesNotMatch(migration, /select id from auth\.users order by created_at limit 1/i);
assert.match(migration, /then r\.session_type else 'Legacy' end/);
assert.match(migration, /where s\.id = r\.student_id and s\.deleted_at is null/);
assert.match(migration, /update public\.receipts set email_delivery_status = 'unknown'/);
assert.match(migration, /request_fingerprint text not null/);
assert.match(migration, /v_existing\.actor_id is distinct from v_actor/);
assert.match(migration, /v_existing\.request_fingerprint is distinct from v_request_fingerprint/);

const schoolYearMigration = await readFile(new URL('../supabase/migrations/057_receipt_school_year_workflow.sql', import.meta.url), 'utf8');
assert.match(schoolYearMigration, /add column if not exists school_year text/);
assert.match(schoolYearMigration, /add column if not exists school_year_snapshot text/);
assert.match(schoolYearMigration, /'school_year',case when v_charge_id is null then v_school_year end/);
assert.match(schoolYearMigration, /case when v_request_email then 'pending' else 'skipped' end/);
assert.match(schoolYearMigration, /new\.email_delivery_status <> 'pending'/);

const receiptPage = await readFile(new URL('../src/app/(admin)/receipts/new/page.jsx', import.meta.url), 'utf8');
assert.match(receiptPage, /toast\.error\(paymentErrorMessage\(error\)\)/);

// On-demand jsPDF: a failed chunk is retried, then forgotten so a later click loads it
// again, and every caller reports a failure with the one French toast.
{
  let calls = 0, fail = 3;
  const chunk = retryingImport(async () => { calls++; if (fail-- > 0) throw Object.assign(new Error('Loading chunk 1 failed.'), { name: 'ChunkLoadError' }); return { default: 'jsPDF' }; }, [0, 0]);
  await assert.rejects(chunk.load(), { name: 'ChunkLoadError' });
  assert.equal(calls, 3, 'three attempts before giving up');
  assert.equal(chunk.value, undefined);
  assert.deepEqual(await chunk.load(), { default: 'jsPDF' }, 'a later load retries the failed chunk');
  assert.equal(calls, 4);
  assert.equal(await chunk.load(), chunk.value, 'a loaded chunk is kept');
  assert.equal(calls, 4);
}
assert.match(receiptPdf, /RECEIPT_PDF_ERROR = 'Impossible de préparer le PDF\. Vérifiez la connexion et réessayez\.'/);
assert.match(receiptPdf, /throw new Error\(RECEIPT_PDF_ERROR, \{ cause \}\)/);
assert.doesNotMatch(receiptPdf, /^import jsPDF/m, 'jsPDF stays out of the first load');
for (const [path, count] of [['receipts/[id]/print', 1], ['parent-portal', 2], ['student-portal', 2]]) {
  const page = await readFile(new URL(`../src/app/(admin)/${path}/page.jsx`, import.meta.url), 'utf8');
  assert.equal(page.match(/downloadReceiptPDF\(/g).length, count, `${path}: download callers`);
  assert.equal(page.match(/downloadReceiptPDF\(\w+\)\.catch\(showReceiptPdfError\)/g)?.length, count, `${path}: every download reports failure`);
}
for (const path of ['receipts/[id]/print', 'receipts']) {
  const page = await readFile(new URL(`../src/app/(admin)/${path}/page.jsx`, import.meta.url), 'utf8');
  assert.match(page, /if \(error\?\.message === RECEIPT_PDF_ERROR\) showReceiptPdfError\(\);/, `${path}: loader failure toast`);
}

console.log('receipt client/email regression tests passed');
