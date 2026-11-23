-- RWR-r5 R0 Q03 — overdue tasks by what created them
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q03).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select t.task_type, coalesce(t.schedule_kind,'(none)') schedule_kind, t.source_kind,
       (t.due_at = crm_security.next_window(l.followup_policy_id, date_trunc('day', t.due_at))) at_window_opening,
       count(*) n
from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
where t.status='open' and t.due_at<now() and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
group by 1,2,3,4 order by n desc
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
