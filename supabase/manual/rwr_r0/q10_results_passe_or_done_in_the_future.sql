-- RWR-r5 R0 Q10 — invariant 5: results, « Passé » or « done » in the future
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q10).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select 'test_result_future' k, count(*) n, (array_agg(id))[1:5] s from public.placement_tests
 where status in ('Passé','Résultat saisi','Affecté') and date_test>public.business_date()
union all select 'task_done_before_due', count(*), (array_agg(id))[1:5] from public.crm_tasks
 where status='completed' and completed_at<due_at and task_type in ('center_visit','callback')
union all select 'attendance_future', count(*), (array_agg(id))[1:5] from public.attendance
 where session_date>public.business_date()
union all select 'test_planned_with_level', count(*), (array_agg(id))[1:5] from public.placement_tests
 where status='Planifié' and niveau_recommande is not null
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
