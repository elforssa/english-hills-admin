# Online learning pilot R0–R2 — Production release record (2026-10-21 UTC)

Release record for the [online learning pilot](../plans/online-learning.md) (plan OL-r4, [ADR-008](../decisions/ADR-008-online-learning-pilot.md), Tier 3), steps R0–R2 of its [rollout](../plans/online-learning.md#rollout-and-recovery-strategy). It records what was released and observed. The current register is [CURRENT_STATE](../../ai/CURRENT_STATE.md). Times are UTC.

**State: MERGED / DEPLOYED WITH THE LIVE SWITCH OFF / NOT ACTIVATED.** Migration 117 is applied and the code is live, but `ONLINE_LEARNING_LIVE_ENABLED` and `ONLINE_VIDEO_PROVIDER` are unset, so every online API route refuses. No provider is chosen; only the fake adapter exists, and Production refuses it. R3–R8 (provider account and secret, provider acceptance, gate on, pilot course, pilot run, closeout) are **not approved**.

This record holds counts, hashes and timestamps only. No name, contact detail, payment detail, credential or export content appears here.

## Release identity

| Item | Value |
| --- | --- |
| Pull request | [#145](https://github.com/elforssa/english-hills-admin/pull/145), branch `feat/online-learning-pilot` |
| Reviewed and approved head | `0f6a35f3b7438b72675444280cb25dbf91e10938` |
| Base (`main` before the merge) | `f7bf13ee4b21a666083164c962e72cc0a1062cff` (PR #144) |
| Exact-head CI | Verify run [39261445290](https://github.com/elforssa/english-hills-admin/actions/runs/39261445290), attempt 2, success (classify, app, docs, local-database, required; tooling skipped). Attempt 1 failed only on the known sidebar-focus assertion in `scripts/test-ui-foundation-browser.mjs`, a file the PR does not touch. |
| Independent review | **READY FOR FINAL REVIEW** on `0f6a35f3…`, posted on PR #145 on 2026-10-20; no blocking finding, two non-blocking notes and one test gap (see [follow-ups](../plans/online-learning.md#release-record-r0r2)). The verdict states that it authorizes neither merge nor release. |
| Merge | `63e0cf9f27e8d4ee06f046ba6bcbb51b6c7556e9`, squash merge with parent `f7bf13ee…`, tree identical to the approved head, guarded with `--match-head-commit`, 2026-10-21T13:03:07Z. Push-to-main Verify run [39604618097](https://github.com/elforssa/english-hills-admin/actions/runs/39604618097) success. |
| Migration | `117_online_learning_pilot.sql`, 117,026 bytes, MD5 `5eb3176c6b89bafec345c163821ccc89`, SHA-256 `ea655f09bfe4afef97588bbe53da808f433016388629c8ada89e059042c3e73d`, git blob `d06fb2e494c2b9183ef583693173b1f56942df7d` |
| Vercel Production | GitHub `Production` deployment `7226804901`, `success` at 13:05:06Z, on `63e0cf9f…`. The Vercel deployment ID is not recorded here (see [limitations](#limitations)). |
| Supabase project | `hopcezradkhrixwwswxn` |

## Owner approvals (Maroine)

| Step | Approval | Scope |
| --- | --- | --- |
| R0–R2 | 2026-10-20 | Release of PR #145 at the exact head, steps R0–R2 only, migration first as the plan states; R0 authorized at once, R1 and R2 each to stop for explicit approval. Not authorized: any provider account or secret, setting either online variable, the live switch, creating courses, Production data writes beyond the migration, R3 and later. |
| R1 | 2026-10-21 | Proceed without a backup (accepted risk below); Production dry run, apply, read-only proofs; stop before R2. |
| R2 | 2026-10-21 | Squash-merge at exactly `0f6a35f3…` (stop if head or base changed); wait for Vercel Production READY on the merge commit; confirm that every online page and API route refuses with the live switch off and that existing pages still load; set no variable; stop after R2. |

### Accepted risk: no backup (owner, 2026-10-21)

The owner's words, verbatim:

> Supabase backups are not available on my plan, and a manual dump is not practical from my network. I accept proceeding with R1 without a backup, as for Premium Release A, because 117 is additive and transactional. Record this as an accepted risk. Premium Release B still requires a real backup.

`supabase backups list` at R0 reported WAL-G enabled, PITR off and no backup (earliest and latest timestamp 0). Recovery for 117 relies on its additivity: the live switch stays off, and any repair is a reviewed forward migration. **Premium retirement Release B still requires a real backup.**

## Access path

Database reads and writes used two paths:

- the Supabase connector's `execute_sql`, for R0 reads while the CLI had no access token;
- the Supabase CLI `supabase db query --linked` (Management API, executing as `postgres`), run in the owner's terminal once the login worked. It was used for the backup listing, the R0 ledger re-read, the dry run, the apply and the post-proofs.

Every read ran with `set transaction read only` and reported `transaction_read_only = on`. The CLI prints "Initialising login role…" on each call. No `db push --linked` and no database password were used. The deployment state was read from the GitHub deployments API. The Vercel connector in the release session returned 403/404 for this team, and the Vercel CLI was not installed.

## R0 — read-only pre-checks (2026-10-21)

| Check | Result |
| --- | --- |
| PR #145 head / base | `0f6a35f3…` / `f7bf13ee…`, unchanged; `origin/main` `f7bf13ee…`; OPEN, MERGEABLE, CLEAN |
| Production ledger | 116 rows, 001–116, no gaps; tail `113 premium_retirement_finance_contract`, `114 crm_meta_insights_live_sync`, `115 crm_meta_attribution_hierarchy`, `116 crm_marketing_funnel_program`; stored statements of 115 and 116 equal their files (MD5 `d714b70e…7203`, `8bad7304…432bc46c`) |
| Online objects | none: no `online_security` schema; no `online_*` relation, function, type or trigger; no constraint or function body mentioning `'Online'`; no group, learner or enrolment with an online programme |
| Bodies 117 re-creates | `crm_start_enrollment` MD5 `2cabf2de7711608e6766909ba869c1a4`, `operational_security.valid_session_level` `3d2872dae5f3d0ba8c55f582d41e1b31`, `save_receptionist_enrollment` `92effa98b261366a079f4e051b4ffba7`. Each equals the file's body with its one changed line reverted. Owner `postgres`, `search_path=pg_catalog, pg_temp`; ACLs `{postgres=X/postgres,authenticated=X/postgres}`, `{postgres=X/postgres}` (helper, immutable, security invoker) and `{postgres=X/postgres,authenticated=X/postgres}`. |
| Constraints 117 rebuilds | the five `session_type` checks and `notifications_type_check`: definition MD5s equal to a clean local build at 116 |
| Whole app catalog | functions 320, relations 72, columns 967, constraints 646, policies 163, triggers 147, indexes 236, schemas 5: every section digest equal to a clean local build at 116 (no drift) |
| Default ACLs inherited by new objects | `postgres` and `public` subset MD5 `91f027b637373cfabbb7d6d1cbf44a07`, equal to the local build |
| Backups | WAL-G true, PITR false, no backup (owner-accepted risk above) |
| Deployed web source | `f7bf13ee…`: GitHub `Production` deployment `7151615202`, `success`, 2026-10-18 07:43:15Z |
| Vercel environment | no variable whose name contains `ONLINE` in Production, Preview or Development: a names-only check made by the owner's guide through the Vercel connector, relayed by the owner |

## R1 — migration 117 (2026-10-21)

The file ran in one transaction inside a guarded wrapper with `lock_timeout` 5 s.

- **Preconditions:** ledger exactly 001–116 with no row 117; `created_by` present on row 116; no online objects; the eight catalog digests and the default-ACL digest above; the three pre-117 bodies.
- **Migration body:** the file's lines 20–1773 verbatim, i.e. everything between its own `begin;` and `commit;`.
- **Ledger row:** inserted in the same transaction. `statements` holds the whole file, and `created_by` is copied from row 116 (an account identity, not reproduced here).
- **Postconditions:**
  - the ledger and row 117;
  - the eight catalog digests equal to the rehearsed local 117 build;
  - the three post-117 bodies;
  - a line-by-line diff of each re-created function against its pre-117 body, with identical security attributes;
  - row-hash equality before and after for `groups`, `students`, `enrollments`, `charges`, `receipts` and `notifications`;
  - empty online tables;
  - 31 private helpers with no API grant.

Wrappers: dry run SHA-256 `2e1f2cf60e67da04a6c45ed60acea881cb1c91b300b8d6885d04b0d6af30e493`, apply `4e6b11b0a4b528e57049411c964f29014bde54106eb06a4033c0fe9f027afa02`. They are identical except that the dry run ends with a sentinel exception and `rollback`.

| Step | Result |
| --- | --- |
| Local rehearsal (private stack at 116, synthetic) | Dry run `DRYRUN_OK`, nothing persisted. A planted extra function was refused with `R1_PRE_CATALOG_DIGEST`. The apply committed, a second apply was refused with `R1_PRE_LEDGER`, the post-proofs were 10/10 true, and `scripts/test-online-learning.sql` passed on the result. |
| Production dry run (12:40:17Z) | `DRYRUN_OK all R1 guards passed; functions=54 online_tables_rows=0`; afterwards ledger 116/116, no online objects, `crm_start_enrollment` body unchanged |
| Production apply (12:41:58–12:42:05Z) | Exit 0, committed |
| Read-only post-proofs (SHA-256 `ac499bc2f7b5c609305266ed1225c962a8e23e5637b913f690b08e0e4d0bd15d`) | **10 of 10 true**, listed below |

The ten post-proofs:

- `read_only`;
- `ledger_001_117`;
- `ledger_row_117`: statement MD5 `5eb3176c…` equal to the file, name `online_learning_pilot`, one element, `created_by` equal to row 116's;
- `unchanged_crm_112`;
- `unchanged_helper_096`;
- `unchanged_command_096`;
- `catalog_equals_rehearsed_117`: functions 374, relations 80, columns 1056, constraints 707, policies 169, triggers 150, indexes 256, schemas 6;
- `helpers_31`;
- `online_tables_empty`;
- `no_online_groups`.

### Unchanged-from-112 and unchanged-from-096 proofs

For each of `crm_start_enrollment` (112), `operational_security.valid_session_level` (096) and `save_receptionist_enrollment` (096):

- **Inside the transaction**, it has the same line count as its pre-117 body, and exactly one line differs. That line is the programme list ending `'Mise à niveau','Other'`, and it differs only by `,'Online','Online One-to-One'`. Signature, return type, owner, security mode, volatility, `search_path` and ACL are identical.
- **After commit (read-only)**, the body MD5 equals the file's: `d57a2c17f48b9882a6bb377cfd5b9e04`, `e949fbea55bf6bd364be0ce68eb9e14e` and `e3981e08a0a0361e1edeb0580d729486` respectively. Removing those two values gives back the R0 MD5. Exactly one line carries them, and owner, ACL and `search_path` are as at R0.

### Security advisor (after R1)

The Supabase security advisor shows nothing beyond the reviewed design:

- `rls_enabled_no_policy` (INFO): `online_join_tokens` and `online_join_events` (intended: no API read on passes or provider evidence).
- `authenticated_security_definer_function_executable` (WARN): 21 online RPCs, the same RPC-only pattern as the 121 existing functions with this lint.
- No online function appears under `anon_security_definer_function_executable`, and neither of the two service-role-only functions is listed. The other lints (`function_search_path_mutable` ×2, the anon list ×11, `auth_leaked_password_protection`) predate 117.

## R2 — merge and deployment (2026-10-21)

- **Pre-merge re-check:** head `0f6a35f3…`, base and `origin/main` `f7bf13ee…`, OPEN / MERGEABLE / CLEAN, exact-head checks green.
- **Merge, push-to-main CI and the GitHub Production deployment:** as in the [identity table](#release-identity). The deployment appeared about two minutes after the merge and was `success` on first read. The production domain serves this build: the online API routes, which the previous build did not contain, answer there.

### Anonymous probes of `admin.english-hills.com` (after 13:05Z)

The API probes were POSTs with a dummy JSON body (no session). The gate is checked before authentication or any database call, so no request reached the database.

| Path | Result |
| --- | --- |
| `POST /api/online/join`, `/api/online/courses/activate`, `/api/online/courses/close`, `/api/online/lessons/cancel`, `/api/online/lessons/reschedule` | 503 `{"reason":"gate_closed"}` |
| `POST /api/webhooks/online/fake` | 404 `{"reason":"not_found"}` |
| `GET /api/online/join`, `GET /api/webhooks/online/fake` | 405 |
| `/online`, `/online/<id>`, `/online/room/<id>`, `/teacher-portal/online`, `/teacher-portal/online/<id>`, `/student-portal/online`, `/parent-portal/online` | 307 to `/login?returnTo=…` |
| `/login`, `/inscription` | 200 |
| `/`, `/students`, `/crm`, `/finance`, `/receipts`, `/enrollments`, `/groups` | 307 to `/login?returnTo=…` |

- **Public form (Q15):** `/inscription` offers exactly the eight existing programmes (Yearly, Adults, Summer Camp, Communication Junior, Communication Adult, One-to-One, Mise à niveau, Other) and no online type. The login page logged no console error.
- **Supabase logs (12:00–13:10Z):** API gateway responses since the merge were 153 × 200 and 1 × 204. Postgres errors from this release: only the dry run's sentinel at 12:40:17Z.

### Unrelated Production log errors (not from this release)

Between 12:54 and 13:04Z the Postgres log shows six errors that this release did not cause. Their source is unknown, possibly another operator session running Production dry runs:

- `relation "groupes" does not exist` (12:54:13);
- a message beginning `REFS:` listing references to one learner from receipts, enrollments, charges and CRM leads (12:55:35);
- `column r.amount does not exist` (12:55:43);
- three `DRYRUN_OK` sentinels with other payloads (13:00:12, 13:04:05, 13:04:21).

They are recorded for follow-up, not investigated here.

## Not verified

1. **Signed-in pages.** No authenticated Production check was made: the release session had no Production session and does not sign in. With the switch off, a signed-in director or admin can still open `/online` and save a draft course or pattern through the online RPCs, which are not switch-gated by design. Activation, close, cancel, reschedule and join go through the gated routes, which refuse.
2. **Vercel runtime logs** and the Vercel deployment ID: the connector in the release session had no access to the team, and the Vercel CLI was not installed.

## Limitations

1. No backup existed (owner-accepted risk above).
2. The deployed source is evidenced by the GitHub deployment record and by the new routes answering on the production domain, not by a Vercel inspect of the alias.
3. The Vercel environment check is the guide's names-only read, relayed by the owner; the release session did not read it directly.
4. The probes are anonymous; they prove refusal before authentication, not each role's in-app view.
