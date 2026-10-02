# H3-04 contract seed implementation — 2026-10-02

Tier 3: a durable immutable provider manifest for a future external delivery path. This separate implementation task covers **H3-04 only**, under [H3 technical package revision 5](../plans/crm-h3-technical-readiness.md). Architecture head approved on PR #51: `77c36d5d6c36e7b892ce982baa12d4f5d017fa8e`; plan as read from the commissioning base SHA-256: `163213c4fe4584b09af52c3dcacbf5737f8e45b9647400fc078d87db802dee25`.

## Authorization and prerequisite

The [owner H3-04 authorization, PR #51 comment 5950202458](https://github.com/elforssa/english-hills-admin/pull/51#issuecomment-5950202458) was read directly through GitHub. Exact `created_at`: **2026-10-02T10:19:01Z**, used as `approved_at`. This binds the exact manifest/implementation scope; it is not Production release approval. The earlier architecture record supplies no exact UTC approval instant and is not substituted.

[H3-03 VERIFIED COMPLETE, PR #53 comment 5950165952](https://github.com/elforssa/english-hills-admin/pull/53#issuecomment-5950165952), created 2026-10-02T10:17:03Z, establishes the prerequisite: Production source `616ee7d37945ed79dc217ac9aef4e3b51b5dea45`, READY deployment `dpl_GtXpggWF3YjYhnf53DnygoHWnscR`, intended Supabase project, ledger 001–105, retained 104/105 behavior, healthy reconciliation/intake and closed/empty outbound gates. These are inherited operator evidence, not Production verification by this author.

## Artifact and exact readback

Branch: `codex/h3-04-provider-contract-seed`. Freshly fetched starting main/base: **`616ee7d37945ed79dc217ac9aef4e3b51b5dea45`**. Migration 106 was free at commissioning. Allocated contract UUID: **`7cf9833e-4f77-4335-b1ec-c047d9353f54`**.

Forward migration: [106_crm_lifecycle_provider_contract_r4_seed.sql](../../../supabase/migrations/106_crm_lifecycle_provider_contract_r4_seed.sql). SHA-256: **`74130de1e3e40d8f37181a7e92709ebce492def4fafa950b739390aff641ed97`**. Migrations 001–105 are unchanged. The migration is `BEGIN` → one explicit `INSERT ... VALUES` → `COMMIT`; no conflict handling, upsert, random deployment UUID, grants, DDL or other seed. All applicable fields are explicit. Only `created_at` uses its existing database default.

Expected readback, shared by [local acceptance](../../../scripts/test-crm-h3-04-local.mjs), [JSON fixture](../../../scripts/fixtures/crm-h3-04-manifest.json) and [SQL readback](../../../scripts/test-crm-h3-04-manifest.sql). SQL normalizes typed dates/timestamps; JSON tests compare the approval instant in UTC. `created_at` is additionally checked as finite and no later than readback, and is preserved across failed replay.

```json
{
  "id": "7cf9833e-4f77-4335-b1ec-c047d9353f54",
  "contract_key": "eh_meta_crm_r4_v26_r1",
  "revision": 1,
  "api_version": "v26.0",
  "qualified_event_name": "Qualified",
  "converted_event_name": "Converted",
  "lifecycle_model": "r4_stage_entry",
  "event_map": {
    "intake": "Intake",
    "not_qualified": "Not qualified",
    "lost": "Lost",
    "qualified": "Qualified",
    "converted": "Converted"
  },
  "action_source": "system_generated",
  "maximum_event_age_seconds": 604800,
  "uncertainty_policy": "no_uncertain_replay",
  "deduplication_window_seconds": null,
  "accepted_response_field": "events_received",
  "accepted_response_count": 1,
  "lead_id_only": true,
  "required_constants": {
    "event_source": "crm",
    "lead_event_source": "English Hills CRM"
  },
  "evidence_urls": [
    "https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification",
    "https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api",
    "https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started",
    "https://developers.facebook.com/docs/graph-api/guides/secure-requests",
    "https://developers.facebook.com/documentation/facebook-login/guides/access-tokens",
    "https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events",
    "https://github.com/facebook/facebook-nodejs-business-sdk/blob/0d245ec888c1af38d68994fd7f2e24cd38abc82f/src/objects/serverside/user-data.js"
  ],
  "verified_on": "2026-10-02",
  "approved_at": "2026-10-02T10:19:01Z",
  "active": true
}
```

## Final verification date provenance

**`verified_on = 2026-10-02`** comes from final read-only public documentation revalidation in this implementation task, completed before UTC checkpoint **2026-10-02T10:25:39Z** (18:25:39 Asia/Shanghai). It is not copied from an earlier research date. The repository's revision-1 register, older readiness/blocker records and revision-5 direct-credential evidence were inspected first; none explicitly bound a final verification date for the seeded row. Web fetch returned 429/unavailable; the in-app browser rendered H3-P1–P6, and GitHub public contents API read the pinned official H3-P7 file. No Graph/provider API, authentication using Production credentials, account setting, credential issuance or event request occurred.

| Approved ref | Final revalidation and preserved limits |
| --- | --- |
| H3-P1 | [CRM payload](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification): free-form stages including initial stage, original lead ID as matching option, integer seconds strictly after generation, seven days, system-generated action and fixed CRM source constants. Exact five names are EH decisions. |
| H3-P2 | [Using the API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api): v26.0 Pixel events edge, multipart data/access-token example and seven-day age. Current text describes event-ID/name deduplication and batch retries; it supplies no numeric server-only horizon or exact duplicate receipt. This does not widen approved no-uncertain-replay. |
| H3-P3 | [Get started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started): recommended Events Manager route, separate own-app route, business developer privileges and no direct-route App Review/permission request. No issuance or Manage action used. |
| H3-P4 | [Secure requests](https://developers.facebook.com/docs/graph-api/guides/secure-requests): TLS, server allowlist and conditional app-secret proof. No actual issuer policy or secret is inferred. |
| H3-P5 | [Access tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens): Admin system-user default asset access versus explicit Employee assignments. Actual future direct credential metadata remains H3-05. |
| H3-P6 | [Pixel events](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events): integer events_received, messages and fbtrace_id with alternate response structures. Reference example remains v25.0; no v26 CRM-specific/duplicate-response guarantee is invented. |
| H3-P7 | [Pinned official Node SDK](https://github.com/facebook/facebook-nodejs-business-sdk/blob/0d245ec888c1af38d68994fd7f2e24cd38abc82f/src/objects/serverside/user-data.js): string setter lines 950–959 and lossless normalization lines 1284–1285. This supports unchanged strings, not a stronger endpoint wire-type guarantee. |

Revision-5 route applicability is retained from [direct CAPI evidence](crm-h3-direct-capi-credential-2026-10-02.md). Active=true means usable provider manifest only. Destination, source eligibility/boundary/ownership, epoch, server live gate and scheduler remain independent prerequisites; a contract alone cannot send.

## Validation and exact-SHA evidence

Local validation is confined to synthetic Supabase on `127.0.0.1:54321` / PostgreSQL `127.0.0.1:54322`, external email disabled. No Production connection, service-role credential or real records were copied. No application/UI source is changed. The existing provider-contract badge now reads verified because the seed exists; the server gate stays closed and activation stays blocked. Browser regression asserts this data-driven distinction, disabled destination controls, safe responses and zero provider transport.

- H3-04 local acceptance: PASS. Fresh 001→106, exact full readback, key/revision and UUID collisions (including exact migration replay), 14 invalid constraint cases, UPDATE/DELETE/TRUNCATE protection, direct anon/authenticated/service-role denial, RLS/no policies/enabled immutable triggers and zero-network dormancy. Stateful 105→106 adds exactly one contract row while preserving every other public row, synthetic Auth row, full public/crm_security schema (function bodies, owners, ACL/RLS, constraints, policies and trigger/security attributes), cron and migrations 001–105 digests. Final cleanup/readback confirms clean 106 with one contract and zero activation inventory. Catalog dumps use the local database container’s matching pg_dump version; CI requires no host pg_dump version assumption.
- Lifecycle JavaScript and CRM intake/reconciliation JavaScript suites: PASS. Focused SQL Batch 2 catalog/live, required R4, advisory scope/safety/retention/exclusions/review, historical reconciliation and strict provider time in both D2 modes: PASS. With an active seed and no destination, service-role live claim returns an empty array. Lint: PASS with the existing Sidebar image warning.
- Existing 097/100/102/103 upgrade checks now accept only this exact extra row (shared full readback), retain every prior state/security assertion and require ledger 106. Reconciliation repair acceptance stays pinned to fresh 105 and applies the exact 105 SQL/ledger entry for its isolated 104→105 test, then cleans up to current migrations. Its preservation assertion still permits no data change during 105.
- Required CI retains all existing app/database/security/concurrency/browser checks and adds `test:crm-h3-04-local` to local-database. The four streamed SQL invocations that now include shared readback use loopback psql `-f` so psql resolves the repository include; all assertions remain. CI/head/base/tested-merge evidence is bound in the exact implementation PR handoff; this file belongs to that tested tree and does not claim a self-referential commit SHA.
- Documentation relative links/anchors, source/authorization/manifest cross-check, secret scan and `git diff --check`: PASS. Exactly one focused author self-check completed: final migration/manifest/defaults, collision atomicity, append-only/ACL/RLS preservation, unchanged 104/105 functions, independent gate/dormancy, synthetic-only fixtures, CI include resolution and documentation boundaries inspected. No unresolved author finding. Required final-head CI result is recorded in the linked PR implementation handoff; no internal reviewer or independent review was performed.

## Initial CI evidence and targeted browser expectation correction

[PR #57](https://github.com/elforssa/english-hills-admin/pull/57), implementation head **`006e538097a34d77f389d14f2ed481c9912f22e2`**, base **`616ee7d37945ed79dc217ac9aef4e3b51b5dea45`**, implementation tree **`a0fe9b76bbc4a2c9c5a37695d16336791f4f0fa8`**. [Verify run 36996598134](https://github.com/elforssa/english-hills-admin/actions/runs/36996598134) checked out synthetic merge **`041e9bb9e180502ebc02ade4919e4997d03f9951`**, confirmed in both job checkout logs.

Initial results: app SUCCESS; all four historical upgrades, H3-04 fresh/stateful/constraints/immutability/security/dormancy, reconciliation repair fresh/stateful/concurrency/real HTTP, SQL regressions, both-D2 strict time and the 792-check CRM role matrix PASS. Local-database overall FAILED at the director browser fixture's old exact `Non vérifié` badge expectation; the rendered badge correctly read `Vérifié` with the active seeded contract. Later concurrency steps were skipped in that run. This failure is retained as historical evidence, not represented as a passing run or handoff readiness.

Targeted correction adds exact manifest preflight to the browser fixture and asserts `Vérifié` with no stale `Non vérifié` badge. All closed gate, blocked activation, disabled destination, cross-origin, role and payload/privacy assertions remain. No application change or guard weakening. Affected local browser regression and targeted diff check: PASS; the next PR head must pass every required CI job, including the previously skipped concurrency matrices. The final exact head and its CI run/merge are bound in the PR implementation handoff (avoiding a self-referential SHA for this evidence file); initial-head evidence above never approves a later head.

## Scope and release hold

**Production has not been changed by this task.** This branch implementation is not merged, deployed, Production verified or release approved. It inserts no operational eligibility policy/evidence/check, boundary, ownership, epoch, destination configuration, secret/reference, source/form/cohort, delivery or attempt. No live gate, cron activation or provider/network event is introduced. Local negative/stateful fixtures are synthetic acceptance data only.

No durable product invariant, schema/permission/security model, ADR decision or operational flow changes. Current state, architecture and the plan receive dated implementation/evidence pointers; historical observations remain intact. H3-05–08 and H4 remain outside scope. Merge/Production release hold persists: exact-head independent review must be commissioned by the owner in a separate task/session, followed by separate owner release approval and release/operator flow. Author self-check is not independent review or PR approval.
