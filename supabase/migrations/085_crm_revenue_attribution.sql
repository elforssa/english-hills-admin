-- Phase 7: derived revenue evidence only. No financial or lifecycle mutations.
begin;

create table public.crm_revenue_entries (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 financial_event_id uuid not null unique references public.financial_events(id) on delete restrict,
 lead_id uuid not null references public.crm_leads(id) on delete restrict,
 enrollment_id uuid not null references public.enrollments(id) on delete restrict,
 charge_id uuid not null references public.charges(id) on delete restrict,
 receipt_id uuid not null references public.receipts(id) on delete restrict,
 attribution_submission_id uuid not null references public.crm_submissions(id) on delete restrict,
 entry_kind text not null check(entry_kind in ('payment','reversal','correction')),
 amount_delta numeric(12,2) not null,
 currency text not null default 'MAD' check(currency='MAD'),
 effective_at timestamptz not null,
 receipt_business_date date not null,
 reverses_entry_id uuid references public.crm_revenue_entries(id) on delete restrict,
 reason text not null,
 source_key text not null unique,
 reconciled_by uuid references auth.users(id) on delete restrict
);
create index crm_revenue_lead_time on public.crm_revenue_entries(lead_id,effective_at,id);
create index crm_revenue_enrollment on public.crm_revenue_entries(enrollment_id);
create index crm_revenue_receipt on public.crm_revenue_entries(receipt_id);
create index crm_revenue_attribution on public.crm_revenue_entries(attribution_submission_id);
-- Keep transaction-end receipt reconciliation off full financial-event scans.
create index financial_events_crm_receipt_idx on public.financial_events(receipt_id,created_at,id)
 where event_type in ('payment_recorded','payment_voided');
-- financial_event_id already has a unique index.
alter table public.crm_revenue_entries enable row level security;
revoke all on public.crm_revenue_entries from public,anon,authenticated,service_role;
create trigger crm_revenue_immutable before update or delete on public.crm_revenue_entries
 for each row execute function crm_security.reject_history_mutation();
create trigger crm_revenue_no_truncate before truncate on public.crm_revenue_entries
 for each statement execute function crm_security.reject_history_mutation();

-- Both explicit financial links are required. Missing historical links remain
-- unattributed; conflicting links are review cases, never identity guesses.
create function crm_security.revenue_receipt_context(receipt uuid) returns jsonb
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare r public.receipts%rowtype; c public.charges%rowtype; e public.enrollments%rowtype; l public.crm_leads%rowtype; begin
 select * into r from public.receipts where id=receipt;
 if not found then return jsonb_build_object('status','missing_receipt'); end if;
 select * into c from public.charges where id=r.charge_id;
 if not found or r.enrollment_id is null or c.enrollment_id is null then return jsonb_build_object('status',case when exists(select 1 from public.crm_revenue_entries where receipt_id=receipt) then 'review_frozen_attribution' else 'missing_links' end); end if;
 if r.enrollment_id<>c.enrollment_id or r.student_id is distinct from c.student_id then return jsonb_build_object('status','review_financial_identity'); end if;
 select * into e from public.enrollments where id=r.enrollment_id;
 if not found or e.student_id is distinct from r.student_id then return jsonb_build_object('status','review_enrollment_identity'); end if;
 select * into l from public.crm_leads where enrollment_id=e.id;
 if not found then return jsonb_build_object('status',case when exists(select 1 from public.crm_revenue_entries where receipt_id=receipt) then 'review_frozen_attribution' else 'unattributed' end); end if;
 if l.merged_into_lead_id is not null or l.student_id is distinct from e.student_id or l.first_submission_id is null then
  return jsonb_build_object('status','review_crm_identity'); end if;
 if not exists(select 1 from public.financial_events f where f.receipt_id=r.id and f.charge_id=c.id and f.event_type='payment_recorded') then
  return jsonb_build_object('status','missing_payment_evidence'); end if;
 if r.montant_paye not between 0 and 9999999999.99 or r.montant_paye='NaN'::numeric then return jsonb_build_object('status','review_receipt_amount'); end if;
 if exists(select 1 from public.crm_revenue_entries x where x.receipt_id=r.id and
  (x.lead_id<>l.id or x.enrollment_id<>e.id or x.charge_id<>c.id or x.attribution_submission_id<>l.first_submission_id)) then
  return jsonb_build_object('status','review_frozen_attribution'); end if;
 return jsonb_build_object('status','eligible','lead_id',l.id,'enrollment_id',e.id,'charge_id',c.id,
  'attribution_submission_id',l.first_submission_id,'business_date',r.date,
  'target',case when r.voided_at is not null or r.deleted_at is not null or c.voided_at is not null then 0 else r.montant_paye end);
end $$;

create function crm_security.reconcile_receipt_revenue(receipt uuid) returns jsonb
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare context jsonb; f public.financial_events%rowtype; current_amount numeric; delta numeric; previous_entry uuid;
 inserted integer:=0; conflicts integer:=0; begin
 -- Receipt locking serializes workers with receipt corrections. Do not lock the
 -- charge or CRM lead afterwards: finance/link commands already lock those.
 perform 1 from public.receipts where id=receipt for update;
 context:=crm_security.revenue_receipt_context(receipt);
 if context->>'status'<>'eligible' then return context||jsonb_build_object('entries_added',0); end if;
 select coalesce(sum(amount_delta),0) into current_amount from public.crm_revenue_entries where receipt_id=receipt;
 select count(*) into conflicts from public.financial_events ev where ev.receipt_id=receipt
  and ev.event_type in ('payment_recorded','payment_voided') and ev.charge_id is distinct from (context->>'charge_id')::uuid
  and not exists(select 1 from public.crm_revenue_entries x where x.financial_event_id=ev.id);
 for f in select ev.* from public.financial_events ev
  where ev.receipt_id=receipt and ev.event_type in ('payment_recorded','payment_voided') and ev.charge_id=(context->>'charge_id')::uuid
   and not exists(select 1 from public.crm_revenue_entries x where x.financial_event_id=ev.id)
  order by ev.created_at,case ev.event_type when 'payment_recorded' then 0 else 1 end,ev.id limit 1000 loop
  delta:=(context->>'target')::numeric-current_amount;
  select id into previous_entry from public.crm_revenue_entries where receipt_id=receipt and amount_delta>0 order by created_at,id limit 1;
  insert into public.crm_revenue_entries(financial_event_id,lead_id,enrollment_id,charge_id,receipt_id,
   attribution_submission_id,entry_kind,amount_delta,effective_at,receipt_business_date,reverses_entry_id,reason,source_key,reconciled_by)
  values(f.id,(context->>'lead_id')::uuid,(context->>'enrollment_id')::uuid,(context->>'charge_id')::uuid,receipt,
   (context->>'attribution_submission_id')::uuid,
   case when delta<0 then 'reversal' when delta>0 and current_amount=0 and f.event_type='payment_recorded' then 'payment' else 'correction' end,
   delta,f.created_at,(context->>'business_date')::date,case when delta<0 then previous_entry end,
   case when delta=0 then 'Receipt already reconciled to current valid amount' else 'Reconciled from authoritative receipt state' end,
   'revenue:'||f.id,auth.uid());
  current_amount:=current_amount+delta;inserted:=inserted+1;
 end loop;
 return jsonb_build_object('status',case when conflicts>0 then 'review_event_identity' else 'reconciled' end,
  'entries_added',inserted,'conflicting_events',conflicts,'recognized',current_amount,'currency','MAD');
end $$;

create function crm_security.reconcile_enrollment_revenue(enrollment uuid) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$ declare receipt uuid; begin
 -- Bounded catch-up; remaining older events stay discoverable by anti-join.
 for receipt in select distinct r.id from public.receipts r join public.financial_events f on f.receipt_id=r.id
  where r.enrollment_id=enrollment and f.event_type in ('payment_recorded','payment_voided')
   and not exists(select 1 from public.crm_revenue_entries x where x.financial_event_id=f.id)
  order by r.id limit 100 loop
  perform crm_security.reconcile_receipt_revenue(receipt);
 end loop;
end $$;

create function crm_security.revenue_event_deferred() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 if new.event_type in ('payment_recorded','payment_voided') and new.receipt_id is not null then
  perform crm_security.reconcile_receipt_revenue(new.receipt_id);
 end if;
 return null;
end $$;
create constraint trigger crm_revenue_financial_event after insert on public.financial_events
 deferrable initially deferred for each row execute function crm_security.revenue_event_deferred();

create function crm_security.revenue_link_deferred() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 if new.enrollment_id is not null and (tg_op='INSERT' or old.enrollment_id is distinct from new.enrollment_id) then
  perform crm_security.reconcile_enrollment_revenue(new.enrollment_id);
 end if;
 return null;
end $$;
create constraint trigger crm_revenue_enrollment_link after insert or update on public.crm_leads
 deferrable initially deferred for each row execute function crm_security.revenue_link_deferred();

-- Technical director tools only. Reconciliation appends source-derived entries;
-- callers cannot supply an amount, attribution, campaign, or lifecycle value.
create function public.crm_reconcile_receipt_revenue(p_receipt uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_reader(true);
 return crm_security.reconcile_receipt_revenue(p_receipt);
end $$;
create function public.crm_get_revenue_entries_for_lead(p_lead uuid,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(true);perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('currency','MAD','total',(select count(*) from public.crm_revenue_entries where lead_id=p_lead),
  'recognized',(select coalesce(sum(amount_delta),0) from public.crm_revenue_entries where lead_id=p_lead),
  'rows',coalesce(jsonb_agg(to_jsonb(x) order by x.effective_at,x.id),'[]'::jsonb)) into result
 from(select * from public.crm_revenue_entries where lead_id=p_lead order by effective_at,id limit p_limit offset p_offset)x;
 return result;
end $$;
create function public.crm_get_revenue_reconciliation_queue(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(true);perform crm_security.check_page(p_limit,p_offset);
 select coalesce(jsonb_agg(jsonb_build_object('financial_event_id',f.id,'receipt_id',f.receipt_id,'event_type',f.event_type,
  'status',case when f.charge_id is distinct from r.charge_id then 'review_event_identity'
    else crm_security.revenue_receipt_context(f.receipt_id)->>'status' end) order by f.created_at,f.id),'[]'::jsonb) into result
 from(select ev.* from public.financial_events ev where ev.event_type in ('payment_recorded','payment_voided')
  and not exists(select 1 from public.crm_revenue_entries x where x.financial_event_id=ev.id)
  order by ev.created_at,ev.id limit p_limit offset p_offset)f left join public.receipts r on r.id=f.receipt_id;
 return result;
end $$;
create function public.crm_reconcile_revenue_batch(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare receipt uuid; result jsonb:='[]'; begin
 perform crm_security.require_reader(true);perform crm_security.check_page(p_limit,0);
 -- Filter for explicit eligible links before LIMIT so old unattributed records
 -- cannot starve newly attributable historical events. No timestamp cursor.
 for receipt in select distinct r.id from public.receipts r join public.financial_events f on f.receipt_id=r.id
  where f.event_type in ('payment_recorded','payment_voided') and f.charge_id=r.charge_id
   and not exists(select 1 from public.crm_revenue_entries x where x.financial_event_id=f.id)
   and crm_security.revenue_receipt_context(r.id)->>'status'='eligible'
  order by r.id limit p_limit loop
  result:=result||jsonb_build_array(jsonb_build_object('receipt_id',receipt,'result',crm_security.reconcile_receipt_revenue(receipt)));
 end loop;
 return result;
end $$;

revoke all on function crm_security.revenue_receipt_context(uuid),crm_security.reconcile_receipt_revenue(uuid),
 crm_security.reconcile_enrollment_revenue(uuid),crm_security.revenue_event_deferred(),crm_security.revenue_link_deferred()
 from public,anon,authenticated,service_role;
revoke all on function public.crm_reconcile_receipt_revenue(uuid),public.crm_get_revenue_entries_for_lead(uuid,integer,integer),
 public.crm_get_revenue_reconciliation_queue(integer,integer),public.crm_reconcile_revenue_batch(integer)
 from public,anon,authenticated,service_role;
grant execute on function public.crm_reconcile_receipt_revenue(uuid),public.crm_get_revenue_entries_for_lead(uuid,integer,integer),
 public.crm_get_revenue_reconciliation_queue(integer,integer),public.crm_reconcile_revenue_batch(integer) to authenticated;
notify pgrst,'reload schema';
commit;
