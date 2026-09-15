import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStableIdempotencyKey } from '../src/lib/stableIdempotencyKey.mjs';
import { receiptEmailDecision } from '../supabase/functions/sendReceiptEmail/receiptState.mjs';

let generated = 0;
const stableKey = createStableIdempotencyKey(() => `request-${++generated}`);
assert.equal(stableKey(), 'request-1');
assert.equal(stableKey(), 'request-1');
assert.equal(generated, 1, 'an uncertain browser retry must reuse its request key');

assert.deepEqual(receiptEmailDecision({ email: 'family@example.test', voided_at: '2026-09-15T00:00:00Z' }),
  { action: 'skip', reason: 'Receipt was voided before delivery' });
assert.deepEqual(receiptEmailDecision({ email: 'family@example.test', email_delivery_status: 'unknown' }),
  { action: 'skip', reason: 'Historical delivery status is unknown' });
assert.deepEqual(receiptEmailDecision({ email: 'family@example.test', email_delivery_status: 'queued' }),
  { action: 'send' });

const receiptForm = await readFile(new URL('../src/components/receipts/ReceiptForm.jsx', import.meta.url), 'utf8');
assert.match(receiptForm, /useRef\(null\)/);
assert.match(receiptForm, /idempotency_key: idempotencyKey\.current\(\)/);
assert.doesNotMatch(receiptForm, /onSubmit\([^\n]+crypto\.randomUUID/);

const finance = await readFile(new URL('../src/lib/receiptFinance.js', import.meta.url), 'utf8');
const { receiptAmounts } = await import(`data:text/javascript,${encodeURIComponent(finance)}`);
assert.equal(receiptAmounts({ montant_paye: 125, voided_at: '2026-09-15T00:00:00Z' }).payment, 125,
  'a voided receipt must still display its original issued amount');

const emailFunction = await readFile(new URL('../supabase/functions/sendReceiptEmail/index.ts', import.meta.url), 'utf8');
const currentLookup = emailFunction.indexOf('receipt = await loadCurrentReceipt(receiptId)');
const voidCheck = emailFunction.indexOf('receiptEmailDecision(receipt)');
const providerSend = emailFunction.indexOf('new Resend(apiKey)');
assert.ok(currentLookup >= 0 && voidCheck > currentLookup && providerSend > voidCheck,
  'email delivery must re-read current state and reject a void before calling the provider');
assert.match(emailFunction, /track\(receiptId, 'failed', 'RESEND_API_KEY is not configured'\)/);
assert.match(emailFunction, /idempotencyKey: `receipt\/\$\{receipt\.id\}`/);

const migration = await readFile(new URL('../supabase/migrations/055_receipt_charge_payments.sql', import.meta.url), 'utf8');
assert.doesNotMatch(migration, /select id from auth\.users order by created_at limit 1/i);
assert.match(migration, /then r\.session_type else 'Legacy' end/);
assert.match(migration, /where s\.id = r\.student_id and s\.deleted_at is null/);
assert.match(migration, /update public\.receipts set email_delivery_status = 'unknown'/);

console.log('receipt client/email regression tests passed');
