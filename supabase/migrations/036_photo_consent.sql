-- Photo / media consent (CNDP Law 09-08 image rights).
-- Tri-state standing choice on the student (withdrawable), plus a snapshot on
-- each receipt so the printed & signed reçu is a paper trail of the choice.

alter table public.students
  add column if not exists photo_consent text not null default 'Non demandé'
    check (photo_consent in ('Accepte', 'Refuse', 'Non demandé')),
  add column if not exists photo_consent_at timestamptz;

alter table public.receipts
  add column if not exists photo_consent text
    check (photo_consent is null or photo_consent in ('Accepte', 'Refuse', 'Non demandé'));

-- Stamp the date whenever an actual decision (Accepte/Refuse) is first recorded
-- or changed, so we know when consent was given/withdrawn.
create or replace function public.stamp_photo_consent()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.photo_consent <> 'Non demandé' then
      new.photo_consent_at := now();
    end if;
  elsif new.photo_consent is distinct from old.photo_consent
        and new.photo_consent <> 'Non demandé' then
    new.photo_consent_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_photo_consent_t on public.students;
create trigger stamp_photo_consent_t
  before insert or update of photo_consent on public.students
  for each row execute function public.stamp_photo_consent();
