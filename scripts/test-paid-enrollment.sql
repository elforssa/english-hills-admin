-- Run only against local Supabase. Synthetic rows are rolled back.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
 ('72000000-0000-0000-0000-000000000001','paid-staff@example.test','authenticated','authenticated',now(),now()),
 ('72000000-0000-0000-0000-000000000002','paid-parent@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id='72000000-0000-0000-0000-000000000001';
update public.profiles set role='parent' where id='72000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000001',true);
set local role authenticated;
create temp table paid_case(case_name text primary key, result jsonb);

insert into paid_case values ('new', public.create_charge_payment(jsonb_build_object(
  'student_name','Paid New Student','session_type','Yearly','school_year','2026/2027',
  'plan_type','Standard','gross_amount',1000,'payment_amount',100,
  'payment_method','Espèces','idempotency_key','72000000-0000-0000-0000-000000000011')));
do $$ declare v record; begin
  select s.status, e.status enrollment_status, e.group_id, e.session_type, e.school_year,
    c.enrollment_id charge_enrollment, r.enrollment_id receipt_enrollment, r.montant_paye
    into v from paid_case p join public.charges c on c.id=(p.result->>'charge_id')::uuid
    join public.students s on s.id=c.student_id
    join public.enrollments e on e.id=c.enrollment_id
    join public.receipts r on r.id=(p.result->>'receipt_id')::uuid
    where p.case_name='new';
  if v.status <> 'Enrolled' or v.enrollment_status <> 'Confirmed'
    or v.group_id is not null or v.session_type <> 'Yearly'
    or v.school_year <> '2026/2027' or v.receipt_enrollment <> v.charge_enrollment
    or v.montant_paye <> 100 then
    raise exception 'Paid new student was not atomically confirmed and linked';
  end if;
end $$;

insert into paid_case values ('new-adults', public.create_charge_payment(jsonb_build_object(
  'student_name','Paid New Adult','session_type','Adults','school_year','2026/2027',
  'level','Beginning 1','gross_amount',600,'payment_amount',60,
  'payment_method','Espèces','idempotency_key','72000000-0000-0000-0000-000000000020')));
do $$ begin
  if (select s.session_type from public.students s join public.charges c on c.student_id=s.id
      where c.id=(select (result->>'charge_id')::uuid from paid_case where case_name='new-adults')) <> 'Adults'
    or (select s.niveau_cefr from public.students s join public.charges c on c.student_id=s.id
      where c.id=(select (result->>'charge_id')::uuid from paid_case where case_name='new-adults')) <> 'Beginning 1' then
    raise exception 'New student dossier did not receive its paid session and level';
  end if;
end $$;

insert into public.groups(id,name,session_type,niveau)
values ('72000000-0000-0000-0000-000000000042','Synthetic adult group','Adults','Beginning 1');
update public.enrollments set group_id='72000000-0000-0000-0000-000000000042'
where id=(select (result->>'enrollment_id')::uuid from paid_case where case_name='new-adults');
do $$ begin
  if (select status from public.enrollments where id=(select (result->>'enrollment_id')::uuid from paid_case where case_name='new-adults')) <> 'Validated' then
    raise exception 'Matching adult group did not validate enrollment';
  end if;
end $$;

insert into paid_case values ('replay', public.create_charge_payment(jsonb_build_object(
  'student_name','Paid New Student','session_type','Yearly','school_year','2026/2027',
  'plan_type','Standard','gross_amount',1000,'payment_amount',100,
  'payment_method','Espèces','idempotency_key','72000000-0000-0000-0000-000000000011')));
do $$ begin
  if (select result->>'receipt_id' from paid_case where case_name='new')
    <> (select result->>'receipt_id' from paid_case where case_name='replay')
    or (select count(*) from public.enrollments e join public.charges c on c.student_id=e.student_id
        where c.id=(select (result->>'charge_id')::uuid from paid_case where case_name='new')) <> 1 then
    raise exception 'Idempotent retry created duplicate enrollment';
  end if;
end $$;

insert into paid_case values ('installment', public.create_charge_payment(jsonb_build_object(
  'student_id',(select c.student_id from public.charges c join paid_case p on c.id=(p.result->>'charge_id')::uuid where p.case_name='new'),
  'charge_id',(select (result->>'charge_id')::uuid from paid_case where case_name='new'),
  'payment_amount',200,'payment_method','Espèces',
  'idempotency_key','72000000-0000-0000-0000-000000000012')));
do $$ begin
  if (select result->>'enrollment_id' from paid_case where case_name='installment')
    <> (select result->>'enrollment_id' from paid_case where case_name='new')
    or (select paid_amount from public.charge_balances where id=(select (result->>'charge_id')::uuid from paid_case where case_name='new')) <> 300 then
    raise exception 'Installment did not reuse enrollment and retain balance';
  end if;
end $$;

insert into public.students(id,full_name,status) values
  ('72000000-0000-0000-0000-000000000021','Existing Prospect','Prospect'),
  ('72000000-0000-0000-0000-000000000022','Zero Payment','Prospect'),
  ('72000000-0000-0000-0000-000000000023','Other Service','Prospect');
insert into public.enrollments(id,student_id,status,date_inscription)
values ('72000000-0000-0000-0000-000000000031','72000000-0000-0000-0000-000000000021','Submitted',current_date);

insert into paid_case values ('prospect', public.create_charge_payment(jsonb_build_object(
  'student_id','72000000-0000-0000-0000-000000000021',
  'enrollment_id','72000000-0000-0000-0000-000000000031',
  'session_type','Adults','school_year','2026/2027','gross_amount',500,
  'payment_amount',50,'payment_method','Espèces',
  'idempotency_key','72000000-0000-0000-0000-000000000013')));
do $$ begin
  if (select status from public.students where id='72000000-0000-0000-0000-000000000021') <> 'Enrolled'
    or (select status from public.enrollments where id='72000000-0000-0000-0000-000000000031') <> 'Confirmed'
    or (select count(*) from public.enrollments where student_id='72000000-0000-0000-0000-000000000021') <> 1 then
    raise exception 'Explicit existing enrollment not reused';
  end if;
end $$;

insert into paid_case values ('zero', public.create_charge_payment(jsonb_build_object(
  'student_id','72000000-0000-0000-0000-000000000022',
  'session_type','Yearly','school_year','2026/2027','plan_type','Standard',
  'gross_amount',100,'payment_amount',0,'idempotency_key','72000000-0000-0000-0000-000000000014')));
do $$ begin
  if (select count(*) from public.enrollments where student_id='72000000-0000-0000-0000-000000000022') <> 0
    or (select status from public.students where id='72000000-0000-0000-0000-000000000022') <> 'Prospect'
    or (select result->>'receipt_id' from paid_case where case_name='zero') is not null then
    raise exception 'Zero payment changed enrollment';
  end if;
end $$;

insert into paid_case values ('other', public.create_charge_payment(jsonb_build_object(
  'student_id','72000000-0000-0000-0000-000000000023',
  'session_type','Other','school_year','2026/2027','service_detail','Test service',
  'gross_amount',100,'payment_amount',10,'payment_method','Espèces',
  'idempotency_key','72000000-0000-0000-0000-000000000015')));
do $$ begin
  if (select count(*) from public.enrollments where student_id='72000000-0000-0000-0000-000000000023') <> 0
    or (select status from public.students where id='72000000-0000-0000-0000-000000000023') <> 'Prospect' then
    raise exception 'Other service created enrollment';
  end if;
end $$;

-- Void never reverses a confirmed academic enrollment.
select public.void_financial_receipt((select (result->>'receipt_id')::uuid from paid_case where case_name='prospect'),
  'Synthetic correction','72000000-0000-0000-0000-000000000016');
do $$ begin
  if (select status from public.enrollments where id='72000000-0000-0000-0000-000000000031') <> 'Confirmed' then
    raise exception 'Receipt void downgraded an enrollment';
  end if;
end $$;

-- A group assignment validates the enrollment and establishes group access.
insert into public.groups(id,name,session_type,niveau)
values ('72000000-0000-0000-0000-000000000041','Synthetic paid group','Yearly','Child 1');
update public.enrollments set group_id='72000000-0000-0000-0000-000000000041'
where id=(select (result->>'enrollment_id')::uuid from paid_case where case_name='new');
do $$ begin
  if (select status from public.enrollments where id=(select (result->>'enrollment_id')::uuid from paid_case where case_name='new')) <> 'Validated'
    or (select groupe_id from public.students where id=(select c.student_id from public.charges c join paid_case p on c.id=(p.result->>'charge_id')::uuid where p.case_name='new'))
      <> '72000000-0000-0000-0000-000000000041'::uuid then
    raise exception 'Group assignment did not validate enrollment';
  end if;
end $$;

-- A separate program does not overwrite the student's existing group.
insert into paid_case values ('another-program', public.create_charge_payment(jsonb_build_object(
  'student_id',(select c.student_id from public.charges c join paid_case p on c.id=(p.result->>'charge_id')::uuid where p.case_name='new'),
  'session_type','Adults','school_year','2026/2027','level','Beginning 1',
  'gross_amount',200,'payment_amount',20,'payment_method','Espèces',
  'idempotency_key','72000000-0000-0000-0000-000000000017')));
do $$ begin
  if (select result->>'enrollment_id' from paid_case where case_name='another-program')
      = (select result->>'enrollment_id' from paid_case where case_name='new')
    or (select level from public.enrollments where id=(select (result->>'enrollment_id')::uuid from paid_case where case_name='another-program')) <> 'Beginning 1'
    or (select groupe_id from public.students where id=(select c.student_id from public.charges c join paid_case p on c.id=(p.result->>'charge_id')::uuid where p.case_name='new'))
      <> '72000000-0000-0000-0000-000000000041'::uuid then
    raise exception 'Separate program reused enrollment or erased group';
  end if;
end $$;
do $$ begin
  begin
    update public.enrollments set group_id='72000000-0000-0000-0000-000000000041'
    where id=(select (result->>'enrollment_id')::uuid from paid_case where case_name='another-program');
    raise exception 'Cross-session group assignment unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;

update public.enrollments set status='Confirmed', group_id=null
where id=(select (result->>'enrollment_id')::uuid from paid_case where case_name='new');
do $$ begin
  if (select groupe_id from public.students where id=(select c.student_id from public.charges c join paid_case p on c.id=(p.result->>'charge_id')::uuid where p.case_name='new')) is not null
    or (select status from public.students where id=(select c.student_id from public.charges c join paid_case p on c.id=(p.result->>'charge_id')::uuid where p.case_name='new')) <> 'Enrolled' then
    raise exception 'Moving a group assignment back to pending kept the old group';
  end if;
end $$;

-- Explicit staff rejection of a group-pending enrollment does downgrade it;
-- voiding a payment alone never does.
update public.enrollments set status='Rejected'
where id='72000000-0000-0000-0000-000000000031';
do $$ begin
  if (select status from public.students where id='72000000-0000-0000-0000-000000000021') <> 'Inactive' then
    raise exception 'Explicit rejection left student enrolled';
  end if;
end $$;

-- Changed explicit enrollment under the same retry key must fail.
do $$ begin
  begin
    perform public.create_charge_payment(jsonb_build_object(
      'student_id','72000000-0000-0000-0000-000000000021',
      'enrollment_id','72000000-0000-0000-0000-000000000099',
      'session_type','Adults','school_year','2026/2027','gross_amount',500,
      'payment_amount',50,'payment_method','Espèces',
      'idempotency_key','72000000-0000-0000-0000-000000000013'));
    raise exception 'Changed enrollment unexpectedly replayed';
  exception when others then
    if sqlerrm not like 'Idempotency key conflict:%' then raise; end if;
  end;
end $$;

-- A failed enrollment link must roll back even the initial student and receipt.
do $$ declare before_students bigint := (select count(*) from public.students);
  before_receipts bigint := (select count(*) from public.receipts); begin
  begin
    perform public.create_charge_payment(jsonb_build_object(
      'student_name','Rolled Back New Student',
      'enrollment_id','72000000-0000-0000-0000-000000000031',
      'session_type','Yearly','school_year','2026/2027','plan_type','Standard',
      'gross_amount',100,'payment_amount',10,'payment_method','Espèces',
      'idempotency_key','72000000-0000-0000-0000-000000000018'));
    raise exception 'Wrong-student enrollment unexpectedly accepted';
  exception when others then
    if sqlerrm not like 'Selected enrollment does not match%' then raise; end if;
  end;
  if (select count(*) from public.students) <> before_students
    or (select count(*) from public.receipts) <> before_receipts then
    raise exception 'Failed payment left partial writes';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ declare changed integer; begin
  update public.enrollments set status='Confirmed'
    where id='72000000-0000-0000-0000-000000000031';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'Parent confirmed an enrollment';
  end if;
end $$;
do $$ begin
  begin
    perform public.create_charge_payment(jsonb_build_object(
      'student_name','Unauthorized Student','session_type','Yearly','school_year','2026/2027',
      'plan_type','Standard','gross_amount',100,'payment_amount',10,
      'payment_method','Espèces','idempotency_key','72000000-0000-0000-0000-000000000019'));
    raise exception 'Parent unexpectedly confirmed a payment';
  exception when others then
    if sqlerrm <> 'Forbidden' then raise; end if;
  end;
end $$;
rollback;
\echo 'paid enrollment transaction tests passed'
