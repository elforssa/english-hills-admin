# ADR-007: Lead-level Meta campaign attribution from synced Insights objects

## Status

**Proposed** (2026-10-10) with [Director CRM & Growth Intelligence — Outcome B](../plans/director-growth-intelligence-b.md), revision DGI-B-r1. Not accepted, not implemented. The owner recorded the plan's eight decisions (all as recommended) on 2026-10-10 without approving implementation; acceptance will be recorded in the plan's [approval record](../plans/director-growth-intelligence-b.md#approval-record); [CURRENT_STATE](../../ai/CURRENT_STATE.md) will own implementation and activation evidence.

## Date

2026-10-10.

## Context

Every Meta lead in Production stores the ad ID returned by the lead retrieval but no campaign or ad set ID, because the intake worker's optional ad-node lookup fails silently with the intake Page token. The director report therefore groups all Meta leads under "attribution inconnue" and cannot compute CAC per campaign. The live Insights sync (ADR-006, migration 114) already stores the current campaign → ad set → ad hierarchy of the same ad account in `crm_meta_objects`, and every lead ad ID observed so far is present there. The owner has decided that attribution is fixed going forward only and that old leads stay unknown.

## Decision (proposed)

1. **Resolve the hierarchy from the database, not from Meta.** A private resolver maps a lead's own provider-returned `ad_id` to its ad set and campaign through `crm_meta_objects` of the same connection. No new Meta call, permission, token or token reuse is introduced; the intake and Insights credentials stay separate (ADR-006 decision 2 unchanged).
2. **Two resolution moments, both service-role, both idempotent:** at intake inside `crm_finalize_meta_job`, and in a bounded sweep RPC called once per Insights scheduler tick. Only NULL attribution fields are filled, under the existing `crm_security.protect_attribution` trigger; redacted rows are never touched.
3. **A director-set switch with a database-set start timestamp** (`settings.attribution_enrichment`, the reconciliation pattern) defines eligibility: only leads created at Meta after `started_at` are ever resolved. Historical leads remain unknown by decision; a later one-time resolution would be its own approved data step.
4. **Trusted spend attribution keeps one rule:** a row carries spend only when the lead's first-touch Meta attribution holds an advertising ID written by the provider lookup or by this resolver, on the selected connection. Website, manual, unknown and pending leads, and any program grouping or filter, never carry spend or ratios.
5. **The lookup outcome is recorded** (`hierarchy_source`, `hierarchy_error_code`) so that a failing provider lookup is visible in diagnostics instead of being discarded.

## Alternatives considered

- **Repair the provider ad lookup with the Insights token.** Deferred: it would couple the two credentials and needs a token test; the database already holds the hierarchy.
- **Resolve at reporting time for all leads, including old ones.** Rejected: it contradicts the owner's going-forward decision and would re-attribute history silently.
- **Match by campaign name, form name or UTM.** Rejected: the Insights contract forbids name/UTM joins; only provider IDs are trusted.
- **Read `ad_id`/`adgroup_id` from the webhook payload.** Not needed: the lead retrieval already returns `ad_id`, and realtime intake is disabled.

## Consequences

- CPL, CPQL and CAC per campaign become available for leads acquired after the switch; a lead whose ad is not yet in the snapshot shows as "attribution en attente" for up to about one Insights refresh.
- Attribution rows gain two technical columns and one more legitimate source of IDs; the immutability guarantee is unchanged.
- Enabling the switch is a separately approved Production step; code presence activates nothing.

## Security/invariants

- Service-role writes only; director-only reads; no grant or RLS widened; no token read by any new path; counts-only scheduler responses.
- NULL-only enrichment, no rewrite, no redaction bypass, no change to first touch, conversion, revenue or lifecycle data.

## Implementation status

Not implemented. See the plan's [implementation contract](../plans/director-growth-intelligence-b.md#implementation-contract).
