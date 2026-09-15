import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStableIdempotencyKey } from '../src/lib/stableIdempotencyKey.mjs';
import { createInitialChargeCoordinator, emptyChargeTerms } from '../src/lib/receiptInitialCharge.mjs';
import { deliverReceiptEmail } from '../supabase/functions/sendReceiptEmail/deliveryWorkflow.mjs';
import { receiptEmailDecision, receiptEmailRetryDecision } from '../supabase/functions/sendReceiptEmail/receiptState.mjs';

let generated = 0;
const stableKey = createStableIdempotencyKey(() => `request-${++generated}`);
assert.equal(stableKey(), 'request-1');
assert.equal(stableKey(), 'request-1');
assert.equal(generated, 1, 'an uncertain browser retry must reuse its request key');

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
  charge_id: '', session_type: '', service_description: '', plan_type: 'Standard',
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
assert.doesNotMatch(receiptForm, /\[charges, form\.charge_id, initialData\.charge_id\]/);

const finance = await readFile(new URL('../src/lib/receiptFinance.js', import.meta.url), 'utf8');
const { receiptAmounts } = await import(`data:text/javascript,${encodeURIComponent(finance)}`);
assert.equal(receiptAmounts({ montant_paye: 125, voided_at: '2026-09-15T00:00:00Z' }).payment, 125,
  'a voided receipt must still display its original issued amount');

const emailFunction = await readFile(new URL('../supabase/functions/sendReceiptEmail/index.ts', import.meta.url), 'utf8');
const currentLookup = emailFunction.indexOf('loadReceipt: loadCurrentReceipt');
const workflowCall = emailFunction.indexOf('deliverReceiptEmail(receiptId');
const providerSend = emailFunction.indexOf('new Resend(apiKey)');
assert.ok(workflowCall >= 0 && currentLookup > workflowCall && providerSend > currentLookup,
  'email delivery must route provider calls through the current-row workflow');
assert.doesNotMatch(emailFunction, /catch \(error\) \{ await track/);
assert.match(emailFunction, /idempotencyKey: `receipt\/\$\{receipt\.id\}`/);

const migration = await readFile(new URL('../supabase/migrations/055_receipt_charge_payments.sql', import.meta.url), 'utf8');
assert.doesNotMatch(migration, /select id from auth\.users order by created_at limit 1/i);
assert.match(migration, /then r\.session_type else 'Legacy' end/);
assert.match(migration, /where s\.id = r\.student_id and s\.deleted_at is null/);
assert.match(migration, /update public\.receipts set email_delivery_status = 'unknown'/);
assert.match(migration, /request_fingerprint text not null/);
assert.match(migration, /v_existing\.actor_id is distinct from v_actor/);
assert.match(migration, /v_existing\.request_fingerprint is distinct from v_request_fingerprint/);

const receiptPage = await readFile(new URL('../src/app/(admin)/receipts/new/page.jsx', import.meta.url), 'utf8');
assert.match(receiptPage, /Idempotency key conflict/);
assert.match(receiptPage, /éviter un double paiement/);

console.log('receipt client/email regression tests passed');
