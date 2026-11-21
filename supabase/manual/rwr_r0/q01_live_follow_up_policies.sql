-- RWR-r5 R0 Q01 — live follow-up policies
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q01).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select version, weekly_hours, date_exceptions, attempt_offsets, minimum_attempt_gap_minutes,
       first_contact_sla_minutes, post_test_sla_minutes, effective_from, retired_at
from public.crm_followup_policies order by version
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
