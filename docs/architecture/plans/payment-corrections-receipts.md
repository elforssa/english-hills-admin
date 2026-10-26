# Payment corrections, receipt numbering and finance guardrails (Batch E)

**Status: APPROVED FOR IMPLEMENTATION** (owner, 2026-10-24, Q1–Q9 at plan head `a6cce4e`; see the [approval record](#approval-record)). **Current text: revision PCR-r2** (2026-10-24): PCR-r1 plus the independent review's corrections and a coordinator decision, within the approved options, no change to any owner answer ([review corrections](#review-corrections-pcr-r2)); a fresh re-review of the PCR-r2 head is required. Tier 3. Each migration, data step (D1–D3) and deployment still needs its own explicit owner approval. Nothing is implemented yet: no code, no migration applied, no Production write. Baseline `origin/main` `ba009b45062ecbbef7beff6abbebeb9492965945`. Source findings: the read-only platform audit of 2026-10-24, items FIN-1/DAT-5, FIN-2/DAT-4, FIN-3, FIN-4, FIN-5, FIN-6, FIN-7, FIN-8/REL-7, FIN-9, FIN-11, FIN-12, FIN-13 (where an independent verifier corrected a finding, the verifier's version is used). FIN-10 belongs to Batch D. Proposed decision record: [ADR-012](../decisions/ADR-012-gap-free-receipt-numbering.md).

# Owner summary

## What will change

- **A cancelled payment no longer goes unnoticed.** When the director cancels or deletes the last active payment of a confirmed enrollment, the system records it, flags the linked CRM conversion for review and lists the enrollment in a new director list, "Inscriptions confirmées sans paiement actif". The enrollment itself is not changed automatically.
- **Receipt numbers have no more holes.** A payment that fails or is rolled back no longer uses up a number. Issued numbers can never be changed, reused or hard-deleted; a cancelled receipt keeps its number and shows "Annulé".
- **The 54 receipts imported on 13 September get a number** (how is your decision, Q6), in a separately approved data step.
- **Guardrails at the desk.** A discount needs a reason; reception cannot give more than a set discount on its own; payment dates cannot be in the future or far in the past; a small first payment taken by reception no longer confirms the enrollment on its own (each limit is your decision, Q2–Q5).
- **Correct figures.** The finance CSV export shows the receipt number and shows cancelled payments as 0 with a separate "Montant annulé" column. The dashboard's monthly "taux de recouvrement" compares like with like. Month and "overdue" boundaries follow Casablanca time. Two obsolete finance functions are removed.
- **Payroll is safe before its first use.** Payslip creation is switched off until your accountant validates the rules. Then the tax rules are kept as a dated, validated rule set (current Moroccan IR brackets, professional-expenses deduction, CNSS ceiling, family deductions, the teacher withholding regime), and a paid payslip can no longer be deleted.
- **Reloading the receipt page cannot create a duplicate payment** without a warning.

## What staff/users will be able to do

- Director: see and act on the new review list (confirmed enrollments without an active payment, discounts, backdated payments, reception deposits awaiting confirmation); record the accountant's validation of the payroll rules.
- Admin/director: give any discount with a reason; backdate a payment within the limit you choose.
- Reception: record payments as today, within the limits you choose; when a first deposit is below the threshold, the receipt is still issued and the enrollment waits for the director.

## What remains restricted

- Voids and deletions stay director-only. Nobody can edit or hard-delete an issued receipt or its number.
- Reception still cannot independently confirm an enrollment below the agreed threshold, cannot exceed its discount cap and has no finance analytics.
- Payroll stays admin/director only; no payslip can be created until the rules are validated.

## UI impact

Receipt form (reason field, clearer limit messages, duplicate warning, recovery after reload), void and delete screens (they state the consequence for the enrollment and the CRM), `/finance` (review list, corrected export), dashboard monthly card, reports finance and payroll totals, payroll page (validation banner, preview from the server, no delete after validation), receipt PDF/print for the historical receipts.

## Database impact

Two forward migrations, numbered just before merge: `XXX_finance_corrections_numbering_guardrails.sql` (release E-2) and `XXX_payroll_rules_and_guards.sql` (release E-3). New: a one-row-per-series receipt counter, a few guard triggers, two columns on `charges` and `receipts`, a director read function, a payroll rule-set table. Redefined from their latest versions: `create_charge_payment` (096), `create_charge_payment_financial` (113), `void_financial_receipt` (055), `delete_mistaken_receipt` (076), `set_receipt_number` (026), `charge_balances` (057), `get_monthly_finance_summary` and `get_finance_year_months` (055). Dropped: `get_finance_summary()`, `get_unpaid_receipts(int)`. Data steps (54 historical numbers, the 2 existing unpaid confirmed enrollments, legacy rounding) are separate and each need your approval.

## Important security decisions

- Numbering is assigned inside the same database transaction as the receipt from a locked counter, so a rollback releases the number. No client role can read or write the counter.
- Guardrails are enforced in the database functions, not only in the screen; the role is read from the stored profile, never from the request.
- The new review list is director-only, like `financial_events` and voids today.
- No grant or RLS policy is widened. The two dropped functions are the only ones still executable by `anon` in this area.
- The new receipt guards refuse number changes and hard deletion for every role, including `service_role` (which today holds UPDATE, DELETE and TRUNCATE on `receipts`). The two narrow exceptions (historical numbering in D1, test cleanup on a local database) need a transaction-local setting **and** a session user that is a member of `postgres` (`pg_has_role(session_user, 'postgres', 'MEMBER')`: today `postgres`, `supabase_admin` and the CLI login role `cli_login_postgres`), which no API request can provide.

## Risks / owner review points

- The counter serialises receipt creation: two receipts cannot commit at the same instant. At ~35 receipts on the busiest day so far this is invisible; it is a deliberate trade for gap-free numbering.
- A release test that issues a real receipt would consume a real number. Release checks stay zero-payment only (your probe policy of 2026-10-08).
- The confirmation threshold changes the desk routine for very small deposits (Q5). In the data, admin and director first payments go as low as 2.3% of the price; reception's three first payments were all at least 33%.
- Past gaps cannot be undone; the plan records them in a register for your accountant (below).
- Payroll figures in this plan come from public 2025/2026 sources and **must be validated by your accountant**; the system will refuse payslips until you record that validation.
- Batch C (conflicts without retry loops, approved) and Batch D (enrollments and groups) also edit `create_charge_payment`. Whichever merges later rebuilds on the definitions already merged. This plan decides the order of the payment checks; they are not reordered (coordinator decision, see [cross-batch coordination](#cross-batch-coordination)).
- Five existing test scripts clean up with a hard `delete from public.receipts`; they move to a sanctioned local-only cleanup (P2.3a), and the one-off September import scripts are retired.

---

## Baseline and evidence limits

- Code read at `ba009b4` (latest definitions: wrapper `create_charge_payment` in [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql) lines 393–517; inner `create_charge_payment_financial` in [113](../../../supabase/migrations/113_premium_retirement_finance_contract.sql); `void_financial_receipt`, `void_financial_charge` and the finance summaries in [055](../../../supabase/migrations/055_receipt_charge_payments.sql); `charge_balances` in [057](../../../supabase/migrations/057_receipt_school_year_workflow.sql); `delete_mistaken_receipt` in [076](../../../supabase/migrations/076_delete_mistaken_receipt.sql); `set_receipt_number` and `receipt_number_seq` in [026](../../../supabase/migrations/026_drop_dead_backend_and_receipt_numbering.sql); `crm_security.evaluate_conversion` in [084](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql); payroll grants in [065](../../../supabase/migrations/065_payroll_direct_write_guard.sql) and [043](../../../supabase/migrations/043_teacher_sensitive_data_isolation.sql)).
- Production, read-only on 2026-10-24, aggregates only (no personal data): ledger 001–118 per [CURRENT_STATE](../../ai/CURRENT_STATE.md); triggers on `receipts`, `charges`, `payroll`, `financial_events` and function ACLs read from the catalog.
- Not verified: Postgres logs for 2026-10-09 to 2026-10-14 (the cause of the 124-number burn); whether paper receipts with numbers exist for the September import; the accountant's view on any rule below.
- Local database suites cannot run in this environment (no Docker); CI runs them.

## Verified current state

### Production aggregates (2026-10-24)

| Fact | Value |
| --- | --- |
| Receipts | 315 (261 numbered, 54 with no number); all numbered ones use `EH-2026-NNNNN`; no duplicate numbers |
| Numbers | 1 to 424; `receipt_number_seq.last_value` 424; **163 numbers never issued** in 22 gaps |
| Gaps before the charge model (numbers 5–210, May–July) | 35 numbers in 20 small gaps. `activity_log` holds 41 receipt hard-deletions between 2026-05-24 and 2026-09-16; the log redacts the number, so they cannot be matched one by one, but they are the likely explanation |
| Gaps in the charge model (numbers 211+) | **128**: 259–382 (124, between the last receipt of 2026-10-02 and the first of 2026-10-14) and 414–417 (4, on 2026-10-14). No receipt deletion is logged after 2026-09-16, so these were consumed by rolled-back attempts, not issued |
| Unnumbered receipts | 54, all `created_at` 2026-09-13 05:00:52 UTC in one transaction, payment dates 10–11 Sep, no actor, all carry the `payment-tracking-2026:` import marker (29 annual, 25 Mise à niveau), 53 live totalling 128,900 MAD, each with a legacy charge, none linked to an enrollment |
| Confirmed enrollments whose every receipt is cancelled | 2 (both charges voided, both learners archived, 1 still `Enrolled`, 1 linked to a CONVERTED lead, 0 review flags). Validated: 0 |
| New (non-legacy) charges | 86: admin 43 (30 discounted, max 55.6%), director 40 (15 discounted, max 77.8%), reception 3 (no discount); none has a stored reason |
| Backdated receipts | 32 of 86 new receipts, all by admin, at most 8 days back, 4 into the previous month; none in the future |
| First payment on a tuition charge as share of net price | reception: min 33%; admin: min 11%, 10 below 30%; director: min 2.3%, 2 below 10%; median for admin/director = paid in full |
| Legacy rounding | 14 live legacy charges overpaid (27.02 MAD in total, one by 25 MAD); 3 with a balance between 0 and 1 MAD |
| Payroll | 0 rows. 9 teachers, **all `Freelance`**, 1 with an hourly rate, none with a monthly salary |

### Mechanisms (code)

- **Numbering (FIN-2/DAT-4).** `set_receipt_number()` is a BEFORE INSERT trigger that takes `nextval('receipt_number_seq')`. Sequence values survive rollback. The wrapper can still raise after the inner function inserted the receipt (CRM-match guard, "Selected enrollment does not match…", "This service cannot be linked…", "Charge is already linked…", enrollment-trigger errors such as "Active enrollment requires a group"), and the deferred `crm_revenue_financial_event` constraint trigger runs at commit. Any of these, a client retry or a rolled-back probe (218 direct SQL calls of `create_charge_payment` are recorded in `pg_stat_statements`) burns a number. The trigger also accepts a caller-supplied number, takes the year from the **payment date** in UTC, and `lpad(…, 5)` would silently truncate numbers above 99,999.
- **Historical receipts (FIN-3).** [`scripts/generate-payment-tracking-sql.mjs`](../../../scripts/generate-payment-tracking-sql.mjs) wraps its insert in `alter table public.receipts disable trigger user`, which disabled numbering, activity logging and the e-mail webhook for those 54 rows. Its companion [`scripts/sync-payment-tracking.mjs`](../../../scripts/sync-payment-tracking.mjs) inserts receipts with the service-role client and rolls back by deleting them (line 138). Both were one-off tools for that import. The PDF prints an empty number ([receiptPdf.js:109](../../../src/lib/receiptPdf.js)); the list falls back to `#<id>`.
- **Corrections (FIN-1/DAT-5).** `void_financial_receipt` marks the receipt and writes `payment_voided`; `delete_mistaken_receipt` also voids the charge. Neither looks at `enrollments`, `students` or `crm_leads`. `crm_leads.conversion_review_required` is set only by `crm_security.evaluate_conversion`, in two cases: (1) the linked enrollment's status leaves Confirmed/Validated (with a `conversion_review_required` activity); (2) a lead whose status was LOST or NOT_QUALIFIED converts (the flag is set in the conversion update itself, **without** a review activity; the `lead_converted` activity's `from_status` shows it). Nothing clears the flag. Production has 0 review activities and 0 flagged leads. The delete screen says the enrollment is not modified, which is accurate; the gap is that nothing follows up. While the flag is set, `crm_security.lifecycle_hold` (latest in 104) holds the lead's `converted` lifecycle delivery with reason `conversion_review_required` and retries later; the lifecycle is dormant today (its earlier `outbound_disabled` check wins).
- **Guardrails (FIN-4).** The inner function accepts any gross ≥ 0, any discount ≤ gross, any `payment_date` (default `current_date`, UTC). The wrapper promotes Submitted/Under Review to Confirmed (Validated with a group) and Trial to Validated on **any** nonzero payment, or creates a Confirmed enrollment. SECURITY_RULES says reception "cannot independently confirm an enrollment".
- **Export (FIN-5).** [`finance/page.jsx`](../../../src/app/(admin)/finance/page.jsx) lines 67–95 export every visible receipt with its original amount in "Montant reçu" and no number column (11 cancelled receipts, 29,800 MAD, today).
- **Dashboard (FIN-9).** `get_monthly_finance_summary` returns `encaisse` (all payments dated this month) and `total`/`restant` (charges created this month); [`dashboard/page.jsx`](../../../src/app/(admin)/dashboard/page.jsx) divides the first by the second. [`reports/page.jsx`](../../../src/app/(admin)/reports/page.jsx) computes a yearly `restant = facture − encaisse` with the same mix and sums payroll after `slice(0, 12)`.
- **Time zone (FIN-8/REL-7).** Database `TimeZone = UTC`. `current_date` in `charge_balances`, the inner function and the wrapper; UTC timestamps compared with dates in the two summaries; `new Date().toISOString()` in the dashboard and `receiptStatus`; several form defaults (`PlacementTestModal.jsx:55`, `EnrollmentModal.jsx:21`, `certificates/page.jsx:20`, `learning-assessments/page.jsx:30`, `parent-portal/page.jsx:149`). `localBusinessDate()` in [`receiptFinance.js`](../../../src/lib/receiptFinance.js) already does it right.
- **Obsolete functions (FIN-12).** `get_finance_summary()` and `get_unpaid_receipts(int)` (096 lines 1033–1058) are SECURITY INVOKER, executable by `anon`, use the pre-charge formula and do not exclude voids. No `src/` reference; [`test-receptionist-batch1.sql`](../../../scripts/test-receptionist-batch1.sql) lines 146–147 assert receptionist denial.
- **Duplicates (FIN-13).** [`ReceiptForm.jsx`](../../../src/components/receipts/ReceiptForm.jsx) keeps the idempotency key in a `useRef`; a reload makes a new key. `receipts.idempotency_key` is stored, so a reloaded page can look the earlier attempt up.
- **Payroll (FIN-6, FIN-11).** Two copies of the calculation ([`api/admin/payroll/route.js`](../../../src/app/api/admin/payroll/route.js), [`payroll/page.jsx`](../../../src/app/(admin)/payroll/page.jsx)): 2024 brackets (top rate 38%), CNSS 4.48% on the full salary, no professional-expenses deduction, no family deduction, freelance = 20% withheld. `payroll` has `UPDATE(statut)` and DELETE for `authenticated` under the admin/director policy; no transition or delete guard; `log_activity_t` is present.

### Moroccan rules relevant to this plan (to be validated by the accountant)

- **Numbering.** Article 145-III of the Code Général des Impôts requires invoices to be pre-numbered and drawn from a continuous series; a cancelled document is corrected by a separately numbered credit note, never by reusing or removing a number. A gap in a series is a classic audit question. A *reçu de paiement* is not necessarily a *facture*, but these receipts are the centre's primary record of cash received, so the plan treats them to the same standard: gap-free from now on, chronological, never reused, cancelled ones kept and marked. Gap-free is achievable, so no exception needs arguing; past gaps are explained in a register. Source: [Clicpaie, modèle de facture Maroc](https://clicpaie.ma/blogs/modele-facture-maroc/) (summary of art. 145).
- **Primary references for the accountant:** the Code Général des Impôts, article 73 (IR rates; 73-II for the withholding rates, including the *libératoire* rate for non-permanent teachers), article 59 (deductions) and article 145 (invoices), and the DGI *note circulaire* n° 733 on the 2023 Finance Law measures ([copy published by EcoActu](https://www.ecoactu.ma/wp-content/uploads/2023/02/NC-N°-733-relative-aux-mesures-fiscales-de-la-LF-2023-vf.pdf)). The secondary sources below are summaries of those texts.
- **IR barème 2025/2026 (art. 73), monthly = annual ÷ 12:** 0–3,333.33: 0%; to 5,000: 10% (minus 333.33); to 6,666.67: 20% (minus 833.33); to 8,333.33: 30% (minus 1,500); to 15,000: 34% (minus 1,833.33); above: 37% (minus 2,283.33). Sources: [Upsilon, LF 2025](https://upsilon-consulting.com/loi-de-finances-2025-au-maroc/), [Upsilon, IR 2026](https://upsilon-consulting.com/en/salary-income-tax-morocco-2026/).
- **Professional expenses (art. 59):** 35% of gross taxable salary when annual gross taxable ≤ 78,000 MAD (6,500/month), 25% above, capped at 35,000 MAD/year (2,916.67/month). Sources: [PwC tax summaries (reviewed 30 April 2026)](https://taxsummaries.pwc.com/morocco/individual/deductions), [Clicpaie, frais professionnels 2026](https://clicpaie.ma/blogs/frais-professionnels-maroc-2026/), [Upsilon, IR 2026](https://upsilon-consulting.com/en/salary-income-tax-morocco-2026/).
- **Family deduction:** 2025: 500 MAD/dependant/year, cap 3,000; from 2026: 600/year (50/month), up to 6 persons, cap 3,600 (300/month). Source: [Upsilon, IR 2026](https://upsilon-consulting.com/en/salary-income-tax-morocco-2026/).
- **Social contributions (employee share):** CNSS 4.48% on salary capped at 6,000 MAD/month; AMO 2.26%, not capped. Source: [Upsilon, IR 2026](https://upsilon-consulting.com/en/salary-income-tax-morocco-2026/).
- **Non-permanent teachers of private teaching establishments:** withholding at a final (*libératoire*) rate of **30%** since 1 January 2023 (previously 17%), not the 20% hard-coded today. Whether it applies depends on how each teacher is engaged (vacataire, auto-entrepreneur, company); the accountant decides per teacher. Legal basis: CGI art. 73-II as amended by the 2023 Finance Law, explained in note circulaire 733 (above). Press: [Le360, 2023](https://fr.le360.ma/economie/enseignement-prive-voici-pourquoi-les-frais-de-scolarite-vont-augmenter-des-la-prochaine-rentree-273617/), [Le Matin, 2022](https://lematin.ma/express/2022/hausse-lir-vacataires-parents-deleves-inquiets/383343.html), [FNH](https://fnh.ma/article/actualite-financiere-maroc/retenue-a-la-source-ce-qui-va-changer-des-janvier-2023).

## Scope and non-goals

In scope: the findings listed at the top, their tests, the four data steps described below (as plans, not executions) and the documentation they change.

Not in scope:
- FIN-10 (every receipt sets the learner to `Enrolled`) and the leaver/archiving flow that would close an archived learner's open enrollment (the prevention half of DAT-5): Batch D. This plan only flags, lists and leaves enrollment status to the director.
- A generic "review done" command for `conversion_review_required` (none exists today); Q1 option B adds only a narrow automatic clear.
- Moving deterministic `40001` raises to `PT409`: Batch C ([conflicts without retry loops](https://github.com/elforssa/english-hills-admin/pull/151), revision NRC, **approved** by the owner on 2026-10-24; its ADR makes `PT409` the conflict code for every batch). This plan only follows that rule in the functions it redefines (see [cross-batch coordination](#cross-batch-coordination)). With the counter, a retried request no longer burns numbers either way.
- Wiring the two existing finance SQL suites into CI is Batch A (COD-4); E-2 wires its own new suite and, if Batch A has not merged, the two existing ones too.
- Credit notes / avoirs as separate documents, catalog prices, a month-closing lock, payroll payment files, CNSS declarations.

## Design

Releases: **E-1** (Tier 2, app only), **E-2** (Tier 3, migration 1 + app), **D1–D3** (Production data steps, each separately approved), **E-3** (Tier 3, migration 2 + app). E-1 can ship first and independently; E-2 waits for Q1–Q5 and Q7; D1 waits for Q6; D3 waits for Q8; E-3 waits for Q9.

### P1 — Payment corrections stay consistent and visible (FIN-1/DAT-5) — E-2, migration

1. **Lock order for voids (PCR-r2, review I2).** `void_financial_receipt` and `delete_mistaken_receipt` take their locks in the same order as a payment, before any write: read the receipt's `student_id` (plain read); take `pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:'||student_id, 0))` and, if it fails, raise the wrapper's existing "Inscription ou paiement en cours. Actualisez … puis réessayez." with SQLSTATE **`PT409`** (Batch C rule); lock the student row `FOR UPDATE`; then the charge, the receipt, the enrollment (`FOR UPDATE`) and last the lead. Effects:
   - A concurrent payment for the same learner holds the student row from its start to commit (the wrapper locks it first), so a void either waits for the payment and then sees its live receipt, or runs first and the payment then sees the flag. No stale flag in either order.
   - CRM linkage commands take the same advisory lock **exclusively** before locking a lead, so a void and a linkage command cannot hold lead and enrollment in opposite order: one of them gets `PT409` at once instead of a deadlock.
   - The existing 076 order (charge before receipt) is kept after the student lock. A receipt with no student (historical, unreconciled) skips the advisory and student locks and the review step.
2. **One private helper**, `finance_security.review_enrollment_without_live_payment(p_enrollment uuid, p_source_key text, p_details jsonb)` (SECURITY DEFINER, `search_path = pg_catalog, pg_temp`, no API grant, schema `finance_security` created with all privileges revoked from API roles). Called with the enrollment already locked. If the enrollment is Confirmed or Validated and **no** live receipt (not voided, not deleted) remains on the enrollment directly or on any of its charges, it:
   - returns `true` so the caller adds `enrollment_id` and `enrollment_without_live_payment: true` to the metadata of the `payment_voided` event it writes (no new `financial_events` type);
   - for each non-merged `crm_leads` row with `enrollment_id` = that enrollment, status CONVERTED and the flag **not** already set: inserts a `crm_activities` row of type `conversion_review_required` (actor = the director, `source_key` = `p_source_key`, body "Paiement annulé : l'inscription confirmée n'a plus de paiement actif. Vérification par la direction.", details `p_details || {reason: 'payment_voided', enrollment_status}`) and sets `conversion_review_required = true, version = version + 1` (lead locked `FOR UPDATE`, last). A lead already flagged, for any reason, is left alone: no second activity.
   - never changes the enrollment, the learner or the lead status.
3. The two void functions resolve the enrollment as `coalesce(receipt.enrollment_id, charge.enrollment_id)` and call the helper after their existing writes, on the non-idempotent path only (an already-voided replay does nothing), with `p_source_key = 'payment-void-review:'||receipt_id` and `p_details = {receipt_id, action}` (`action` = `void_financial_receipt` or `delete_mistaken_receipt`). Bodies are otherwise the latest 055/076 bodies. D2 calls the same helper with its own key (see [data cleanup](#data-cleanup-plan-not-run-each-step-needs-the-owners-explicit-approval)).
4. **Q1 = B: automatic clear on a replacement payment (rule corrected in PCR-r2, review I3).** In the wrapper, **after** it has locked the enrollment `FOR UPDATE` and linked the new receipt, for each linked non-merged lead with the flag set, clear the flag only if **all** of these hold:
   - at least one `conversion_review_required` activity exists after the lead's latest `conversion_review_cleared` activity (or ever, if none), and **every** such activity has `details.reason = 'payment_voided'`;
   - the lead's conversion activity (`conversion_activity_id`) does not have `from_status` LOST or NOT_QUALIFIED (that flag is set without a review activity and is never cleared automatically);
   - after this payment the enrollment is Confirmed or Validated and has a live receipt.
   Then set the flag to false (`version + 1`) and insert a `conversion_review_cleared` activity ("Paiement de remplacement enregistré : vérification levée.", `source_key` `payment-review-cleared:<receipt id>`, details `{receipt_id}`). A flag raised by an enrollment downgrade (a review activity without that reason) is never cleared. A repeated cycle void → replacement → void → replacement clears each time.
5. **Lifecycle effect (PCR-r2, review I6), intended.** Clearing the flag removes the `conversion_review_required` hold in `crm_security.lifecycle_hold`, so a held `converted` delivery for that lead becomes eligible again at its next scheduled attempt, subject to every other gate (activation, deadline, ownership, boundary). That is the intended outcome: the conversion is backed by a payment again. Today the lifecycle is dormant (`outbound_disabled`), so nothing is sent. `crm_activities.event_type` is checked by a pattern (`^[a-z][a-z0-9_]*$`, 078), not a list, so `conversion_review_cleared` needs no schema change; the implementer verifies that no lifecycle producer or candidate function in the latest 101–104 definitions reacts to either activity type (stop condition if one does), and adds a French label for it in `src/lib/crm/presentation.mjs`.
6. **Director list.** `public.get_finance_review_queue(p_since date default null)` (SECURITY DEFINER, director only via `get_my_role()`, `authenticated` execute) returns bounded JSON sections: (a) Confirmed/Validated enrollments that once had a receipt and now have no live one, with learner name, archived flag, learner status, programme, school year, lead status and flag; (b) new charges with a discount since `p_since` (default 30 days), amount, percent, reason, author role; (c) receipts whose payment date is before their Casablanca issue date; (d) enrollments left unconfirmed by a below-threshold reception payment (P3). Shown on `/finance` as "Contrôles" for the director; section (a) is always current, the others filter by period. A void refused with `PT409` shows "Paiement en cours pour cet apprenant : actualisez puis réessayez."
7. **UI.** Void and delete screens state, before confirmation, when the receipt is the enrollment's last active payment: "L'inscription restera confirmée. Elle apparaîtra dans « Inscriptions confirmées sans paiement actif » et la conversion CRM sera signalée pour vérification." The director then decides (existing enrollment tools); no automatic downgrade, consistent with PRODUCT_RULES ("payment, revenue and conversion remain separate facts").

### P2 — Gap-free, immutable receipt numbering (FIN-2/DAT-4, FIN-3) — E-2, migration; D1 data step

1. **Counter.** `public.receipt_number_counters(series text primary key, last_value bigint not null check (last_value >= 0), updated_at timestamptz not null default now())`, RLS enabled, no policy, all privileges revoked from `anon`, `authenticated` and `service_role`. The migration takes `lock table public.receipts in share row exclusive mode`, then seeds series `EH` with `greatest(receipt_number_seq.last_value, max numeric suffix of existing numbers)` (424 today, computed, never hard-coded).
2. **`set_receipt_number()` redefined** (SECURITY DEFINER, fixed `search_path`, execute revoked from API roles): refuses a caller-supplied number (`22023`), then `update receipt_number_counters set last_value = last_value + 1, updated_at = now() where series = 'EH' returning last_value` and builds `EH-<year>-<n>` with `lpad(n::text, greatest(5, length(n::text)), '0')`. The row lock is held to commit, so a rollback (failed validation, trigger error, deferred CRM trigger, retry, probe) restores the value: **no gap**. Year (Q7 = A): the Casablanca date of `clock_timestamp()` read **after** the counter update, so the year follows the same order as the numbers; one continuous counter across years (as today: the counter has never reset). Using `now()` (transaction start) is rejected: a transaction started before midnight that obtains the counter after one started after midnight would give `EH-2027-n` followed by `EH-2026-n+1`.
3. **Immutability.** New BEFORE UPDATE OF `receipt_number` trigger: a non-null number can never change; null → value is allowed only when the transaction-local setting `english_hills.historical_receipt_numbering = 'on'` is present, `pg_has_role(session_user, 'postgres', 'MEMBER')` is true (P2.3b), and the value matches `^EH-HIST-2026-[0-9]{4}$` (Q6 = B). New BEFORE DELETE (row) and BEFORE TRUNCATE (statement) triggers refuse hard deletion for every role, `service_role` included (which holds UPDATE, DELETE and TRUNCATE on `receipts` since 055): receipts are only voided or soft-deleted. The only exception is P2.3a. `receipt_number_seq` is left in place unused (rollback aid) and documented as retired. These guards are ordinary user triggers: `alter table … disable trigger user` (owner-level DDL, as the retired import used) would bypass them; any future import needs its own approved plan.
3a. **Test cleanup and retired scripts (PCR-r2, review I1).** Existing scripts that hard-delete receipts:

   | Script | Line | Runs in CI | Change |
   | --- | --- | --- | --- |
   | `scripts/test-crm-phase6-concurrency.py` | 180 | yes (`verify.yml` 246) | sanctioned cleanup |
   | `scripts/test-receptionist-browser.mjs` | 495 | yes (`verify.yml` 265) | sanctioned cleanup |
   | `scripts/test-crm-phase7-concurrency.py` | 100 | no | sanctioned cleanup |
   | `scripts/test-receipt-deletion-browser.mjs` | 69 | no | sanctioned cleanup |
   | `scripts/test-receipt-concurrency.sh` | 11 | no (Batch A #155 may wire it) | sanctioned cleanup; drop the trailing `\|\| true` so a failed cleanup fails the run |
   | `scripts/sync-payment-tracking.mjs` | 138 | no | retired (below) |

   **Sanctioned cleanup:** the delete guard lets a hard delete through only when the transaction-local setting `english_hills.receipt_test_cleanup = 'on'` is present **and** `pg_has_role(session_user, 'postgres', 'MEMBER')` is true. Each test runs its cleanup as one transaction: `begin; set local english_hills.receipt_test_cleanup = 'on'; delete …; commit;`, keeping the existing order (events and requests before receipts, receipts before charges). All these suites connect as `postgres` to the local database only (`127.0.0.1:54322` or the local container). The setting is not reachable through PostgREST (no exposed function can set it; `set_config` is not in an exposed schema), so no API role can use it. Its use in Production is forbidden; the delete still writes the `log_activity_t` DELETE row. Every new test uses rollback-only transactions instead.
   **Retired:** `scripts/sync-payment-tracking.mjs` and `scripts/generate-payment-tracking-sql.mjs` (the one-off import applied on 2026-09-13; it disabled user triggers) exit at start with "Retired: the 2026 payment-tracking import was applied on 2026-09-13; see docs/architecture/plans/payment-corrections-receipts.md." `scripts/README-payment-tracking-sync.md` is marked retired. Their offline test (`scripts/test-payment-tracking-sync.mjs`) keeps testing the pure parsing library, which stays.
3b. **Owner-level session user (PCR-r2, re-review N1; coordinator decision).** Both exceptions test `pg_has_role(session_user, 'postgres', 'MEMBER')`, not a fixed list of names, because the repository's documented Production write path, `supabase db query --linked`, logs in as `cli_login_postgres`, a member of `postgres`. Read-only catalog check on Production (2026-10-24): members of `postgres` are `postgres`, `supabase_admin` and `cli_login_postgres`; `anon`, `authenticated`, `service_role`, `authenticator` (PostgREST's login role, the session user of every API request), `dashboard_user`, `pgbouncer`, `supabase_auth_admin` and `supabase_storage_admin` are not. `session_user` is not changed by `set role`, so an API request that switches to `service_role` still has `authenticator` as session user and is refused.
4. **Concurrency and check order.** Receipt-issuing transactions serialise on one row between receipt insert and commit. Lock order stays advisory intent (shared) → student → charge → counter → enrollment → lead, and voids follow the same order (P1.1); no path that holds a lead or enrollment lock waits for the counter (CRM commands never insert receipts; voids and deletes do not number), so no new deadlock cycle. Volume is tens per day. **Coordinator decision (PCR-r2, review I4): this plan governs the order of the payment checks. The wrapper's post-insert checks are not reordered and are not moved before the inner financial call:** with the counter they no longer cost a number, and reordering would change tested behaviour. The merged Plan D (PR #154) defers to this; see [cross-batch coordination](#cross-batch-coordination) and the stop conditions.
5. **Release probes.** The probe policy of 2026-10-08 stands: zero-payment probes only. Release verification reads the counter value before and after (must be equal).
6. **Historical receipts (D1, Q6).** A reviewed one-off script under `supabase/manual/` sets the local setting, numbers the 54 rows per Q6 in `(date, created_at, id)` order, writes one `activity_log`-visible update per row, then adds `receipts_number_required check (receipt_number is not null)` and validates it. The constraint is **not** added by the migration: a NOT VALID check would make any update of an unnumbered row (for example a void) fail until D1 runs. Until D1, E-1 prints "Reçu historique" instead of an empty number.
7. **Gap register (documentation only).** The E-2 release record contains the table of the 22 historical gaps from the Production query above, with their explanation (pre-charge-model deletions; 128 numbers consumed by rolled-back attempts on 2026-10-02 → 2026-10-14), for the accountant. Existing numbers are never renumbered.

### P3 — Guardrails on counter-entered terms (FIN-4) — E-2, migration + UI

All checks in `create_charge_payment_financial` (latest 113 body) or the wrapper (latest 096 body), with the role from `get_my_role()`; the form mirrors them for messages only.

1. **Discount reason (Q2).** New nullable `charges.discount_reason text` (≤ 200 chars) and `charges.discount_reason_code text` (check in the Q2 list). For a **new** charge with discount > 0 the function requires a code, and free text for `Autre`. Enforced in the function, **not** as a table constraint, because existing discounted charges have no reason and a constraint would block their later voids. The values enter the request fingerprint only when present (`jsonb_strip_nulls`), so pre-migration requests still replay (owner decision Q7 of 2026-10-08 precedent). Copied to the `charge_created` event metadata and shown on receipts list/detail for staff (never on the PDF or e-mail).
2. **Reception discount cap (Q3).** For `receptionist`, `discount / gross` above the cap raises "Remise supérieure à N % : demandez au directeur." Admin and director: no cap, reason still required.
3. **Payment date window (Q4).** Let *today* = Casablanca date. Everyone: no date after today. Reception: not before today − 7. Admin/director: not before today − 31. Outside: `22023` with a French message. The default stays today (Casablanca).
4. **Reception partial payment (Q5).** In the wrapper, when the caller is `receptionist` and the charge's live paid total after this payment is below the threshold × net price: the receipt is issued; a linked Submitted/Under Review/Trial enrollment keeps its status; when no enrollment exists, the new one is created as `Under Review` (allowed without a group by `check_enrollment_student_sync`) instead of Confirmed; the learner is not set to `Enrolled` (coordinated with Batch D's FIN-10 change); the result carries `enrollment_confirmation_pending: true`; the form says "Acompte inférieur à N % : reçu émis, inscription en attente de confirmation par la direction." A later payment that crosses the threshold confirms as today; the director can confirm earlier with the existing enrollment tools. Admin and director are unchanged. Under Review is not conversion, so no CRM side effect.
5. **Weekly visibility.** Sections (b)–(d) of the director list (P1.6).
6. **Guards run after the idempotent replay (PCR-r2).** In the inner function, P3.1–P3.3 run after the existing replay return (113, after the `financial_requests` lookup), so a retry of a committed request replays its original receipt even when it now falls outside the date window or the discount rules. P3.4 runs only on a new (non-replayed) receipt, as the wrapper already returns early on replay.

### P4 — Exports and dashboards are correct (FIN-5, FIN-9, FIN-8/REL-7, FIN-12, FIN-7)

- **FIN-5 (E-1, app only).** Export columns: `N° reçu` first, then the existing ones; `Montant reçu` = 0 for a cancelled receipt, new `Montant annulé`, `Annulé le` (Casablanca), `Motif d'annulation`; ordered by series (main `EH-YYYY-` series first, then `EH-HIST-`, then any row still without a number), then by the numeric suffix as a number (so `EH-2026-100000` sorts after `EH-2026-99999`), never by text. Cancelled rows stay in the file (audit trail); summing `Montant reçu` gives true collections. File name uses the Casablanca date.
- **FIN-9 (E-1, app only).** Dashboard monthly card: "Encaissé ce mois" on its own (all payments dated this month); "Facturé ce mois" with "dont déjà encaissé" = `total − restant` and its percentage (same set of charges); "Reste à encaisser (tous engagements)" from `get_finance_charge_summary.total_restant`, already loaded. Reports: show facturé and encaissé per month without the mixed `restant`/rate; payroll totals computed before `slice(0, 12)`.
- **FIN-8/REL-7.** App (E-1): dashboard month start from `localBusinessDate()`, `receiptStatus` overdue comparison on the Casablanca date, and the five form defaults above. Database (E-2): a helper `public.business_date(p_at timestamptz default now())` (`(p_at at time zone 'Africa/Casablanca')::date`, stable, execute for `authenticated`) replaces `current_date` in `charge_balances` (same columns and order), the inner function (default payment date, "En retard") and the wrapper (`date_inscription`); `get_monthly_finance_summary` and `get_finance_year_months` compare `created_at` through the helper.
- **FIN-12 (E-2).** `drop function public.get_finance_summary()` and `public.get_unpaid_receipts(integer)`; `test-receptionist-batch1.sql` lines 146–147 change to assert absence.
- **FIN-7 (D3, Q8).** No code. Recommended: a reviewed one-off correction that sets each of the 17 legacy charges' `discount_amount` so that net equals what was paid, with a new `financial_events` type `charge_terms_corrected` (before/after/reason) added to the type check by the E-2 migration; the 25 MAD case only after the director checks the paper receipt.

### P5 — No duplicate payment after a reload (FIN-13) — E-1, app only

- The form stores `{key, savedAt}` in `sessionStorage` (wrapped in try/catch) when the user presses Save, and clears it on a confirmed response. On mount, if a pending key exists, the form looks up `receipts` by `idempotency_key` (allowed by the existing RLS for all finance staff): if found, it shows "Ce paiement a déjà été enregistré : reçu N° …" with a link and does not prefill; if not, it says the previous attempt was not recorded and starts a fresh key.
- Before submitting a payment, if an active receipt exists for the same learner, the same amount and the same payment date, the form asks for confirmation ("Un reçu identique existe déjà aujourd'hui…"). A soft check only; the server is unchanged.

### P6 — Payroll safe before first use (FIN-6, FIN-11)

- **Interim stop (E-1, app only).** `POST /api/admin/payroll` returns 409 "Paie désactivée : barème à valider par le comptable." and the page shows that banner with the create button disabled. Read and print of (zero) existing rows unchanged.
- **Rules as data (E-3, migration).** `public.payroll_rule_sets(id, effective_from date unique, rules jsonb not null, source_note text, validated_by_name text, validated_at date, validated_by uuid, created_at)` with RLS (admin/director read; no direct write grant). `rules` holds: monthly IR brackets with deductions, CNSS rate and ceiling, AMO rate, professional-expenses rates/threshold/cap, family deduction per dependant/cap/max persons, and withholding rates per teacher regime. The migration seeds one **unvalidated** 2026-01-01 row with the figures above. `public.payroll_validate_rule_set(p_id uuid, p_accountant text, p_validated_on date)` is director-only and the only way to set validation; a validated row becomes immutable (guard trigger); a correction is a new row.
- **Per teacher.** New `teachers.payroll_regime text check (in ('employee','vacataire_withholding','auto_entrepreneur','no_withholding'))` and `teachers.payroll_dependents smallint default 0 check (0..6)`, both nullable until set; HR-only by the existing teachers policies. Payslip creation refuses a teacher whose regime is unset.
- **One calculation.** Pure module `src/lib/payroll/calculate.mjs` (no client copy), used by `POST /api/admin/payroll/preview` (admin/director, no write) and the create endpoint. Employee: CNSS = rate × min(gross, ceiling); AMO = rate × gross; professional expenses per the rule set; taxable = gross − professional expenses − CNSS − AMO; IR = bracket − family deduction, floored at 0; rounding as the accountant specifies. Other regimes: the rule set's withholding rate on gross. Create refuses when no validated rule set covers the payslip month. `payroll.rule_set_id` (new, nullable for history) is stored on each payslip.
- **FIN-11 (E-3, migration).** Guard trigger on `payroll`: delete only while `Brouillon`; status only Brouillon → Validé → Payé; a backward move only through `public.payroll_reopen(p_id uuid, p_reason text)` (director, reason ≥ 3 chars, writes the reason to `notes` and is logged by the existing `log_activity_t`). Revoke DELETE on `payroll` from `anon`. The page hides delete for non-draft rows.

## Security boundaries

- New SECURITY DEFINER functions: fixed `search_path`, explicit role check from `get_my_role()`, execute revoked from `public`/`anon` (and from `authenticated` for private helpers). The counter table and `finance_security` schema have no API privileges.
- Reception keeps exactly its current finance capability minus the new limits. No new read of `financial_events` for anyone; the review list is director-only and returns only the fields listed.
- **Corrected in PCR-r2 (review I5):** `service_role` does hold UPDATE, DELETE and TRUNCATE on `receipts` (055), so the API-key holder could otherwise change or remove rows. The new triggers refuse number changes, hard deletes and truncation for every role. The two settings that open a narrow exception (`english_hills.historical_receipt_numbering`, `english_hills.receipt_test_cleanup`) are honoured only when `pg_has_role(session_user, 'postgres', 'MEMBER')` is true (corrected in PCR-r2, re-review N1), and no PostgREST request can set them. `service_role` keeps its existing ability to update other receipt columns (unchanged by this plan, not used by the app).
- No PII enters `crm_activities` beyond what the existing review activity carries (ids and statuses). No PII in the gap register.

## Migration approach

- Two forward migrations named `XXX_finance_corrections_numbering_guardrails.sql` (E-2) and `XXX_payroll_rules_and_guards.sql` (E-3). Numbers are chosen just before merge from `supabase/migrations`, CURRENT_STATE and open PRs (today: ledger 001–118; parked PRs #121/#124 and Premium Release B carry provisional numbers).
- Each redefined function starts from `pg_get_functiondef` of its latest definition on a local database at the then-current ledger (not from an older migration file), changing only what this plan states; header comments list the changes, as 113 did.
- Both migrations are transactional and additive except the two drops (FIN-12). E-2 must run migration first, then the app within minutes (the new form sends `discount_reason_code`; an old form would be refused for a discounted new charge in between).
- CI rehearsals: `test-premium-retirement-upgrade-113-current.sql` asserts `receipt_number_seq` advances by 5; it must assert the counter instead (same kind of ceiling fix as earlier releases).
- **SQLSTATE rule (Batch C, approved):** the E-2 migration contains no `40001` literal. Where the wrapper raises its busy refusal, and in the new void lock (P1.1), the code is `PT409`, whichever of C and E merges first. Batch A's SQLSTATE guard (PR #155) enforces zero new `40001` literals in new migration files.

## Data cleanup plan (not run; each step needs the owner's explicit approval)

The Supabase plan has no backups; each step therefore writes a private journal (ids and before values, no names) outside the repository before changing anything, runs in one transaction with expected counts asserted, and has a written reverse script.

| Step | When | What | Expected counts (2026-10-24) |
| --- | --- | --- | --- |
| **D1** historical numbers | after E-2 | number the 54 rows `EH-HIST-2026-0001` to `0054` (Q6 = B) in `(date, created_at, id)` order; add and validate `receipts_number_required`. Execution path: the documented `supabase db query --linked` wrapper used for earlier Production steps (session user `cli_login_postgres`, a member of `postgres`); R0 re-reads `select session_user, pg_has_role(session_user,'postgres','MEMBER')` through that same path and stops if it is false | 54 updated; 0 null after |
| **D2** existing unpaid confirmed enrollments | after E-2 | for each enrollment already in that state, take the P1.1 locks and call `finance_security.review_enrollment_without_live_payment(enrollment, 'payment-void-review-backfill:'||enrollment_id, {action: 'backfill_d2'})`; the key is per enrollment, so a rerun is a no-op. Plan D's data step C4 ends active enrollments of archived learners; if it has run first, these 2 enrollments are no longer Confirmed and the CRM trigger has already flagged the lead as a downgrade, so D2 finds nothing to do (counts are re-read on the day) | 2 enrollments; 1 lead flagged, 1 activity (0 if Plan D's C4 ran first) |
| **D3** legacy rounding | after E-2 and Q8 | per Q8 | 14 overpaid + 3 tiny balances (17 charges) |
| **D4** register | with the E-2 release record | gap table for the accountant; no database write | 22 gaps, 163 numbers |

Enrollment statuses of the 2 archived learners are left to the director (Batch D's leaver flow will cover archiving).

## Tests

Database (new `scripts/test-finance-batch-e.sql`, rollback-only, synthetic data, wired into `verify.yml` local-database job):
- Numbering: a payment that fails after the receipt insert (mismatched enrollment, CRM-match guard, enrollment trigger error) leaves the counter unchanged; the next committed receipt is exactly +1; a supplied number is refused; update of a number, hard delete and truncate are refused for `service_role`; the seed equals the maximum; `lpad` above 99,999; year from the Casablanca issue date at 23:30 UTC on 31 December (via `business_date`).
- Concurrency: extend `scripts/test-receipt-concurrency.sh` with two sessions issuing receipts at once (both commit, consecutive numbers) and one rolling back (no gap). **Void against payment (PCR-r2):** two sessions on the same learner and enrollment, in both orders (payment holds its transaction open while the void starts, and the reverse): the end state never has a flag set while the enrollment has a live receipt, no deadlock is reported, and a void that meets an exclusive CRM linkage lock gets `PT409`.
- Corrections: void and delete of the last live payment flag a CONVERTED lead once with the activity; a void that leaves another live receipt does nothing; non-CRM enrollment appears in the list only; replay does nothing; enrollment, learner and lead status unchanged. **Q1-B clear rule (PCR-r2):** a void-raised flag clears on a replacement payment; the cycle void → replacement → void → replacement clears twice (two cleared activities); a flag raised by a downgrade, or a mix of void-raised and downgrade-raised activities since the last clear, never clears; a flag set when a LOST (and a NOT_QUALIFIED) lead converts is never cleared, and a later void on that lead writes no second activity.
- **Lifecycle (PCR-r2):** with a synthetic lifecycle configuration in which every other gate passes, `crm_security.lifecycle_hold` returns `conversion_review_required` for the lead's `converted` delivery while the flag is set and no longer returns it after the Q1-B clear.
- Guardrails: per role, discount without reason, above the reception cap, future date, outside each back-dating window; reception below-threshold first payment (no enrollment → Under Review; linked Submitted stays; no `Enrolled`; no conversion); crossing payment confirms; admin/director unaffected; pre-migration request keys still replay; **a request committed inside the window replays its original receipt when retried after the window has passed (PCR-r2).**
- Test cleanup and owner-level guard (PCR-r2, N1): a hard delete without the cleanup setting is refused for every role; with the setting, a synthetic login role created in the test as a member of `postgres` (mirroring `cli_login_postgres`) succeeds for both exceptions (test cleanup and historical numbering), while a connection whose session user is a synthetic login role that is **not** a member of `postgres` (mirroring PostgREST's `authenticator`) is refused, both as itself and after `set role service_role` and `set role authenticated`. (A `set role` from a `postgres` session would not prove the refusal, because `session_user` stays `postgres`.)
- Reports: `charge_balances` "En retard" and the monthly summary on Casablanca boundaries; obsolete functions absent; review list denied to admin, receptionist, teacher, parent, anon.
- Payroll (E-3): rule-set immutability after validation, director-only validation, create refused without a validated set or a teacher regime, transition and delete guard, `payroll_reopen`.

Application: unit tests for `calculate.mjs` against worked examples supplied by the accountant (at least one employee below and one above 6,500 MAD with dependants, one vacataire); `test-receipt-client-regressions.mjs` extended for the export columns, `receiptStatus` on the Casablanca date, the draft-key recovery and the duplicate prompt; a browser check of the receipt form limits and the director list. Existing suites (`test-receipt-charge-payments.sql`, `test-delete-mistaken-receipt.sql`, `test-premium-retirement-finance.sql`, `test-receptionist-batch1.sql`, CRM suites) must pass unchanged except these documented changes: the two assertion updates (`test-receptionist-batch1.sql` lines 146–147, `test-premium-retirement-upgrade-113-current.sql` sequence assertion) and the sanctioned-cleanup wrapping of the five test scripts in P2.3a.

## Rollout and rollback

- **E-1 (Tier 2):** normal PR → CI → independent review → owner merge; Vercel deploy. Rollback: revert the commit.
- **E-2 (Tier 3):** R0 read-only checks (ledger, live bodies equal to the expected latest definitions, sequence and maximum number, no receipt in the last 10 minutes); R1 migration (after a Production dry run in a rolled-back transaction); R2 merge and deploy within minutes; R3 zero-payment probes and role denials only, counter unchanged; R4 the first real receipts are checked as consecutive. Data steps D1–D3 follow under their own approvals.
- **E-2 rollback:** application revert plus a forward migration restoring the previous bodies of the redefined functions and view, dropping the new triggers, and running `setval('receipt_number_seq', <counter value>, true)` so numbering continues without overlap; the counter table, columns and `finance_security` schema stay (harmless). The two dropped functions are not restored (no caller).
- **E-3 (Tier 3):** same flow; payroll stays blocked until the director records the accountant's validation in the UI (an ordinary application action, not a release step). Rollback: forward migration dropping the guard trigger and functions; the interim stop from E-1 remains.

## Cross-batch coordination

- **Batch C — conflicts without retry loops ([plan](conflicts-without-retry-loops.md), revision NRC, approved 2026-10-24, plan merged as PR #151; [ADR-009](../decisions/ADR-009-conflicts-never-retryable.md)).** Its ADR makes `PT409` the code for every deliberate conflict, and its migration changes the wrapper's busy refusal from `40001` to `PT409`. E-2 uses `PT409` for that refusal and for the new void lock, never `40001`, whichever merges first. If C merges first, E-2 starts from C's wrapper body; if E-2 merges first, C rebuilds from E-2's. The browser recognises the void refusal through C's `isRecordConflict` when present, otherwise through the `PT409` code.
- **Batch D — enrollment and group consistency ([plan](enrollment-group-consistency.md), revision EGC-r2, approved, plan merged as PR #154).** D also redefines `create_charge_payment` (FIN-10, the learner status on payment). **Coordinator decision (2026-10-24): this plan governs the order of the payment checks; they are not reordered** (P2.4). Plan D's earlier text saying that Batch E "moves validations before the inner financial call" has been corrected: the merged Plan D defers to this plan for check order and receipt numbering. Whichever of D and E merges later rebuilds from the merged wrapper and keeps both changes: D's status rule and E's Q5 threshold path (below the threshold the learner is not set to `Enrolled`).
- **Batch A — CI (PR #155).** Its SQLSTATE guard rejects new `40001` literals; it may also wire `test-receipt-concurrency.sh` into CI, which is why that script's cleanup must fail loudly (P2.3a).
- Rule for all three: the later PR starts from `pg_get_functiondef` of the definitions already merged, never from this plan's baseline files.

## Tier

**Tier 3** overall (finance engine, numbering of issued documents, conversion integrity, migrations on Production data, payroll). **E-1 is Tier 2**: presentation, export, client-side safeguards and one capability restriction (payroll creation off); no schema, RLS, authority or financial write path changes.

## Owner decisions required

**Q1 — When a cancelled payment leaves a confirmed enrollment with no active payment, what happens in the CRM?** (blocks E-2)
- A: flag the CRM conversion for review immediately; the flag stays (no "review done" action exists, so every "cancel and re-enter" correction leaves a permanent flag).
- B: flag immediately, and clear it automatically if a replacement payment is recorded on the same enrollment, only when the flag came from a payment cancellation.
- C: no CRM flag; only the director list shows it.
- **Recommendation: B.** It makes the cancellation visible at once and does not punish the normal "cancel and re-enter" correction.

**Q2 — Must a discount have a reason?** (blocks E-2)
- A: yes, chosen from a short list (Fratrie, Ancien élève, Promotion/offre, Accord de la direction, Autre + text). B: yes, free text. C: no.
- **Recommendation: A.** Quick at the desk and easy to review; 45 of 86 recent charges had a discount and none says why.

**Q3 — Maximum discount reception may give without the director?** (blocks E-2)
- A: none (0%). B: 10%. C: 20%. Admin and director keep no cap (reason still required).
- **Recommendation: B (10%).** Reception has given no discount so far; larger ones are entered by admin or the director.

**Q4 — Limits on the payment date?** (blocks E-2)
- A: never in the future; reception up to 7 days back; admin and director up to 31 days back. B: only "never in the future". C: no limit (today).
- **Recommendation: A.** The longest real backdating so far is 8 days, by admin.

**Q5 — May reception confirm an enrollment with a small first payment?** (blocks E-2)
- A: yes, any amount confirms (today); SECURITY_RULES is amended to say so. B: only when the payments on that agreement reach at least a threshold of the net price (10% or 20%); below it the receipt is issued and the enrollment waits for the director. C: never; the director confirms every reception enrollment.
- **Recommendation: B with 10%.** It closes the "1 MAD confirms" loophole without slowing ordinary deposits; reception's first payments so far were all at least 33%.

**Q6 — How do the 54 September receipts get a number?** (blocks D1 only)
- A: use the numbers of the paper receipts or the payment-tracking spreadsheet, if they exist. B: a separate historical series, `EH-HIST-2026-0001` to `0054`, in payment-date order. C: the next numbers of the main series (425…), out of date order. D: keep them without a number and label them "Reçu historique".
- **Recommendation: A if paper numbers exist; otherwise B.** B keeps the main series chronological and makes the historical batch obvious to an accountant.

**Q7 — Which year goes in a receipt number, and does the counter restart each year?** (blocks E-2)
- A: the year the receipt is issued (Casablanca), one continuous counter as today. B: the year of the payment date (today's behaviour), continuous counter. C: restart at 00001 every January.
- **Recommendation: A.** Numbers then always follow issue order; nothing changes for staff.

**Q8 — Legacy rounding (14 slightly overpaid, 3 owing 0.05 MAD)?** (blocks D3 only)
- A: a logged correction of the 17 legacy agreements so the price equals what was paid; check the paper receipt of the 25 MAD case first. B: correct only the 3 tiny balances. C: leave them.
- **Recommendation: A.**

**Q9 — Payroll before first use.** (blocks E-3 acceptance; the E-1 stop needs only a yes)
- Switch payslip creation off now (E-1) until the accountant validates? **Recommendation: yes.**
- The accountant validates the rule set, provides worked examples for the tests, and decides each teacher's regime (all 9 teachers are "Freelance" today; for non-permanent teachers of a private teaching establishment the law sets 30% withholding, not the 20% in the code). **Recommendation: mandatory; the system refuses payslips until you record that validation.**

Nothing in this plan changes without these answers; recommended options are proposals, not approvals.

## Expected modules

`supabase/migrations/XXX_finance_corrections_numbering_guardrails.sql`, `supabase/migrations/XXX_payroll_rules_and_guards.sql`, `supabase/manual/` (D1–D3 scripts and reverse scripts), `scripts/test-finance-batch-e.sql`, `scripts/test-receipt-concurrency.sh`, `scripts/test-receipt-client-regressions.mjs`, `scripts/test-receptionist-batch1.sql`, `scripts/test-premium-retirement-upgrade-113-current.sql`, the P2.3a scripts (`scripts/test-crm-phase6-concurrency.py`, `scripts/test-crm-phase7-concurrency.py`, `scripts/test-receptionist-browser.mjs`, `scripts/test-receipt-deletion-browser.mjs`, `scripts/sync-payment-tracking.mjs`, `scripts/generate-payment-tracking-sql.mjs`, `scripts/README-payment-tracking-sync.md`), `src/lib/crm/presentation.mjs`, `.github/workflows/verify.yml`, `src/components/receipts/ReceiptForm.jsx`, `src/app/(admin)/finance/page.jsx`, `src/app/(admin)/dashboard/page.jsx`, `src/app/(admin)/reports/page.jsx`, `src/app/(admin)/receipts/[id]/edit/page.jsx`, `src/app/(admin)/receipts/[id]/delete/page.jsx`, `src/app/(admin)/receipts/[id]/print/page.jsx`, `src/lib/receiptPdf.js`, `src/lib/receiptFinance.js`, `src/lib/payroll/calculate.mjs`, `src/app/api/admin/payroll/route.js` (+ `preview/route.js`), `src/app/(admin)/payroll/page.jsx`, the five REL-7 form files, and docs: [receipt model](../../receipt-financial-model.md), [PRODUCT_RULES](../../ai/PRODUCT_RULES.md#conversion-and-finance), [SECURITY_RULES](../../ai/SECURITY_RULES.md), [CURRENT_STATE](../../ai/CURRENT_STATE.md), ADR-012.

## Approval record

- **Date and time:** 2026-10-24 15:53 Asia/Shanghai (UTC+08:00), 07:53 UTC.
- **Owner's words (verbatim):** "all recomended and for E6 paper numbers dont exist". The owner had been shown each plan's owner questions with the plan's recommended option. "all recomended" covers Q1–Q9; "E6" is this plan's Q6: paper receipt numbers do not exist, so the recommendation for that case (B) applies.
- **Channel:** chat with Claude, relayed by the coordinating session.
- **Approved revision:** PCR-r1 at exact head `a6cce4e` of branch `docs/plan-e-payment-corrections-receipts` (PR #152).
- **Options chosen:**
  - Q1 = **B** (flag the CRM conversion at once; clear it automatically only when a replacement payment is recorded on the same enrollment and the flag came from a payment cancellation).
  - Q2 = **A** (discount reason from a short list: Fratrie, Ancien élève, Promotion/offre, Accord de la direction, Autre + text).
  - Q3 = **B** (reception may give at most 10% without the director; admin and director keep no cap, reason still required).
  - Q4 = **A** (never in the future; reception up to 7 days back; admin and director up to 31 days back).
  - Q5 = **B with 10%** (a reception payment confirms the enrollment only when payments on that agreement reach at least 10% of the net price; below it the receipt is issued and the enrollment waits for the director).
  - Q6 = **B** (paper numbers do not exist: a separate historical series `EH-HIST-2026-0001` to `EH-HIST-2026-0054`, in payment-date order).
  - Q7 = **A** (year of issue, Casablanca; one continuous counter).
  - Q8 = **A** (logged correction of the 17 legacy agreements; check the paper receipt of the 25 MAD case first).
  - Q9 = **yes to both**: switch payslip creation off now (E-1) until the accountant validates; the accountant's validation is mandatory and the system refuses payslips until it is recorded.
- **Scope of this approval:** architecture approval for implementation of E-1, E-2 and E-3 under this plan only. It does not approve any merge, migration, deployment or data step; E-1, E-2, E-3 and each of D1–D3 still need their own explicit owner approval under [Rollout and rollback](#rollout-and-rollback) and the [data cleanup plan](#data-cleanup-plan-not-run-each-step-needs-the-owners-explicit-approval).

## Review corrections (PCR-r2)

Independent review of PR #152 at head `7f1c8c4` returned CHANGES REQUIRED (numbering design found sound). PCR-r2 applies the findings and one coordinator decision **within the approved options**; no owner answer (Q1–Q9) changes, and the approval record above is kept as given for PCR-r1.

| Finding | Correction |
| --- | --- |
| I1 — no-hard-delete trigger breaks existing suites and scripts | P2.3a lists the six scripts; a sanctioned local-only cleanup (setting + owner-level session user); the one-off import scripts are retired; `test-receipt-concurrency.sh` cleanup fails loudly. |
| I2 — void not serialised with a concurrent payment or CRM command | P1.1: voids take the shared enrollment-intent lock (`PT409` on conflict) and the student, charge, receipt, enrollment and lead locks in payment order; the Q1-B check runs after the wrapper's enrollment lock (P1.4); concurrency tests added. |
| I3 — ambiguous Q1-B clear rule; LOST/NOT_QUALIFIED conversion flag | P1.4 rule: every review activity since the last clear came from a payment cancellation, the conversion was not from LOST/NOT_QUALIFIED, and the enrollment is Confirmed/Validated with a live receipt afterwards. The mechanism text now states that `evaluate_conversion` also sets the flag, without an activity, when a LOST or NOT_QUALIFIED lead converts; that flag is never cleared automatically. Tests added. |
| I4 — Plan D and Plan E disagreed on check order | Coordinator decision: Plan E governs; the checks are not reordered (P2.4, [cross-batch coordination](#cross-batch-coordination)); stop condition added; the merged Plan D defers to it. |
| I5 — security statement on `service_role` was wrong | Corrected in [Security boundaries](#security-boundaries) and the owner summary; exceptions require an owner-level `session_user`. |
| I6 — clearing the flag releases a held lifecycle delivery | P1.5 states the intended effect (dormant today) and a test proves the hold reason disappears. |
| N1 (re-review) — D1 guard refused the documented CLI path | The two exceptions accept any session user that is a member of `postgres` (P2.3b, catalog-verified that no API role is); D1 keeps the `supabase db query --linked` path with an R0 check; stop condition and test updated; ADR-012 item 2 updated. |
| Minor | Guards run after the idempotent replay (P3.6, test); Batch C approved and `PT409` used in the wrapper and void lock; `crm_activities.event_type` is a pattern check, so `conversion_review_cleared` needs no schema change; year from `clock_timestamp()` after the counter update; export ordered by series then numeric suffix; D2 has its own per-enrollment source key and action; payroll citations to CGI art. 73-II and note circulaire 733. |

## IMPLEMENTATION CONTRACT

### Scope

Implement exactly P1–P6 above as split into E-1 (Tier 2 PR, no migration), E-2 (Tier 3 PR, one migration) and E-3 (Tier 3 PR, one migration), using the options the owner records against this revision. Write, do not run, D1–D3.

### Prerequisites

- Owner approval of revision PCR-r1 (or a later revision) with answers Q1–Q9 recorded in this plan's approval record (date, exact head SHA, options). E-1 may start on approval of Q9's first point alone.
- Fresh `origin/main`; Batch 1 (CI unblock) merged so the app job is green; check whether Batch C or Batch D has redefined `create_charge_payment` (or any other function in the manifest) and build on the latest merged definition ([cross-batch coordination](#cross-batch-coordination)).
- Implementation follows the current text (PCR-r2) once its fresh re-review is clean.
- Accountant's worked examples before E-3 tests are finalised.

### Object / module manifest

E-2: `finance_security` schema; `finance_security.review_enrollment_without_live_payment`; `public.receipt_number_counters`; `public.business_date`; `public.get_finance_review_queue`; redefined `public.set_receipt_number`, `public.void_financial_receipt`, `public.delete_mistaken_receipt`, `public.create_charge_payment`, `public.create_charge_payment_financial`, view `public.charge_balances`, `public.get_monthly_finance_summary`, `public.get_finance_year_months`; triggers `receipts_number_immutable`, `receipts_no_hard_delete`, `receipts_no_truncate`; columns `charges.discount_reason`, `charges.discount_reason_code`; `financial_events` type `charge_terms_corrected` (Q8 = A); new `crm_activities` event `conversion_review_cleared` (Q1 = B; no schema change, the type column is a pattern check) with its label in `src/lib/crm/presentation.mjs`; dropped `public.get_finance_summary()`, `public.get_unpaid_receipts(integer)`; sanctioned cleanup in the five test scripts and retirement of `scripts/sync-payment-tracking.mjs`, `scripts/generate-payment-tracking-sql.mjs` and `scripts/README-payment-tracking-sync.md` (P2.3a).
E-3: `public.payroll_rule_sets`, `public.payroll_validate_rule_set`, `public.payroll_reopen`, guard triggers on `payroll_rule_sets` and `payroll`, columns `payroll.rule_set_id`, `teachers.payroll_regime`, `teachers.payroll_dependents`.

### Invariants

- No committed receipt number is ever skipped, reused, changed or hard-deleted after E-2; a rollback never consumes a number.
- Voids and deletes never change enrollment, learner or lead **status**; only the review flag/activity and the list.
- A review flag raised by an enrollment downgrade, or set when a LOST/NOT_QUALIFIED lead converts, is never cleared automatically; a payment-void flag clears only under the P1.4 rule.
- A void and a payment on the same learner are serialised (P1.1); the end state never shows a flag while the enrollment has a live receipt.
- The wrapper's checks keep their order (P2.4); conflicts raise `PT409`, never `40001`.
- New desk guards never block the replay of a committed request.
- Payment, revenue and conversion stay separate facts; CRM revenue reversal is unchanged.
- Idempotent replay of any request committed before the migration returns its original result.
- Reception gains no capability; admin/director lose none except the date window and required reason.
- No payslip without a validated rule set covering its month.
- Every new or redefined SECURITY DEFINER function has a fixed `search_path` and an explicit role check; no grant/RLS widened.

### Acceptance / tests

All tests listed under Tests pass in CI on the exact head SHA; the two documented assertion updates and the P2.3a cleanup wrapping are the only changes to existing suites; lint and build pass; browser checks of the receipt form, director list, export and payroll banner recorded with synthetic data.

### Stop conditions

Stop and report (do not improvise) if: a lifecycle producer or candidate function reacts to `conversion_review_required` or `conversion_review_cleared` activities; a merged Batch D (or any other) definition of the wrapper reorders its post-insert checks, moves them before the inner financial call, or otherwise conflicts with P2.4 or P3.4; a merged Batch C definition is missing or the E-2 migration would contain a `40001` literal; any path that locks a CRM lead and then its enrollment does so without first taking the enrollment-intent advisory lock (P1.1 deadlock argument); the live Production body of any redefined function differs from its repository definition at R0; the counter seed differs from the maximum issued number; the D1 execution path's session user is not a member of `postgres`, or any API-facing role (`anon`, `authenticated`, `service_role`, `authenticator`) has become a member of `postgres`; any existing finance or CRM suite needs more than the documented changes; an owner answer is missing for a part being implemented.

### Docs / status reporting

Update the receipt model (numbering, corrections, guardrails), PRODUCT_RULES (conversion and finance: void review rule, reception confirmation threshold), SECURITY_RULES (reception finance limits, director review list, payroll validation), CURRENT_STATE only with release evidence, ADR-012 status on acceptance, this plan's implementation record per release. Hand off with the AGENTS.md implementation status, PR, head/base SHA, CI run, migration filename and open decisions.

## Implementation record

### E-1 (Tier 2, app only)

- **Branch:** `feat/batch-e1-payment-corrections`, from `origin/main` `b0b6a83209fa8576029db8b1c0894a585dbad1e6` (2026-10-26). The PCR-r2 re-review called for in the status line has no record in the repository; implementation was started on the owner's instruction of 2026-10-26 to implement PCR-r2.
- **Scope delivered:** P4 FIN-5 (export), FIN-9 (dashboard card, reports totals), FIN-8/REL-7 app part (dashboard month, `receiptStatus`, five form defaults); P2.6 "Reçu historique" on PDF, print, correction and deletion screens; P5 (pending key recovery after reload, identical-receipt prompt); P6 interim payroll stop. Details in the [receipt model](../../receipt-financial-model.md#batch-e-release-e-1-app-only-not-yet-merged).
- **Deviations:** none from the plan's text. Choices within it: the pending key is stored only for a nonzero payment (a zero payment issues no receipt to look up); a failed lookup keeps the key and shows a warning instead of starting over; the identical-receipt prompt names the payment date when it is not today; deleted receipts count as cancelled in the export, like voided ones.
- **Tests:** `scripts/test-receipt-client-regressions.mjs` (export order and amounts, Casablanca boundaries with fixed-offset zones, pending-key recovery including blocked storage, wiring of the five forms, payroll stop order); `npm test`, lint, build. Local browser check (2026-10-26, private local Supabase at ledger 001–121, built app at commit `c995495`, synthetic director and learner, Playwright): payroll banner, disabled creation and `POST` 409; dashboard monthly card; identical-receipt prompt dismissed with no request sent; reload recovery for a recorded and an unrecorded key; CSV export header and row.
- **Shared files with Batch F (portal readiness):** `src/app/(admin)/parent-portal/page.jsx` (one default date and its import), `src/lib/receiptPdf.js` (number label), `src/app/api/admin/payroll/route.js` (Batch F adds an Origin check at the top of the same handler). No function or policy is shared.
