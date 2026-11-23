-- RWR-r5 R0 Q07 — invariant 2: closed, converted or merged prospects with open actions or planned tests
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q07).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select case when l.merged_into_lead_id is not null then 'MERGED' else l.status end state,
       count(distinct l.id) filter (where exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')) with_open_action,
       count(distinct l.id) filter (where exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié')) with_planned_test,
       (array_agg(l.id order by l.id) filter (where exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')
          or exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié')))[1:5] sample
from public.crm_leads l where l.status in ('LOST','NOT_QUALIFIED','CONVERTED') or l.merged_into_lead_id is not null
group by 1
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
