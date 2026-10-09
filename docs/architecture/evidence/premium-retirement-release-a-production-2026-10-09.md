# Premium retirement Release A — Production release record (2026-10-08/09 UTC)

Release record for [Premium retirement](../plans/premium-retirement.md) Release A (Tier 3). It records what was released and observed. Product rules live in [PRODUCT_RULES](../../ai/PRODUCT_RULES.md); the current register is [CURRENT_STATE](../../ai/CURRENT_STATE.md). Times are UTC. Approval dates are owner-supplied; owner local time UTC+8 (Asia/Shanghai); Production's clock reads UTC, so steps run late on 2026-10-08 UTC fall on 2026-10-09 in that local time.

**State: Release A MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.** Release B (migration 114, the Premium student data step, homework file deletion) is **planned only, not approved**.

This record holds counts, hashes and timestamps only. No charge id, description, name, contact detail, payment detail, credential or export content appears here.

## Release identity

| Item | Value |
| --- | --- |
| Pull request | [#125](https://github.com/elforssa/english-hills-admin/pull/125), branch `feat/premium-retirement-release-a` |
| Reviewed and approved head | `5e3fe95e7fd7cc5a6cea29894955345d405d4ded` |
| Base (`main` before the merge) | `ebea8cf30d5ecfb9e8ef8d8dc552cf91a34e570f` |
| Exact-head CI | Verify run [37802044455](https://github.com/elforssa/english-hills-admin/actions/runs/37802044455), success (classify, app, docs, local-database, required; tooling skipped) |
| Independent review | Narrow re-review of `5e3fe95e…`: **READY FOR FINAL REVIEW**, no blocking or important findings, two non-blocking wording nits (fixed in this closeout). Source: evidence supplied by the owner; the verdict is not posted on PR #125. The reviewer stated that the verdict is not merge or release authorization. |
| Merge | `f9753cca32511812bc7a4f79187fc9386ff15b1f`, merge commit with parents `ebea8cf…` and `5e3fe95…`, tree identical to the reviewed head, guarded with `--match-head-commit`, 2026-10-08T17:00:06Z |
| Migration | `113_premium_retirement_finance_contract.sql`, SHA-256 `f4e8f89f91aace02f93db517c89c387a15124037c4da027bdf4c167dadcfae28`, 12,764 bytes |
| Vercel Production | `dpl_9pCG6uajkDSdo6rd2MNdGT9adwNN`, READY, alias `admin.english-hills.com`; GitHub deployment `6941744125` success at 17:01:37Z |
| Edge Function | `sendReceiptEmail` v19 (was v18), ACTIVE, `verify_jwt` false |
| Supabase project | `hopcezradkhrixwwswxn` |

## Owner approvals (Maroine)

Approval dates below are owner-supplied; owner local time UTC+8 (Asia/Shanghai).

| Step | Approval | Scope |
| --- | --- | --- |
| R0 | Given in the release session before the 2026-10-08 reads (the authorization states no date) | Read-only Production pre-checks only |
| R1 | 2026-10-09 | Read-only pre-A1 checks and baseline; owner decisions on backup, probes and order (below) |
| A1 | 2026-10-09 | Apply 113 through the exact wrapper (SHA-256 `c944ae21…`) via `supabase db query --linked` as `postgres`; `created_by` copied from row 112; zero-payment probe |
| A2 | 2026-10-09 | Guarded merge of the exact head, the automatic Vercel deployment, Vercel rollback authority if checks failed |
| A3 | 2026-10-09 | Redeploy `sendReceiptEmail` from a clean worktree of the merge SHA with `--no-verify-jwt` |
| A4 path | 2026-10-09 | Run D5a through the same CLI path as A1 (CLI wrapper) instead of a psql session with a database credential |
| A4 | 2026-10-09 | Export of the target set, the single D5a write, the second run and post-checks |

Owner decisions recorded at R1 (2026-10-09):

1. **Backup — owner-accepted risk.** Release A proceeded **without a full backup**: the project reported `pitr_enabled: false` and an empty physical backup list. Rollback for 113 relied on a forward migration restoring the 096 body; rollback for A4 relied on its own export. **Release B must not proceed without a backup.**
2. **Probes.** Zero-payment Yearly commitments only, rolled back, plus role-denial checks. No receipt-producing probes, because a receipt insert draws `receipt_number_seq` (trigger from migration 026), which a rollback does not return. Receipt-text proof stays with the CI 112→113 rehearsal.
3. **Order.** Migration first (A1), then the guarded merge and deployment (A2), then the Edge Function (A3); A4 separately approved.

## Access path

All database reads and writes used the Supabase CLI `supabase db query --linked` (Management API, executing as `postgres`). The CLI prints "Initialising login role…" on each call (its standard short-lived login, as in the RCC-A2 release). Every read ran with `set transaction read only` and reported `transaction_read_only = on`. Backups were listed with `supabase backups list`; deployments were read with `vercel inspect` and the GitHub deployments API. Edge Function logs after A3 were read with the Supabase connector's read-only log query. No `db push --linked` and no database password were used.

## R0 — read-only pre-checks (2026-10-08, about 16:27–16:45Z)

| Check | Count |
| --- | --- |
| Premium students | 1 (Enrolled, Yearly, not deleted; no Premium dates) of 213 students |
| Students with Premium dates but a Standard plan | 0 |
| Premium plan or dates on a non-Yearly session | 0 |
| Workshop memberships (current / future / historic) | 0 / 0 / 0 |
| Workshop groups (active / total) | 0 / 0 |
| Workshop sessions (future / total); sessions with attendance | 0 / 0; 0 |
| Homework (any status / with a file) | 0 / 0 |
| `storage_assets` and `storage.objects` for `premium_homework` | 0 rows, 0 bytes; 0 objects, 0 bytes |
| `premium_homework` notifications (sent / unsent) | 0 / 0 |
| Open non-legacy Yearly charges with a plan word (D5a target) | 10 (Standard 10, Premium 0); 0 outside the D5a pattern |
| Open non-legacy Yearly charges with no school year | 0 |
| Settled non-legacy Yearly charges with a plan word | 14 Standard, 2 Premium |
| Legacy charges with a plan value (no plan word in text) | 229 (41 Yearly, 188 other) |
| Issued receipts (of 277) | 2 Premium (plan and text); 27 Standard (plan and text); 221 plan Standard, no word in text; 19 no plan |
| Voided / deleted receipts | 2 / 6 (plan Standard, no word in text) |
| `financial_requests` | 51 (2 aged 1–7 days, 49 aged 7–30 days; none older) |
| Production ledger | 001–112, 112 rows, no gaps; 112 statement MD5 `213c9a435b93a2fa267b8e0072a95caa` |
| Backups | `pitr_enabled: false`, `backups: []` (WAL-G enabled) |
| Deployed web source | `ebea8cf…` (`dpl_HBGqjMtKxx1gmRaTYmgqJGNkHimD`); documentation-only difference from the previously recorded `b278d4c…` |
| `sendReceiptEmail` | v18, byte-identical to `ebea8cf…` |

## R1 — pre-A1 baseline (2026-10-08T16:44:07Z)

All gates passed (PR head, base, CI, CLEAN/MERGEABLE; ledger 001–112; finance function body MD5 `dceef46467bd4fea97451d7afc142750`, wrapper `1eb9803e55f30c4324da17b5dd9fdba7`; Vercel and Edge Function unchanged; 113 file hash). Catalog fingerprint: 3,719 items (functions, policies, triggers, constraints, relation grants and RLS flags, columns and column grants, indexes, views, schema and default ACLs, cron jobs), SHA-256 `63814b966e620091ed9e464680e2ad67673c9fedded8626fe0cba009e9d8d082`, identical on immediate re-capture. 166 policies and 160 triggers, as in the RCC-A2 record. `receipt_number_seq` 258; receipts 277; charges 272.

## A1 — migration 113 (2026-10-08, about 16:54–16:55Z)

- Ran the exact file in one transaction through a wrapper (SHA-256 `c944ae211d0013bc824edd213f048184182583a0bdefceecf1ff940bc2eb5caa`) that added a precondition guard (user `postgres`, ledger exactly 001–112, 096 function bodies), the ledger row inside the same transaction before the file's own `commit`, and a postcondition guard. Exit 0, no error.
- Ledger: 113 rows; tail `113 = premium_retirement_finance_contract`; stored statement one element, MD5 `647c9e2c1aec7c0c4becb044776158a4` (equals the file); `created_by` equal to row 112's (an account identity, not reproduced here); 112 statement MD5 unchanged.
- `create_charge_payment_financial(jsonb)`: body MD5 `dceef464…` → `172f28b26ad93af6ad7641083054a3d9`; owner `postgres`, SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, ACL `{postgres=X/postgres}` unchanged. `create_charge_payment(jsonb)` unchanged (`1eb9803e…`, ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`). Functions mentioning "premium": 20 → 19.
- Catalog diff against the R1 baseline: **exactly one line** changed, `create_charge_payment_financial(jsonb)` `de870eb3210d2a106259ee78e32d9371` → `cc2eeb388bd810776d9fc17ac7c6cd91` (value pre-computed before the run). Post-A1 catalog SHA-256 `da7920287eef8a1207d9d0208bc88b50127417c6fcf92b990bd741a406ec2a08`.

### Zero-payment probe (16:55:19–16:55:30Z, rolled back)

Synthetic identities and learners existed only inside the probe transaction; its final statement always raised, so nothing committed.

| Case | Result |
| --- | --- |
| Receptionist, no plan; receptionist, stale `Premium`; admin, stale `" Standard "` | Each created a charge `Yearly · 2026/2027`, plan `Standard`, year 2026/2027, no receipt; an identical replay returned the same charge with `replayed: true` |
| Premium-carrying request retried without its plan value (Q7) | `Idempotency key conflict: request contents changed.` |
| Teacher, parent, student, pending on the wrapper | `42501 Forbidden` |
| Receptionist on the inner command; `anon` on the wrapper | `42501 permission denied for function …` |
| Receipts created; sequences moved inside the probe | 0; none |
| Before / after | `receipt_number_seq` 258 / 258; receipts 277 / 277; charges 272 / 272; students 213 / 213; `financial_requests` 51 / 51; financial events, enrollments, auth users, profiles and activity log unchanged |

## A2 — merge and Vercel deployment (2026-10-08, 17:00–17:02Z)

- Pre-merge re-check passed (head, base, CI, CLEAN/MERGEABLE, ledger 001–113, 113 body MD5).
- Merge and deployment as in the identity table. Rollback target (not used): `dpl_HBGqjMtKxx1gmRaTYmgqJGNkHimD` (`ebea8cf…`).
- Unauthenticated `/`, `/premium-sessions`, `/receipts` and `/students`: 307 to `/login?returnTo=…`; `/login`: 200.
- `vercel logs --level error` for the new deployment: no entries (window of about two minutes after READY).
- Database unchanged by the merge (17:02:23Z): ledger 001–113, 113 body MD5, `receipt_number_seq` 258, receipts 277, charges 272.
- The merged `src/` tree contains no occurrence of "Formule" or "Premium".
- **Authenticated UI sweep by the owner on the live site: 8 of 8 passed** (sidebar, receipt form without submitting, receipts list, an existing receipt's print page and PDF, students list, a student page, reports, `/premium-sessions` as admin/director). The receptionist and teacher redirect checks for `/premium-sessions` are **outstanding** (non-blocking).

## A3 — `sendReceiptEmail` (2026-10-09, 02:16:19–02:16:30Z)

- Pre-deploy: `main` exactly `f9753cc…`; v18 ACTIVE with `verify_jwt` false; Vercel unchanged. The v18 → merge-SHA difference was only `index.ts`: the `formula` variable and the "Formule" table row removed; the two other files identical.
- Deployed from a clean detached worktree of `f9753cc…` with `supabase functions deploy sendReceiptEmail --project-ref hopcezradkhrixwwswxn --no-verify-jwt --use-api`; exit 0.
- v19 ACTIVE, `verify_jwt` false (updated 02:16:23Z); the downloaded deployed source is byte-identical to the merge SHA for all three files.
- An unauthenticated POST returned the function's own `{"error":"Unauthorized"}` with status 401; the function log shows one boot (49 ms) and that 401, nothing else, between 02:16 and 02:20Z.
- Database unchanged (02:17:24Z); no notification, pg_net response or receipt since the deploy; no test e-mail sent.
- Rollback target (not used): redeploy the `ebea8cf…` source, byte-identical to v18, with `--no-verify-jwt`.

## A4 — open Yearly charge descriptions (D5a) (2026-10-09, 02:41–02:44Z)

| Step | Result |
| --- | --- |
| Pins (02:41:32Z) | D5a script SHA-256 `79a1d86a370f3122dbc9bb41c8cb9e2d8d709be6369d7bc5676dd755f4fc61ff`; generator, export query, second-run file and command sheet hashes as approved; ledger 001–113 and 113 body verified |
| Export (02:41:41Z) | **10 rows**; SHA-256 **`9789669c9d03b36469cbec197457cc979fc9b173ac2acfa734f07b876c8fe085`**, computed by the database and equal to the file's own SHA-256; held in a private folder on the owner's computer, retained until the 2026/2027 school-year closure, access limited to the owner |
| Wrapper | SHA-256 **`9f703d87b92ab0438206cef0e2e344d59896fa2c4476fc1a593dc7a00a1845f5`**, recorded before the run; no customer data |
| Before (02:42:41Z) | `receipt_number_seq` 258; receipts 277; charges 272; target 10 |
| Write (02:42:53–02:42:59Z) | One request; exit 0, no error |
| After (P1) | Target **0**; open Yearly charges with a plan word **0**; exported charges cleaned **10**; other columns of those charges, every other charge, every receipt and the `charge_balances` totals equal to the snapshot taken just before; `receipt_number_seq` 258; receipts 277; charges 272 |
| Second run (02:43:37Z) | Exit 0; state identical to P1 |
| Final (02:43:59Z) | `receipt_number_seq` 258; receipts 277; charges 272 |

Rollback (prepared, not run): restore the descriptions from the private export; the prepared restore re-hashes the restore set against the checksum above and restores exactly 10 rows or raises.

## Deviations from the plan

1. **A4 path.** D5a ran through the CLI wrapper instead of a psql session. The script file is unchanged; the executed text omitted its single psql-only line 41 (`\set ON_ERROR_STOP on`), and the generator proved mechanically that re-inserting that line yields the file byte for byte. The wrapper declared the export row count and checksum with transaction-local `set_config`, took the script's lock first, and refused unless the database's own SHA-256 of the current target set equalled the declared checksum (stronger than the script's format-only checksum check). The Management API did not return the script's notices; success was judged by the read-only state query. Rehearsed locally on synthetic data first (refusal on a wrong checksum, on a payment between export and run, and on an edited description with an unchanged count; run, second run and rollback).
2. **A2 probes.** The plan's "rolled-back synthetic receipt probes" were replaced by zero-payment probes (owner decision above), because receipt probes consume receipt numbers.

## Limitations

1. Runtime-error inspection windows were short: about two minutes of Vercel error logs after A2 and four minutes of Edge Function logs after A3.
2. The probe could not fire the deferred CRM revenue trigger on `financial_events` (it runs at commit and the probe rolled back); CI covers it.
3. The authenticated UI sweep was performed by the owner (8 of 8 passed as admin/director); the receptionist and teacher `/premium-sessions` redirect checks remain outstanding.
4. Receipt-text behavior on instalments (dated, undated, legacy) is proven by the CI 112→113 rehearsal, not by Production probes.
5. No platform backup existed for this release (owner-accepted risk above).

## Coordination notes (not actions of this release)

- Open architecture PRs [#121](https://github.com/elforssa/english-hills-admin/pull/121) (`113_session_context.sql`) and [#124](https://github.com/elforssa/english-hills-admin/pull/124) (`114_rls_role_evaluation.sql`) collide with Production migration 113 and with Release B's provisional 114; they need renumbering before implementation.
- Release B requires a database backup as a hard prerequisite.
- At R1, Production had 4 auth users and 3 profiles. This predates the release, is outside its scope and is recorded for later review.
- `net.http_request_queue_id_seq` advanced during the release (3022 → 3024) through the normal intake schedule; neither the migration nor the probes used it.
