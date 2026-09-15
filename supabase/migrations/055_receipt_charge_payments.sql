-- Receipt restructuring: a charge is the fee agreement; each non-zero payment
-- is an immutable issued receipt. Historical receipts are conservatively
-- represented as one legacy charge each (no installment relationships guessed).
begin;

-- Retire application semantics for image/media consent without destroying the
-- historical values during an ordinary rollout. Physical column deletion is
-- intentionally kept in supabase/manual/drop_photo_consent.sql.
drop trigger if exists stamp_photo_consent_t on public.students;
drop function if exists public.stamp_photo_consent();
alter table public.students drop constraint if exists students_photo_consent_check;
alter table public.students alter column photo_consent drop default;
alter table public.students alter column photo_consent drop not null;
alter table public.receipts drop constraint if exists receipts_photo_consent_check;

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  student_id uuid not null references public.students(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  session_type text not null check (session_type in (
    'Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
    'One-to-One','Mise à niveau','Other','Legacy'
  )),
  service_description text not null check (char_length(btrim(service_description)) between 2 and 240),
  plan_type text check (plan_type is null or plan_type in ('Standard','Premium')),
  level text,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  due_date date,
  created_by uuid references auth.users(id) on delete restrict,
  legacy boolean not null default false,
  legacy_receipt_id uuid,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete restrict,
  void_reason text,
  constraint charges_discount_check check (discount_amount <= gross_amount),
  constraint charges_actor_check check (legacy or created_by is not null),
  constraint charges_yearly_formula_check check (
    (session_type = 'Yearly' and plan_type in ('Standard','Premium'))
    or (session_type <> 'Yearly' and plan_type is null)
  ),
  constraint charges_other_description_check check (
    session_type <> 'Other' or char_length(btrim(service_description)) >= 3
  ),
  constraint charges_void_audit_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and (legacy or voided_by is not null) and char_length(btrim(void_reason)) >= 3)
  )
);

alter table public.charges
  add constraint charges_legacy_receipt_id_fkey
  foreign key (legacy_receipt_id) references public.receipts(id) on delete restrict;

create unique index charges_legacy_receipt_key on public.charges(legacy_receipt_id)
  where legacy_receipt_id is not null;
create index charges_student_idx on public.charges(student_id, created_at desc);
create index charges_due_idx on public.charges(due_date) where voided_at is null;

alter table public.receipts
  add column if not exists charge_id uuid references public.charges(id) on delete restrict,
  add column if not exists service_description text,
  add column if not exists transaction_reference text,
  add column if not exists payment_note text,
  add column if not exists actor_id uuid references auth.users(id) on delete restrict,
  add column if not exists actor_name text,
  add column if not exists gross_amount_snapshot numeric(12,2),
  add column if not exists discount_amount_snapshot numeric(12,2),
  add column if not exists net_amount_snapshot numeric(12,2),
  add column if not exists paid_before_snapshot numeric(12,2),
  add column if not exists balance_after_snapshot numeric(12,2),
  add column if not exists legacy boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete restrict,
  add column if not exists void_reason text,
  add column if not exists email_delivery_status text not null default 'pending'
    check (email_delivery_status in ('pending','queued','sent','failed','skipped')),
  add column if not exists email_request_id bigint,
  add column if not exists idempotency_key uuid;

-- Obsolete receipt fields stay available for legacy display, but are optional
-- for new payments and are never populated by the new transaction RPC.
alter table public.receipts alter column telephone drop not null;
alter table public.receipts alter column categorie drop not null;
alter table public.receipts alter column niveau drop not null;
alter table public.receipts alter column type_cours drop not null;
alter table public.receipts alter column plan_type drop not null;
alter table public.receipts drop constraint if exists receipts_plan_type_check;
alter table public.receipts add constraint receipts_plan_type_check
  check (plan_type is null or plan_type in ('Standard','Premium'));
alter table public.receipts add constraint receipts_payment_positive_check
  check (charge_id is null or legacy or montant_paye > 0) not valid;
alter table public.receipts add constraint receipts_balance_snapshot_check
  check (balance_after_snapshot is null or balance_after_snapshot >= 0);
alter table public.receipts add constraint receipts_void_audit_check check (
  (voided_at is null and voided_by is null and void_reason is null)
  or (voided_at is not null and voided_by is not null and char_length(btrim(void_reason)) >= 3)
);
create unique index if not exists receipts_idempotency_key_key
  on public.receipts(idempotency_key) where idempotency_key is not null;
create index if not exists receipts_charge_idx on public.receipts(charge_id, date, created_at)
  where deleted_at is null;

-- Each historical receipt becomes one explicit legacy agreement. This keeps
-- the old due/paid semantics and prevents double counting without inventing
-- allocations or payment dates between records that merely look similar.
insert into public.charges (
  student_id, enrollment_id, session_type, service_description, plan_type, level,
  gross_amount, discount_amount, due_date, created_by, legacy, legacy_receipt_id,
  voided_at, voided_by, void_reason, created_at, updated_at
)
select r.student_id, r.enrollment_id, 'Legacy',
       concat('Reçu historique ', coalesce(r.receipt_number, r.id::text)),
       null, r.niveau,
       r.montant_total,
       round(r.montant_total * coalesce(r.remise, 0) / 100, 2),
       null,
       (select id from auth.users order by created_at limit 1),
       true, r.id, r.deleted_at, null,
       case when r.deleted_at is not null then 'Suppression historique' else null end,
       r.created_at, r.updated_at
from public.receipts r
where r.student_id is not null
  and not exists (select 1 from public.charges c where c.legacy_receipt_id = r.id);

update public.receipts r
set charge_id = c.id,
    service_description = coalesce(r.service_description, c.service_description),
    actor_id = coalesce(r.actor_id, c.created_by),
    gross_amount_snapshot = coalesce(r.gross_amount_snapshot, c.gross_amount),
    discount_amount_snapshot = coalesce(r.discount_amount_snapshot, c.discount_amount),
    net_amount_snapshot = coalesce(r.net_amount_snapshot, c.gross_amount - c.discount_amount),
    paid_before_snapshot = coalesce(r.paid_before_snapshot, 0),
    balance_after_snapshot = coalesce(r.balance_after_snapshot,
      greatest(0, c.gross_amount - c.discount_amount - r.montant_paye)),
    legacy = true,
    email_delivery_status = case when r.email is null then 'skipped' else 'sent' end
from public.charges c
where c.legacy_receipt_id = r.id and r.charge_id is null;

alter table public.receipts validate constraint receipts_payment_positive_check;

-- Rows with a deleted/missing historical student remain readable as receipts,
-- but intentionally await manual reconciliation instead of fabricated links.

alter table public.charges enable row level security;
create policy "charges staff read" on public.charges for select to authenticated
  using (public.get_my_role() in ('admin','director'));
create policy "charges family read" on public.charges for select to authenticated
  using (student_id in (select public.get_visible_student_ids()));

create or replace view public.charge_balances
with (security_invoker = true)
as
select c.*,
       (c.gross_amount - c.discount_amount)::numeric(12,2) as net_amount,
       coalesce(sum(r.montant_paye) filter (
         where r.voided_at is null and r.deleted_at is null
       ), 0)::numeric(12,2) as paid_amount,
       greatest(0, c.gross_amount - c.discount_amount - coalesce(sum(r.montant_paye) filter (
         where r.voided_at is null and r.deleted_at is null
       ), 0))::numeric(12,2) as balance,
       case
         when c.voided_at is not null then 'Annulée'
         when c.gross_amount - c.discount_amount - coalesce(sum(r.montant_paye) filter (
           where r.voided_at is null and r.deleted_at is null
         ), 0) <= 0 then 'Soldé'
         when c.due_date < current_date then 'En retard'
         when coalesce(sum(r.montant_paye) filter (
           where r.voided_at is null and r.deleted_at is null
         ), 0) > 0 then 'Acompte versé'
         else 'En attente'
       end as settlement_status
from public.charges c
left join public.receipts r on r.charge_id = c.id
group by c.id;
grant select on public.charge_balances to authenticated;

create or replace view public.legacy_receipt_reconciliation
with (security_invoker = true)
as
select id,receipt_number,date,nom_prenom,montant_total,montant_paye,session_type,
  'Student missing or deleted; no charge was fabricated'::text as reconciliation_reason
from public.receipts where charge_id is null;
grant select on public.legacy_receipt_reconciliation to authenticated;

create table public.financial_requests (
  idempotency_key uuid primary key,
  created_at timestamptz not null default now(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  charge_id uuid references public.charges(id) on delete restrict,
  receipt_id uuid references public.receipts(id) on delete restrict
);
alter table public.financial_requests enable row level security;
revoke all on public.financial_requests from public, anon, authenticated;

create table public.financial_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('charge_created','payment_recorded','payment_voided')),
  charge_id uuid not null references public.charges(id) on delete restrict,
  receipt_id uuid references public.receipts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb
);
alter table public.financial_events enable row level security;
create policy "financial events director read" on public.financial_events for select to authenticated
  using (public.get_my_role() = 'director');
revoke insert, update, delete, truncate on public.financial_events from public,anon,authenticated;
grant select on public.financial_events to authenticated;
grant select,insert,update,delete on public.financial_events to service_role;

create or replace function public.create_charge_payment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_student public.students%rowtype;
  v_charge public.charges%rowtype;
  v_receipt public.receipts%rowtype;
  v_existing public.financial_requests%rowtype;
  v_student_id uuid := nullif(p_payload->>'student_id','')::uuid;
  v_charge_id uuid := nullif(p_payload->>'charge_id','')::uuid;
  v_key uuid := (p_payload->>'idempotency_key')::uuid;
  v_session text := nullif(btrim(p_payload->>'session_type'),'');
  v_service text := nullif(btrim(p_payload->>'service_description'),'');
  v_plan text := nullif(btrim(p_payload->>'plan_type'),'');
  v_level text := nullif(btrim(p_payload->>'level'),'');
  v_gross numeric(12,2) := round(coalesce(nullif(p_payload->>'gross_amount','')::numeric, 0), 2);
  v_discount numeric(12,2) := round(coalesce(nullif(p_payload->>'discount_amount','')::numeric, 0), 2);
  v_payment numeric(12,2) := round(coalesce(nullif(p_payload->>'payment_amount','')::numeric, 0), 2);
  v_paid numeric(12,2);
  v_net numeric(12,2);
  v_balance numeric(12,2);
  v_status text;
  v_actor_name text;
  v_new_charge boolean := false;
begin
  if v_actor is null or public.get_my_role() not in ('admin','director') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_key is null then raise exception 'An idempotency key is required.'; end if;
  perform pg_advisory_xact_lock(hashtext(v_key::text));
  select * into v_existing from public.financial_requests where idempotency_key = v_key;
  if found then
    return jsonb_build_object('charge_id',v_existing.charge_id,'receipt_id',v_existing.receipt_id,'replayed',true);
  end if;
  if v_payment < 0 then raise exception 'Payment amount cannot be negative.'; end if;

  if v_student_id is null then
    if char_length(btrim(coalesce(p_payload->>'student_name',''))) < 2 then
      raise exception 'Student name is required.';
    end if;
    insert into public.students(full_name, telephone, email, parent_email, status)
    values (btrim(p_payload->>'student_name'), nullif(btrim(p_payload->>'phone'),''),
      nullif(btrim(p_payload->>'student_email'),''), nullif(btrim(p_payload->>'parent_email'),''), 'Prospect')
    returning * into v_student;
    v_student_id := v_student.id;
  else
    select * into v_student from public.students where id = v_student_id and deleted_at is null;
    if not found then raise exception 'Student not found.'; end if;
    if coalesce((p_payload->>'update_contacts')::boolean, false) then
      update public.students set
        telephone = nullif(btrim(p_payload->>'phone'),''),
        email = nullif(btrim(p_payload->>'student_email'),''),
        parent_email = nullif(btrim(p_payload->>'parent_email'),'')
      where id = v_student_id returning * into v_student;
    end if;
  end if;

  if v_charge_id is null then
    if v_session is null or v_service is null then
      raise exception 'Session and service/period are required for a new charge.';
    end if;
    if v_session = 'Yearly' and v_plan not in ('Standard','Premium') then
      raise exception 'A Yearly charge requires Standard or Premium.';
    elsif v_session <> 'Yearly' and v_plan = 'Premium' then
      raise exception 'Premium is available only for Yearly charges.';
    elsif v_session <> 'Yearly' then
      v_plan := null;
    end if;
    if v_gross < 0 or v_discount < 0 or v_discount > v_gross then
      raise exception 'Invalid price or discount.';
    end if;
    insert into public.charges(student_id, session_type, service_description, plan_type,
      level, gross_amount, discount_amount, due_date, created_by)
    values (v_student_id, v_session, v_service, v_plan, v_level, v_gross, v_discount,
      nullif(p_payload->>'due_date','')::date, v_actor)
    returning * into v_charge;
    v_new_charge := true;
  else
    select * into v_charge from public.charges
      where id = v_charge_id and student_id = v_student_id and voided_at is null for update;
    if not found then raise exception 'Open charge not found for this student.'; end if;
  end if;

  v_net := v_charge.gross_amount - v_charge.discount_amount;
  select coalesce(sum(montant_paye),0) into v_paid from public.receipts
    where charge_id = v_charge.id and voided_at is null and deleted_at is null;
  v_balance := round(v_net - v_paid, 2);
  if v_payment > v_balance then
    raise exception 'Payment exceeds the remaining balance of % MAD.', v_balance;
  end if;

  insert into public.financial_requests(idempotency_key, actor_id, charge_id)
  values (v_key, v_actor, v_charge.id);

  if v_new_charge then
    insert into public.financial_events(event_type,charge_id,actor_id,metadata)
    values ('charge_created',v_charge.id,v_actor,jsonb_build_object('gross_amount',v_charge.gross_amount,'discount_amount',v_charge.discount_amount));
  end if;

  if v_payment = 0 then
    return jsonb_build_object('charge_id',v_charge.id,'receipt_id',null,'balance',v_balance,'replayed',false);
  end if;

  v_balance := round(v_balance - v_payment, 2);
  v_status := case when v_balance = 0 then 'Soldé' when v_charge.due_date < current_date then 'En retard' else 'Acompte versé' end;
  select coalesce(full_name, email) into v_actor_name from public.profiles where id = v_actor;
  insert into public.receipts(
    student_id, charge_id, date, nom_prenom, telephone, email, date_naissance,
    session_type, plan_type, niveau, service_description, montant_total, remise,
    montant_paye, mode_paiement, statut_paiement, transaction_reference,
    payment_note, observation, actor_id, actor_name, gross_amount_snapshot,
    discount_amount_snapshot, net_amount_snapshot, paid_before_snapshot,
    balance_after_snapshot, idempotency_key, email_delivery_status
  ) values (
    v_student.id, v_charge.id, coalesce(nullif(p_payload->>'payment_date','')::date,current_date),
    v_student.full_name, v_student.telephone,
    coalesce(v_student.parent_email, v_student.email), v_student.date_naissance,
    v_charge.session_type, v_charge.plan_type, v_charge.level, v_charge.service_description,
    v_charge.gross_amount,
    case when v_charge.gross_amount = 0 then 0 else round(v_charge.discount_amount * 100 / v_charge.gross_amount, 2) end,
    v_payment, p_payload->>'payment_method', v_status,
    nullif(btrim(p_payload->>'transaction_reference'),''), nullif(btrim(p_payload->>'note'),''),
    nullif(btrim(p_payload->>'note'),''), v_actor, v_actor_name,
    v_charge.gross_amount, v_charge.discount_amount, v_net, v_paid, v_balance, v_key,
    case when coalesce(v_student.parent_email, v_student.email) is null then 'skipped' else 'pending' end
  ) returning * into v_receipt;
  update public.financial_requests set receipt_id = v_receipt.id where idempotency_key = v_key;
  insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
  values ('payment_recorded',v_charge.id,v_receipt.id,v_actor,jsonb_build_object('amount',v_payment,'balance_after',v_balance));
  return jsonb_build_object('charge_id',v_charge.id,'receipt_id',v_receipt.id,'balance',v_balance,'replayed',false);
end;
$$;

create or replace function public.void_financial_receipt(
  p_receipt_id uuid, p_reason text, p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_receipt public.receipts%rowtype;
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'A correction reason is required.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key::text));
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then raise exception 'Receipt not found.'; end if;
  if v_receipt.voided_at is not null then
    return jsonb_build_object('receipt_id',v_receipt.id,'already_voided',true);
  end if;
  update public.receipts set voided_at=now(), voided_by=auth.uid(), void_reason=btrim(p_reason),
    email_delivery_status='skipped'
  where id=p_receipt_id;
  insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
  values ('payment_voided',v_receipt.charge_id,v_receipt.id,auth.uid(),jsonb_build_object('amount',v_receipt.montant_paye,'reason',btrim(p_reason)));
  return jsonb_build_object('receipt_id',p_receipt_id,'charge_id',v_receipt.charge_id,'already_voided',false);
end;
$$;

-- Financial rows are written only through audited transactional RPCs.
revoke insert, update, delete, truncate on public.receipts, public.charges
  from public, anon, authenticated;
grant select on public.receipts, public.charges to authenticated;
grant select, insert, update, delete on public.receipts, public.charges, public.financial_requests to service_role;
revoke execute on function public.create_charge_payment(jsonb), public.void_financial_receipt(uuid,text,uuid)
  from public, anon;
grant execute on function public.create_charge_payment(jsonb), public.void_financial_receipt(uuid,text,uuid)
  to authenticated;

create or replace function public.get_finance_charge_summary()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or public.get_my_role() not in ('admin','director') then raise exception 'Forbidden' using errcode='42501'; end if;
  select jsonb_build_object(
    'total_encaisse', coalesce((select sum(montant_paye) from receipts where voided_at is null and deleted_at is null),0),
    'total_du', coalesce((select sum(net_amount) from charge_balances where voided_at is null),0),
    'total_restant', coalesce((select sum(balance) from charge_balances where voided_at is null),0),
    'count_en_retard', (select count(*) from charge_balances where settlement_status='En retard'),
    'count_solde', (select count(*) from charge_balances where settlement_status='Soldé'),
    'legacy_unreconciled', (select count(*) from receipts where charge_id is null),
    'by_program', coalesce((select jsonb_agg(jsonb_build_object('program',session_type,'encaisse',encaisse,'restant',restant) order by session_type)
      from (select session_type,sum(paid_amount) encaisse,sum(balance) restant from charge_balances where voided_at is null group by session_type) grouped),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.get_unpaid_charges(lim int default 50)
returns table(id uuid, student_id uuid, nom_prenom text, telephone text, session_type text,
  service_description text, due_date date, restant numeric, settlement_status text)
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id,c.student_id,s.full_name,s.telephone,c.session_type,c.service_description,c.due_date,c.balance,c.settlement_status
  from public.charge_balances c join public.students s on s.id=c.student_id
  where public.get_my_role() in ('admin','director') and c.voided_at is null and c.balance>0
  order by (c.settlement_status='En retard') desc,c.due_date nulls last,c.balance desc limit lim
$$;

create or replace function public.get_monthly_finance_summary(p_month_start date)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.get_my_role() in ('admin','director') then jsonb_build_object(
    'encaisse',coalesce((select sum(montant_paye) from receipts where voided_at is null and deleted_at is null and date>=p_month_start and date<(p_month_start+interval '1 month')::date),0),
    'total',coalesce((select sum(net_amount) from charge_balances where voided_at is null and created_at>=p_month_start and created_at<(p_month_start+interval '1 month')),0),
    'restant',coalesce((select sum(balance) from charge_balances where voided_at is null and created_at>=p_month_start and created_at<(p_month_start+interval '1 month')),0),
    'count',coalesce((select count(*) from receipts where voided_at is null and deleted_at is null and date>=p_month_start and date<(p_month_start+interval '1 month')::date),0)
  ) else null end
$$;

create or replace function public.get_finance_year_months(p_year int)
returns table(month_idx int, encaisse numeric, facture numeric)
language sql stable security definer set search_path=public,pg_temp as $$
  with months as (select generate_series(0,11) month_idx),
  paid as (select extract(month from date)::int-1 month_idx,sum(montant_paye) encaisse from receipts where voided_at is null and deleted_at is null and extract(year from date)=p_year group by 1),
  billed as (select extract(month from created_at)::int-1 month_idx,sum(gross_amount-discount_amount) facture from charges where voided_at is null and extract(year from created_at)=p_year group by 1)
  select m.month_idx,coalesce(p.encaisse,0),coalesce(b.facture,0) from months m left join paid p using(month_idx) left join billed b using(month_idx)
  where public.get_my_role() in ('admin','director') order by m.month_idx
$$;
revoke execute on function public.get_finance_charge_summary(), public.get_unpaid_charges(int), public.get_monthly_finance_summary(date), public.get_finance_year_months(int) from public,anon;
grant execute on function public.get_finance_charge_summary(), public.get_unpaid_charges(int), public.get_monthly_finance_summary(date), public.get_finance_year_months(int) to authenticated;

-- The pg_net worker starts queued HTTP requests only after commit. Track the
-- queued request and never send a zero-payment charge (no receipt exists).
create or replace function public.handle_new_receipt()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare edge_url text; auth_token text; request_id bigint;
begin
  if new.email is null then return new; end if;
  select decrypted_secret into auth_token from vault.decrypted_secrets where name='receipt_webhook_token';
  select decrypted_secret into edge_url from vault.decrypted_secrets where name='receipt_webhook_url';
  if auth_token is null or edge_url is null then return new; end if;
  select net.http_post(url=>edge_url,
    headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||auth_token),
    body=>jsonb_build_object('type','INSERT','table','receipts','schema','public','record',row_to_json(new)))
    into request_id;
  update public.receipts set email_delivery_status='queued', email_request_id=request_id where id=new.id;
  return new;
exception when others then
  update public.receipts set email_delivery_status='failed' where id=new.id;
  return new;
end $$;

drop trigger if exists validate_receipt_academic_links_trigger on public.receipts;
notify pgrst, 'reload schema';
commit;
