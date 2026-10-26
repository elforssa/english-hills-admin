# Enrollment and group consistency: clean-up (R4) and migration 121 (R5) Production release — 2026-10-26

Release record of Batch D steps R4 and R5 ([plan EGC-r2](../plans/enrollment-group-consistency.md#release-record-r4r5)), after the [R1–R3 release](egc-r2-m1-production-2026-10-25.md). Counts, hashes and identifiers only; no personal data was printed or recorded. Times are UTC (Casablanca is UTC+0).

## Approvals and scope

- **Dry run only (2026-10-26 13:11 Asia/Shanghai):** fresh backup, then the plan's dry-run queries read-only; no stage, no 121.
- **R4 + R5 (2026-10-26 13:33 Asia/Shanghai), owner's words verbatim:** "approve cleanup: C1 43 (12 links), C1b 1, C2 7, C3 98, C4 2, C5 10 then M2 if C6 matches". R5 was conditional on C6 matching the prediction (Enrolled + Trial 112, "Groupe à affecter" 28, headcounts unchanged, every invariant count 0). Window: before 08:30 Casablanca time; the work ran 05:35–05:45.

## Backup (05:14:39–05:24:43)

`supabase db dump --linked` into a private folder on the owner's computer (not committed, contents not printed): `schema.sql` 1,164,920 bytes (exit 0, no CLI error, last statement complete, 420 functions; the CLI strips comments from schema dumps), `data.sql` 5,149,934 bytes (exit 0, ends with the end-of-dump marker), `roles.sql` 297 bytes (exit 0, ends normally).

## Dry-run counts (read-only)

First run 05:26:46–05:27:58 (with the explanation queries); re-run as step 0 at 05:35:20–05:36:32, identical:

| Stage | Plan (2026-10-24 sizing) | 2026-10-26 | Note |
| --- | --- | --- | --- |
| C1 learners whose file group has no matching membership | 36 | **43** | 6 learners created and 1 file given a group after the sizing, all before M1 went live (8 files changed between sizing and M1, none since); all in 2026-2027 groups; 0 programme/level mismatches |
| C1 charge links (several candidates) | 12 (0) | 12 (0) | |
| C1 existing enrollments: placeable / stops (DS1) | 0 / 0 | 0 / 0 | |
| C1b | 1 | 1 | collision 0 |
| I9 rows before C1b and C2 | 8 | 8 | 7 legacy + 1 C1b row; 0 after |
| C2 legacy Validated without group (non-archived, with group) | 7 (6, 1) | 7 (6, 1) | |
| C3 former learners (rule F + C2 learners) | 94 + 5 = 99 | **93 + 5 = 98** | one learner counted at sizing no longer qualifies (paid, enrolled, placed or archived since) |
| C4 archived with an active enrollment | 3 (2 after C2) | 3 (2 after C2) | |
| C5 Mise à niveau paid on historical receipts | 10 | 10 | collision 0 |
| I3 duplicates | 0 | 0 | |

## R4 — clean-up stages (05:36:51–05:38:05)

Each stage one single-statement transaction through its M1 core, with the approved count:

| Stage | Call | Time | Returned | Journal rows | `xact_rollback` after |
| --- | --- | --- | --- | --- | --- |
| C1 | `egc_cleanup_c1(43, 12)` | 05:36:51–05:36:56 | 43 | 98 (43 enrollments, 12 charge links, 43 learner files) | 391,314,439 |
| C1b | `egc_cleanup_c1b(1)` | 05:37:12–05:37:17 | 1 | 1 | 391,314,439 |
| C2 | `egc_cleanup_c2(7)` | 05:37:25–05:37:32 | 7 | 14 | 391,314,439 |
| C3 | `egc_cleanup_c3(98)` (Alumni) | 05:37:38–05:37:43 | 98 | 98 | 391,314,439 |
| C4 | `egc_cleanup_c4(2)` | 05:37:49–05:37:54 | 2 | 4 | 391,314,439 |
| C5 | `egc_cleanup_c5(10)` | 05:37:59–05:38:05 | 10 | 20 | 391,314,439 |

No stage refused. Journal total 235 rows; each stage stays individually reversible with `academic_security.egc_revert_cleanup` in reverse order (none was reverted). The release script first reported C1 as a stop because it parsed the CLI's login line together with the JSON; the stage had committed and returned 43, so the run continued from C1b.

## C6 (05:38:35, read-only)

| Check | Expected | Result |
| --- | --- | --- |
| File groups without a matching membership | 0 | 0 |
| Validated/Trial without group | 0 | 0 |
| Confirmed/Validated/Trial without programme or year | 0 | 0 |
| Ended shape violations | 0 | 0 |
| Archived learners with an active enrollment | 0 | 0 |
| Enrollment/group mismatches | 0 | 0 |
| I3 duplicates | 0 | 0 |
| Enrolled + Trial | 112 | **112** |
| "Groupe à affecter" (M2 rule) | 28 | **28** |
| Group headcounts | 13, 8, 12, 10, 14, 10, 13, 10 | unchanged (union and enrollment-only) |
| `status_without_enrollment` (informational) | — | 0 |

C6 matched, so R5 proceeded. (The Students list still showed 151 at this point because it used the 097 rule until 121.)

## R5 — migration 121 through the guarded wrapper (05:42:13–05:42:45)

- **File:** `121_enrollment_group_consistency_enforce.sql` on `main` `b0b6a83…`: MD5 `32cf1924f6874d51b3ff618fb8de97c1`, blob `e64419eca28b8a545fdd7290edb2fb6738a6f372`.
- **Wrapper:** one transaction, `lock_timeout` 5 s: ledger exactly 120 rows with row 120 MD5 `93ad8cbd…` and no 121, a non-empty clean-up journal, the nine catalog digests of a clean local 120 build (Production equal before the step); the file's lines 16–430 verbatim; ledger row `121` / `enrollment_group_consistency_enforce` with the whole file and `created_by` copied from row 120; postconditions on the ledger row, the three validated checks and the nine digests of the rehearsed 121 build. Dry run SHA-256 `077edc3ccd59aa966decb84a024bdbdb3218417b3c6972440aa6e0890cb07a64`, apply `da4c607c19d0603cdcb086a741aed01c83c19a59f4ceea3289a253f4dc5d2cf5`, identical except for the sentinel.
- **Local rehearsal:** dry run `DRYRUN_OK` with nothing persisted; a planted function refused with `R5_PRE_FUNCTIONS`; apply committed (row 121 MD5 `32cf1924…`); a second apply refused with `R5_PRE_LEDGER`.
- **Before-values (05:42:06):** Enrolled + Trial 112, headcounts unchanged, `xact_rollback` 391,314,439; catalog snapshot SHA-256 `10403b76…` (identical to the post-120 snapshot: the clean-up changed no catalog object).
- **Production dry run (05:42:13–05:42:21):** `DRYRUN_OK all 121 guards passed; functions=d2844d1a313fc07b8fc1e1669e051707/421 triggers=88aa7b23a26a50d21339cffae0764751/153 policies=5181fafc789a40dfc9133b24e67115dc/170` (M2's own refusal block passed on the live data); ledger still 120.
- **Production apply (05:42:37–05:42:45):** exit 0, committed.

## After R5 (05:43:09–05:45:18, read-only)

| Check | Result |
| --- | --- |
| Ledger | 121 rows, 001–121; row 121 `enrollment_group_consistency_enforce`, one element, stored statement MD5 **`32cf1924f6874d51b3ff618fb8de97c1`**, `created_by` equal to row 120's |
| Catalog diff | functions 420 → 421: added `academic_security.egc_enforcement_failures()` and `attendance_student_in_group(uuid,uuid,date)`, dropped `attendance_student_in_group(uuid,uuid)`, re-created `sync_student_from_enrollments` (strict), `enforce_attendance_integrity`, `teacher_can_access_student_group`, `can_message_recipient`, `storage_security.can_write`, `resolve_storage_asset`, `search_students_page`; policy `announcements audience read` re-created; the three EGC checks now validated; triggers unchanged; nothing else. All nine digests equal to the rehearsed build; after-snapshot SHA-256 `459bc4cf5c19f1abdd13e6ed10b3296937744ce2577a428d94b22709d078ba90` |
| Codes | 0 functions with `'40001'` |
| C6 after 121 | unchanged: every invariant count 0, Enrolled + Trial 112, "Groupe à affecter" 28, headcounts 13, 8, 12, 10, 14, 10, 13, 10 |
| Students list as a director (RLS applied) | "Groupe à affecter" **28**; default « Dossiers actifs » **112**. Called as `postgres` (RLS bypassed) the same filter counts 29: the extra row is one archived file that the restrictive policy hides from every user |
| Counters | `xact_rollback` 391,314,441 (+2 over R5: the dry run's sentinel, and one failed read of the release session) |
| Postgres logs 05:30–05:50 | no unexpected `ERROR`/`FATAL`; the only matches are the two logged wrapper statements (their text contains the refusal message) and the dry run's sentinel |
| PostgREST / API logs 05:30–05:50 | no new error; 10 API requests, none 4xx/5xx |
| Anonymous routes (05:45:16) | `/` and `/crm/leads` → 307 to `/login` |
| Application | no deploy needed (the deployed `be701da…` handles both states) |

## Passive observation (30 minutes)

Window 05:42:45–06:14, final read at **06:13:30** (31 minutes after the apply).

| Check | Result |
| --- | --- |
| C6 and readers (06:13:30) | unchanged: every invariant count 0, I3 duplicates 0, Enrolled + Trial 112, "Groupe à affecter" 28, enrollment-only headcounts 13, 8, 12, 10, 14, 10, 13, 10; the director's Students list (RLS applied) 28 and 112 |
| Catalog and ledger | unchanged: row 121 MD5 `32cf1924…`, `created_by` from row 120, three checks validated, 0 `'40001'`, all nine digests equal to the rehearsed build |
| Counters | `xact_rollback` **391,314,441**, unchanged since R5 (no rollback in 31 minutes); `xact_commit` 3,019,528 (+1,557 since 05:43, morning use); no active `authenticator` backend |
| Postgres logs 05:42:46–06:14 | 26 entries, no `ERROR`/`FATAL` |
| PostgREST logs | 13 entries, only the recurring timeout-manager line |
| API (edge) logs | 233 requests as staff began work; one `400` on `POST /auth/v1/token` at 05:53:17 (a sign-in or token refresh refused by Supabase Auth, unrelated to the data or the migrations); no 5xx, no 409 |

## Still open

- R6 closeout (PRODUCT_RULES, SECURITY_RULES, WORKFLOWS and README wording from "merged, not deployed" to live; FEATURE_INDEX; ADR-010 status).
- Follow-ups listed in the plan: past online rosters after a course close, placement into a closed online course, a school-year check with an editable group year.
