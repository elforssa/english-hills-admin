-- Desk payments (RWR-r5 PR C1, migration 138) acceptance: synthetic local fixtures, fully
-- rolled back. Covers get_open_balances (invariant 12 read), find_duplicate_receipts (§6.1
-- rule), « Réserver sans paiement » (OD-2 = A: a charge with a due date, linked to the
-- prospect, no enrollment, no seat, no receipt, no conversion; the next action
-- « Encaisser l'acompte » through set_next_action under migration 137's checks), the
-- no-second-charge guard and « Encaisser sur cet engagement » in crm_enroll_and_collect,
-- replays, roles and grants. Dates are relative to the centre's business date under a
-- 24/7 follow-up policy, so they are weekday-independent.
\set ON_ERROR_STOP on
begin;
-- The receipt e-mail trigger calls an Edge Function; not part of this suite.
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('dc100000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid $$;
create function pg_temp.act(i integer) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', pg_temp.id(i)::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(i), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.owner() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- The service role, as PostgREST and Edge Functions run it with the service key.
create function pg_temp.svc() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;
create function pg_temp.refused(q text, st text, h text, label text) returns void language plpgsql as $$
declare s text; hh text; m text; begin
  begin
    execute q;
  exception when others then
    get stacked diagnostics s = returned_sqlstate, hh = pg_exception_hint, m = message_text;
    if s is distinct from st or (h is not null and hh is distinct from h) then
      raise exception 'FAIL: % raised % / % / %', label, s, hh, m;
    end if;
    return;
  end;
  raise exception 'FAIL: % was accepted', label;
end $$;
create function pg_temp.tok(l uuid, n text, b date) returns text language sql security definer as $$
  select crm_security.candidate_token(l, n, b) $$;
create function pg_temp.ver(l uuid) returns bigint language sql security definer as $$
  select version from public.crm_leads where id = l $$;
create temp table fx(k text primary key, v jsonb);
grant all on fx to public;
create function pg_temp.put(k text, v jsonb) returns void language sql as $$
  insert into fx values (k, v) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(k text) returns jsonb language sql as $$ select v from fx where fx.k = $1 $$;
create function pg_temp.uid_of(k text) returns uuid language sql as $$ select (v #>> '{}')::uuid from fx where fx.k = $1 $$;

-- ── Fixture: roles, 24/7 policy, a group ────────────────────────────────────
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'dp-t-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 6) i;
update public.profiles p set role = r.role
from (values (1, 'director'), (2, 'admin'), (3, 'receptionist'), (4, 'teacher'), (5, 'parent'), (6, 'student')) r(i, role)
where p.id = pg_temp.id(r.i);
insert into public.groups(id, name, session_type, niveau, annee, capacite_max) values
  (pg_temp.id(500), 'DP T Yearly C2', 'Yearly', 'Child 2', '2026-2027', 10);
select pg_temp.act(1);
select crm_create_followup_policy(gen_random_uuid(), '{"weekly_hours":{"1":[["00:00","23:59"]],"2":[["00:00","23:59"]],"3":[["00:00","23:59"]],"4":[["00:00","23:59"]],"5":[["00:00","23:59"]],"6":[["00:00","23:59"]],"7":[["00:00","23:59"]]}}');
select pg_temp.owner();

-- A qualified lead with an open « Finaliser l'inscription » task, created by reception
-- through « Ajouter un prospect » (crm_create_prospect, 139; each phone is distinct).
create function pg_temp.lead(n integer) returns uuid language plpgsql as $$ declare l uuid; begin
  perform pg_temp.act(3);
  l := (public.crm_create_prospect(gen_random_uuid(), jsonb_build_object('display_name', 'DP contact ' || n,
    'learner_name', 'DP child ' || n, 'phone', '06' || lpad((72000000 + n)::text, 8, '0'), 'source_label', 'Phone'))->'lead'->>'id')::uuid;
  perform public.crm_log_exchange(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l),
    'channel', 'phone', 'result', 'spoke', 'note', 'x',
    'next', jsonb_build_object('enrol', jsonb_build_object('due_at', now() + interval '1 day'))));
  perform pg_temp.owner();
  return l;
end $$;
create function pg_temp.reserve_new(l uuid, n integer, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l), 'student_choice', 'new',
    'learner_name', 'DP child ' || n, 'birth_date', '2014-05-10', 'session_type', 'Yearly', 'school_year', '2026/2027',
    'level', 'Child 2', 'candidate_review', pg_temp.tok(l, 'DP child ' || n, '2014-05-10'), 'confirm_new', true,
    'gross_amount', 3000, 'discount_amount', 0, 'due_date', public.business_date() + 7) || extra $$;
create function pg_temp.open_tasks(l uuid) returns setof public.crm_tasks language sql security definer as $$
  select * from public.crm_tasks where lead_id = l and status = 'open' $$;
create function pg_temp.lead_row(l uuid) returns public.crm_leads language sql security definer as $$
  select * from public.crm_leads where id = l $$;
create function pg_temp.n_charges(s uuid) returns bigint language sql security definer as $$
  select count(*) from public.charges where student_id = s and voided_at is null $$;

-- ── 1. Grants and roles ─────────────────────────────────────────────────────
select pg_temp.ok(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'), 'grants ' || f)
from unnest(array['public.get_open_balances(uuid)', 'public.find_duplicate_receipts(uuid,uuid,numeric,date)',
  'public.crm_reserve_without_payment(uuid,jsonb)', 'public.crm_enroll_and_collect(uuid,jsonb)']) f;
-- The CRM payment commands act for a signed-in staff member: no service-role grant (127).
select pg_temp.ok(not has_function_privilege('service_role', f, 'execute'), 'not executable by service_role: ' || f)
from unnest(array['public.crm_reserve_without_payment(uuid,jsonb)', 'public.crm_enroll_and_collect(uuid,jsonb)']) f;
select pg_temp.ok((select prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp'] from pg_proc
  where oid = 'crm_security.reserved_commitment_receipt_guard()'::regprocedure), 'receipt guard: security definer, search_path pinned');
select pg_temp.ok(not has_table_privilege(r, 'public.crm_charge_reservations', p), 'no table grant ' || r || ' ' || p)
from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['select', 'insert', 'update', 'delete']) p;
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.crm_charge_reservations'::regclass), 'reservations RLS on');
select pg_temp.ok(not has_function_privilege(r, 'crm_security.charge_reservations_append_only()', 'execute'), 'trigger function not executable by ' || r)
from unnest(array['anon', 'authenticated', 'service_role']) r;
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_security'
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 'no crm_security function is API-executable');
select pg_temp.act(i), pg_temp.refused(format('select public.get_open_balances(%L)', gen_random_uuid()), '42501', null, 'balances refused for ' || i),
  pg_temp.refused(format('select public.find_duplicate_receipts(%L, null, 10, current_date)', gen_random_uuid()), '42501', null, 'duplicates refused for ' || i),
  pg_temp.refused($q$select public.crm_reserve_without_payment(gen_random_uuid(), '{}')$q$, '42501', null, 'reserve refused for ' || i)
from unnest(array[4, 5, 6]) i;
select pg_temp.owner();

-- ── 2. get_open_balances: every live charge with a balance, oldest first ────
insert into public.students(id, full_name, status, session_type) values
  (pg_temp.id(600), 'DP T balances', 'Prospect', 'Yearly'),
  (pg_temp.id(601), 'DP T deleted', 'Prospect', 'Yearly');
-- Legacy (oldest, open), an unlinked commitment, a linked partly paid charge, a paid one, a voided one.
insert into public.charges(id, student_id, session_type, school_year, service_description, gross_amount, discount_amount, legacy, created_at)
values (pg_temp.id(610), pg_temp.id(600), 'Legacy', null, 'Ancien solde', 900, 0, true, now() - interval '400 days');
select pg_temp.act(3);
select pg_temp.put('c_unlinked', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(600),
  'session_type', 'Adults', 'school_year', '2026/2027', 'gross_amount', 2000, 'discount_amount', 0, 'payment_amount', 0,
  'due_date', public.business_date() + 10, 'idempotency_key', gen_random_uuid())));
select pg_temp.put('c_linked', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(600),
  'session_type', 'Yearly', 'school_year', '2026/2027', 'level', 'Child 2', 'gross_amount', 3000, 'discount_amount', 500, 'discount_reason_code', 'sibling',
  'payment_amount', 1000, 'payment_method', 'Espèces', 'payment_date', public.business_date(), 'idempotency_key', gen_random_uuid())));
select pg_temp.put('c_paid', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(600),
  'session_type', 'Summer Camp', 'school_year', '2026/2027', 'gross_amount', 800, 'payment_amount', 800,
  'payment_method', 'Espèces', 'payment_date', public.business_date(), 'idempotency_key', gen_random_uuid())));
select pg_temp.owner();
update public.charges set created_at = now() - interval '2 days' where id = (pg_temp.get('c_unlinked')->>'charge_id')::uuid;
update public.charges set created_at = now() - interval '1 day' where id = (pg_temp.get('c_linked')->>'charge_id')::uuid;
insert into public.charges(student_id, session_type, school_year, service_description, gross_amount, discount_amount, created_by, voided_at, voided_by, void_reason)
values (pg_temp.id(600), 'Adults', '2025/2026', 'Adults · 2025/2026', 1500, 0, pg_temp.id(1), now(), pg_temp.id(1), 'Erreur de saisie');
insert into public.charges(student_id, session_type, school_year, service_description, gross_amount, legacy)
values (pg_temp.id(601), 'Legacy', null, 'Ancien solde', 100, true);
update public.students set deleted_at = now() where id = pg_temp.id(601);

select pg_temp.act(3);
select pg_temp.put('ob', public.get_open_balances(pg_temp.id(600)));
select pg_temp.ok(jsonb_array_length(pg_temp.get('ob')->'rows') = 3, 'three open balances (paid and voided excluded)');
select pg_temp.ok(pg_temp.get('ob')->'rows'->0->>'id' = pg_temp.id(610)::text
  and pg_temp.get('ob')->'rows'->1->>'id' = pg_temp.get('c_unlinked')->>'charge_id'
  and pg_temp.get('ob')->'rows'->2->>'id' = pg_temp.get('c_linked')->>'charge_id', 'oldest first');
select pg_temp.ok((pg_temp.get('ob')->'rows'->2->>'balance')::numeric = 1500
  and (pg_temp.get('ob')->'rows'->2->>'net_amount')::numeric = 2500
  and (pg_temp.get('ob')->'rows'->2->>'paid_amount')::numeric = 1000
  and pg_temp.get('ob')->'rows'->2->>'enrollment_status' = 'Confirmed', 'balance = price − discount − payments, enrollment shown');
select pg_temp.ok(pg_temp.get('ob')->'rows'->1->>'enrollment_id' is null and (pg_temp.get('ob')->'rows'->1->>'balance')::numeric = 2000,
  'unlinked commitment listed');
select pg_temp.ok((pg_temp.get('ob')->>'total_balance')::numeric = 900 + 2000 + 1500, 'total balance');
-- Same numbers as charge_balances (invariant 12, one source).
select pg_temp.ok((select bool_and((r->>'balance')::numeric = b.balance) from jsonb_array_elements(pg_temp.get('ob')->'rows') r
  join public.charge_balances b on b.id = (r->>'id')::uuid), 'rows equal charge_balances');
select pg_temp.ok(jsonb_array_length(public.get_open_balances(pg_temp.id(601))->'rows') = 0, 'deleted learner: no rows');
select pg_temp.ok(jsonb_array_length(public.get_open_balances(gen_random_uuid())->'rows') = 0, 'unknown learner: no rows');
select pg_temp.refused('select public.get_open_balances(null)', '22023', null, 'null learner');
select pg_temp.act(1);
select pg_temp.ok(jsonb_array_length(public.get_open_balances(pg_temp.id(600))->'rows') = 3, 'director reads the same rows');
select pg_temp.owner();

-- ── 3. find_duplicate_receipts: the §6.1 rule ───────────────────────────────
-- Receptionist (3) paid 1000 on c_linked today (above). Admin (2) pays 300 on c_unlinked.
select pg_temp.act(2);
select pg_temp.put('rc_admin', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(600),
  'charge_id', pg_temp.get('c_unlinked')->>'charge_id', 'payment_amount', 300, 'payment_method', 'Espèces',
  'payment_date', public.business_date(), 'idempotency_key', gen_random_uuid())));
select pg_temp.act(3);
-- (a) same learner, amount, day and charge.
select pg_temp.put('dup', public.find_duplicate_receipts(pg_temp.id(600), (pg_temp.get('c_unlinked')->>'charge_id')::uuid, 300, public.business_date()));
select pg_temp.ok(jsonb_array_length(pg_temp.get('dup')) >= 1 and exists (select 1 from jsonb_array_elements(pg_temp.get('dup')) d
  where d->>'id' = pg_temp.get('rc_admin')->>'receipt_id' and d->>'rule' = 'same_charge' and d->>'receipt_number' is not null),
  'rule a: same charge, amount and day (another staff member)');
-- (b) any receipt by the same staff member for the learner within 2 minutes.
select pg_temp.put('dup', public.find_duplicate_receipts(pg_temp.id(600), null, 1, public.business_date()));
select pg_temp.ok(exists (select 1 from jsonb_array_elements(pg_temp.get('dup')) d where d->>'id' = pg_temp.get('c_linked')->>'receipt_id' and d->>'rule' = 'recent_by_you')
  and not exists (select 1 from jsonb_array_elements(pg_temp.get('dup')) d where d->>'id' = pg_temp.get('rc_admin')->>'receipt_id'),
  'rule b: my recent receipt, not the other staff member''s');
-- Not a duplicate: other amount, other day, other charge.
select pg_temp.act(2);
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.find_duplicate_receipts(pg_temp.id(600), (pg_temp.get('c_unlinked')->>'charge_id')::uuid, 301, public.business_date())) d
  where d->>'rule' = 'same_charge'), 'other amount is not rule a');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.find_duplicate_receipts(pg_temp.id(600), (pg_temp.get('c_unlinked')->>'charge_id')::uuid, 300, public.business_date() - 1)) d
  where d->>'rule' = 'same_charge'), 'other day is not rule a');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.find_duplicate_receipts(pg_temp.id(600), (pg_temp.get('c_linked')->>'charge_id')::uuid, 300, public.business_date())) d
  where d->>'rule' = 'same_charge'), 'other charge is not rule a');
select pg_temp.owner();
-- Older than 2 minutes, or voided: not shown.
update public.receipts set created_at = now() - interval '3 minutes' where id in ((pg_temp.get('c_linked')->>'receipt_id')::uuid, (pg_temp.get('c_paid')->>'receipt_id')::uuid);
select pg_temp.act(3);
select pg_temp.ok(jsonb_array_length(public.find_duplicate_receipts(pg_temp.id(600), null, 1, public.business_date())) = 0, 'rule b: 2-minute window');
select pg_temp.act(1);
select public.void_financial_receipt((pg_temp.get('rc_admin')->>'receipt_id')::uuid, 'Doublon de test', gen_random_uuid());
select pg_temp.act(3);
select pg_temp.ok(jsonb_array_length(public.find_duplicate_receipts(pg_temp.id(600), (pg_temp.get('c_unlinked')->>'charge_id')::uuid, 300, public.business_date())) = 0,
  'voided receipt is not a duplicate');
select pg_temp.ok(public.find_duplicate_receipts(null, null, 1, public.business_date()) = '[]'::jsonb, 'no learner: empty');
select pg_temp.owner();

-- ── 4. « Réserver sans paiement » (OD-2 = A) ────────────────────────────────
select pg_temp.put('l1', to_jsonb(pg_temp.lead(1)));
select pg_temp.put('k1', to_jsonb(gen_random_uuid()));
select pg_temp.act(3);
select pg_temp.put('body1', pg_temp.reserve_new(pg_temp.uid_of('l1'), 1));
-- Refusals first (nothing written).
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') - 'due_date'),
  '22023', 'eap.reservation_due_required', 'due date required');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || jsonb_build_object('due_date', public.business_date() - 1)),
  '22023', 'eap.reservation_due_invalid', 'due date in the past');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || jsonb_build_object('due_date', public.business_date() + 400)),
  '22023', 'eap.reservation_due_invalid', 'due date beyond a year');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || '{"gross_amount":0}'),
  '22023', 'eap.reservation_price_required', 'price required');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || '{"discount_amount":3000,"discount_reason_code":"director_approval"}'),
  '22023', 'eap.reservation_free', '100 % discount');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || '{"session_type":"Other"}'),
  '22023', 'crm_enrollment.program_invalid', 'Autre is not reservable');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || '{"level":"B2"}'),
  '22023', 'crm_enrollment.level_invalid', 'level of another programme');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || '{"expected_version":0}'),
  'PT409', 'crm_enrollment.lead_changed', 'stale version');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.get('body1') || '{"payment_amount":100}'),
  '22023', 'crm_enrollment.request_invalid', 'no payment key');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.crm_charge_reservations where lead_id = pg_temp.uid_of('l1')), 'refusals wrote nothing');

select pg_temp.act(3);
select pg_temp.put('r1', public.crm_reserve_without_payment(pg_temp.uid_of('k1'), pg_temp.get('body1')));
select pg_temp.owner();
select pg_temp.put('s1', pg_temp.get('r1')->'student'->'id');
select pg_temp.put('ch1', pg_temp.get('r1')->'charge'->'id');
select pg_temp.ok((pg_temp.get('r1')->'charge'->>'balance')::numeric = 3000 and pg_temp.get('r1')->'charge'->>'enrollment_id' is null
  and (pg_temp.get('r1')->'charge'->>'due_date')::date = public.business_date() + 7, 'charge with a due date and no enrollment');
select pg_temp.ok(not exists (select 1 from public.receipts where charge_id = pg_temp.uid_of('ch1')), 'no receipt');
select pg_temp.ok(not exists (select 1 from public.enrollments where student_id = pg_temp.uid_of('s1')), 'no enrollment, no seat');
select pg_temp.ok((select status = 'QUALIFIED' and enrollment_id is null and converted_at is null and student_id = pg_temp.uid_of('s1')
  from public.crm_leads where id = pg_temp.uid_of('l1')), 'prospect not converted, linked to its learner');
select pg_temp.ok((select count(*) = 1 from public.crm_charge_reservations where lead_id = pg_temp.uid_of('l1')
  and charge_id = pg_temp.uid_of('ch1') and created_by = pg_temp.id(3)), 'reservation row');
select pg_temp.ok((select count(*) = 1 from public.financial_requests where charge_id = pg_temp.uid_of('ch1') and receipt_id is null),
  'charge created through the financial command (financial_requests row)');
-- Exactly one open action: « Encaisser l'acompte », an enrolment action due on the due date.
select pg_temp.ok((select count(*) = 1 from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'one open action');
select pg_temp.ok((select task_type = 'enrollment_followup' and instructions = 'Encaisser l’acompte'
  and due_at >= (public.business_date() + 7)::timestamp at time zone public.centre_utc_offset()
  from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'next action « Encaisser l''acompte » on the due date');
select pg_temp.ok((select (pg_temp.get('r1')->>'next_action_id')::uuid = id from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'result names the action');
-- One label in every view (invariant 9): the next-action reader labels it « Encaisser l'acompte »;
-- any other enrolment action keeps « Finaliser l'inscription ».
select pg_temp.ok((select crm_security.next_action(pg_temp.uid_of('l1'))->>'label' like 'Encaisser l’acompte %'), 'labelled « Encaisser l''acompte » by next_action');
select pg_temp.ok((select crm_security.action_label(t) like 'Finaliser l’inscription %' from public.crm_tasks t
  where t.task_type = 'enrollment_followup' and coalesce(t.instructions, '') not like 'Encaisser%' and t.due_at is not null limit 1) is not false,
  'other enrolment actions keep « Finaliser l''inscription »');
-- The label follows the structured marker (the task's source key), not the text.
select pg_temp.ok((select source_kind = 'enrollment' and source_key like 'reservation:%:next-action'
  from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'the action carries the reservation source key');
select pg_temp.ok(crm_security.action_label(jsonb_populate_record(null::public.crm_tasks, jsonb_build_object(
  'id', gen_random_uuid(), 'task_type', 'enrollment_followup', 'source_kind', 'enrollment', 'source_key', 'enrollment-followup:x:y',
  'instructions', 'Encaisser l’acompte', 'due_at', now()))) like 'Finaliser l’inscription %', 'the instruction text alone does not relabel');
select pg_temp.ok(crm_security.action_label(jsonb_populate_record(null::public.crm_tasks, jsonb_build_object(
  'id', gen_random_uuid(), 'task_type', 'enrollment_followup', 'source_kind', 'enrollment', 'source_key', 'reservation:x:y:next-action',
  'instructions', 'Rappeler le prospect', 'due_at', now()))) like 'Encaisser l’acompte %', 'the reservation key labels it, whatever the text');
select pg_temp.ok((select count(*) = 1 from public.crm_activities where lead_id = pg_temp.uid_of('l1') and event_type = 'charge_reserved'
  and is_primary and command_key like 'reservation:%'), 'one primary history entry');
select pg_temp.ok((select count(*) = 1 from public.crm_tasks where lead_id = pg_temp.uid_of('l1') and status <> 'open'
  and task_type = 'enrollment_followup'), 'the previous « Finaliser l''inscription » was replaced, not left open');

-- Owner decision (2026-11-25): « Changer » to a new date (same enrolment kind, same
-- open reservation) keeps « Encaisser l'acompte » on every screen; the marker carries
-- over through set_next_action. A different kind of action or a close ends it.
savepoint moved;
create function pg_temp.change(l uuid, nxt jsonb) returns jsonb language plpgsql as $$ begin
  return public.crm_change_next_action(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l),
    'expected_action_id', (select id from pg_temp.open_tasks(l)), 'next', nxt));
end $$;
select pg_temp.put('t_before', to_jsonb((select id from pg_temp.open_tasks(pg_temp.uid_of('l1')))));
select pg_temp.act(3);
select pg_temp.change(pg_temp.uid_of('l1'), jsonb_build_object('task_type', 'enrollment_followup', 'due_at', now() + interval '3 days'));
select pg_temp.owner();
select pg_temp.ok((select count(*) = 1 from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'moved: still one open action');
select pg_temp.ok((select id <> pg_temp.uid_of('t_before') and source_kind = 'enrollment' and source_key like 'reservation:%:moved:%:next-action'
  and due_at > now() + interval '2 days' from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'moved: a new action that carries the marker');
select pg_temp.ok((select crm_security.next_action(pg_temp.uid_of('l1'))->>'label' like 'Encaisser l’acompte %'), 'moved: still « Encaisser l''acompte »');
select pg_temp.ok((select status = 'cancelled' from public.crm_tasks where id = pg_temp.uid_of('t_before')), 'moved: the previous action is replaced');
-- Moved twice: the marker carries over again.
select pg_temp.act(3);
select pg_temp.change(pg_temp.uid_of('l1'), jsonb_build_object('task_type', 'enrollment_followup', 'due_at', now() + interval '5 days'));
select pg_temp.owner();
select pg_temp.ok((select crm_security.next_action(pg_temp.uid_of('l1'))->>'label' like 'Encaisser l’acompte %'
  and (select count(*) = 1 from pg_temp.open_tasks(pg_temp.uid_of('l1')))), 'moved twice: still « Encaisser l''acompte »');
-- A different kind of action ends it; coming back to an enrolment action is « Finaliser l'inscription ».
savepoint other_kind;
select pg_temp.act(3);
select pg_temp.change(pg_temp.uid_of('l1'), jsonb_build_object('task_type', 'callback', 'schedule_kind', 'reminder', 'due_preset', 'tomorrow',
  'cancel_enrollment_reason', 'Le contact rappellera'));
select pg_temp.owner();
select pg_temp.ok((select crm_security.next_action(pg_temp.uid_of('l1'))->>'label' not like 'Encaisser%'), 'another kind: the label ends');
select pg_temp.act(3);
select pg_temp.change(pg_temp.uid_of('l1'), jsonb_build_object('task_type', 'enrollment_followup', 'due_at', now() + interval '4 days'));
select pg_temp.owner();
select pg_temp.ok((select crm_security.next_action(pg_temp.uid_of('l1'))->>'label' like 'Finaliser l’inscription %'
  and (select source_key not like 'reservation:%' from pg_temp.open_tasks(pg_temp.uid_of('l1')))), 'after another kind: « Finaliser l''inscription »');
rollback to savepoint other_kind;
-- A close ends it: reopened to an enrolment action, it is « Finaliser l'inscription ».
select pg_temp.act(3);
select public.crm_close_prospect(gen_random_uuid(), jsonb_build_object('lead_id', pg_temp.uid_of('l1'),
  'expected_version', pg_temp.ver(pg_temp.uid_of('l1')), 'status', 'LOST', 'reason', 'not_interested'));
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'closed: no open action');
select pg_temp.act(3);
select public.crm_reopen_prospect(gen_random_uuid(), jsonb_build_object('lead_id', pg_temp.uid_of('l1'), 'expected_version', pg_temp.ver(pg_temp.uid_of('l1')),
  'reason', 'Revient', 'next', jsonb_build_object('task_type', 'enrollment_followup', 'due_preset', 'tomorrow')));
select pg_temp.owner();
select pg_temp.ok((select crm_security.next_action(pg_temp.uid_of('l1'))->>'label' like 'Finaliser l’inscription %'), 'after a close: « Finaliser l''inscription »');
rollback to savepoint moved;
-- « Encaisser » sees the reservation and its prospect (collected from the CRM card).
select pg_temp.act(3);
select pg_temp.ok((select r->>'reserved_lead_id' = pg_temp.get('l1') #>> '{}' and r->>'enrollment_id' is null
  from jsonb_array_elements(public.get_open_balances(pg_temp.uid_of('s1'))->'rows') r), 'open balance names the reserving prospect');
select pg_temp.owner();
-- Migration 137's deferred checks hold now.
set constraints all immediate;
set constraints all deferred;

-- Replay: same key and payload → same result, nothing new.
select pg_temp.act(3);
select pg_temp.put('r1b', public.crm_reserve_without_payment(pg_temp.uid_of('k1'), pg_temp.get('body1')));
select pg_temp.ok((pg_temp.get('r1b')->>'replayed')::boolean and pg_temp.get('r1b')->'charge'->>'id' = pg_temp.get('ch1') #>> '{}', 'replay returns the same charge');
select pg_temp.refused(format('select public.crm_reserve_without_payment(%L, %L)', pg_temp.uid_of('k1'), pg_temp.get('body1') || '{"gross_amount":3100}'),
  '22023', 'crm_enrollment.request_conflict', 'same key, other payload');
-- A second reservation of the same programme and year: refused (no second charge).
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', jsonb_build_object('lead_id', pg_temp.uid_of('l1'),
  'expected_version', pg_temp.ver(pg_temp.uid_of('l1')), 'student_choice', 'existing', 'student_id', pg_temp.uid_of('s1'),
  'session_type', 'Yearly', 'school_year', '2026/2027', 'level', 'Child 2', 'gross_amount', 3000, 'due_date', public.business_date() + 3)),
  '22023', 'eap.unlinked_commitment_exists', 'second reservation');
select pg_temp.owner();
select pg_temp.ok(pg_temp.n_charges(pg_temp.uid_of('s1')) = 1, 'still one charge');
select pg_temp.refused(format('update public.crm_charge_reservations set lead_id = lead_id where charge_id = %L', pg_temp.uid_of('ch1')),
  '42501', 'eap.reservation_append_only', 'append-only (update)');
select pg_temp.refused(format('delete from public.crm_charge_reservations where charge_id = %L', pg_temp.uid_of('ch1')),
  '42501', 'eap.reservation_append_only', 'append-only (delete)');
-- A NEW lead (not qualified) cannot reserve.
select pg_temp.act(3);
select pg_temp.put('l_new', public.crm_create_prospect(gen_random_uuid(), jsonb_build_object('display_name', 'DP contact 9',
  'learner_name', 'DP child 9', 'phone', '0672000009', 'source_label', 'Phone'))->'lead'->'id');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.reserve_new(pg_temp.uid_of('l_new'), 9)),
  '22023', 'crm_enrollment.lead_not_qualified', 'new lead');
select pg_temp.owner();

-- ── 5. « Inscrire et encaisser » with an unlinked commitment ────────────────
-- A payment at the « Encaisser » screen (create_charge_payment), as the SQL text pg_temp.refused runs.
create function pg_temp.desk_pay(s uuid, extra jsonb) returns text language sql as $$
  select format('select public.create_charge_payment(%L)', jsonb_build_object('student_id', s, 'payment_amount', 500,
    'payment_method', 'Espèces', 'payment_date', public.business_date(), 'idempotency_key', gen_random_uuid()) || extra) $$;
create function pg_temp.enrol_existing(l uuid, s uuid, payment jsonb) returns jsonb language sql as $$
  select jsonb_build_object('enrollment', jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l),
    'student_choice', 'existing', 'student_id', s, 'session_type', 'Yearly', 'school_year', '2026/2027', 'level', 'Child 2'),
    'payment', payment) $$;
select pg_temp.act(3);
-- The guard: a new tuition charge next to the reserved commitment is refused.
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date()))),
  '22023', 'eap.unlinked_commitment_exists', 'no second charge');
-- Only an explicit « Nouvelle session » (new_session true) opens a second tuition charge.
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date(), 'new_session', false))),
  '22023', 'eap.unlinked_commitment_exists', 'no second charge with new_session false');
-- « nouvelle session » must be a boolean.
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date(), 'new_session', 'yes'))),
  '22023', 'crm_enrollment.request_invalid', 'new_session not boolean');
-- A commitment always takes a payment.
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('charge_id', pg_temp.uid_of('ch1'), 'payment_amount', 0, 'payment_method', 'Espèces', 'payment_date', public.business_date()))),
  '22023', 'eap.payment_required', 'commitment without payment');
-- Another learner's commitment, another programme's commitment: refused.
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('charge_id', pg_temp.get('c_unlinked')->>'charge_id', 'payment_amount', 100, 'payment_method', 'Espèces', 'payment_date', public.business_date()))),
  '22023', 'eap.commitment_unavailable', 'commitment of another learner');
select pg_temp.owner();
select pg_temp.ok(pg_temp.n_charges(pg_temp.uid_of('s1')) = 1 and not exists (select 1 from public.enrollments where student_id = pg_temp.uid_of('s1')),
  'refusals wrote nothing');
-- « nouvelle session » explicit: allowed (inside a savepoint, undone after the check).
savepoint new_session;
select pg_temp.act(3);
select pg_temp.put('ns', public.crm_enroll_and_collect(gen_random_uuid(), pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date(), 'new_session', true))));
select pg_temp.owner();
select pg_temp.ok(pg_temp.n_charges(pg_temp.uid_of('s1')) = 2 and pg_temp.get('ns')->>'receipt_id' is not null, 'explicit new session creates its own charge');
-- « Nouvelle session » belongs to « Inscrire et encaisser »: the Encaisser screen is still
-- refused a new charge without a chosen enrollment next to the reserved commitment.
select pg_temp.act(3);
select pg_temp.refused(pg_temp.desk_pay(pg_temp.uid_of('s1'), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 3000)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser after a new session: still one commitment rule');
select pg_temp.owner();
rollback to savepoint new_session;

-- Follow-ups 142 (C1 reviewer's note): « payment ends it » on a MOVED « Encaisser
-- l'acompte » action. The action is moved with « Changer » (the marker carries over), then
-- the payment on the commitment cancels the moved action itself. Rolled back; the unmoved
-- payment below is unchanged. The new due time is an in-hours slot from the server.
savepoint moved_then_paid;
create function pg_temp.change_to(l uuid, nxt jsonb) returns jsonb language plpgsql as $$ begin
  return public.crm_change_next_action(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l),
    'expected_action_id', (select id from pg_temp.open_tasks(l)), 'next', nxt));
end $$;
select pg_temp.put('t_reserved', to_jsonb((select id from pg_temp.open_tasks(pg_temp.uid_of('l1')))));
select pg_temp.put('slot_moved', to_jsonb(crm_security.next_window(crm_security.current_policy_id(), now() + interval '3 days')));
select pg_temp.act(3);
select pg_temp.change_to(pg_temp.uid_of('l1'), jsonb_build_object('task_type', 'enrollment_followup', 'due_at', pg_temp.get('slot_moved')));
select pg_temp.owner();
select pg_temp.put('t_moved', to_jsonb((select id from pg_temp.open_tasks(pg_temp.uid_of('l1')))));
select pg_temp.ok(pg_temp.uid_of('t_moved') <> pg_temp.uid_of('t_reserved')
  and (select source_key like 'reservation:%:moved:%:next-action' from public.crm_tasks where id = pg_temp.uid_of('t_moved'))
  and crm_security.next_action(pg_temp.uid_of('l1'))->>'label' like 'Encaisser l’acompte %', 'moved: a new « Encaisser l''acompte » action');
select pg_temp.act(3);
select pg_temp.put('r_moved', public.crm_enroll_and_collect(gen_random_uuid(), pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('charge_id', pg_temp.uid_of('ch1'), 'payment_amount', 1000, 'payment_method', 'Espèces', 'payment_date', public.business_date()))));
select pg_temp.owner();
select pg_temp.ok((select status = 'CONVERTED' from public.crm_leads where id = pg_temp.uid_of('l1')), 'moved then paid: the prospect converts');
select pg_temp.ok(not exists (select 1 from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'moved then paid: no open action');
select pg_temp.ok((select status = 'cancelled' and cancellation_reason = 'Inscription confirmée' from public.crm_tasks where id = pg_temp.uid_of('t_moved')),
  'moved then paid: the payment ends the moved action itself');
select pg_temp.ok((select count(*) = 1 from public.crm_activities where lead_id = pg_temp.uid_of('l1') and event_type = 'task_cancelled'
  and source_key = 'conversion-task:' || pg_temp.uid_of('l1') || ':' || pg_temp.uid_of('t_moved')), 'moved then paid: one cancellation entry for it');
select pg_temp.ok(crm_security.next_action(pg_temp.uid_of('l1')) is null, 'moved then paid: no next action on any screen');
select pg_temp.ok(pg_temp.get('r_moved')->>'charge_id' = pg_temp.get('ch1') #>> '{}' and (pg_temp.get('r_moved')->>'balance')::numeric = 2000
  and pg_temp.n_charges(pg_temp.uid_of('s1')) = 1, 'moved then paid: paid on the commitment, one charge, balance 2000');
set constraints all immediate;
set constraints all deferred;
rollback to savepoint moved_then_paid;

-- « Encaisser sur cet engagement »: pay 1000 on the reserved charge.
select pg_temp.put('k2', to_jsonb(gen_random_uuid()));
select pg_temp.act(3);
select pg_temp.put('body2', pg_temp.enrol_existing(pg_temp.uid_of('l1'), pg_temp.uid_of('s1'),
  jsonb_build_object('charge_id', pg_temp.uid_of('ch1'), 'payment_amount', 1000, 'payment_method', 'Espèces', 'payment_date', public.business_date())));
select pg_temp.put('r2', public.crm_enroll_and_collect(pg_temp.uid_of('k2'), pg_temp.get('body2')));
select pg_temp.owner();
select pg_temp.ok(pg_temp.get('r2')->>'charge_id' = pg_temp.get('ch1') #>> '{}' and (pg_temp.get('r2')->>'balance')::numeric = 2000
  and pg_temp.get('r2')->>'receipt_number' is not null, 'paid on the commitment, balance 2000');
select pg_temp.ok(pg_temp.n_charges(pg_temp.uid_of('s1')) = 1, 'no second charge');
select pg_temp.ok((select enrollment_id = (pg_temp.get('r2')->'enrollment'->>'id')::uuid from public.charges where id = pg_temp.uid_of('ch1')),
  'commitment linked to the enrollment');
select pg_temp.ok((select status = 'CONVERTED' from public.crm_leads where id = pg_temp.uid_of('l1')), 'prospect converted at payment (ADR-015)');
select pg_temp.ok(not exists (select 1 from pg_temp.open_tasks(pg_temp.uid_of('l1'))), 'the payment ends « Encaisser l''acompte »: no open action');
select pg_temp.ok((select status = 'Confirmed' from public.enrollments where id = (pg_temp.get('r2')->'enrollment'->>'id')::uuid), 'enrollment confirmed');
select pg_temp.act(3);
select pg_temp.ok((select r->>'reserved_lead_id' is null and (r->>'balance')::numeric = 2000
  from jsonb_array_elements(public.get_open_balances(pg_temp.uid_of('s1'))->'rows') r), 'converted prospect: an ordinary balance');
select pg_temp.owner();
set constraints all immediate;
set constraints all deferred;
-- Replay: same result, still one receipt.
select pg_temp.act(3);
select pg_temp.put('r2b', public.crm_enroll_and_collect(pg_temp.uid_of('k2'), pg_temp.get('body2')));
select pg_temp.owner();
select pg_temp.ok(pg_temp.get('r2b')->>'receipt_id' = pg_temp.get('r2')->>'receipt_id' and (pg_temp.get('r2b')->>'replayed_payment')::boolean,
  'replay returns the same receipt');
select pg_temp.ok((select count(*) = 1 from public.receipts where charge_id = pg_temp.uid_of('ch1') and voided_at is null), 'one receipt');

-- ── 6. Guard scope: legacy, other programme, other year, linked charges never block ──
select pg_temp.put('l3', to_jsonb(pg_temp.lead(3)));
insert into public.students(id, full_name, status, session_type, date_naissance) values (pg_temp.id(630), 'DP T scope', 'Prospect', 'Yearly', '2014-05-10');
insert into public.charges(student_id, session_type, school_year, service_description, gross_amount, legacy)
values (pg_temp.id(630), 'Legacy', null, 'Ancien solde', 500, true);
select pg_temp.act(3);
select create_charge_payment(jsonb_build_object('student_id', pg_temp.id(630), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'payment_amount', 0, 'idempotency_key', gen_random_uuid()));
select create_charge_payment(jsonb_build_object('student_id', pg_temp.id(630), 'session_type', 'Yearly', 'school_year', '2025/2026',
  'gross_amount', 1000, 'payment_amount', 0, 'idempotency_key', gen_random_uuid()));
select pg_temp.put('r3', public.crm_enroll_and_collect(gen_random_uuid(), pg_temp.enrol_existing(pg_temp.uid_of('l3'), pg_temp.id(630),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 300, 'payment_method', 'Espèces', 'payment_date', public.business_date()))));
select pg_temp.owner();
select pg_temp.ok(pg_temp.get('r3')->>'receipt_id' is not null, 'unrelated open charges do not block a new tuition charge');
-- An unlinked commitment of the same programme and year created at the Encaisser screen blocks too.
select pg_temp.put('l4', to_jsonb(pg_temp.lead(4)));
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(640), 'DP T desk commitment', 'Prospect', 'Yearly');
select pg_temp.act(3);
select pg_temp.put('c4', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(640), 'session_type', 'Yearly', 'school_year', '2026/2027',
  'gross_amount', 2800, 'payment_amount', 0, 'due_date', public.business_date() + 5, 'idempotency_key', gen_random_uuid())));
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l4'), pg_temp.id(640),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date()))),
  '22023', 'eap.unlinked_commitment_exists', 'desk commitment blocks a second charge');
select pg_temp.put('r4', public.crm_enroll_and_collect(gen_random_uuid(), pg_temp.enrol_existing(pg_temp.uid_of('l4'), pg_temp.id(640),
  jsonb_build_object('charge_id', pg_temp.get('c4')->>'charge_id', 'payment_amount', 2800, 'payment_method', 'Espèces', 'payment_date', public.business_date()))));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('r4')->>'balance')::numeric = 0 and pg_temp.n_charges(pg_temp.id(640)) = 1, 'desk commitment paid in full, one charge');
-- A voided commitment is not offered and cannot be paid.
select pg_temp.put('l5', to_jsonb(pg_temp.lead(5)));
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(650), 'DP T voided', 'Prospect', 'Yearly');
insert into public.charges(id, student_id, session_type, school_year, service_description, plan_type, gross_amount, created_by, voided_at, voided_by, void_reason)
values (pg_temp.id(651), pg_temp.id(650), 'Yearly', '2026/2027', 'Yearly · 2026/2027', 'Standard', 3000, pg_temp.id(1), now(), pg_temp.id(1), 'Erreur de saisie');
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l5'), pg_temp.id(650),
  jsonb_build_object('charge_id', pg_temp.id(651), 'payment_amount', 100, 'payment_method', 'Espèces', 'payment_date', public.business_date()))),
  '22023', 'eap.commitment_unavailable', 'voided commitment');
select pg_temp.put('r5', public.crm_enroll_and_collect(gen_random_uuid(), pg_temp.enrol_existing(pg_temp.uid_of('l5'), pg_temp.id(650),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 100, 'payment_method', 'Espèces', 'payment_date', public.business_date()))));
select pg_temp.owner();
select pg_temp.ok(pg_temp.get('r5')->>'receipt_id' is not null, 'a voided charge does not block');

-- ── 7. Reservation on an existing learner and the enrolment lock ────────────
select pg_temp.put('l6', to_jsonb(pg_temp.lead(6)));
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(660), 'DP T existing', 'Prospect', 'Adults');
select pg_temp.act(3);
select pg_temp.put('r6', public.crm_reserve_without_payment(gen_random_uuid(), jsonb_build_object('lead_id', pg_temp.uid_of('l6'),
  'expected_version', pg_temp.ver(pg_temp.uid_of('l6')), 'student_choice', 'existing', 'student_id', pg_temp.id(660),
  'session_type', 'Adults', 'school_year', '2026/2027', 'level', 'Intermediate 2', 'gross_amount', 2500, 'discount_amount', 250,
  'discount_reason_code', 'sibling', 'due_date', public.business_date())));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('r6')->'charge'->>'balance')::numeric = 2250 and (select count(*) = 1 from public.charge_discount_reasons
  where charge_id = (pg_temp.get('r6')->'charge'->>'id')::uuid and reason_code = 'sibling'), 'discount with its reason');
select pg_temp.ok((select due_at <= now() + interval '1 minute' from pg_temp.open_tasks(pg_temp.uid_of('l6'))), 'due today: action due now');
-- A learner already enrolled for that programme and year cannot reserve it.
select pg_temp.put('l7', to_jsonb(pg_temp.lead(7)));
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', jsonb_build_object('lead_id', pg_temp.uid_of('l7'),
  'expected_version', pg_temp.ver(pg_temp.uid_of('l7')), 'student_choice', 'existing', 'student_id', pg_temp.id(640),
  'session_type', 'Yearly', 'school_year', '2026/2027', 'level', 'Child 2', 'gross_amount', 3000, 'due_date', public.business_date() + 2)),
  '22023', 'eap.reservation_already_enrolled', 'already enrolled');
select pg_temp.owner();

-- ── 8. Payment guards on every path (owner review of PR #216) ──────────────
-- Every charge and receipt is written by create_charge_payment_financial, which is not
-- API-executable; it is reached through create_charge_payment, crm_enroll_and_collect and
-- crm_reserve_without_payment. A row trigger on receipts holds the reservation rule on all
-- of them and on service-role writes; each command holds the one-commitment rule.
select pg_temp.ok((select count(*) = 1 from pg_trigger where not tgisinternal and tgenabled = 'O'
  and tgrelid = 'public.receipts'::regclass and tgname = 'receipts_reserved_commitment_guard'), 'the receipt guard is an enabled row trigger');
select pg_temp.ok(not has_function_privilege(r, 'crm_security.reserved_commitment_receipt_guard()', 'execute'), 'receipt guard not executable by ' || r)
from unnest(array['anon', 'authenticated', 'service_role']) r;
select pg_temp.ok(not has_function_privilege(r, 'public.create_charge_payment_financial(jsonb)', 'execute'), 'financial command not executable by ' || r)
from unnest(array['anon', 'authenticated']) r;
select pg_temp.ok(not exists (select 1 from pg_proc p where p.prosrc ~* 'insert\s+into\s+(public\.)?(charges|receipts)\M'
  and p.oid <> 'public.create_charge_payment_financial(jsonb)'::regprocedure), 'only the financial command inserts charges and receipts');

-- (a) A commitment reserved for an open prospect is paid only through « Inscrire et
--     encaisser » on that prospect (ADR-015): never at the Encaisser screen, by any role.
select pg_temp.put('l8', to_jsonb(pg_temp.lead(8)));
select pg_temp.act(3);
select pg_temp.put('r8', public.crm_reserve_without_payment(gen_random_uuid(), pg_temp.reserve_new(pg_temp.uid_of('l8'), 8)));
select pg_temp.owner();
select pg_temp.put('s8', pg_temp.get('r8')->'student'->'id');
select pg_temp.put('ch8', pg_temp.get('r8')->'charge'->'id');
select pg_temp.act(i), pg_temp.refused(pg_temp.desk_pay(pg_temp.uid_of('s8'), jsonb_build_object('charge_id', pg_temp.uid_of('ch8'))),
  '22023', 'eap.reservation_collect_on_prospect', 'Encaisser on a reserved commitment, role ' || i)
from unnest(array[1, 2, 3]) i;
select pg_temp.owner();
-- Nor by a service-role write: the guard runs as its owner (SECURITY DEFINER), so it reads
-- the reservation the service role cannot read and refuses with its own reason.
select pg_temp.svc();
select pg_temp.ok(current_user = 'service_role' and not has_table_privilege('public.crm_charge_reservations', 'select')
  and not has_table_privilege('public.crm_leads', 'select'), 'running as the service role, which cannot read reservations or prospects');
select pg_temp.refused(format($q$insert into public.receipts(student_id, charge_id, date, nom_prenom, montant_total, montant_paye, mode_paiement)
  values (%L, %L, public.business_date(), 'DP child 8', 3000, 500, 'Espèces')$q$, pg_temp.uid_of('s8'), pg_temp.uid_of('ch8')),
  '22023', 'eap.reservation_collect_on_prospect', 'service-role receipt on a reserved commitment');
select pg_temp.owner();
-- Nor through another prospect of the same learner.
select pg_temp.put('l11', to_jsonb(pg_temp.lead(11)));
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l11'), pg_temp.uid_of('s8'),
  jsonb_build_object('charge_id', pg_temp.uid_of('ch8'), 'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date()))),
  '22023', 'eap.reservation_collect_on_prospect', 'another prospect of the learner');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.receipts where charge_id = pg_temp.uid_of('ch8'))
  and not exists (select 1 from public.enrollments where student_id = pg_temp.uid_of('s8'))
  and (select enrollment_id is null and status = 'QUALIFIED' from public.crm_leads where id = pg_temp.uid_of('l8')), 'refused payments wrote nothing');
-- A prospect closed without enrolling leaves an ordinary commitment: Encaisser takes it
-- and the payment confirms an enrollment, as for any commitment (ADR-015).
select pg_temp.act(3);
select public.crm_close_prospect(gen_random_uuid(), jsonb_build_object('lead_id', pg_temp.uid_of('l8'),
  'expected_version', pg_temp.ver(pg_temp.uid_of('l8')), 'status', 'LOST', 'reason', 'not_interested'));
select pg_temp.put('p8', public.create_charge_payment(jsonb_build_object('student_id', pg_temp.uid_of('s8'), 'charge_id', pg_temp.uid_of('ch8'),
  'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date(), 'idempotency_key', gen_random_uuid())));
select pg_temp.owner();
select pg_temp.ok(pg_temp.get('p8')->>'receipt_id' is not null
  and (select e.status = 'Confirmed' from public.charges c join public.enrollments e on e.id = c.enrollment_id where c.id = pg_temp.uid_of('ch8')),
  'closed prospect: an ordinary commitment, paid with its enrollment');

-- (b) No second charge (NF-4) at the Encaisser screen: a new tuition charge without a
--     chosen enrollment next to a live unlinked commitment of the same programme and year.
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(680), 'DP T one commitment', 'Prospect', 'Yearly');
select pg_temp.act(3);
select pg_temp.put('b80', jsonb_build_object('student_id', pg_temp.id(680), 'session_type', 'Yearly', 'school_year', '2026/2027',
  'gross_amount', 3000, 'payment_amount', 0, 'due_date', public.business_date() + 5, 'idempotency_key', gen_random_uuid()));
select pg_temp.put('c80', create_charge_payment(pg_temp.get('b80')));
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(680), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 3000)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser: a paid second charge');
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(680), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 3000, 'payment_amount', 0)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser: a second commitment');
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(680), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 3000, 'new_session', true)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser: new_session in the payload is no override');
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(680), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 3000,
  'discount_amount', 3000, 'discount_reason_code', 'director_approval', 'payment_amount', 0)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser: a 100 % discounted second charge');
select pg_temp.act(1);
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(680), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 3000)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser: the director too');
select pg_temp.owner();
select pg_temp.act(3);
select pg_temp.put('o80', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(680), 'session_type', 'Other', 'school_year', '2026/2027',
  'service_detail', 'Manuel', 'gross_amount', 200, 'payment_amount', 200, 'payment_method', 'Espèces', 'payment_date', public.business_date(),
  'idempotency_key', gen_random_uuid())));
select pg_temp.put('y80', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(680), 'session_type', 'Yearly', 'school_year', '2027/2028',
  'gross_amount', 3000, 'payment_amount', 0, 'idempotency_key', gen_random_uuid())));
-- A retry of the commitment's own request still replays (the rule never refuses it).
select pg_temp.put('c80r', create_charge_payment(pg_temp.get('b80')));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('c80r')->>'replayed')::boolean and pg_temp.get('c80r')->>'charge_id' = pg_temp.get('c80')->>'charge_id', 'retry replays');
select pg_temp.ok(pg_temp.get('o80')->>'receipt_id' is not null and pg_temp.get('y80')->>'charge_id' is not null, '« Autre » and another year are outside the rule');
select pg_temp.ok(pg_temp.n_charges(pg_temp.id(680)) = 3, 'the commitment, « Autre » and another year');
-- The commitment itself is collected at Encaisser (it is not reserved for a prospect).
select pg_temp.act(3);
select pg_temp.put('p80', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(680), 'charge_id', pg_temp.get('c80')->>'charge_id',
  'payment_amount', 1000, 'payment_method', 'Espèces', 'payment_date', public.business_date(), 'idempotency_key', gen_random_uuid())));
select pg_temp.owner();
select pg_temp.ok(pg_temp.get('p80')->>'receipt_id' is not null and pg_temp.n_charges(pg_temp.id(680)) = 3
  and (select enrollment_id is not null from public.charges where id = (pg_temp.get('c80')->>'charge_id')::uuid), 'commitment paid at Encaisser with its enrollment');
-- A service-role receipt on an unreserved charge is written exactly as at 137 (PR #216
-- review, B1): the guard finds no reservation and lets it through.
select pg_temp.svc();
with x as (insert into public.receipts(student_id, charge_id, date, nom_prenom, montant_total, montant_paye, mode_paiement)
  values (pg_temp.id(680), (pg_temp.get('c80')->>'charge_id')::uuid, public.business_date(), 'DP T one commitment', 3000, 100, 'Espèces') returning id)
select pg_temp.put('sv80', to_jsonb(x.id)) from x;
select pg_temp.owner();
select pg_temp.ok((select charge_id = (pg_temp.get('c80')->>'charge_id')::uuid from public.receipts where id = pg_temp.uid_of('sv80')),
  'service-role receipt on an unreserved charge written');
-- A next-session commitment and a charge paid onto the current enrollment the staff chose
-- (the « Clôturer le cours » shape, 128): a deliberate link passes; without it, refused.
select pg_temp.put('e80', to_jsonb((select enrollment_id from public.charges where id = (pg_temp.get('c80')->>'charge_id')::uuid)));
select pg_temp.act(3);
select pg_temp.put('n80', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(680), 'session_type', 'Yearly', 'school_year', '2026/2027',
  'gross_amount', 1500, 'payment_amount', 0, 'due_date', public.business_date() + 30, 'idempotency_key', gen_random_uuid())));
select pg_temp.put('x80', create_charge_payment(jsonb_build_object('student_id', pg_temp.id(680), 'enrollment_id', pg_temp.uid_of('e80'),
  'session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 400, 'payment_amount', 100, 'payment_method', 'Espèces',
  'payment_date', public.business_date(), 'idempotency_key', gen_random_uuid())));
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(680), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 400)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser without a chosen enrollment next to the next-session commitment');
select pg_temp.owner();
select pg_temp.ok((select enrollment_id from public.charges where id = (pg_temp.get('x80')->>'charge_id')::uuid) = pg_temp.uid_of('e80')
  and (select enrollment_id is null from public.charges where id = (pg_temp.get('n80')->>'charge_id')::uuid), 'chosen enrollment passes; the commitment stays open');

-- ── 139 (RWR-r5 B1, rebased onto this 138): merges and the payment rules ─────
-- (a) « Réserver sans paiement » gives a new learner the contact's number in E.164, or
--     none when the contact's stored number is a placeholder (B1's phone rule refuses it).
select pg_temp.put('l900', to_jsonb(pg_temp.lead(900)));
select pg_temp.act(3);
select pg_temp.put('r900', public.crm_reserve_without_payment(gen_random_uuid(), pg_temp.reserve_new(pg_temp.uid_of('l900'), 900)));
select pg_temp.owner();
select pg_temp.ok((select telephone from public.students where id = (pg_temp.get('r900')->'student'->>'id')::uuid) = '+212672000900',
  'reservation: the new learner''s phone is stored in E.164');
-- The placeholder is stored on purpose: crm_create_prospect refuses it, and 142 takes
-- crm_create_manual_lead from authenticated, so the fixture create runs in the trusted
-- session as the receptionist (the legacy create path that stored such numbers).
select pg_temp.act(3);
reset role;
select pg_temp.put('l902', public.crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name', 'DP contact 902',
  'learner_name', 'DP child 902', 'phone', '06 00 00 00 00', 'source_label', 'Phone'))->'lead'->'id');
select pg_temp.act(3);
select public.crm_log_exchange(gen_random_uuid(), jsonb_build_object('lead_id', pg_temp.uid_of('l902'), 'expected_version', pg_temp.ver(pg_temp.uid_of('l902')),
  'channel', 'phone', 'result', 'spoke', 'note', 'x', 'next', jsonb_build_object('enrol', jsonb_build_object('due_at', now() + interval '1 day'))));
select pg_temp.put('r902', public.crm_reserve_without_payment(gen_random_uuid(), pg_temp.reserve_new(pg_temp.uid_of('l902'), 902)));
select pg_temp.owner();
select pg_temp.ok((select telephone is null from public.students where id = (pg_temp.get('r902')->'student'->>'id')::uuid),
  'reservation: a placeholder contact number gives the new learner no phone (no refusal)');
-- (b) A student merge is refused while the merged-away file has an open reservation
--     (and its balance); the preview and the D5 plan say so.
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(901), 'DP kept 901', 'Prospect', 'Yearly');
select pg_temp.act(1);
select pg_temp.ok((public.student_merge_preview((pg_temp.get('r900')->'student'->>'id')::uuid, pg_temp.id(901))->>'source_open_reservations')::int = 1
  and public.student_merge_preview((pg_temp.get('r900')->'student'->>'id')::uuid, pg_temp.id(901))->>'refusal' = 'people.merge_source_balance',
  'student merge preview: an open reservation refuses');
select pg_temp.refused(format('select public.merge_students(%L, %L)', pg_temp.get('r900')->'student'->>'id', pg_temp.id(901)),
  '22023', 'people.merge_source_balance', 'student merge with an open reservation');
select pg_temp.owner();
-- (c) A merged file takes no charge, payment or reservation; the no-second-charge rule
--     (NF-4) reads the kept file's merge set: a fully discounted unlinked commitment of
--     the merged-away file (no balance, so the merge is allowed) blocks a second one.
insert into public.students(id, full_name, status, session_type) values
  (pg_temp.id(910), 'DP merged away 910', 'Prospect', 'Yearly'), (pg_temp.id(911), 'DP kept 911', 'Prospect', 'Yearly');
insert into public.charges(student_id, session_type, school_year, service_description, plan_type, gross_amount, discount_amount, created_by)
  values (pg_temp.id(910), 'Yearly', '2026/2027', 'Yearly · 2026/2027', 'Standard', 700, 700, pg_temp.id(1));
select pg_temp.act(1);
select public.merge_students(pg_temp.id(910), pg_temp.id(911));
select pg_temp.act(3);
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(910), jsonb_build_object('session_type', 'Other', 'school_year', '2026/2027',
  'service_description', 'Livre synthétique', 'gross_amount', 100)), '22023', 'eap.student_merged', 'Encaisser on a merged file');
select pg_temp.refused(pg_temp.desk_pay(pg_temp.id(911), jsonb_build_object('session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 500)),
  '22023', 'eap.unlinked_commitment_exists', 'Encaisser: NF-4 over the merge set');
select pg_temp.put('l911', to_jsonb(pg_temp.lead(911)));
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.enrol_existing(pg_temp.uid_of('l911'), pg_temp.id(911),
  jsonb_build_object('gross_amount', 3000, 'payment_amount', 500, 'payment_method', 'Espèces', 'payment_date', public.business_date()))),
  '22023', 'eap.unlinked_commitment_exists', 'Inscrire et encaisser: NF-4 over the merge set');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.reserve_new(pg_temp.uid_of('l911'), 911,
  jsonb_build_object('student_choice', 'existing', 'student_id', pg_temp.id(910)))), '22023', 'eap.student_merged', 'reservation on a merged file');
select pg_temp.refused(format('select public.crm_reserve_without_payment(gen_random_uuid(), %L)', pg_temp.reserve_new(pg_temp.uid_of('l911'), 911,
  jsonb_build_object('student_choice', 'existing', 'student_id', pg_temp.id(911)))), '22023', 'eap.unlinked_commitment_exists', 'reservation: NF-4 over the merge set');
select pg_temp.owner();
select pg_temp.ok(pg_temp.n_charges(pg_temp.id(910)) = 1 and pg_temp.n_charges(pg_temp.id(911)) = 0, 'no charge written by the refusals');

set constraints all immediate;
rollback;
