-- Phase 2: allow a receipt to carry an optional academic assignment.
-- Existing receipts remain valid with both links NULL.

begin;

alter table public.receipts
  add column if not exists group_id uuid,
  add column if not exists enrollment_id uuid;

alter table public.receipts
  drop constraint if exists receipts_group_id_fkey,
  add constraint receipts_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete set null,
  drop constraint if exists receipts_enrollment_id_fkey,
  add constraint receipts_enrollment_id_fkey
    foreign key (enrollment_id) references public.enrollments(id) on delete set null;

create index if not exists receipts_group_id_idx
  on public.receipts (group_id)
  where group_id is not null;

create index if not exists receipts_enrollment_id_idx
  on public.receipts (enrollment_id)
  where enrollment_id is not null;

create or replace function public.validate_receipt_academic_links()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  linked_student_id uuid;
  linked_group_id uuid;
begin
  if new.enrollment_id is null then
    return new;
  end if;

  select enrollment.student_id, enrollment.group_id
    into linked_student_id, linked_group_id
  from public.enrollments as enrollment
  where enrollment.id = new.enrollment_id;

  if not found then
    raise exception 'The selected enrollment does not exist.';
  end if;

  if new.student_id is distinct from linked_student_id then
    raise exception 'The receipt and enrollment must belong to the same student.';
  end if;

  if new.group_id is null then
    new.group_id := linked_group_id;
  elsif linked_group_id is not null and new.group_id is distinct from linked_group_id then
    raise exception 'The receipt group must match the enrollment group.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_receipt_academic_links_trigger on public.receipts;
create trigger validate_receipt_academic_links_trigger
before insert or update of student_id, group_id, enrollment_id
on public.receipts
for each row
execute function public.validate_receipt_academic_links();

comment on column public.receipts.group_id is
  'Optional group linked at reception; may be assigned later.';
comment on column public.receipts.enrollment_id is
  'Optional enrollment associated with this receipt.';

commit;
