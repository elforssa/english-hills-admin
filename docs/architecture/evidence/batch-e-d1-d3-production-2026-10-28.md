# Payment corrections: data steps D1 and D3 in Production — 2026-10-28

Release record of Batch E data steps D1 (historical receipt numbers) and D3 (legacy rounding) ([plan PCR-r2](../plans/payment-corrections-receipts.md#d1d3-release-record)). Counts, hashes and identifiers only; no name, no receipt number tied to a person, no charge id. Times are UTC (Casablanca is UTC+0); reception was closed.

## Approval and scope

- **Owner approval:** Maroine, 2026-10-28 11:39 Asia/Shanghai, verbatim: "approve D1: 54 (EH-HIST-2026-0001–0054, main counter stays 443) and approve D3: 16, hold the 25 MAD charge for manual review". D1 and D3 only, with exactly these counts.
- **D2 not needed:** 0 targets. The plan's 2 enrollments (1 lead) were already ended by Batch D's clean-up step C4 (2026-10-26); the dry run with 0/0 ended `DRYRUN_OK D2 enrollments=0 flags=0`. Nothing to run.
- **Not approved, not run:** D2, the gap register (D4), E-3, the D1/D3 reverse scripts, Batch F R3 and every other change.
- **Path:** the reviewed files from `main` (`1f2ff6d`) through `supabase db query --linked --project-ref …` (Management API; session user a member of `postgres`). A full `supabase db dump` is not possible from the release computer (its VPN drops direct Postgres sessions), so a targeted export replaced it.

## Read-only preparation (03:17–03:23, approved separately as dry runs only)

Targeted export to a private folder (not committed), dry runs `DRYRUN_OK D1 rows=54`, `DRYRUN_OK D2 enrollments=0 flags=0`, D3 as written refused ("a charge was paid above its gross price; review it by hand"), D3 with that charge held `DRYRUN_OK D3 rows=16`. After the four dry runs, charges and receipt numbers were identical to the export; only `xact_rollback` moved (+4).

## Targeted export before the real steps (03:40:54–03:42:47)

Private folder on the owner's computer, created with mode 700, contents never printed, with `SHA256SUMS` (14 entries, 1,205 bytes). Each file is the JSON of one read-only query:

| File | Rows | Bytes |
| --- | --- | --- |
| `receipts.json` | 334 | 515,212 |
| `charges.json` | 329 | 203,297 |
| `financial_events.json` | 236 | 85,319 |
| `charge_discount_reasons.json` | 0 | 2 |
| `d2_enrollments.json`, `d2_crm_leads.json`, `d2_crm_activities.json` | 0, 0, 0 | 2 each |
| `students_emails.json` (id, e-mail, parent e-mail, archive date) | 237 | 28,358 |
| `profiles_emails.json` (id, e-mail, role, links) | 5 | 797 |
| `teachers_emails.json` | 9 | 995 |
| `messages_emails.json`, `notifications_emails.json` | 0, 0 | 2 each |
| `d1_journal.json` (ids and dates) | 54 | 6,480 |
| `d3_journal.json` (ids and amounts) | 17 | 2,652 |

One query (`d2_crm_activities`) returned a transient API error on the first attempt and succeeded on its single retry (0 rows) before `SHA256SUMS` was written.

## Counts re-read before writing (03:43:02)

| Check | Expected | Found |
| --- | --- | --- |
| Receipts without a number | 54 | 54 (journal identical to the dry run's) |
| Main counter / highest EH-2026 number / retired sequence | 443 / 443 / 443 | 443 / 443 / 443 |
| Historical series present | 0 | 0 |
| D3 candidates (live legacy, overpaid or owing under 1 MAD) | 17 | 17: 14 overpaid, 3 small balances; identical to the dry run's journal |
| D3 charges paid above their gross price (held) | 1 | 1 (overpaid by 25 MAD) |
| D3 targets after the hold | 16 | 16 |

## D1 — historical receipt numbers (03:43:16–03:43:23)

File `supabase/manual/batch_e_d1_historical_receipt_numbers.sql` at blob `00b325171587fb415ed8e54c4830702590bd4567` (MD5 `1c011a96ed0d595a379a55a10a6566d4`); the only change was the switch `batch_e.dry_run` `'on'` → `'off'` (run copy SHA-256 `e8acf8adbaa8bf4cee4a93030634578c56f35d6d29aefe38bd7efdf427764754`); expected rows 54 as written. Exit 0, committed.

| Check after | Result |
| --- | --- |
| Receipts without a number | **0** (334 receipts) |
| Historical series | 54 numbers, all `EH-HIST-2026-NNNN`, unique, exactly `0001`–`0054`, no gap or duplicate |
| Order | the n-th receipt of the journal (date, created_at, id order) carries `EH-HIST-2026-` n; the numbered set equals the journal's 54 ids |
| Other receipts | the 280 previously numbered receipts keep their numbers exactly |
| Main series | highest EH-2026 number 443, counter 443 (next EH-2026-00444), sequence 443: unchanged |
| Constraint | `receipts_number_required` `CHECK ((receipt_number IS NOT NULL))`, validated |
| Activity log | +54 entries (one per renumbered receipt, `log_activity_t`) |
| Journal | 54 rows (saved privately before the step) |

## D3 — legacy rounding (03:44:08–03:44:14)

File `supabase/manual/batch_e_d3_legacy_rounding.sql` at blob `a9d43146ae05ed56f446d8ba71a0386d8e83b5a1`. Only the four lines of its own `PARAMETERS` block were set, as documented in the file; every other line is identical: `d3_expected_rows` 16, `d3_hold_ids` the one charge paid above its gross price, `d3_actor` the director's profile (selected by role; the only director), `dry_run` `'off'`. Exit 0, committed.

| Check after | Result |
| --- | --- |
| Charges changed | exactly the 16 targets; only `discount_amount` and `updated_at` changed |
| Net vs paid | for all 16, net price = amount paid, balance 0; status `Soldé` (the 3 small balances and the 13 overpaid charges) |
| Events | 16 `financial_events` rows `charge_terms_corrected`, step `D3`, one per target, actor the director; each "before"/"after" equals the charge's discount before and after (`financial_events` 236 → 252) |
| Held charge | unchanged (every column identical to the export); still shows as `Soldé` because it is overpaid |
| Receipts | no column of any receipt changed (besides D1's numbers); amounts paid of all 17 candidates unchanged |
| Journal | 17 candidate rows saved privately before the step; 16 corrected, 1 held |

## Reverse scripts (read-only count, not run; 03:45:41)

Their own target predicates: `batch_e_d1_reverse.sql` would find **54** historical numbers; `batch_e_d3_reverse.sql` would find **16** charges (latest D3-family event is a forward D3 correction, discount still equal to its "after", not voided). Neither was run.

## Logs and routes (03:40–03:47)

Postgres logs: 10 entries, no `ERROR`/`FATAL`. PostgREST: the recurring timeout-manager line only. API (edge) logs: 4 requests, no 4xx/5xx. `/` and `/crm/leads` → 307 to `/login` (03:45). Vercel runtime errors not verified (no Vercel access from the release session).

## Still open

- **Owner item: the held charge** (legacy, paid 25 MAD above its gross price). D3 cannot correct it (the net price cannot exceed the gross price); the director checks its paper receipt and decides by hand (for example a refund or a corrected price), under its own approval.
- The gap register (D4) and E-3 (payroll, after the accountant's rates), each under its own approval.
- The targeted export must be repeated before any later real data step.
