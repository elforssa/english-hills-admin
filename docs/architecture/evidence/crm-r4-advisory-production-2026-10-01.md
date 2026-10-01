# PR 47 advisory R4 dormant Production verification — 2026-10-01

**PRODUCTION VERIFIED — DORMANT.** Tier 3 release/operator task, verified on 2026-10-01 at 19:05 Asia/Shanghai (11:05 UTC). Documentation closeout is a separate reviewable change; its merge/deployment is not authorized by this release.

## Approval and exact source

Owner release approval in the release chat covers only [PR #47](https://github.com/elforssa/english-hills-admin/pull/47), reviewed head `f823b62a3bb06d40b1f572927bfa2af60fd4c857`, and [migration 103](../../../supabase/migrations/103_crm_meta_funnel_r4_advisory_d2.sql). The [durable independent re-review record](https://github.com/elforssa/english-hills-admin/pull/47#issuecomment-5929906302) records READY FOR FINAL REVIEW, no remaining findings/test blockers and all three prior findings resolved. Approved architecture is PR #46 at `c404815c5539f1651f7f87274f6ff345a45237ff`, including the [advisory contract](../plans/completed/crm-meta-funnel-r4-d2-advisory.md) and [sharing-stop contract](../plans/completed/crm-meta-funnel-r4-sharing-stop-contract.md).

Pre-mutation main/base and Production source were `f38cf512e968df68e8dde2cf2bc425ee6ddac9db`; PR head was unchanged and mergeable. [Verify run 36843888679](https://github.com/elforssa/english-hills-admin/actions/runs/36843888679) passed app and local-database. Tested synthetic merge `c51cfd8d173d65433c0f546b9d778fce00163161` and actual merge `02ffccab1519c0b381196ef9e5f938a908fdd105` share tree `e8d11cf07b2a1053007b9a411f5e16427791aecf` and the exact approved base/head parents. Required local fresh/stateful upgrade, role, browser, safety/retention and forced concurrency evidence was reused from the [implementation record](crm-r4-advisory-implementation-2026-10-01.md) and exact-SHA CI.

## Safe execution order and recovery

Refreshed Production ledger was exactly 001–102. Contracts, policies, evidence, epochs, boundaries, ownership, deliveries, attempts and enabled destinations were zero. Lifecycle cron was inactive; Production `CRM_META_LIFECYCLE_LIVE_ENABLED` was absent. The explicit-target CLI dry-run identified only 103, no seeds or roles; Vault updates were excluded.

Used repository-enabled merge-commit strategy, deploying disabled compatible application code first. Lifecycle remained unused with closed gates during the code-before-schema window. Waited for [Vercel deployment dpl_F1ssJLmdSmNELVbGvBunawfLAZcK](https://vercel.com/english-hills-projects/english-hills-admin/F1ssJLmdSmNELVbGvBunawfLAZcK) to be Production READY from actual merge `02ffccab1519c0b381196ef9e5f938a908fdd105`, with `admin.english-hills.com` and `english-hills-admin.vercel.app` attached. Then applied only 103 through Supabase CLI 2.116.0 to the explicitly verified project `hopcezradkhrixwwswxn`, with `--skip-vault`, 5-second lock timeout and 120-second statement timeout. No linked bulk push, provider seed, roles or credential/configuration change occurred.

Previous READY source rollback candidate was `dpl_5fCsiheXfwmpVjQEjgCLWBzYUHzt` at the pre-release main SHA. Recovery keeps external gates closed, preserves history and uses reviewed forward database repair; source rollback alone cannot undo database effects. No failure/recovery operation was needed. No migration ledger repair or normalization was performed.

## Production acceptance

- Ledger is exactly 001–103, with `103 | crm_meta_funnel_r4_advisory_d2`, 124 recorded SQL statements. Reviewed SQL SHA-256: `8c0e5ca82f3fcc58b7e41a5e30e2880f9269a55d940164022923b14ce2d1876a`. Migrations 001–102 were unchanged in the source manifest.
- All 63 created/replaced reviewed function bodies match Production `pg_proc.prosrc` hashes, with zero mismatches. Policy `d2_requirement` is NOT NULL, default `required`; historical required-mode semantics are preserved.
- All seven new stop/audit/handoff/carry/exclusion/identity/pending tables have RLS enabled and no direct SELECT/INSERT/UPDATE/DELETE access for anon, authenticated or service_role. Pending-stop retrieval allows authenticated execution only, with stored director authorization inside the RPC. Read-only probes denied anon/service_role execution and an authenticated session without a trusted actor. Stored-role database probes allowed the existing director (zero pending rows) and denied receptionist/admin; teacher/parent/student profiles were unavailable, so their coverage remains exact-tree local/CI evidence.
- Contracts, policies, evidence, epochs, boundaries, owners, deliveries, attempts, sharing stops and enabled destinations remain zero. `crm-lifecycle-primary` remains `*/5 * * * *`, inactive, with zero cron runs. Server live gate and lifecycle scheduler token remain absent in Production environment inventory. No outbound Meta event occurred through this dormant release.
- Existing `crm-intake-primary` remains active at `*/5 * * * *`. The post-migration 11:05 UTC run succeeded; the released deployment served its intake request with HTTP 200. Reconciliation remained without errors. Vercel runtime error scan found no errors in the 15-minute release window.

No Production customer payload, identity export, test prospect, payment, conversion or synthetic lifecycle record was created for acceptance. Full real-account director/receptionist/other-role browser behavior, finance/conversion and provider payload/races reuse exact-tree local/CI evidence; Production probes were deliberately bounded and read-only. No live provider test or H3/H4 acceptance was performed or implied.

## Closeout and remaining holds

Advisory-D2 implementation and dormant rollout are COMPLETED; both fulfilled implementation contracts are archived under `plans/completed`, with relative links repaired. CURRENT_STATE, architecture/product/security/workflow summaries, ADR-004, feature index and implementation evidence link this dated Production record. Earlier dated not-merged/not-deployed statements remain historical and are superseded by this record.

Provider-contract seed, Meta configuration/credentials, H3 execution and H4 activation remain unauthorized and blocked. New prospective cohort/form/mapping/policy/boundary, provider entitlement and live gates require their own reviewed owner-approved operator scope. This dormant release grants no permission to publish/activate them. Documentation closeout remains a separate reviewable change and must not auto-deploy.
