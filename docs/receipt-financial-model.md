# Receipt financial model

## Model

- `charges` is the fee agreement: student, optional enrollment, catalog
  session, service/period, Yearly formula, optional level, gross price, fixed
  discount, and optional due date.
- `receipts` is both the individual payment and the issued receipt. One
  non-zero payment creates one immutable row with identity, service, amount,
  prior-paid, and balance snapshots. A zero-payment request creates only the
  charge.
- `financial_requests` provides request idempotency. Charge row locking and an
  advisory idempotency lock serialize concurrent payments.
- `financial_events` is the append-only audit trail for charge creation,
  payment recording, director-only payment/charge voids, and email retries.
- `charge_balances` is the canonical live balance calculation. Issued receipt
  snapshots never change when later installments are recorded.

Client roles cannot insert, update, or delete financial rows directly. Staff
use `create_charge_payment(jsonb)` and directors use
`void_financial_receipt(uuid,text,uuid)` or
`void_financial_charge(uuid,text,uuid)`. A charge with active payments can be
cancelled only after those payments have been voided individually.

## Legacy representation

Migration 055 creates one `legacy = true` charge per historical receipt with an
active student, preserving the receipt's known program classification. It
deliberately does not group similar receipts into guessed installments or infer
an actor/delivery result. Receipts whose student is missing or deleted remain
available in `legacy_receipt_reconciliation`; their cash remains in
receipt-based collected totals, but no charge is fabricated.

## Email delivery

The receipt insert queues the existing pg_net webhook. pg_net begins delivery
after transaction commit. Delivery is tracked as unknown (historical), pending,
queued, sent, failed, or skipped. Missing configuration is recorded as failed,
and staff can retry failed deliveries with `retry_receipt_email(uuid)`. The Edge
Function reloads the current receipt and skips a voided/deleted payment before
using the receipt ID as its stable Resend idempotency key. Local tests do not
configure webhook secrets and send no email.

## Photo-consent retirement

Migration 055 removes defaults, validation, and synchronization while retaining
historical column values. After an approved retention decision and verified
application rollout, the destructive physical cleanup can be run separately
from `supabase/manual/drop_photo_consent.sql`.

## Safe rollout

1. Review and test migration 055 against a production-like local backup using
   synthetic or properly approved anonymized data.
2. Deploy the application and migration together through the normal reviewed
   release process. Do not run `supabase db push --linked` without explicit
   production approval.
3. Verify staff payment, family visibility, finance aggregates, and webhook
   delivery tracking.
4. Reconcile rows exposed by `legacy_receipt_reconciliation` without guessing
   allocations.
5. Only in a later, separately approved maintenance window, consider the manual
   photo-consent column cleanup.
