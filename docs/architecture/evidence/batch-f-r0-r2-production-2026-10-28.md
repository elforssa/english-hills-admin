# Portal readiness (Batch F): migration 123 Production release R0–R2 — 2026-10-28

Release record of Batch F steps R0–R2 ([plan PRF-r2](../plans/portal-readiness.md#release-record-r0r2)). Counts, hashes and identifiers only; no name, address or other personal data. Times are UTC (Casablanca is UTC+0).

## Approval and scope

- **Owner approval:** Maroine, 2026-10-27 22:40 Asia/Shanghai, verbatim: "approve F release now" (fresh backup, R0, R1 migration 123, R2 squash-merge of PR #167 at `d3911c549d703a0c9913fa0bebdf6d7bf4b4e148`, then read-only checks), Production steps only after 21:00 Casablanca with reception closed.
- **Timing:** the 21:00 UTC start did not happen (the release computer slept; nothing ran on Production). On 2026-10-28 at about 02:00 Casablanca the owner asked to run the same approved release now, every R0 check repeated fresh, with a new deadline of 07:30 Casablanca.
- **Backup not taken (owner accepted the risk):** the manual `supabase db dump --linked` failed on every attempt (01:58–02:01): the release computer's VPN in TUN mode answers the database host with a fake address and drops the direct Postgres session (`server closed the connection unexpectedly`); the HTTPS Management API path used for every query below was unaffected. The owner's words, verbatim, about 02:03: "I accept the risk: proceed with the F release without a fresh backup, as the plan originally allowed (the migration changes no existing row)." No partial dump was kept.
- **Not approved, not run:** R3 (clean-up C0–C2 and constraint validation), R4 (office login, teacher assignment), R5 (pilot), R6 (invitations), the prepared corrective migration, and any account, link, invitation, message or notification.

## R0 — read-only checks (02:04:00–02:04:39)

| Check | Result |
| --- | --- |
| Reviewed file | `123_portal_readiness.sql` on `d3911c5…`: MD5 `a9f929294365ccefb6df42f971ea0f99`, blob `5107961deaa312fa07f288cf5a0b1dd1718af113` |
| PR and CI | PR #167 open at exactly `d3911c5…`, `required` success, mergeable `CLEAN`; `origin/main` `1a1c550`, no commit since |
| Ledger | 122 rows, highest `122`, no 123/124; row 121 MD5 `32cf1924…`, row 122 MD5 `f422fea1…` (with `created_by`) |
| Batch D M2 (121) | applied; `academic_security.is_group_member` and `attendance_student_in_group` present |
| Accounts | 0 teacher, parent or student profiles (profiles: 1 director, 1 admin, 3 receptionists); 0 profiles with a linked learner or teacher; 0 pending invitations; 0 messages, 0 notifications |
| Premium | 5 Premium tables, 0 rows |
| Policy baseline | all 31 policies that 123 drops present by name and table |
| New objects | no `portal_security` schema, no `family_links` |
| Drift proof | Production equal to a clean local 122 build on all nine catalog digests (functions `fa41a023…/424` incl. owner, ACL, security definer and config; triggers on application tables `77e89d29…/156`; policies `77504f17…/172`; constraints, indexes, columns, relations, schema grants), so every object 123 re-creates or drops equals its expected latest definition |
| Before-values (02:04:13) | `xact_commit` 3,118,452; `xact_rollback` 391,314,446; catalog snapshot (424 functions with ACLs, 156 triggers, 172 policies) SHA-256 `d77f909199d3fa4e021ee593ef6515233e55225c7f7adbbc76e2028b354a02bf` |

### Clean-up dry-run counts (read-only, for the owner; the clean-up was not run)

Same predicates as `scripts/portal-readiness-cleanup.sql`:

| Count | Value | Plan (2026-10-24) |
| --- | --- | --- |
| Placeholder addresses (on more than 10 active learner files) | 1 | 1 |
| C2 learner `email` equal to the placeholder | 33 | 33 |
| C2 `parent_email` equal to the placeholder | 7 | 7 |
| C2 archived learners with the placeholder | 0 | 0 |
| Issued receipts carrying the placeholder (not changed by the clean-up) | 28 | 27 |
| C1 `parent_email` to normalise | 4 | 4 |
| C1 learner `email` to normalise | 2 | 2 |
| C1 teacher `email` to normalise | 1 | 1 |
| C1 messages / notifications to normalise | 0 / 0 | not counted |
| Teacher addresses differing only by case (active / any) | 0 / 0 | 0 |
| C0 before-image rows expected | 38 | — |

The R3 inputs would be `c1_parent=4 c1_email=2 c1_teacher=1 c1_message=0 c1_notification=0 c2_email=33 c2_parent=7`, re-read on the day R3 is approved.

## R1 — migration 123 through the guarded wrapper

One transaction, `lock_timeout` 5 s: ledger preconditions (122 rows, highest 122, no 123/124, rows 121 and 122 MD5), no `portal_security` or `family_links`, 0 portal accounts, 0 pending invitations, the 31 baseline policies, every Premium table empty, the nine pre-digests; the file's lines 16–1540 verbatim; ledger row `123` / `portal_readiness` with the whole file and `created_by` copied from row 122; then postconditions (123 rows, row 123 MD5, `created_by`, still 0 portal accounts, invitations and links, 11 of the 31 policy names re-created, the nine post-digests of the rehearsed build, which include 0 functions with `'40001'`). Dry run SHA-256 `e6802eca7456a993a6a4e91d86dff815d8275eb3b7829ef19616c33d24662348`, apply `3ef0573a4d57a657ea26b155125143dcda620df33aac3e309a4c9fa61586576c`, identical except for the header line and the sentinel. Local rehearsal on a clean 122 (private stack; only the two local ledger MD5 constants patched): dry run `DRYRUN_OK` and nothing changed, apply committed with the exact post-digests, a second apply refused (`R1_PRE_LEDGER`).

| Step | Result |
| --- | --- |
| Production dry run (02:04:51–02:04:59) | `DRYRUN_OK all 123 guards passed; functions=f815c1922131bdf7f14e3149dd30835b/461 triggers=359cab9e49c5944b428a2a913600126a/168 policies=5d22d547b9809d8d4a8ac8780372b953/164 relations=7abd380c84fc099bd0e3585810537bea/85`; afterwards ledger 122, no `portal_security`, no `family_links`, 31 baseline policies, all nine digests unchanged |
| Production apply (02:05:23–02:05:33) | exit 0, committed; ledger 123, row 123 MD5 `a9f92929…`; PostgREST schema cache reloaded at 02:05:30 (`notify pgrst`) |

## R2 — merge and deployment

| Step | Result |
| --- | --- |
| Squash-merge (02:05:39–02:05:44, 6 s after the ledger read) | PR #167 at `d3911c5…` merged as **`e3020456a73375b2925dba97d552e869520d122b`** |
| Production deployment | GitHub `Production` deployment **`7375260800`**, `success` at **02:08:02** (2 min 29 s after the apply committed) |

## Read-only checks after R2 (02:08:19–02:09)

| Check | Result |
| --- | --- |
| Ledger | 123 rows, 001–123; row 123 stored statement MD5 **`a9f929294365ccefb6df42f971ea0f99`**, `created_by` equal to row 122's |
| Catalog diff | all nine digests equal to the rehearsed build. Functions 424 → 461: **37 added** (the 14 public portal and invitation functions `portal_teacher_roster`, `portal_my_learners`, `portal_learner_record`, `portal_request_reenrollment`, `portal_message_recipients`, `portal_send_message`, `portal_my_messages`, `preview_family_invitation`, `prepare_family_invitation`, `prepare_teacher_invitation`, `link_family_student`, `link_teacher_account`, `revoke_family_link`, `list_family_links`, and 23 in `portal_security`, including `teacher_sees`, `teacher_member`, `queue_role_invitation`, `readiness_failures`, the normalisation, recipient and portfolio-guard triggers); **20 changed** (the 14 re-created helpers `get_visible_student_ids`, `get_my_teacher_id`, `get_my_email`, `teacher_can_access_student_group`, `can_message_recipient`, `get_teacher_directory`, `resolve_storage_asset`, `storage_security.can_write`, `prepare_role_invitation`, `apply_pending_role`, `log_activity`, `mark_message_read`, `mark_my_notifications_read`, `online_security.caller_teacher_id`, and the D12 grant changes on `get_my_role`, `get_my_student_id`, `handle_new_auth_user`, `handle_new_receipt`, `notify_premium_homework_teacher`, `sync_premium_membership_entitlement`); none dropped. Policies 172 → 164: 20 dropped (family and teacher reads of `students`, `enrollments`, `receipts`, `charges`, `placement_tests`, `attendance`, `certificates`, `enrollments parent insert`, `attendance teacher delete`, the four teacher `rw` policies), 12 added (teacher select/insert/update on assessments, learning assessments, placement tests and portfolios, no delete), 11 re-created (attendance teacher select/insert/update, portfolio student update/delete, notifications and messages self read/insert, groups, app config and announcements reads). Triggers 156 → 168 (activity log on five academic tables, e-mail normalisation on four tables, recipient on messages and notifications, portfolio guard). Relations 84 → 85 (`family_links`), schema `portal_security`, columns incl. `messages.notified_at`, `NOT VALID` normalisation constraints |
| Accounts | still 0 teacher, parent or student profiles; 0 pending invitations; 0 family links |
| Grants and policies (catalog) | `anon` executes none of the 11 D12 functions and none of the 14 portal functions; `authenticated` executes the 14; `family_links` has no grant to `anon` or `authenticated`; no policy on `students`, `enrollments`, `receipts`, `charges`, `placement_tests`, `attendance` or `certificates` refers to the family link set, the login e-mail or a parent/student role (`charges` SELECT policies: `charges staff read` and `receptionist_charge_read` only, so no direct family read of charges); the only policies that still mention an e-mail are `messages self read`/`self insert` and `notifications self read` (their e-mail branch is limited to director and admin; portal roles match on `recipient_profile_id`) and `leave teacher insert` (unchanged, teacher identity from the bound record); no `USAGE` for `anon` or `authenticated` on `academic_security`, `portal_security` or any other private schema |
| Codes | 0 functions with `'40001'` |
| Readiness | `portal_security.readiness_failures()`: office recipient not configured; an address on more than 10 learner files; e-mail normalisation constraints not validated (expected before R3/R4) |
| Postgres logs 01:55–02:10 | no `ERROR`/`FATAL`; the only notable entry is the dry run's sentinel |
| PostgREST logs | the recurring timeout-manager line and the schema cache reload (81 relations, 214 functions) at 02:05:30–02:05:32 |
| API (edge) logs | CRM scheduler calls only, all 200/204; no 4xx/5xx |
| Anonymous routes (02:08) | `/` and `/crm/leads` → 307 to `/login` |
| Vercel runtime errors | not verified (no Vercel access from the release session) |

## Passive observation (30 minutes)

Window 02:05:33–02:35:40, final read at **02:35:56** (30 minutes after the apply).

| Check | Result |
| --- | --- |
| Catalog and ledger | unchanged since the post-R2 read: all nine digests equal to the rehearsed build, row 123 MD5 `a9f92929…`, 0 `'40001'`, every grant and policy proof identical |
| Accounts | still 0 teacher, parent or student profiles (1 director, 1 admin, 3 receptionists), 0 pending invitations, 0 family links, 0 messages, 0 notifications |
| Counters | `xact_rollback` **391,314,447**: +1 since the R0 before-values, the dry run's sentinel rollback; `xact_commit` 3,119,530 (+1,078 since 02:04:13, normal background traffic) |
| Postgres logs 02:09–02:36 | 24 entries, no `ERROR`/`FATAL` |
| PostgREST logs | 7 entries, only the recurring timeout-manager line |
| API (edge) logs | 17 requests, no 4xx/5xx |
| Anonymous routes (02:36) | `/` and `/crm/leads` → 307 to `/login` |

## Still open

- R3 (clean-up C0–C2 with the counts above re-read on the day, then constraint validation), R4 (teachers assigned to groups; the office login invited and set as the office recipient), R5 (pilot), R6 (first invitations), each under its own approval. The prepared corrective migration stays unapplied.
- No fresh backup exists for this release (accepted by the owner); the latest manual dump is the one taken before migration 122.
- Recovery before R6: revert the deployment and, if needed, apply the prepared corrective (`scripts/portal-readiness-corrective.sql`) under the owner's approval.
