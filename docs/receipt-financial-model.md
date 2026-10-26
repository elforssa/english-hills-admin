# Receipt financial model

## Model

- `charges` is the fee agreement: student, optional enrollment, catalog
  session, service/period, optional level, gross price, fixed discount, and
  optional due date. Its `plan_type` column is inert since migration 113 (see
  [Formule retirement](#formule-retirement-113-current-contract)).
- `receipts` is both the individual payment and the issued receipt. One
  non-zero payment creates one immutable row with identity, service, amount,
  prior-paid, and balance snapshots. A zero-payment request creates only the
  charge.
- `financial_requests` binds each idempotency key to its actor and a SHA-256
  fingerprint of normalized transaction inputs. Exact retries replay; changing
  a student, charge, amount, contact update, or other meaningful input is an
  explicit conflict. Charge row locking and an advisory idempotency lock
  serialize concurrent payments.
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
using the receipt ID as its stable Resend idempotency key. Historical `unknown`
status is never rewritten by webhook, lookup-error, or retry paths. Local tests
do not configure webhook secrets and send no email.

## Historical migration development status

At the original feature-branch review, migration 055 was unreleased and absent
from main, so fixes were made there. That is historical context only: 055 is
now on main and must not be edited as an unreleased migration. Consult
[CURRENT_STATE](ai/CURRENT_STATE.md) for deployment evidence. `scripts/test-receipt-migration-rehearsal.sh` requires the
explicit `--confirm-disposable-local` flag, resets local Supabase through 054,
loads synthetic historical fixtures, applies 055, verifies the migrated data
and a later installment, and restores the complete local schema on exit.

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

### Archived-student reconciliation (migration 056)

Migration 055 skipped legacy receipts whose existing student was archived. Migration
056 creates a separate legacy charge for each of these explicitly linked receipts;
it does not combine installments or reactivate students. Deleted or voided receipts
produce inactive historical charges. Original payment fields and delivery/audit
history are preserved, and updating the links does not send receipt emails.

Run `python3 scripts/test-archived-receipt-reconciliation.py` against local Supabase
for synthetic rollback-only tests of reconciliation, totals, cancellation, unchanged
student/receipt history, and repeat execution. Migration 055 remains unchanged after
release. Backup configuration and a real recipient-approved email delivery test are
separate operational checks; successful reconciliation does not establish either.

### School-year workflow (057; historical implementation record)

New agreements store the selected school year (UI catalogue: 2026/2027). Receipts
snapshot that year; existing agreements without a known year remain undated.
The security-invoker balance view appends school_year without reordering existing
columns. ~~Yearly requires an explicit Standard/Premium formula; other sessions
cannot use Premium.~~ *(Retired by migration 113; see below.)* Email delivery is opt-in; an unrequested recipient is ignored
in both request normalization and receipt creation.

Client receipts use one A5 portrait page. Internal notes and cancellation reasons
remain stored and visible to staff outside the printable document; they are absent
from PDFs and email. Voided documents retain their cancellation status. The print
action opens the same PDF in the native viewer; choose A5 and actual size (100%).
It does not call into an embedded viewer, which browsers isolate across origins.

Independent local review: synthetic 056-to-057 upgrade assertions ran inside a
rollback-only transaction without resetting local data; migration 057 was then
applied locally. Financial/RLS, concurrent payment/retry, Premium workshop/RLS,
client/email, and every-session A5 checks passed. Desktop/mobile browser review
covered existing-student search, an Adults installment, school-year retention on
an existing balance, and clearing state on new-learner mode. A temporary local
synthetic receipt (EH-2026-00039) remains for review. No production data or real
email was used. Native PDF tab inspection is restricted by browser automation;
the generated PDF itself was rendered and visually inspected separately.

### Formule retirement (113; current contract)

Migration `113_premium_retirement_finance_contract.sql` redefined only
`create_charge_payment_financial(jsonb)` (applied in Production 2026-10-08 UTC; see the
[release record](architecture/evidence/premium-retirement-release-a-production-2026-10-09.md) and the
[plan](architecture/plans/premium-retirement.md#d1--finance-contract-release-a-migration-113)):

- The payload `plan_type` is accepted and ignored for charge and receipt data. For a
  request that creates a new Yearly charge, the supplied value still feeds the request
  fingerprint exactly as migration 096 did, so a request committed before 113 replays
  with its original receipt (owner decision Q7, option A).
- A new Yearly charge stores `plan_type = 'Standard'` (required by the unchanged
  `charges_yearly_formula_check`) and the description `Yearly · <school year>`.
- Every new receipt stores `plan_type` NULL. A receipt on a dated non-legacy Yearly
  charge builds `Yearly · <school year>`; a receipt on an undated non-legacy Yearly
  charge, a legacy charge or a non-Yearly charge copies the charge's own text.
- Numbering, amounts, discounts, balances, idempotency, events, e-mail opt-in and
  grants are unchanged. The receipt e-mail (Edge Function `sendReceiptEmail` v19)
  has no Formule row.
- Stored text of issued receipts and settled or voided charges is left as it was
  (owner decision Q1). The plan word was removed from the 10 open non-legacy Yearly
  charge descriptions by the separately approved cleanup step on 2026-10-09 UTC.

### Batch E release E-1 (app only; not yet merged)

[Plan PCR-r2](architecture/plans/payment-corrections-receipts.md#implementation-record), release E-1. No database change:

- **Finance CSV export (FIN-5).** `N° reçu` is the first column. Rows are ordered by series (`EH-YYYY-`, then
  `EH-HIST-`, then any other number, then unnumbered rows) and by the numeric suffix as a number. A cancelled
  receipt (voided or deleted) stays in the file with `Montant reçu` = 0, its original amount in `Montant annulé`,
  `Annulé le` (Casablanca date) and `Motif d'annulation`; summing `Montant reçu` gives collections. The file name
  uses the Casablanca date.
- **Dashboard and reports (FIN-9).** "Encaissé ce mois" (payments dated this month) stands alone; "Facturé ce mois"
  shows what is already paid on that same set of charges (`total − restant`); "Reste à encaisser (tous
  engagements)" comes from `get_finance_charge_summary.total_restant`. Reports show facturé and encaissé without a
  remaining balance or rate derived from the two; payroll totals cover every teacher, the chart the top 12.
- **Casablanca dates (FIN-8/REL-7, app part).** The dashboard month, "En retard" in `receiptStatus` and the default
  dates of the placement, enrollment, certificate, learning-assessment and parent re-enrollment forms use
  `localBusinessDate()` (zone `Africa/Casablanca`, never a fixed offset). The database part is release E-2.
- **Unnumbered historical receipts.** Until data step D1 numbers them, the PDF, print, correction and deletion
  screens show "Reçu historique" instead of an empty number.
- **No duplicate after a reload (FIN-13).** Pressing Save for a payment stores `{key, savedAt}` in
  `sessionStorage`; a confirmed response clears it. After a reload the form looks the key up in
  `receipts.idempotency_key`: found, it shows the receipt and does not prefill; not found, it says the attempt was
  not recorded (the form already holds a fresh key); lookup failed, it keeps the key and asks staff to check the
  learner's receipts. Before a payment, an active receipt for the same learner, amount and payment date asks for
  confirmation. Both are client-side; the server contract is unchanged.
- **Payroll (Q9).** `POST /api/admin/payroll` answers 409 "Paie désactivée : barème à valider par le comptable."
  after its authentication and role checks and before any write; the page shows the banner and disables creation.
  Existing payslips stay readable and printable. Release E-3 replaces the switch with a validated rule set.

### Batch E release E-2 (migration 122; not yet merged or applied)

[Plan PCR-r2](architecture/plans/payment-corrections-receipts.md#e-2-tier-3-migration--app), [ADR-012](architecture/decisions/ADR-012-gap-free-receipt-numbering.md):

- **Numbering.** `set_receipt_number()` takes the next value from `receipt_number_counters` (series `EH`, seeded from the
  greater of the retired sequence and the largest issued suffix) inside the receipt's transaction, so a rollback gives the
  number back. A supplied number is refused (`22023`); the year is the Casablanca year of issue; the suffix keeps at least
  five digits and never truncates. Guard triggers refuse any number change, hard delete or truncation for every role.
  Receipt-issuing transactions serialise on the counter row between insert and commit.
- **Corrections.** `void_financial_receipt` and `delete_mistaken_receipt` lock in payment order (shared enrollment-intent
  lock, learner, charge, receipt, enrollment, lead) and, when the receipt was the last live payment of a Confirmed or
  Validated enrollment, write `enrollment_id` and `enrollment_without_live_payment` on their `payment_voided` event and
  flag a CONVERTED linked lead once. A replacement payment clears that flag under the Q1-B rule.
- **Desk guardrails.** New charges with a discount store `discount_reason_code` (`sibling`, `former_student`,
  `promotion`, `director_approval`, `other`) and, for `other`, `discount_reason`; both enter the request fingerprint only
  when present, so earlier requests still replay. Reception discounts are capped at 10 %; payment dates are limited to
  today and 7 (reception) or 31 (admin, director) days back; all after the idempotent replay. Below 10 % of the net price
  a reception payment leaves the enrollment Under Review (`enrollment_confirmation_pending`).
- **Dates and reports.** `public.business_date()` (zone `Africa/Casablanca`) replaces `current_date` in `charge_balances`,
  the payment functions and the monthly/yearly finance summaries. `get_finance_summary()` and `get_unpaid_receipts(int)`
  are dropped. `get_finance_review_queue` feeds the director's "Contrôles" list on `/finance`.
- **Data steps** (written, each needs its own approval): `supabase/manual/batch_e_d1_historical_receipt_numbers.sql`
  (EH-HIST-2026 series, then `receipts_number_required`), `batch_e_d2_unpaid_confirmed_enrollments.sql`,
  `batch_e_d3_legacy_rounding.sql`, each with a reverse script.
