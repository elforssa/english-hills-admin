# Conflicts without retry loops — migration 119 Production release (R2–R4), 2026-10-24

Release record for Batch C ([plan NRC-r2](../plans/conflicts-without-retry-loops.md), [ADR-009](../decisions/ADR-009-conflicts-never-retryable.md)). Tier 3. All times are UTC.

## Release approval

Owner approval (Maroine, 2026-10-25 00:03 Asia/Shanghai, that is 2026-10-24 16:03 UTC), relayed to the release session: "apply 119". It approves release steps **R2 and R3 only**: apply `supabase/migrations/119_conflicts_without_retry.sql` to Production and verify it read-only, followed by R4 passive observation. It does **not** approve the optional bounded probe, any PostgREST restart or upgrade, or any other Production change. None of these was done.

## Inputs

| Item | Value |
| --- | --- |
| Reviewed file | `119_conflicts_without_retry.sql` on `main`, 158,671 bytes, MD5 `c742a88983cf4b570e3231f3d04bc116`, SHA-256 `b61dfdeef98e71178bebf5d477aa4fac4df0f349e192720a8eae14f961f0c4a0`, git blob `6310f4bbe15f49f8bbd304a09f4b79ce91d26cb5`; both MD5 and blob verified before any other step |
| Source | PR #158 squash-merged as `9774c4c040cb…`; release worktree on `origin/main` `3f97c458db85…` (PR #157 merged after #158; the diff of `supabase/` between them is empty) |
| Access path | Supabase CLI `supabase db query --linked --project-ref hopcezradkhrixwwswxn` (Management API, executing as `postgres`) from the release session; every read began with `set transaction read only` and returned `transaction_read_only = on`; the CLI prints "Initialising login role…" on each call. No `db push --linked`, no database password. Postgres and API logs through the Supabase connector. |

## R1 — application first (pre-check 1)

GitHub `Production` deployment `7300833137` for `main`'s latest commit `3f97c45…`: `success` at 15:48:21. `9774c4c…` (#158) is an ancestor of it and had its own `Production` deployment `7300138582`, `success` at 14:47:45. The Vercel deployment IDs are not recorded (the Vercel connector lists no project for team `english-hills-projects`).

## Pre-checks (read-only, 16:05–16:07)

| # | Check | Result |
| --- | --- | --- |
| 1 | R1 deployed | `7300833137`, `success`, contains #158 |
| 2 | Ledger | 118 rows, highest `118`, no row 119; row 118 `online_close_course_room_ref`, one element, MD5 `b325eecf03b14f948c403fe6a8a53b9b`, `created_by` set, `idempotency_key` and `rollback` null |
| 3 | Drift proof | exactly the 43 inventoried functions contain `'40001'` (72 literals); every `md5(prosrc)` prefix equals the plan's inventory table; exactly 2 functions contain `PT409` (`crm_enqueue_meta_reconciled`, `crm_finish_meta_reconciliation`, migration 105); exactly 1 names `serialization_failure` (`crm_start_enrollment`) |
| 3+ | Whole function catalog | all 375 application functions (signature, `md5(prosrc)`, owner, ACL, `prosecdef`, `proconfig`, arguments, result) identical to a clean local build at 118; digest `526806bb11ed7f1019e3bc06047d352a/375` in both |
| 4 | No other release in progress | no online course or lesson exists (the online switch has not been used), no open PR carries a migration, cron jobs unchanged (1 `crm-intake-primary` on, 2 `crm-lifecycle-primary` off, 3 `crm-insights-primary` on), no active `authenticator` backend |
| 5 | Before-values (16:06:23) | `xact_commit` 2,943,859; `xact_rollback` 391,314,430 (the frozen 2026-10-02 value + 1); function snapshot saved locally at 16:06:42 (375 functions; file SHA-256 `87f93c2040eb6dba6bb8f0e40cc4a37e3067e18d53c4471a583be0400d1cc268`) |

## R2 — migration 119 through the guarded wrapper

The file ran in one transaction inside a guarded wrapper with `lock_timeout` 5 s, as for 118.

- **Preconditions:** ledger exactly 118 rows with highest `118` and no row 119; row 118 equal to the 118 file with `created_by` set; whole-catalog digest `526806bb…/375`; each of the 43 functions' full `md5(prosrc)` equal to the clean 118 build; the set of `'40001'` functions exactly those 43; 2 `PT409` functions.
- **Migration body:** the file's lines 14–1915 verbatim, i.e. everything between its own `begin;` and `commit;`.
- **Ledger row:** inserted in the same transaction as version `119`, name `conflicts_without_retry`; `statements` holds the whole file; `created_by` copied from row 118 (an account identity, not reproduced here).
- **Postconditions:** 119 ledger rows and row 119 with stored statement MD5 `c742a889…`; each of the 43 bodies equal to the rehearsed 119 build; whole-catalog digest `ae7fa476f86760883933d06070071090/375`; 0 functions with `'40001'` or `serialization_failure`; 45 with `PT409`.

Wrappers: dry run SHA-256 `5c9b789b50c14ad01f35ff03e472a8befccd366775b1e32bbefce6b25b665bbb`, apply `2a52dc1f7356c56712ace0809c8deaec626502ea2ec9f330909ff0c435ea6f7b`; identical except that the dry run ends with a sentinel exception and `rollback`.

| Step | Result |
| --- | --- |
| Local rehearsal (private stack at 118, synthetic, ledger shaped like Production's) | Dry run `DRYRUN_OK`, nothing persisted. A planted extra function was refused with `R2_PRE_CATALOG_DIGEST`. The apply committed (row 119 MD5 `c742a889…`), a second apply was refused with `R2_PRE_LEDGER`, the catalog zero rule passed, and `test-crm-rcc-a2.sql`, `test-online-learning.sql` and `test-crm-phase11.sql` passed on the result. |
| Production dry run (16:10:37–16:10:44; Postgres 16:10:43) | `DRYRUN_OK all 119 guards passed; rebuilt=43 pt409=45 catalog=ae7fa476f86760883933d06070071090/375`. Re-read afterwards: ledger still 118, inventory query output identical to pre-check 3. |
| Production apply (16:11:03–16:11:09; Postgres statement 16:11:08) | Exit 0, committed, every postcondition true inside the transaction |

## R3 — read-only verification (16:11:26–16:11:50)

| Check | Result |
| --- | --- |
| Ledger | 119 rows, highest `119`; row 119 `conflicts_without_retry`, one element, stored statement MD5 **`c742a88983cf4b570e3231f3d04bc116`** (equal to the reviewed file), `created_by` equal to row 118's, `idempotency_key` and `rollback` null |
| Counts | functions with `'40001'` **0**; with `serialization_failure` **0**; with `PT409` **45** |
| Diff against the before-snapshot | 375 functions before and after, same signatures; **exactly the 43 inventoried functions changed `md5(prosrc)`**, each equal to the rehearsed 119 body; **no other function changed**; owner, ACL, `prosecdef`, `proconfig`, arguments and result unchanged for all 375; whole-catalog digest `ae7fa476…/375`, equal to the rehearsed build (snapshot file SHA-256 `adf61bd372074380cb1e776c74d90f952f6cbd3d558f684445dcb583618a179c`) |
| Counters (16:11:26) | `xact_commit` 2,944,052; `xact_rollback` 391,314,431 (+1, the dry run's sentinel rollback); no active `authenticator` backend |
| Counters (~6 min, 16:17:10 and 16:17:45) | `xact_rollback` 391,314,431 at both reads (flat); `xact_commit` 2,944,229 → 2,944,267 (normal traffic); no active `authenticator` backend |
| Postgres logs 15:40–16:13 | no `ERROR`/`FATAL`, no repeating conflict message; the only entries matched are the dry-run and apply statements and the `DRYRUN_OK` sentinel |
| API (edge) logs 15:40–16:16 | every `/rest/v1/` response 200 or 204; no 409, no 5xx (light Saturday traffic) |
| Anonymous routes (16:11:50) | `/` → 307 `/login?returnTo=%2F`; `/crm/leads` → 307 `/login?returnTo=%2Fcrm%2Fleads` |
| Vercel runtime errors | **not verified**: the Vercel connector lists no project for the team and no Vercel CLI is installed in the release session |

## R4 — passive observation (30 minutes)

Window 16:11:09–16:42:07, final read 31 minutes after the apply.

| Check | Result |
| --- | --- |
| Counters (16:42:07) | `xact_rollback` **391,314,431**, unchanged since the apply (no rollback at all in 31 minutes, so no retry loop); `xact_commit` 2,945,020 (+968 since 16:11:26, normal background traffic); no active `authenticator` backend |
| Catalog and ledger (16:42:07) | unchanged: 119 rows, row 119 MD5 `c742a889…`, `'40001'` 0, `serialization_failure` 0, `PT409` 45 |
| Postgres logs 16:11:09–16:43 | no `ERROR`, `FATAL` or `PANIC` entry and no conflict message at all |
| API (edge) logs 16:11:09–16:43 | 16 × 200 and 2 × 204 on `/rest/v1/`; no 409, no 5xx |
| Anonymous routes (16:42) | `/` and `/crm/leads` still 307 to `/login` |

**Limit:** this Saturday window carried little staff traffic (mostly the schedulers), so no real staff conflict was observed. The plan's next-working-day observation (R4, second part) remains open: re-read `xact_rollback` and the Postgres logs during normal staff use, and collect any staff report of a spinning save.

## Not done, by scope

- The optional bounded probe (one stale call over HTTP) was **not** run.
- No PostgREST restart or upgrade, and the PostgREST version was not read (dashboard only). CI and local stacks run PostgREST 16.x ([implementation record](../plans/conflicts-without-retry-loops.md#implementation-record)).
- No backup was listed or taken; the plan requires none for this transactional, body-only migration, and the approval did not ask for one.
- Signed-in Production pages were not exercised.

## Recovery

The migration is one committed transaction. Never restore `40001`: a correction is a reviewed forward migration. If saves spin and `xact_rollback` climbs by about 100 a second, follow the plan's interim runbook (owner-approved PostgREST restart from the dashboard).
