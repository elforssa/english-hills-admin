# RCC-B1 Production release record — 2026-10-08

Release record for [RCC-B1](../plans/completed/rcc-b1-responsive-opportunities.md) (Tier 2, presentation only), a child of [RCC-r1](../plans/completed/rcc-r1-receptionist-crm-completion.md#rcc-b1--responsive-opportunities-presentation). It records what was released and observed. Product rules live in [PRODUCT_RULES](../../ai/PRODUCT_RULES.md); the current register is [CURRENT_STATE](../../ai/CURRENT_STATE.md).

## Release identity

| Item | Value |
| --- | --- |
| Architecture revision | B1-r3 |
| Pull request | [#115](https://github.com/elforssa/english-hills-admin/pull/115) |
| Reviewed and approved head | `73b3826395b4af184e4d724bdfbb705c097230a1` |
| Base (`main` before the merge) | `e56a70b3f83ff1b948b5e68c9f70be780dff6e08` |
| Merge method | Merge commit, guarded with `--match-head-commit` on the reviewed head |
| Merge SHA (new `main`) | `b278d4ca348447a9a20aefeb6d8c3fafab13a312` (parents: base, reviewed head) |
| Exact-head CI | Verify run [37732507087](https://github.com/elforssa/english-hills-admin/actions/runs/37732507087), success |
| Independent Tier-2 re-review | [Review comment](https://github.com/elforssa/english-hills-admin/pull/115#issuecomment-6053587429), verdict **READY FOR FINAL REVIEW**, applied to the exact reviewed head |
| Owner release approval | 2026-10-08: merge at the exact head, the resulting automatic Vercel Production deployment, bounded read-only verification and this closeout. It excluded migrations, Production data mutation, synthetic Production CRM records, Meta/lifecycle activation, provider changes, new features, D6, timezone hardening and the director learner-link correction. |

## Pre-merge gates (all passed, no drift)

- PR head was still exactly the reviewed head; `origin/main` was still exactly the base.
- Verify run 37732507087 was complete and successful on the reviewed head.
- The PR was open, not draft, `MERGEABLE`, merge state `CLEAN`.
- The READY FOR FINAL REVIEW verdict names this exact SHA.

## Deployment

| Item | Value |
| --- | --- |
| Vercel Production deployment | `dpl_CqtdvAWUwNmtVTByFaQqBBv5zKcs` (`english-hills-admin-2l5f2fsun-english-hills-projects.vercel.app`) |
| State | READY, target `production` |
| Source commit | `b278d4ca348447a9a20aefeb6d8c3fafab13a312`. GitHub records one Production deployment (id 6928677317) on that SHA, and the `Vercel` commit status on it is `success` and links to this deployment. |
| Alias | `admin.english-hills.com` (also `english-hills-admin.vercel.app`) |
| Created | 2026-10-08 06:17:49 UTC |

### Rollback target (recorded before the merge)

Vercel Production deployment `dpl_D4Tc8g1P8QwnBmZwY8DZkNDPMTFd` (`english-hills-admin-37dsier2c-english-hills-projects.vercel.app`), source `e56a70b3f83ff1b948b5e68c9f70be780dff6e08`, READY, then aliased to `admin.english-hills.com`. No rollback or promotion was performed or is needed. A UI rollback does not touch the database, and this release has no database change.

## Bounded Production verification (read-only)

Performed 2026-10-08 within minutes of the deployment becoming READY. No Production record was created or modified.

| Check | Result |
| --- | --- |
| `https://admin.english-hills.com/` unauthenticated | 307 to `/login?returnTo=%2F`, with the expected security headers (CSP, permissions policy, referrer policy) |
| Auth gate on the CRM route | Unauthenticated `/crm/leads` redirects (307) to `/login?returnTo=%2Fcrm%2Fleads`, the normal auth flow |
| `/login` | 200 |
| Serving the merge SHA | The aliased deployment is the one built from `b278d4c…`, as above |
| Vercel runtime errors | `vercel logs … --level error` on the new deployment found none for the window since the deployment became READY |
| Migration ledger | 001–112, 112 rows, highest version `112`. No B1 migration exists: the diff of `supabase/` between the base and the merge SHA is empty, and the latest file in `supabase/migrations` is `112_crm_rcc_a2_enrollment_ux.sql`. |
| Lifecycle/Meta dormancy | Zero activation epochs, pending intents, eligibility checks, identity links, sharing stops, retry audits, Meta sync runs and Meta objects; one seeded provider contract, as before; `crm-lifecycle-primary` cron inactive with zero runs in the previous 24 hours; `crm-intake-primary` active |
| Schema | 185 functions in `public`; no migration was applied. The read used `select` statements only. |

## Limitations

1. **No authenticated real-staff Production walkthrough was performed by this release session.** The receptionist/owner will perform the operational walkthrough of the responsive Opportunities workspace separately. Browser acceptance of the layout remains the exact-head CI and local Chromium/WebKit evidence in the [implementation record](../plans/completed/rcc-b1-responsive-opportunities.md#implementation-record).
2. Runtime-error inspection covered the Vercel logs of the new deployment only, over a short window after release. It did not include Supabase log queries.
3. No synthetic Production CRM record was created, by instruction. The UI was therefore not exercised against Production data.

## Deferred items (unchanged by this release)

D6 follow-up consolidation, browser `casablancaInstant` reliability, the Director correction tool for wrongly linked learners, Nouvelle pré-inscription duplicate risk, and a possible intermediate sidebar / icon rail. See the [OWNER_DECISIONS backlog](../../ai/OWNER_DECISIONS.md#deferred-backlog-after-rcc-r1).
