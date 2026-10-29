# Speed as the centre grows (Batch G): migration 124 Production release R0–R3 — 2026-10-29

Release record of Batch G steps R0–R3 ([plan SCG-r1](../plans/speed-as-the-centre-grows.md#release-record-r0r3)). Counts, hashes and identifiers only; no personal data. Times are UTC; reception was closed.

## Approval and scope

- **Owner approval:** Maroine, 2026-10-28 15:27 Asia/Shanghai, verbatim: "approve G release now" (R0 read-only checks, R1 migration 124, R2 squash-merge of PR #172 at `aa77fa0304ef508999d3cf8aa3c8ece282028c0a`, R3 read-only checks and observation, the docs closeout). The restore script is not approved to run.
- **First attempt (2026-10-28 07:31–07:38):** stopped at R0 because PostgREST "Max rows" could not be read from the release session (no Management API access to the PostgREST config; the value is not stored in the database). Nothing was written. The R1 deadline (08:15 Casablanca) passed.
- **Second window:** on 2026-10-29 the owner gave **max_rows = 1000**, read by the owner from Dashboard > Project Settings > API (09:39 Asia/Shanghai), and asked to run the same approved steps from a fresh R0 (about 01:40 Casablanca).
- **Not approved, not run:** the restore script, R4 and any other change.

## Safety copy (01:40:10–01:40:26)

No full dump (the release computer's VPN prevents a direct Postgres session); migration 124 changes no row data. A targeted catalog export through `supabase db query --linked` (read-only) into a private folder on the owner's computer, not committed:

| File | Content | Bytes |
| --- | --- | --- |
| `public_policies.json` | all 163 `public` policies: schema, table, name, permissive, roles, command, `qual`, `with_check` | 56,798 |
| `functions_recreated.json` | `pg_get_functiondef`, owner and ACL of `search_students_page`, the only existing function 124 replaces (the six others are new) | 5,444 |
| `SHA256SUMS` | both files | 178 |

The same export was taken on the first attempt (2026-10-28 07:36), byte-identical in size.

## R0 — read-only checks (01:39:41–01:40:04)

| Check | Result |
| --- | --- |
| Reviewed file | `124_speed_as_the_centre_grows.sql` on `aa77fa0…`: MD5 `5f1fe6b5f34a9fa080666ef752f1d0f7`, blob `5a70498d41f946133367b0ae91916d289acf3d6f` |
| PR and CI | PR #172 open at exactly `aa77fa0…`, `required` success (run 40643585035), mergeable `CLEAN`; `origin/main` `b00c690`, no commit since |
| Ledger | 123 rows, highest `123`, no 124/125; row 123 MD5 `a9f92929…` |
| PostgREST max_rows | **1000** (owner-read, Dashboard; the keyset reader's page size) |
| Casablanca offset | `pg_timezone_names`: **+01:00**, `is_dst` false (the PostgreSQL time-zone data; earlier releases recorded the same) |
| Drift proof | Production equal to a clean local 123 build on all nine catalog digests (functions `f815c192…/461`, policies `5d22d547…/164`, triggers, indexes `…/271`, columns, relations, schema grants) once the one expected difference is included: `receipts_number_required` (validated), added by the approved data step D1 on 2026-10-28 and not touched by 124 (constraints `e502b15c…/741`) |
| Policy preconditions | md5 of the 163 `public` policy expressions (name, command, roles, `qual`, `with_check`) `714ce648…` equal to the clean 123 build, so the 157 originals 124 rewrites and the `search_students_page` body it replaces are as expected |
| Baselines | `pg_stat_statements` for `search_students_page` (since 2026-08-22): 21 statement shapes, **367 calls, weighted mean 1,230.8 ms**, worst 4,436 ms; `activity_log` 2,569 rows; `xact_rollback` 391,314,453; catalog snapshot SHA-256 `f10b20ff4fbd91a3f184fe42c656db6753b6766310321efb5386a256e2218ddf` |

## R1 — migration 124 through the guarded wrapper

One transaction, `lock_timeout` 5 s: ledger preconditions (123 rows, highest 123, no 124/125, rows 121–123 MD5), no `list_activity_log` or new index, the policy-expression fingerprint, the nine pre-digests; the file's lines 18–1278 verbatim; ledger row `124` / `speed_as_the_centre_grows` with the whole file and `created_by` copied from row 123; then postconditions (124 rows, row 124 MD5, `created_by`, the post policy fingerprint `c9d535d6…` and the nine post-digests of the rehearsed build, which include the new functions' ACLs, `jit = off` and 0 functions with `'40001'`). Dry run SHA-256 `64636a16766b23c4f6f3496e4fa5851a84963a24cdcf8562bf4ada6ecb3425c3`, apply `85f5403d6dd2fe930a304b113ff97724419d068d27330def8c5ea9166b490ee8`, identical except for the header and the sentinel. Local rehearsal on a clean 123 (private stack; only the ledger MD5 constants of rows 121–122 patched): dry run `DRYRUN_OK`, apply committed with the exact post-digests, a second apply refused (`R1_PRE_LEDGER`).

| Step | Result |
| --- | --- |
| Production dry run (01:40:26–01:40:32) | `DRYRUN_OK all 124 guards passed; functions=7b0660783eb952e174b810b8d4eaba8b/467 policies=87d3e82cfb400007da1c239faedd40c7/164 indexes=1e87a21d555e724a958e19ab78a0b8d4/272 public_policy_expr=c9d535d698bfa6baf09b64ec6360184c`; afterwards ledger 123 and all nine digests unchanged |
| Production apply (01:40:51–01:40:58) | exit 0, committed; ledger 124, row 124 MD5 `5f1fe6b5…` |

## R2 — merge and deployment

| Step | Result |
| --- | --- |
| Squash-merge (01:41:02–01:41:05, 7 s after the apply) | PR #172 at `aa77fa0…` merged as **`3e02efaa59b2940ddc8657e094e2eb11a8f877ad`** |
| Production deployment | GitHub `Production` deployment **`7401818691`**, `success` at **01:42:38** (1 min 40 s after the apply committed) |

## R3 — read-only checks (01:43:33–01:47)

| Check | Result |
| --- | --- |
| Ledger | 124 rows, 001–124; row 124 stored statement MD5 **`5f1fe6b5f34a9fa080666ef752f1d0f7`**, `created_by` equal to row 123's |
| Catalog diff | all nine digests equal to the rehearsed build. Functions 461 → 467: **added** `list_activity_log`, `list_activity_log_tables`, `report_attendance_daily`, `report_payroll_by_teacher`, `report_student_mix`, `report_years`; **re-created** `search_students_page` only; none dropped. Policies 164 → 164: **157 changed**, none added or dropped. Indexes 271 → 272 (`activity_log_created_id_idx` on `(created_at desc, id desc)`). Triggers, constraints, columns, relations and schema grants unchanged. Catalog snapshot after SHA-256 `3fc4e6f1dc8578908f66c39974474a90fbd98d7981f62471d89375fa23d67fc9` |
| Generator check against Production | the generator's `rewrite()` applied to the 163 Production policies exported before R1 gives exactly the Production text after R1: **157 rewritten, 6 unchanged, 0 mismatches**; every rewritten expression `normalise()`s back to its 123 text (the restore script's own precondition); permissive/restrictive, roles and command unchanged for all 163 |
| New functions | not executable by `anon`, executable by `authenticated` (the 6 new ones and `search_students_page`); `report_attendance_daily` has `jit=off` |
| Codes | 0 functions with `'40001'` |
| Role probe (rolled back) | one read-only transaction ending in a sentinel exception: as the director, admin and one receptionist account and as `anon`, counted 18 tables and called `list_activity_log`, `report_years`, `report_student_mix`. Director and admin see every row except archived or deleted ones (learners 231 of 238, receipts 329 of 335, teachers 8 of 9; all of `activity_log`, enrollments, attendance, charges); reception sees non-archived learners (231) and enrollments (144), 319 charges, 321 receipts, its own profile, no teacher, setting or activity-log row (activity-log function 0 rows), report functions answer; `anon` is refused (`42501`) on 17 tables and sees 0 charges. The equivalence with the 123 policies was proved before release by the plan's local matrix (11 identities, zero differences) |
| `pg_stat_statements` (01:44) | 22 shapes, 369 calls, weighted mean 1,224.2 ms (cumulative since 2026-08-22, so dominated by history; the plan's next reading is after one reception day) |
| Postgres logs 01:35–01:47 | 10 entries, no `ERROR`/`FATAL` |
| PostgREST logs | the recurring timeout-manager line only |
| API (edge) logs | 11 requests, no 4xx/5xx |
| Anonymous routes (01:44) | `/` and `/crm/leads` → 307 to `/login` |
| Vercel runtime errors | not verified (no Vercel access from the release session) |

## Passive observation (30 minutes)

Window 01:40:58–02:11:05, final read at **02:11:34** (30 minutes after the apply).

| Check | Result |
| --- | --- |
| Catalog and ledger | unchanged since R3: all nine digests equal to the rehearsed build, ledger 001–124, row 124 MD5 `5f1fe6b5…`, `jit=off` on `report_attendance_daily`, 0 `'40001'` |
| Counters | `xact_rollback` **391,314,455**: +2 since the R0 before-values, the dry run's sentinel and the role probe's sentinel; `xact_commit` 3,169,015 (+1,204 since 01:39:49, normal background traffic); `activity_log` 2,569 (no staff activity at night) |
| `pg_stat_statements` | unchanged at 369 calls, weighted mean 1,224.2 ms (no students-list use during the window) |
| Postgres logs 01:47–02:12 | 20 entries, no `ERROR`/`FATAL` |
| PostgREST logs | 10 entries, only the recurring timeout-manager line |
| API (edge) logs | 26 requests, no 4xx/5xx |
| Anonymous routes (02:11) | `/` and `/crm/leads` → 307 to `/login` |

## Still open

- `pg_stat_statements` again after one reception day (plan); the owner may open the students list, activity log and reports.
- The restore script stays unapplied (recovery: redeploy the previous deployment first, then the restore, under the owner's approval).
- The PostgreSQL offset for Africa/Casablanca (+01:00) differs from the UTC+0 civil time the owner uses; report day boundaries follow PostgreSQL's time-zone data (REL-6). Worth a check by the owner if a report day looks shifted by one hour.
