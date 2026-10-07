# ADR-001: CRM lifecycle, actions and conversion evidence

## Status

Accepted; implemented in the repository. Approved product invariants recorded here.

## Date

2026-09-29 (documentation capture).

## Context

School intake combines commercial progress, scheduled follow-up, actual conversations, enrollment and payments. Collapsing them into one status loses both operational intent and trustworthy conversion/revenue evidence.

## Decision

Use NEW → CONTACTING → ENGAGED → QUALIFIED → CONVERTED with explicit LOST and NOT_QUALIFIED closures. Status describes commercial position; task describes next work; activity records what happened. Notes are context, not a replacement for next action or commercial decision.

Conversion requires trusted linked enrollment in Confirmed/Validated, retaining learner/enrollment/activity/time evidence. Starting Submitted/Trial enrollment does not convert; payment and collected revenue remain separate. Preserve historical conversion and flag later contradictory enrollment changes for review.

Failed phone-call policy uses Day 1 twice, Day 2 once, Day 4 once, Day 6 once, relative to the first failed call of an uninterrupted sequence, respecting Casablanca calling windows/minimum spacing. Meaningful conversation resets the sequence. WhatsApp does not count as a failed call. Five failures do not automatically close Lost.

## Alternatives considered

- A status for every call/task would confuse actions with commercial progress.
- Conversion on enrollment initiation would overstate confirmed admissions.
- Conversion on arbitrary payment alone would lose explicit enrollment evidence.
- Automatic Lost after five calls would silently impose a closure decision the product does not authorize.

These are documented design tradeoffs, not a reconstruction of prior meeting history.

## Consequences

Commands must atomically record history and schedule/close appropriate tasks. Follow-up policy versions remain immutable. Finance can confirm an enrollment through its existing engine, while attribution/revenue still follows actual financial evidence. UI changes must preserve dedicated call-outcome recording.

## Security/invariants

Keep role checks, optimistic versions, stable request identities and append-only evidence. Never manufacture conversion, reset attempts to hide history or rewrite first touch. [Product rules](../../ai/PRODUCT_RULES.md) are the concise invariant reference.

## Implementation status

Schema/commands in migrations [078](../../../supabase/migrations/078_crm_core_schema.sql), [080](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql), [082](../../../supabase/migrations/082_crm_conversation_decision.sql), conversion in [084](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql), revenue in [085](../../../supabase/migrations/085_crm_revenue_attribution.sql). The default offsets match the approved cadence, but command validation permits other later offsets while fixing the first two to Day 1; production operating hours/policy values are not verified by this documentation task. No receptionist detail redesign is implied. [RCC-A1](../plans/rcc-r1-receptionist-crm-completion.md#implementation-record) (migration [111](../../../supabase/migrations/111_crm_rcc_a1_outcome_led_followup.sql); deployed 2026-10-07, see [CURRENT_STATE](../../ai/CURRENT_STATE.md)) keeps this status/task/activity separation. It adds task metadata for agreed appointments vs internal reminders and for the En réflexion follow-up reason, never as new statuses.
