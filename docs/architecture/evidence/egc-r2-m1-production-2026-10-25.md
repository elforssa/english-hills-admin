# Enrollment and group consistency: migration 120 (M1) Production release — 2026-10-25

Release record of Batch D steps R1–R3 ([plan EGC-r2](../plans/enrollment-group-consistency.md#release-record-r1r3)). Counts, hashes and identifiers only; no personal data was printed or recorded. Times are UTC.

## Approval and scope

- **Owner approval:** Maroine, 2026-10-25 19:22 Asia/Shanghai (11:22 UTC), relayed by the coordinating session, verbatim: "approve D release now". Scope: R1 + R2 + R3 only (backup, migration 120, squash-merge of PR #160 at `54ed63514eae2d4f22df30856b6c8276c621beb1`, read-only checks).
- **Not approved:** the data clean-up (R4, C1–C6), migration 121 (M2) and every other Production change. Neither was run.
- **Backup decision:** the dashboard listed no backup (the CLI showed `"backups":[]`, PITR disabled), so the owner approved a manual logical backup to the owner's computer before R2 (2026-10-25, relayed by the coordinating session).

## Backup (11:35:55–11:43:35)

`supabase db dump --linked` from the linked checkout into a private folder outside the repository (not committed, contents not printed):

| File | Size | Result |
| --- | --- | --- |
| `schema.sql` | 1,082,105 bytes | exit 0, no CLI error; ends on a complete statement (the CLI strips comments from schema dumps, so no end-of-dump comment is expected); 375 functions, 77 tables, 169 policies, 147 triggers |
| `data.sql` | 5,145,479 bytes | exit 0, no CLI error; ends with the end-of-dump marker; 44 data blocks |
| `roles.sql` | 297 bytes | exit 0, no CLI error; ends normally |

## Pre-checks (read-only)

| # | Check | Result |
| --- | --- | --- |
| 1 | Reviewed file | `120_enrollment_group_consistency.sql` on `54ed635…`: MD5 `93ad8cbddf34cf132241e89474dd65d4`, blob `fe95eea8bfd253f69ab0eb681caadde644562fd4` |
| 2 | PR and CI | PR #160 open at exactly `54ed6351…`, `required` success (run `40186975453`), mergeable `CLEAN`; `origin/main` `92e9924`, no commit since |
| 3 | Ledger | 119 rows, highest `119`, no row 120 or 121; row 119 MD5 `c742a88983cf4b570e3231f3d04bc116` |
| 4 | Drift proof | Production equal to a clean local 119 build on every guard digest: functions `10cf39b0…/375` (signature, `md5(prosrc)`, owner, ACL, `prosecdef`, `proconfig`, volatility), triggers on application tables `5849e870…/150`, policies `3e8286cc…/170` (storage included), constraints `0ee9db20…/707`, indexes `144f64b6…/256`, columns `87666f1e…/1056`, relations `f97660c2…/80`, schema grants `7aedfadd…/6`; 0 functions with `'40001'`. The only catalog difference found is three `receptionist_no_truncate` triggers on Supabase's storage tables, attached by migration 077 when it ran in Production; a local reset creates those tables later. Migration 120 does not reference them. |
| 5 | Before-values (11:44:24) | Enrolled + Trial **210**; 8 groups, union-reader headcounts **13, 8, 12, 10, 14, 10, 13, 10**; "Groupe à affecter" (director view) **151**; `xact_commit` 2,982,152; `xact_rollback` 391,314,436; no active `authenticator` backend; catalog snapshot (375 functions, 150 triggers, 170 policies) SHA-256 `e42f73ef2433fae7153576eebe3161453d90cd5af60719452916b82cc74a4dc4` |

## R2 — migration 120 through the guarded wrapper, then the merge

One transaction, `lock_timeout` 5 s: ledger preconditions (119 rows, row 119 MD5, no `academic_security`/`maintenance` schema), the nine pre-digests above, the file's lines 18–1934 verbatim (between its own `begin;` and `commit;`), the ledger row `120` / `enrollment_group_consistency` with the whole file in `statements` and `created_by` copied from row 119, then postconditions (120 rows, row 120 MD5, `created_by`, and the nine post-digests of the rehearsed build). Wrappers: dry run SHA-256 `1073013bebc6dc2f3da47776ffc7cb8a696c76fda5718aeb028333135224e27a`, apply `3608476f5697fa1fc0218444343120738edba186863f69db6a3414b33e69a9ac`; identical except that the dry run ends with a sentinel exception and `rollback`.

| Step | Result |
| --- | --- |
| Local rehearsal (clean 119, synthetic) | Dry run `DRYRUN_OK`, nothing persisted; a planted function refused with `R2_PRE_FUNCTIONS`; the apply committed (row 120 MD5 `93ad8cbd…`); a second apply refused with `R2_PRE_LEDGER` |
| Production dry run (11:45:03–11:45:10) | `DRYRUN_OK all 120 guards passed; functions=7885355d09a2e190b8d0f374ccbda2ba/420 triggers=88aa7b23a26a50d21339cffae0764751/153 policies=3e8286cc5c462c112324f909ed78a83b/170`; ledger still 119 afterwards |
| Production apply (11:45:37–11:45:44) | exit 0, committed, every postcondition true; ledger read at once: 120 rows |
| Squash-merge (11:45:48–11:45:52) | `PUT …/pulls/160/merge` at `54ed6351…`: merged as **`be701da9ad616e946f93d864bfcb622f6d3d1b02`** |
| Production deployment | GitHub `Production` deployment **`7312646958`**, `success` at **11:47:16** (about 92 s after the apply committed) |

## R3 — read-only verification (11:47:48–11:48:54)

| Check | Result |
| --- | --- |
| Ledger | 120 rows, 001–120, no 121; row 120 `enrollment_group_consistency`, one element, stored statement MD5 **`93ad8cbddf34cf132241e89474dd65d4`**, `created_by` equal to row 119's, `idempotency_key` and `rollback` null |
| Catalog diff against the before-snapshot | functions 375 → 420: **11 changed** (`sync_student_from_enrollments`, `check_enrollment_student_sync`, `create_charge_payment`, `assign_receptionist_student_group`, `save_receptionist_student`, `save_receptionist_enrollment`, `soft_delete_student`, `remove_student_group`, `crm_security.evaluate_conversion`, `crm_start_enrollment`, `online_close_course`), **46 added** (10 public commands, 36 `academic_security` functions), **1 dropped** (`sync_enrollments_from_student`); triggers 150 → 153 (+`enrollment_group_capacity`, `enrollments_history_guard`, `groups_membership_level_guard`, `students_membership_guard`; −`student_enrollment_assignment_sync`); policies 170, **none changed**; nothing else. All nine post-digests equal to the rehearsed build. After-snapshot SHA-256 `10403b76d66a976f7b2c05cfa6b9a5820c43b5ee71d79d4a7389236c19060ee9` |
| Grants | `academic_security`: no `USAGE` for `anon`, `authenticated` or `service_role`; `maintenance`: none for the API roles; the 10 new commands executable by `authenticated` only (not `anon`, not `service_role`) |
| Codes | functions with `'40001'`: **0**; the three EGC checks present `NOT VALID`; the one-live-enrollment index present |
| Union readers (11:48:01) | unchanged: Enrolled + Trial **210**; headcounts **13, 8, 12, 10, 14, 10, 13, 10**; "Groupe à affecter" **151** (M1 changes no row) |
| Counters (11:48:01) | `xact_commit` 2,982,331; `xact_rollback` 391,314,437 (+1, the dry run's sentinel rollback); no active `authenticator` backend |
| Postgres logs 11:20–11:51 | no `ERROR`/`FATAL` apart from the dry run's statement and its `DRYRUN_OK` sentinel; PostgREST reloaded its schema cache at 11:45 (the migration's `notify`); its periodic "Thread killed by timeout manager" lines occur every 5 minutes before and after the release |
| API (edge) logs 11:20–11:51 | every response 200 or 204, no 4xx/5xx (light Sunday traffic) |
| Anonymous routes (11:48:53) | `/` → 307 `/login?returnTo=%2F`; `/crm/leads` → 307 `/login?returnTo=%2Fcrm%2Fleads` |
| Owner smoke | left to the owner: open a group page and record nothing |
| Vercel runtime errors | not verified (no Vercel access from the release session) |

## Passive observation (30 minutes)

Planned as a 30-minute window; the final read ran at **14:09:29** (2 h 24 min after the apply) because the release session's timer overran while the machine slept. Window 11:45:44–14:10.

| Check | Result |
| --- | --- |
| Counters (14:09:33) | `xact_rollback` **391,314,437**, unchanged since R3 (no rollback in 2 h 24 min); `xact_commit` 2,986,847 (+4,516, normal background traffic); no active `authenticator` backend |
| Union readers (14:09:33) | unchanged: Enrolled + Trial 210; headcounts 13, 8, 12, 10, 14, 10, 13, 10; "Groupe à affecter" 151 |
| Catalog and ledger (14:09:29) | unchanged: 120 rows, row 120 MD5 `93ad8cbd…`, no 121; all nine digests equal to the rehearsed build; grants and the `'40001'` count (0) unchanged |
| Postgres logs 11:45:45–14:10 | 124 entries, none with `ERROR`/`FATAL` |
| PostgREST logs 11:45:45–14:10 | 39 entries, all the recurring "Thread killed by timeout manager" line that also occurs every 5 minutes before the release (09:00 onwards); one schema-cache reload |
| API (edge) logs 11:45:45–14:10 | 83 requests, no 4xx/5xx, no 409 |

## Still open

- R4 (clean-up dry-run counts re-read on the day, then C1–C6) and R5 (migration 121) each need their own owner approval; R6 closeout follows.
- Until R4, a learner whose file holds a group without a backing enrollment keeps it (owner decision 1); « Ancien apprenant » says so and can be run again to end the file.
- The Production backup was a manual logical dump on the owner's computer; no dashboard backup exists.
