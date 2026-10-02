# H3-04 contract seed — Production verified 2026-10-02

Tier 3 release/operator; scope is migration 106 and read-only acceptance only. H3-04: PRODUCTION VERIFIED. H3-05–08 and H4 remain separately gated; the overall H3 plan is not complete.

## Release authority and exact artifacts

[PR #57](https://github.com/elforssa/english-hills-admin/pull/57) reviewed head `142caca2c6f0158b60c6d260cc35735e3505ec68`, base `616ee7d37945ed79dc217ac9aef4e3b51b5dea45`, CI-tested merge `9ab6deb97b72e3dc6bc8484b8c76776cf6fc9009`. [Verify run 36998146811](https://github.com/elforssa/english-hills-admin/actions/runs/36998146811): app and local-database SUCCESS. [Independent exact-head review](https://github.com/elforssa/english-hills-admin/pull/57#issuecomment-5951476000): READY FOR FINAL REVIEW, no blocking findings. [Owner release approval](https://github.com/elforssa/english-hills-admin/pull/57#issuecomment-5951495827) explicitly binds this seed and app-first ordering; [earlier operator handoff](https://github.com/elforssa/english-hills-admin/pull/57#issuecomment-5951540286) stopped before database mutation.

Actual merge/current main `e3928b369c8790151771d7251aee7030289ec84f`, same tree as reviewed head: `e849c8f43f4dc53017360fffe72961ab5188794d`. Connected Vercel readback reconfirmed Production `dpl_6GX4CmHd9QxuGdZgdwJoNoj49X6k`, READY, exact merge source and `admin.english-hills.com` alias before mutation. Supabase target: `hopcezradkhrixwwswxn`.

Approved artifact: [106_crm_lifecycle_provider_contract_r4_seed.sql](../../../supabase/migrations/106_crm_lifecycle_provider_contract_r4_seed.sql), SHA-256 `74130de1e3e40d8f37181a7e92709ebce492def4fafa950b739390aff641ed97`. Reviewed migration bytes match merged source. [Revision-5 plan](../plans/crm-h3-technical-readiness.md) and [implementation acceptance](crm-h3-04-implementation-2026-10-02.md) are unchanged historical records.

## Execution and ledger

A protected existing owner-only Session Pooler credential was used privately with TLS, explicit project username/target, database `postgres`, 5-second lock timeout and 120-second statement timeout. No credential value appears in evidence. CLI 2.116.0 explicit `db push --db-url` with `--skip-vault` preserves numbered history; no linked bulk push, timestamp migration, seed/role inclusion or Vault update.

Dry-run returned exactly `migrations=[106_crm_lifecycle_provider_contract_r4_seed.sql]`, `seeds=[]`, `roles=[]`. Immediate preflight at **2026-10-02T11:45:12.449035Z** reconfirmed contiguous ledger 001–105, no extra version, empty contracts and all lifecycle activation inventory, healthy intake/reconciliation and closed gates. Applying only 106 completed successfully with exit code 0; database row `created_at` is **2026-10-02T11:45:19.813692Z**. No retry or ledger repair occurred.

Postflight at **2026-10-02T11:46:32.643331Z** verified exactly 106 ledger rows, contiguous string versions **001–106**, no other version, unchanged full row digests for 001–105, and final exact row:

```text
106 | crm_lifecycle_provider_contract_r4_seed
```

## Exact provider-contract readback

Exactly one provider-contract row exists total. All explicit fields compare equal to the approved fixture; dates/timestamps are compared as typed UTC values, and database-default created_at is finite and no later than readback. SQL NULL is preserved for deduplication_window_seconds.

```json
{
  "id": "7cf9833e-4f77-4335-b1ec-c047d9353f54",
  "active": true,
  "revision": 1,
  "event_map": {
    "lost": "Lost",
    "intake": "Intake",
    "converted": "Converted",
    "qualified": "Qualified",
    "not_qualified": "Not qualified"
  },
  "created_at": "2026-10-02T11:45:19.813692Z",
  "api_version": "v26.0",
  "approved_at": "2026-10-02T10:19:01Z",
  "verified_on": "2026-10-02",
  "contract_key": "eh_meta_crm_r4_v26_r1",
  "lead_id_only": true,
  "action_source": "system_generated",
  "evidence_urls": [
    "https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification",
    "https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api",
    "https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started",
    "https://developers.facebook.com/docs/graph-api/guides/secure-requests",
    "https://developers.facebook.com/documentation/facebook-login/guides/access-tokens",
    "https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events",
    "https://github.com/facebook/facebook-nodejs-business-sdk/blob/0d245ec888c1af38d68994fd7f2e24cd38abc82f/src/objects/serverside/user-data.js"
  ],
  "lifecycle_model": "r4_stage_entry",
  "required_constants": {
    "event_source": "crm",
    "lead_event_source": "English Hills CRM"
  },
  "uncertainty_policy": "no_uncertain_replay",
  "converted_event_name": "Converted",
  "qualified_event_name": "Qualified",
  "accepted_response_count": 1,
  "accepted_response_field": "events_received",
  "maximum_event_age_seconds": 604800,
  "deduplication_window_seconds": null
}
```

## Catalog, immutability and security

Read-only before/after catalog fingerprints matched for non-system schemas, relation definitions/owners/ACLs/RLS/options, columns, functions and their security attributes, triggers, constraints, indexes, RLS policies and default grants. No schema/function/table-definition or permission change occurred. The only reviewed SQL effect is the provider-contract insert plus the CLI ledger entry; ordinary concurrent inbound activity remains possible and is not frozen or exported.

Provider registry RLS remains enabled, with zero policies. `anon`, `authenticated` and `service_role` each have no direct SELECT/INSERT/UPDATE/DELETE/TRUNCATE privilege. Browser/application direct mutation remains unavailable. Both immutable triggers remain enabled (`O`): `crm_lifecycle_contract_append_only` before UPDATE/DELETE and `crm_lifecycle_contract_no_truncate` before TRUNCATE. Read-only Production function definitions retain unconditional append-only rejection, SQLSTATE 42501 and fixed `pg_catalog, pg_temp` search paths. No destructive Production probe was attempted. Exact-tree CI/local evidence above supplies the destructive negative cases.

## Dormancy and health

- Provider contracts: **1**. Policies, evidence, eligibility checks, epochs, boundaries, ownership, deliveries, attempts and all sharing-stop/identity/pending/retry audit inventory: **0**.
- Configured destinations: **0**; enabled destinations: **0**. `crm-lifecycle-primary`: inactive at `*/5 * * * *`, zero runs. Contract active=true is manifest usability only.
- Read-only Vercel Production environment-key metadata confirms `CRM_META_LIFECYCLE_LIVE_ENABLED` and `CRM_META_LIFECYCLE_TOKEN_EH_R4` absent. No credential was created/stored, no destination configured and no provider/Graph request sent.
- `crm-intake-primary` remains active at `*/5 * * * *`; five postflight cron-history entries succeeded; a final read-only health recheck at **2026-10-02T11:50:47.629240Z** also confirmed the post-migration **2026-10-02T11:50:00Z** run succeeded. Connected Vercel deployment-scoped intake logs show HTTP 200 and no 4xx in the selected window. Cron success proves the scheduler invocation; HTTP evidence is separately inspected.
- Reconciliation: zero active/stale leases and zero state errors; read-only aggregate last state update **2026-10-02T11:40:04.216473Z**. The final health recheck retained zero active/stale leases, zero state errors and zero deliveries/attempts. No customer payload was read/exported.
- Production app HTTP **200**; Vercel exact approved deployment **READY**. Connected grouped runtime-error query found no errors in the recent 15-minute window.

## Limits and closeout

This is point-in-time seed acceptance. No extra 30-minute observation was needed: current health is unambiguous and the seed introduces no live execution path. No claim of Meta receipt, optimization, future entitlement or activation is made. Production negative mutation tests were deliberately not repeated; verified catalogs and reviewed exact-tree local/CI evidence establish immutability/security. The comparison timestamp normalization was a local evidence formatting correction, not a database change.

No source/form/cohort configuration, policy/evidence/boundary/ownership/epoch, secret, live gate, scheduler enablement, delivery/attempt, H3-05–08 or H4 operation occurred. No recovery mutation is needed. The immutable seed stays unused while independent gates remain closed. Documentation closeout is separate from the released source and does not authorize merge/deployment.

Documentation closeout (2026-10-02) checked this dated record against the preserved sanitized release snapshots, migration digest, approved manifest fixture and PR #57 implementation/review/release evidence. It performs no new Production acceptance or mutation. H3-05 Entitlement and dedicated secret is the next gated step; its own operator approval and fresh preflight remain required. The overall revision-5 plan remains active.
