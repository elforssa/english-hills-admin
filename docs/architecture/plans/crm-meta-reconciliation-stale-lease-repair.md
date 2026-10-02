# Owner summary

## Owner acceptance and implementation commissioning — 2026-10-02

The owner explicitly commissioned **only the approved Tier-3 stale-lease repair**, naming this revision-1 plan merged through [PR #54](https://github.com/elforssa/english-hills-admin/pull/54) on main `1f98c4c112b17ef44ef92344167d44cb1fea4bac`. This accepts Option A's exact PT409 identifiers, distinct disabled/inactive reasons and two-value finish allowlist, and authorizes a separate implementation branch/PR with the full acceptance matrix. The commissioning message explicitly prohibits merge, Production deployment/migration, session termination, Meta calls, credentials, configuration, activation and H3-04–08/H4. Artifact-bound release ordering/approval remains pending. The proposed/pending language below preserves the architecture task's historical state at authoring; this dated acceptance supersedes it for implementation authorization only.

[Implementation evidence](../evidence/crm-meta-reconciliation-stale-lease-implementation-2026-10-02.md) records branch implementation and validation; independent review, merge, deployment and Production verification are separate pending states.

## What will change

**Tier 3 — proposed architecture, revision 1, 2026-10-02.** Repair the inbound Meta reconciliation error contract so permanently lost ownership returns a bounded business conflict instead of SQLSTATE `40001`. Two SQL functions and the narrow server/worker error path change in a later, separately commissioned implementation. This PR contains documentation only.

Repository: `elforssa/english-hills-admin`. Fetched main baseline: `3f6de44e7fc82315209482ed9472b9c2da559f55`. Accountable owner: Maroine EL Forssa. Architecture authorization is the owner's 2026-10-02 request for this bounded repair. **Design acceptance, implementation authorization and release approval are pending and separate.** [AGENTS](../../../AGENTS.md) governs separate architecture, implementation, independent review and release tasks.

## What staff/users will be able to do

No new controls or permissions. Existing inbound reconciliation can end a stale pass promptly without amplifying a business conflict into repeated database errors. Normal queue processing continues independently.

## What remains restricted

No Production operation, session termination, Meta call, credential generation/storage, provider-contract seed, destination/live-gate/lifecycle-cron activation, or source/form/cohort/boundary/ownership configuration. No H3-04–08 or H4 execution. No lifecycle transport, timestamp, privacy, matching, conversion or financial redesign. Migrations 001–104 remain immutable.

## UI impact

None. Scheduler output remains counts only. Conflict details, tokens, form identities, provider bodies and customer data must not enter responses or logs.

## Database impact

Propose one atomic forward migration after 104, provisionally `105_crm_meta_reconciliation_business_conflicts.sql`; check allocation before implementation. Replace only `public.crm_enqueue_meta_reconciled(uuid,text,uuid,jsonb)` and `public.crm_finish_meta_reconciliation(uuid,text,uuid,text)`. No table, index, policy, data, claim function or scheduler changes.

## Important security decisions

Retain worker authorization, existing owners/ACLs, SECURITY DEFINER and `search_path=pg_catalog,pg_temp`, RLS and revoked direct table access. Match a conflict by exact RPC name, SQLSTATE and fixed message identifier before discarding raw errors. Never suppress all HTTP 409s or all `40001`s.

## Risks / owner review points

The shared RPC wrapper currently erases error identity; SQL alone removes the retry hazard but does not give the worker the required ownership behavior. Mixed app/database versions need explicit release ordering and local compatibility proof. Expired ownership cannot be made valid by retrying the same request. A genuine serialization failure elsewhere must retain its existing meaning. Other uses of `40001` found in cumulative SQL are outside this bounded change; this plan makes no repository-wide safety claim.

## Verified current state and evidence limits

- [094](../../../supabase/migrations/094_crm_meta_reconciliation.sql) remains the latest definition of the three inbound reconciliation RPCs through 104. Claim uses `FOR UPDATE OF s0 SKIP LOCKED`, one due active form, a random token and 55-second expiry. Enqueue locks connection `FOR SHARE` then the matching state row `FOR UPDATE`; finish uses one fenced UPDATE.
- Enqueue has two explicit `40001` branches: `not found or started is null` (missing/expired/replaced lease OR disabled/unavailable reconciliation watermark), and missing effective mapping (`Form inactive`). Finish raises `40001` when its fenced UPDATE affects zero rows.
- [Worker](../../../src/lib/crm/meta/reconcile.mjs) claims once, reads at most two pages of 25, maps non-provider errors to storage failure, then attempts finish even after enqueue fails. [metaRpc](../../../src/lib/crm/meta/server.js) translates every unrecognized SQL error to `MetaError('storage_unavailable')`, losing ownership identity. [Protocol](../../../src/lib/crm/meta/protocol.mjs) provides the sanitized error type. [Scheduler](../../../src/lib/crm/intake/scheduler.mjs) continues shared ingestion after discovery and limits it to two jobs on a claimed-form tick.
- [H3 revision 5](crm-h3-technical-readiness.md) and [H3-02 implementation evidence](../evidence/crm-h3-02-implementation-2026-10-02.md) cover outbound transport/strict seconds. PR #53 merged as the baseline above. [104](../../../supabase/migrations/104_crm_lifecycle_strict_exported_seconds.sql) replaces outbound lifecycle hold/reconciliation bodies, not either inbound RPC. It did not cause this bug.
- [H3-03 release progress](https://github.com/elforssa/english-hills-admin/pull/53#issuecomment-5945676112) records READY deployment `dpl_H1Ve2GHGb74XyGUm62bLcw5h69tn` from that merge, initially before SQL application. The later [containment record](https://github.com/elforssa/english-hills-admin/pull/53#issuecomment-5946078325) records ledger through 104, the exactly verified backend's separately approved termination, zero matching stale errors in 05:16:30–05:20:45 UTC, a successful 05:20 intake tick and no runtime errors in its checked window.
- Owner incident input confirms millions of database errors from the looping backend and current ledger 001–104 in Production project `hopcezradkhrixwwswxn`. Contracts, policies, evidence, epochs, boundaries, ownership, deliveries, attempts and enabled lifecycle destinations remain zero; live gate absent/false and lifecycle cron inactive. The architecture task read repository/GitHub evidence only; it did not independently inspect Production or reproduce the historical storm.
- Earlier context and H3-02 documents saying unmerged/ledger 103 are dated pre-release evidence, superseded for this incident by the later operator/owner record. H3-03 closeout remains held. Do not infer full H3 completion from containment or ledger presence.

## Exact root cause

A zero-row finish UPDATE means the supplied connection/form/token no longer owns an unexpired lease (including already-finished and replaced tokens). Migration 094 deliberately raises the transaction-restart SQLSTATE `40001` for that permanent request conflict. Retrying the same request cannot regain ownership. Per confirmed incident evidence, PostgREST/transaction retry behavior repeatedly executed the failing transaction and amplified one stale call into a database error storm. Enqueue's two deliberate `40001` branches expose the same hazard. The worker's generic storage classification and unconditional finish additionally obscure ownership loss; they are not evidence of a JavaScript retry loop.

The [PostgREST custom-error contract](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes), read 2026-10-02, documents `PTxyz` for HTTP status selection with structured SQL code/message fields. Use `PT409`; it is outside transaction-rollback class 40. Documentation establishes the wire contract, not the deployed runtime's retry implementation/version. Real local HTTP tests below must prove bounded behavior on the tested stack; release records the actual runtime evidence.

## Proposed SQL contract

All three identifiers below are fixed nonsecret message strings. Raise `SQLSTATE 'PT409'` with exactly that `MESSAGE`, no dynamic DETAIL/HINT. Expected PostgREST response: HTTP 409, `code: 'PT409'`, exact `message`, null details/hint. Keep argument names, types, defaults and return types unchanged.

| RPC / condition | Exact message | State effects |
| --- | --- | --- |
| finish: existing fenced UPDATE finds zero rows | `crm_reconciliation_lease_lost` | Zero rows changed, no lease clearing, no due/error/updated time change |
| enqueue: existing token + expiry SELECT finds no state row | `crm_reconciliation_lease_lost` | No queue or state write |
| enqueue: matching lease exists but `started is null` | `crm_reconciliation_disabled` | No queue or state write; ownership and configuration remain distinct |
| enqueue: current mapping predicate finds no active form | `crm_reconciliation_form_inactive` | No queue or state write; not ownership loss |

In enqueue split the existing combined branch: check the state SELECT's `FOUND` immediately, before another statement can overwrite it; raise lease-lost first, then check `started is null`, then retain the current lower-bound and mapping checks. Thus stale token plus disabled/inactive configuration reports ownership loss; a valid token can report the distinct configuration conflict. Do not change the connection-before-state lock order, predicates or transaction scope.

Finish keeps the exact `connection_id`, `form_key`, `lease_token=p_lease`, `lease_until>now()` UPDATE fence. Do not pre-clear a lease, select-and-update without fencing, extend/renew a lease, return success for a zero-row update or mutate the replacement owner's schedule. Duplicate finish is lease-lost after the first successful call, with no second scheduling write. Preserve current transaction-time `now()` semantics; wall-clock lease redesign is outside scope.

For a still-owned disabled/inactive pass, allow finish `p_error` values `reconciliation_disabled` and `reconciliation_form_inactive` in addition to the existing allowlist. Both use the existing other-error five-minute branch and persist only that coarse reason. `reconciliation_lease_lost` is **not** an allowed finish error: after loss, the worker must not call finish at all. This two-value allowlist extension is the only scheduling-diagnostic change. Validation errors remain `22023`; authorization errors remain unchanged. No catch-all SQL exception handler, no conversion of real database failures to business conflicts, and no changes to other `40001` sites.

## Exact server and worker behavior

In `metaRpc`, before existing classification, map only these tuples to sanitized `MetaError` codes:

| Allowed RPC name | Exact SQL code/message | Internal code |
| --- | --- | --- |
| `crm_enqueue_meta_reconciled` or `crm_finish_meta_reconciliation` | `PT409` / `crm_reconciliation_lease_lost` | `reconciliation_lease_lost` |
| `crm_enqueue_meta_reconciled` only | `PT409` / `crm_reconciliation_disabled` | `reconciliation_disabled` |
| `crm_enqueue_meta_reconciled` only | `PT409` / `crm_reconciliation_form_inactive` | `reconciliation_form_inactive` |

Do not match substrings, status alone, message alone, an arbitrary error object's `code`, or legacy `40001`. Unknown `PT409`, wrong RPC/message/code, genuine storage/network exceptions and other RPCs retain existing sanitized fallback behavior. Retain the existing invalid-data SQLSTATE mapping. Never forward raw SQL error text, details, hints or provider data. A small pure classifier in `protocol.mjs` is allowed solely to test the exact translation used by `server.js`; do not introduce a generic retry framework.

One `reconcileMetaLeads` invocation is one pass:

1. Claim at most once. No claim returns the unchanged idle counters. Claim failures retain scheduler isolation.
2. On an exact translated enqueue lease-loss, exit immediately: no subsequent page/Graph fetch, enqueue, finish, retry or same-pass reclaim. Earlier successfully committed batches remain counted and queued; do not compensate or inflate counts for the rejected batch.
3. On inactive/disabled enqueue, stop paging and call finish once with its distinct coarse error code. If finish now reports lease loss, stop without another finish or reclaim. This remains different from storage failure.
4. Provider authentication/rate-limit/timeout/network/invalid-data/missing-secret handling remains unchanged, including one finish attempt with its existing code. Genuine enqueue storage failure uses `storage_unavailable` and one fenced finish as today. No new RPC/provider retry is introduced.
5. Exact lease-loss at finish ends the pass immediately, including after otherwise successful enqueue or a provider failure. Do not retry finish, reclaim, write replacement state or relabel that conflict as storage failure. Unrecognized finish failures remain storage failures.
6. Keep the public shape `{forms, discovered, enqueued, failed}`. Any claimed but incomplete/conflicted pass reports `forms:1, failed:1`, retaining confirmed earlier counters; normal completion remains `failed:0`. Internally keep the distinct reason without exposing it in scheduler output. No new persistence for ownership loss. The scheduler still processes independent durable intake jobs after a conflict, with its existing two-job cap; stopping discovery does not halt all intake.

## Preserved invariants

- Claim SQL, lease duration/exclusivity, random token, due ordering and `FOR UPDATE SKIP LOCKED` unchanged. No same-pass reacquisition; later scheduled invocations may legitimately claim an expired lease.
- Same token+expiry fencing and connection/state locks. A stale caller cannot change another worker's lease, due time, last error or updated time.
- Canonical four-field event, 50-event/16 KiB SQL bounds, queue uniqueness `(connection_id,event_kind,external_key)`, payload hash and narrow blocked/connection-disabled revival predicate unchanged. No duplicate submission/lead resolver.
- Activation watermark and rolling lookback, event identity/time validation, descending provider order and five-minute future tolerance unchanged; no backfill or persisted pagination cursor.
- 55-second lease; success +10 minutes, rate-limit +15 minutes, other owned errors +5 minutes. Primary/backup five-minute cadence, two pages of 25, Graph bounds and route budget unchanged.
- Worker-only service execution, `require_meta_worker`, owners/ACL/RLS/definer/search path unchanged. No new browser API or privileges.
- Realtime webhook, website and shared ingestion, immutable mappings/attribution, CRM status/task/activity, conversion/financial boundaries unchanged.
- Migrations 001–104 byte-for-byte immutable. No lifecycle SQL/runtime, H3 revision-5 decision, provider registry, credentials, activation state or gates touched.

## Migration and module manifest

Later implementation may change only:

- One forward migration, provisionally `105_crm_meta_reconciliation_business_conflicts.sql`, containing atomic `CREATE OR REPLACE` for the two exact signatures above. Preserve existing owners and grants; compare catalog attributes before/after. No DROP/recreate, overload, trigger, schema/data/ledger repair, seed, claim/configuration/lifecycle helper replacement or new security surface.
- `src/lib/crm/meta/reconcile.mjs`, `src/lib/crm/meta/server.js`, and narrowly `src/lib/crm/meta/protocol.mjs` for the tested sanitized classifier.
- Focused existing reconciliation JS/SQL tests and new local HTTP/concurrency/104-upgrade fixtures as needed. [Existing JS](../../../scripts/test-crm-meta-reconciliation.mjs), [SQL](../../../scripts/test-crm-meta-reconciliation.sql) and [historical replay](../../../scripts/test-crm-meta-reconciliation-replay.py) are starting points. The historical replay stops at 094; it cannot establish current cumulative-schema acceptance. Keep its historical contract or split version-aware suites rather than pretending it tests 105.
- `package.json` and `.github/workflows/verify.yml` only to wire new tests into existing required checks; update hardcoded current-ledger expectations in existing upgrade tests where necessary. Do not remove/reduce required CI.
- Relevant runbook/context/ADR/evidence updates with accurate implemented/merged/deployed/verified states. No frontend behavior change is planned.

Recheck main and migration allocation. If 105 is occupied, stop for manifest revision and confirm compatible cumulative definitions rather than renaming/editing deployed history. Architecture creates no SQL migration file.

## Validation and acceptance criteria

Implementation uses local Supabase `http://127.0.0.1:54321`, synthetic data, external email disabled, fake Meta secrets and injected fetch only. No Production service-role key/data or provider request. Run focused local tests and explicitly required local integration/upgrade checks; passing current-head CI satisfies overlapping full suites. Record local tested SHA/tree, versions, exact head/base, CI synthetic merge SHA and run links.

| Case | Required evidence |
| --- | --- |
| Missing/stale lease | Direct SQL and real HTTP for both RPCs return exact lease-lost conflict; entire state/queue snapshots unchanged |
| Expired lease | Token matches but expiry is at/before transaction `now()`; both RPCs reject, no scheduling/queue mutation |
| Replaced token | Claim A, expire it, claim B; A enqueue/finish reject while B token, expiry, due/error/updated time remain unchanged; B succeeds |
| Duplicate finish | First valid finish succeeds; repeated request returns conflict and cannot change the first finish's schedule |
| Enqueue ownership loss | JS first/second-page cases assert one claim, no further fetch/enqueue/finish/reclaim, preserved earlier committed counts; scheduler still runs independent jobs |
| Finish ownership loss | Normal pass and provider-error pass each perform exactly one finish, return incomplete counts, never retry/reclaim or classify loss as storage |
| Inactive form | Retire mapping after valid claim using supported local fixture/control; exact form-inactive PT409; no enqueue; worker finishes once with the distinct reason at +5m if still owner |
| Disabled reconciliation | Disable after valid claim; exact disabled PT409; no enqueue; one owned +5m finish. Combined stale+disabled/inactive returns lease-lost first |
| Genuine storage failure | Inject a database write failure in a disposable local fixture (e.g. test-only trigger raising a non-conflict SQLSTATE), verify atomic batch rollback and unchanged error identity over HTTP; worker follows storage path with at most one fenced finish. Remove fixture. JS also covers rejected RPC/network promises and unknown PT409 |
| Exact classifier | Test all allowed tuples plus wrong RPC, wrong code, altered message, generic 409, `40001`, constraint failures and provider errors through the actual wrapper classifier; no raw details leak |
| Concurrent claims | Two real sessions overlap; only one gets a form lease, locked row is skipped, eligible other form may be claimed, no token sharing; stale A races B enqueue/finish without altering B state |
| Scheduling | Assert original 55s lease, +10m success, +15m rate limit, +5m every other owned error including new configuration reasons; rejected finish changes nothing; no scheduler config diff |
| Idempotency | Repeated and overlapping webhook/reconciliation events create one job; retain existing blocked revival rules, unchanged done/processing jobs, exact added/existing counts |
| Watermark/order/success | Existing lower-bound, identity, ordering, pagination, validation and option-label tests pass; normal claim→enqueue→finish and shared resolution still succeed; disabled/no-form makes no provider fetch |
| Authorization | Catalog snapshot proves owner, proacl, SECURITY DEFINER, search path, signatures/defaults/return types unchanged; anon and authenticated roles including director cannot execute worker RPCs or access state directly; valid local service role can. Exercise JWT/PostgREST denials as well as SQL |
| Fresh and upgrade | Fresh 001→105 plus stateful 104→105 on current cumulative schema. Snapshot leased/expired/replaced states, queue rows, configuration and lifecycle dormancy before apply; migration changes no data. Verify 001–104 digests and unrelated function definitions/ACLs unchanged |
| Runtime HTTP boundedness | Required procedure below; mocked RPC or direct psql alone is insufficient |
| No lifecycle/intake regression | Existing required app/local-database CI, relevant intake/scheduler suites, local role probes and existing synthetic browser regression demonstrate normal intake usability; no new UI or live-provider exercise |

### Real PostgREST acceptance procedure

Use actual local `/rest/v1/rpc/crm_enqueue_meta_reconciled` and `/rest/v1/rpc/crm_finish_meta_reconciliation` via both raw HTTP and the real Supabase client/error translation. Record PostgreSQL, PostgREST, Supabase CLI and client versions. With no competing locks, each stale/expired/replaced/duplicate/configuration conflict must complete within **2 seconds**, with an outer client deadline of **5 seconds**, HTTP 409 and the exact code/message. A deadline abort, 5xx, unexpected identifier or unexplained slow result fails acceptance; do not simply relax the bound.

Issue a finite batch (e.g. ten requests per conflict case), disable client retries, and record one outbound HTTP request per invocation. Observe local server logs or test-only nontransactional invocation instrumentation, plus `pg_stat_activity`, to establish no repeated transaction executions after the response and no continuing backend/error growth during a 10-second quiet period. Do not rely on a transactionally rolled-back counter as proof. Confirm no target deliberate `40001` remains, and run a successful RPC afterward to prove the server still services requests. If local logging cannot demonstrate invocation count, add isolated test-only instrumentation and document it; never ship that instrumentation in the migration. These tests do not reintroduce the old `40001` storm to Production. Do not run an unbounded historical reproduction locally either.

## Rollout, recovery and H3-03 closeout

This section is a proposed future operator contract, not authorization. Follow the [rollout template](../../ai/templates/PRODUCTION_ROLLOUT.md) in a separate task after implementation CI, exact-SHA independent review and explicit owner release approval naming artifacts, target, ordering and recovery operator.

1. Bind reviewed app SHA, migration digest, head/base/merge evidence, local fresh/104-upgrade and real HTTP results. Recheck actual deployed source, project `hopcezradkhrixwwswxn`, ledger 001–104 and current function/ACL definitions. Observe intake health and dormant inventory/gates. Stop for drift, active storm or unexpected lifecycle state; do not terminate sessions under this plan.
2. **Recommend explicitly approved migration-first order**, because old worker + new SQL already removes the database retry hazard. Prove locally that old worker maps new conflicts to its existing storage failure path and performs at most one additional finish, which also returns promptly. New worker + old SQL is not a repaired state: the server may loop before any error reaches JavaScript. No legacy-error heuristic can fix that.
3. Under explicit migration-first/access-window approval, apply only the reviewed forward SQL through the repository's explicit numbered-ledger release path; verify both function definitions/ACLs and exact ledger identity. Do not use a path that silently creates a timestamp version or repair the ledger by assumption. Then merge/deploy the reviewed compatible app using the approved method; wait for exact-source Production READY. Avoid a migration-first interval without a ready reviewed app/recovery path. No scheduler/configuration change is needed or authorized by default.
4. Production verification uses approved non-mutating conflict probes with freshly generated nonexistent synthetic connection/token IDs and empty enqueue events; no provider calls or customer fixtures. Bind that probe scope in release approval. Confirm prompt exact HTTP conflicts, no affected rows and no stale-lease `40001` recurrence. Observe existing scheduled intake for at least **30 minutes**, covering multiple five-minute ticks and a normal due reconciliation pass; record aggregate RPC latency/error and scheduler/queue health without raw data. Do not manually trigger Meta calls. If no normal successful pass occurs in the window, extend passive observation; closeout stays pending.
5. Reconfirm zero lifecycle contracts/policies/evidence/epochs/boundaries/ownership/deliveries/attempts/enabled destinations, gate absent/false and inactive lifecycle cron. Record current-state evidence, dates, source/SQL digests, versions and limits. A single HTTP 200 or zero errors without exercised normal intake is insufficient.

Recovery: if migration fails transactionally, stop and leave ledger/functions unchanged; diagnose before a reviewed retry. If SQL succeeds but app deploy fails, retain repaired SQL and the proven-compatible previous app while resolving deployment under owner authority. If app regression requires rollback, retain repaired SQL; do not restore deliberate `40001` branches or edit 094/104/105. Further SQL changes require reviewed forward migration and approval. Do not manually clear/reassign leases, reset due times, delete jobs or replay data. A renewed storm is a separately authorized incident operation requiring fresh exact-session verification; this design grants no session termination or blanket scheduler shutdown. Preserve all evidence and dormant lifecycle gates.

**H3-03 closeout may resume only after this repair is Production-verified and the separate H3-03 operator rechecks its original dormant compatibility acceptance.** Link the incident, containment, repair review/release and verification without rewriting historical H3 findings. Ledger 104 must not be reapplied. Closing H3-03 does not execute or authorize H3-04–08/H4, issue credentials, seed contracts or activate delivery. The root-cause hold remains until that evidence exists.

## Owner decisions required

| Question | A / B and consequences | Recommendation / blocking state |
| --- | --- | --- |
| Accept revision 1's bounded error contract? | A: exact PT409 identifiers, distinct disabled/inactive reasons and two-value finish allowlist; B: revise the proposed contract before implementation | A. Pending owner architecture acceptance; blocks implementation, not independent architecture review |
| Release ordering when implementation is ready? | A: explicitly approved migration-first window, then compatible app; B: app-first leaves the old database retry hazard until SQL is applied and needs a revised release assessment | A after compatibility proof. Future artifact-bound release approval required; architecture acceptance alone cannot select/execute a Production window |

Approval record: no design acceptance or implementation/release authorization yet. Record owner date, exact selected options, approved plan revision/commit (or digest), scope and evidence directly here before implementation. Do not infer approval from this architecture request or H3 revision-5 approval.

## IMPLEMENTATION CONTRACT

Implement only this plan's two-function forward SQL and narrow typed conflict handling after owner acceptance of revision 1 and separate implementation commissioning. Read the accepted repository plan and cumulative SQL directly. Keep every invariant and all non-goals above; stop if current main changes relevant definitions, migration 105 is occupied, caller semantics require broader changes, or ACL/locking/intake/lifecycle behavior cannot be preserved.

Required outputs: named implementation branch/PR; plan revision/approval evidence; exact migration filename/digest; focused worker/classifier/SQL/concurrency/real-HTTP/fresh/104-upgrade evidence; current-head required CI with head/base/tested merge and local tested tree; one author self-check; docs distinguishing implementation, merge, deployment and verification. Acceptance requires every test row above, no leaked secrets/customer data and no unresolved failure. Do not reduce CI or treat passing mocks as HTTP retry proof. Stop for repeated calls, continuing backend activity, ambiguous classification, another owner's state mutation or normal-intake regression.

The architecture author performs documentation link/source/secret checks and `git diff --check`, one focused author self-check, pushes an architecture PR, waits for required exact-head CI and stops at **READY FOR INDEPENDENT REVIEW**. The owner launches the separate reviewer; the author must not perform or orchestrate independent review. The same boundary applies to later implementation. All merge/release holds remain. No code/migration/Production action is performed by this architecture PR. After separately authorized repair verification, close out evidence and resume only the bounded H3-03 documentation/acceptance flow described above.
