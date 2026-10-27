# Payment corrections E-2: migration 122 Production release — 2026-10-27

Release record of Batch E release E-2, steps R0–R4 ([plan PCR-r2](../plans/payment-corrections-receipts.md#e-2-release-record)). Counts, hashes and identifiers only; no personal data, no receipt number tied to a person. Times are UTC (Casablanca is UTC+0).

## Approval and scope

- **Owner approval:** Maroine, 2026-10-27 12:43 Asia/Shanghai, verbatim: "approve E-2 release now" (fresh backup, R0, R1 migration 122, R2 squash-merge of PR #164 at `6d681c06b39d1dd33672c75571d2fa82a4791adb`, R3 non-mutating checks, R4 observation of the first real receipts).
- **R0 difference accepted:** the plan's figure (next receipt 424) was stale; R0 found the seed at 443. The owner accepted it at 12:52 Asia/Shanghai: "the plan's 424 figure was stale; 20 consecutive receipts (424–443) were issued since. The correct seed is 443 (next receipt EH-2026-00444)."
- **Not approved, not run:** D1 (historical numbers), D2 (backfill review), D3 (legacy rounding), the gap register (D4), E-3 and every other Production change. No zero-payment probe was run (it would create a charge).

## Backup (04:46:41–04:56:02)

`supabase db dump --linked` into a private folder on the owner's computer (not committed, contents not printed): `schema.sql` 1,164,690 bytes (exit 0, no CLI error, last statement complete, 421 functions; the CLI strips comments from schema dumps), `data.sql` 5,620,038 bytes (exit 0, ends with the end-of-dump marker), `roles.sql` 297 bytes (exit 0, ends normally).

## R0 — read-only checks (04:47–04:56)

| Check | Result |
| --- | --- |
| Reviewed file | `122_finance_corrections_numbering_guardrails.sql` on `6d681c06…`: MD5 `f422fea18f0df12dc77d79a683773b21`, blob `9e9a951de1512d4ee093c86c7d89c35f0f67bb7f`; no `40001` literal |
| PR and CI | PR #164 open at exactly `6d681c06…`, `required` success, mergeable `CLEAN`; `origin/main` `7eb3194`, no commit since |
| Ledger | 121 rows, highest `121`, no 122/123; row 121 MD5 `32cf1924…` |
| Drift proof | Production equal to a clean local 121 build on all nine catalog digests (functions `…/421` incl. owner, ACL, security definer, config; triggers on application tables, policies, constraints, indexes, columns, relations, schema grants), so the live bodies of every object 122 re-creates equal their expected latest definitions (wrapper 120, inner 113, voids 055/076, `set_receipt_number` 026, `charge_balances` 057, summaries 055) |
| Counter | `receipt_number_seq` last value **443** (`is_called`), highest issued main-series suffix **443**; the migration's seed expression computes **443**, next receipt **EH-2026-00444**. Numbers 424–443: 20 receipts, consecutive, none voided or deleted, issued 2026-10-21 16:32 – 2026-10-26 17:04 (the plan's 424 was stale; accepted by the owner) |
| Activity | 0 receipts in the last 10 minutes (04:47 and 04:56); 334 receipts; **54** unnumbered historical receipts |
| Counters (04:56:27) | `xact_commit` 3,072,887; `xact_rollback` 391,314,443; catalog snapshot (421 functions, 153 triggers, 170 policies) SHA-256 `459bc4cf5c19f1abdd13e6ed10b3296937744ce2577a428d94b22709d078ba90` |

## R1 — migration 122 through the guarded wrapper (04:56:34–04:57:05)

One transaction, `lock_timeout` 5 s: the seed computed first, ledger preconditions (121 rows, row 121 MD5, no 122/123, no `finance_security` schema or new tables), the nine pre-digests, the file's lines 19–947 verbatim, ledger row `122` / `finance_corrections_numbering_guardrails` with the whole file and `created_by` copied from row 121, then postconditions (122 rows, row 122 MD5, `created_by`, one counter row equal to the computed seed, the nine post-digests of the rehearsed build). Dry run SHA-256 `e0ed772af7e4292bba78fa10b5513ff105e340d4ea1ee24ee6629f69c7414163`, apply `648f552cf7b1746ffab9e7f8d0145d9c59dc98407384b74277c13055c52bafdd`, identical except for the sentinel. Local rehearsal on a clean 121: dry run `DRYRUN_OK`, a planted function refused (`R1_PRE_FUNCTIONS`), apply committed, a second apply refused (`R1_PRE_LEDGER`).

| Step | Result |
| --- | --- |
| Production dry run (04:56:34–04:56:41) | `DRYRUN_OK all 122 guards passed; counter=443 next=EH-2026-00444 functions=fa41a023a6941a6b2b8d5e0543f2d7e8/424 triggers=77e89d29a2fd9b0908d4099949c7c1b9/156 policies=77504f1768abbd3c3b3fbb6c301bd06f/172`; afterwards ledger 121, sequence 443, no new table, no `finance_security`, 334 receipts |
| Production apply (04:56:59–04:57:05) | exit 0, committed; ledger 122, row 122 MD5 `f422fea1…`, counter 443 |

## R2 — merge and deployment

| Step | Result |
| --- | --- |
| Squash-merge (04:57:11–04:57:14) | PR #164 at `6d681c06…` merged as **`e840f6a88a0f53d0ae2b4207e6b8db2170dcb86a`** |
| Production deployment | GitHub `Production` deployment **`7350728304`**, `success` at **04:58:26** (81 s after the apply committed) |

## R3 — non-mutating checks (04:58:39–04:59:41)

| Check | Result |
| --- | --- |
| Ledger | 122 rows, 001–122; row 122 `finance_corrections_numbering_guardrails`, one element, stored statement MD5 **`f422fea18f0df12dc77d79a683773b21`**, `created_by` equal to row 121's |
| Catalog diff | functions 421 → 424: **added** `business_date(timestamptz)`, `finance_security.guard_receipt_delete()`, `finance_security.guard_receipt_number()`, `finance_security.review_enrollment_without_live_payment(uuid,text,jsonb)`, `get_finance_review_queue(date)`; **dropped** `get_finance_summary()`, `get_unpaid_receipts(integer)`; **re-created** `create_charge_payment`, `create_charge_payment_financial`, `void_financial_receipt`, `delete_mistaken_receipt`, `set_receipt_number`, `get_monthly_finance_summary`, `get_finance_year_months`; triggers 153 → 156 (`receipts_number_immutable`, `receipts_no_hard_delete`, `receipts_no_truncate`); policies 170 → 172 (the two `charge_discount_reasons` read policies); tables `receipt_number_counters` and `charge_discount_reasons`, the `charge_balances` view and the `finance_security` schema in the relation/schema digests; nothing else. All nine digests equal to the rehearsed build |
| Counter | **443** (next EH-2026-00444); sequence 443; highest issued suffix 443; 334 receipts; 54 unnumbered — unchanged by every check |
| Grants | counter table: no access for `anon`, `authenticated`, `service_role`; `finance_security`: no `USAGE` for the API roles; `set_receipt_number()` not executable by the API roles; `charge_discount_reasons`: RLS on, `SELECT` only for `authenticated` (no write, nothing for `anon` or `service_role`), two policies limited to admin/director and to reception on non-archived learners (no parent or learner branch); `get_finance_review_queue`: not executable by `anon`, executable by `authenticated` with a director check inside; the receipt guard triggers present |
| Role refusals (write nothing) | a receptionist calling `get_finance_review_queue` → `Forbidden`; a parent reading `charge_discount_reasons` → 0 rows (that parent also sees 0 charges, so the policy check above is the stronger proof) |
| Codes | 0 functions with `'40001'` |
| Skipped | zero-payment probes (they create a charge); any receipt, charge or payment write |
| Postgres logs 04:40–05:01 | no unexpected `ERROR`/`FATAL`; matches are the dry run's sentinel, the two logged wrapper statements and the receptionist refusal |
| PostgREST / API logs 04:40–05:01 | no new error; no 4xx/5xx |
| Anonymous routes (04:59:40) | `/` and `/crm/leads` → 307 to `/login` |
| Vercel runtime errors | not verified (no Vercel access from the release session) |

## Passive observation (30 minutes)

Window 04:57:05–05:28, final read at **05:27:30** (30 minutes after the apply).

| Check | Result |
| --- | --- |
| Counter and receipts (05:27:30) | counter **443** (next EH-2026-00444), sequence 443, highest issued suffix 443, 334 receipts, 54 unnumbered: unchanged |
| Catalog and ledger | unchanged: row 122 MD5 `f422fea1…`, 3 receipt guard triggers, 0 `'40001'`, all nine digests equal to the rehearsed build |
| Counters | `xact_rollback` **391,314,445**: +2 since the before-values, the dry run's sentinel rollback and the receptionist refusal probe (a read-only transaction that raised `Forbidden`); `xact_commit` 3,073,920 (+1,033 since 04:56:27, normal background traffic) |
| Postgres logs 04:59:45–05:28 | 24 entries, no `ERROR`/`FATAL` |
| PostgREST logs | 10 entries, only the recurring timeout-manager line |
| API (edge) logs | 17 requests, no 4xx/5xx |

## R4 — first real receipts

No real receipt was issued during the observation window (0 receipts created after the apply). How to verify the first real receipts, read-only, counts and numbers only:

1. The first receipt issued from now on must be **EH-2026-00444**, then 00445, and so on; after *n* new receipts the counter (`receipt_number_counters`, series `EH`) equals 443 + *n*.
2. Check: among receipts created after 2026-10-27 04:57:05 UTC, `count(*)` equals `max(suffix) − min(suffix) + 1` and `min(suffix)` is 444 (no number skipped); every new number matches `EH-2026-` followed by at least five digits.
3. A failed or rolled-back payment (validation error, retry, double submit) must not consume a number: the next committed receipt is still exactly the counter + 1.
4. The `receipt_number_seq` sequence stays at 443 (retired, unused).

## Still open

- D1 (historical numbers `EH-HIST-2026-0001`–`0054` and the `receipts_number_required` check), D2 (backfill review of unpaid confirmed enrollments), D3 (legacy rounding, Q8), the gap register (D4) and E-3 (payroll, waits for the accountant), each under its own approval.
- `receipt_number_seq` stays in place, unused, as the rollback aid (rollback: application revert plus a forward migration that restores the previous bodies and runs `setval('receipt_number_seq', <counter>, true)`).
