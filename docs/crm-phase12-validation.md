# Phase 12 integrated validation evidence

Run date: 24 September 2026. Starting code: `8452dde85d9d8b7d894c5ab7c6c8dd041efd0fef`, branch `codex/director-receipt-deletion`, Phase 11 committed. Starting local ledger: exactly 001–090. Production remains **last-confirmed** 001–076 and was not accessed. No Git command, commit, push, deployment, live token/provider activation, historical migration rewrite or existing-development-database reset was performed.

## Outcome and exact change

One demonstrated database performance defect: Today timed out at 15 seconds on the synthetic workload. Its correlated terminal-task timestamp lookup lacked an index with `lead_id` first; the open-task indexes cannot satisfy `status <> 'open'`. Migration **091_crm_hardening_task_history_index.sql** adds only a partial covering index on `(lead_id) INCLUDE (completed_at, cancelled_at) WHERE status <> 'open'`. It changes no RPC, lifecycle, enrollment, finance, permission, trigger or data semantics. Applied to the existing LOCAL database and both disposable replays. Local ledger is now exactly **001–091**.

All other Phase 12 changes are hardening tests, a read-only health helper and release documentation. Application source is unchanged. Migrations 001–090 retain their baseline hashes. There is no remaining demonstrated code blocker for **production rollout review**, which is not permission to deploy or activate providers.

## Rehearsal design and results

The Supabase CLI initialized a separate project at `/private/tmp/hills-phase12-platform`, container `supabase_db_hills-phase12-platform`, PostgreSQL image `ghcr.io/supabase/postgres:17.6.1.121`. Its empty Auth/Storage/Vault platform schema was schema-only dumped into two template0 databases. No schema or data was copied from the user's development or production database. Supabase's platform schemas are prerequisites, not application migrations.

Initial raw-image/ownership bootstrap attempts were rejected before application replay; proper CLI initialization and ownership-preserving schema restore resolved them. Those setup retries were not skipped application migrations. The rehearsal script refuses nonempty application databases and any other container name.

| Rehearsal | Result | Time | Preservation |
|---|---|---:|---|
| Fresh 001 → 090, all 90 unchanged files | PASS | 18.988 s | CRM/config tables empty |
| Initial 001–076 then exact 077 → 090 | PASS | 20.575 s total; 2.642 s upgrade | Synthetic student/enrollment/director unchanged |
| Expanded 076 finance fixture, exact 077 → 090 | PASS | 19.932 s total; 3.807 s upgrade | Student, enrollment, profile, charges, receipts and financial events JSON identical before/after |
| Forward 091 on both rehearsals | PASS | Small index-only operation | No function/security/data change |
| Local vs fresh vs upgraded catalog | PASS | 1,180 definitions per comparison | Critical columns, constraints, indexes, RLS, table grants, policies, enabled triggers and CRM/role/enrollment/receipt function bodies/security/search paths/grants match |

Order is every three-digit migration 001, 002, …, 090 without gaps; upgrade is 077, 078, …, 090. The execution manifest records each filename, SHA256, duration, notices and result. No migration-history repair or SQL edits were needed. Each full replay emitted **154 NOTICEs and zero WARNINGs**; notices are existing IF EXISTS / IF NOT EXISTS idempotency messages. Replay files were executed by psql with stop-on-error; the script execution manifest, not a fabricated CLI ledger, is the disposable replay record.

Rehearsal extensions: pg_net 0.20.4; pgcrypto 1.3; supabase_vault 0.3.1; uuid-ossp 1.1; pg_stat_statements 1.11; plpgsql 1.0. Production previously reported pg_net 0.20.0. This is not exact production platform parity: reverify extension/platform compatibility during production preflight. Migration SQL compiles against an independently initialized supported local Supabase platform; no production-only record was needed.

Evidence in `/private/tmp/phase12-rehearsal/result.json`, `/private/tmp/phase12-upgrade-finance/result.json` and `/private/tmp/phase12-schema.log`. Logs are local evidence, not required repository artifacts. Task-owned disposable databases/containers are removed after capture; the existing development database is preserved.

## Coverage and regression results

| Area | Evidence / result |
|---|---|
| Real role/RLS matrix | New Phase12 suite: **450 checks**, director/admin/receptionist/teacher/parent/student/pending/anon/service. Every CRM table SELECT and nonmatching DELETE requires actual permission-denied code, including director/service. Sixteen operational/protected/worker RPCs require successful allowed paths and explicit denied paths. Forged director metadata cannot grant authority. |
| Role administration | Batch2 **782 checks**: role transitions, invitation/activation, direct bypass, stale/expired/revoked-issuer queues. Global last-director destructive races intentionally skipped to preserve existing local directors. |
| Routes/session/client guard | Middleware **1,045 checks**, 44 route patterns, role matrix, cookie refresh, RSC/prefetch, API denial, disallowed React children/query prevention. |
| Phase 2–11 SQL | All pass. Run in forward order, then reverse order after 091. |
| Phase 3–11 concurrency | All pass in reverse phase order. Includes contact/opportunity resolution, cross-channel intake, placement/enrollment, signed revenue, queue claims, stable retry identities and lease fencing. |
| Provider/presentation unit | Phase 4, 8, 9, 10 and 11 pass. Mock retrieval/delivery/sync only. |
| Browser | Phase 4, 5, 6, 8, 9, 11, receptionist and historical placement all pass. Phase12 focused keyboard/empty/error-state smoke passes. |
| Legacy center security/finance | Receptionist security, enrollment workflow, paid enrollment, student placement, receipt-charge payments and mistaken-receipt SQL pass. |
| Project checks | `npm test`, `npm run test:navigation`, lint and build pass; normal production build repeated after the middleware isolated build. Existing Node module-type warnings remain nonfatal. |
| Integrated journey | New rollback-only Phase12 E2E passes before and after 091 in disposable upgrade database. |
| Analytics extra | Full existing Phase11 contract repeated with EUR mismatch and America/New_York reporting timezone; original test/migrations unchanged. PASS. |

The serial regression runner takes a host-wide lock, stops on the first test or cleanup failure and compares CRM counts, Auth IDs, trigger definitions/states and table RLS/ACL fingerprints before/after **each suite**. Do not launch legacy scripts independently in parallel: they share fixtures. SQL reverse order and concurrency reverse order demonstrate no dependence on prior suite fixtures. This harness prevents overlap rather than retrying pollution until green.

Test-development corrections were limited to fixture SQL typing/time ordering and a browser locator that initially matched both the analytics error and Next's route announcer. Cleanup passed even on that locator failure; it was scoped to the analytics section and rerun. No application behavior was changed to make tests pass. Existing SQL tests sometimes use transaction-scoped fixture controls (for example receipt email); their rollback/cleanup restores them. New integrated/large-data tests retain guards. No disabled trigger remains.

## Integrated behavior assertions

- Manual: NEW → two failed calls → meaningful conversation/ENGAGED → QUALIFIED → book/reschedule/attend/result → post-test follow-up → linked Submitted enrollment → Confirmed → one CONVERTED evidence → collected receipt/revenue. Intake and placement do not prematurely create students. Existing cadence suites cover lunch, Sunday, late Monday, five failures, attempt six denial, later qualified outreach, interrupted/new cycles and explicit unreachable closure; no automatic Lost.
- Meta: existing HTTP/provider suite proves signature/replay → durable job → injected mock retrieval/normalization. Integrated SQL continues durable claim/finalization → one submission/lead/task → qualified/conversion. These are composed boundary tests, not a real Meta HTTP journey.
- Website: durable replay, UTM/fbc/fbp protected observation, cross-channel same learner/program resolution and sibling/program separation. Website first touch survives a later Meta touch and remains revenue attribution; no fabricated Meta advertising IDs.
- Ambiguity: unresolved intake stays reviewable for missing mapping/policy, shared phone, missing learner or conflicting evidence. Existing SQL/concurrency suites enforce explicit review instead of unsafe merging.
- Placement: one test row, one attendance/result milestone, one follow-up, no fake A1, linked hard-delete denial and historical unlinked flow compatibility.
- Enrollment: new/existing/ambiguous student paths, Submitted/Trial nonconversion, Confirmed/Validated once-only conversion, closed-lead review flag and no silent downgrade unconversion. Payment omission cannot create Enrollment B for CRM-linked A; explicit A succeeds, explicit legitimate B cannot convert A; rejected paths leave no partial writes.
- Finance: integrated +1500, void −1500, subsequent mistaken deletion 0 = **0 net**, conversion retained. Phase7 covers partial payments/multiple charges/delayed linkage/unattributed historical evidence and conversion/revenue independence. No new payment behavior.
- External isolation: after all integration settings are disabled, manual placement/enrollment/payment continues. Qualified/converted work produces no delivery until explicit Phase10 reconciliation; two reconciliations produce exactly six distinct intentions for three leads, no attempts and no provider HTTP in that fixture.
- Delivery/ingestion failure suites cover 429, 5xx, auth/validation failure, timeout/ambiguous timeout, crash, expired lease, stale finalization, duplicate event/job and bounded retries. Stable event ID/payload/time and sanitized errors survive retries. A timeout cannot prove the remote provider did not accept an event; no exactly-once network guarantee is claimed.

## Analytics reconciliation

Known Campaign A spend 150 with two attributed opportunities gives CPL 75 and CPQL 150 after one qualification. Campaign B spend 30 and zero leads stays visible with unavailable denominators. Total Meta spend 180, one attributed conversion and collected revenue 500 give CAC 180 and ROAS 500/180. Voiding the receipt yields zero signed revenue without removing conversion. Multiple submissions do not multiply spend or opportunities; first touch, unknown/website buckets, outcome cutoff, requalification and distinct placement milestones are verified.

MAD/MAD permits ROAS. EUR/MAD suppresses ROAS, with no implicit FX. New York account date classifies `2026-01-03 04:30Z` into January 2 while UTC/Casablanca are January 3; the January 1–2 acquisition cohort includes it. Operational follow-up policy remains Africa/Casablanca. Spend uses provider account dates. Partial/failed refresh preserves prior completed rows and displays a warning; an atomically completed empty refresh correctly clears vanished spend. Browser verifies warning/empty/unavailable presentation and campaign/adset/ad drilldown.

## Synthetic volume and plans

Disposable final workload: **5,000 contacts, 10,000 leads, 21,000 submissions, 71,000 activities, 53,000 tasks, 3,000 placements, 3,000 enrollments/students, 3,000 real RPC-created receipts/revenue entries, 10 campaigns, 20 adset IDs, 100 ad IDs and 3,100 ad/day Insights rows**. Guard-generated history/tasks explain growth beyond initial bulk inserts. No customer data or live provider secret.

| Read | First post-fix measurement | Later shared-host measurement |
|---|---:|---:|
| Today | 165 ms | 431 ms |
| Search | 54 ms | 166 ms |
| Detail | 15 ms | 33 ms |
| History | 3.5 ms | 4.7 ms |
| Intake review | 11 ms | 18 ms |
| Campaign analytics | 469 ms | 1,161 ms |
| Revenue reconciliation queue | 13 ms | 15 ms |
| Terminal history for 7,000 active leads | 31 ms | 40 ms |

Before 091, Today and full terminal-history lookup exceeded the 15-second timeout; even a 100-lead terminal lookup took about 200 ms. After 091 the latter uses an index-only scan on `crm_tasks_terminal_lead_idx`. These are single-host EXPLAIN ANALYZE samples, not production p95/load-test promises.

Nested `auto_explain` confirms Today/open-task/placement indexes; history uses `crm_activities_timeline_idx`; intake uses `crm_intake_review` and contact phone/email indexes; analytics uses activity and revenue-attribution indexes with appropriate aggregate scans; revenue queue uses financial-event identity/receipt lookups. Diagnostics/claims tested with small or empty integration queues naturally chose scans. Their concurrency/fencing is tested separately; sustained large queue throughput remains unbenchmarked. No forced planner settings or speculative extra indexes.

Listings are server-paged: common CRM limit 1–100/offset ≤10,000; Today/Prospects UI 25; history 20, form answers 5, placement 5, intake review 10, analytics 50 (max 100), diagnostic run history 25. Student candidate lookups and provider input/page sizes are capped. Server totals/analytics aggregate history but do not ship it all to the browser. The director's Insights **configured-account selector** returns the current small configuration set without pagination; this is metadata, not event/history loading. Revisit if the single-center configuration count becomes large. Do not claim every query avoids scanning all qualifying rows.

## Security/privacy, UX and health

No new receptionist financial/reporting/configuration authority. Operational student context remains existing scope; protected raw attribution, revenue, spend and provider diagnostics are director-only. Even director has no direct history mutation grant; service identities use worker RPCs rather than broad CRM table grants. Role decisions read stored profiles, not browser metadata.

CRM HTTP endpoints map provider/storage failures to fixed safe responses; operational UI maps SQLSTATE/domain failures to French messages. Provider modules retain sanitized codes rather than raw errors. Outbound lifecycle allowlists adult contact matching and approved event metadata; no learner name/DOB, financial notes or Purchase/revenue event. Source review found no CRM console logging of raw provider/customer payloads. Direct PostgREST framework errors are not a promise that all database metadata is undiscoverable; authorization and value minimization remain the boundaries.

Configured private-value scan checked local private key values in 134 client artifacts and release runtime logs: zero matches; zero server-secret-reference markers in client artifacts; no private configuration using a public prefix. No Meta real token was configured, so actual Meta-secret-value leakage is tested with synthetic sentinels/provider tests and source/import review, not a nonexistent real secret. This is scoped evidence, not a universal secret/PII certification.

Desktop/mobile screenshots were visually reviewed. French status/reason text is independent of color, lead drawer fits 390px, actions/labels and focus restoration work. New keyboard smoke verifies Enter activation, 16 Tab steps staying in the dialog, Escape closure/restored trigger focus, mobile primary target ≥32px, analytics keyboard controls, loaded empty state and invalid-range alert. This is not a formal assistive-technology/accessibility audit. No redesign or UI code changes.

After testing: all 17 CRM tables empty locally, no Phase11/12 synthetic users/rate-limit rows, no disabled noninternal triggers, exact 001–091 ledger, index unchanged from HEAD. Catalog comparison proves expected guards/policies/functions remain present; the read-only operator helper also passes locally. Existing development records/configuration outside test scope are retained.

## Reproduction and limits

Use the feature branch, local `.env.local` pointing at `http://127.0.0.1:54321`, local psql/Docker/Node dependencies and exclusive fixture ownership. Never run the existing receipt rehearsal reset script against the user's database. Initialize a separate Supabase CLI project and empty platform first, then:

```sh
python3 scripts/test-crm-phase12-rehearsal.py --bootstrap
# Apply the exact 091 file to each task-owned disposable DB after 001–090.
docker exec -i supabase_db_hills-phase12-platform psql -X -q -U postgres -d phase12_fresh -v ON_ERROR_STOP=1 < supabase/migrations/091_crm_hardening_task_history_index.sql
docker exec -i supabase_db_hills-phase12-platform psql -X -q -U postgres -d phase12_upgrade -v ON_ERROR_STOP=1 < supabase/migrations/091_crm_hardening_task_history_index.sql
docker exec -i supabase_db_hills-phase12-platform psql -X -q -U postgres -d phase12_fresh -v ON_ERROR_STOP=1 < scripts/test-crm-phase12-load.sql
docker exec -i supabase_db_hills-phase12-platform psql -X -q -U postgres -d phase12_upgrade -v ON_ERROR_STOP=1 < scripts/test-crm-phase12-e2e.sql
python3 scripts/test-crm-phase12-analytics.py --disposable
python3 scripts/test-crm-phase12-schema.py
python3 scripts/test-crm-phase12-plans.py --nested
python3 scripts/test-crm-phase12-regression.py sql
python3 scripts/test-crm-phase12-regression.py sql --reverse
python3 scripts/test-crm-phase12-regression.py concurrency --reverse
python3 scripts/test-crm-phase12-regression.py security
python3 scripts/test-crm-phase12-regression.py batch2
python3 scripts/test-crm-phase12-regression.py middleware
python3 scripts/test-crm-phase12-regression.py unit
# Start normal app servers at 3101 and 3017 only after middleware/build finish.
python3 scripts/test-crm-phase12-regression.py browser
python3 scripts/test-crm-phase12-artifacts.py
```

Browser fixture servers require `CRM_META_APP_SECRET=phase8-local-fixture-secret`, `CRM_META_VERIFY_TOKEN=phase8-local-fixture-verify`, `CRM_WEBSITE_RATE_LIMIT_SECRET=phase9-local-rate-secret`, empty Turnstile secret, and empty public Sentry DSN. These are deliberately fake local test values, never deployment configuration. Browser network fixtures block external requests where applicable. The no-Git branch-probe shim substitutes only the existing legacy test helper's branch read and rejects other Git execFileSync requests.

Remaining rollout gates: production reinspection, backup/restore readiness, actual deployed old-app artifact compatibility smoke, real production volume/lock timing, immutable reviewed release, exact policy bootstrap, monitoring and privacy/retention decisions. Current Meta API versions/permissions are not certified here. Lifecycle and Insights live transports/schedulers remain unimplemented and unauthorized as designed. See the release/operations documents for independent activation gates. No new business decision was invented.
