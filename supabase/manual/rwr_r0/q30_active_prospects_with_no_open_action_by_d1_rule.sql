-- RWR-r5 R0 Q30 — active prospects with no open action, by D1 rule (D1 rule c, M-A2 precondition)
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q30).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select case
         when exists (select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié') then 'planned_test'
         when (select count(*) from public.crm_activities a where a.lead_id=l.id and a.event_type='contact_attempted'
               and a.outcome in ('no_answer','busy','declined','unreachable') and a.outreach_cycle=l.outreach_cycle) >= 5 then 'five_failures'
         else 'other' end d1_rule,
       count(*) leads, (array_agg(l.id order by l.id))[1:5] sample
from public.crm_leads l
where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
  and not exists (select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')
group by 1
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
