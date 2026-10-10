# Director CRM & Growth Intelligence — Outcome B: campaign attribution, CPL/CPQL/CAC and the funnel by program

Revision **DGI-B-r1**, 2026-10-10. **Tier 3** (conversion/attribution integrity, a migration that enriches existing Production attribution rows going forward, the external-provider intake path, a service-role worker). **Status: PROPOSED — architecture only, not approved, nothing implemented, no migration applied, no Production write.** Owner: Maroine. Baseline `origin/main` at authoring: `86d2e5b` (PR #131 merge, DGI-A closeout). Architecture branch: `claude/dgi-b-architecture-477947`. Parent plan: [Outcome A (shipped)](director-growth-intelligence.md). Planned, implemented, merged, deployed and Production-verified are distinct states.

Owner decisions already taken for B (restated from the commission, not re-asked): CPL, CPQL and CAC by campaign with the funnel beside them; the funnel split by program read from existing CRM data; attribution fixed **going forward only**, old leads stay "attribution inconnue"; extend `/crm/analytics`, no new page, no goal tracker; spend and ratios in USD, revenue in MAD, no ROAS, no conversion; follow-up health is Outcome C.

# Owner summary

## What will change

- **New Meta leads will carry their campaign.** Today every Meta lead stores the ad ID but never the campaign ID, so the report groups them all under "Meta · attribution inconnue" and CAC shows "–". Release B1 resolves the campaign and ad set from the ad hierarchy that the live Insights sync already stores in the database (every lead ad ID seen so far is present there), without any new Meta call, token or permission. Leads created before the switch is turned on are never touched.
- **CPL, CPQL and CAC per campaign become real numbers** for leads acquired after the switch, in USD, with the existing report columns.
- **A funnel appears beside the cost figures** (Release B2): prospects → contactés → qualifiés → tests réservés → tests passés → inscrits, with stage-to-stage rates, for the whole cohort and per campaign row.
- **A program view** (Release B2): the funnel grouped or filtered by the lead's `session_type` (Yearly, Adults, Summer Camp, …). This is the only program field the CRM has; it is filled from the form mapping's default when the form has no program question, so today it equals "one form = one program". No new program model is invented.
- **Unknown attribution gets two honest labels:** "Meta · attribution inconnue" (old leads, organic leads without an ad ID) and "Meta · attribution en attente" (new leads whose ad is not yet in the Insights snapshot, resolved automatically within about one Insights refresh).

## What staff/users will be able to do

- Directors read the per-campaign cost and funnel figures and the program split in the existing `/crm/analytics` page.
- Nothing changes for receptionists, admins, teachers, parents or students.

## What remains restricted

- Director-only, as today, at route, API and database level. No receptionist analytics access.
- Spend is never attributed to website, manual or unknown-Meta leads, never by campaign name, UTM or `fbclid`, and never split by program.
- No ROAS, no USD→MAD conversion, no goal gauge, no follow-up health, no historical re-attribution, no new page, no new Meta permission or token use.

## UI impact

`/crm/analytics` only: a funnel block under the summary cards, one "Contactés" column in the performance table, "Programme" in the grouping select, a program filter, the two unknown-attribution labels and one explanatory line when the program filter suppresses spend. Lead detail pages are unchanged.

## Database impact

Two additive, forward-only migrations (next free numbers at implementation; 115 and 116 today): B1 adds two nullable columns on `crm_submission_attribution`, an `attribution_enrichment` setting on the Meta connection, one private resolver, one service-role sweep RPC and a small cohort/diagnostics change; B2 replaces the cohort reporting RPC with a version that adds the funnel counts, the program grouping and the program filter. No table, policy or grant is widened; no existing non-NULL value is rewritten; the attribution immutability trigger stays in force.

## Important security decisions

- Attribution is enriched **from data already in the database**, written only by the service-role worker path, gated by a director-set switch with a database-set start timestamp; the intake Page token and the Insights token are not used for anything new.
- Only NULL fields may be filled (the existing `crm_security.protect_attribution` trigger enforces this); redacted rows are never touched; no activity, lead or submission row changes.
- The resolver matches on the lead's own provider-returned ad ID and the same connection; never on names.
- All new reads stay `require_reader(true)` (stored role `director`); the sweep RPC is service-role only and returns counts.

## Risks / owner review points

1. **Why the campaign is lost today is inferred, not observed.** The code swallows the error of the ad lookup. The in-database design works regardless of the cause, but the optional repair of the provider lookup needs a token test (owner decision 6).
2. **Program = form default.** With one Meta form, the program split will show one program until forms carry a program question or there is one form per program (owner decision 3).
3. **Small numbers.** Today's Production cohort has 41 Meta leads, 1 qualified, 0 tests, 0 conversions; the funnel will show mostly zeros and "–" until the pipeline moves. Zero denominators always show "–", never 0.
4. **Old leads stay unknown by decision,** although the data would allow resolving the 4 ad IDs already seen (owner decision 4 confirms).
5. **Migration numbers** 115/116 collide with the parked PRs #121 and #124 (provisional 114/115), which must renumber when restarted.

## Baseline and evidence limits

- Repository: `origin/main` `86d2e5b` fetched 2026-10-10; branch fast-forwarded to it before authoring.
- Production reads: twelve read-only count queries were run on 2026-10-10 through `supabase db query --linked --project-ref hopcezradkhrixwwswxn` under `set transaction read only` (proven `on`); the CLI printed its standard "Initialising login role" line. Every query and its result is listed under [Production reads performed](#production-reads-performed-2026-10-10). Results are counts, states and dates only; no name, phone, e-mail, token, secret reference or ad-account ID was selected.
- Provider documentation: the Meta Page webhook reference and the Lead Ads retrieval guide were read on 2026-10-10 (see [Provider facts](#provider-facts-read-2026-10-10)); the Lead node reference pages returned 404 on both candidate URLs. **No Meta API call was made.**
- Owner-supplied deployment evidence in CURRENT_STATE is reused, not independently re-verified.

## Verified current state

### Q1 — Why the Meta leads have no campaign ID (whole path)

| Step | What happens | Evidence | Fact / assumption |
| --- | --- | --- | --- |
| Meta webhook `leadgen` | Meta's notification value carries `ad_id`, `adgroup_id`, `created_time`, `leadgen_id`, `page_id`, `form_id`. | [Page webhook reference](https://developers.facebook.com/docs/graph-api/webhooks/reference/page/) read 2026-10-10 | Fact (provider doc) |
| Webhook parser | `parseEvents` keeps only `page_id`, `leadgen_id`, `form_id`, `created_time`; `ad_id`/`adgroup_id` are discarded. | [protocol.mjs:45–61](../../../src/lib/crm/meta/protocol.mjs) | Fact |
| Reconciliation (the live path; realtime is disabled) | Lists form leads with `fields=id,created_time,form_id,ad_id,field_data` but enqueues only `page_id`, `leadgen_id`, `form_id`, `created_time`. | [reconcile.mjs:4,34–35](../../../src/lib/crm/meta/reconcile.mjs); [086:111](../../../supabase/migrations/086_crm_meta_ingestion.sql) accepts exactly those keys | Fact |
| Worker, lead retrieval | `GET /<leadgen_id>?fields=id,created_time,form_id,ad_id,field_data` with the connection's `CRM_META_PAGE_TOKEN_*`; `ad_id` is kept when it is a provider ID. | [adapter.mjs:41–49](../../../src/lib/crm/meta/adapter.mjs) | Fact |
| Worker, ad lookup | `GET /<ad_id>?fields=id,name,campaign{id,name},adset{id,name}` with the **same token**; **any failure is swallowed** (`catch {}`), leaving `ad = null`. | [adapter.mjs:50–56](../../../src/lib/crm/meta/adapter.mjs) | Fact |
| Normalisation | `campaign_id`/`adset_id` are taken only from the ad lookup; with `ad = null` they are NULL and `attribution_status = 'partial'`. The unit test proves a 403 on the ad lookup yields `partial`. | [adapter.mjs:58–74](../../../src/lib/crm/meta/adapter.mjs); [test-crm-phase8.mjs:57–58](../../../scripts/test-crm-phase8.mjs) | Fact |
| Storage | `crm_finalize_meta_job` stores the attribution as normalised; the protection trigger allows NULL fields to be enriched later and forbids overwriting non-NULL ones or touching redacted rows. | [094:174–177](../../../supabase/migrations/094_crm_meta_reconciliation.sql); [078:297–327](../../../supabase/migrations/078_crm_core_schema.sql) | Fact |
| Reporting | A Meta lead without `campaign_id` gets `advertising_key = NULL` → bucket `unknown:meta_instant_form` → "Meta · attribution inconnue", `attribution_kind = 'unattributed'`, no spend, no ratios. | [114:117–121, 132, 157, 163–164](../../../supabase/migrations/114_crm_meta_insights_live_sync.sql) | Fact |
| Production counts | **41** Meta attribution rows (2026-09-28 → 2026-10-09), all `partial`, **41 with `ad_id`, 41 with `form_id`, 0 with `campaign_id`, 0 with `adset_id`**, 41 whose `raw_payload` contains `ad_id`, 0 redacted, 1 distinct form. All 41 ingestion jobs `done` with no error code. | [Production read R2, R8](#production-reads-performed-2026-10-10) | Fact |
| Where it is lost | Exactly at the ad lookup: Meta returned `ad_id` for every lead, and the second call never produced a campaign. | R2 + code above | Fact (by elimination) |
| Why the ad lookup fails | Not recorded anywhere (the error is discarded). The ingestion contract describes the token as a "Page/System token"; reading an ad node needs an identity with ad-account access and `ads_read`/`ads_management`, which a Page-scoped token does not carry. | [crm-meta-ingestion.md](../../crm-meta-ingestion.md#runtime-and-secrets); [retrieval guide](#provider-facts-read-2026-10-10) | **Assumption**, must be tested (decision 6) |
| "32 leads" | The page's default range is the current month ([MarketingAnalytics.jsx:17–18](../../../src/components/crm/MarketingAnalytics.jsx)); 41 is the all-time count. The 32 is read as the October cohort. | code + R2 | Assumption |
| Hierarchy already in the database | The Insights snapshot holds 172 ad/day rows for 3 campaigns and 11 ads (2026-09-13 → 2026-10-10); `crm_meta_objects` holds 13 campaigns, 19 ad sets and 44 ads with `parent_external_id`. **All 4 distinct lead ad IDs exist in the snapshot.** The intake connection and the Insights connection are the same row. | R10, R11, R9; [089:6–11](../../../supabase/migrations/089_crm_meta_insights_and_reporting.sql) | Fact |

### Q2 — Resolving the leadgen ID to campaign/ad through the Meta API

- The lead's `ad_id` is already retrieved with the intake token (fact, Q1). The missing step is ad → campaign/ad set.
- Reading `/<ad_id>?fields=campaign{id,name},adset{id,name}` is a Marketing API object read. It needs `ads_read` (or `ads_management`) on an identity that has the ad account assigned. The Insights System User token (`CRM_META_INSIGHTS_TOKEN_EH_KAL`) is exactly that: `ads_read`, KAL account only ([closeout](../../ai/CURRENT_STATE.md#dgi-a-live-meta-insights-sync-production-closeout--2026-10-10)). **Expected to work; not tested** (assumption).
- Reading `/<leadgen_id>` itself requires lead access (`leads_retrieval`, Page permissions, Leads Access Manager) per the retrieval guide; the Insights token does not have it and does not need it. No lead-retrieval permission is needed for Outcome B.
- **This plan needs no Meta call at all for B1:** the ad → ad set → campaign chain is resolved from `crm_meta_objects`, which the live sync upserts on every completed run ([089:95–97](../../../supabase/migrations/089_crm_meta_insights_and_reporting.sql)). Using the Insights token inside the intake worker would couple the two credentials (ADR-006 decision 2 keeps them separate) and is therefore only an owner option, not the design.
- **What must be tested if the provider lookup repair is wanted (decision 6):** (a) the intake token's type and scopes, read in Meta Business Settings or through the debugger (metadata only, no value shown); (b) one controlled `GET /<ad_id>?fields=campaign{id}` with the intake token, recording only the Graph error code; (c) the same call with the Insights token. Each is a Production/provider read that needs its own owner approval.

### Q3 — Website and manual leads today, and what CPL means for them

- Website submissions store observed `landing_page`, `referrer`, `utm_*`, `fbclid`, `fbc`, `fbp` with `attribution_status = 'partial'` (or `'unavailable'` when empty) and **never** `campaign_id` ([087:290–295](../../../supabase/migrations/087_crm_website_ingestion.sql)). Manual submissions have no attribution row at all (R2 lists only `meta` and `website` providers; manual creation at [080:242](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql) inserts the submission only).
- In the cohort RPC they fall into `unknown:website` / `unknown:manual` ("Site web · attribution observée", "Saisie manuelle / téléphone / recommandation"), `attribution_kind = 'unattributed'`, spend and ratios NULL; the page says so under the cards ([MarketingAnalytics.jsx:74](../../../src/components/crm/MarketingAnalytics.jsx)). Production: 1 website lead (NEW), 1 manual lead (LOST).
- **CPL for them is undefined and stays NULL.** The attribution rule in [D5](#d5--attribution-rule-what-may-carry-spend) makes this explicit so that no spend ever reaches them.

### Q4 — Stage/status model and whether a funnel can be built

- `crm_leads.status` is the **current** state only (`NEW → CONTACTING → ENGAGED → QUALIFIED → CONVERTED`, `LOST`, `NOT_QUALIFIED`; [078:131](../../../supabase/migrations/078_crm_core_schema.sql)).
- Every transition is a **timestamped activity** (`crm_activities.occurred_at`): `lead_created`, `contact_attempted` ([080:307](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql)), `conversation_recorded` ([080:289](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql)), `whatsapp_sent`/`whatsapp_conversation`, `lead_engaged` ([080:416](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql)), `lead_qualified` ([080:423](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql)), `placement_test_booked`, `placement_test_attended`, `placement_result_entered` ([083:81–91](../../../supabase/migrations/083_crm_placement_integration.sql)), `lead_converted` ([084:98–100](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql)). The closed list is in `crm_security.event` ([080:82–90](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql)).
- The cohort RPC already computes engaged, qualified, tests booked, tests attended, results and converted per bucket by cutoff ([114:134–140](../../../supabase/migrations/114_crm_meta_insights_live_sync.sql)); the page shows them as columns ([MarketingAnalytics.jsx:14](../../../src/components/crm/MarketingAnalytics.jsx)). **Missing:** a "contacted" stage and stage-to-stage rates.
- Production (R6, R7): event types present are `lead_created` 43, `contact_attempted` 2, `conversation_recorded` 2, `lead_engaged` 2, `lead_qualified` 2, `lead_lost` 1; no placement or conversion event yet. **A funnel can be built from existing data; it will be sparse until the pipeline moves.**

### Q5 — Program field and its completeness

- Fields: `crm_leads.session_type` (closed list of 8: Yearly, Adults, Summer Camp, Communication Junior, Communication Adult, One-to-One, Mise à niveau, Other; [078:129](../../../supabase/migrations/078_crm_core_schema.sql)) and `crm_leads.program_interest_text` (free text, required at intake). At intake both come from the form answer when the mapping maps a question, else from the mapping's `default_session_type` / `default_program_interest_text` ([form.mjs:31–32](../../../src/lib/crm/intake/form.mjs); [086:20–21](../../../supabase/migrations/086_crm_meta_ingestion.sql)).
- Production counts (R5, 43 canonical leads): `session_type` = Yearly **41** (all Meta), NULL **2** (website 1, manual 1). `program_interest_text` (lower-cased): "programme annuel" 41, "anglais annuel" 1, "formation entreprise" 1, NULL 0.
- Conclusion: **a usable program field exists (`session_type`)**, 95 % filled, but for Meta leads it is the form default (one form, two active mapping versions, R9), so the split is "per form" until a program question is mapped or forms are split per program. The smallest option is to use `session_type` as the program dimension with that caveat on the page, and to let the owner map a program question on the form when one exists. No new program model.

### Q6 — What CAC means here, what "enrolled" is, which payment signal confirms it

- Conversion is trusted only through the linked enrollment reaching `Confirmed`/`Validated`: `crm_security.evaluate_conversion` writes `lead_converted` with the enrollment, sets `CONVERTED`, `converted_at` and `conversion_activity_id`; a later downgrade flags `conversion_review_required` instead of deleting the conversion ([084:89–101](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql); [PRODUCT_RULES](../../ai/PRODUCT_RULES.md#conversion-and-finance)).
- The cohort RPC's `converted` already uses exactly `conversion_activity_id → lead_converted` by cutoff ([114:136](../../../supabase/migrations/114_crm_meta_insights_live_sync.sql)) and surfaces `review_required`.
- Payment is a separate fact: receipts → `financial_events.payment_recorded` → `crm_revenue_entries.amount_delta` with the lead and the frozen first-touch submission ([085](../../../supabase/migrations/085_crm_revenue_attribution.sql)). Payment may drive enrollment confirmation through the financial engine, but revenue and conversion stay separate.
- **CAC = spend / trusted converted leads of the campaign** (today's definition, kept). "Enrolled" = converted. The payment signal is shown beside it as a count (`converted_paid`: converted leads with at least one positive revenue entry by cutoff) and the existing MAD revenue column; whether CAC should instead divide by paid conversions is owner decision 2 (recommendation: keep converted).

### Q7 — Migration numbering

- Production ledger max version **114**, 114 rows (R1). Local `supabase/migrations` ends at `114_crm_meta_insights_live_sync.sql`. **Next free number: 115.**
- [PR #121](https://github.com/elforssa/english-hills-admin/pull/121) (head `26ec5bd7…`) carries `performance-session-context-114.md` and [PR #124](https://github.com/elforssa/english-hills-admin/pull/124) (head `b45cbf19…`) carries `performance-rls-initplan-115.md`; both are architecture-only docs PRs with provisional numbers. Premium retirement Release B also holds a provisional 114. **This plan does not touch them.** If B1 takes 115 and B2 takes 116, those three must renumber from the ledger and the open PRs when restarted (117 and later, or whatever is free then). Allocate the exact numbers at implementation from the ledger, never from this document.

### Existing capability versus missing capability

| Component | Exists | Missing for Outcome B |
| --- | --- | --- |
| Attribution storage | `campaign_id`, `adset_id`, `ad_id`, name snapshots, `attribution_status`, immutability trigger with NULL enrichment ([078:105–121](../../../supabase/migrations/078_crm_core_schema.sql)) | source of the hierarchy, lookup error code, an enrichment path |
| Ad hierarchy | `crm_meta_objects` with `parent_external_id`, upserted on every completed Insights run (089, 114) | a resolver from a lead's `ad_id` |
| Connection settings | `settings.meta_reconciliation` pattern with a database-set `started_at`; constraint `crm_connection_provider_shape` allows only that key ([094:3–14](../../../supabase/migrations/094_crm_meta_reconciliation.sql)); `crm_save_meta_connection` has no UI caller (operator calls the RPC) | an `attribution_enrichment` switch with the same pattern |
| Cohort RPC | director-only, no fan-out, buckets, engaged/qualified/tests/converted/revenue, NULL rules, USD/MAD handling (114) | `contacted`, `converted_paid`, program level/filter, pending-attribution bucket |
| Page | summary cards, denominators line, campaign → ensemble → annonce drilldown, Insights panels | funnel block, Contactés column, program grouping/filter, labels |
| Diagnostics | `crm_get_meta_diagnostics` (connections, mappings, jobs) and `crm_insights_diagnostics` | enrichment counters |
| Tests | Phase 8 unit, Phase 11 SQL/concurrency/browser and upgrade rehearsal, Phase 12 security matrix in CI | cases for the new columns, resolver, sweep, cohort v2, program rules |

## Provider facts (read 2026-10-10)

| Fact | Source | Confidence |
| --- | --- | --- |
| Page webhook `leadgen` value: `adgroup_id`, `ad_id`, `created_time`, `leadgen_id`, `page_id`, `form_id`; requires `pages_manage_metadata`. | [Page webhook reference](https://developers.facebook.com/docs/graph-api/webhooks/reference/page/) | Confirmed |
| "To read ad specific fields, such as `ad_id` or `campaign_id`": a Page or User access token with `ads_management`, `pages_read_engagement`, `pages_show_list` (and `pages_manage_metadata` for webhooks). "To retrieve all lead data and ad level data": adds `leads_retrieval` and `pages_manage_ads`. "The `leads_retrieval` permission is required to read leads." | [Lead Ads retrieval guide](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving) | Confirmed wording; the guide does not describe `campaign_name`, `adset_id`, `adset_name` or `platform` on the Lead object and lists `is_organic` only in the CSV export |
| Lead node field list (whether `campaign_id`/`campaign_name` can be requested directly on `/<leadgen_id>`) | both candidate reference URLs returned 404 | **Unconfirmed**; irrelevant to the in-database design, relevant only to decision 6 |
| The CRM's native System User (`English Hills CRM`, Admin) has the Page, the KAL ad account and the app assigned; its installed app lists `ads_read`, `leads_retrieval`, `pages_manage_ads`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`, `business_management` (2026-10-01 observation). Whether the Production `CRM_META_PAGE_TOKEN_*` value was issued by that identity, and as a Page or System User token, is **not recorded**. | [blocker evidence](../evidence/crm-h3-blocker-evidence-2026-10-01.md), [credential route A1/A4](../evidence/crm-h3-credential-route-2026-10-01.md) | Historical observation, not current proof |

## Scope and non-goals

**In scope.**

- **B1 — attribution capture:** record the ad-lookup outcome at intake; resolve campaign/ad set from `crm_meta_objects` at intake and in a bounded sweep after Insights runs, for leads created after a director-set start; the "en attente" bucket; diagnostics counters; tests; docs.
- **B2 — funnel and program view:** cohort RPC v2 with `contacted`, `converted_paid`, program grouping and program filter; the funnel block, column, select and labels on `/crm/analytics`; metric/NULL rules; tests; docs.

**Out of scope (non-goals).** Historical matching of leads created before the switch; any change to first-touch, conversion, finance or lifecycle functions; a new page; a goal/target tracker; ROAS or any currency conversion; website-to-Meta campaign matching by UTM/`fbclid`; a program model or a campaign-to-program convention; follow-up health (Outcome C); receptionist access; new Meta permissions, tokens or token reuse (decision 6 may add a separately approved token test); async reports; multi-account totals; `vercel.json`, middleware, role access, the files of PRs #120–#124.

## Design

### D1 — Record the ad-lookup outcome at intake (B1, code + columns)

- `retrieveLead` keeps its two calls but returns `{ lead, ad, ad_lookup_error }` where `ad_lookup_error` is the `MetaError` code of the failed ad lookup (`provider_auth`, `rate_limit`, `provider_unavailable`, `network`, `timeout`, `invalid_provider_data`) or `null`. The lookup stays optional: it never blocks intake ([adapter.mjs:50–56](../../../src/lib/crm/meta/adapter.mjs) semantics preserved).
- `normalizeLead` adds to `attribution`: `hierarchy_source = 'provider'` when the ad lookup produced a campaign and an ad set, else `null`; `hierarchy_error_code = ad_lookup_error`. `attribution_status` logic is unchanged.
- Migration B1 adds to `crm_submission_attribution`: `hierarchy_source text check (hierarchy_source in ('provider','insights_objects'))` and `hierarchy_error_code text check (hierarchy_error_code ~ '^[a-z_]{1,40}$')`, both nullable, no default, no backfill. `crm_finalize_meta_job` (cumulative 094 definition) stores them from the payload after the same allowlist validation it applies to the other attribution keys. The protection trigger needs no change: both columns are NULL on existing rows and may be filled once.
- Nothing is read from the webhook `ad_id`/`adgroup_id` (the realtime path is disabled and the lead retrieval already returns `ad_id`); `parseEvents` is unchanged.

### D2 — In-database hierarchy resolver (B1, private function)

`crm_security.resolve_meta_hierarchy(p_connection uuid, p_ad text) returns jsonb` (SECURITY DEFINER, `search_path=pg_catalog,pg_temp`, no API grant): reads `crm_meta_objects` for `(p_connection, 'ad', p_ad)`, follows `parent_external_id` to the `adset` row and then to the `campaign` row of the same connection, and returns `{campaign_id, campaign_name, adset_id, adset_name, ad_name}` only when the full chain exists with valid provider IDs; otherwise NULL. Names are the objects' `current_name` (they become the attribution's name snapshots at resolution time; `historical_names` in the report already tolerates differing names). The match key is the lead's own provider-returned `ad_id` and the connection; never a name.

### D3 — The switch and the start timestamp (B1, connection settings)

- `crm_integration_connections.settings` gains an optional `attribution_enrichment` object `{"enabled": boolean, "started_at": timestamptz|null}` beside `meta_reconciliation`. The constraint `crm_connection_provider_shape` is replaced (same text plus the new key, same size bound) so that existing rows remain valid.
- `crm_save_meta_connection` (cumulative 094 definition, same signature) accepts `attribution_enrichment: {"enabled": true|false}`; the database sets `started_at = clock_timestamp()` when enabling from disabled, keeps it while enabled, and clears it when disabling (exactly the reconciliation pattern, [094:48–71](../../../supabase/migrations/094_crm_meta_reconciliation.sql)). Callers cannot set or backdate `started_at`. Re-enabling later takes a fresh timestamp: leads from a disabled interval are never enriched afterwards.
- A helper `crm_security.attribution_enrichment_started(c crm_integration_connections) returns timestamptz` mirrors `meta_reconciliation_started`.
- **Eligibility of a row** = provider `meta`, `redacted_at IS NULL`, `campaign_id IS NULL`, `ad_id IS NOT NULL`, submission channel `meta_instant_form`, the submission's mapping connection `c` with `attribution_enrichment_started(c) IS NOT NULL`, and `provider_created_at >= started_at` (the lead was created at Meta after the switch). Leads before the switch are never eligible: this is the "going forward only" decision in code.

### D4 — Two resolution moments, no network (B1)

1. **At intake.** `crm_finalize_meta_job`, after inserting the attribution row and when the row is eligible, calls the resolver; on a hit it updates the NULL columns (`campaign_id`, `adset_id`, `campaign_name_snapshot`, `adset_name_snapshot`, `ad_name_snapshot` when NULL), sets `hierarchy_source = 'insights_objects'` and recomputes `attribution_status` (`complete` when campaign, ad set and all three names and the form name exist, else unchanged). Same transaction, same service-role path, no new grant.
2. **Sweep after Insights runs.** New service-role RPC `public.crm_enrich_meta_attribution(p_limit integer default 200) returns jsonb` (`{eligible, resolved, unresolved}`): selects up to `p_limit` eligible rows `for update skip locked` ordered by `provider_created_at`, applies the resolver per row, same update rule. Called once per tick by `runScheduledInsights` after the claims loop, only with the live gate open and only when at least 5 s of budget remain; its counts are added to the endpoint's counts-only response (`enriched`). The Insights scheduler runs every 30 minutes, so a lead whose ad was unknown at intake is resolved at most about one refresh interval (6 h) plus 30 min after the ad first appears in a completed run. No new cron job, no Vault value, no new endpoint.

The update goes through the existing trigger: NULL → value only; a row enriched once is never rewritten; redacted rows are skipped by eligibility; the trigger's `42501` on any violation aborts only that row's update inside the sweep (the sweep catches it, counts it as `unresolved` and continues).

### D5 — Attribution rule: what may carry spend

A report row (and the summary's Meta ratios) may carry spend **only** for leads that satisfy all of: first-touch submission channel `meta_instant_form`; attribution provider `meta`; the submission's mapping connection equals the selected Insights connection; `campaign_id` (or the ad set / ad ID for the chosen level) is non-NULL and was written either by the provider ad lookup (`hierarchy_source = 'provider'`) or by the resolver from the lead's own `ad_id` (`'insights_objects'`). Spend is grouped by the same ID from the Insights rows. **Never** by campaign name, form name, UTM, `fbclid`/`fbc`/`fbp`, program or time proximity. Website, manual, unknown-Meta and pending-Meta rows have `attribution_kind <> 'trusted_meta'` and `spend`, `cpl`, `cpql`, `cac` NULL. There is no blended "all spend / all leads" ratio (decision 5). This is the existing [Insights contract](../../crm-meta-insights.md#attribution-and-scope) with the resolver added as the second legitimate ID source.

### D6 — Unknown versus pending attribution (B1, cohort RPC)

In `crm_get_marketing_cohort` the per-lead bucket for a Meta lead without an advertising key becomes `pending:meta_instant_form` when the row is eligible under D3 (ad ID present, created after the switch) and `unknown:meta_instant_form` otherwise. Names: "Meta · attribution en attente" and "Meta · attribution inconnue". Both are `unattributed` and count in `unattributed_leads`; the summary gains `pending_leads` so the page can say "n prospects en attente de résolution". The ID filters still cannot match them.

### D7 — Diagnostics (B1)

`crm_get_meta_diagnostics` adds per Meta connection an `attribution` object: `enabled`, `started_at`, `eligible_pending` (count), `resolved_from_objects` (count), `resolved_from_provider` (count), `lookup_errors` (`{code: count}` for rows since `started_at`). Counts only; no IDs, names or payloads. Director-only as today.

### D8 — Cohort RPC v2: funnel counts (B2)

Same director-only RPC, replaced with a new signature that appends `p_session_type text default null` (the 114 signature is dropped in the same migration to avoid overload ambiguity; grants/revokes re-stated). Per lead, by cutoff, as EXISTS over `crm_activities` exactly like the current flags:

- `contacted`: at least one activity of type `contact_attempted`, `conversation_recorded`, `whatsapp_sent` or `whatsapp_conversation` (decision 1 may narrow this list).
- `reached` (informational, not a funnel stage): at least one `conversation_recorded` or `whatsapp_conversation`.
- `converted_paid`: `converted = 1` and the lead's attributed revenue by cutoff is > 0 (sum of `crm_revenue_entries.amount_delta` with the frozen first-touch submission, as the existing `revenue` column).

Row and summary outputs add `contacted`, `reached`, `converted_paid`; `attributed_contacted` joins the Meta-only denominators. No fan-out: the flags are computed in `per_lead` before grouping, as today.

### D9 — Program grouping and filter (B2)

- `p_level = 'program'`: bucket `program:<session_type>` or `program:none`; `object_key` = the `session_type` value or NULL; name = the stored value (the closed list is displayed as is; "Sans programme" for NULL); `attribution_kind = 'program'`; funnel counts and revenue aggregated per bucket over the selected channel/connection scope; **`spend`, `impressions`, `clicks`, `link_clicks`, `cpl`, `cpql`, `cac`, `roas` are NULL** on every program row and the summary spend is NULL. No drilldown from a program row.
- `p_session_type` (one of the 8 values or the literal `none`): narrows the cohort to leads with that `session_type` (NULL for `none`) at every level. **While it is set, spend and all ratios are NULL** in rows and summary and the RPC returns `spend_suppressed_reason = 'program_filter'`, because spend cannot be divided by program. Counts and revenue stay exact.
- `program_interest_text` is not a dimension (free text); it is not returned by the RPC.

### D10 — Page changes (B2, `/crm/analytics` only)

- **Entonnoir** block under the summary cards: six stages (Prospects, Contactés, Qualifiés, Tests réservés, Tests passés, Inscrits) with the count and the stage-to-stage rate (`—` when the previous stage is 0) plus the overall prospects → inscrits rate; the denominators text below it keeps the Meta-only counts; "Inscrits payés" shown as a small count next to Inscrits.
- Performance table: new "Contactés" column after Prospects; a per-row rate tooltip is optional (implementer's choice), no new columns beyond Contactés.
- "Regrouper par" gains "Programme"; a "Programme" filter select (Tous, the 8 values, Sans programme). When the filter is active or the level is Programme, the spend/CPL/CPQL/CAC cells show "—" and one line explains: "Dépenses non ventilées par programme : les coûts Meta sont connus par campagne, pas par programme." Final wording at implementation.
- Labels: "Meta · attribution en attente" and "Meta · attribution inconnue" (B1), and the summary line "n prospects en attente de résolution".
- Rates are computed in the component from the returned counts (no stored rates). Drilldown, pages of 50, Insights panels, the ROAS line and all existing text remain.

### D11 — Metric definitions and NULL-versus-zero rules

Per row (trusted Meta rows) and for the summary's Meta ratios (attributed denominators), for the selected acquisition cohort and cutoff:

| Metric | Formula | NULL when | Genuine 0 when |
| --- | --- | --- | --- |
| CPL (USD) | `spend / leads` | spend NULL (coverage incomplete, no connection, program filter/level) or `leads = 0` | spend complete and exactly 0 with `leads > 0` |
| CPQL (USD) | `spend / qualified` | as above or `qualified = 0` | spend complete and 0 with `qualified > 0` |
| CAC (USD) | `spend / converted` | as above or `converted = 0` | spend complete and 0 with `converted > 0` |
| Funnel stage rate | `stage_n / stage_{n-1}` | `stage_{n-1} = 0` | `stage_n = 0` with `stage_{n-1} > 0` |
| Overall rate | `converted / leads` | `leads = 0` | `converted = 0` with `leads > 0` |
| Revenue (MAD) | signed `amount_delta` sum | never (0 when none) | 0 |
| ROAS | hidden under USD/MAD | always NULL (unchanged) | never |

Stage definitions: leads = distinct canonical non-merged opportunities whose frozen first submission is in the range; contacted/reached/qualified/booked/attended/converted/paid as in D8 and the existing contract; qualified does not require contacted (a lead can be qualified at a walk-in); each stage counts the lead once regardless of repeats. Unattributed buckets (website, manual, unknown, pending) never carry spend or ratios. Counts are integers and are never NULL. Spend is NULL, never 0, when any selected date lacks a completed Insights run.

## Security boundaries

- No new table. Two nullable technical columns, no PII. `crm_submission_attribution` keeps RLS on, no direct grants; reads go through the existing director RPCs (`crm_get_submission_attribution` may expose the two new keys; it already exposes IDs and status, never payloads).
- `crm_security.resolve_meta_hierarchy` and `attribution_enrichment_started` have no API grant. `crm_enrich_meta_attribution` is `service_role` only, like the other worker RPCs. `crm_get_meta_diagnostics`, `crm_save_meta_connection` and `crm_get_marketing_cohort` keep `require_reader(true)` (stored role `director`) and `authenticated` execute only; every other role, anon and service_role are denied as today, re-stated in the migrations.
- No token is read, stored or used by any new code path; the scheduler endpoint keeps returning counts only. The intake worker's ad lookup still uses the intake token exactly as before; the Insights token is not touched.
- The attribution immutability trigger is unchanged and is the guard for every enrichment write; redacted rows are excluded by eligibility and protected by the trigger.
- Website and manual leads are never represented as Meta acquisitions; first touch stays immutable; conversion, finance and lifecycle functions are untouched.
- Receptionist, admin and all other roles: no change in reach.

## Migration strategy

- **B1 — `<next>_crm_meta_attribution_hierarchy.sql`** (115 if still free): add the two columns; replace `crm_connection_provider_shape`; replace `crm_save_meta_connection` (094 cumulative) with the `attribution_enrichment` key; add `crm_security.attribution_enrichment_started` and `crm_security.resolve_meta_hierarchy`; replace `crm_finalize_meta_job` (094 cumulative) with the allowlist extension and the intake-time resolution; add `crm_enrich_meta_attribution` with service-role grant; replace `crm_get_marketing_cohort` (114 cumulative, same signature) for D6; replace `crm_get_meta_diagnostics` (086) for D7. Re-state every revoke/grant for every replaced function. No data backfill, no row rewrite.
- **B2 — `<next+1>_crm_marketing_funnel_program.sql`** (116 if still free): drop the B1 cohort signature and create the v2 signature (D8, D9) with grants; nothing else.
- Both build on the latest cumulative definitions (094 for intake/connection, 114 for the cohort), never on 086/089/090 snapshots; deployed migrations stay immutable; each is tested with `supabase migration up --local` and a stateful upgrade rehearsal from 114.
- **Renumbering note (Q7):** PRs #121 and #124 (114/115 provisional) and Premium retirement Release B (114 provisional) renumber when restarted; nothing in this plan edits them.

## Test strategy

Synthetic, local, rolled back; no token, no Meta host.

- **Unit (`scripts/test-crm-phase8.mjs`, extended):** ad lookup 403 → `ad_lookup_error = 'provider_auth'`, `hierarchy_error_code` carried, `hierarchy_source` null, status `partial`; successful lookup → `hierarchy_source = 'provider'`; error codes never include a body; `campaign_id` still never read from `field_data`.
- **SQL (`scripts/test-crm-phase8.sql` or a new `scripts/test-crm-dgi-b.sql`, rolled back):** constraint accepts/rejects `attribution_enrichment` shapes; `started_at` set only by the database, cleared on disable, fresh on re-enable; eligibility excludes rows before `started_at`, redacted rows, rows with a campaign, rows without `ad_id`, other connections; the resolver returns NULL on a broken chain (missing ad set or campaign) and the hit on a full chain; intake-time resolution fills only NULL fields and sets `complete` only with all names; the sweep resolves eligible rows, skips locked rows, never rewrites, counts `unresolved` on trigger violations; existing non-NULL values untouched (trigger `42501`); cohort bucket `pending` vs `unknown` and `pending_leads`; diagnostics counts; role denials for the sweep (roles 2–7, anon, authenticated) and service-role execute.
- **Cohort v2 SQL (B2):** `contacted`/`reached`/`converted_paid` per the activity lists, by cutoff, no double count on repeated events; program level buckets, NULL spend/ratios, `program:none`; program filter narrows counts, forces spend/ratios NULL and sets `spend_suppressed_reason`; no fan-out with multiple submissions and daily spend rows; NULL-vs-zero rules of D11 with a complete-coverage fixture; old signature gone.
- **Security matrix (`scripts/test-crm-phase12-security.mjs`, in CI):** add `crm_enrich_meta_attribution` to the `service` cases; the director cases for `crm_get_marketing_cohort` use the v2 signature (B2).
- **Scheduler (`scripts/test-crm-insights-scheduler.mjs`, extended):** the sweep is called once per tick only with the gate open and budget left; the response adds `enriched` counts only; a sweep RPC error does not fail the tick.
- **Browser (`scripts/test-crm-phase11-browser.mjs` or `phase12-browser`, extended):** director sees the funnel block, the Contactés column, the Programme option and filter, the suppression line and the two labels; admin/receptionist still redirected; no token string in any response.
- **Stateful upgrade rehearsal (`scripts/test-crm-insights-upgrade.mjs`, extended or a sibling):** reset to 114, create a Meta connection with mappings, three attribution rows (one before, one after a simulated enable, one redacted), objects with a full chain, apply B1 (then B2), assert: columns NULL on old rows, constraint still satisfied, only the eligible row resolved after enabling, grants identical except the new function(s).
- **Existing suites:** `npm test`, `test:crm-intake`, `test:crm-insights`, middleware, navigation unchanged and run; `.github/**` is touched only if a new script is wired (then full lane).

## Rollout and recovery strategy

Each step needs its own explicit owner approval; none is granted by this plan.

| Step | Release | Action | Approval | Verification (counts only) |
| --- | --- | --- | --- | --- |
| R1 | B1 | Merge the B1 implementation PR after independent review (deploys code; the column/function changes are inert until the migration) | owner merge approval | CI terminal on the exact SHA |
| R2 | B1 | Apply migration B1 to Production (`supabase db push --linked` or the release path used for 114) | owner release approval | ledger shows the new version; `select count(*) from crm_submission_attribution where hierarchy_source is not null` = 0 |
| R3 | B1 | Enable the switch: a director calls `crm_save_meta_connection` with the connection's current `version`, its full identity fields and `attribution_enrichment: {"enabled": true}` (operator SQL snippet, no UI caller exists) | owner activation approval | diagnostics show `enabled = true` and `started_at`; `eligible_pending` = 0 at that moment |
| R4 | B1 | Observe: after the next Meta lead and the next completed Insights run, `resolved_from_objects` ≥ 1; the report shows the campaign row with CPL/CPQL/CAC and the lead no longer under "attribution inconnue"; old leads unchanged (41 rows still `campaign_id IS NULL`) | owner read approval | R2-style count |
| R5 | B2 | Merge the B2 implementation PR after independent review | owner merge approval | CI terminal |
| R6 | B2 | Apply migration B2 | owner release approval | ledger; cohort v2 signature present, old one absent |
| R7 | B2 | Director walkthrough of the funnel, column, program grouping/filter and suppression line | owner | bounded acceptance note in CURRENT_STATE |

**Rollback.** B1: disable the switch (`attribution_enrichment: {"enabled": false}`) to stop both resolution moments at once; already-enriched rows keep their values by design (immutable attribution) and remain correctly attributed; a forward migration can drop the sweep RPC and resolver if ever needed, never the columns' data. Code rollback is the usual Vercel redeploy of the previous source. B2: the page can be reverted by redeploy; the v2 RPC is backward-compatible for the previous page except the dropped signature, so B2's migration and PR are released together and rolled back together (a forward migration re-creating the B1 signature is the database path). Neither release touches intake jobs, leads, conversion or finance.

**Credential incident:** none applies; no new credential.

## Production reads performed (2026-10-10)

Run through `supabase db query --linked --project-ref hopcezradkhrixwwswxn --output-format json -f <file>`, one statement per file, each prefixed by `set transaction read only;` (R0 proved `transaction_read_only = on`). Queries select counts, states and dates only.

| # | Query | Result |
| --- | --- | --- |
| R1 | `select max(version), count(*) from supabase_migrations.schema_migrations;` | max `114`, 114 rows |
| R2 | `select a.provider, a.attribution_status, count(*), count(a.campaign_id), count(a.adset_id), count(a.ad_id), count(a.form_id), count(*) filter (where a.raw_payload ? 'ad_id'), count(a.redacted_at), count(distinct a.form_id), min(s.occurred_at)::date, max(s.occurred_at)::date from crm_submission_attribution a join crm_submissions s on s.id=a.submission_id group by 1,2;` | meta/partial: 41, campaign 0, adset 0, ad 41, form 41, raw ad_id 41, redacted 0, forms 1, 2026-09-28 → 2026-10-09. website/partial: 1, all zero, 2026-09-26 |
| R3 | `select channel, match_status, count(*) from crm_submissions group by 1,2;` | manual/resolved 1; meta_instant_form/resolved 41; website/resolved 1 |
| R4 | `select s.channel, l.status, count(*) from crm_leads l join crm_submissions s on s.id=l.first_submission_id where l.merged_into_lead_id is null group by 1,2;` | manual LOST 1; meta NEW 40, QUALIFIED 1; website NEW 1 |
| R5a | `select s.channel, coalesce(l.session_type,'<null>'), count(*) from crm_leads l join crm_submissions s on s.id=l.first_submission_id where l.merged_into_lead_id is null group by 1,2;` | manual null 1; meta Yearly 41; website null 1 |
| R5b | `select coalesce(lower(btrim(l.program_interest_text)),'<null>'), count(*) from crm_leads l where l.merged_into_lead_id is null group by 1 order by 2 desc limit 25;` | "programme annuel" 41, "anglais annuel" 1, "formation entreprise" 1 |
| R6 | per channel, canonical leads with ≥1 activity of each type (`contact_attempted`, conversation, `lead_engaged`, `lead_qualified`, `placement_test_booked`, `placement_test_attended`, `placement_result_entered`, `lead_converted`), `status='CONVERTED'`, `conversion_review_required`, any revenue entry | meta: 41 leads, attempted 1, conversed 1, engaged 1, qualified 1, tests 0/0/0, converted 0, review 0, revenue 0. manual: 1 lead, attempted/conversed/engaged/qualified 1 each. website: 1 lead, all 0 |
| R7 | `select event_type, count(*) from crm_activities group by 1;` | task_created 48, lead_created 43, submission_received 43, task_completed 4, lead_qualified 2, conversation_recorded 2, contact_attempted 2, task_cancelled 2, lead_engaged 2, lead_lost 1, note_added 1, call_unreachable 1, call_no_answer 1 |
| R8 | `select c.provider, j.status, j.last_error_code, count(*) from crm_ingestion_jobs j join crm_integration_connections c on c.id=j.connection_id group by 1,2,3;` | meta done/null 41; website done/null 1 |
| R9 | per connection: provider, enabled, api_version, reconciliation enabled, has Insights, Insights mode/enabled, active mappings | meta: enabled false, v26.0, reconciliation true, Insights live/enabled, 2 active mappings. website: enabled true, 3 active mappings |
| R10 | counts of `crm_meta_daily_insights` (rows, distinct campaigns, distinct ads, date range), `crm_meta_objects` by type, `crm_meta_sync_runs` by status | 172 rows, 3 campaigns, 11 ads, 2026-09-13 → 2026-10-10; objects ad 44, adset 19, campaign 13; runs completed 1 |
| R11 | `select count(distinct a.ad_id), count(distinct a.ad_id) filter (where exists(select 1 from crm_meta_daily_insights d where d.ad_id=a.ad_id)), count(distinct a.campaign_id), … from crm_submission_attribution a where a.provider='meta';` | lead ad IDs 4, of which 4 in the Insights snapshot; lead campaign IDs 0 |
| R12 | `select jobname, schedule, active from cron.job;` | crm-intake-primary `*/5` active; crm-lifecycle-primary `*/5` inactive; crm-insights-primary `*/30` active |

Reads **not** run (would need separate approval, listed for decision 6): the intake token's scopes (Meta Business Settings / debugger, metadata only) and the two controlled ad-node reads.

## Expected modules

| Path | Release | Change |
| --- | --- | --- |
| `supabase/migrations/<next>_crm_meta_attribution_hierarchy.sql` | B1 | New (D1 columns, D2, D3, D4, D6, D7) |
| `supabase/migrations/<next+1>_crm_marketing_funnel_program.sql` | B2 | New (D8, D9) |
| `src/lib/crm/meta/adapter.mjs` | B1 | `retrieveLead` returns `ad_lookup_error`; `normalizeLead` emits `hierarchy_source`/`hierarchy_error_code` |
| `src/lib/crm/insights/scheduler.mjs`, `src/app/api/cron/crm-insights/route.js` | B1 | one bounded `crm_enrich_meta_attribution` call per tick; `enriched` counts in the response |
| `src/components/crm/MarketingAnalytics.jsx` (+ a small `MarketingFunnel.jsx`) | B1 labels, B2 funnel/column/program | D6, D10 |
| `scripts/test-crm-phase8.mjs`, `scripts/test-crm-phase8.sql` or `scripts/test-crm-dgi-b.sql`, `scripts/test-crm-phase11.sql`, `scripts/test-crm-phase12-security.mjs`, `scripts/test-crm-insights-scheduler.mjs`, `scripts/test-crm-insights-upgrade.mjs`, a browser script | B1/B2 | Extended / new |
| `docs/crm-meta-insights.md`, `docs/crm-meta-ingestion.md`, `docs/crm-meta-reconciliation.md` (switch snippet), `docs/ai/*`, `docs/architecture/FEATURE_INDEX.md` | both | Updated at implementation/closeout for changed facts only |

Untouched: `src/middleware.js`, `src/lib/roleAccess.mjs`, every lifecycle, finance, enrollment, placement and conversion function, `protocol.mjs`, `reconcile.mjs`, `vercel.json`, the files of PRs #120–#124.

## Owner decisions required

1. **Definition of "contacté".**
   - **Question:** which evidence makes a lead "contacted" in the funnel?
   - **Option A:** any outreach evidence: `contact_attempted`, `conversation_recorded`, `whatsapp_sent` or `whatsapp_conversation` (the lead left NEW; matches "Contact en cours").
   - **Option B:** only a reached conversation (`conversation_recorded`, `whatsapp_conversation`).
   - **Consequences:** A measures staff reaction and shows a higher count; B measures reach and makes "contacté" ≈ "engagé". The plan returns both (`contacted`, `reached`) and the funnel stage uses the chosen one.
   - **Recommendation:** A, with `reached` shown as a secondary number.
   - **Blocking:** decide before B2 implementation.
2. **CAC denominator.**
   - **Question:** divide spend by trusted conversions or by conversions with a collected payment?
   - **Option A:** trusted converted (enrollment Confirmed/Validated), today's definition; `converted_paid` shown beside it.
   - **Option B:** `converted_paid` (at least one positive receipt by cutoff).
   - **Consequences:** A follows the product rule that payment and conversion are separate facts and is stable; B is stricter but makes CAC depend on receipt timing and on the cutoff.
   - **Recommendation:** A.
   - **Blocking:** decide before B2.
3. **Program dimension.**
   - **Question:** accept `session_type` as the program split, knowing that Meta leads currently inherit the form's default (one form → one program)?
   - **Option A:** accept; show the caveat line; map a program question or split forms per program later (configuration, no code).
   - **Option B:** defer the program view until forms carry a program question.
   - **Consequences:** A ships the view now and becomes informative as soon as forms differ; B avoids a one-row program table for a while.
   - **Recommendation:** A.
   - **Blocking:** decide before B2.
4. **No historical resolution — confirm.** The data already allows resolving the 41 existing leads (all 4 ad IDs are in the snapshot). The commission says old leads stay unknown. **Option A:** confirm: eligibility starts at `started_at`, reporting never resolves older leads. **Option B:** a separately approved one-time resolution of the existing rows (a reviewed data step, not part of B1). **Recommendation:** A as commissioned; B only if the owner wants October's CAC. **Blocking:** not blocking (A is the design).
5. **Blended CPL.** **Option A:** no "all spend / all leads" figure (recommended; it would attribute Meta spend to website/manual leads). **Option B:** add a clearly labelled "CPL global" card. **Blocking:** not blocking.
6. **Provider lookup repair and token tests.** **Option A:** do nothing further; rely on the in-database resolver (recommended for B1). **Option B:** separately approve the three reads in Q2 and, if the intake token can read ad nodes, keep the provider lookup as the first source; if not, consider (as its own decision) using the Insights token for the ad lookup, which ADR-006 currently keeps separate. **Blocking:** not blocking.
7. **Release split.** **Option A:** B1 then B2 as two PRs/migrations (recommended; B1 is the integrity change, B2 is reporting). **Option B:** one combined release. **Blocking:** decide before implementation.
8. **Pending label wording and the suppression line** — final French wording at implementation unless the owner states it now. Not blocking.

## Approval record

None. Revision DGI-B-r1 is proposed; no owner approval, independent review, implementation, merge, deployment or Production mutation has occurred.

## IMPLEMENTATION CONTRACT

### Scope

Implement B1 (D1–D7) and, after decisions 1–3 and 7, B2 (D8–D11), each on its own branch and PR with CI and fresh independent review, exactly as designed above. Nothing else.

### Prerequisites

Owner approval of this revision with the answers to decisions 1–3 and 7 recorded in [Approval record](#approval-record); baseline `origin/main` fetched; next free migration numbers read from the ledger and `supabase/migrations`; local Supabase at 114; no Production access.

### Object / module manifest

As in [Expected modules](#expected-modules). B1 database objects: columns `crm_submission_attribution.hierarchy_source`, `.hierarchy_error_code`; constraint `crm_connection_provider_shape` (replaced); `crm_security.attribution_enrichment_started(crm_integration_connections)`; `crm_security.resolve_meta_hierarchy(uuid,text)`; `public.crm_enrich_meta_attribution(integer)` (service_role); replaced `public.crm_save_meta_connection(jsonb,uuid,bigint)`, `public.crm_finalize_meta_job(uuid,uuid,uuid,jsonb)`, `public.crm_get_meta_diagnostics(integer,integer)`, `public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer)`. B2: `public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer,text)` created, the B1 signature dropped.

### Invariants

1. No existing non-NULL attribution value is ever rewritten; redacted rows are never touched; the protection trigger is not modified.
2. Rows with `provider_created_at < started_at`, or on a connection without an enabled switch, are never enriched, at intake or by the sweep.
3. Resolution matches only `(connection_id, ad_id)` against `crm_meta_objects` with a complete ad → ad set → campaign chain; never names, UTMs, `fbclid`, program or time.
4. Spend and ratios appear only on `trusted_meta` rows; website, manual, unknown and pending rows and every program row/filtered result have them NULL; zero denominators give NULL; incomplete coverage gives NULL spend, never 0.
5. No new token read or provider call; the scheduler response stays counts only; no PII in new columns, diagnostics or responses.
6. Director-only for every read/configuration RPC (`require_reader(true)`); service-role only for the sweep; grants/revokes re-stated for every replaced function; no RLS or grant widened.
7. First touch, conversion, revenue, lifecycle, placement and enrollment functions and data are unchanged.
8. Migrations are additive and forward-only, built on the 094/114 cumulative definitions, numbered from the ledger at implementation.

### Acceptance / tests

Everything in [Test strategy](#test-strategy) passes locally and in CI for the exact head SHA; `npm run lint`, `npm run build`, `npm test`, `test:crm-intake`, `test:crm-insights`, middleware and navigation suites pass; the upgrade rehearsal from 114 passes; the Phase 12 matrix covers the new/replaced RPCs; the browser check shows the funnel, column, program controls, labels and suppression line to a director and nothing to other roles.

### Stop conditions

Stop and report (no workaround) if: the ledger or `supabase/migrations` shows a number other than expected (allocate from the ledger, never renumber others' files); the protection trigger would have to change; a resolver hit would require reading any token or calling Meta; the cohort change would attribute spend to a non-`trusted_meta` row; the intake connection and the Insights connection are different rows in a local fixture that the design cannot serve (document the limit); any owner decision 1–3/7 is unanswered at B2 start; CI cannot be scheduled.

### Docs / status reporting

Update `docs/crm-meta-insights.md` (attribution sources, pending bucket, funnel/program contract), `docs/crm-meta-ingestion.md` (lookup outcome columns, switch), `docs/crm-meta-reconciliation.md` (switch snippet beside the reconciliation one), FEATURE_INDEX and SECURITY_RULES (new service RPC) at implementation; CURRENT_STATE and this plan's approval/implementation/closeout records only with dated evidence. Hand off with branch, exact head SHA, PR, migration filenames, tests and CI reference under the AGENTS.md implementation handoff; the author never issues a review verdict.
