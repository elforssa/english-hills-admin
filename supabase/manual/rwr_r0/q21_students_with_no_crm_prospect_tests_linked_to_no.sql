-- RWR-r5 R0 Q21 — students with no CRM prospect; tests linked to nobody
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q21).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select 'enrolled_without_lead' k, count(*) n from public.students s
 where s.deleted_at is null and s.status='Enrolled' and not exists(select 1 from public.crm_leads l where l.student_id=s.id)
union all select 'tests_without_lead_or_student', count(*) from public.placement_tests where crm_lead_id is null and student_id is null
union all select 'tests_student_only', count(*) from public.placement_tests where crm_lead_id is null and student_id is not null
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
