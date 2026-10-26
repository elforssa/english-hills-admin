-- Payment corrections, receipt numbering and finance guardrails (plan PCR-r2,
-- ADR-012; release E-2). Local Supabase only; synthetic fixtures; everything
-- rolls back. Covers gap-free immutable numbering (P2), the void review and
-- the Q1-B clear (P1), the lifecycle hold (P1.5), the desk guardrails (P3),
-- Casablanca dates and the obsolete functions (P4) and the director list (P1.6).
-- The owner-level session-user guard needs separate logins and runs in
-- scripts/test-receipt-concurrency.sh.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$ begin
  if value is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('ebe00000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
-- Act as a stored-role user through the API role, as PostgREST does.
create function pg_temp.act(i integer) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', case when i is null then '' else pg_temp.id(i)::text end, true);
  perform set_config('request.jwt.claims', case when i is null then '{"role":"anon"}'
    else json_build_object('sub', pg_temp.id(i), 'role', 'authenticated')::text end, true);
  execute case when i is null then 'set local role anon' else 'set local role authenticated' end;
end $$;
create function pg_temp.owner() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Expects one SQLSTATE and, when given, one exact message; the statement's effects roll back.
create function pg_temp.fails(statement text, code text, message text default null) returns void language plpgsql as $$
declare st text; msg text; begin
  begin execute statement;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    if st is distinct from code or (message is not null and msg is distinct from message) then
      raise exception 'FAIL: expected %/% from %, got %/%', code, message, statement, st, msg;
    end if;
    return;
  end;
  raise exception 'FAIL: expected % from %', code, statement;
end $$;
-- Fixture readers run as the owner whatever the acting role.
create function pg_temp.counter() returns bigint language sql security definer as $$
  select last_value from public.receipt_number_counters where series = 'EH' $$;
create function pg_temp.num(p uuid) returns text language sql security definer as $$
  select receipt_number from public.receipts where id = p $$;
create function pg_temp.enr(p uuid) returns public.enrollments language sql security definer as $$
  select * from public.enrollments where id = p $$;
create function pg_temp.lead(p uuid) returns public.crm_leads language sql security definer as $$
  select * from public.crm_leads where id = p $$;
create function pg_temp.reviews(p uuid, kind text) returns bigint language sql security definer as $$
  select count(*) from public.crm_activities where lead_id = p and event_type = kind $$;
create function pg_temp.pay(i integer, payload jsonb) returns jsonb language plpgsql as $$ begin
  perform pg_temp.act(i);
  return public.create_charge_payment(payload || jsonb_build_object('payment_method', 'Espèces',
    'idempotency_key', coalesce(payload->>'idempotency_key', gen_random_uuid()::text)));
end $$;
create function pg_temp.open_to_api(t text) returns void language plpgsql as $$ begin
  execute format('grant all on %s to public', t);
end $$;

-- Users: 1 director, 2 admin, 3 receptionist, 4 teacher, 5 parent.
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'batch-e-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 5) i;
update public.profiles p set role = r.role
from (values (1, 'director'), (2, 'admin'), (3, 'receptionist'), (4, 'teacher'), (5, 'parent')) r(i, role)
where p.id = pg_temp.id(r.i);
-- Learners 101..140, one per scenario.
insert into public.students(id, full_name, status, session_type)
select pg_temp.id(i), 'Batch E learner ' || i, 'Prospect', 'Adults' from generate_series(101, 140) i;
create temp table e2(k text primary key, v jsonb);
select pg_temp.open_to_api('e2');

-- ===========================================================================
-- P2 numbering
-- ===========================================================================
select pg_temp.ok(pg_temp.counter() >= coalesce((select max((substring(receipt_number from '^EH-[0-9]{4}-([0-9]+)$'))::bigint)
  from public.receipts), 0), 'the counter is never behind the largest issued number');
select pg_temp.ok(pg_get_functiondef('public.business_date(timestamptz)'::regprocedure) ~ 'Africa/Casablanca'
  and pg_get_functiondef('public.business_date(timestamptz)'::regprocedure) !~ '\+0[01]', 'business date by zone name, never a fixed offset');
select pg_temp.ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r,
  unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p where has_table_privilege(r, 'public.receipt_number_counters', p)),
  'no API privilege on the counter');

-- Truncation: a cascading TRUNCATE cannot reach the trigger in a test (it needs TRUNCATE on
-- the CRM history tables first), so the statement trigger is checked in the catalog; it shares
-- the row guard exercised below.
select pg_temp.ok(exists(select 1 from pg_trigger where tgrelid = 'public.receipts'::regclass and tgname = 'receipts_no_truncate'
  and tgenabled = 'O' and tgtype & 32 <> 0 and tgfoid = 'finance_security.guard_receipt_delete()'::regprocedure), 'BEFORE TRUNCATE guard');
select pg_temp.ok(exists(select 1 from pg_trigger where tgrelid = 'public.receipts'::regclass and tgname = 'receipts_no_hard_delete'
  and tgenabled = 'O' and tgfoid = 'finance_security.guard_receipt_delete()'::regprocedure), 'BEFORE DELETE guard');
insert into e2 values ('c0', to_jsonb(pg_temp.counter()));
insert into e2 select 'first', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(101), 'session_type', 'Adults',
  'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 300));
insert into e2 select 'second', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(101), 'charge_id',
  (select v->>'charge_id' from e2 where k = 'first'), 'payment_amount', 100));
select pg_temp.owner();
select pg_temp.ok(pg_temp.counter() = (select v::bigint + 2 from e2 where k = 'c0'), 'two receipts: counter +2');
select pg_temp.ok(pg_temp.num((select (v->>'receipt_id')::uuid from e2 where k = 'second'))
  = 'EH-' || to_char(public.business_date(), 'YYYY') || '-' || lpad((pg_temp.counter())::text, greatest(5, length(pg_temp.counter()::text)), '0'),
  'consecutive numbers in the issue year');

-- A payment that fails after the receipt insert gives its number back.
insert into public.enrollments(id, student_id, status, session_type, school_year)
values (pg_temp.id(901), pg_temp.id(140), 'Submitted', 'Adults', '2026/2027');
insert into e2 values ('c1', to_jsonb(pg_temp.counter()));
select pg_temp.act(2);
select pg_temp.fails(format($q$select public.create_charge_payment(%L::jsonb)$q$, jsonb_build_object('student_id', pg_temp.id(102),
  'enrollment_id', pg_temp.id(901), 'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 500,
  'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid())), 'P0001',
  'Selected enrollment does not match this student, session and school year.');
select pg_temp.fails(format($q$select public.create_charge_payment(%L::jsonb)$q$, jsonb_build_object('student_id', pg_temp.id(102),
  'session_type', 'Other', 'service_detail', 'Synthetic service', 'enrollment_id', pg_temp.id(901), 'school_year', '2026/2027',
  'gross_amount', 500, 'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid())), 'P0001',
  'This service cannot be linked to a tuition enrollment.');
select pg_temp.owner();
select pg_temp.ok(pg_temp.counter() = (select v::bigint from e2 where k = 'c1'), 'failed payments leave the counter unchanged');
insert into e2 select 'after_failure', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(102), 'session_type', 'Adults',
  'school_year', '2026/2027', 'gross_amount', 500, 'payment_amount', 100));
select pg_temp.owner();
select pg_temp.ok(pg_temp.counter() = (select v::bigint + 1 from e2 where k = 'c1'), 'the next committed receipt is exactly +1');

-- A supplied number is refused; numbers never change; receipts are never removed,
-- for every role including service_role.
select pg_temp.fails($q$insert into public.receipts(nom_prenom, date, montant_paye, receipt_number) values ('x', current_date, 1, 'EH-2026-99999')$q$,
  '22023', 'Receipt numbers are assigned by the database.');
select pg_temp.fails($q$insert into public.receipts(nom_prenom, date, montant_paye, receipt_number) values ('x', current_date, 1, '')$q$,
  '22023', 'Receipt numbers are assigned by the database.');
do $$ declare r text; v uuid := (select (v->>'receipt_id')::uuid from e2 where k = 'first'); begin
  foreach r in array array['postgres', 'service_role'] loop
    execute format('set local role %I', r);
    perform pg_temp.fails(format('update public.receipts set receipt_number = %L where id = %L', 'EH-2026-77777', v), '42501', 'Receipt numbers cannot be changed.');
    perform pg_temp.fails(format('update public.receipts set receipt_number = null where id = %L', v), '42501', 'Receipt numbers cannot be changed.');
    perform pg_temp.fails(format('delete from public.receipts where id = %L', v), '42501', 'Receipts are never deleted: void them instead.');
    execute 'reset role';
  end loop;
end $$;
-- Other columns stay writable for the owner; the number is untouched.
update public.receipts set payment_note = 'synthetic note' where id = (select (v->>'receipt_id')::uuid from e2 where k = 'first');
-- The two sanctioned exceptions (owner-level session user + transaction-local setting).
do $$ declare v uuid := (select (v->>'receipt_id')::uuid from e2 where k = 'first'); h uuid; begin
  set local english_hills.receipt_test_cleanup = 'on';
  perform pg_temp.fails(format('delete from public.receipts where id = %L', v), '23503');  -- reaches the foreign keys
  set local english_hills.receipt_test_cleanup = 'off';
  -- Historical numbering: an unnumbered receipt, the EH-HIST pattern, the setting.
  alter table public.receipts disable trigger set_receipt_number_t;
  insert into public.receipts(nom_prenom, date, montant_total, montant_paye, mode_paiement, email_delivery_status) values ('Historique synthétique', '2026-09-10', 50, 50, 'Espèces', 'unknown')
  returning id into h;
  alter table public.receipts enable trigger set_receipt_number_t;
  perform pg_temp.fails(format('update public.receipts set receipt_number = %L where id = %L', 'EH-HIST-2026-0001', h), '42501');
  set local english_hills.historical_receipt_numbering = 'on';
  perform pg_temp.fails(format('update public.receipts set receipt_number = %L where id = %L', 'EH-2026-00001', h), '42501');
  perform pg_temp.fails(format('update public.receipts set receipt_number = %L where id = %L', 'EH-HIST-2026-1', h), '42501');
  update public.receipts set receipt_number = 'EH-HIST-2026-0001' where id = h;
  perform pg_temp.fails(format('update public.receipts set receipt_number = %L where id = %L', 'EH-HIST-2026-0002', h), '42501');
  set local english_hills.historical_receipt_numbering = 'off';
  set local english_hills.receipt_test_cleanup = 'on';
  delete from public.receipts where id = h;
  set local english_hills.receipt_test_cleanup = 'off';
end $$;
-- Five digits at least, never truncated; the year comes from the business date of issue.
do $$ declare r jsonb; begin
  update public.receipt_number_counters set last_value = 99999 where series = 'EH';
  r := pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(103), 'session_type', 'Adults', 'school_year', '2026/2027',
    'gross_amount', 100, 'payment_amount', 10));
  perform pg_temp.owner();
  perform pg_temp.ok(pg_temp.num((r->>'receipt_id')::uuid) ~ '^EH-[0-9]{4}-100000$', 'six-digit suffix: ' || pg_temp.num((r->>'receipt_id')::uuid));
  raise exception 'rollback' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end $$;
select pg_temp.owner();
do $$ declare r jsonb; begin
  -- Issued on 2027-01-01 (business date) for a payment dated 2026-12-31: the year is the year of issue.
  create or replace function public.business_date(p_at timestamptz default now()) returns date language sql stable
    set search_path = pg_catalog, pg_temp as $f$ select date '2027-01-01' $f$;
  r := pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(104), 'session_type', 'Adults', 'school_year', '2026/2027',
    'gross_amount', 100, 'payment_amount', 10, 'payment_date', '2026-12-31'));
  perform pg_temp.owner();
  perform pg_temp.ok(pg_temp.num((r->>'receipt_id')::uuid) like 'EH-2027-%', 'issue year, not payment year: ' || pg_temp.num((r->>'receipt_id')::uuid));
  raise exception 'rollback' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end $$;
select pg_temp.owner();
select pg_temp.ok(public.business_date() = (now() at time zone 'Africa/Casablanca')::date, 'business_date restored');

-- ===========================================================================
-- P1 corrections: review flag, director list, Q1-B clear, lifecycle hold
-- ===========================================================================
select pg_temp.act(1);
create temp table e2_policy as select (public.crm_create_followup_policy(gen_random_uuid(),
  '{"weekly_hours":{"1":[["08:00","22:00"]],"2":[["08:00","22:00"]],"3":[["08:00","22:00"]],"4":[["08:00","22:00"]],"5":[["08:00","22:00"]],"6":[["08:00","22:00"]],"7":[["08:00","22:00"]]},"attempt_offsets":[0,0,1,3,5]}')->>'policy_id')::uuid id;
select pg_temp.owner();
create temp sequence e2_n;
grant usage on sequence e2_n to public;
-- A qualified CRM lead, started as a Submitted enrollment for an existing learner.
create function pg_temp.crm_enrollment(p_student uuid) returns jsonb language plpgsql as $$
declare l uuid; n bigint := nextval('e2_n'); begin
  perform pg_temp.act(3);
  l := (public.crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name', 'Batch E parent ' || n,
    'learner_name', 'BatchE' || n || ' Learner', 'phone', '06' || lpad((72900000 + n)::text, 8, '0'), 'source_label', 'Manual'))->'lead'->>'id')::uuid;
  perform public.crm_qualify_lead(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', (pg_temp.lead(l)).version,
    'conversation_channel', 'phone', 'note', 'Batch E synthetic', 'qualification_step', 'placement_test',
    'next_task', jsonb_build_object('task_type', 'confirm_placement_test', 'due_at', now() + interval '2 days')));
  perform public.crm_start_enrollment(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', (pg_temp.lead(l)).version,
    'student_choice', 'existing', 'student_id', p_student, 'session_type', 'Adults', 'school_year', '2026/2027', 'initial_status', 'Submitted'));
  perform pg_temp.owner();
  return jsonb_build_object('lead', l, 'enrollment', (pg_temp.lead(l)).enrollment_id);
end $$;
create function pg_temp.void(p_receipt uuid, p_action text default 'void_financial_receipt') returns jsonb language plpgsql as $$
declare r jsonb; begin
  perform pg_temp.act(1);
  execute format('select public.%I(%L, %L, %L)', p_action, p_receipt, 'Synthetic correction', gen_random_uuid()) into r;
  perform pg_temp.owner();
  return r;
end $$;
create function pg_temp.queue() returns jsonb language plpgsql as $$ declare r jsonb; begin
  perform pg_temp.act(1); r := public.get_finance_review_queue(); perform pg_temp.owner(); return r; end $$;
create function pg_temp.in_unpaid(p_enrollment uuid) returns boolean language sql as $$
  select exists(select 1 from jsonb_array_elements(pg_temp.queue()->'unpaid_confirmed') x where x->>'enrollment_id' = p_enrollment::text) $$;

-- Non-CRM enrollment: the last live payment is voided.
insert into e2 select 'plain', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(110), 'session_type', 'Adults',
  'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 200));
insert into e2 select 'plain_2', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(110), 'charge_id',
  (select v->>'charge_id' from e2 where k = 'plain'), 'payment_amount', 100));
select pg_temp.owner();
select pg_temp.ok((pg_temp.enr((select (v->>'enrollment_id')::uuid from e2 where k = 'plain'))).status = 'Confirmed', 'admin payment confirms');
-- Voiding one of two live payments: nothing to review.
select pg_temp.ok((pg_temp.void((select (v->>'receipt_id')::uuid from e2 where k = 'plain_2'))->>'enrollment_without_live_payment')::boolean = false,
  'a void that leaves a live receipt reports false');
select pg_temp.ok(not exists(select 1 from public.financial_events where receipt_id = (select (v->>'receipt_id')::uuid from e2 where k = 'plain_2')
  and metadata ? 'enrollment_without_live_payment'), 'no review metadata while a live receipt remains');
-- Voiding the last one: reported, recorded on the event, listed; nothing changes status.
insert into e2 select 'plain_void', pg_temp.void((select (v->>'receipt_id')::uuid from e2 where k = 'plain'));
select pg_temp.ok((select (v->>'enrollment_without_live_payment')::boolean from e2 where k = 'plain_void'), 'last void reports the unpaid enrollment');
select pg_temp.ok((select metadata->>'enrollment_id' = (select v->>'enrollment_id' from e2 where k = 'plain')
  and (metadata->>'enrollment_without_live_payment')::boolean from public.financial_events
  where event_type = 'payment_voided' and receipt_id = (select (v->>'receipt_id')::uuid from e2 where k = 'plain')), 'payment_voided carries the enrollment');
select pg_temp.ok((pg_temp.enr((select (v->>'enrollment_id')::uuid from e2 where k = 'plain'))).status = 'Confirmed', 'enrollment status unchanged');
select pg_temp.ok((select status from public.students where id = pg_temp.id(110)) = 'Enrolled', 'learner status unchanged');
select pg_temp.ok(pg_temp.in_unpaid((select (v->>'enrollment_id')::uuid from e2 where k = 'plain')), 'listed in the director list (a)');
-- Replay: nothing more.
select pg_temp.ok((pg_temp.void((select (v->>'receipt_id')::uuid from e2 where k = 'plain'))->>'already_voided')::boolean, 'replay is idempotent');
select pg_temp.ok((select count(*) from public.financial_events where event_type = 'payment_voided'
  and receipt_id = (select (v->>'receipt_id')::uuid from e2 where k = 'plain')) = 1, 'replay writes no second event');

-- CRM-linked conversion: void, then replacement, then the cycle again (two clears).
insert into e2 select 'crm', pg_temp.crm_enrollment(pg_temp.id(111));
insert into e2 select 'crm_pay', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(111), 'enrollment_id',
  (select v->>'enrollment' from e2 where k = 'crm'), 'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 300));
select pg_temp.owner();
select pg_temp.ok((pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'crm'))).status = 'CONVERTED'
  and not (pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'crm'))).conversion_review_required, 'payment converts, no flag');
select pg_temp.void((select (v->>'receipt_id')::uuid from e2 where k = 'crm_pay'));
select pg_temp.ok((pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'crm'))).conversion_review_required
  and (pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'crm'))).status = 'CONVERTED', 'void flags the CONVERTED lead, status unchanged');
select pg_temp.ok(pg_temp.reviews((select (v->>'lead')::uuid from e2 where k = 'crm'), 'conversion_review_required') = 1
  and (select details->>'reason' = 'payment_voided' and details->>'action' = 'void_financial_receipt'
       and source_key = 'payment-void-review:' || (select v->>'receipt_id' from e2 where k = 'crm_pay')
       and body = 'Paiement annulé : l’inscription confirmée n’a plus de paiement actif. Vérification par la direction.'
     from public.crm_activities where lead_id = (select (v->>'lead')::uuid from e2 where k = 'crm') and event_type = 'conversion_review_required'),
  'one review activity with the payment_voided reason');
select pg_temp.ok((pg_temp.enr((select (v->>'enrollment')::uuid from e2 where k = 'crm'))).status = 'Confirmed', 'CRM enrollment unchanged');

-- Lifecycle (P1.5): with every earlier gate passing, the flag holds the converted delivery.
insert into public.crm_integration_connections(id, provider, connection_key, enabled, settings, created_by, updated_by, lifecycle_settings)
values (pg_temp.id(950), 'website', 'batch-e-lifecycle', true, '{"origin":"http://localhost"}', pg_temp.id(1), pg_temp.id(1), '{"enabled":true,"mode":"mock"}');
create function pg_temp.hold(p_lead uuid) returns text language sql as $$
  select crm_security.lifecycle_hold(jsonb_populate_record(null::public.crm_external_deliveries,
    jsonb_build_object('connection_id', pg_temp.id(950), 'lead_id', p_lead, 'event_kind', 'converted', 'delivery_mode', 'mock'))) $$;
select pg_temp.ok(pg_temp.hold((select (v->>'lead')::uuid from e2 where k = 'crm')) = 'conversion_review_required', 'flag holds the converted delivery');

insert into e2 select 'crm_replacement', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(111), 'charge_id',
  (select v->>'charge_id' from e2 where k = 'crm_pay'), 'payment_amount', 300));
select pg_temp.owner();
select pg_temp.ok(not (pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'crm'))).conversion_review_required
  and pg_temp.reviews((select (v->>'lead')::uuid from e2 where k = 'crm'), 'conversion_review_cleared') = 1, 'replacement clears with one activity');
select pg_temp.ok((select body = 'Paiement de remplacement enregistré : vérification levée.'
  and source_key = 'payment-review-cleared:' || (select v->>'receipt_id' from e2 where k = 'crm_replacement')
  from public.crm_activities where lead_id = (select (v->>'lead')::uuid from e2 where k = 'crm') and event_type = 'conversion_review_cleared'),
  'cleared activity text and key');
select pg_temp.ok(pg_temp.hold((select (v->>'lead')::uuid from e2 where k = 'crm')) is distinct from 'conversion_review_required',
  'the hold reason disappears after the clear');
select pg_temp.ok(not pg_temp.in_unpaid((select (v->>'enrollment')::uuid from e2 where k = 'crm')), 'paid again: off the list');
select pg_temp.void((select (v->>'receipt_id')::uuid from e2 where k = 'crm_replacement'), 'delete_mistaken_receipt');
select pg_temp.ok((pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'crm'))).conversion_review_required
  and pg_temp.reviews((select (v->>'lead')::uuid from e2 where k = 'crm'), 'conversion_review_required') = 2, 'delete of the last payment flags again');
select pg_temp.ok((select details->>'action' from public.crm_activities where lead_id = (select (v->>'lead')::uuid from e2 where k = 'crm')
  and source_key = 'payment-void-review:' || (select v->>'receipt_id' from e2 where k = 'crm_replacement')) = 'delete_mistaken_receipt', 'delete action recorded');
-- The deletion voided the charge: the replacement is a new charge on the same enrollment.
insert into e2 select 'crm_replacement_2', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(111), 'enrollment_id',
  (select v->>'enrollment' from e2 where k = 'crm'), 'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 700, 'payment_amount', 100));
select pg_temp.owner();
select pg_temp.ok(not (pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'crm'))).conversion_review_required
  and pg_temp.reviews((select (v->>'lead')::uuid from e2 where k = 'crm'), 'conversion_review_cleared') = 2, 'second cycle clears twice');
-- A flag raised by an enrollment downgrade (a review activity without the payment reason, as
-- crm_security.evaluate_conversion writes it) is never cleared, even mixed with a void flag.
insert into e2 select 'mixed', pg_temp.crm_enrollment(pg_temp.id(112));
insert into e2 select 'mixed_pay', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(112), 'enrollment_id',
  (select v->>'enrollment' from e2 where k = 'mixed'), 'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 300));
select pg_temp.owner();
select pg_temp.void((select (v->>'receipt_id')::uuid from e2 where k = 'mixed_pay'));
insert into public.crm_activities(lead_id, enrollment_id, occurred_at, actor_kind, event_type, source_key, body, details)
select (v->>'lead')::uuid, (v->>'enrollment')::uuid, clock_timestamp(), 'system', 'conversion_review_required', 'conversion-review:batch-e-mixed',
  'Inscription modifiée après confirmation : vérification par la direction.', '{"previous_enrollment_status":"Confirmed","enrollment_status":"Submitted"}'
from e2 where k = 'mixed';
select pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(112), 'charge_id', (select v->>'charge_id' from e2 where k = 'mixed_pay'), 'payment_amount', 300));
select pg_temp.owner();
select pg_temp.ok((pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'mixed'))).conversion_review_required
  and pg_temp.reviews((select (v->>'lead')::uuid from e2 where k = 'mixed'), 'conversion_review_cleared') = 0, 'mixed reasons: never cleared');
insert into e2 select 'downgrade', pg_temp.crm_enrollment(pg_temp.id(113));
insert into e2 select 'downgrade_pay', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(113), 'enrollment_id',
  (select v->>'enrollment' from e2 where k = 'downgrade'), 'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 300));
select pg_temp.owner();
insert into public.crm_activities(lead_id, enrollment_id, occurred_at, actor_kind, event_type, source_key, body, details)
select (v->>'lead')::uuid, (v->>'enrollment')::uuid, clock_timestamp(), 'system', 'conversion_review_required', 'conversion-review:batch-e-downgrade',
  'Inscription modifiée après confirmation : vérification par la direction.', '{"previous_enrollment_status":"Confirmed","enrollment_status":"Submitted"}'
from e2 where k = 'downgrade';
update public.crm_leads set conversion_review_required = true, version = version + 1 where id = (select (v->>'lead')::uuid from e2 where k = 'downgrade');
select pg_temp.void((select (v->>'receipt_id')::uuid from e2 where k = 'downgrade_pay'));
select pg_temp.ok(pg_temp.reviews((select (v->>'lead')::uuid from e2 where k = 'downgrade'), 'conversion_review_required') = 1,
  'an already flagged lead gets no second activity');
select pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(113), 'charge_id', (select v->>'charge_id' from e2 where k = 'downgrade_pay'), 'payment_amount', 300));
select pg_temp.owner();
select pg_temp.ok((pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'downgrade'))).conversion_review_required, 'a downgrade flag is never cleared');
-- A flag set when a LOST or NOT_QUALIFIED lead converts (evaluate_conversion sets it with
-- no review activity) is never cleared, and a later void writes no activity.
do $$ declare s text; i integer := 114; c jsonb; p jsonb; begin
  foreach s in array array['LOST', 'NOT_QUALIFIED'] loop
    c := pg_temp.crm_enrollment(pg_temp.id(i));
    perform pg_temp.act(3);
    if s = 'LOST' then
      perform public.crm_close_lost(gen_random_uuid(), jsonb_build_object('lead_id', c->>'lead',
        'expected_version', (pg_temp.lead((c->>'lead')::uuid)).version, 'reason', 'not_interested'));
    else
      perform public.crm_close_not_qualified(gen_random_uuid(), jsonb_build_object('lead_id', c->>'lead',
        'expected_version', (pg_temp.lead((c->>'lead')::uuid)).version, 'reason', 'program_not_suitable'));
    end if;
    p := pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(i), 'enrollment_id', c->>'enrollment', 'session_type', 'Adults',
      'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 300));
    perform pg_temp.owner();
    perform pg_temp.ok((pg_temp.lead((c->>'lead')::uuid)).status = 'CONVERTED' and (pg_temp.lead((c->>'lead')::uuid)).conversion_review_required
      and pg_temp.reviews((c->>'lead')::uuid, 'conversion_review_required') = 0, s || ': converts flagged, without a review activity');
    perform pg_temp.void((p->>'receipt_id')::uuid);
    perform pg_temp.ok(pg_temp.reviews((c->>'lead')::uuid, 'conversion_review_required') = 0, s || ': void writes no activity');
    perform pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(i), 'charge_id', p->>'charge_id', 'payment_amount', 300));
    perform pg_temp.owner();
    perform pg_temp.ok((pg_temp.lead((c->>'lead')::uuid)).conversion_review_required
      and pg_temp.reviews((c->>'lead')::uuid, 'conversion_review_cleared') = 0, s || ': never cleared');
    i := i + 1;
  end loop;
end $$;

-- Void against payment and against an exclusive CRM linkage lock: scripts/test-receipt-concurrency.sh.

-- ===========================================================================
-- P3 desk guardrails (Q2–Q5), after the idempotent replay
-- ===========================================================================
create function pg_temp.new_charge(i integer, student integer, extra jsonb) returns text language plpgsql as $$ begin
  perform pg_temp.act(i);
  return format($q$select public.create_charge_payment(%L::jsonb)$q$, jsonb_build_object('student_id', pg_temp.id(student),
    'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 200,
    'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid()) || extra);
end $$;
-- Q2: a new discount needs a reason from the list; "Autre" needs text; at most 200 characters.
do $$ declare r integer; begin
  foreach r in array array[1, 2, 3] loop
    perform pg_temp.fails(pg_temp.new_charge(r, 120, '{"discount_amount":50}'), '22023', 'Indiquez le motif de la remise.');
    perform pg_temp.fails(pg_temp.new_charge(r, 120, '{"discount_amount":50,"discount_reason_code":"loyalty"}'), '22023', 'Motif de remise inconnu.');
    perform pg_temp.fails(pg_temp.new_charge(r, 120, '{"discount_amount":50,"discount_reason_code":"other"}'), '22023', 'Précisez le motif de la remise « Autre ».');
    perform pg_temp.fails(pg_temp.new_charge(r, 120, jsonb_build_object('discount_amount', 50, 'discount_reason_code', 'other',
      'discount_reason', repeat('x', 201))), '22023', 'Le motif de la remise ne doit pas dépasser 200 caractères.');
  end loop;
end $$;
select pg_temp.owner();
insert into e2 select 'reasoned', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(120), 'session_type', 'Adults',
  'school_year', '2026/2027', 'gross_amount', 1000, 'discount_amount', 300, 'discount_reason_code', 'other',
  'discount_reason', '  Accord famille  ', 'payment_amount', 200));
select pg_temp.owner();
select pg_temp.ok((select discount_reason_code = 'other' and discount_reason = 'Accord famille' from public.charges
  where id = (select (v->>'charge_id')::uuid from e2 where k = 'reasoned')), 'reason stored on the charge');
select pg_temp.ok((select metadata->>'discount_reason_code' = 'other' and metadata->>'discount_reason' = 'Accord famille' from public.financial_events
  where event_type = 'charge_created' and charge_id = (select (v->>'charge_id')::uuid from e2 where k = 'reasoned')), 'reason copied to charge_created');
-- A payment on an existing charge never needs or stores a reason; a zero discount stores none.
select pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(120), 'charge_id', (select v->>'charge_id' from e2 where k = 'reasoned'), 'payment_amount', 10));
insert into e2 select 'no_discount', pg_temp.pay(2, jsonb_build_object('student_id', pg_temp.id(121), 'session_type', 'Adults',
  'school_year', '2026/2027', 'gross_amount', 1000, 'discount_reason_code', 'sibling', 'payment_amount', 200));
select pg_temp.owner();
select pg_temp.ok((select discount_reason_code is null from public.charges where id = (select (v->>'charge_id')::uuid from e2 where k = 'no_discount')),
  'no reason without a discount');
-- Q3: reception at most 10 %; admin and director no cap.
select pg_temp.fails(pg_temp.new_charge(3, 122, '{"discount_amount":100.01,"discount_reason_code":"sibling"}'), '22023',
  'Remise supérieure à 10 % : demandez au directeur.');
select pg_temp.owner();
select pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(122), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'discount_amount', 100, 'discount_reason_code', 'sibling', 'payment_amount', 200));
select pg_temp.pay(i, jsonb_build_object('student_id', pg_temp.id(122 + i), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'discount_amount', 778, 'discount_reason_code', 'director_approval', 'payment_amount', 200)) from unnest(array[1, 2]) i;
select pg_temp.owner();
-- Q4: never in the future; reception 7 days back; admin and director 31.
do $$ declare r integer; begin
  foreach r in array array[1, 2, 3] loop
    perform pg_temp.fails(pg_temp.new_charge(r, 126, jsonb_build_object('payment_date', public.business_date() + 1)), '22023',
      'La date du paiement ne peut pas être dans le futur.');
  end loop;
  perform pg_temp.fails(pg_temp.new_charge(3, 126, jsonb_build_object('payment_date', public.business_date() - 8)), '22023',
    'La date du paiement ne peut pas être antérieure de plus de 7 jours.');
  perform pg_temp.fails(pg_temp.new_charge(2, 126, jsonb_build_object('payment_date', public.business_date() - 32)), '22023',
    'La date du paiement ne peut pas être antérieure de plus de 31 jours.');
  perform pg_temp.fails(pg_temp.new_charge(1, 126, jsonb_build_object('payment_date', public.business_date() - 32)), '22023',
    'La date du paiement ne peut pas être antérieure de plus de 31 jours.');
end $$;
select pg_temp.owner();
select pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(126), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'payment_amount', 200, 'payment_date', public.business_date() - 7));
select pg_temp.pay(1, jsonb_build_object('student_id', pg_temp.id(127), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'payment_amount', 200, 'payment_date', public.business_date() - 31));
-- A zero payment records no payment date: no window applies.
select pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(128), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'payment_amount', 0, 'payment_date', public.business_date() - 60));
select pg_temp.owner();
-- P3.6: a request committed inside the window replays its original receipt after the window has passed.
insert into e2 select 'windowed', jsonb_build_object('payload', jsonb_build_object('student_id', pg_temp.id(129), 'session_type', 'Adults',
  'school_year', '2026/2027', 'gross_amount', 1000, 'discount_amount', 100, 'discount_reason_code', 'promotion', 'payment_amount', 200,
  'payment_date', public.business_date() - 7, 'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid()));
update e2 set v = v || jsonb_build_object('result', pg_temp.pay(3, v->'payload')) where k = 'windowed';
select pg_temp.owner();
do $$ declare r jsonb; begin
  create or replace function public.business_date(p_at timestamptz default now()) returns date language sql stable
    set search_path = pg_catalog, pg_temp as $f$ select (p_at at time zone 'Africa/Casablanca')::date + 20 $f$;
  r := pg_temp.pay(3, (select v->'payload' from e2 where k = 'windowed'));
  perform pg_temp.owner();
  perform pg_temp.ok((r->>'replayed')::boolean and r->>'receipt_id' = (select v->'result'->>'receipt_id' from e2 where k = 'windowed'),
    'replay after the window passed returns the original receipt');
  raise exception 'rollback' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end $$;
select pg_temp.owner();
-- A pre-migration request (no reason fields) keeps its fingerprint and replays.
do $$ declare k uuid := gen_random_uuid(); p jsonb; r jsonb; begin
  p := jsonb_build_object('student_id', pg_temp.id(130), 'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 1000,
    'payment_amount', 200, 'payment_date', public.business_date(), 'payment_method', 'Espèces', 'idempotency_key', k);
  r := pg_temp.pay(2, p);
  perform pg_temp.owner();
  perform pg_temp.ok((select request_fingerprint from public.financial_requests where idempotency_key = k)
    = encode(extensions.digest(jsonb_strip_nulls(jsonb_build_object('student_id', pg_temp.id(130), 'update_contacts', false,
      'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 1000.00::numeric(12,2), 'discount_amount', 0.00::numeric(12,2),
      'payment_amount', 200.00::numeric(12,2), 'payment_date', public.business_date(), 'payment_method', 'Espèces',
      'request_email', false))::text, 'sha256'), 'hex'), 'fingerprint without reason fields equals the 113 fingerprint');
  perform pg_temp.ok((pg_temp.pay(2, p)->>'receipt_id') = r->>'receipt_id', 'and replays');
end $$;
select pg_temp.owner();

-- Q5 = B 10 %: reception below the threshold issues the receipt, the enrollment waits.
insert into e2 select 'below_new', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(131), 'session_type', 'Adults',
  'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 99.99));
select pg_temp.owner();
select pg_temp.ok((select v->>'receipt_id' is not null and (v->>'enrollment_confirmation_pending')::boolean
  and not (v->>'enrollment_confirmed')::boolean and not (v->>'student_enrolled')::boolean from e2 where k = 'below_new'), 'below: pending result');
select pg_temp.ok((pg_temp.enr((select (v->>'enrollment_id')::uuid from e2 where k = 'below_new'))).status = 'Under Review', 'below: new enrollment Under Review');
select pg_temp.ok((select status from public.students where id = pg_temp.id(131)) <> 'Enrolled', 'below: learner not Enrolled');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(pg_temp.queue()->'pending_confirmation') x
  where x->>'enrollment_id' = (select v->>'enrollment_id' from e2 where k = 'below_new')), 'below: listed for the director (d)');
-- Crossing the threshold confirms as today.
insert into e2 select 'crossing', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(131), 'charge_id',
  (select v->>'charge_id' from e2 where k = 'below_new'), 'payment_amount', 0.01));
select pg_temp.owner();
select pg_temp.ok((select (v->>'enrollment_confirmed')::boolean and not (v->>'enrollment_confirmation_pending')::boolean from e2 where k = 'crossing')
  and (pg_temp.enr((select (v->>'enrollment_id')::uuid from e2 where k = 'below_new'))).status = 'Confirmed', 'crossing 10 % confirms');
-- A linked Submitted CRM enrollment stays Submitted; no conversion.
insert into e2 select 'below_crm', pg_temp.crm_enrollment(pg_temp.id(132));
insert into e2 select 'below_crm_pay', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(132), 'enrollment_id',
  (select v->>'enrollment' from e2 where k = 'below_crm'), 'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 50));
select pg_temp.owner();
select pg_temp.ok((pg_temp.enr((select (v->>'enrollment')::uuid from e2 where k = 'below_crm'))).status = 'Submitted'
  and (pg_temp.lead((select (v->>'lead')::uuid from e2 where k = 'below_crm'))).status = 'QUALIFIED', 'below: linked Submitted stays, no conversion');
-- Admin and director are not limited by the threshold.
select pg_temp.ok((pg_temp.pay(i, jsonb_build_object('student_id', pg_temp.id(132 + i), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'payment_amount', 1))->>'enrollment_confirmed')::boolean, 'admin/director: 1 MAD confirms') from unnest(array[1, 2]) i;
select pg_temp.owner();

-- ===========================================================================
-- P4 dates, obsolete functions, director list access
-- ===========================================================================
-- "En retard" and the monthly summary on Casablanca boundaries.
insert into public.charges(id, student_id, session_type, school_year, service_description, gross_amount, due_date, created_by, created_at)
values (pg_temp.id(960), pg_temp.id(136), 'Adults', '2026/2027', 'Adults · 2026/2027', 500, public.business_date() - 1, pg_temp.id(2), now()),
       (pg_temp.id(961), pg_temp.id(136), 'Adults', '2026/2027', 'Adults · 2026/2027', 700, public.business_date(), pg_temp.id(2), now());
select pg_temp.ok((select settlement_status from public.charge_balances where id = pg_temp.id(960)) = 'En retard'
  and (select settlement_status from public.charge_balances where id = pg_temp.id(961)) = 'En attente', 'En retard against the business date');
do $$ declare m date := date_trunc('month', public.business_date())::date; before jsonb; after jsonb; begin
  perform pg_temp.act(2); before := public.get_monthly_finance_summary(m); perform pg_temp.owner();
  -- Created one second before the business month starts (business_date of created_at is the previous month).
  insert into public.charges(id, student_id, session_type, school_year, service_description, gross_amount, created_by, created_at)
  values (pg_temp.id(962), pg_temp.id(136), 'Other', '2026/2027', 'Autre · x', 900, pg_temp.id(2),
    (m::timestamp at time zone 'Africa/Casablanca') - interval '1 second');
  perform pg_temp.act(2); after := public.get_monthly_finance_summary(m); perform pg_temp.owner();
  perform pg_temp.ok(after->'total' = before->'total', 'a charge from the previous business month is not counted');
  update public.charges set created_at = (m::timestamp at time zone 'Africa/Casablanca') where id = pg_temp.id(962);
  perform pg_temp.act(2); after := public.get_monthly_finance_summary(m); perform pg_temp.owner();
  perform pg_temp.ok((after->>'total')::numeric = (before->>'total')::numeric + 900, 'a charge at the business month start is counted');
  perform pg_temp.act(2);
  perform pg_temp.ok((select facture from public.get_finance_year_months(extract(year from m)::int) where month_idx = extract(month from m)::int - 1)
    >= 900, 'year months count it in its business month');
  perform pg_temp.owner();
end $$;
select pg_temp.ok(to_regprocedure('public.get_finance_summary()') is null and to_regprocedure('public.get_unpaid_receipts(integer)') is null,
  'obsolete finance functions dropped');
-- Review list: director only.
do $$ declare r integer; begin
  foreach r in array array[2, 3, 4, 5] loop
    perform pg_temp.act(r);
    perform pg_temp.fails('select public.get_finance_review_queue()', '42501', 'Forbidden');
  end loop;
  perform pg_temp.act(null);
  perform pg_temp.fails('select public.get_finance_review_queue()', '42501');
  perform pg_temp.owner();
end $$;
select pg_temp.ok(not has_function_privilege('anon', 'public.get_finance_review_queue(date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'finance_security.review_enrollment_without_live_payment(uuid,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'finance_security.review_enrollment_without_live_payment(uuid,text,jsonb)', 'EXECUTE')
  and not has_schema_privilege('authenticated', 'finance_security', 'USAGE'), 'private helper and schema closed to the API');
-- Sections (b) and (c): discounts with their reason and author role; backdated receipts.
select pg_temp.ok(exists(select 1 from jsonb_array_elements(pg_temp.queue()->'discounts') x
  where x->>'charge_id' = (select v->>'charge_id' from e2 where k = 'reasoned') and x->>'reason_code' = 'other'
    and x->>'reason' = 'Accord famille' and x->>'author_role' = 'admin' and (x->>'discount_percent')::numeric = 30), 'discount listed (b)');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(pg_temp.queue()->'backdated') x
  where x->>'receipt_id' = (select v->'result'->>'receipt_id' from e2 where k = 'windowed') and (x->>'days_back')::int = 7
    and x->>'author_role' = 'receptionist'), 'backdated receipt listed (c)');

rollback;
\echo 'PASS Batch E finance: numbering, corrections, Q1-B clear, lifecycle hold, guardrails, Casablanca dates, review list'
