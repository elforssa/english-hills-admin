-- RWR-r5 R0 Q29 — planned tests of active prospects without their appointment (D1 rule b, M-A2 precondition)
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q29).
-- Amended 2026-11-22 (owner decision, plan implementation record): a planned test may belong to the
-- prospect's open appointment or to its open enrolment action (« Finaliser l'inscription »), and only those.
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(*) tests, (array_agg(p.crm_lead_id order by p.crm_lead_id))[1:5] sample
from public.placement_tests p join public.crm_leads l on l.id=p.crm_lead_id
where p.status='Planifié' and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
 and not exists (select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open'
                 and t.task_type in ('center_visit','enrollment_followup') and t.placement_test_id=p.id)
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
