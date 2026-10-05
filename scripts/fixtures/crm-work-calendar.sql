-- Shared synthetic Batch-2 fixture augmentation; harness first loads the 10k/50k O3 fixture.
-- All eight types and multiple open tasks per lead; assignee is independent of owner.
update public.crm_tasks t set task_type=(array['first_contact','contact_attempt','callback','whatsapp_followup','confirm_placement_test','post_test_followup','center_visit','enrollment_followup'])[1+(f.i+split_part(t.source_key,':',3)::int)%8],
 assigned_to=case when f.i%3=0 then 'a3000000-0000-0000-0000-000000000002'::uuid when f.i%3=1 then 'a3000000-0000-0000-0000-000000000003'::uuid end,
 status=case when f.i<=8000 then 'open' else t.status end,
 cancelled_at=case when f.i<=8000 then null else t.cancelled_at end,
 cancellation_reason=case when f.i<=8000 then null else t.cancellation_reason end,
 due_at=case split_part(t.source_key,':',3)::int
 when 0 then now()-interval '1 minute'
 when 1 then now()+((((now() at time zone 'Africa/Casablanca')::date+1)::timestamp at time zone 'Africa/Casablanca')-now())/2
 when 2 then ((now() at time zone 'Africa/Casablanca')::date+1)::timestamp at time zone 'Africa/Casablanca'
 else ((now() at time zone 'Africa/Casablanca')::date+2)::timestamp at time zone 'Africa/Casablanca' end
from fixture f where t.lead_id=f.lead and t.source_key like '%:o3-task:%';
update public.crm_tasks set outreach_cycle=1,attempt_ordinal=2 where task_type='contact_attempt';
-- A taskless active lead with exhausted current-cycle calls, retained in attention.
update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='Synthetic attention fixture' where lead_id=(select lead from fixture where i=4);
insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,channel,outcome,outreach_cycle,attempt_ordinal,source_key)
select lead,now()+make_interval(secs=>g),'system','contact_attempted','phone','no_answer',1,g,lead||':exhausted:'||g from fixture cross join generate_series(2,5)g where i=4;
-- Closed/converted appointments remain real bookings. Converted fixture carries
-- trusted synthetic references only in separate existing enrollment regressions.
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id,examinateur,notes)
select 'Closed synthetic appointment',(now() at time zone 'Africa/Casablanca')::date+1,'00:01','Planifié',lead,'Display label only','EXCLUDED private note' from fixture where i=8001;
insert into public.placement_tests(student_name,date_test,heure,status,examinateur,notes,score)
select 'Legacy synthetic '||i,(now() at time zone 'Africa/Casablanca')::date+(i%7),
 (array[null,'invalid','25:61','09:00','10:30','11:45',''])[1+i%7],
 (array['Planifié','Passé','Résultat saisi','Affecté'])[1+i%4],
 'Examiner label','EXCLUDED private score note',42 from generate_series(1,240)i;
-- Explicit genuine visit duration, not an invented default.
insert into public.crm_tasks(lead_id,task_type,due_at,scheduled_end_at,assigned_to,source_kind,source_key)
select lead,'center_visit',(((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca')+interval '1 second',
(((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca')+interval '40 minutes',
'a3000000-0000-0000-0000-000000000001','manual','o3-real-visit-duration' from fixture where i=2;
analyze public.crm_tasks; analyze public.placement_tests;
