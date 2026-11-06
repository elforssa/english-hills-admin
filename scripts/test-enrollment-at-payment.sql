-- Enrollment at payment (migration 127, plan EAP-r4) acceptance: synthetic local fixtures,
-- fully rolled back. Covers the plan's "Local test strategy": the retired-status guard on
-- every path, any-amount confirmation, free enrollment, « Inscrire et encaisser » (B1, R1,
-- replay, fingerprint, Q12/R2), placement after payment (Q3 = B, R5), reopen of archived
-- rows (Q11, R6), Contrôles (d)/(e) with the Batch D C1/C5 shapes (R7, S2), the K1–K3/L2
-- statements of the R0 count query against the function on the same fixture, and the
-- grants of every new or re-created function.
\set ON_ERROR_STOP on
begin;
-- The receipt e-mail trigger calls an Edge Function; not part of this suite.
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('eab00000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid $$;
-- Act as an API user (role authenticated, JWT subject i) or go back to the owner.
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
-- The statement must raise with this SQLSTATE (and hint when given).
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
-- Read helpers that ignore RLS (definer, owner postgres).
create function pg_temp.tok(l uuid, n text, b date) returns text language sql security definer as $$
  select crm_security.candidate_token(l, n, b) $$;
create function pg_temp.ver(l uuid) returns bigint language sql security definer as $$
  select version from public.crm_leads where id = l $$;
create function pg_temp.upd(s uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.students where id = s $$;
create function pg_temp.stu(e uuid) returns uuid language sql security definer as $$
  select student_id from public.enrollments where id = e $$;
create function pg_temp.eupd(e uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.enrollments where id = e $$;
create temp table fx(k text primary key, v jsonb);
grant all on fx to public;
create function pg_temp.put(k text, v jsonb) returns void language sql as $$
  insert into fx values (k, v) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(k text) returns jsonb language sql as $$ select v from fx where fx.k = $1 $$;
create function pg_temp.uid_of(k text) returns uuid language sql as $$ select (v #>> '{}')::uuid from fx where fx.k = $1 $$;

-- ── Fixture: roles, follow-up policy, groups ────────────────────────────────
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'eap-t-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 6) i;
update public.profiles p set role = r.role
from (values (1, 'director'), (2, 'admin'), (3, 'receptionist'), (4, 'teacher'), (5, 'parent'), (6, 'student')) r(i, role)
where p.id = pg_temp.id(r.i);
-- CDC (128, Q1 = A): a short-programme group carries its course dates.
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(500), 'EAP T Yearly C2', 'Yearly', 'Child 2', '2026-2027', 10, null, null),
  (pg_temp.id(501), 'EAP T Yearly C2 full', 'Yearly', 'Child 2', '2026-2027', 1, null, null),
  (pg_temp.id(502), 'EAP T Adults B1', 'Adults', 'B1', '2026-2027', 10, '2026-09-01', '2027-06-30');
select pg_temp.act(1);
select crm_create_followup_policy(gen_random_uuid(), '{"weekly_hours":{"1":[["00:00","23:59"]],"2":[["00:00","23:59"]],"3":[["00:00","23:59"]],"4":[["00:00","23:59"]],"5":[["00:00","23:59"]],"6":[["00:00","23:59"]],"7":[["00:00","23:59"]]}}');
select pg_temp.owner();
-- Fills the one-seat group.
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(700), 'EAP T seat holder', 'Prospect', 'Yearly');
insert into public.enrollments(student_id, status, session_type, school_year, level, group_id)
values (pg_temp.id(700), 'Validated', 'Yearly', '2026/2027', 'Child 2', pg_temp.id(501));

-- A qualified lead with an open « Finaliser l'inscription » task, created by reception.
create function pg_temp.lead(n integer) returns uuid language plpgsql as $$ declare l uuid; begin
  perform pg_temp.act(3);
  l := (public.crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name', 'EAP parent ' || n,
    'learner_name', 'EAP child ' || n, 'phone', '06' || lpad((71000000 + n)::text, 8, '0'), 'source_label', 'Phone'))->'lead'->>'id')::uuid;
  perform public.crm_qualify_lead(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l),
    'conversation_channel', 'phone', 'note', 'x', 'qualification_step', 'enrollment',
    'next_task', jsonb_build_object('task_type', 'enrollment_followup', 'due_at', now() + interval '1 day')));
  perform pg_temp.owner();
  return l;
end $$;
create function pg_temp.new_learner(l uuid, n integer) returns jsonb language sql as $$
  select jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l), 'student_choice', 'new',
    'learner_name', 'EAP child ' || n, 'birth_date', '2014-05-10', 'session_type', 'Yearly', 'school_year', '2026/2027',
    'level', 'Child 2', 'candidate_review', pg_temp.tok(l, 'EAP child ' || n, '2014-05-10'), 'confirm_new', true) $$;
create function pg_temp.pay(amount numeric, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('gross_amount', 3000, 'payment_amount', amount, 'payment_method', 'Espèces',
    'payment_date', public.business_date()) || extra $$;

-- ── 1. Guard: no path writes a retired status ───────────────────────────────
insert into public.students(id, full_name, status, session_type, parent_email)
values (pg_temp.id(600), 'EAP T unpaid', 'Prospect', 'Yearly', 'eap-t-5@example.test');
insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at)
values (pg_temp.id(600), 'parent', pg_temp.id(5), 'eap-t-5@example.test', 'active', now());
-- (A Trial row needs a group, or check_enrollment_student_sync, which fires first, refuses it.)
select pg_temp.refused($q$insert into public.enrollments(student_id, status, session_type, school_year, level, group_id) values ('$q$
    || pg_temp.id(600) || $q$', '$q$ || s || $q$', 'Yearly', '2026/2027', 'Child 2', '$q$ || pg_temp.id(500) || $q$')$q$,
  '23514', 'eap.status_retired', 'owner insert ' || s)
from unnest(array['Submitted','Under Review','Trial','Rejected']) s;
set local role service_role;
select pg_temp.refused($q$insert into public.enrollments(student_id, status) values ('$q$ || pg_temp.id(600) || $q$', 'Submitted')$q$,
  '23514', 'eap.status_retired', 'service_role insert Submitted');
reset role;
-- One flag alone is not the exemption; both flags are.
select set_config('eh.enrollment_command', 'on', true);
select pg_temp.refused($q$insert into public.enrollments(student_id, status) values ('$q$ || pg_temp.id(600) || $q$', 'Submitted')$q$,
  '23514', 'eap.status_retired', 'one flag alone');
select set_config('eh.membership_sync', 'on', true);
insert into public.enrollments(id, student_id, status, session_type, school_year, level)
values (pg_temp.id(601), pg_temp.id(600), 'Submitted', 'Yearly', '2026/2027', 'Child 2');
select set_config('eh.membership_sync', '', true), set_config('eh.enrollment_command', '', true);
-- Moving into a retired status is refused; leaving one is allowed (to Confirmed here).
select pg_temp.refused($q$update public.enrollments set status = 'Under Review' where id = '$q$ || pg_temp.id(601) || $q$'$q$,
  '23514', 'eap.status_retired', 'update into Under Review');
select pg_temp.act(1);
select pg_temp.refused($q$select public.create_enrollment('$q$ || pg_temp.id(600) || $q$', '{"status":"Submitted"}')$q$,
  '42501', 'eap.status_retired', 'create_enrollment (director)');
select pg_temp.refused($q$select public.save_enrollment_changes('$q$ || pg_temp.id(601) || $q$', '$q$ || pg_temp.eupd(pg_temp.id(601)) || $q$', '{"status":"Trial"}')$q$,
  '23514', 'egc.status_not_permitted', 'save_enrollment_changes status change');
select pg_temp.ok(public.save_enrollment_changes(pg_temp.id(601), pg_temp.eupd(pg_temp.id(601)), '{"status":"Submitted","notes":"EAP note"}') is not null,
  'save_enrollment_changes with an unchanged status key passes');
select pg_temp.act(3);
select pg_temp.refused($q$select public.save_receptionist_enrollment('$q$ || pg_temp.id(600) || $q$')$q$,
  '42501', 'eap.status_retired', 'save_receptionist_enrollment pre-enrollment');
select pg_temp.act(5);
select pg_temp.refused($q$select public.portal_request_reenrollment('$q$ || pg_temp.id(600) || $q$')$q$,
  '42501', 'eap.status_retired', 'portal_request_reenrollment');
select pg_temp.owner();
set local role service_role;
select pg_temp.refused($q$select public.create_public_registration('{}'::jsonb, gen_random_uuid(), repeat('a', 64))$q$,
  '42501', 'eap.public_registration_retired', 'create_public_registration');
reset role;
-- crm_start_enrollment: no API grant; from a postgres session only Confirmed, never a group.
select pg_temp.put('l1', to_jsonb(pg_temp.lead(1)));
select pg_temp.act(i) , pg_temp.refused($q$select public.crm_start_enrollment(gen_random_uuid(), '{}')$q$, '42501', null, 'crm_start_enrollment direct as ' || i)
from unnest(array[1, 2, 3]) i;
select pg_temp.owner();
select set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
select pg_temp.refused(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', pg_temp.new_learner(pg_temp.uid_of('l1'), 1)),
  '42501', 'crm_enrollment.initial_status_not_permitted', 'crm_start_enrollment without initial_status');
select pg_temp.refused(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', pg_temp.new_learner(pg_temp.uid_of('l1'), 1) || '{"initial_status":"Submitted"}'),
  '42501', 'crm_enrollment.initial_status_not_permitted', 'crm_start_enrollment Submitted');
select pg_temp.refused(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', pg_temp.new_learner(pg_temp.uid_of('l1'), 1)
    || jsonb_build_object('initial_status', 'Confirmed', 'group_id', pg_temp.id(500))),
  '22023', 'crm_enrollment.request_invalid', 'crm_start_enrollment with a group');
select pg_temp.owner();

-- ── 2. Any amount confirms; free enrollment (D2, Q1) ────────────────────────
select pg_temp.act(3);
select pg_temp.put('p1', public.create_charge_payment(jsonb_build_object('student_name', 'EAP T walk-in', 'session_type', 'Yearly',
  'school_year', '2026/2027', 'level', 'Child 2', 'gross_amount', 3000, 'payment_amount', 1, 'payment_method', 'Espèces',
  'idempotency_key', gen_random_uuid())));
select pg_temp.owner();
select pg_temp.ok(not (pg_temp.get('p1') ? 'enrollment_confirmation_pending'), 'no enrollment_confirmation_pending key');
select pg_temp.ok((pg_temp.get('p1')->>'free_enrollment')::boolean is false and pg_temp.get('p1')->>'receipt_id' is not null, 'receipt, not free');
select pg_temp.ok((select e.status = 'Confirmed' and s.status = 'Enrolled' from public.enrollments e join public.students s on s.id = e.student_id
  where e.id = (pg_temp.get('p1')->>'enrollment_id')::uuid), '1 MAD on 3 000 MAD confirms (reception)');
select pg_temp.act(3);
select pg_temp.put('free', public.create_charge_payment(jsonb_build_object('student_name', 'EAP T free', 'session_type', 'Adults',
  'school_year', '2026/2027', 'level', 'B1', 'gross_amount', 2000, 'discount_amount', 2000, 'discount_reason_code', 'director_approval',
  'payment_amount', 0, 'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid())));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('free')->>'free_enrollment')::boolean and pg_temp.get('free')->>'receipt_id' is null
  and (select status = 'Confirmed' from public.enrollments where id = (pg_temp.get('free')->>'enrollment_id')::uuid),
  'free enrollment: Confirmed, no receipt');
select pg_temp.act(3);
select pg_temp.refused(format('select public.create_charge_payment(%L)', jsonb_build_object('student_name', 'EAP T free no reason',
  'session_type', 'Adults', 'school_year', '2026/2027', 'level', 'B1', 'gross_amount', 2000, 'discount_amount', 2000,
  'payment_amount', 0, 'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid())), '22023', null, '100 % without a reason');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.students where full_name like 'EAP T free no reason%'), '100 % without reason leaves nothing');
-- A plain zero payment still creates only the charge.
select pg_temp.act(3);
select pg_temp.put('zero', public.create_charge_payment(jsonb_build_object('student_name', 'EAP T zero', 'session_type', 'Adults',
  'school_year', '2026/2027', 'level', 'B1', 'gross_amount', 2000, 'payment_amount', 0, 'payment_method', 'Espèces',
  'idempotency_key', gen_random_uuid())));
select pg_temp.owner();
select pg_temp.ok(pg_temp.get('zero')->>'receipt_id' is null and not coalesce((pg_temp.get('zero')->>'free_enrollment')::boolean, false)
  and not exists (select 1 from public.enrollments e join public.charges c on c.student_id = e.student_id
    where c.id = (pg_temp.get('zero')->>'charge_id')::uuid), 'zero payment: charge only, no enrollment');

-- ── 3. « Inscrire et encaisser » ────────────────────────────────────────────
-- B1: no receipt on a first run raises and leaves nothing.
select pg_temp.put('l2', to_jsonb(pg_temp.lead(2)));
select pg_temp.put('l2_tasks', to_jsonb((select count(*) from public.crm_tasks where lead_id = pg_temp.uid_of('l2') and status = 'open')));
select pg_temp.put('l2_acts', to_jsonb((select count(*) from public.crm_activities where lead_id = pg_temp.uid_of('l2'))));
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', jsonb_build_object(
    'enrollment', pg_temp.new_learner(pg_temp.uid_of('l2'), 2),
    'payment', pg_temp.pay(0, '{"discount_amount":600,"discount_reason_code":"sibling"}'))), '22023', 'eap.payment_required', 'B1 zero with 20 %');
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', jsonb_build_object(
    'enrollment', pg_temp.new_learner(pg_temp.uid_of('l2'), 2), 'payment', pg_temp.pay(0))), '22023', 'eap.payment_required', 'B1 zero');
-- A desk guard refusing the payment (discount without reason) rolls the enrollment back too.
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', jsonb_build_object(
    'enrollment', pg_temp.new_learner(pg_temp.uid_of('l2'), 2), 'payment', pg_temp.pay(100, '{"discount_amount":600}'))), '22023', null, 'desk guard');
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', jsonb_build_object(
    'enrollment', pg_temp.new_learner(pg_temp.uid_of('l2'), 2) || jsonb_build_object('session_type', 'Other'), 'payment', pg_temp.pay(100))),
  '22023', 'eap.program_not_enrollable', 'programme Other');
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', jsonb_build_object(
    'enrollment', pg_temp.new_learner(pg_temp.uid_of('l2'), 2) || '{"initial_status":"Submitted"}', 'payment', pg_temp.pay(100))),
  '22023', 'crm_enrollment.request_invalid', 'client initial_status');
select pg_temp.owner();
select pg_temp.ok((select status = 'QUALIFIED' and enrollment_id is null and student_id is null and conversion_activity_id is null
    from public.crm_leads where id = pg_temp.uid_of('l2'))
  and (select count(*) from public.crm_activities where lead_id = pg_temp.uid_of('l2')) = (pg_temp.get('l2_acts') #>> '{}')::bigint
  and (select count(*) from public.crm_tasks where lead_id = pg_temp.uid_of('l2') and status = 'open') = (pg_temp.get('l2_tasks') #>> '{}')::bigint
  and not exists (select 1 from public.crm_command_requests where actor_scope = pg_temp.id(3)::text and command_name = 'start_enrollment')
  and not exists (select 1 from public.students where full_name like 'EAP child 2%'), 'B1: nothing written');

-- End to end, new learner, 1 MAD; the client idempotency key is ignored.
select pg_temp.put('k2', to_jsonb(gen_random_uuid()));
select pg_temp.put('client_key', to_jsonb(gen_random_uuid()));
select pg_temp.put('body2', jsonb_build_object('enrollment', pg_temp.new_learner(pg_temp.uid_of('l2'), 2),
  'payment', pg_temp.pay(1, jsonb_build_object('idempotency_key', pg_temp.uid_of('client_key')))));
select pg_temp.act(3);
select pg_temp.put('r2', public.crm_enroll_and_collect(pg_temp.uid_of('k2'), pg_temp.get('body2')));
select pg_temp.owner();
select pg_temp.ok((select v->>'receipt_id' is not null and v->>'receipt_number' is not null and v->'enrollment'->>'status' = 'Confirmed'
    and not (v->>'replayed_enrollment')::boolean and not (v->>'replayed_payment')::boolean and not (v->>'free_enrollment')::boolean
    from fx where k = 'r2'), 'wrapper: receipt and Confirmed');
select pg_temp.ok((select l.status = 'CONVERTED' and l.enrollment_id = (pg_temp.get('r2')->'enrollment'->>'id')::uuid
    from public.crm_leads l where l.id = pg_temp.uid_of('l2')), 'wrapper: lead converted and linked');
select pg_temp.ok(not exists (select 1 from public.crm_tasks where lead_id = pg_temp.uid_of('l2') and status = 'open')
  and exists (select 1 from public.crm_tasks where lead_id = pg_temp.uid_of('l2') and status = 'cancelled' and cancellation_reason = 'Inscription confirmée'),
  'wrapper: open tasks cancelled');
select pg_temp.ok((select r.enrollment_id = (pg_temp.get('r2')->'enrollment'->>'id')::uuid from public.receipts r
  where r.id = (pg_temp.get('r2')->>'receipt_id')::uuid), 'wrapper: receipt linked to the enrollment');
create function pg_temp.derived(actor uuid, k uuid) returns uuid language sql as $$
  select encode(set_byte(set_byte(b, 6, (get_byte(b, 6) & 15) | 80), 8, (get_byte(b, 8) & 63) | 128), 'hex')::uuid
  from (select substring(sha256(convert_to('eap:payment:' || actor || ':' || k, 'UTF8')) from 1 for 16) as b) x $$;
select pg_temp.ok((select count(*) = 1 and bool_and(f.idempotency_key = pg_temp.derived(pg_temp.id(3), pg_temp.uid_of('k2')))
  from public.financial_requests f where f.receipt_id = (pg_temp.get('r2')->>'receipt_id')::uuid), 'wrapper: one financial request with the derived key');
select pg_temp.ok(not exists (select 1 from public.financial_requests where idempotency_key = pg_temp.uid_of('client_key')), 'client key ignored');
select pg_temp.ok((select count(*) = 1 from public.crm_command_requests where actor_scope = pg_temp.id(3)::text
  and command_name = 'start_enrollment' and request_key = pg_temp.uid_of('k2')), 'wrapper: one CRM request row');
-- R1: a resend after a lost response returns the original ids and never raises B1.
select pg_temp.act(3);
select pg_temp.put('r2b', public.crm_enroll_and_collect(pg_temp.uid_of('k2'), pg_temp.get('body2')));
select pg_temp.owner();
select pg_temp.ok((select (v->>'replayed_enrollment')::boolean and (v->>'replayed_payment')::boolean
    and v->>'receipt_id' = pg_temp.get('r2')->>'receipt_id' and v->'enrollment'->>'id' = pg_temp.get('r2')->'enrollment'->>'id'
    from fx where k = 'r2b'), 'replay: same ids, both replayed');
select pg_temp.ok((select count(*) = 1 from public.receipts where student_id = (pg_temp.get('r2')->'enrollment'->>'student_id')::uuid), 'replay: one receipt');
-- A changed payload under the same key is a conflict and leaves nothing.
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_enroll_and_collect(%L, %L)', pg_temp.uid_of('k2'),
  jsonb_set(pg_temp.get('body2'), '{payment,payment_amount}', '2')), 'P0001', null, 'changed payment payload (122 fingerprint conflict)');
select pg_temp.owner();
select pg_temp.ok((select count(*) = 1 from public.receipts where student_id = (pg_temp.get('r2')->'enrollment'->>'student_id')::uuid), 'conflict: still one receipt');
-- N1: the same key without its payment is a payload conflict too, never a bare link.
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_enroll_and_collect(%L, %L)', pg_temp.uid_of('k2'), pg_temp.get('body2') - 'payment'),
  '22023', 'crm_enrollment.request_conflict', 'paid request replayed without its payment');
select pg_temp.owner();

-- Existing learner, free enrollment through the wrapper, and its replay (R1 for free).
select pg_temp.put('l3', to_jsonb(pg_temp.lead(3)));
insert into public.students(id, full_name, date_naissance, status, session_type) values (pg_temp.id(610), 'EAP T existing', '2014-01-01', 'Inactive', 'Yearly');
select pg_temp.put('k3', to_jsonb(gen_random_uuid()));
select pg_temp.put('body3', jsonb_build_object('enrollment', jsonb_build_object('lead_id', pg_temp.uid_of('l3'),
    'expected_version', pg_temp.ver(pg_temp.uid_of('l3')), 'student_choice', 'existing', 'student_id', pg_temp.id(610),
    'session_type', 'Yearly', 'school_year', '2026/2027', 'level', 'Child 2'),
  'payment', jsonb_build_object('gross_amount', 3000, 'discount_amount', 3000, 'discount_reason_code', 'director_approval',
    'payment_amount', 0, 'payment_method', 'Espèces', 'payment_date', public.business_date())));
select pg_temp.act(2);
select pg_temp.put('r3', public.crm_enroll_and_collect(pg_temp.uid_of('k3'), pg_temp.get('body3')));
select pg_temp.put('r3b', public.crm_enroll_and_collect(pg_temp.uid_of('k3'), pg_temp.get('body3')));
select pg_temp.owner();
select pg_temp.ok((select (v->>'free_enrollment')::boolean and v->>'receipt_id' is null and v->'enrollment'->>'status' = 'Confirmed'
    and v->'enrollment'->>'student_id' = pg_temp.id(610)::text from fx where k = 'r3'), 'wrapper free, existing learner (admin)');
select pg_temp.ok((select (v->>'replayed_enrollment')::boolean and v->>'charge_id' = pg_temp.get('r3')->>'charge_id' from fx where k = 'r3b'),
  'free replay returns the same charge');
select pg_temp.ok((select status = 'Enrolled' from public.students where id = pg_temp.id(610))
  and (select status = 'CONVERTED' from public.crm_leads where id = pg_temp.uid_of('l3')), 'existing learner Enrolled, lead converted');

-- Q12 (R2): linking an existing enrollment without a payment object.
insert into public.students(id, full_name, date_naissance, status, session_type) values
  (pg_temp.id(620), 'EAP T paid elsewhere', '2014-01-01', 'Prospect', 'Yearly'),
  (pg_temp.id(621), 'EAP T director placed', '2014-01-01', 'Prospect', 'Yearly'),
  (pg_temp.id(622), 'EAP T reopened', '2014-01-01', 'Prospect', 'Yearly'),
  (pg_temp.id(623), 'EAP T ended', '2014-01-01', 'Prospect', 'Yearly');
-- A paid Confirmed enrollment (reception receipt on 620).
select pg_temp.act(3);
select pg_temp.put('p620', public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(620), 'session_type', 'Yearly',
  'school_year', '2026/2027', 'level', 'Child 2', 'gross_amount', 3000, 'payment_amount', 500, 'payment_method', 'Espèces',
  'idempotency_key', gen_random_uuid())));
select pg_temp.act(1);
-- A director placement without a paid enrollment (logged reason).
select public.place_learner_in_group(p_student => pg_temp.id(621), p_group => pg_temp.id(500), p_student_updated_at => pg_temp.upd(pg_temp.id(621)),
  p_without_enrollment_reason => 'Bourse EAP');
select pg_temp.owner();
-- A reopened unpaid row and an ended row (ended through the command core).
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(632), pg_temp.id(622), 'Confirmed', 'Yearly', '2026/2027', 'Child 2'),
  (pg_temp.id(633), pg_temp.id(623), 'Confirmed', 'Yearly', '2026/2027', 'Child 2');
select academic_security.end_enrollment(pg_temp.id(632), 'Départ EAP'), academic_security.end_enrollment(pg_temp.id(633), 'Départ EAP');
select pg_temp.act(1);
select public.reopen_enrollment(pg_temp.id(632), pg_temp.eupd(pg_temp.id(632)));
select pg_temp.owner();
create function pg_temp.link(l uuid, s uuid, e uuid) returns jsonb language sql as $$
  select jsonb_build_object('enrollment', jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l), 'student_choice', 'existing',
    'student_id', s, 'session_type', 'Yearly', 'school_year', '2026/2027', 'enrollment_id', e,
    'expected_enrollment_updated_at', pg_temp.eupd(e))) $$;
select pg_temp.put('l4', to_jsonb(pg_temp.lead(4)));
select pg_temp.act(3);
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.link(pg_temp.uid_of('l4'), pg_temp.id(621),
  (select id from public.enrollments where student_id = pg_temp.id(621)))), '22023', 'eap.payment_required', 'Q12 director-placed unpaid row');
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.link(pg_temp.uid_of('l4'), pg_temp.id(622),
  pg_temp.id(632))), '22023', 'eap.payment_required', 'Q12 reopened unpaid row');
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.link(pg_temp.uid_of('l4'), pg_temp.id(623),
  pg_temp.id(633))), '22023', null, 'Q12 ended row');
-- An enrollment that already has a live charge is never charged a second time by the wrapper.
select pg_temp.refused(format('select public.crm_enroll_and_collect(gen_random_uuid(), %L)', pg_temp.link(pg_temp.uid_of('l4'), pg_temp.id(620),
  (pg_temp.get('p620')->>'enrollment_id')::uuid) || jsonb_build_object('payment', pg_temp.pay(500))), '22023', 'eap.enrollment_already_charged',
  'second charge on a charged enrollment');
select pg_temp.owner();
select pg_temp.ok((select count(*) = 1 from public.charges where enrollment_id = (pg_temp.get('p620')->>'enrollment_id')::uuid)
  and (select count(*) = 1 from public.receipts where student_id = pg_temp.id(620))
  and (select status = 'QUALIFIED' and enrollment_id is null from public.crm_leads where id = pg_temp.uid_of('l4')), 'charged refusal: nothing written');
select pg_temp.put('k4', to_jsonb(gen_random_uuid()));
select pg_temp.put('body4', pg_temp.link(pg_temp.uid_of('l4'), pg_temp.id(620), (pg_temp.get('p620')->>'enrollment_id')::uuid));
select pg_temp.act(3);
select pg_temp.put('r4', public.crm_enroll_and_collect(pg_temp.uid_of('k4'), pg_temp.get('body4')));
-- N1: the Q12 link replayed with a payment is a payload conflict and issues nothing; the exact replay still answers.
select pg_temp.refused(format('select public.crm_enroll_and_collect(%L, %L)', pg_temp.uid_of('k4'),
  pg_temp.get('body4') || jsonb_build_object('payment', pg_temp.pay(500))), '22023', 'crm_enrollment.request_conflict', 'Q12 link replayed with a payment');
select pg_temp.put('r4b', public.crm_enroll_and_collect(pg_temp.uid_of('k4'), pg_temp.get('body4')));
select pg_temp.owner();
select pg_temp.ok((select (v->>'replayed_enrollment')::boolean and v->>'receipt_id' is null and v->'enrollment'->>'id' = pg_temp.get('r4')->'enrollment'->>'id'
  from fx where k = 'r4b'), 'Q12 exact replay answers the link');
select pg_temp.ok((select v->>'receipt_id' is null and v->>'charge_id' is null and v->'enrollment'->>'id' = pg_temp.get('p620')->>'enrollment_id'
    from fx where k = 'r4') and (select status = 'CONVERTED' from public.crm_leads where id = pg_temp.uid_of('l4'))
  and (select count(*) = 1 from public.receipts where student_id = pg_temp.id(620)), 'Q12 paid row: linked, converted, nothing issued');

-- Role matrix for the wrapper (reception, admin and director above).
select pg_temp.act(1);
select pg_temp.refused($q$select public.crm_enroll_and_collect(gen_random_uuid(), '{"enrollment":{}}')$q$, '22023', null, 'director reaches validation');
select pg_temp.act(i), pg_temp.refused($q$select public.crm_enroll_and_collect(gen_random_uuid(), '{"enrollment":{}}')$q$, '42501', null, 'wrapper refused for ' || i)
from unnest(array[4, 5, 6]) i;
select pg_temp.owner();
select pg_temp.ok(not has_function_privilege('anon', 'public.crm_enroll_and_collect(uuid,jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.crm_enroll_and_collect(uuid,jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.crm_enroll_and_collect(uuid,jsonb)', 'execute'), 'wrapper grants');

-- ── 4. Placement after payment; Q3 = B (R5) ─────────────────────────────────
select pg_temp.act(3);
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L, p_enrollment => %L, p_enrollment_updated_at => %L)',
  pg_temp.stu((pg_temp.get('p1')->>'enrollment_id')::uuid), pg_temp.id(500), pg_temp.upd(pg_temp.stu((pg_temp.get('p1')->>'enrollment_id')::uuid)), pg_temp.get('p1')->>'enrollment_id',
  '2000-01-01T00:00:00Z'), 'PT409', 'egc.stale', 'stale enrollment updated_at');
select pg_temp.ok(public.place_learner_in_group(p_student => pg_temp.stu((pg_temp.get('p1')->>'enrollment_id')::uuid), p_group => pg_temp.id(500),
  p_student_updated_at => pg_temp.upd(pg_temp.stu((pg_temp.get('p1')->>'enrollment_id')::uuid)), p_enrollment => (pg_temp.get('p1')->>'enrollment_id')::uuid,
  p_enrollment_updated_at => pg_temp.eupd((pg_temp.get('p1')->>'enrollment_id')::uuid)) is not null, 'reception places after payment');
-- A full group refuses and leaves the paid enrollment « groupe à affecter ».
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L, p_enrollment => %L, p_enrollment_updated_at => %L)',
  pg_temp.id(620), pg_temp.id(501), pg_temp.upd(pg_temp.id(620)), pg_temp.get('p620')->>'enrollment_id',
  pg_temp.eupd((pg_temp.get('p620')->>'enrollment_id')::uuid)), '23514', 'egc.capacity', 'full group');
select pg_temp.owner();
select pg_temp.ok((select status = 'Confirmed' and group_id is null from public.enrollments where id = (pg_temp.get('p620')->>'enrollment_id')::uuid),
  'full group: still Confirmed without a group');
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(640), 'EAP T unplaced', 'Prospect', 'Yearly');
select pg_temp.act(3);
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L)',
  pg_temp.id(640), pg_temp.id(500), pg_temp.upd(pg_temp.id(640))), '23514', 'eap.paid_enrollment_required', 'reception place without enrollment');
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L, p_without_enrollment_reason => %L)',
  pg_temp.id(640), pg_temp.id(500), pg_temp.upd(pg_temp.id(640)), 'Raison'), '23514', 'eap.paid_enrollment_required', 'reception reason does not help');
select pg_temp.refused(format('select public.assign_receptionist_student_group(%L, null, %L, %L)',
  pg_temp.id(640), pg_temp.id(500), pg_temp.upd(pg_temp.id(640))), '23514', 'eap.paid_enrollment_required', 'reception assign without enrollment');
-- A retired-status row is not a paid enrollment either.
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L, p_enrollment => %L, p_enrollment_updated_at => %L)',
  pg_temp.id(600), pg_temp.id(500), pg_temp.upd(pg_temp.id(600)), pg_temp.id(601), pg_temp.eupd(pg_temp.id(601))),
  '23514', 'eap.paid_enrollment_required', 'reception place a Submitted row');
select pg_temp.act(2);
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L)',
  pg_temp.id(640), pg_temp.id(500), pg_temp.upd(pg_temp.id(640))), '23514', 'eap.placement_reason_required', 'admin without reason');
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L, p_capacity_override_reason => %L)',
  pg_temp.id(640), pg_temp.id(500), pg_temp.upd(pg_temp.id(640)), 'Place libre'), '23514', 'eap.placement_reason_required', 'capacity reason alone');
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L, p_without_enrollment_reason => %L)',
  pg_temp.id(640), pg_temp.id(500), pg_temp.upd(pg_temp.id(640)), repeat('x', 201)), '23514', 'eap.placement_reason_required', 'reason over 200');
select pg_temp.ok(public.place_learner_in_group(p_student => pg_temp.id(640), p_group => pg_temp.id(500),
  p_student_updated_at => pg_temp.upd(pg_temp.id(640)), p_without_enrollment_reason => 'Bourse EAP') is not null, 'admin with reason');
-- A legacy unpaid row is placed by management only with the reason, logged the same way.
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L, p_enrollment => %L, p_enrollment_updated_at => %L)',
  pg_temp.id(600), pg_temp.id(500), pg_temp.upd(pg_temp.id(600)), pg_temp.id(601), pg_temp.eupd(pg_temp.id(601))),
  '23514', 'eap.placement_reason_required', 'admin places a Submitted row without reason');
select pg_temp.ok(public.place_learner_in_group(p_student => pg_temp.id(600), p_group => pg_temp.id(500), p_student_updated_at => pg_temp.upd(pg_temp.id(600)),
  p_enrollment => pg_temp.id(601), p_enrollment_updated_at => pg_temp.eupd(pg_temp.id(601)), p_without_enrollment_reason => 'Place réservée') = pg_temp.id(601),
  'admin places a Submitted row with reason');
-- S2: a placement without enrollment into a full group logs both reasons; Contrôles (d) shows the placement.
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(641), 'EAP T full-group placement', 'Prospect', 'Yearly');
select pg_temp.act(1);
select pg_temp.ok(public.place_learner_in_group(p_student => pg_temp.id(641), p_group => pg_temp.id(501), p_student_updated_at => pg_temp.upd(pg_temp.id(641)),
  p_capacity_override_reason => 'Place ajoutée', p_without_enrollment_reason => 'Bourse pleine') is not null, 'director places without enrollment into a full group');
select pg_temp.owner();
select pg_temp.ok((select count(distinct after->>'kind') = 2 from public.activity_log where target_table = 'enrollments'
  and target_id = (select id from public.enrollments where student_id = pg_temp.id(641))
  and after->>'kind' in ('placement_without_enrollment', 'capacity_override')), 'full-group placement logs both kinds on the enrollment');
select pg_temp.ok((select count(*) = 1 from public.activity_log where target_table = 'enrollments' and after->>'kind' = 'placement_without_enrollment'
  and after->>'student_id' = pg_temp.id(640)::text and after->>'reason' = 'Bourse EAP' and after->>'author_role' = 'admin'), 'placement logged with reason and role');
select pg_temp.ok((select count(*) = 1 from public.activity_log where target_table = 'enrollments' and after->>'kind' = 'placement_without_enrollment'
  and target_id = pg_temp.id(601) and after->>'reason' = 'Place réservée'), 'legacy-row placement logged');

-- ── 5. Reopen of archived rows (Q11, R6) ────────────────────────────────────
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(650), 'EAP T archived', 'Prospect', 'Yearly'),
  (pg_temp.id(651), 'EAP T imitation', 'Prospect', 'Yearly');
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(660), pg_temp.id(650), 'Confirmed', 'Yearly', '2025/2026', 'Child 2'),
  (pg_temp.id(661), pg_temp.id(651), 'Confirmed', 'Yearly', '2025/2026', 'Child 2');
select academic_security.end_enrollment(pg_temp.id(660), 'Pré-inscription abandonnée (retrait des pré-inscriptions, 04/11/2026)'),
  academic_security.end_enrollment(pg_temp.id(661), 'Pré-inscription abandonnée (retrait des pré-inscriptions, 04/11/2026)');
insert into maintenance.eap_archive_journal(run_id, action, entity, row_id, before) values (gen_random_uuid(), 'ended', 'enrollments', pg_temp.id(660), '{"status":"Submitted"}');
select pg_temp.act(1);
select pg_temp.refused(format('select public.reopen_enrollment(%L, %L)', pg_temp.id(660), pg_temp.eupd(pg_temp.id(660))),
  '23514', 'eap.archived_not_reopenable', 'archived row is not reopened');
select pg_temp.ok(public.reopen_enrollment(pg_temp.id(661), pg_temp.eupd(pg_temp.id(661))) is not null, 'imitated wording reopens');
select pg_temp.owner();
select pg_temp.ok((select status = 'Confirmed' from public.enrollments where id = pg_temp.id(661)), 'reopened row is Confirmed');
-- A reverted archive row is reopenable again.
insert into maintenance.eap_archive_journal(run_id, action, entity, row_id, before, reverts_id)
select run_id, 'reverted', 'enrollments', row_id, '{}', id from maintenance.eap_archive_journal where row_id = pg_temp.id(660);
select pg_temp.act(1);
select pg_temp.ok(public.reopen_enrollment(pg_temp.id(660), pg_temp.eupd(pg_temp.id(660))) is not null, 'reverted archive row reopens');
select pg_temp.owner();

-- ── 6. Contrôles (d) unpaid_never and (e) paid_unlinked (R7, S2) ────────────
insert into public.students(id, full_name, status, session_type) values
  (pg_temp.id(670), 'EAP T pre-existing unpaid', 'Prospect', 'Yearly'),
  (pg_temp.id(671), 'EAP T C1 shape', 'Prospect', 'Yearly'),
  (pg_temp.id(672), 'EAP T C5 shape', 'Prospect', 'Mise à niveau'),
  (pg_temp.id(673), 'EAP T C1 outside window', 'Prospect', 'Yearly'),
  (pg_temp.id(674), 'EAP T C1 other programme', 'Prospect', 'Yearly'),
  (pg_temp.id(675), 'EAP T C5 outside window', 'Prospect', 'Mise à niveau'),
  (pg_temp.id(676), 'EAP T L2 shape', 'Prospect', 'Yearly');
-- N5: a legacy unpaid Submitted row whose learner paid on an unlinked receipt (the R0 L2 shape).
select set_config('eh.enrollment_command', 'on', true), set_config('eh.membership_sync', 'on', true);
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(686), pg_temp.id(676), 'Submitted', 'Yearly', '2026/2027', 'Child 2');
select set_config('eh.membership_sync', '', true), set_config('eh.enrollment_command', '', true);
insert into public.enrollments(id, student_id, status, session_type, school_year, level, group_id, created_at) values
  (pg_temp.id(680), pg_temp.id(670), 'Confirmed', 'Yearly', '2024/2025', 'Child 2', null, '2024-09-01'),
  (pg_temp.id(681), pg_temp.id(671), 'Validated', 'Yearly', '2026/2027', 'Child 2', pg_temp.id(500), now()),
  (pg_temp.id(682), pg_temp.id(672), 'Confirmed', 'Mise à niveau', '2026/2027', 'A1', null, now()),
  (pg_temp.id(683), pg_temp.id(673), 'Validated', 'Yearly', '2026/2027', 'Child 2', pg_temp.id(500), now()),
  (pg_temp.id(684), pg_temp.id(674), 'Validated', 'Yearly', '2026/2027', 'Child 2', pg_temp.id(500), now()),
  (pg_temp.id(685), pg_temp.id(675), 'Confirmed', 'Mise à niveau', '2026/2027', 'A1', null, now());
-- Historical payments, written as a pre-057 import would have left them (owner session, triggers off).
set local session_replication_role = replica;
insert into public.charges(id, student_id, session_type, school_year, level, plan_type, gross_amount, discount_amount, legacy, service_description, created_by) values
  (pg_temp.id(690), pg_temp.id(671), 'Yearly', null, 'Child 2', 'Standard', 3000, 0, false, 'EAP undated', pg_temp.id(1)),
  (pg_temp.id(691), pg_temp.id(672), 'Mise à niveau', null, 'A1', null, 1000, 0, true, 'EAP legacy balance', null),
  (pg_temp.id(692), pg_temp.id(673), 'Yearly', null, 'Child 2', 'Standard', 3000, 0, false, 'EAP undated', pg_temp.id(1)),
  (pg_temp.id(693), pg_temp.id(674), 'Adults', null, 'B1', null, 3000, 0, false, 'EAP undated other', pg_temp.id(1)),
  (pg_temp.id(694), pg_temp.id(675), 'Mise à niveau', null, 'A1', null, 1000, 0, true, 'EAP legacy balance', null),
  (pg_temp.id(689), pg_temp.id(676), 'Yearly', null, 'Child 2', 'Standard', 3000, 0, false, 'EAP undated L2', pg_temp.id(1));
insert into public.receipts(id, student_id, charge_id, date, nom_prenom, montant_total, montant_paye, mode_paiement, session_type) values
  (pg_temp.id(695), pg_temp.id(671), pg_temp.id(690), '2026-07-01', 'EAP T C1 shape', 3000, 500, 'Espèces', 'Yearly'),
  (pg_temp.id(696), pg_temp.id(672), pg_temp.id(691), '2027-08-31', 'EAP T C5 shape', 1000, 500, 'Espèces', 'Mise à niveau'),
  (pg_temp.id(697), pg_temp.id(673), pg_temp.id(692), '2026-05-31', 'EAP T C1 outside window', 3000, 500, 'Espèces', 'Yearly'),
  (pg_temp.id(698), pg_temp.id(674), pg_temp.id(693), '2026-07-01', 'EAP T C1 other programme', 3000, 500, 'Espèces', 'Adults'),
  (pg_temp.id(699), pg_temp.id(675), pg_temp.id(694), '2027-09-01', 'EAP T C5 outside window', 1000, 500, 'Espèces', 'Mise à niveau'),
  (pg_temp.id(688), pg_temp.id(676), pg_temp.id(689), '2026-07-01', 'EAP T L2 shape', 3000, 500, 'Espèces', 'Yearly');
set local session_replication_role = origin;
select pg_temp.act(1);
select pg_temp.put('queue', public.get_finance_review_queue(null));
select pg_temp.owner();
select pg_temp.ok(not (pg_temp.get('queue') ? 'pending_confirmation') and pg_temp.get('queue') ? 'unpaid_never' and pg_temp.get('queue') ? 'paid_unlinked',
  'queue keys');
create function pg_temp.in_list(k text, e uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(pg_temp.get('queue')->k) x where x->>'enrollment_id' = e::text or x->>'id' = e::text) $$;
select pg_temp.ok(pg_temp.in_list('unpaid_never', pg_temp.id(680)), '(d) pre-existing unpaid, any date');
select pg_temp.ok(pg_temp.in_list('unpaid_never', (select id from public.enrollments where student_id = pg_temp.id(640))), '(d) placement-created');
select pg_temp.ok(pg_temp.in_list('unpaid_never', pg_temp.id(632)), '(d) reopened unpaid');
select pg_temp.ok(not pg_temp.in_list('unpaid_never', (pg_temp.get('free')->>'enrollment_id')::uuid), '(d) not the free enrollment');
select pg_temp.ok(not pg_temp.in_list('unpaid_never', (pg_temp.get('p620')->>'enrollment_id')::uuid), '(d) not a paid one');
select pg_temp.ok(pg_temp.in_list('paid_unlinked', pg_temp.id(681)) and not pg_temp.in_list('unpaid_never', pg_temp.id(681)), 'C1 shape in (e) only');
select pg_temp.ok(pg_temp.in_list('paid_unlinked', pg_temp.id(682)) and not pg_temp.in_list('unpaid_never', pg_temp.id(682)), 'C5 shape in (e) only');
select pg_temp.ok(pg_temp.in_list('unpaid_never', pg_temp.id(683)) and not pg_temp.in_list('paid_unlinked', pg_temp.id(683)), 'C1 outside the window in (d)');
select pg_temp.ok(pg_temp.in_list('unpaid_never', pg_temp.id(684)) and not pg_temp.in_list('paid_unlinked', pg_temp.id(684)), 'C1 other programme in (d)');
select pg_temp.ok(pg_temp.in_list('unpaid_never', pg_temp.id(685)) and not pg_temp.in_list('paid_unlinked', pg_temp.id(685)), 'C5 outside the window in (d)');
select pg_temp.ok((select x->'origin'->>'kind' = 'placement_without_enrollment' and x->'origin'->>'reason' = 'Bourse pleine'
    from jsonb_array_elements(pg_temp.get('queue')->'unpaid_never') x
    where x->>'enrollment_id' = (select id from public.enrollments where student_id = pg_temp.id(641))::text), '(d) S2: placement wins over the capacity override');
select pg_temp.ok((select x->'origin'->>'kind' = 'placement_without_enrollment' and x->'origin'->>'reason' = 'Bourse EAP'
    from jsonb_array_elements(pg_temp.get('queue')->'unpaid_never') x
    where x->>'enrollment_id' = (select id from public.enrollments where student_id = pg_temp.id(640))::text
       or x->>'id' = (select id from public.enrollments where student_id = pg_temp.id(640))::text), '(d) origin of a placement');
-- The K1/K3 statements of the R0 count query, restricted to this fixture, equal the function's lists.
create temp table k_fixture as select id from public.enrollments
  where student_id in (select id from public.students where full_name like 'EAP T %' or full_name like 'EAP child %');
select pg_temp.ok((select count(*) from public.enrollments e where e.id in (select id from k_fixture) and e.status in ('Confirmed','Validated')
    and not exists (select 1 from public.receipts r where r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
    and not exists (select 1 from public.charges c where c.enrollment_id = e.id and c.voided_at is null and c.gross_amount > 0 and c.discount_amount = c.gross_amount)
    and not exists (select 1 from public.receipts r join public.charges c on c.id = r.charge_id
      where r.student_id = e.student_id and r.voided_at is null and r.deleted_at is null and r.montant_paye > 0
        and r.enrollment_id is null and c.enrollment_id is null
        and ((not c.legacy and c.school_year is not null and c.session_type = e.session_type and c.school_year = e.school_year)
          or ((c.legacy or c.school_year is null) and (c.legacy or c.session_type = e.session_type)
            and e.school_year is not null
            and r.date between make_date(left(e.school_year, 4)::integer, 6, 1) and make_date(left(e.school_year, 4)::integer + 1, 8, 31)))))
  = (select count(*) from jsonb_array_elements(pg_temp.get('queue')->'unpaid_never') x
      where coalesce(x->>'enrollment_id', x->>'id')::uuid in (select id from k_fixture)), 'K1 statement = (d) on the fixture');
select pg_temp.ok((select count(*) from public.enrollments e where e.id in (select id from k_fixture) and e.status in ('Confirmed','Validated')
    and not exists (select 1 from public.receipts r where r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
    and exists (select 1 from public.receipts r join public.charges c on c.id = r.charge_id
      where r.student_id = e.student_id and r.voided_at is null and r.deleted_at is null and r.montant_paye > 0
        and r.enrollment_id is null and c.enrollment_id is null
        and ((not c.legacy and c.school_year is not null and c.session_type = e.session_type and c.school_year = e.school_year)
          or ((c.legacy or c.school_year is null) and (c.legacy or c.session_type = e.session_type)
            and e.school_year is not null
            and r.date between make_date(left(e.school_year, 4)::integer, 6, 1) and make_date(left(e.school_year, 4)::integer + 1, 8, 31)))))
  = (select count(*) from jsonb_array_elements(pg_temp.get('queue')->'paid_unlinked') x
      where coalesce(x->>'enrollment_id', x->>'id')::uuid in (select id from k_fixture)), 'K3 statement = (e) on the fixture');
select pg_temp.ok((select count(*) from public.enrollments e where e.id in (select id from k_fixture)
    and finance_security.unlinked_payment_count(e.student_id, e.session_type, e.school_year) > 0) = 3, 'helper: the C1, C5 and L2 shapes only');
-- N5: the L2 statement of the R0 count query, restricted to this fixture, finds exactly the retired
-- unpaid rows the helper sees as paid elsewhere (the L2 shape, 686).
select pg_temp.ok((with live as (
    select e.id, e.student_id, e.session_type, e.school_year,
      (select coalesce(sum(r.montant_paye), 0) from public.receipts r
        where r.voided_at is null and r.deleted_at is null
          and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))) as paid
    from public.enrollments e where e.status in ('Submitted', 'Under Review', 'Trial') and e.id in (select id from k_fixture))
  select array_agg(x.id order by x.id) from live x
  where x.paid = 0 and exists (select 1 from public.receipts r join public.charges c on c.id = r.charge_id
    where r.student_id = x.student_id and r.voided_at is null and r.deleted_at is null and r.montant_paye > 0
      and r.enrollment_id is null and c.enrollment_id is null
      and ((not c.legacy and c.school_year is not null and c.session_type = x.session_type and c.school_year = x.school_year)
        or ((c.legacy or c.school_year is null) and (c.legacy or c.session_type = x.session_type)
          and x.school_year is not null
          and r.date between make_date(left(x.school_year, 4)::integer, 6, 1) and make_date(left(x.school_year, 4)::integer + 1, 8, 31)))))
  = (select array_agg(e.id order by e.id) from public.enrollments e where e.id in (select id from k_fixture)
      and e.status in ('Submitted', 'Under Review', 'Trial')
      and finance_security.unlinked_payment_count(e.student_id, e.session_type, e.school_year) > 0)
  and (select array_agg(e.id) from public.enrollments e where e.id in (select id from k_fixture) and e.status in ('Submitted', 'Under Review', 'Trial')
      and finance_security.unlinked_payment_count(e.student_id, e.session_type, e.school_year) > 0) = array[pg_temp.id(686)], 'L2 statement = helper on the fixture');
-- Reception does not read the queue.
select pg_temp.act(3);
select pg_temp.refused('select public.get_finance_review_queue(null)', '42501', null, 'queue refused for reception');
select pg_temp.owner();

-- ── 7. Grants of the new and re-created functions ───────────────────────────
select pg_temp.ok(not has_function_privilege('authenticated', 'public.crm_start_enrollment(uuid,jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.crm_start_enrollment(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.crm_start_enrollment(uuid,jsonb)', 'execute'), 'crm_start_enrollment: no API grant');
select pg_temp.ok((select proacl::text from pg_proc where oid = 'academic_security.place(uuid,uuid,uuid,text,timestamptz,timestamptz,text,boolean,text)'::regprocedure)
  = '{postgres=X/postgres}', 'place: owner only');
select pg_temp.ok((select prosecdef and proconfig = array['search_path=pg_catalog, pg_temp'] from pg_proc
  where oid = 'academic_security.place(uuid,uuid,uuid,text,timestamptz,timestamptz,text,boolean,text)'::regprocedure), 'place: definer, fixed path');
select pg_temp.ok((select proacl::text from pg_proc where oid = 'public.place_learner_in_group(uuid,uuid,timestamptz,uuid,text,timestamptz,text,text)'::regprocedure)
  = '{postgres=X/postgres,authenticated=X/postgres}', 'place_learner_in_group: authenticated only');
select pg_temp.ok(to_regprocedure('public.place_learner_in_group(uuid,uuid,timestamptz,uuid,text,timestamptz,text)') is null
  and to_regprocedure('academic_security.place(uuid,uuid,uuid,text,timestamptz,timestamptz,text,boolean)') is null, 'old placement signatures dropped');
select pg_temp.ok((select proacl::text from pg_proc where oid = 'academic_security.guard_retired_enrollment_status()'::regprocedure) = '{postgres=X/postgres}'
  and (select proacl::text from pg_proc where oid = 'finance_security.unlinked_payment_count(uuid,text,text)'::regprocedure) = '{postgres=X/postgres}',
  'guard and helper: owner only');
select pg_temp.ok((select relrowsecurity and relacl::text = '{postgres=arwdDxtm/postgres}' from pg_class where oid = 'maintenance.eap_archive_journal'::regclass),
  'journal: RLS on, owner only');
select pg_temp.ok((select prosecdef from pg_proc where oid = 'crm_security.protect_enrollment_link()'::regprocedure) is false, 'protect_enrollment_link stays invoker');

-- ── 8. S1: the detach exemption of protect_enrollment_link (D7) ───────────────
-- A non-converted lead linked to a learner's enrollment; owner writes, as the archive step does.
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(900), 'EAP T detach', 'Prospect', 'Yearly');
-- A legacy Submitted row: live, and linking it converts nothing.
select set_config('eh.enrollment_command', 'on', true), set_config('eh.membership_sync', 'on', true);
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(901), pg_temp.id(900), 'Submitted', 'Yearly', '2026/2027', 'Child 2');
select set_config('eh.membership_sync', '', true), set_config('eh.enrollment_command', '', true);
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(902), 'EAP T detach other', 'Prospect', 'Yearly');
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(903), pg_temp.id(900), 'Confirmed', 'Adults', '2026/2027', 'B1');
select pg_temp.put('l9', to_jsonb(pg_temp.lead(9)));
select set_config('eh.crm_detach', 'on', true);
update public.crm_leads set student_id = pg_temp.id(900), enrollment_id = pg_temp.id(901) where id = pg_temp.uid_of('l9');
select pg_temp.ok((select status <> 'CONVERTED' and converted_at is null from public.crm_leads where id = pg_temp.uid_of('l9')), 'S1 fixture: linked, not converted');
-- Flag on, live enrollment: refused.
select pg_temp.refused(format('update public.crm_leads set enrollment_id = null where id = %L', pg_temp.uid_of('l9')), '42501', null, 'S1 detach from a live enrollment');
select academic_security.end_enrollment(pg_temp.id(901), 'Départ EAP');
-- Flag off, ended enrollment: refused.
select set_config('eh.crm_detach', '', true);
select pg_temp.refused(format('update public.crm_leads set enrollment_id = null where id = %L', pg_temp.uid_of('l9')), '42501', null, 'S1 detach without the flag');
select set_config('eh.crm_detach', 'on', true);
-- Flag on, ended enrollment, but a retarget or a learner change: refused.
select pg_temp.refused(format('update public.crm_leads set enrollment_id = %L where id = %L', pg_temp.id(903), pg_temp.uid_of('l9')), '42501', null, 'S1 retarget to another enrollment');
select pg_temp.refused(format('update public.crm_leads set enrollment_id = null, student_id = %L where id = %L', pg_temp.id(902), pg_temp.uid_of('l9')), '42501', null, 'S1 learner change');
select pg_temp.refused(format('update public.crm_leads set enrollment_id = null, student_id = null where id = %L', pg_temp.uid_of('l9')), '42501', null, 'S1 learner cleared');
-- Flag on, converted lead whose enrollment ended: refused (l4 converted on the paid 620 row).
select academic_security.end_enrollment((pg_temp.get('p620')->>'enrollment_id')::uuid, 'Départ EAP');
select pg_temp.ok((select status = 'CONVERTED' and converted_at is not null from public.crm_leads where id = pg_temp.uid_of('l4')), 'S1 converted lead');
select pg_temp.refused(format('update public.crm_leads set enrollment_id = null where id = %L', pg_temp.uid_of('l4')), '42501', null, 'S1 detach a converted lead');
-- The one admitted shape: flag on, ended enrollment, same learner, not converted.
update public.crm_leads set enrollment_id = null where id = pg_temp.uid_of('l9');
select pg_temp.ok((select enrollment_id is null and student_id = pg_temp.id(900) from public.crm_leads where id = pg_temp.uid_of('l9')), 'S1 admitted detach keeps the learner');
select set_config('eh.crm_detach', '', true);

select 'PASS enrollment at payment' as result;
rollback;
