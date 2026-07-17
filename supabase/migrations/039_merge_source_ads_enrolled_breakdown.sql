-- 1) Merge "Publicité payante (Ads)" into "Réseaux sociaux (Facebook / Instagram)"
--    — reception can't reliably distinguish organic vs paid social at the desk.
-- 2) Count only ENROLLED students in the Finance acquisition breakdown.

update public.students set referral_source = 'Réseaux sociaux (Facebook / Instagram)'
  where referral_source = 'Publicité payante (Ads)';
update public.receipts set referral_source = 'Réseaux sociaux (Facebook / Instagram)'
  where referral_source = 'Publicité payante (Ads)';

alter table public.students drop constraint if exists students_referral_source_check;
alter table public.students add constraint students_referral_source_check
  check (referral_source is null or referral_source in (
    'Réseaux sociaux (Facebook / Instagram)',
    'Recherche Google',
    'Famille / Ami(e)',
    'Passage devant le centre (walk-in)',
    'Ancien élève / Réinscription'
  ));

alter table public.receipts drop constraint if exists receipts_referral_source_check;
alter table public.receipts add constraint receipts_referral_source_check
  check (referral_source is null or referral_source in (
    'Réseaux sociaux (Facebook / Instagram)',
    'Recherche Google',
    'Famille / Ami(e)',
    'Passage devant le centre (walk-in)',
    'Ancien élève / Réinscription'
  ));

create or replace function public.get_referral_breakdown()
returns json
language sql
stable
as $$
  select coalesce(json_agg(json_build_object('source', src, 'count', c) order by c desc), '[]'::json)
  from (
    select coalesce(referral_source, 'Non renseigné') as src, count(*) as c
    from public.students
    where status = 'Enrolled'
    group by 1
  ) t;
$$;
