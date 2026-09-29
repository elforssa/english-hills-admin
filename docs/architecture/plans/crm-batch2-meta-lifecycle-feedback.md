# Owner summary

## What will change

CRM Batch 2 will connect the existing lifecycle outbox to live Meta delivery for approved Qualified and Converted outcomes. It will add explicit sharing eligibility, automatic processing and bounded director diagnostics. This is a proposed design, not implementation or permission to activate delivery.

## What staff/users will be able to do

Receptionists will continue recording ordinary CRM actions. Eligible milestones will reach Meta automatically after the CRM transaction commits. Directors will see whether feedback is enabled, delivery outcomes, held events and recent failures, with narrowly controlled retry actions. Meta feedback will consume school records; it will never decide CRM status or enrollment.

## What remains restricted

Conversion still requires the existing linked Confirmed/Validated enrollment workflow. Receptionists cannot send events, configure integrations or override eligibility. Child details, placement results, internal notes/history, tasks, teacher information, documents and payment history stay out of payloads. The recommendation excludes revenue/value, website-originated opportunities and historical backfill from this batch, subject to owner decisions below.

## UI impact

Add a small director-only lifecycle operations page and navigation entry. Existing configuration and delivery RPCs have no lifecycle UI consumers today. No Today, CRM detail, walk-in or marketing analytics redesign is included. Eligibility policy setup belongs to director integration operations, not a new receptionist chore.

## Database impact

Reuse migration 088's delivery and attempt tables, deterministic identity and protected worker RPCs. Add forward migrations after 097 for auditable eligibility evidence/policies, live configuration and activation boundaries, safe delivery checks, retention/redaction and an independent lifecycle scheduler. All deployed migrations 001–097 remain unchanged.

## Important security decisions

Missing evidence means no delivery. Meta-origin alone and generic website inquiry consent do not prove sharing eligibility. Use the minimum verified provider identifiers; hashing does not make data anonymous. Tokens remain server-only. Database checks enforce the same payload allowlist as the worker. Live mode requires an approved destination/contract, database activation and a server kill switch, independent of inbound intake.

## Risks / owner review points

Approve the acquisition scope, evidence policy, historical cutoff, matching fields, retention and retry policy before implementation. Current Meta documentation returned HTTP 429 during this assessment, so exact live event names, required CRM metadata, API version, event-age and deduplication limits remain a provider-contract gate. Do not simply replace mock fetch with real fetch. Provider acceptance does not guarantee ad optimization or improved lead quality. Production rollout needs separate human approval.

---

## Status and evidence

**PROPOSED — OWNER DECISIONS REQUIRED; IMPLEMENTATION BLOCKED.** Architecture reviewed 2026-09-29 against fetched `origin/main` commit `3c9b9132f29a5fafea44bbb7c93435e15b74bf6e` (PR #32). This task changes documentation only. Production facts are supplied by the owner, not queried here: PRs #31/#32 and 096/097 deployed, shared Students UI and restrictions verified, reconciliation/scheduler healthy, no runtime errors. [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns that inventory.

Owner approval record: **pending**. Before implementation, record approving owner/date, plan revision and chosen D1–D7 options here; update the conditional contract and proposed [ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md). Alternatives are not implicit approvals.

Read [product](../../ai/PRODUCT_RULES.md), [security](../../ai/SECURITY_RULES.md), [ADR-001](../decisions/ADR-001-crm-lifecycle.md), [ADR-002](../decisions/ADR-002-meta-intake-and-reconciliation.md), and [Phase 10 implementation contract](../../crm-meta-lifecycle.md). The latter remains an accurate mock-only baseline, not a live specification.

## Verified current state

| Concern | Evidence on current main | Remaining work |
| --- | --- | --- |
| CRM lifecycle | [078](../../../supabase/migrations/078_crm_core_schema.sql), [080](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql), [082](../../../supabase/migrations/082_crm_conversation_decision.sql): guarded actions emit `lead_qualified`; 079/081 own read permissions/Today. | Consume committed facts; preserve status/task/activity separation and call policy. |
| Placement, conversion, finance | [083](../../../supabase/migrations/083_crm_placement_integration.sql) owns placement milestones. [084](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql) `evaluate_conversion` emits `lead_converted`, retaining enrollment/activity identity; downgrade sets review. [085](../../../supabase/migrations/085_crm_revenue_attribution.sql) owns separate collected-revenue ledger. | No second conversion engine, no payment-triggered marketing event or invented missing Qualified event. |
| Event generation | [088](../../../supabase/migrations/088_crm_meta_lifecycle_delivery.sql) `crm_reconcile_external_deliveries` reads first committed milestone of each kind, validates conversion identity and creates intentions asynchronously; no CRM/network trigger. | Automatically schedule this existing reconciliation. No synchronous external call in CRM commands. |
| Outbox | 088 `crm_external_deliveries`, `crm_external_delivery_attempts`; `unique(lead_id,event_kind)`, frozen mapping/payload/hash and protected history. | Extend current objects, not another queue. |
| Identity/concurrency | Event ID `eh:<activity UUID>:<connection UUID or none>`; advisory reconcile lock, `FOR UPDATE SKIP LOCKED`, UUID lease, two-minute expiry, durable begin/finish, stale-lease rejection. | Preserve identity and recovery; close activation/age/retry gaps below. |
| Retry/error state | pending/sending/retry/unknown/sent/blocked/dead/suppressed; 1–8 attempts (default 5), exponential delay plus jitter; bounded Retry-After; immutable finished attempts. | Real response classification, provider deadline and operational scheduling. |
| Matching/payload | [adapter](../../../src/lib/crm/lifecycle/adapter.mjs): normalized SHA-256 email/phone; lead ID or fbc/fbp required. SQL independently checks hashes/provenance and closed keys. | Approve minimum live matching contract; do not automatically send every available hash. |
| Transport | `postLifecycleFixture` and [worker](../../../src/lib/crm/lifecycle/worker.mjs) require injected mockFetch. Configuration and SQL holds require mode=mock. [director endpoint](../../../src/app/api/internal/crm/lifecycle/process/route.js) reconciles only and returns `live_delivery_enabled:false`. | Reviewed server-only live transport plus mode-aware worker/SQL. Environment variables alone cannot activate current code. |
| Eligibility | 088 requires `consent_evidence.meta_lifecycle_sharing=true` and `adult_contact=true`, rechecks redaction and conversion review before attempts. | Evidence capture is missing: [Meta normalizeLead](../../../src/lib/crm/meta/adapter.mjs) does not populate consent_evidence; [087](../../../supabase/migrations/087_crm_website_ingestion.sql) records website accepted/recorded_at/source only. Tests seed the stronger flags synthetically. |
| Routing | Meta first submission selects its mapping/connection/Page. Website first touch can select an explicit destination and optionally later accepted Meta matching. Manual first touch stays suppressed. | Restrict live scope explicitly; existing mock capability is not product approval for website/later-touch live sharing. |
| Intake/scheduler | 086/087/092/093 implement shared intake/mapping; [094](../../../supabase/migrations/094_crm_meta_reconciliation.sql) reconciles inbound IDs; [095](../../../supabase/migrations/095_crm_intake_pg_cron_scheduler.sql) + [intake scheduler](../../../src/lib/crm/intake/scheduler.mjs) trigger inbound only. | Independent lifecycle endpoint/job; protect existing 60-second inbound budget. |
| Director visibility | Configure/list/retry/reconcile RPCs exist; list omits matching payloads/secrets, hardcodes live_available=false. Source search finds no lifecycle consumers in CRM components or queries. Settings has no lifecycle panel. | Small director UI/read model; retain direct RPC authorization. |
| Insights/reporting | [089](../../../supabase/migrations/089_crm_meta_insights_and_reporting.sql), [090](../../../supabase/migrations/090_crm_director_reporting.sql), [Insights adapter](../../../src/lib/crm/insights/adapter.mjs) and analytics UI exist; transport fixture-only. 091 is task-history performance hardening. | No live spend/ROAS/CAC work. |
| Receptionist | 096/097 and shared operational Students UI are complete. | No permission widening or manual event controls. |

### Existing outbox gaps that live enablement must fix

- `not_before` is checked at initial reconciliation but not by `lifecycle_hold` or explicit retry. An old blocked row can adopt repaired settings before preparation. Live checks must enforce the approved cutoff at claim/get/prepare/begin/retry, not rely on initial reconciliation.
- Existing prepared mock rows freeze mode/configuration, and sent rows are immutable. Never relabel mock attempts as live or resend mock-sent historical identities. Keep them diagnostic-only; activation is prospective.
- Eligibility booleans are not collected by current inbound adapters. Do not set them universally, infer adulthood from a parent/phone field, or reinterpret generic inquiry acceptance. Existing attribution becomes immutable after populated values (078); do not overwrite it to manufacture approval.
- There is no provider-age deadline, retention duration, frozen-payload redaction path or lifecycle scheduler. Protected hashes are still personal-data-derived material.
- Reconciliation scans earliest missing milestones by lead/kind, bounded to 200. It is durable recovery but needs lag monitoring and query-plan tests; do not introduce an unsafe high-water cursor that skips late commits.

## Scope and non-goals

Recommended scope: first eligible Qualified and first trusted Converted fact per Meta-first opportunity; prospective delivery only; no monetary value; lead-ID-first matching. Reuse independent inbound/outbound settings, existing outbox and transactional school engines.

Exclude website/later-touch routing from live mode pending a later approved extension (keep existing mock tests). Exclude Today/detail/center-visit/walk-in redesign, new website forms, real Insights spend, broad attribution/ROAS/CAC, payroll/finance changes and unrelated receptionist permissions. A privacy-policy/evidence dependency must be resolved before activation, not smuggled into those excluded redesigns.

## Lifecycle event contract and data minimization

| Field | Contract |
| --- | --- |
| Internal outcome | `qualified` from trusted `lead_qualified`; `converted` only from the activity/enrollment referenced by the lead's authoritative conversion evidence. |
| Multiplicity | One per lead/kind, regardless of reopening/requalification, Confirmed→Validated, duplicate cron or retry. No synthetic predecessor event. |
| Time | Original activity occurred_at, floored Unix seconds; never now() to evade provider age limits. |
| ID | Preserve 088 deterministic ID and uniqueness. Never mint a new ID to retry uncertainty. Destination and source activity immutable. |
| Provider name | Versioned exact mapping approved after current Meta CRM contract verification. Do not assume `QualifiedLead`, `ConvertedLead`, fixture names or `Purchase` are valid/approved. |
| Source | Proposed `system_generated` for CRM fact, subject to provider verification; acquisition on a website does not itself make the milestone a website event. |
| Matching | Recommended original Meta lead ID from accepted, Page-matched first submission. Add normalized adult em/ph only if D5 explicitly approves and contract requires/justifies them. Never hash lead_id, fbc or fbp as if they were contact fields. |
| Other metadata | Allow only exact non-personal constants required by verified CRM contract (e.g. `custom_data.event_source=crm` and `lead_event_source=English Hills` **if verified required**). These are not currently permitted by SQL; add exact key/value checks only after evidence. No generic custom_data object. |

Explicitly exclude child name/DOB/age, academic level, placement results, notes, internal activity/history text, task history, arbitrary form answers, teacher data, detailed payment history, documents and unrelated family/student data. Also exclude contact name, address, IP, user-agent, free-form URLs, raw fbclid and UTMs in recommended scope. No value/currency/revenue fields; D4 changing this requires a revised finance/data contract before implementation.

Persist only the allowlisted prepared envelope. SQL must reject extra keys, wrong field types, arbitrary custom_data, mismatched hashes/IDs, oversized bodies and mutated frozen content. Existing 8 KiB payload limit is sufficient unless a verified contract justifies a reviewed change. Do not persist raw Graph responses, request headers, tokens, matching values or payloads in application logs.

## Eligibility / consent model (conditional on D1/D2)

Use a small **append-only eligibility evidence store**, separate from immutable acquisition attribution. Proposed `crm_lifecycle_eligibility_policies` binds a versioned owner-approved evidence rule to an exact connection/form and effective interval. Proposed `crm_lifecycle_eligibility_evidence` binds submission + destination + policy version + event (`grant`/`revoke`) + recorded/effective time + controlled source/reason + actor/request identity. Evidence is not a legal conclusion. It represents the owner's approved software rule and verifiable source.

D2 recommendation: explicit form-response proof of adult contact and Meta lifecycle sharing, using approved exact field keys/accepted values and notice/policy version. A director publishes the prospective policy; a server-only evaluator validates the stored accepted provider submission and derives evidence idempotently. It may inspect only approved response fields for this purpose; those answers never enter the outbound payload. Missing/ambiguous answers, unknown policy/form/Page, redaction or failed validation yield ineligible/blocked, while normal CRM intake still succeeds. Run evidence evaluation as a recoverable separate bounded step so eligibility failure cannot roll back acquisition. Eligibility at the milestone requires policy effectiveness and affirmative source evidence at/before that milestone; later processing can record earlier captured proof, but later consent cannot backdate eligibility.

D2 alternative requires explicit owner-approved provenance/legal-basis policy and adult-contact proof; it is not a blanket per-connection override. Record its exact scope/evidence and revise validators before implementation. If current Meta forms cannot supply approved evidence, no events leave until forms/policy support it. Do not silently expand this batch into website-form work.

For live claims, require all: enabled approved destination + server live gate; approved contract/version; Meta-first accepted submission; matching Page/form/connection; valid original lead ID; active evidence for this submission/destination; no redaction/revocation; event at/after activation and within verified provider deadline; trusted milestone (and no conversion review for Converted). Missing evidence is visible as `blocked:sharing_evidence_missing`; excluded scope/redacted/invalid/historical/expired facts are terminally suppressed before send.

Revocation is append-only and overrides grants. A narrow director command can record revocation with a controlled reason; no receptionist grant override, bulk retroactive grant or generic JSON evidence setter. Regrant/backfill is outside scope. Recheck immediately before durable begin and HTTP; acknowledge that already in-flight/accepted delivery cannot be recalled. Existing redaction also denies sending regardless of evidence store. Admission/enrollment and first-touch attribution remain unchanged.

## Provider transport and configuration

Extend the existing adapter/worker with explicitly separate mock and live entry points. A `server-only` wrapper owns real fetch and secret resolution; production routes cannot inject fixture success. Keep fixed `https://graph.facebook.com/{approved-version}/{approved-dataset}/events`, numeric dataset validation, bearer header, redirect rejection, no-store, bounded response and eight-second timeout covering body consumption. No arbitrary URL/path/Graph proxy, token query string or provider-controlled redirects.

Use the existing outbound secret-reference namespace; token values exist only in server environment/approved secret manager. Dataset is not Page ID or ad account ID. Verify business ownership, app/system-user/token permissions, Page/form provenance, dataset access and intended ad-account association independently from working inbound lead retrieval. Inbound tokens do not prove outbound permission. Pin a supported Graph version and exact contract revision; do not guess “latest” or inherit an unverified inbound version. Rotation changes secret value through operator controls without rewriting frozen events.

Live activation requires server `CRM_META_LIFECYCLE_LIVE_ENABLED` plus per-destination approved live configuration, with a database-owned `live_started_at`. Each re-enable creates a new prospective activation epoch; events from a disabled interval are not released automatically. Keep mock/not_before history intact and never let an authenticated director bypass a missing operator live gate. Disable must remain available during incident response. No runtime environment/config mutation in this architecture task.

### Provider evidence gate

On 2026-09-29, official [CRM integration](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/) and [server parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/) returned HTTP 429. Meta's [maintained Salesforce integration example](https://github.com/facebook/Conversion-Leads-Salesforce-APEX) confirms the broad Meta-lead-ID/status integration pattern, but does not establish today's English Hills live contract. Third-party tutorials are not an authority for payload decisions.

Before live transport implementation is signed off, capture accessible official evidence for exact event names, required CRM constants, lead ID representation, matching normalization, supported API version, maximum event age, deduplication scope/window and accepted-response semantics. Record the verified values and access date in this plan/ADR or a linked contract document. Use Meta authorized test tooling only with separate approval; no real contacts during local tests. If requirements need fields outside this allowlist, stop for a plan revision. This is a real unresolved provider dependency, not assumed missing application infrastructure.

## Scheduler / delivery architecture

Create `/api/cron/crm-lifecycle` and a lifecycle-specific scheduler module, protected by a separate constant-time-checked bearer `CRM_META_LIFECYCLE_SCHEDULER_TOKEN`. Reuse 095's private Vault/pg_net invocation pattern in a **new forward migration** for a distinct `crm-lifecycle-primary` job, initially inactive; do not edit 095 or intake's job. Proposed cadence: five minutes, with optional approved GitHub backup invoking the same endpoint using its own lifecycle secret. Both triggers share DB claims and identities. Never put Meta tokens in SQL or cron bodies.

Each authorized tick: bounded evidence evaluation, reconcile up to 100 milestones, then claim/send at most three deliveries. Enforce a wall-clock budget below the route's 60 seconds; stop starting work with insufficient time for the eight-second request plus finalization. Claim only work that can finish within its two-minute lease. A failure in lifecycle processing has no effect on intake/reconciliation scheduling. Before activation, load-test bounded reconciliation, indexes and oldest-unprocessed lag; add a forward index only if query evidence requires it. No cursor that advances past uncommitted facts.

Responses expose counts only. Persist minimal scheduler last-start/last-success/last-safe-error and destination delivery health through worker RPCs, without payloads. Alert on missed ticks (>15 minutes for proposed cadence), oldest due/unreconciled lag (>15 minutes), auth blocks, new dead/unknown events and repeated provider failures; thresholds are operational defaults to validate in the release runbook. Director UI must distinguish a successful tick from successful external delivery.

## Retry, uncertainty and replay

Preserve durable claim → get/check → prepare/freeze → begin attempt → HTTP → finish. Every database step validates lease ownership/expiry. Before final HTTP dispatch, the server must recheck its live gate and the database hold; external I/O cannot be made atomic with revocation, so this narrows but cannot eliminate the in-flight window. Finalization failure never creates success; expired started attempts become unknown. Do not promise exactly-once external delivery: the DB prevents duplicate intentions, but uncertain HTTP retry depends on verified provider deduplication.

| Result | Action |
| --- | --- |
| Verified 2xx acceptance for one event | `sent`; immutable accepted record, not proof of ad attribution/learning. |
| 429/provider rate limit, transient 5xx | `retry` with existing exponential+jitter delay and bounded Retry-After. |
| Auth/permission failure | `blocked:provider_auth`; operator repairs credential/permissions, no automatic retry storm. |
| Permanent payload/provider rejection | `dead:validation`; sanitized controlled code. |
| Timeout/network/malformed successful body | `unknown`; identical frozen ID/time/payload only, subject to verified deduplication and age deadline. |
| Lease expires | Mark unfinished attempt unknown; recover same identity with a new lease; stale finalize denied. |
| Cutoff/age exceeded, excluded scope or redaction | Suppress unsent event; no new timestamp or identity. |
| Attempts exhausted | `dead`; never reset counters. |

Keep default five attempts, max eight; preserve 088 delay bounds (base exponential capped at six hours plus jitter; overall max one day). Stop retries before the verified provider maximum age. If provider deduplication cannot safely cover an uncertain retry, hold unknown for operator assessment; do not auto-resend it based only on our unique constraint.

Recommended director retry is a single eligible blocked/retry/unknown row after repair, respecting next-attempt time, provider deadline, activation epoch, evidence, attempt limit and frozen contract. Record actor/time/reason without free-form PII. No sent/dead/suppressed reset, bulk replay, configuration-driven historical release, destination swap or new ID. Before payload preparation, configuration repair may adopt a new validated contract only for the same destination and eligible current activation; prepared payload/configuration remain frozen. Mock-prepared rows can never become live. D7 may choose operator-only retries instead.

Store only outcome, attempt number/times, bounded HTTP status, allowlisted error code, safe trace ID and `accepted:true`; no raw provider error messages. Any new error category needs SQL and worker validation together.

## Director visibility and receptionist implications

Add exact director-only `/crm/integrations/lifecycle` route, guarded in roleAccess, middleware and ProtectedRoute before mounting queries. Extend existing diagnostics RPCs with live-gate/configured status, safe destination label, contract version/activation date, due/blocked/failed counts, oldest pending age, last scheduler success and paginated delivery/attempt state. Never return tokens, secret references, raw/hash matching data, child fields or provider bodies. Server-live-gate state comes from an authenticated server read, not browser environment variables.

Director can inspect eligibility policy versions and controlled reason codes, publish prospective policies after owner approval, disable outbound and use the approved retry control. Policy/configuration writes use version checks and audit evidence. Secret provisioning and first Production activation remain release/operator steps. No global “send now” or evidence bypass. Admin/receptionist/teacher/parent/student/anon are denied via API/RPC/RLS even if they guess URLs. Receptionist's ordinary actions need no new button and remain functional during provider outages.

## Database changes, migration strategy and security boundaries

Reserve the next free forward migration(s) after 097 when implementation begins, not in this documentation branch. Rehearse clean replay and 097→new upgrade with synthetic data; no deployed file changes. Separate schema/RPC migration from explicitly approved scheduler activation/configuration. No seeds containing real destinations, tokens or consent grants.

Object manifest:

- New versioned eligibility policies and append-only evidence/revocation records described above, with unique request/source identities and FKs to accepted submission/destination/policy. RLS enabled, direct access revoked from PUBLIC/anon/authenticated/service_role; narrow director/worker RPCs only.
- Extend 088 configuration with pinned live contract, database activation epoch and approved scope. Extend `lifecycle_route`, `lifecycle_hold`, configure/reconcile/claim/get/prepare/begin/finish/block/retry/list functions and relevant validators without weakening mock/history or role checks.
- Add delivery evidence/activation/contract references and send deadline as needed; backfill only diagnostic non-live markers on existing rows, never eligibility. Keep original IDs and unique constraints. Existing mock rows remain non-live and non-replayable into live mode.
- Add bounded worker evidence evaluation, director policy/revocation/configuration and safe diagnostics/audit interfaces; no arbitrary update RPC. Worker service role retains RPC-only table access. Review schema/function grants after every replacement; default PUBLIC EXECUTE must be explicitly revoked.
- New private cron invoker and disabled job; separate lifecycle Vault URL/bearer references, fixed endpoint/host validation and no browser-accessible helper. Minimal operational health record behind worker/director interfaces.
- D6-approved retention/redaction: add a narrow one-way terminal payload erasure path to 088's immutable guard, with `payload_redacted_at`; preserve immutable event/attempt metadata and original hash for audit, never make erased rows preparable again. Because the current payload/hash null-equivalence check and sent-row guard prohibit this, revise those constraints explicitly in a forward migration, not by disabling triggers. Erasure must block/suppress unsent work and fence leases; no sent resend. Treat retained hash as protected data too. Apply an approved retention schedule to that hash if required, with equally terminal audit semantics.

All SECURITY DEFINER entry points use qualified names, fixed search_path, stored-role or service-worker checks and exact EXECUTE grants. No new broad table permissions, no normal-CRM token storage, no revenue/enrollment trigger modification. Immutable acquisition/first touch, student/parent identity and conversion-review boundaries survive. Policy/evidence transitions and attempt begin use consistent locking to prevent a concurrent revocation from being ignored before begin; document the unavoidable in-flight window.

## Testing strategy and acceptance

Local Supabase only (`http://127.0.0.1:54321`), synthetic adult/learner fixtures, no real external sending/email. Inject transport fixtures; test the production adapter wiring without real tokens. Existing [Phase 10 SQL](../../../scripts/test-crm-phase10.sql), [concurrency](../../../scripts/test-crm-phase10-concurrency.py), and [JS](../../../scripts/test-crm-phase10.mjs) are the foundation, not replacements for live-contract coverage.

Required positive/negative/regression matrix:

- One eligible Qualified and authoritative Converted event; no conversion on enrollment start/zero payment; repeated qualification, Confirmed→Validated, concurrent cron and failed-finalize recovery retain one identity. Preserve 083–085 enrollment/finance tests.
- Missing/false/ambiguous evidence, generic website consent, child-only identity, wrong Page/form/destination, manual/website/later-touch source and revoked/redacted evidence send nothing. Evidence failure does not block intake. No retrospective grant; accepted source proof timestamp is checked.
- Old blocked row retry after enable, disable/re-enable epoch, old mock-prepared/mock-sent rows, expired event, changed mapping/destination and prepared payload changes cannot escape live gates. Provider age/deduplication deadlines tested at boundaries.
- Extra payload keys/financial values/child fields/forged hashes rejected by SQL as well as adapter. Logs, API responses and director browser network responses contain no sensitive envelope or token.
- 429/Retry-After, transient/auth/permanent errors, oversized/slow/malformed body, redirect, network loss, response loss, stale leases, attempt exhaustion and revocation races; no false sent result or refreshed event time.
- Director configuration/diagnostics/retry allowed exactly as approved. Other roles denied via direct RPC/API/route/table probes; service role cannot mutate tables directly. Function ACL/search-path checks, history UPDATE/DELETE/TRUNCATE denials and terminal redaction checks.
- Browser director operational flow and receptionist normal CRM flow; role change/query-cache isolation. Run `npm test`, `npm run test:crm-intake`, navigation/middleware, lint/build, relevant Phase 10/12 SQL/security and Batch 1 regressions. Test scheduler auth, bounded runtime, overlap/recovery, stale health and independent inbound health.
- Clean replay plus synthetic 097 upgrade, old-app compatibility while new mode is disabled, existing historical mock rows and missing evidence. CI and fresh independent review of final SHA required.

## Production rollout and recovery

Follow [rollout template](../../ai/templates/PRODUCTION_ROLLOUT.md). Implementation approval does not authorize Production mutation. Release approval must name code SHA, forward migrations, provider test/activation scope, destination, contract and evidence policy.

Deploy compatible disabled code and apply reviewed schema in the explicitly approved order; verify Vercel READY exact source commit and migration ledger. Provision separate outbound token/scheduler credentials without revealing values. Verify app/Page/dataset/ad-account relationship and official contract in authorized provider tooling. Keep intake settings/job unchanged. Activate one approved destination/policy prospectively, then the independent scheduler. Do not backfill old missing eligibility or reset outbox rows. Observe one approved eligible milestone through acceptance and director diagnostics, plus permission probes and inbound/scheduler/runtime health; distinguish provider receipt from learning/optimization. Record the date and evidence in durable docs only after acceptance.

On security/provider/health regression: stop new sending using the server gate and disable the lifecycle job/configuration; leave inbound running. Already in-flight requests may finish. Preserve unknown attempts and immutable IDs; do not bulk replay. Roll application back only after compatibility assessment; database rollback uses reviewed forward repair. Never delete valid enrollment/payment/audit history or try to undo external events by changing CRM facts. Fix eligibility/credential/payload issues, independently review and obtain approval before reactivation with a new cutoff.

## Owner decisions required

| ID / question | Option A | Option B | Architect recommendation | Implementation blocked? |
| --- | --- | --- | --- | --- |
| D1: Which acquisitions may receive live feedback? | Meta-first accepted Instant Form opportunities only; smaller, provable boundary. | Include website Meta-attributed/later-Meta matching; requires separate provenance, destination and browser-identity/consent contract. | A for Batch 2. | Yes: determines routing and evidence scope. |
| D2: What evidence authorizes adult-contact sharing? | Explicit approved form-response proof of adult contact and Meta sharing, tied to notice/policy version; absent proof blocks. Existing forms may need changes. | Owner-approved documented alternative basis/provenance policy plus adult proof, represented by auditable evidence; needs exact rules supplied by owner, not inferred by software. | A; owner must approve field/value mapping and evidence/notice policy. No legal claim made. | Yes. Neither source=Meta nor director toggle is sufficient. |
| D3: Historical events? | Prospective activation epochs only; old/disabled-period milestones never released. | Bounded historical backfill with age/evidence review; additional audited replay design needed. | A. | Yes: cutoff semantics must be approved. |
| D4: Send monetary value? | No value/currency/payment information; lifecycle outcomes only. | Include a precisely defined financial metric; changes current security boundary and requires a separate value/refund/attribution contract. | A. | Yes if B; A preserves current durable prohibition and still needs scope approval. |
| D5: Matching fields? | Original Meta lead ID only if verified contract supports it; least disclosure. | Lead ID plus normalized SHA-256 adult email/phone, for verified matching need and approved evidence scope; more personal-data-derived material. | A unless provider evidence requires B, then return for approval. | Yes, plus provider verification. |
| D6: Retention of matching payload/evidence? | Proposed 30 days after terminal delivery for payload/hash erasure, 90 days for minimal attempt/decision diagnostics; retain only minimal nonmatching deduplication tombstone thereafter. Proposed evidence metadata retention: until all referenced deliveries are terminal plus 90 days; erase response-derived proof then, retaining a nonmatching policy/revocation audit marker. Owner must approve privacy/audit policy. | Owner supplies different explicit durations and erasure requirements, accepting diagnostic/storage tradeoffs. | A as an engineering proposal, not a legal retention recommendation; align evidence retention with owner's approved audit policy. | Yes: durations and evidence-record retention must be recorded. No indefinite sensitive retention default. |
| D7: Who can request safe retry after repair? | Director single-row retry with checks/backoff, audit and no dead/sent/suppressed resets. | Operator-only approved retry; director has read/disable controls, higher operational dependency. | A, preserving existing narrow RPC model. | Yes: affects UI/ACL contract. |

Additional release prerequisites, not discretionary product choices: exact provider contract verification; approved destination/credential access; existing forms supplying the chosen evidence; final review/CI; explicit release approval. If owner chooses a wider option, revise this plan before authorizing implementation. Do not implement all options behind toggles.

## Expected files/modules

| Area | Expected surface |
| --- | --- |
| Existing delivery logic | `src/lib/crm/lifecycle/adapter.mjs`, `worker.mjs`; new `server.js`, `scheduler.mjs` and evidence evaluator module in the same folder. |
| Endpoints | New `src/app/api/cron/crm-lifecycle/route.js`; existing internal lifecycle endpoint remains director-only, plus narrow authenticated config/status actions if needed. |
| UI | New `src/app/(admin)/crm/integrations/lifecycle/page.jsx`, `src/components/crm/LifecycleOperations.jsx`; `src/lib/crm/queries.js`, `roleAccess.mjs`, Sidebar and guards as needed for exact director route. |
| SQL | Next free migration(s) after 097; object manifest above. Inspect latest cumulative definitions, not blanket replacements from 088. |
| Scheduling | New lifecycle backup workflow only if approved; separate job/token/Vault references. Do not change intake budget/credentials. |
| Tests | Phase 10 suites, new lifecycle scheduler/evidence/live-adapter/browser tests, Phase 12 security checks and relevant intake/finance/receptionist regressions. |
| Docs | This plan/ADR, crm-meta-lifecycle runbook, CURRENT_STATE/ARCHITECTURE/SECURITY_RULES/WORKFLOWS and FEATURE_INDEX as implementation/deployment evidence develops. PRODUCT_RULES only for a newly approved durable invariant. |

## IMPLEMENTATION CONTRACT

1. **Do not start until the owner records D1–D7 and approves this plan revision.** Verify current main and latest deployed migration inventory. Resolve provider contract before finalizing payload validators/live transport; never guess missing required fields/version/age/deduplication behavior. This contract describes the recommended A scope; other selections require an updated approved contract.
2. Reuse 088 deliveries/attempts and existing committed milestone generation. Preserve one lead/kind intention, activity/connection event ID, original event time, frozen payload/configuration, leases and bounded attempt history. Do not change CRM/enrollment/payment semantics or first touch.
3. Implement prospective Meta-first eligibility evidence and revocation, fail closed; no blanket consent backfill or reinterpretation of website accepted=true. Keep evidence processing recoverable and independent of intake success. Limit live payload to the approved verified fields and SQL-enforced identities.
4. Implement fixed-host server-only live transport behind separate operator gate and DB activation epoch. Prevent old blocked/mock/frozen rows from becoming live and enforce cutoff/age/evidence at every attempt and retry. Pin the verified contract; secrets never reach browser/CRM tables/logs.
5. Add independent bounded lifecycle scheduler and safe health diagnostics. Preserve inbound reconciliation/intake and fixture-only Insights. Add director-only UI/policy controls and only the chosen retry policy; no receptionist action or permission change.
6. Write forward migration(s) after 097 for the manifest, including approved terminal retention/redaction. No changes to 001–097. Audit RLS, function ACLs, private helper access, immutable history and downgrade/upgrade compatibility. No Production mutation during implementation.
7. Satisfy the full test matrix, clean replay/upgrade, browser verification and CI. Stop for a real product/security scope conflict; autonomously fix ordinary implementation/test failures. Do not weaken tests or denials.
8. Update durable docs with implementation evidence only; retain deployment gates. Stage explicit paths, inspect diff, commit/push and open an implementation PR when authorized by the implementation task. Return PR/head SHA, migration manifest, checks and blockers. Do not merge/deploy. Fresh independent review and human release approval precede operator rollout; closeout follows Production verification.
