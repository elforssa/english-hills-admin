-- RWR-r5 R0 Q24 — test data inventory
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q24).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select 'student' k, id::text from public.students where full_name ilike 'TEST Claude%'
union all select 'contact', id::text from public.crm_contacts where display_name ilike 'TEST Claude%'
union all select 'lead', id::text from public.crm_leads where learner_name ilike 'TEST Claude%'
union all select 'group', id::text from public.groups where name ilike 'TEST R4%'
union all select 'receipt', receipt_number||' voided='||(voided_at is not null) from public.receipts
 where receipt_number in ('EH-2026-00459','EH-2026-00460','EH-2026-00461')
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
