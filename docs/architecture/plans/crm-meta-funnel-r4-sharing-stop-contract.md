# Owner summary

## What will change

Owner-approved clarification of PR #46 independent-review findings at head `509d213cfd3613b3edd54482c0916a7bf2ef980f`, dated 2026-10-01 (Asia/Shanghai). This is the exact future locking, scope and retention contract for [advisory R4 D2](crm-meta-funnel-r4-d2-advisory.md). It replaces the former unspecified common-lock/submission-only stop description. No application or migration is implemented. Final owner architecture acceptance was given for PR #46 at `c404815c5539f1651f7f87274f6ff345a45237ff` on 2026-10-01 (Asia/Shanghai); see the [approval record](crm-meta-funnel-r4-d2-advisory.md#final-owner-architecture-approval-2026-10-01). Architecture approval does not authorize implementation, deployment or H3/H4.

## What staff/users will be able to do

Later authorized implementation can record opportunity-specific refusals and explicitly broad contact requests without a D2 grant, including objections from later submissions. Stop/attempt races have a defined durable commit boundary. No operational capability changes now.

## What remains restricted

Keep future-policy-only advisory custom proof; existing deployed required-D2 policy semantics and histories unchanged; no historical backfill/reclassification. Preserve original Meta lead ID, five-event occurrence/order model, prospective-only cohort, website/later-Meta exclusion, no child/contact-hash/financial payload, exclusive producer ownership and no-uncertain-replay. H3 remains technical preparation; source/form/mapping/cohort boundary and then-current platform/privacy review belong to H4. Yearly-program stays the excluded existing/ending legacy cohort. Replacement forms and custom checkboxes are EH recommendations, not verified H3 requirements. No 103, code, Meta, Production, credential, activation or merge changes.

## UI impact

Future director stop action must select explicit scope and verified internal subject. An inquiry refusal never silently becomes contact-wide. Broad requests with unresolved identity require review rather than guessed contact matching. No UI is changed here.

## Database impact

Future forward schema/RPC work only: scope-aware minimal stop markers, bounded audit metadata, canonical identity handoff and one locking protocol. No new adult-contact entity is needed: `crm_contacts.id` exists. Existing contact/lead merge or reassignment facilities must participate in the identity barrier before advisory sending is commissioned. Numbers remain provisional; 103 stays unauthored.

## Important security decisions

Internal UUIDs implement suppression only; no contact values or hashes enter provider matching. Stop tombstones never act as grants, never authorize replay and cannot be removed/reassigned by a privacy-stop reset. Optional evidence erasure cannot erase stop scope. Actual platform/legal/privacy requirements remain mandatory and distinct from EH safeguards.

## Risks / owner review points

Tier 3 architecture. A shared/exclusive identity barrier below is deliberately conservative: normal opportunity operations still run concurrently, but contact-wide stops and identity handoffs serialize briefly against them. All transactions are database-only and bounded; no advisory lock survives an RPC or spans HTTP. This costs short database contention during identity changes; it avoids speculative per-contact alias locks and inverse lock upgrades. Local deadlock/race tests and fresh exact-head independent review are required before implementation/release approval.

## Inspected baseline and why the old wording was unsafe

Cumulative 078 defines contact UUIDs, `contact_kind` (including `unknown`), `merged_into_contact_id`, `crm_leads.contact_id`, canonical `first_submission_id` and a first-touch immutability trigger. Those links do not prove adulthood or that every real person is deduplicated into one contact. 093's latest external resolver takes the global `crm:meta:intake` advisory lock, then submission/contact/lead rows; it can attach later submissions to an existing lead. Contact/lead merge pointer columns exist; this inspection does not establish a complete safe alias/merge service.

102 claim takes `crm:lifecycle:lead:<lead UUID>` with try-lock before delivery; then its hold helper takes ownership, boundary and evidence SHARE locks. 102 begin takes the lead lock, delivery UPDATE, ownership UPDATE, evidence UPDATE, then hold. 102 prepare/retry start with delivery UPDATE. 098 revoke starts with grant UPDATE; evidence-check recording takes submission/attribution/policy SHARE locks. 102 reconcile holds `crm:lifecycle:reconcile` before admission, whose first lock is lead UPDATE. Cleanup locks deliveries/attempts/evidence in separate passes. These are deployed definitions, not the proposed safe order. Adding a locking hold helper would preserve inversions.

## Exact advisory identities and transaction contract

Use only PostgreSQL **transaction-level** advisory locks. Canonical UUID text means PostgreSQL `uuid::text` (lowercase, hyphenated). Derivation is performed by the database, never a client-supplied lock ID. Two-int namespaces are disjoint from the existing one-bigint advisory namespace.

| Symbol | Exact PostgreSQL lock identity / operation | Purpose |
| --- | --- | --- |
| G | `(460046, 0)`; `pg_advisory_xact_lock_shared(460046,0)` for ordinary resolved lifecycle operations; `pg_advisory_xact_lock(460046,0)` for broad-stop/identity/control/maintenance transactions | Privacy identity barrier; not the per-opportunity identity |
| R | `pg_advisory_xact_lock(460049,0)` for the future native reconcile wrapper | Replaces its old one-bigint reconcile key, eliminating cross-class hash collision with L; always after G and before L/O |
| I | Existing `pg_advisory_xact_lock(hashtextextended('crm:meta:intake',0))` | Resolver only, always after exclusive G and before S/rows |
| L | Existing `pg_advisory_xact_lock(hashtextextended('crm:lifecycle:lead:' || lead_id::text,0))`; claim retains `pg_try_advisory_xact_lock` | Lead-wide chronology serialization, including across connections |
| O | `pg_advisory_xact_lock(460047, hashtext('crm:lifecycle:r4:opportunity:' || connection_id::text || ':' || lead_id::text))`; claim uses two-int `pg_try_advisory_xact_lock` | Canonical native opportunity/connection race key; never policy, grant, delivery or attempt ID |
| S | `pg_advisory_xact_lock(460048, hashtext('crm:lifecycle:r4:submission:' || connection_id::text || ':' || submission_id::text))` | Pre-identity serialization, using immutable connection/submission provenance |

Hash collisions only serialize unrelated scopes. Every mutation validates the actual UUID tuple; equality of advisory hashes never establishes identity/eligibility. Namespace constants are reserved by this architecture and the implementer must scan for collisions/reuse in then-current source. The actual hash result determines ordering when multiple locks of the same class are needed.

Every RPC starts its database transaction **before G**, uses READ COMMITTED, takes all required advisory locks **before any participating row lock**, then re-reads scope/state in new statements after lock acquisition. Reject stronger/stale-snapshot caller isolation or fail closed and restart the whole transaction; never use a pre-lock stop snapshot. Locks release only at commit/rollback. No session-level locks, lock upgrades, HTTP inside transactions or locks acquired in triggers after row locking. Private helpers require the top-level transaction contract; nested calls cannot acquire a higher-ranked lock. The server may POST only after a successful committed begin RPC; a rollback/failed RPC must never send.

PostgreSQL's [advisory-lock functions](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS) document transaction lifetime, shared/try variants and separate bigint/two-int key spaces. Its [READ COMMITTED rules](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED) support the required post-lock statement refresh. Those semantics were checked on 2026-10-01; the implementer must verify the target engine version. This source check supports primitives, not a claim that the future application has been deadlock-tested.

## One permitted lock hierarchy

Two exclusive branches share the same root and never nest into one another:

- **Resolved opportunity branch:** G shared (or already exclusive for maintenance) → optional R → all L keys → all O keys → participating row locks.
- **Pre-identity/handoff branch:** G exclusive → optional I → all S keys → resolver/pending-stop rows. This branch takes no L/O and performs no native owner/delivery/attempt mutation; it commits canonical binding/stop handoff first. Admission runs in a separate transaction through the resolved branch.
- **Contact-wide stop branch:** G exclusive → stop rows only. No L/O/S, no iteration taking delivery/ownership locks. G prevents concurrent resolved sends and identity reassociation, so one marker suppresses all linked opportunities without touching their deliveries.

All advisory sets are materialized from nonlocking discovery after G. Acquire each class sorted by its signed PostgreSQL advisory key, deduplicating equal hashes; then proceed to the next class. No new subject/advisory key may be discovered and waited for after row locking. Roll back/restart with a complete set if necessary. Claim keeps chronological candidate processing and its existing per-lead try-serialization: preselect bounded candidates, try sorted L/O keys before any rows, skip unavailable scopes, then process admitted candidates in original event-time order with `FOR UPDATE SKIP LOCKED`. Do not block on another subject lock after retaining row locks from a previous candidate. Reconcile likewise prelocks its bounded scope set before admission/delivery rows.

**Resolved-branch row ranks:** (1) connection, contract, epoch, mapping, policy, canonical contact, canonical lead, source submission, attribution, boundary, ownership in that order; (2) eligibility-check rows, eligibility-evidence rows (grants/revocations), stop markers, stop audit rows in that order; (3) delivery rows; (4) attempt rows. Within each relation order by primary UUID (attempt number/id for attempts). Take only rows needed by the path; skipped ranks stay skipped. For a batch, acquire the complete rank-1 set, then complete rank-2 set, then all selected deliveries and finally attempts; never return to an earlier rank for candidate two after mutating candidate one. Canonical scope is discovered by nonlocking reads under G, then needed source/FK references take KEY SHARE at rank 1 before ownership insertion; admission takes no lead UPDATE. These source-reference locks must be counted even when the database would acquire them implicitly for a foreign key. Identity mutation/redaction or control retirement instead uses exclusive G before any rows. Admission no longer takes lead UPDATE before advisory locks; it can validate canonical source under G and lock boundary/ownership in rank 1. Stop creation does not eagerly update deliveries. Unrelated commercial commands that never enter the protocol must never call a locking lifecycle helper; no CRM activity trigger performs provider entry. Pure eligibility queries do not lock activities/tasks. A path changing identity must enter exclusive G at its outermost boundary, including the private `resolve_submission` command before its existing lead UPDATE.

`lifecycle_hold`, `lifecycle_route`, `lifecycle_retry_hold` and `lifecycle_predecessor_hold` become **pure nonlocking evaluation** for the advisory live path: no row/advisory locks, mutation or internal acquisition. Top-level entry points lock required rows in rank order before invoking them. Read-only diagnostics may use pure helpers for advisory display, but never authorize provider entry. A hold evaluated during get/prepare/claim is not permission to send; committed begin is the final authority.

## Exact path participation

All rows below describe future advisory live handling. Existing required-D2 evidence meaning is unchanged; if a shared function handles that route too, its wrapper must obey the hierarchy and retain its original eligibility result. No route is allowed to call a row-first legacy body and then acquire G/L/O.

| Function/path | Exact future sequence | Required change from inspected source |
| --- | --- | --- |
| `claim_lifecycle_deliveries` / public claim wrappers | BEGIN → G shared → nonlocking bounded discovery → all try-L → all try-O → rank 1 refs → rank 2 evidence/stops → rank 3 delivery SKIP LOCKED → rank 4 expired-attempt finalization → COMMIT | Preserve per-lead chronology and skip behavior; move hold locks ahead of delivery and pre-acquire full advisory set |
| `crm_get_external_delivery` | BEGIN → G shared → nonlocking delivery scope → L → O → rank 1 → rank 2 → rank 3 delivery/lease validation → pure hold → COMMIT | No evidence/ownership locks hidden in hold; still no send permission |
| `crm_begin_external_attempt` | BEGIN → G shared → nonlocking delivery scope → L → O → rank 1 ownership/boundary/control refs → rank 2 grant/evidence + stop state → rank 3 delivery → rank 4 attempt insert → durable boundary update → COMMIT | Ownership/evidence before delivery; revalidate lease, privacy, chronology and original identity after locks |
| `crm_revoke_lifecycle_evidence` | BEGIN → G shared → nonlocking grant → bound submission/lead/connection lookup → L → O → rank 1 → rank 2 grant UPDATE then opportunity stop insert → COMMIT | Never grant UPDATE → advisory. Re-read grant and scope after locks; detached/redacted scope cannot be guessed; use independently verified stop subject if necessary |
| `lifecycle_producer_eligible` / `crm_reconcile_external_deliveries` | BEGIN → G shared → R for reconcile → nonlocking resolved first-source discovery → all L → all O → rank 1 boundary/owner creation → rank 2 stop/evidence validation → rank 3 delivery creation → COMMIT | No lead UPDATE before advisory; no ownership if stop. Direct private admission requires same prelocked scope and never nests identity resolution |
| `crm_prepare_external_delivery` | BEGIN → G shared → nonlocking scope → L → O → rank 1 → rank 2 → rank 3 delivery UPDATE → payload/source and pure hold checks → COMMIT | Move acquisition before delivery UPDATE, not into hold |
| `crm_retry_external_delivery` / evidence repair | BEGIN → G shared → nonlocking scope → L → O → rank 1 → rank 2 → rank 3 delivery UPDATE → pure retry/hold → COMMIT | Stop always denies retry/repair/regrant release; retain immutable unknown and identity fencing |
| Explicit opportunity stop / resolved later-submission objection | BEGIN → G shared → nonlocking authorized submission-to-lead lookup → L → O → rank 1 if needed → rank 2 stop insert → COMMIT | No delivery/attempt row update; canonical lead is the stop subject, later submission only bounded audit provenance |
| Explicit contact-wide stop | BEGIN → G exclusive → nonlocking authorized contact/alias resolution → rank 2 contact stop insert → COMMIT | No grant prerequisite or L/O/S fan-out; revalidate request breadth and identity |
| Unresolved submission stop | BEGIN → G exclusive → S → lock submission/pending stop → validate still unresolved or bind verified resolved scope → COMMIT | No L/O upgrade within transaction; no unverified contact-wide matching |
| External resolver/manual resolution/identity merge or reassignment | BEGIN → G exclusive → I where used → sorted S where involved → existing identity rows → atomically materialize applicable pending stops/carry identity tombstones → COMMIT | Exclusive G must move to outermost command before existing submission/contact/lead locks; no admission call while those locks remain |
| Evidence claim/record/regrant | BEGIN → G shared → nonlocking resolved scope → all L → all O → rank 1 → rank 2 → COMMIT | No submission/policy/evidence row-first acquisition; optional grant never removes a stop |
| Attempt finish | BEGIN → G shared → nonlocking scope → L → O → rank 3 delivery → rank 4 attempt → COMMIT | Persist actual provider result even if a subsequent stop exists; never fabricate suppression as receipt or reopen unknown |
| Cleanup, source/identity redaction, boundary/epoch/configuration mutation | BEGIN → G exclusive → nonlocking bounded discovery → optional R → full sorted L/O set if native delivery state changes → ranked rows → COMMIT | No hidden row-first callback acquiring G; identity-only maintenance uses exclusive branch and never native admission. Pure audit erasure may use only rank 2 |

Admission acts only on a committed canonical lead UUID. If no lead exists, S serializes the pending objection with resolver under exclusive G. Resolver commits first-submission binding and an opportunity stop (or verified contact-wide stop) before releasing G; pending marker remains immutable linked history until its retention rule applies. A stop arriving just after resolution takes exclusive G, re-reads committed binding and writes the final marker without entering L/O; exclusive G already excludes all resolved operations. No transaction holds S then waits for shared-to-exclusive G or L/O, and no resolved path enters S. Pre-identity source rows must be durably inserted before a pending-stop FK can reference them. A failed/ambiguous handoff leaves the source unresolved and ineligible, not temporarily sendable.

A CRM identity creation/merge/reassignment/redaction path that cannot acquire exclusive G at its outermost boundary must not participate in advisory activation until forward integration is reviewed. Do not retrofit G inside a trigger or already-row-locked accept helper. Existing intake resolver changes are limited to this serialization/atomic stop handoff; no matching or acquisition-policy expansion.

## Race outcomes and suppression boundary

**Stop-first:** the stop transaction commits its marker before begin can acquire G/L/O and commit the send boundary. Under READ COMMITTED, begin's post-lock statements see the committed opportunity/contact/pending-handoff marker; begin fails closed without an attempt row/boundary and the worker must not POST. A claimed/prepared lease or optional grant cannot bypass it.

**Begin-first:** begin commits attempt row and `attempt_boundary_state=started` before the stop commits. That event may already cross the network (or the worker may send after the stop); stop cannot recall it. Finish records actual receipt/error; absent reliable result it remains unknown and unreplayable. The marker suppresses all subsequent begin/repair/retry entries and all later lifecycle occurrences within its scope; it does not erase or falsely terminalize an already-started identity. Contact-wide exclusive G waits for begin's shared G to commit, giving the same ordering across every current opportunity. No database lock is held across provider HTTP. Commercial status history continues; sharing alone stops.

## Exact stop scopes and internal identity

| Scope | Required subject/connection | Suppression |
| --- | --- | --- |
| `opportunity` | Canonical `crm_leads.id` + exact outbound `connection_id` | Only that lead/connection, all its current/later five-kind occurrences. Appropriate for inquiry/form/campaign-specific refusal or source restriction; not all leads under the contact |
| `contact` | Verified `crm_contacts.id` (canonical merge root plus known aliases); `connection_id=NULL` for an explicitly broad EH-to-Meta request | All current and future opportunities linked to that internal contact across native Meta destinations. If the request explicitly limits a destination, store that exact connection instead; never silently narrow a broad request |
| `submission_pending` | Immutable source `crm_submissions.id` + connection; no lead/contact guessed | Prevent resolution-to-native admission until objection handoff is committed. Temporary internal scope, not provider matching; broad intent stays recorded for verified contact binding or explicit review |

The contact is the CRM contact envelope, not learner/student identity. `guardian`/`adult_learner` labels or a phone match alone do not prove an adult privacy request's authority. A director/trusted reviewed process binds the requester to the internal contact and explicitly chooses breadth. A separately stored duplicate contact UUID for the same person is not automatically covered by fuzzy matching: use already established CRM identity resolution/verified alias association, or hold uncertain candidate identity for review before native admission. No new hash/phone/email-based suppression registry. Retain stop-bearing contact IDs/merge aliases; merge/reassignment under exclusive G must propagate contact tombstones to the verified resulting root before commit, and an opportunity stop must not disappear on a lead merge (propagate to canonical successor). No actor may reassign/deduplicate identity to shed a marker. An unsupported alias chain, cycle or unverified reassociation fails closed for affected native admission. Tombstone carry is monotonic; no broadening based solely on a local opportunity refusal.

For a later submission with `lead_id` already resolved, authorize that link, resolve the canonical opportunity, then write the opportunity/contact stop under the protocol. Its `source_submission_id` is audit provenance only. Do not update `first_submission_id`, original acquisition attribution or original Meta lead ID. Website/later-Meta sources remain ineligible for native activation even if their objection is honored against an already eligible first-touch opportunity. Unresolved later-submission objections use pending scope until trusted CRM resolution; no attribution-based provider identity substitution.

## Approved future stop marker and audit schema

`crm_lifecycle_sharing_stops` is append-only for semantic fields: `id`, closed `scope` enum, exactly one of `lead_id/contact_id/pending_submission_id`, nullable `connection_id` with the rules above, database `effective_at`, closed coarse `reason_class` (`inquiry_refusal`, `privacy_request`, `source_restriction`), and `tombstone_version=1`. Unique active semantic subject/connection prevents duplicate resets; NULL connection has explicit all-destinations uniqueness. No grant FK, raw answers, provider IDs, hashes, token, contact values or verbose notes. Internal subject FKs use RESTRICT and cannot be erased/replaced to evade a stop. Absence of a row is protected by advisory serialization, not an ineffective lock on a nonexistent stop.

Separate redaction-capable bounded audit fields/relation contain stop ID, idempotency request UUID, actor UUID/source class, source submission UUID, verified-scope decision reference (non-PII bounded reference), recorded time, guarded closure basis/`closed_at`/handoff time where applicable, and `redacted_at`. Only the reviewed closure-certification/cleanup path may set closure metadata after evaluating the full predicate; client timestamps cannot start the erasure clock. Pending handoff is an append-only link to the final stop, never overwriting acquisition or the pending scope. Idempotent retries cannot alter existing scope or remove markers. After audit redaction an exact repeated semantic stop simply returns the existing tombstone; discarded request UUIDs are not needed to preserve suppression. Only a guarded D6 erasure path may remove audit fields. No reset/regrant/resume endpoint is in scope.

## Permanent impossibility and retention lifecycle

Permanent impossibility is **not** current status, current event deadlines, lack of a grant, temporary destination disablement or exhausted attempts: future genuine Qualified/closure re-entry can create a new occurrence while an epoch is open.

For an `opportunity` scope, define `closed_at` only when all of the following hold under the protocol:

1. Immutable native ownership exists for this exact lead/connection and binds one epoch; that epoch has a recorded `ended_at`, with no owner reassignment/new-epoch admission path for this opportunity. Alternatively, an immutable canonical first-source/cutoff/legacy exclusion proves it permanently inadmissible under this architecture, with a recorded exclusion certification time; temporary mapping retirement or mutable config is insufficient.
2. No sending delivery with a live lease or unfinished attempt remains. Expired started leases are conservatively finalized as unknown with the irreversible no-replay marker; reliable finished results retain their actual meaning. Never erase uncertainty to satisfy this predicate.
3. Every stored occurrence has a terminal/expired disposition, or an irreversible unknown/confirmed attempt boundary with no authorized new attempt. Any unsent potential future occurrence is ineligible because its only epoch is closed or its frozen source is permanently excluded. Merely terminalizing today's outbox does not satisfy this clause.
4. `closed_at` is the greatest of epoch end/exclusion certification, all terminal/finalization timestamps and elapsed lease ends for that scope. If any prerequisite is missing, no closure timestamp exists. The stop itself is not used as proof of permanent impossibility.

For `submission_pending`, closure requires a committed final-scope handoff or a recorded immutable permanent-inadmissibility certification and no possible unresolved handoff/admission. A handoff lets its *audit detail* age out but its minimal pending marker/opaque handoff reference remains; the final opportunity/contact tombstone continues to govern.

For `contact`, no permanent-impossibility timestamp exists while that identity/verified alias can ever receive another prospective native opportunity. Closing all current epochs/deliveries or deleting contact values is insufficient. This proposal has no permanent contact-identity retirement mechanism, so contact tombstones survive indefinitely; never pretend the current cohort window closes future contact scope.

**Redaction schedule (owner-approved EH D6 architecture, not a claimed Meta/legal mandate):** opportunity audit detail redacts at `closed_at + 90 days`; pending audit detail at verified handoff/permanent-closure time + 90 days. Before that, keep only the bounded structural audit fields above; never store raw request bodies/verbose notes. Contact-wide verified-request audit detail redacts at `effective_at + 90 days` even though future-scope impossibility is not provable; the confirmed scope/contact marker is sufficient to enforce future suppression. This explicit contact exception prevents indefinite actor/source/request retention. Pending unverified broad requests do not become verified contact stops; resolve or separately review their retention, without enabling affected source sharing in the meantime. Any actual applicable retention/erasure obligation is assessed before implementation; no optional proof cleanup controls these timers.

After redaction retain only `scope`, immutable internal subject UUID, connection (or NULL all-destinations), `effective_at`, coarse `reason_class`, marker ID/version and required opaque handoff/alias suppression links. These are internal suppression identifiers, not provider matching values. All stop tombstones remain semantically immutable for the identity lifetime even after permanent impossibility; this prevents regrant/reactivation after cleanup. No raw answers, provider IDs, tokens, contact values, actor, source-submission audit detail, request UUID or verbose notes survive their detail deadline. Existing D6 payload/attempt/proof erasure remains separate and must not cascade into these markers or uncertainty history.

## Future acceptance and race matrix

These are future local synthetic two-session/multi-session tests, not tests claimed to have run during documentation work.

| Case | Forced interleaving / exact assertion |
| --- | --- |
| Stop-first / begin | Commit opportunity stop before begin lock acquisition; no attempt/boundary, no HTTP invocation |
| Begin-first / stop | Commit started boundary, then stop; finish may record actual outcome, unknown stays unreplayable, every later begin in scope denied |
| Revoke / begin | Pause revoke after nonlocking scope lookup; both lock through G/L/O before grant. Test each winner; no grant→advisory inversion |
| Admission / stop | Stop before owner creation prevents admission; admission first may create owner but stop before begin prevents send; immutable owner never transferred |
| Pre-identity handoff / stop / admission | Unresolved objection and resolver contend on exclusive G/S; no lead can become natively sendable before final marker commit; retry re-reads newly resolved scope without S→L/O upgrade |
| Prepare / stop | Prepared payload/lease before stop provides no send authority; later begin rejects. Stop-first prepare rejects pure hold |
| Retry or repair / stop | Stop denies retry/repair/regrant; unknown identity cannot become pending; no advisory acquired after delivery UPDATE |
| Claim chronology | Parallel workers retain lead-wide try-lock and event-time processing; contention skips, no blocking acquire after candidate rows; no active predecessor bypass |
| Contact-wide / multi-opportunity begin | Exclusive G serializes a broad marker against concurrent begins for different leads/connections; verify both winner orders |
| Contact identity change / stop | Resolver/verified merge/reassignment take exclusive G before existing rows; alias/canonical marker carried before future begins; no UUID substitution bypass |
| Deadlock / hierarchy | Barrier-controlled concurrent claim/begin/revoke/admission/prepare/retry/stop/evidence/cleanup/identity batches, including two leads and reversed discovery order. Local `deadlock_timeout=100ms`, `lock_timeout=5s`, `statement_timeout=10s`; no SQLSTATE 40P01 or 55P03 in normal completing runs. Separate intentional-contention test expects claim skip. Static lock-order assertions cover every entry point and forbid locking pure holds |
| Opportunity scope isolation | One inquiry refusal blocks all five occurrences only for that lead/exact connection; unrelated lead under same contact and unrelated connection unaffected |
| Contact scope continuity | Verified broad request blocks multiple current leads and a later new prospective lead linked to that contact/known alias, including a different native Meta connection; explicitly destination-limited request affects only that destination |
| Later-submission objection | Later resolved submission writes canonical opportunity/contact marker; compare unchanged first-submission ID, original attribution and original Meta lead ID before/after |
| Proof cleanup / regrant | Optional grant/check cleanup/redaction and new proof cannot release stopped subject; source redaction still independently holds |
| Terminal cleanup / closure predicate | Open epoch with all current rows terminal has no closure timestamp; closed immutable owner/epoch with expired starts finalized unknown meets exact predicate without erasing no-replay |
| Audit detail schedule | Opportunity/pending detail survives before deadline and redacts at +90 days; verified contact detail redacts +90 days without a false future-impossibility claim |
| Minimal marker survival | Terminal/proof/audit cleanup preserves subject/connection/scope/version timestamp and alias/handoff markers; later occurrence/new contact opportunity still suppressed according to scope |

## IMPLEMENTATION CONTRACT

This clarification is documentation only. Later implementation must use this exact key/hierarchy, scope enum/schema, identity-barrier integration, pure hold contract and retention predicates in addition to the parent amendment. Scope integration includes outermost intake/identity paths, evidence, attempt finish, control mutation and cleanup; never implement the seven named functions in isolation while an inverse-lock caller remains. An unsupported identity mutation path or an after-row advisory acquisition blocks implementation handoff/activation. Existing required-D2 behavior, mock isolation and all preserved R4/H3/H4 invariants remain acceptance requirements.

No migration 103 is authored here. Owner architecture approval is complete. Run repository-required implementation checks only within a separately commissioned implementation task, then fresh Tier 3 independent review of exact SHA and separate release/operator approval. Migration 103 is NOT implemented, deployment is NOT authorized and H3/H4 are NOT approved; final architecture approval is recorded. Current task validation is stale-state/lock-contract consistency, relative links and anchors, secret/PII scan and whitespace only; it does not prove database deadlock freedom or constitute independent-review approval.
