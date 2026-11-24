-- Restore for migration 137 (RWR-r5 PR A2, M-A2: one next action enforced).
-- Plan §10, M-A2 row: « drop the index and triggers; re-grant the wrappers (the D1
-- functions are not restored: D1 can no longer be reverted after M-A2) ».
--
-- Run only with its own owner approval. Order: the application first when the
-- PR A2 build is the one deployed (the A2 drawer calls crm_close_prospect and
-- crm_reopen_prospect, which exist since 136, so an A2 build keeps working after
-- this restore; an older build needs the re-granted wrappers below).
--
-- What it does: drops the two deferred trigger functions and their three triggers
-- and the unique index crm_tasks_one_open_per_lead; re-grants execute on the twelve
-- old command wrappers to authenticated, and the placement_tests grants of anon and
-- authenticated's TRUNCATE, as 136 left them. What it keeps on purpose:
--  * crm_security.set_next_action and crm_security.placement_no_replan stay in their
--    137 bodies (136 minus the D1 data-step bypass). Without the D1 functions the
--    bypass has no caller, and every other branch is identical to 136;
--  * the D1 functions stay dropped; crm_data_step_journal and its rows are untouched.
-- It changes no data and refuses, changing nothing, unless migration 137 is applied.
-- The ledger row 137 is removed by the operator wrapper, not here.
begin;

do $$ begin
  if to_regclass('public.crm_tasks_one_open_per_lead') is null
     or to_regprocedure('crm_security.next_action_presence()') is null then
    raise exception 'Restore 137: migration 137 is not applied' using errcode = '55000';
  end if;
end $$;

drop trigger crm_next_action_presence on public.crm_leads;
drop trigger crm_next_action_presence on public.crm_tasks;
drop trigger crm_planned_test_placement on public.placement_tests;
drop function crm_security.next_action_presence();
drop function crm_security.assert_next_action_state(uuid);
drop index public.crm_tasks_one_open_per_lead;

grant execute on function
  public.crm_add_note(uuid,jsonb),
  public.crm_record_call_outcome(uuid,jsonb),
  public.crm_record_whatsapp(uuid,jsonb),
  public.crm_record_conversation(uuid,jsonb),
  public.crm_record_conversation_decision(uuid,jsonb),
  public.crm_qualify_lead(uuid,jsonb),
  public.crm_schedule_task(uuid,jsonb),
  public.crm_complete_task(uuid,jsonb),
  public.crm_cancel_task(uuid,jsonb),
  public.crm_close_lost(uuid,jsonb),
  public.crm_close_not_qualified(uuid,jsonb),
  public.crm_reopen_lead(uuid,jsonb)
to authenticated;

-- placement_tests grants as 136 left them.
grant select, delete, truncate, references, trigger, maintain on table public.placement_tests to anon;
grant insert (id,created_at,updated_at,student_id,student_name,date_test,heure,examinateur,score,niveau_recommande,status,groupe_affecte_id,notes),
      update (id,created_at,updated_at,student_id,student_name,date_test,heure,examinateur,score,niveau_recommande,status,groupe_affecte_id,notes)
  on table public.placement_tests to anon;
grant truncate on table public.placement_tests to authenticated;

do $$ begin
  if to_regclass('public.crm_tasks_one_open_per_lead') is not null
     or exists (select 1 from pg_trigger where tgname in ('crm_next_action_presence','crm_planned_test_placement'))
     or not has_function_privilege('authenticated', 'public.crm_close_lost(uuid,jsonb)', 'execute') then
    raise exception 'Restore 137: incomplete' using errcode = '55000';
  end if;
end $$;

commit;
