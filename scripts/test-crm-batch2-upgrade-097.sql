-- Persistent synthetic fixture for a real 097 -> current migration upgrade.
\set ON_ERROR_STOP on

begin;

do $$
begin
  if (select max(version::integer) from supabase_migrations.schema_migrations) <> 97 then
    raise exception 'Expected migration 097 as the upgrade starting point';
  end if;
  if to_regclass('public.crm_lifecycle_eligibility_evidence') is not null then
    raise exception 'Batch 2 lifecycle evidence tables exist before migration 098';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='crm_external_deliveries' and column_name='delivery_mode'
  ) then
    raise exception 'Batch 2 delivery columns exist before migration 098';
  end if;
end $$;

insert into auth.users(id,email,aud,role)
values('8d000000-0000-0000-0000-000000000001','crm-batch2-upgrade@example.invalid','authenticated','authenticated');
update public.profiles set role='director' where id='8d000000-0000-0000-0000-000000000001';

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='8d000000-0000-0000-0000-000000000001';

select public.crm_create_followup_policy(
  '8d000000-0000-0000-0000-000000000002',
  '{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}'
);

do $$
declare created jsonb; lead_id uuid; qualified jsonb;
begin
  created := public.crm_create_manual_lead(
    '8d000000-0000-0000-0000-000000000003',
    '{"display_name":"CRM Batch 2 upgrade fixture","learner_name":"Synthetic learner","phone":"0612345678","source_label":"Upgrade verification"}'
  );
  lead_id := (created->'lead'->>'id')::uuid;
  qualified := public.crm_qualify_lead(
    '8d000000-0000-0000-0000-000000000004',
    jsonb_build_object(
      'lead_id',lead_id,
      'expected_version',(select version from public.crm_leads where id=lead_id),
      'conversation_channel','phone',
      'note','Synthetic upgrade verification',
      'qualification_step','enrollment',
      'next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')
    )
  );
end $$;

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
select public.crm_reconcile_external_deliveries();

do $$
begin
  if not exists (
    select 1
    from public.crm_external_deliveries d
    join public.crm_leads l on l.id=d.lead_id
    join public.crm_contacts c on c.id=l.contact_id
    where c.display_name='CRM Batch 2 upgrade fixture'
      and d.event_kind='qualified'
      and d.status='suppressed'
      and d.last_error_code='no_destination'
      and d.payload is null
  ) then
    raise exception 'Legacy 097 lifecycle fixture was not created';
  end if;
end $$;

commit;
\echo PASS synthetic migration 097 fixture
