# Online learning Zoom adapter R0′–R2′ — Production release record (2026-10-23 UTC)

Release record for the real-provider step of the [online learning pilot](../plans/online-learning.md) (plan OL-r6, [ADR-008](../decisions/ADR-008-online-learning-pilot.md), Tier 3): PR #148, the Zoom Video SDK adapter and migration 118, steps R0′–R2′. It follows the pattern of the [R0–R2 release record](online-learning-r0-r2-production-2026-10-21.md). It records what was released and observed. The current register is [CURRENT_STATE](../../ai/CURRENT_STATE.md). Times are UTC.

**State: MERGED / DEPLOYED WITH THE LIVE SWITCH OFF / NOT ACTIVATED.** Migration 118 is applied and the `zoom-video` adapter is live, but `ONLINE_LEARNING_LIVE_ENABLED` and `ONLINE_VIDEO_PROVIDER` are unset, so every online API route refuses and both online webhooks answer 404. No Zoom key is set in any environment by this release, and no online course exists. R3–R8 (Zoom account and Vercel secrets, provider acceptance, gate on, pilot course, pilot run, closeout) are **not approved**.

This record holds counts, hashes and timestamps only. No name, contact detail, payment detail, credential or export content appears here.

## Release identity

| Item | Value |
| --- | --- |
| Pull request | [#148](https://github.com/elforssa/english-hills-admin/pull/148), branch `feat/online-learning-zoom-adapter` |
| Reviewed and approved head | `0ba2546ef59a4081da75a0a56b5138dc8ce89995` |
| Base (`main` before the merge) | `2a05da3e648539b91190badab44c0deb035a9cb8` (PR #147, OL-r6 addendum) |
| Exact-head CI | Verify run [39899145108](https://github.com/elforssa/english-hills-admin/actions/runs/39899145108), attempt 1, success (classify, app, docs, local-database, required; tooling skipped) |
| Independent review | **READY FOR FINAL REVIEW** on `0ba2546e…` (2026-10-23), as relayed by the owner in the release task. The verdict was not posted on PR #148 by the time of the release. |
| Merge | `43be8fa0e82faf6740ffbe3b66d70d6235d234f9`, squash merge with parent `2a05da3e…`, tree `21b46fce105bb91cbf46eecb95636b877c6179e2` identical to the approved head, guarded with `--match-head-commit`, 2026-10-23T07:58:46Z. Push-to-main Verify run [39921420817](https://github.com/elforssa/english-hills-admin/actions/runs/39921420817) success (classify, app, required; docs, local-database and tooling skipped). |
| Migration | `118_online_close_course_room_ref.sql`, 3,659 bytes, MD5 `b325eecf03b14f948c403fe6a8a53b9b`, SHA-256 `269a2a82e713cd7395fcd34b262e8cdcd97442323e1a9845a7acf46a7726a5e1`, git blob `b0779d45d548b08823847c4fbac319b582b827ab` |
| Vercel Production | GitHub `Production` deployment `7273254192` (created by the Vercel integration), `success` at 08:01:10Z, on `43be8fa0…`. The Vercel deployment ID is not recorded here (see [limitations](#limitations)). |
| Supabase project | `hopcezradkhrixwwswxn` |

## Owner decisions and approvals (Maroine)

### Release approval (2026-10-23)

Scope: R0′ read-only checks; R1′ apply migration 118 only, with a dry run, the apply and read-only proofs as at R1, run from the owner's Terminal panel; R2′ squash-merge #148 at exactly the head above, verify Vercel Production READY on the merge commit, confirm the online routes still refuse with the live switch off. Each step stopped for the owner's explicit approval in the release session. **Not authorized:** any Vercel variable, Zoom keys, the live switch, courses, R3 and later.

The owner's decisions in the release task, verbatim:

> (1) I acknowledge the A7 switch to record-and-capture, triggered by the local evidence that Zoom’s regional hosts change per session, instead of by T-P5.
> (2) T-P4 stays an open S2 item. It does not block this merge, but it blocks R4 completion and R5 until either the Zoom setting is found and T-P4 passes, or I explicitly accept the gap.
> (3) Migration-first order. 118 is applied without a backup, the same accepted risk as 117: no backups on the plan, 118 is additive and transactional. Premium Release B still requires a real backup.

| Step | Approval | Scope |
| --- | --- | --- |
| R0′ | 2026-10-23, release task | Read-only checks |
| R1′ | 2026-10-23, release session | Production dry run, apply migration 118 with the guarded wrapper, read-only post-proofs, from the owner's Terminal panel; no backup (accepted risk); stop before R2′ |
| R2′ | 2026-10-23, release session | Squash-merge #148 at exactly `0ba2546e…` (stop if head or base changed); verify Vercel Production READY on the merge commit; confirm the online routes still refuse with the live switch off; set no variable; stop after R2′ |

### After R2′: T-P4 accepted, T-P5 deferred (2026-10-23)

Given after R2′ for this record, verbatim:

> Owner decisions (Maroine, 2026-10-23): (1) I accept the T-P4 gap: participants may be able to rename themselves in Zoom Video SDK sessions, because the Workplace rename setting does not reach SDK sessions. Compensations: the platform sends only the first-name-plus-initial label, attendance is written from the platform roster and never from Zoom names, and the host can rename or remove a participant. This closes T-P4 as an accepted gap for R5. (2) The T-P5 phone check is deferred. R4’s test lesson on real phones is the first quality check, and the first pilot week is monitored. If learners report call quality problems, the full phone check runs then, with Daily as the fallback.

Decision (1) resolves the release task's decision (2): T-P4 no longer blocks R4 completion or R5. Neither decision authorizes R3 or any later step.

## Access path

As at R1, the database steps used the Supabase CLI `supabase db query --linked` (Management API, executing as `postgres`), typed into the owner's Terminal panel from the release session. Each command wrote its output to a file in the session's scratch directory. Every read ran with `set transaction read only` and reported `transaction_read_only = on`. The CLI prints "Initialising login role…" on each call. No `db push --linked` and no database password were used. The security advisor and the Postgres logs were read through the Supabase connector. The deployment state was read from the GitHub deployments API: the Vercel connector in the release session listed no project for team `english-hills-projects`.

## R0′ — read-only pre-checks (07:40Z)

| Check | Result |
| --- | --- |
| PR #148 head / base | `0ba2546e…` / `2a05da3e…`, unchanged; `origin/main` `2a05da3e…`; OPEN, MERGEABLE, CLEAN |
| Deployed web source | `2a05da3e…`: GitHub `Production` deployment `7256357912`, `success`, 2026-10-22 15:30:51Z |
| Production ledger | 117 rows, 001–117, no gaps, no row 118; tail `115 crm_meta_attribution_hierarchy`, `116 crm_marketing_funnel_program`, `117 online_learning_pilot`; row 117 statement MD5 `5eb3176c…` equal to the 117 file, one element, `created_by` present |
| `online_close_course` | body MD5 `09d0deb8425351b449caadc16056929d`, equal to its 117 body; security definer, volatile, `search_path=pg_catalog, pg_temp`, ACL `{postgres=X/postgres,authenticated=X/postgres}`, owner `postgres` |
| Online objects and data | no `online_resolve_room`; 54 online functions, 31 helpers; 0 online courses, every online table empty, 0 groups with an online programme |
| Whole app catalog | functions 374, relations 80, columns 1056, constraints 707, policies 169, triggers 150, indexes 256, schemas 6: every section digest equal to the rehearsed post-117 build recorded at R1, and to a clean local build at 117 made on 2026-10-23 (no drift) |
| Backups | not re-listed; the owner's decision (3) above records that the plan has none |

The R0′ query file has SHA-256 `51e5199533f0deddfffa62fcfd84e3fd4d2165800c6cb01bfa36f2dfefacf45d`.

## R1′ — migration 118 (07:48Z)

The file ran in one transaction inside a guarded wrapper with `lock_timeout` 5 s.

- **Preconditions:** ledger exactly 001–117 with no row 118; row 117 equal to the 117 file with `created_by` present; no `online_resolve_room`; `online_close_course` equal to its 117 body with the R0′ security attributes; every online table empty; the eight catalog digests above; the default-ACL digest `91f027b637373cfabbb7d6d1cbf44a07` (as at R1).
- **Migration body:** the file's lines 12–59 verbatim, i.e. everything between its own `begin;` and `commit;`. The file's own assertion block (close returns no room reference; `online_resolve_room` executable by no API role other than `service_role`) ran inside the transaction.
- **Ledger row:** inserted in the same transaction. `statements` holds the whole file, and `created_by` is copied from row 117 (an account identity, not reproduced here).
- **Postconditions:** the ledger and row 118; the eight catalog digests equal to the rehearsed local 118 build (functions 375 `08fdf7ef4c6f3c4dc85dc64b55c6beb5`, every other section unchanged); `online_close_course` with the 118 body MD5 `9036de6dd4e5924fff0a0abb45e67116`, the same security attributes, arguments and return type; `online_resolve_room(p_group uuid)` with body MD5 `6200edc2dc0d2c5e8da96b02bff03e80`, security definer, stable, `search_path=pg_catalog, pg_temp`, ACL `{postgres=X/postgres,service_role=X/postgres}`, one overload; row-hash equality before and after for `groups`, `students`, `enrollments`, `charges`, `receipts` and `notifications`; empty online tables; 31 helpers.

Wrappers: dry run SHA-256 `58c231067d2e45c74652192330b88c8e9b39f6e2431a3638cb7f60421e197efe`, apply `4837a09524ef3922c2e13b99a19e5b0800bbe580c2b497fc1ab292259df0c94e`. They are identical except that the dry run ends with a sentinel exception and `rollback`.

| Step | Result |
| --- | --- |
| Local rehearsal (private stack at 117, synthetic, ledger shaped like Production's) | Dry run `DRYRUN_OK`, nothing persisted. A planted extra function was refused with `R1P_PRE_CATALOG_DIGEST`. The apply committed, a second apply was refused with `R1P_PRE_LEDGER`, the post-proofs were 11/11 true, and `scripts/test-online-learning.sql` passed on the result. A first rehearsal run aborted on a wrongly formatted expected value in the wrapper's own post-check (argument list); it rolled back, the check was corrected, and every step above was rerun. |
| Production dry run (07:48:17Z; Postgres 07:48:21–07:48:22Z) | `DRYRUN_OK all R1' guards passed; functions=55 online_tables_rows=0`. The R0′ query re-run at 07:48:40Z returned output byte-identical to R0′ (ledger 117, no `online_resolve_room`, same catalog). |
| Production apply (07:48:54–07:49:00Z; Postgres statement 07:48:58Z) | Exit 0, committed |
| Read-only post-proofs (07:49:13Z; query SHA-256 `0288458e9c3527640cccddd9f76dd53911fbec1fa0a3653f154f967c01122555`) | **11 of 11 true**, listed below |

The eleven post-proofs:

- `read_only`;
- `ledger_001_118`;
- `ledger_row_118`: statement MD5 `b325eecf…` equal to the file, name `online_close_course_room_ref`, one element, `created_by` equal to row 117's;
- `close_course_118`: body MD5 `9036de6d…` with the R0′ security attributes and ACL;
- `close_course_no_room_ref`: the body mentions neither `room_ref` nor `'provider'` (review fix N1);
- `resolve_room_service_role_only`: body MD5 `6200edc2…`, ACL `{postgres=X/postgres,service_role=X/postgres}`;
- `resolve_room_not_api`: neither `anon` nor `authenticated` may execute it;
- `catalog_equals_rehearsed_118`;
- `helpers_31`;
- `online_tables_empty`;
- `no_online_groups`.

### Security advisor (after R1′, 07:49:33Z)

Unchanged from R1: `rls_enabled_no_policy` (INFO) lists the same two online tables (`online_join_tokens`, `online_join_events`) among its 36 entries; `authenticated_security_definer_function_executable` (WARN) lists the same 21 online RPCs among its 142 (21 + the 121 existing functions); no online function appears under `anon_security_definer_function_executable`; `online_resolve_room` appears in no lint. The other lints (`function_search_path_mutable` ×2, the anon list ×11, `auth_leaked_password_protection`) predate 117.

### Postgres log (07:40–07:55Z)

Only the dry run's statement and its `DRYRUN_OK` sentinel, and the apply's statement. No other error.

## R2′ — merge and deployment

- **Pre-merge re-check:** head `0ba2546e…`, base and `origin/main` `2a05da3e…`, OPEN / MERGEABLE / CLEAN, exact-head checks green.
- **Merge, push-to-main CI and the GitHub Production deployment:** as in the [identity table](#release-identity). The deployment appeared about two minutes after the merge and was `success` on first read. The production domain serves this build: the room path carries the headers that #148 adds (below), which the previous build did not send.
- **Compatibility between R1′ and R2′ (about ten minutes):** the 117 build's close route reads `room_ref` from `online_close_course`, which 118 no longer returns; that route refused with `gate_closed` before any database call, and no online course existed.

### Anonymous probes of `admin.english-hills.com` (08:01:32Z)

The API probes were POSTs with a dummy JSON body (no session). The gate is checked before authentication or any database call, so no request reached the database.

| Path | Result |
| --- | --- |
| `POST /api/online/join`, `/api/online/courses/activate`, `/api/online/courses/close`, `/api/online/lessons/cancel`, `/api/online/lessons/reschedule` | 503 `{"reason":"gate_closed"}` |
| `POST /api/webhooks/online/fake` | 404 `{"reason":"not_found"}` |
| `POST /api/webhooks/online/zoom-video`, an event body and an `endpoint.url_validation` challenge body | 404 `{"reason":"not_found"}` both (the challenge is not answered with the gate off, A3) |
| `GET /api/online/join`, `GET /api/webhooks/online/zoom-video` | 405 |
| `/online`, `/online/<id>`, `/online/room/<id>`, `/teacher-portal/online`, `/teacher-portal/online/<id>`, `/student-portal/online`, `/parent-portal/online` | 307 to `/login?returnTo=…` |
| `/login`, `/inscription` | 200 |
| `/`, `/students`, `/crm`, `/finance`, `/receipts`, `/enrollments`, `/groups` | 307 to `/login?returnTo=…` |

- **Room-path headers:** the 307 from `/online/room/<id>` carries `Permissions-Policy: camera=(self), microphone=(self), geolocation=()` and a CSP whose `script-src` adds `'wasm-unsafe-eval' https://source.zoom.us`. `/login` keeps `camera=(), microphone=()` and the base CSP without Zoom hosts.
- **Public form (Q15):** `/inscription` offers no online programme.
- **Supabase logs (07:58–08:03Z):** no error in the Postgres or API gateway logs.

## Not verified

1. **Signed-in pages and the Zoom room in Production.** No authenticated Production check was made: the release session had no Production session and does not sign in. No Zoom key is set, so no Production join was possible; T-P1–T-P4 and T-P7 evidence remains the implementer's local run recorded in the [plan](../plans/online-learning.md#implementation-record--real-provider-step-2-zoom-video-sdk).
2. **Vercel environment, runtime logs and deployment ID:** the Vercel connector listed no project for the team, and the Vercel CLI was not used. That no online variable is set is inferred from the probes (the gate refuses and both webhooks answer 404), not read from Vercel.

## Limitations

1. No backup existed (owner-accepted risk above).
2. The deployed source is evidenced by the GitHub deployment record and by the new room-path headers on the production domain, not by a Vercel inspect of the alias.
3. The independent review verdict is the owner's relay; it is not posted on the PR.
4. The probes are anonymous; they prove refusal before authentication, not each role's in-app view.

## After R2′: R3 and R4 Phase A (2026-10-23)

The sections above are the R0′–R2′ snapshot and are left as they were at R2′. This section records what happened afterwards on the same day.

### R3 — owner action

- `ONLINE_VIDEO_PROVIDER` was set by the owner's guide through the Vercel connector on the owner's instruction.
- `ONLINE_VIDEO_PROVIDER_API_KEY` and `ONLINE_VIDEO_PROVIDER_API_SECRET` were set by the owner.
- All three are Production only and Sensitive, and are recorded here by name only. No release session read them.
- `ONLINE_LEARNING_LIVE_ENABLED` and `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` are not set, so no Zoom event subscription exists.
- The Zoom account is on a trial (20 credits, ending in 365 days); the owner will set up pay-as-you-go before R5.

### R4 Phase A — Production redeploy with the live switch off

| Item | Value |
| --- | --- |
| Approval | Owner, 2026-10-23: Phase A only (redeploy with the switch off, then READY and probe checks, then stop) |
| Redeploy | Triggered by the owner's guide on the owner's instruction at about 15:00 UTC: Vercel deployment `dpl_GdDJFv7npFHpPP1VikaFC2wUM4sN`, same commit `43be8fa0…`, `source: redeploy` (as reported by the guide; the release session's Vercel connector returns 404 for this team) |
| Serving build | The Next build ID in the `/login` page changed from `JazM5AwgL1e1fP8koh8Y6` to `ZWLNDoUqYvBLO1GXvPxZj` at 15:04:05 UTC; three further requests all returned the new build. The R3 variables are therefore in effect. |
| GitHub deployment status | Independent evidence of the redeploy: GitHub `Production` deployment `7273254192` (commit `43be8fa0…`) received a second `success` status at 15:00:58 UTC, "Deployment has completed", pointing to a new host `english-hills-admin-1j8e69n1j-…` (the first, at 08:01:10 UTC, pointed to `…-8zylixssg-…`). The redeploy added a status to the existing deployment record rather than a new record. |

Anonymous probes of `admin.english-hills.com` at 15:04:20 UTC, the same set as at R2′:

- `POST` to the five `/api/online/*` routes: 503 `{"reason":"gate_closed"}`. The gate is checked before the provider, so the loaded Zoom variables change nothing while the switch is off.
- `POST /api/webhooks/online/fake` and `/api/webhooks/online/zoom-video` (an event body and a validation challenge): 404 `{"reason":"not_found"}`.
- `GET` on the join route and the Zoom webhook: 405.
- The seven online pages: 307 to `/login`. The room path keeps its own `Permissions-Policy` and Zoom CSP; `/login` keeps camera and microphone off.
- `/login`, `/inscription`: 200; `/`, `/students`, `/crm`, `/finance`, `/receipts`, `/enrollments`, `/groups`: 307 to `/login`.
- Supabase Postgres and API gateway logs 14:50–15:06 UTC: no error.

### Mid-session token expiry (T-P3, recorded) — local run

Approved by the owner as D3. Run on 2026-10-23 at 15:04:50–15:07:00 UTC with `OL_ZOOM_WAIT_EXPIRY=1 scripts/test-online-zoom-acceptance.mjs`, using the developer credentials of the same Zoom Video SDK app as Production (the owner's answer to D3; values never printed). The report is kept outside the repository.

- A participant joined at 15:05:24 UTC with a token whose `exp` was about 10 seconds after issue (the script back-dates `iat`, so no 30-minute wait is needed). Ninety seconds later it was still in the session (`isInMeeting: true`) with no disconnect event. **Zoom checks the token only at join.**
- Access therefore ends through the platform: the room page re-reads `online_check_join` every 30 seconds and leaves at lesson end plus grace, and no pass is issued after that. The residual case, a client that ignores the page and stays until the session empties or the host removes it, is covered by the A1/Z2 mitigation; staying connected after `exp` was UNVERIFIED in Z2 and is now observed.
- The same run repeated T-P1, T-P2 and T-P3 at join (PASS), T-P4 (self-rename succeeded: the accepted gap) and T-P7 (rejoin after removal refused, 3009). It was US-routed; the Morocco-routed A7 capture belongs to the R4 test lesson.
