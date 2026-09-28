# Phase 13 Meta lead reconciliation

The existing Meta webhook remains the realtime source. A bounded Graph discovery pass finds recent IDs from active Meta form mappings and writes only the canonical four-field event (`page_id`, `leadgen_id`, `form_id`, `created_time`) to `crm_ingestion_jobs`. It never creates a submission or lead. The existing worker retrieves each lead again, normalizes it, selects the immutable mapping version, and finalizes through the same CRM resolver. The unique `(connection_id,event_kind,external_key)` key deduplicates webhook and reconciliation in either order.

## Activation and safety

`crm_integration_connections.enabled` continues to control realtime webhook intake. The separate `settings.meta_reconciliation` object controls discovery and authorizes only jobs marked by the reconciliation RPC. Both are disabled on existing connections. Update the connection through `crm_save_meta_connection` with the current optimistic `version`, full connection identity/config fields, and `meta_reconciliation: {"enabled":true,"lookback_minutes":60}`. The database sets `started_at` at the moment of activation; callers cannot set or backdate it. Re-enabling after a disable obtains a fresh timestamp. No historical leads before that timestamp enter the queue. This is not a backfill interface.

Production activation is a separate operational step after review and migration. It requires an explicit decision to turn reconciliation on. Keeping `enabled=false` leaves realtime webhook intake blocked. No production Meta API call, token change, lead import, or connection activation is part of this change.

## Scheduling

The existing authenticated GitHub scheduler remains at five-minute intervals. Each tick asks the database for at most one due active Meta form mapping. Per-form rows carry a 55-second lease; another scheduler invocation cannot claim the same form during the lease. A successful pass is due again in ten minutes. Rate limits back off for fifteen minutes; other errors retry after five minutes. Graph requests have eight-second timeouts, 131 KiB response limits, 25 leads per page, and at most two pages per pass. On a discovery tick the existing worker claims at most two jobs, keeping the combined work within the route's 60-second budget. Pagination uses only the opaque cursor on the same validated Graph endpoint. A pass stops at the first lead older than `max(started_at, now - lookback_minutes)`. IDs and timestamps are validated before enqueue and again by SQL. Responses contain counts only.

The hard cap means an unusually high sustained volume above fifty leads per form per pass can outrun reconciliation's rolling lookback. A large number of active forms can also push a form's next claim beyond its nominal ten-minute due time because one form is polled per five-minute scheduler tick. Operational monitoring should compare discovered counts, Graph page saturation, and overdue form state; a deliberate, separately reviewed backfill would be required for a gap. The webhook remains primary once available.

## Mapping option labels

Immutable Meta mapping versions may include `option_labels[question_key][raw_option] = human_label`. The normalized `form_answers.value` retains the exact provider value; optional `display_value` carries the mapped label to the receptionist review and lead-detail read models. Unconfigured values remain unchanged. Arbitrary questions remain flexible answers. Age ranges such as `7-8` remain answers and do not become integer `learner_age`.

## Validation

Run the local-only fresh/upgrade replay with `python3 scripts/test-crm-meta-reconciliation-replay.py /private/tmp/phase12-platform-schema.sql`, the mocked Graph fixtures with `node scripts/test-crm-meta-reconciliation.mjs`, and the standard Phase 8/9, scheduler, browser, lint and build checks. These tests use synthetic data and never call the live Meta API.
