# Lead ad source on the CRM panel — architecture and implementation, revision LAS-r1

**Status: APPROVED FOR IMPLEMENTATION (owner, in chat, 2026-11-03, verbatim "approve ad names"; [approval record](#approval-record)). IMPLEMENTED on branch `feat/crm-lead-ad-source` with migration `126_crm_lead_ad_source.sql` ([implementation record](#implementation-record)); not merged, not deployed, not applied in Production.** Tier 3: one migration that re-creates a reception-visible read, and a new reception-visible field class (advertising names). Baseline: `origin/main` `3cc686ce2d36f8b16dc7c4eb63270063b67213ae`, Production migration ledger 001–125 ([CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries)); next free migration number 126, verified against `origin/main` and the open PRs (#121, #140) at implementation.

# Owner summary

## What will change

On the CRM lead panel, under « Dernière demande » (and under « Première demande » when it differs), reception sees which Meta campaign, ad set and ad brought the inquiry, as readable names: « Publicité · *ad set* › *ad* », followed by the campaign name in small muted text. Nothing is shown when the names are unknown.

- **Instant Form leads** show the names stored at intake or filled by the attribution enrichment released with migration 115.
- **Website leads** carry Meta ids in their UTM fields since the website release of 2026-11-03 (eh-website PR #13: `utm_campaign` = campaign id, `utm_term` = ad set id, `utm_content` = ad id). The names are looked up when the panel is opened, in the Insights objects that the Meta connection already syncs every 30 minutes. The stored row is not changed: migration 087 keeps website values as observations.

## What staff/users will be able to do

Reception, admin and director read the names on the panel they already use. Nothing else changes: no new page, no filter, no analytics per ad set or ad, no change to the lead list card.

## What remains restricted

- Raw UTMs, `fbclid`, `fbc`, `fbp`, landing page, referrer, raw payload and consent evidence never leave the database through this read; the response holds only the three names and the three ids.
- The director-only technical attribution read is unchanged. Teachers, families and learners see nothing new; the other-role denial is unchanged (`42501`).
- No token is read, no Meta call is made, no row is written.

## UI impact

One or two extra lines in the « Demande » section of the lead panel, French, wrapping on phones.

## Database impact

One forward migration, `126_crm_lead_ad_source.sql`: `create or replace` of `crm_get_operational_acquisition_summary(uuid)` (same signature, SECURITY DEFINER, fixed `search_path`, `require_reader(false)`, the 107 revoke/grant pattern) and one private resolver `crm_security.inquiry_ad_source(uuid)` with no API grant. No table, column, policy, trigger or row changes.

## Important security decisions

- **A new reception-visible field class.** Campaign, ad set and ad names were excluded from reception in Outcome 3 ([O3-r2](completed/outcome-3-receptionist-workspace.md)), which reserved them for a future field-level decision. The owner took that decision on 2026-11-03. Only names and ids are exposed; the technical fields listed above stay out, and the fixed server-side projection stays (no broad object is fetched and filtered in the browser).
- **Resolution by id only.** Website values are used only when they are 16 to 20 digits and match a synced object of a Meta connection; the match order is ad, then ad set, then campaign (see [Design](#design)). No matching by name, time proximity or click id.

## Rollout risk

Low. The read is additive inside its existing envelope; a failure of the read hides only its own lines (existing behaviour). Release: migration 126 first, then the application; rollback by re-creating the 107 body (restore script not needed: the 107 text is in the repository).

# Design

## Read

`crm_get_operational_acquisition_summary(p_lead uuid)` keeps `first_inquiry` and `latest_inquiry`, each with the unchanged `channel`, `source_label` and `occurred_at`, and adds `ad`: either `null` or `{campaign_name, adset_name, ad_name, campaign_id, adset_id, ad_id}` (six keys, each possibly null).

## Resolver

`crm_security.inquiry_ad_source(p_submission uuid)` reads the submission's attribution row (not redacted) and answers by provider:

- **`meta` (Instant Form):** the row's `campaign_id`, `adset_id`, `ad_id` and the three `*_name_snapshot` columns.
- **`website`:** only values matching `^[0-9]{16,20}$`, resolved against `crm_meta_objects` joined to `crm_integration_connections` with `provider = 'meta'` (the newest synced row wins when two connections hold the same id):
  1. the ad named by `utm_content`; if found, its parent ad set and that ad set's parent campaign (by `parent_external_id` on the same connection), ignoring `utm_term` and `utm_campaign`;
  2. else the ad set named by `utm_term` and its parent campaign;
  3. else the campaign named by `utm_campaign`.

  Names are `current_name`. A value that is not 16 to 20 digits or matches no object gives null fields; an object whose parent is not synced leaves the parent fields null.
- **`manual`, missing or redacted row:** null.

All six fields null gives `ad: null`.

## Panel

[LeadDetailSheet](../../../src/components/crm/LeadDetailSheet.jsx) renders `AdSource` under each displayed inquiry line through the pure helper `adSourceLabel` ([presentation.mjs](../../../src/lib/crm/presentation.mjs)): « Publicité · *adset_name* › *ad_name* » with only the parts present, the campaign as a small muted suffix; the campaign alone when no ad set or ad name exists; nothing when the object has no name (ids alone never show).

# Tests

- `scripts/test-crm-lead-ad-source.sql` (rollback-only, CI `sql-and-concurrency` shard): envelope keys unchanged plus `ad`; website resolution (a), (a) with an unsynced parent, (b), (c), non-digit / 15-digit / suffixed / unknown / 20-digit / 21-digit values; Instant Form snapshots; empty, manual, absent and redacted rows; latest inquiry resolved on its own; no technical key or value in any response; director, admin and receptionist read it, the four other roles are denied; the resolver has no API grant and the read keeps its 107 grant.
- `scripts/test-crm-lead-ad-source-upgrade.mjs` (stateful 125 → 126, CI `upgrades-from-112-to-116` shard): exactly one body replaced with its posture, owner, grants and return type intact, exactly one private function added, nothing else in the catalog moved, no row rewritten, acceptance green on the upgraded state.
- `scripts/test-crm-lead-ad-source.mjs` (in `npm test`): the label helper and the panel structure.
- `scripts/test-crm-opportunities.sql` updated for the added key; `scripts/test-ui-foundation-browser.mjs` asserts the rendered line from a mocked read.

# Out of scope

The lead list card, analytics per ad set or ad, any change to stored attribution rows, intake, the finalizer, the enrichment, lifecycle, the B1/B2 analytics and the cohort read.

# Release steps (for the release session; each needs its own approval)

1. **R0** read-only: Production ledger is 001–125 and the two function bodies match the 107 text.
2. **R1** apply migration 126 through the [guarded release wrapper](../../ai/WORKFLOWS.md#guarded-release-wrapper); verify the ledger row 126, the two catalog entries (posture and grants as in the upgrade rehearsal) and no row change.
3. **R2** merge the PR; Vercel deploys the application.
4. **R3** read-only check: open one website lead and one Instant Form lead on the panel as reception and read the names; record the closeout in [CURRENT_STATE](../../ai/CURRENT_STATE.md).

# Approval record

- **Approved by:** the owner, in chat, **2026-11-03**. Verbatim: "approve ad names".
- **Scope approved:** the architecture above (migration + panel), implementation in one PR, local tests, CI. **Not approved:** merge, migration deployment, application deployment, any Production read or write; each needs its own approval.
- **Tier:** 3.

# Implementation record

**Status: IMPLEMENTED ON A BRANCH — not merged, not deployed.** Branch `feat/crm-lead-ad-source`, PR #178, migration `126_crm_lead_ad_source.sql`.

- Files: `supabase/migrations/126_crm_lead_ad_source.sql`; `src/lib/crm/presentation.mjs` (`adSourceLabel`); `src/components/crm/LeadDetailSheet.jsx` (`AdSource`); tests listed above; `.github/workflows/verify.yml` (two CI steps); `package.json` (`npm test`); documentation ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#lead-ad-source-on-the-crm-panel--approved-2026-11-03), [SECURITY_RULES](../../ai/SECURITY_RULES.md), [CURRENT_STATE](../../ai/CURRENT_STATE.md#lead-ad-source-on-the-crm-panel--implemented-not-merged-2026-11-03), the [plans index](README.md) and the [feature index](../FEATURE_INDEX.md)).
- Local evidence (default local Supabase, synthetic data, 2026-11-03): migration 126 applied on a fresh reset (ledger 126); `scripts/test-crm-lead-ad-source.sql` PASS; `scripts/test-crm-opportunities-local.mjs --regressions` PASS; stateful 125 → 126 rehearsal PASS; `npm test`, `npm run lint`, `npm run build` and the CI routing regressions PASS (see the PR handoff for the exact head SHA and CI run).
- Known unrelated failure: `scripts/test-crm-phase4.mjs` (not wired into `npm test` or CI) already fails on `origin/main` after the Batch H clock change; left untouched.
