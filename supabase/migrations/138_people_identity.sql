-- RWR-r5 PR B1 — people: one phone rule, one people search, duplicates, merges (M-B1).
-- Plan: docs/architecture/plans/receptionist-workflow.md §5.1–5.3, §7 invariants 6
-- and 7, §8 (PR B1), §10 (M-B1, D3, D5), as amended in its B1 implementation record.
--
-- PROVISIONAL NUMBER: renumber if main moves before merge.
--
-- What it does:
--  * phones (§5.1): public.phone_e164, phone_key, phone_is_placeholder, phone_mask,
--    phone_search_key and require_phone, mirrored by src/lib/phone.mjs and tested
--    against one fixture (scripts/fixtures/phone-cases.json). crm_security.
--    normalize_phone now delegates to them: « 212… » without « + » is read, a
--    placeholder (« 06 00 00 00 00 ») is no phone. A trigger on students and
--    authorized adults normalises and checks the telephone only on insert or when
--    the telephone itself changes, so every system update of a row with an old bad
--    number still succeeds. Expression indexes on phone_key(telephone);
--  * people search (§5.2): public.find_people (receptionist, admin, director);
--    phone_key containment added to the CRM search, the students list and a new
--    receipt picker RPC (search_desk_students);
--  * duplicates (§5.2): person_match_decisions; crm_create_prospect refuses a
--    strong match (same phone, or same name and birth date) with PT409
--    people.possible_duplicate until each match is answered « Même famille » or
--    « Personne différente »; record_person_match_decisions for the student forms;
--  * prospects (§5.3): crm_create_prospect (« Ajouter un enfant » reuses the
--    contact, « C'est la même personne »), crm_update_prospect (one « Fiche
--    modifiée » history entry, phones masked), the wrong-number correction in
--    crm_log_exchange (corrected_phone: the contact's number is fixed and a new
--    call sequence starts on it);
--  * merges, OD-8 = A « link, don't move »: crm_merge_prospects (the source keeps
--    its history and is linked with merged_into_lead_id; the target's timeline
--    reads the merge set), crm_merge_contacts, merge_students / unmerge_student /
--    student_merge_set (no enrollment, charge, receipt, attendance or test row is
--    written; only family links, authorized adults and unconverted prospects are
--    re-pointed, each journalled);
--  * Tâches (crm_get_work_queue, body from 136): one row per contact in each bucket;
--    siblings whose actions fall in the same bucket are grouped on the row of the
--    earliest (day script 4); a sibling due in another bucket keeps its own row there;
--  * enrollment learner candidates (crm_security.student_candidates, body from 084)
--    no longer offer a student merged into another file;
--  * set_next_action accepts the cause 'merge' (no next action, « Prospect
--    fusionné »); bodies otherwise verbatim from 137;
--  * data steps D3 (phones) and D5 (student merges): functions only, NOT run.
--    They are not granted to any API role; the release operator runs them with
--    the owner's separate approval.
--
-- Unchanged: the one-action rule, its index and the 137 triggers; every other
-- function, grant and policy. No existing row is written by this migration.

-- ---------------------------------------------------------------------------
-- 1. Phones (§5.1). Keep in step with src/lib/phone.mjs.
-- ---------------------------------------------------------------------------
create or replace function public.phone_e164(raw text)
returns text language plpgsql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
declare t text; n text;
begin
 if raw is null then return null; end if;
 t:=regexp_replace(raw,'^\s+|\s+$','','g');
 if t='' or t ~ '[^0-9+(). /-]' then return null; end if;
 n:=regexp_replace(t,'[(). /-]','','g');
 if n like '00%' then n:='+'||substr(n,3); end if;
 if n ~ '^212[5-7][0-9]{8}$' then n:='+'||n;
 elsif n ~ '^\+2120[5-7][0-9]{8}$' then n:='+212'||substr(n,6);
 elsif n ~ '^0[5-7][0-9]{8}$' then n:='+212'||substr(n,2);
 elsif n ~ '^[5-7][0-9]{8}$' then n:='+212'||n; end if;
 if n !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
 if n like '+212%' and n !~ '^\+212[5-7][0-9]{8}$' then return null; end if;
 return n;
end $$;

create or replace function public.phone_is_placeholder(e164 text)
returns boolean language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
 select coalesce(e164 ~ '^\+212[5-7]([0-9])\1{7}$',false)
$$;

create or replace function public.phone_key(raw text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
 select case when e is not null then case when e like '+212%' then substr(e,5) else substr(e,2) end
  else nullif(regexp_replace(regexp_replace(coalesce(raw,''),'[^0-9]','','g'),'^(00212|212|00|0)',''),'') end
 from (select public.phone_e164(raw) e) x
$$;

create or replace function public.phone_search_key(query text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
 select case when length(k)>=6 then k end from (select public.phone_key(query) k) x
$$;

create or replace function public.phone_mask(raw text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
 select case when raw is null or btrim(raw)='' then null
  when e is null then '•••'
  else left(d,2)||' •• •• •• '||right(d,2) end
 from (select public.phone_e164(raw) e, case when public.phone_e164(raw) like '+212%' then '0'||substr(public.phone_e164(raw),5) else public.phone_e164(raw) end d) x
$$;

-- The write-path rule: blank is « no phone »; anything else is stored in E.164 or refused.
create or replace function public.require_phone(raw text)
returns text language plpgsql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
declare e text;
begin
 if raw is null or regexp_replace(raw,'^\s+|\s+$','','g')='' then return null; end if;
 e:=public.phone_e164(raw);
 if e is null then raise exception 'Numéro invalide' using errcode='22023',hint='people.phone_invalid'; end if;
 if public.phone_is_placeholder(e) then raise exception 'Numéro fictif : laissez vide' using errcode='22023',hint='people.phone_placeholder'; end if;
 return e;
end $$;

-- Normalised name tokens, in order, for « same name » (accents folded, case and
-- punctuation ignored): « Sara El Amrani » = « el-amrani sara ».
create or replace function public.person_name_key(raw text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
 select nullif(array_to_string(array(select w from regexp_split_to_table(
  translate(lower(coalesce(raw,'')),'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ','aaaaaaceeeeiiiinooooouuuuyyoa'),'[[:space:][:punct:]]+') w
  where w<>'' order by w),' '),'')
$$;

revoke all on function public.phone_e164(text), public.phone_is_placeholder(text), public.phone_key(text), public.phone_search_key(text),
 public.phone_mask(text), public.require_phone(text), public.person_name_key(text) from public, anon;
grant execute on function public.phone_e164(text), public.phone_is_placeholder(text), public.phone_key(text), public.phone_search_key(text),
 public.phone_mask(text), public.require_phone(text), public.person_name_key(text) to authenticated, service_role;

-- The CRM normaliser delegates: E.164, and a placeholder is no phone (NF-9, NF-10).
create or replace function crm_security.normalize_phone(raw text)
returns text language sql immutable
set search_path = pg_catalog, pg_temp as $$
 select case when public.phone_is_placeholder(e) then null else e end from (select public.phone_e164(raw) e) x
$$;

create or replace function public.people_phone_guard()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp as $$
begin
 -- Only on insert or when the telephone itself changes (§5.1): every other update
 -- of a row whose stored number is bad stays possible.
 if tg_op='INSERT' or new.telephone is distinct from old.telephone then
  new.telephone:=public.require_phone(new.telephone);
  if new.telephone is null and tg_table_name='authorized_adults' then
   raise exception 'Numéro invalide' using errcode='22023',hint='people.phone_invalid'; end if;
 end if;
 return new;
end $$;
revoke all on function public.people_phone_guard() from public, anon, authenticated;

create trigger people_phone_guard before insert or update of telephone on public.students
 for each row execute function public.people_phone_guard();
create trigger people_phone_guard before insert or update of telephone on public.authorized_adults
 for each row execute function public.people_phone_guard();

create index students_phone_key_idx on public.students (public.phone_key(telephone)) where telephone is not null;
create index authorized_adults_phone_key_idx on public.authorized_adults (public.phone_key(telephone));

-- ---------------------------------------------------------------------------
-- 2. Identity tables (§5.2, §5.3).
-- ---------------------------------------------------------------------------
-- The restore file keeps these additive tables, columns, checks and indexes (and
-- their rows), so each is created only if absent: 138 can be applied again after
-- its restore (review of #217).
create table if not exists public.person_match_decisions (
 id uuid primary key default gen_random_uuid(),
 kind_a text not null check (kind_a in ('prospect','student')),
 id_a uuid not null,
 kind_b text not null check (kind_b in ('prospect','student')),
 id_b uuid not null,
 decision text not null check (decision in ('same_family','different_people')),
 decided_by uuid references public.profiles(id) on delete restrict,
 decided_at timestamptz not null default now(),
 -- One row per unordered pair, stored in a canonical order.
 check ((kind_a,id_a::text) < (kind_b,id_b::text))
);
create unique index if not exists person_match_decisions_pair on public.person_match_decisions(kind_a,id_a,kind_b,id_b);
create index if not exists person_match_decisions_b on public.person_match_decisions(kind_b,id_b);
alter table public.person_match_decisions enable row level security;
-- service_role too: only the security-definer commands write it (as C1 did for its table).
revoke all on table public.person_match_decisions from public, anon, authenticated, service_role;

alter table public.students add column if not exists merged_into_student_id uuid references public.students(id) on delete restrict;
alter table public.students add column if not exists merged_at timestamptz;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.students'::regclass and conname='students_merge_not_self') then
  alter table public.students add constraint students_merge_not_self check (merged_into_student_id is distinct from id); end if;
 if not exists(select 1 from pg_constraint where conrelid='public.students'::regclass and conname='students_merge_shape') then
  alter table public.students add constraint students_merge_shape check ((merged_into_student_id is null) = (merged_at is null)); end if;
end $$;
create index if not exists students_merged_into_idx on public.students(merged_into_student_id) where merged_into_student_id is not null;

-- Each link a student merge re-points, so unmerge_student can put it back.
create table if not exists public.student_merge_journal (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references public.students(id) on delete restrict,
 target_id uuid not null references public.students(id) on delete restrict,
 entity text not null check (entity in ('students','family_links','authorized_adults','crm_leads')),
 entity_id uuid not null,
 before_student uuid,
 after_student uuid,
 merged_by uuid references public.profiles(id) on delete restrict,
 merged_at timestamptz not null default now(),
 reverted_at timestamptz,
 reverted_by uuid references public.profiles(id) on delete restrict
);
create index if not exists student_merge_journal_source on public.student_merge_journal(source_id, merged_at);
alter table public.student_merge_journal enable row level security;
revoke all on table public.student_merge_journal from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Matches and decisions.
-- ---------------------------------------------------------------------------
-- Strong matches for one learner: same phone (key) as a prospect's contact or a
-- student, or same normalised name and birth date. A converted prospect is
-- reported as its student. Skips the record being edited and its contact
-- (siblings share the contact's phone by design).
create or replace function crm_security.person_matches(p_phones text[], p_name text, p_birth date, p_skip_lead uuid, p_skip_student uuid, p_skip_contact uuid)
returns jsonb language sql stable
set search_path = pg_catalog, pg_temp as $$
 with keys as (select distinct public.phone_key(x) k from unnest(coalesce(p_phones,'{}'::text[])) x
   where public.phone_e164(x) is not null and not public.phone_is_placeholder(public.phone_e164(x))),
 nk as (select public.person_name_key(p_name) k),
 hits as (
  select case when l.status='CONVERTED' and l.student_id is not null then 'student' else 'prospect' end kind,
   case when l.status='CONVERTED' and l.student_id is not null then l.student_id else l.id end id,
   case when exists(select 1 from keys where keys.k in (public.phone_key(c.phone_e164),public.phone_key(c.whatsapp_e164))) then 'phone' else 'name_birth' end reason
  from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
  where l.merged_into_lead_id is null and l.id is distinct from p_skip_lead and l.contact_id is distinct from p_skip_contact
   and (l.student_id is null or l.student_id is distinct from p_skip_student)
   and ((c.phone_e164 is not null or c.whatsapp_e164 is not null) and exists(select 1 from keys where keys.k in (public.phone_key(c.phone_e164),public.phone_key(c.whatsapp_e164)))
    or (p_birth is not null and l.learner_birth_date=p_birth and public.person_name_key(l.learner_name)=(select k from nk)))
  union all
  select 'student',s.id,
   case when public.phone_key(s.telephone) in (select k from keys) then 'phone' else 'name_birth' end
  from public.students s
  where s.deleted_at is null and s.merged_into_student_id is null and s.id is distinct from p_skip_student
   and (s.telephone is not null and public.phone_key(s.telephone) in (select k from keys)
    or (p_birth is not null and s.date_naissance=p_birth and public.person_name_key(s.full_name)=(select k from nk)))
 ), one as (
  select kind,id,max(reason) reason from hits group by kind,id
 )
 select coalesce(jsonb_agg(m order by m->>'reason' desc, m->>'name'),'[]'::jsonb) from (
  select jsonb_build_object('kind',o.kind,'id',o.id,'reason',o.reason,
   'name',case when o.kind='student' then s.full_name else l.learner_name end,
   'contact_name',c.display_name,'status',coalesce(s.status,l.status),
   'phone_masked',public.phone_mask(coalesce(s.telephone,c.phone_e164))) m
  from one o
  left join public.students s on o.kind='student' and s.id=o.id
  left join public.crm_leads l on o.kind='prospect' and l.id=o.id
  left join public.crm_contacts c on c.id=l.contact_id
  order by o.reason desc, o.id limit 10) x
$$;

create or replace function crm_security.match_pair(kind_1 text, id_1 uuid, kind_2 text, id_2 uuid)
returns text[] language sql immutable
set search_path = pg_catalog, pg_temp as $$
 select case when (kind_1,id_1::text) < (kind_2,id_2::text) then array[kind_1,id_1::text,kind_2,id_2::text]
  else array[kind_2,id_2::text,kind_1,id_1::text] end
$$;

create or replace function crm_security.assert_matches_acknowledged(matches jsonb, ack jsonb)
returns void language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
begin
 if ack is not null and jsonb_typeof(ack)<>'array' then raise exception 'Invalid acknowledged matches' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(ack,'[]'::jsonb)) a
   where jsonb_typeof(a)<>'object' or a-array['kind','id','decision']<>'{}'::jsonb
    or coalesce(a->>'kind','') not in ('prospect','student') or coalesce(a->>'decision','') not in ('same_family','different_people')) then
  raise exception 'Invalid acknowledged matches' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(matches,'[]'::jsonb)) m
   where not exists(select 1 from jsonb_array_elements(coalesce(ack,'[]'::jsonb)) a where a->>'kind'=m->>'kind' and a->>'id'=m->>'id')) then
  raise exception 'Possible duplicate: answer each match before creating' using errcode='PT409',hint='people.possible_duplicate',detail=matches::text;
 end if;
end $$;

-- Records the answers that refer to a reported match (others are ignored).
create or replace function crm_security.record_match_decisions(subject_kind text, subject_id uuid, matches jsonb, ack jsonb)
returns integer language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare a jsonb; p text[]; n integer:=0;
begin
 perform crm_security.assert_matches_acknowledged('[]'::jsonb,ack);
 for a in select x from jsonb_array_elements(coalesce(ack,'[]'::jsonb)) x
  where exists(select 1 from jsonb_array_elements(coalesce(matches,'[]'::jsonb)) m where m->>'kind'=x->>'kind' and m->>'id'=x->>'id') loop
  p:=crm_security.match_pair(subject_kind,subject_id,a->>'kind',(a->>'id')::uuid);
  insert into public.person_match_decisions(kind_a,id_a,kind_b,id_b,decision,decided_by)
  values(p[1],p[2]::uuid,p[3],p[4]::uuid,a->>'decision',auth.uid())
  on conflict (kind_a,id_a,kind_b,id_b) do update set decision=excluded.decision,decided_by=excluded.decided_by,decided_at=now();
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function crm_security.undecided_matches(subject_kind text, subject_id uuid, matches jsonb)
returns jsonb language sql stable
set search_path = pg_catalog, pg_temp as $$
 select coalesce(jsonb_agg(m),'[]'::jsonb) from jsonb_array_elements(coalesce(matches,'[]'::jsonb)) m
 where not exists(select 1 from public.person_match_decisions d,
  lateral (select crm_security.match_pair(subject_kind,subject_id,m->>'kind',(m->>'id')::uuid) p) x
  where d.kind_a=x.p[1] and d.id_a=x.p[2]::uuid and d.kind_b=x.p[3] and d.id_b=x.p[4]::uuid)
$$;

-- Student forms: the gate runs in the form through find_people; the answers are
-- recorded here once the student exists.
create or replace function public.record_person_match_decisions(p_subject_kind text, p_subject_id uuid, p_decisions jsonb)
returns integer language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare matches jsonb;
begin
 if coalesce(public.get_my_role(),'') not in ('admin','director','receptionist') then raise exception 'Access denied' using errcode='42501'; end if;
 if p_subject_kind not in ('prospect','student') or p_subject_id is null or jsonb_typeof(p_decisions) is distinct from 'array'
  or jsonb_array_length(p_decisions)>10 then raise exception 'Invalid decisions' using errcode='22023'; end if;
 if p_subject_kind='student' and not exists(select 1 from public.students where id=p_subject_id and deleted_at is null) then raise exception 'Student not found' using errcode='22023'; end if;
 if p_subject_kind='prospect' and not exists(select 1 from public.crm_leads where id=p_subject_id) then raise exception 'Prospect not found' using errcode='22023'; end if;
 -- Every answered record must exist; the decision is about a pair, not a search result.
 select coalesce(jsonb_agg(jsonb_build_object('kind',a->>'kind','id',a->>'id')),'[]'::jsonb) into matches
 from jsonb_array_elements(p_decisions) a
 where (a->>'kind'='student' and exists(select 1 from public.students s where s.id::text=a->>'id'))
  or (a->>'kind'='prospect' and exists(select 1 from public.crm_leads l where l.id::text=a->>'id'));
 if jsonb_array_length(matches)<>jsonb_array_length(p_decisions) then raise exception 'Unknown person in decisions' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_decisions) a where a->>'kind'=p_subject_kind and a->>'id'=p_subject_id::text) then
  raise exception 'A person is not a duplicate of itself' using errcode='22023'; end if;
 return crm_security.record_match_decisions(p_subject_kind,p_subject_id,matches,p_decisions);
exception when invalid_text_representation then raise exception 'Invalid decisions' using errcode='22023';
end $$;

-- ---------------------------------------------------------------------------
-- 4. One people search (§5.2).
-- ---------------------------------------------------------------------------
-- p_query: the header search (name, phone from 6 digits in any format, e-mail).
-- p_phone / p_name / p_birth: a create form's fields; rows found through them are
-- marked strong (the duplicate gate). Prospects active and closed, students
-- active and archived; merged records are never listed.
create or replace function public.find_people(p_query text default '', p_phone text default null, p_name text default null, p_birth date default null, p_limit integer default 20)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
declare q text:=btrim(coalesce(p_query,'')); qkey text; qmail text; strong jsonb; result jsonb;
begin
 if coalesce(public.get_my_role(),'') not in ('admin','director','receptionist') then raise exception 'Access denied' using errcode='42501'; end if;
 if length(q)>120 or length(p_phone)>40 or length(p_name)>200 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid search' using errcode='22023'; end if;
 qkey:=public.phone_search_key(q);
 qmail:=case when q ~ '@' then lower(q) end;
 strong:=case when p_phone is not null or (p_name is not null and p_birth is not null) then
  crm_security.person_matches(array_remove(array[public.phone_e164(p_phone)],null),p_name,p_birth,null,null,null) else '[]'::jsonb end;
 if q='' and jsonb_array_length(strong)=0 and p_name is null then return jsonb_build_object('rows','[]'::jsonb,'strong',strong); end if;
 with prospect_rows as (
  select 'prospect'::text kind,l.id,l.learner_name name,c.display_name contact_name,l.contact_id,l.student_id,l.status,
   l.status in ('LOST','NOT_QUALIFIED') archived,coalesce(c.phone_e164,c.phone_raw) phone,c.email_normalized email,l.created_at,
   case when qkey is not null and (strpos(coalesce(public.phone_key(c.phone_e164),''),qkey)>0 or strpos(coalesce(public.phone_key(c.whatsapp_e164),''),qkey)>0
     or strpos(coalesce(public.phone_key(c.phone_raw),''),qkey)>0) then 'phone'
    when qmail is not null and c.email_normalized=qmail then 'email' else 'name' end reason
  from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
  where l.merged_into_lead_id is null and l.status<>'CONVERTED'
   and ((q<>'' and (strpos(lower(coalesce(l.learner_name,'')),lower(q))>0 or strpos(lower(coalesce(c.display_name,'')),lower(q))>0
     or (qkey is not null and (strpos(coalesce(public.phone_key(c.phone_e164),''),qkey)>0 or strpos(coalesce(public.phone_key(c.whatsapp_e164),''),qkey)>0
      or strpos(coalesce(public.phone_key(c.phone_raw),''),qkey)>0))
     or (qmail is not null and c.email_normalized=qmail)))
    or (p_name is not null and q='' and public.person_name_key(l.learner_name)=public.person_name_key(p_name)))
 ), student_rows as (
  select 'student'::text kind,s.id,s.full_name name,null::text contact_name,null::uuid contact_id,s.id student_id,s.status,
   coalesce(s.status,'') in ('Alumni','Inactive') archived,s.telephone phone,s.email,s.created_at,
   case when qkey is not null and strpos(coalesce(public.phone_key(s.telephone),''),qkey)>0 then 'phone'
    when qmail is not null and (lower(s.email)=qmail or lower(s.parent_email)=qmail) then 'email' else 'name' end reason
  from public.students s
  where s.deleted_at is null and s.merged_into_student_id is null
   and ((q<>'' and (strpos(lower(s.full_name),lower(q))>0
     or (qkey is not null and strpos(coalesce(public.phone_key(s.telephone),''),qkey)>0)
     or (qmail is not null and (lower(s.email)=qmail or lower(s.parent_email)=qmail))))
    or (p_name is not null and q='' and public.person_name_key(s.full_name)=public.person_name_key(p_name)))
 ), found as (
  select * from prospect_rows union all select * from student_rows
 ), ranked as (
  select f.*,exists(select 1 from jsonb_array_elements(strong) m where m->>'kind'=f.kind and m->>'id'=f.id::text) is_strong,
   (select count(*) from public.crm_leads o where f.contact_id is not null and o.contact_id=f.contact_id and o.merged_into_lead_id is null and o.id<>f.id) siblings
  from found f
 )
 select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'name',name,'contact_name',contact_name,'contact_id',contact_id,'student_id',student_id,
   'status',status,'archived',archived,'phone',phone,'email',email,'reason',reason,'strong',is_strong,'siblings',siblings,'created_at',created_at)
   order by is_strong desc,(reason='phone') desc,archived,created_at desc,id)
 into result from (select * from ranked order by is_strong desc,(reason='phone') desc,archived,created_at desc,id limit p_limit) r;
 return jsonb_build_object('rows',coalesce(result,'[]'::jsonb),'strong',strong);
end $$;

-- Nouveau reçu picker (§5.1 search): same rows as the old table query, plus phone
-- keys in any format. Invoker: the receptionist's row rules apply.
create or replace function public.search_desk_students(p_query text, p_limit integer default 20)
returns jsonb language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
declare q text:=btrim(coalesce(p_query,'')); qkey text:=public.phone_search_key(btrim(coalesce(p_query,''))); result jsonb;
begin
 if length(q)>120 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid search' using errcode='22023'; end if;
 if q='' then return jsonb_build_object('rows','[]'::jsonb,'total',0); end if;
 with m as (
  select s.id,s.full_name,s.telephone,s.email,s.parent_email,s.niveau_cefr,s.session_type,s.status
  from public.students s
  where s.deleted_at is null and s.merged_into_student_id is null
   and (strpos(lower(s.full_name),lower(q))>0 or strpos(lower(coalesce(s.email,'')),lower(q))>0 or strpos(lower(coalesce(s.parent_email,'')),lower(q))>0
    or strpos(coalesce(s.telephone,''),q)>0 or (qkey is not null and strpos(coalesce(public.phone_key(s.telephone),''),qkey)>0))
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name,x.id) from (select * from m order by full_name,id limit p_limit) x),'[]'::jsonb),
  'total',(select count(*) from m)) into result;
 return result;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Prospect commands (§5.3), through crm_security.command.
-- ---------------------------------------------------------------------------
create or replace function public.crm_create_prospect(p_request_key uuid, p_data jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, pg_temp as $$
 select crm_security.command('create_prospect',p_request_key,p_data)
$$;
create or replace function public.crm_update_prospect(p_request_key uuid, p_data jsonb)
returns jsonb language sql security definer
set search_path = pg_catalog, pg_temp as $$
 select crm_security.command('update_prospect',p_request_key,p_data)
$$;

-- Every prospect id merged into this one (directly or through another), and itself.
create or replace function crm_security.lead_merge_set(lead uuid)
returns uuid[] language sql stable
set search_path = pg_catalog, pg_temp as $$
 with recursive s(id) as (select lead union select l.id from public.crm_leads l join s on l.merged_into_lead_id=s.id)
 select array_agg(id order by id) from s
$$;

create or replace function crm_security.require_merger()
returns void language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
begin
 if auth.uid() is null or coalesce((select role from public.profiles where id=auth.uid()),'') not in ('admin','director') then
  raise exception 'Merging is reserved to the direction' using errcode='42501'; end if;
end $$;

-- Prospect merge (director, admin), « link, don't move » (OD-8): the source keeps
-- its submissions and history (both append-only) and points to the target; the
-- target's timeline reads both. The source's open call or wait is cancelled
-- « Prospect fusionné »; a source holding an appointment, an enrolment action or
-- a planned test is refused (move or cancel it first).
create or replace function public.crm_merge_prospects(p_request_key uuid, p_source uuid, p_target uuid, p_expected_source_version bigint, p_expected_target_version bigint)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare actor uuid:=auth.uid(); src public.crm_leads%rowtype; tgt public.crm_leads%rowtype; na public.crm_tasks%rowtype;
 digest text; prior public.crm_command_requests%rowtype; result jsonb; ckey text;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_merger();
 if p_request_key is null or p_source is null or p_target is null then raise exception 'Request key and both prospects required' using errcode='22023'; end if;
 if p_source=p_target then raise exception 'Choose two different prospects' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_source,p_target,p_expected_source_version,p_expected_target_version)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':merge_prospects:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='merge_prospects' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 perform 1 from public.crm_leads where id in (p_source,p_target) order by id for update;
 select * into src from public.crm_leads where id=p_source;
 select * into tgt from public.crm_leads where id=p_target;
 if src.id is null or tgt.id is null then raise exception 'Prospect not found' using errcode='22023'; end if;
 if src.merged_into_lead_id is not null or tgt.merged_into_lead_id is not null then raise exception 'Prospect already merged' using errcode='22023',hint='people.merge_already'; end if;
 if src.version is distinct from p_expected_source_version or tgt.version is distinct from p_expected_target_version then
  raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
 if src.status='CONVERTED' then
  raise exception 'The enrolled prospect is the one kept' using errcode='22023',hint=case when tgt.status='CONVERTED' then 'people.merge_both_converted' else 'people.merge_direction' end; end if;
 if tgt.status in ('LOST','NOT_QUALIFIED') and src.status not in ('LOST','NOT_QUALIFIED') then
  raise exception 'Reopen the prospect kept first' using errcode='22023',hint='people.merge_target_closed'; end if;
 select * into na from public.crm_tasks where id=crm_security.next_action_id(src.id);
 if na.task_type in ('center_visit','enrollment_followup') or exists(select 1 from public.placement_tests where crm_lead_id=src.id and status='Planifié') then
  raise exception 'Move or cancel the appointment of the merged prospect first' using errcode='22023',hint='people.merge_source_appointment'; end if;
 ckey:='command:'||actor||':merge_prospects:'||p_request_key;
 perform set_config('eh.crm_command_key',ckey,true);
 perform crm_security.set_next_action(src,jsonb_build_object('none',true,'reason','Prospect fusionné'),'merge',ckey||':cancel');
 update public.crm_leads set merged_into_lead_id=tgt.id,version=version+1,updated_at=now() where id=src.id;
 perform crm_security.primary_event(src.id,'merge_prospects',null,null,null,crm_security.action_label(na),null,null,
  jsonb_build_object('result_label','Fusionné dans '||coalesce(tgt.learner_name,'un autre prospect'),'merged_into',tgt.id));
 perform set_config('eh.crm_command_key',ckey||':target',true);
 perform crm_security.primary_event(tgt.id,'merge_prospects',null,null,null,null,null,null,
  jsonb_build_object('result_label','Prospect fusionné : '||coalesce(src.learner_name,'sans nom'),'merged_from',src.id));
 update public.crm_leads set version=version+1,updated_at=now() where id=tgt.id;
 perform set_config('eh.crm_command_key','',true);
 result:=crm_security.result(tgt.id,ckey)||jsonb_build_object('merged_lead_id',src.id);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'merge_prospects',p_request_key,digest,result);
 return result;
end $$;

-- Contact merge (director, admin): every prospect of the source contact moves to
-- the target contact (the identity guard carries sharing stops), and the source
-- contact becomes an alias. Siblings entered as two contacts become one family.
-- Version-checked on both contacts, like the prospect merge (review of #217).
create or replace function public.crm_merge_contacts(p_request_key uuid, p_source uuid, p_target uuid, p_expected_source_version bigint, p_expected_target_version bigint)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; result jsonb; ckey text; l public.crm_leads%rowtype;
 src public.crm_contacts%rowtype; tgt public.crm_contacts%rowtype; moved integer:=0;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_merger();
 if p_request_key is null or p_source is null or p_target is null or p_source=p_target then raise exception 'Two different contacts required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_source,p_target,p_expected_source_version,p_expected_target_version)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':merge_contacts:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='merge_contacts' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 perform 1 from public.crm_contacts where id in (p_source,p_target) order by id for update;
 select * into src from public.crm_contacts where id=p_source;
 select * into tgt from public.crm_contacts where id=p_target;
 if src.id is null or tgt.id is null then raise exception 'Contact not found' using errcode='22023'; end if;
 if src.merged_into_contact_id is not null or tgt.merged_into_contact_id is not null then raise exception 'Contact already merged' using errcode='22023',hint='people.merge_already'; end if;
 if src.version is distinct from p_expected_source_version or tgt.version is distinct from p_expected_target_version then
  raise exception 'Stale contact version; refresh and retry' using errcode='PT409'; end if;
 ckey:='command:'||actor||':merge_contacts:'||p_request_key;
 for l in select * from public.crm_leads where contact_id=src.id order by id for update loop
  update public.crm_leads set contact_id=tgt.id,version=version+1,updated_at=now() where id=l.id;
  if l.merged_into_lead_id is null then
   perform set_config('eh.crm_command_key',ckey||':'||l.id,true);
   perform crm_security.primary_event(l.id,'merge_contacts',null,null,null,null,null,null,
    jsonb_build_object('result_label','Contact fusionné : '||coalesce(tgt.display_name,'contact')));
  end if;
  moved:=moved+1;
 end loop;
 update public.crm_contacts set merged_into_contact_id=tgt.id,version=version+1,updated_at=now() where id=src.id;
 update public.crm_contacts set version=version+1,updated_at=now() where id=tgt.id;
 perform set_config('eh.crm_command_key','',true);
 result:=jsonb_build_object('contact_id',tgt.id,'merged_contact_id',src.id,'moved_prospects',moved);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'merge_contacts',p_request_key,digest,result);
 return result;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Student merge (§5.3, OD-8 = A « link, don't move »).
-- ---------------------------------------------------------------------------
-- Security invoker: the caller's row policies decide which merged files it can see.
create or replace function public.student_merge_set(p_student uuid)
returns uuid[] language sql stable security invoker
set search_path = pg_catalog, pg_temp as $$
 with recursive s(id) as (select p_student union select x.id from public.students x join s on x.merged_into_student_id=s.id)
 select array_agg(id order by id) from s
$$;

-- What a merge would do and why it is refused, without writing (dialog, D5 plan).
create or replace function academic_security.student_merge_check(p_source uuid, p_target uuid)
returns jsonb language sql stable
set search_path = pg_catalog, pg_temp as $$
 with src as (select * from public.students where id=p_source), tgt as (select * from public.students where id=p_target),
 live as (select
   exists(select 1 from public.enrollments e where e.student_id=p_source and e.status not in ('Rejected','Ended')) source_live,
   exists(select 1 from public.enrollments e where e.student_id=any(public.student_merge_set(p_target)) and e.status not in ('Rejected','Ended')) target_live,
   exists(select 1 from public.family_links f where f.student_id=p_source and f.status in ('active','pending')) source_portal,
   exists(select 1 from public.family_links f where f.student_id=any(public.student_merge_set(p_target)) and f.status in ('active','pending')) target_portal,
   -- An unvoided charge of the merged-away file still to pay (open or partly paid):
   -- the payment paths read the charge's own student, so it must be settled first.
   (select coalesce(sum(b.balance),0) from (select c.gross_amount-c.discount_amount-coalesce((select sum(r.montant_paye) from public.receipts r
     where r.charge_id=c.id and r.voided_at is null and r.deleted_at is null),0) balance
    from public.charges c where c.student_id=p_source and c.voided_at is null) b where b.balance>0) source_balance)
 select jsonb_build_object(
  'source_id',p_source,'target_id',p_target,
  'source_name',(select full_name from src),'target_name',(select full_name from tgt),
  'source_live',source_live,'target_live',target_live,'source_portal',source_portal,'target_portal',target_portal,
  'source_open_balance',source_balance,
  'family_links',(select count(*) from public.family_links where student_id=p_source and status in ('active','pending')),
  'authorized_adults',(select count(*) from public.authorized_adults where student_id=p_source),
  'prospects',(select count(*) from public.crm_leads l where l.student_id=p_source and l.enrollment_id is null
    and not exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id)),
  'prospects_kept',(select count(*) from public.crm_leads l where l.student_id=p_source and (l.enrollment_id is not null
    or exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id))),
  'refusal',case
   when p_source is null or p_target is null or p_source=p_target then 'people.merge_same'
   when not exists(select 1 from src) or not exists(select 1 from tgt) then 'people.merge_not_found'
   when (select deleted_at from src) is not null or (select deleted_at from tgt) is not null then 'people.merge_not_found'
   when (select merged_into_student_id from src) is not null or (select merged_into_student_id from tgt) is not null then 'people.merge_already'
   when source_live and target_live then 'people.merge_both_live'
   when source_live then 'people.merge_direction'
   when source_balance>0 then 'people.merge_source_balance'
   when source_portal and target_portal then 'people.merge_both_portal'
  end)
 from live
$$;

create or replace function academic_security.merge_students_core(p_source uuid, p_target uuid)
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare chk jsonb; r record; moved jsonb:=jsonb_build_object('family_links',0,'authorized_adults',0,'crm_leads',0);
begin
 perform 1 from public.students where id in (p_source,p_target) order by id for update;
 chk:=academic_security.student_merge_check(p_source,p_target);
 if chk->>'refusal' is not null then
  raise exception '%',case chk->>'refusal'
   when 'people.merge_both_live' then 'Both students have a live enrollment: the merge stays a manual decision'
   when 'people.merge_direction' then 'The student with the live enrollment is the one kept'
   when 'people.merge_both_portal' then 'Both students have a portal access: the merge stays a manual decision'
   when 'people.merge_source_balance' then 'Encaissez ou soldez d''abord le solde de ce dossier'
   when 'people.merge_already' then 'Student already merged'
   else 'Choose two different existing students' end
   using errcode='22023',hint=chk->>'refusal';
 end if;
 for r in select id from public.family_links where student_id=p_source and status in ('active','pending') order by id for update loop
  update public.family_links set student_id=p_target where id=r.id;
  insert into public.student_merge_journal(source_id,target_id,entity,entity_id,before_student,after_student,merged_by) values(p_source,p_target,'family_links',r.id,p_source,p_target,auth.uid());
  moved:=jsonb_set(moved,'{family_links}',to_jsonb((moved->>'family_links')::int+1));
 end loop;
 for r in select id from public.authorized_adults where student_id=p_source order by id for update loop
  update public.authorized_adults set student_id=p_target where id=r.id;
  insert into public.student_merge_journal(source_id,target_id,entity,entity_id,before_student,after_student,merged_by) values(p_source,p_target,'authorized_adults',r.id,p_source,p_target,auth.uid());
  moved:=jsonb_set(moved,'{authorized_adults}',to_jsonb((moved->>'authorized_adults')::int+1));
 end loop;
 -- A prospect with an enrollment link, or with a level test, stays on the source
 -- (protect_enrollment_link, placement consistency) and is read through the merge set.
 for r in select l.id from public.crm_leads l where l.student_id=p_source and l.enrollment_id is null
   and not exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id) order by l.id for update loop
  update public.crm_leads set student_id=p_target,version=version+1,updated_at=now() where id=r.id;
  insert into public.student_merge_journal(source_id,target_id,entity,entity_id,before_student,after_student,merged_by) values(p_source,p_target,'crm_leads',r.id,p_source,p_target,auth.uid());
  moved:=jsonb_set(moved,'{crm_leads}',to_jsonb((moved->>'crm_leads')::int+1));
 end loop;
 update public.students set merged_into_student_id=p_target,merged_at=now() where id=p_source;
 insert into public.student_merge_journal(source_id,target_id,entity,entity_id,before_student,after_student,merged_by) values(p_source,p_target,'students',p_source,null,p_target,auth.uid());
 return jsonb_build_object('source_id',p_source,'target_id',p_target,'moved',moved);
end $$;

create or replace function academic_security.unmerge_student_core(p_source uuid)
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare j record; n integer:=0; tgt uuid;
begin
 select merged_into_student_id into tgt from public.students where id=p_source for update;
 if tgt is null then raise exception 'Student is not merged' using errcode='22023',hint='people.unmerge_not_merged'; end if;
 perform 1 from public.students where id=tgt for update;
 for j in select * from public.student_merge_journal where source_id=p_source and reverted_at is null and entity<>'students' order by merged_at desc,id desc for update loop
  if j.entity='family_links' then
   update public.family_links set student_id=j.before_student where id=j.entity_id and student_id=j.after_student;
  elsif j.entity='authorized_adults' then
   update public.authorized_adults set student_id=j.before_student where id=j.entity_id and student_id=j.after_student;
  else
   update public.crm_leads set student_id=j.before_student,version=version+1,updated_at=now() where id=j.entity_id and student_id=j.after_student and enrollment_id is null;
  end if;
  if not found then raise exception 'A link changed since the merge (% %): undo by hand',j.entity,j.entity_id using errcode='22023',hint='people.unmerge_changed'; end if;
  update public.student_merge_journal set reverted_at=now(),reverted_by=auth.uid() where id=j.id;
  n:=n+1;
 end loop;
 update public.students set merged_into_student_id=null,merged_at=null where id=p_source;
 update public.student_merge_journal set reverted_at=now(),reverted_by=auth.uid() where source_id=p_source and entity='students' and reverted_at is null;
 return jsonb_build_object('source_id',p_source,'target_id',tgt,'restored',n);
end $$;

create or replace function public.student_merge_preview(p_source uuid, p_target uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
begin
 perform crm_security.require_merger();
 return academic_security.student_merge_check(p_source,p_target);
end $$;

create or replace function public.merge_students(p_source uuid, p_target uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
 perform crm_security.require_merger();
 return academic_security.merge_students_core(p_source,p_target);
end $$;

create or replace function public.unmerge_student(p_source uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
 perform crm_security.require_merger();
 return academic_security.unmerge_student_core(p_source);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Data step D3 (phones) — shipped, NOT run. Operator only, with the owner's
--    « approve D3 with counts ». Unnormalisable numbers are listed, never changed.
-- ---------------------------------------------------------------------------
create or replace function crm_security.d3_rows()
returns table(entity text, entity_id uuid, col text, raw text, proposed text, category text)
language sql stable
set search_path = pg_catalog, pg_temp as $$
 with src as (
  select 'students'::text entity,id,'telephone'::text col,telephone raw from public.students where telephone is not null and btrim(telephone)<>''
  union all select 'authorized_adults',id,'telephone',telephone from public.authorized_adults where btrim(telephone)<>''
  union all select 'crm_contacts',id,'phone_e164',coalesce(phone_e164,phone_raw) from public.crm_contacts where coalesce(phone_e164,phone_raw) is not null and btrim(coalesce(phone_e164,phone_raw))<>''
  union all select 'crm_contacts',id,'whatsapp_e164',coalesce(whatsapp_e164,whatsapp_raw) from public.crm_contacts where coalesce(whatsapp_e164,whatsapp_raw) is not null and btrim(coalesce(whatsapp_e164,whatsapp_raw))<>''
 ), c as (
  select s.*,public.phone_e164(s.raw) e,regexp_replace(s.raw,'[^0-9+]','','g') bare from src s
 )
 select entity,id,col,raw,
  case when e is null then null when public.phone_is_placeholder(e) then null else e end,
  case when e is null then 'unnormalisable'
   when public.phone_is_placeholder(e) then 'placeholder'
   when raw=e then 'e164'
   when bare ~ '^212' then 'no_plus'
   when bare ~ '^[5-7][0-9]{8}$' then 'no_leading_zero'
   when raw<>bare then 'separators'
   else 'national' end
 from c
$$;

create or replace function crm_security.d3_plan()
returns jsonb language sql stable
set search_path = pg_catalog, pg_temp as $$
 select jsonb_build_object(
  'counts',(select coalesce(jsonb_object_agg(entity,cats),'{}'::jsonb) from (
    select entity,jsonb_object_agg(category,n) cats from (select entity,category,count(*) n from crm_security.d3_rows() group by 1,2) a group by entity) b),
  'samples',(select coalesce(jsonb_object_agg(category,ids),'{}'::jsonb) from (
    select category,jsonb_agg(entity_id order by entity_id) ids from (
     select category,entity_id,row_number() over (partition by category order by entity_id) rn from crm_security.d3_rows()) a where rn<=5 group by category) b),
  'unchanged_manual',(select count(*) from crm_security.d3_rows() where category='unnormalisable' or (category='placeholder' and entity='authorized_adults')))
$$;

create or replace function crm_security.d3_apply(expected jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare plan jsonb; r record; n integer:=0;
begin
 lock table public.students, public.authorized_adults, public.crm_contacts in share row exclusive mode;
 plan:=crm_security.d3_plan();
 if expected is null or plan->'counts' is distinct from expected->'counts' then
  raise exception 'D3 counts differ from the approved dry run: %',plan->'counts' using errcode='22023',hint='people.d3_counts'; end if;
 for r in select * from crm_security.d3_rows() where category not in ('e164','unnormalisable')
   and not (category='placeholder' and entity='authorized_adults') order by entity,entity_id,col loop
  insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by)
  values('d3',r.entity,r.entity_id,jsonb_build_object(r.col,r.raw,'category',r.category),jsonb_build_object(r.col,r.proposed),auth.uid());
  if r.entity='students' then update public.students set telephone=r.proposed where id=r.entity_id;
  elsif r.entity='authorized_adults' then update public.authorized_adults set telephone=r.proposed where id=r.entity_id;
  elsif r.col='phone_e164' then update public.crm_contacts set phone_e164=r.proposed,version=version+1,updated_at=now() where id=r.entity_id;
  else update public.crm_contacts set whatsapp_e164=r.proposed,version=version+1,updated_at=now() where id=r.entity_id; end if;
  n:=n+1;
 end loop;
 return jsonb_build_object('changed',n,'plan',plan);
end $$;

-- Puts back every value D3 wrote that has not changed since; lists the others.
create or replace function crm_security.d3_revert()
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare j record; col text; n integer:=0; skipped jsonb:='[]'::jsonb; cur text;
begin
 lock table public.students, public.authorized_adults, public.crm_contacts in share row exclusive mode;
 if exists(select 1 from public.crm_data_step_journal where step='d3_revert') then raise exception 'D3 was already reverted' using errcode='22023'; end if;
 for j in select * from public.crm_data_step_journal where step='d3' order by run_at desc,id desc loop
  col:=(select k from jsonb_object_keys(j.after) k limit 1);
  if j.entity='students' then select telephone into cur from public.students where id=j.entity_id;
  elsif j.entity='authorized_adults' then select telephone into cur from public.authorized_adults where id=j.entity_id;
  elsif col='phone_e164' then select phone_e164 into cur from public.crm_contacts where id=j.entity_id;
  else select whatsapp_e164 into cur from public.crm_contacts where id=j.entity_id; end if;
  if cur is distinct from j.after->>col then skipped:=skipped||jsonb_build_object('entity',j.entity,'id',j.entity_id); continue; end if;
  if j.entity='students' then
   -- The phone trigger would refuse the old bad value: restore under the
   -- original row's own rule, by writing the stored column directly.
   alter table public.students disable trigger people_phone_guard;
   update public.students set telephone=j.before->>col where id=j.entity_id;
   alter table public.students enable trigger people_phone_guard;
  elsif j.entity='authorized_adults' then
   alter table public.authorized_adults disable trigger people_phone_guard;
   update public.authorized_adults set telephone=j.before->>col where id=j.entity_id;
   alter table public.authorized_adults enable trigger people_phone_guard;
  elsif col='phone_e164' then update public.crm_contacts set phone_e164=public.phone_e164(j.before->>col),version=version+1,updated_at=now() where id=j.entity_id;
  else update public.crm_contacts set whatsapp_e164=public.phone_e164(j.before->>col),version=version+1,updated_at=now() where id=j.entity_id; end if;
  insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by) values('d3_revert',j.entity,j.entity_id,j.after,jsonb_build_object(col,j.before->>col),auth.uid());
  n:=n+1;
 end loop;
 return jsonb_build_object('restored',n,'skipped',skipped);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Data step D5 (student merges) — shipped, NOT run. Operator only, with the
--    owner's « approve D5 pairs … ». pairs: [{"source":uuid,"target":uuid},…].
-- ---------------------------------------------------------------------------
create or replace function crm_security.d5_plan(pairs jsonb)
returns jsonb language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
begin
 if jsonb_typeof(pairs) is distinct from 'array' or jsonb_array_length(pairs)>200 then raise exception 'Pairs array required' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(academic_security.student_merge_check((p->>'source')::uuid,(p->>'target')::uuid) order by ord),'[]'::jsonb)
  from jsonb_array_elements(pairs) with ordinality x(p,ord));
end $$;

create or replace function crm_security.d5_apply(pairs jsonb, expected jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare plan jsonb; p jsonb; out jsonb:='[]'::jsonb; res jsonb;
begin
 lock table public.students, public.family_links, public.authorized_adults, public.crm_leads in share row exclusive mode;
 plan:=crm_security.d5_plan(pairs);
 if plan is distinct from expected then raise exception 'D5 plan differs from the approved dry run' using errcode='22023',hint='people.d5_plan'; end if;
 if exists(select 1 from jsonb_array_elements(plan) c where c->>'refusal' is not null) then raise exception 'D5 plan holds refused pairs' using errcode='22023',hint='people.d5_refused'; end if;
 for p in select x from jsonb_array_elements(pairs) x loop
  res:=academic_security.merge_students_core((p->>'source')::uuid,(p->>'target')::uuid);
  insert into public.crm_data_step_journal(step,entity,entity_id,before,after,run_by) values('d5','students',(p->>'source')::uuid,jsonb_build_object('merged_into',null),res,auth.uid());
  out:=out||res;
 end loop;
 return out;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Re-created functions. Each body is the live 137 body with the 138 lines
--    marked « 138 »; the prior bodies are in scripts/rollback/138_people_identity_restore.sql.
-- ---------------------------------------------------------------------------
-- set_next_action: the cause 'merge' (no next action, « Prospect fusionné »).
CREATE OR REPLACE FUNCTION crm_security.set_next_action(l crm_leads, spec jsonb, cause text, source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
 cur public.crm_tasks%rowtype; o public.crm_tasks%rowtype; against public.crm_tasks%rowtype; x public.placement_tests%rowtype;
 typ text; new_id uuid; carried uuid; with_test boolean; task_spec jsonb; due timestamptz;
 replaced text; complete boolean; closed_ids uuid[]:='{}';
 start_local timestamp; reason text; keep_id uuid;
begin
 if cause is null or cause<>all(array['system','user','outcome','close','conversion','intake','enrollment','test_result','merge']) then
  raise exception 'Invalid next-action cause' using errcode='22023'; end if;
 if source is null or length(btrim(source))=0 then raise exception 'Next-action source required' using errcode='22023'; end if;
 -- 1. The caller already holds the lead lock; taking it again is a no-op.
 perform 1 from public.crm_leads where id=l.id for update;
 if spec='null'::jsonb then spec:=null; end if;
 if spec is not null and jsonb_typeof(spec)<>'object' then raise exception 'Invalid next action' using errcode='22023'; end if;
 perform 1 from public.crm_tasks where lead_id=l.id and status='open' order by id for update;
 select * into cur from public.crm_tasks where id=crm_security.next_action_id(l.id);
 if spec ? '_against' then
  select * into against from public.crm_tasks where id=(spec->>'_against')::uuid and lead_id=l.id and status='open';
  if against.id is null then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
 end if;
 perform set_config('eh.crm_next_action_writer','1',true);

 -- A. No next action: closure, conversion.
 if spec is null or spec ? 'none' then
  if cause not in ('close','conversion','merge') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
  if cause='conversion' then
   -- Verbatim effect of 120's evaluate_conversion loop (same keys, actor and body).
   for o in select * from public.crm_tasks where lead_id=l.id and status='open' order by id for update loop
    insert into public.crm_activities(lead_id,task_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
    values(l.id,o.id,(spec->>'_enrollment_id')::uuid,(spec->>'_happened')::timestamptz,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'task_cancelled',
     'conversion-task:'||l.id||':'||o.id,'Inscription confirmée : suivi commercial terminé.');
    update public.crm_tasks set status='cancelled',cancelled_at=(spec->>'_happened')::timestamptz,cancelled_by=auth.uid(),
     cancellation_reason='Inscription confirmée',version=version+1,updated_at=now() where id=o.id;
   end loop;
  else
   reason:=coalesce(nullif(btrim(spec->>'reason'),''),case when cause='merge' then 'Prospect fusionné' else 'Prospect fermé' end);
   for o in select * from public.crm_tasks where lead_id=l.id and status='open' order by id loop
    perform crm_security.finish_task(o,true,reason,source||':'||o.id);
   end loop;
   -- A converted prospect keeps its planned test (it becomes the student's, §4.8).
   if cause in ('close','merge') then
    for x in select * from public.placement_tests where crm_lead_id=l.id and status='Planifié' order by id loop
     perform crm_security.cancel_planned_test(x.id,reason);
    end loop;
   end if;
  end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return null;
 end if;

 -- B. Keep one open action, cancel every other one (enrolment start keeps an
 --    open « Finaliser l'inscription »).
 if spec ? '_keep_task_id' then
  keep_id:=(spec->>'_keep_task_id')::uuid;
  if not exists(select 1 from public.crm_tasks where id=keep_id and lead_id=l.id and status='open') then
   raise exception 'Kept action is not an open action of this prospect' using errcode='22023'; end if;
  for o in select * from public.crm_tasks where lead_id=l.id and status='open' and id<>keep_id order by id loop
   perform crm_security.finish_task(o,true,coalesce(spec->>'_reason','Doublon de prochaine action'),source||':'||o.id);
   closed_ids:=closed_ids||o.id;
  end loop;
  -- Enrolment start keeps the test of the action it replaces (§4.8): the kept
  -- « Finaliser l'inscription » carries it (a real link, owner decision
  -- 2026-11-22) unless it already carries a planned test. Every other planned
  -- test left without an open action is cancelled.
  if cause='enrollment' then
   select p.id into carried from public.placement_tests p where p.status='Planifié' and p.id in (select placement_test_id from public.crm_tasks where id=any(closed_ids))
    and not exists(select 1 from public.crm_tasks t where t.placement_test_id=p.id and t.status='open')
    and not exists(select 1 from public.crm_tasks k join public.placement_tests q on q.id=k.placement_test_id and q.status='Planifié' where k.id=keep_id)
   order by p.date_test,p.heure,p.id limit 1;
   if carried is not null then
    update public.crm_tasks set placement_test_id=carried,version=version+1,updated_at=now() where id=keep_id;
   end if;
  end if;
  for x in select p.* from public.placement_tests p where p.status='Planifié' and p.id in (select placement_test_id from public.crm_tasks where id=any(closed_ids))
   and not exists(select 1 from public.crm_tasks t where t.placement_test_id=p.id and t.status='open') loop
   perform crm_security.cancel_planned_test(x.id,'Rendez-vous remplacé');
  end loop;
  perform set_config('eh.crm_next_action_writer','',true);
  return keep_id;
 end if;

 -- C. Legacy reschedule in place (old crm_schedule_task with a task id). An
 --    agreed time is refused outside hours; a reminder moves to the next window.
 --    A rescheduled appointment moves its test; an enrolment action does not (B5).
 if spec ? '_reschedule' then
  select * into o from public.crm_tasks where id=(spec->'_reschedule'->>'task_id')::uuid and lead_id=l.id and status='open';
  if o.id is null then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
  due:=(spec->'_reschedule'->>'due_at')::timestamptz;
  if due is null or not isfinite(due) or due<now() then raise exception 'Future due time required' using errcode='22023'; end if;
  if crm_security.is_appointment(o) then
   perform crm_security.assert_in_hours(case when o.task_type='center_visit' then 'opening' else 'calling' end,due);
   if o.task_type='center_visit' then perform crm_security.assert_no_overlap(l,due,60,o.placement_test_id,o.id); end if;
  else due:=crm_security.next_window(crm_security.current_policy_id(),due); end if;
  if length(spec->'_reschedule'->>'instructions')>4000 then raise exception 'Instructions too long' using errcode='22023'; end if;
  update public.crm_tasks set due_at=due,scheduled_end_at=null,
   instructions=case when spec->'_reschedule' ? 'instructions' then spec->'_reschedule'->>'instructions' else instructions end,
   updated_at=now(),version=version+1 where id=o.id;
  -- Only an appointment moves its test. « Finaliser l'inscription » that carries
  -- a kept test is rescheduled without touching the test (review of #208, B5).
  if o.task_type='center_visit' and o.placement_test_id is not null then
   start_local:=due at time zone public.centre_utc_offset();
   update public.placement_tests set date_test=start_local::date,heure=to_char(start_local,'HH24:MI')
   where id=o.placement_test_id and status='Planifié' and (date_test,heure) is distinct from (start_local::date,to_char(start_local,'HH24:MI'));
  end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return o.id;
 end if;

 -- D. Owner change: the open action follows the lead's owner and loses any
 --    separate delegation (§4.6).
 if spec ? '_reassign' then
  update public.crm_tasks set assigned_to=l.owner_id,version=version+1,updated_at=now()
  where lead_id=l.id and status='open' and assigned_to is distinct from l.owner_id;
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;

 -- E. Separate delegation of one open action (old crm_reassign with assigned_to).
 if spec ? '_delegate' then
  update public.crm_tasks set assigned_to=(spec->'_delegate'->>'assigned_to')::uuid,version=version+1,updated_at=now()
  where id=(spec->'_delegate'->>'task_id')::uuid and lead_id=l.id and status='open' returning id into new_id;
  if new_id is null then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return new_id;
 end if;

 -- F. Legacy finish without replacement (old complete/cancel without a next
 --    task while another open action remains).
 if spec ? '_finish' then
  if against.id is null then raise exception 'Task required' using errcode='22023'; end if;
  perform crm_security.finish_task(against,coalesce((spec->'_finish'->>'cancelled')::boolean,false),spec->'_finish'->>'reason',source,
   case when coalesce((spec->'_finish'->>'cancelled')::boolean,false) then 'Annulée sans remplacement' end,
   case when not coalesce((spec->'_finish'->>'cancelled')::boolean,false) then spec->>'_outcome_code' end);
  if coalesce((spec->'_finish'->>'cancelled')::boolean,false) and against.placement_test_id is not null
   and not exists(select 1 from public.crm_tasks t where t.placement_test_id=against.placement_test_id and t.status='open') then
   perform crm_security.cancel_planned_test(against.placement_test_id,'Rendez-vous annulé');
  end if;
  perform set_config('eh.crm_next_action_writer','',true);
  return null;
 end if;

 -- G. Legacy « meaningful conversation ends outreach » without a next task.
 if spec ? '_cancel_slots' then
  perform crm_security.cancel_tasks(l.id,spec->>'_cancel_slots',source,true);
  perform set_config('eh.crm_next_action_writer','',true);
  return null;
 end if;

 -- H. Replacement.
 typ:=spec->>'task_type';
 if typ is null then raise exception 'Valid future task required' using errcode='22023'; end if;
 -- System steps never replace a kept action (§4.2 step 3): the call is
 -- recorded, the action stays open with its time and test, no slot is added.
 if cause='system' and cur.id is not null and cur.task_type not in ('first_contact','contact_attempt','callback','awaiting_prospect') then
  if against.id is not null and against.id<>cur.id and against.task_type in ('first_contact','contact_attempt','callback') then
   perform crm_security.finish_task(against,false,null,source||':complete');
  end if;
  for o in select * from public.crm_tasks where lead_id=l.id and status='open' and id<>cur.id and task_type in ('first_contact','contact_attempt') order by id loop
   perform crm_security.finish_task(o,true,'Attempt recorded',source||':obsolete:'||o.id);
  end loop;
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;
 -- After five failures the prospect waits; an undated wait is kept as is.
 if cause='system' and typ='awaiting_prospect' and cur.task_type='awaiting_prospect' and cur.due_at is null then
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;
 -- Qualifying with an existing appointment reuses it.
 if coalesce((spec->>'keep_existing')::boolean,false) and typ='center_visit' and cur.task_type='center_visit' then
  perform set_config('eh.crm_next_action_writer','',true);
  return cur.id;
 end if;
 -- OD-18: an appointment is replaced by a user only with the « Remplace »
 -- confirmation (A); an enrolment action only by another enrolment action or
 -- with an explicit cancellation reason (B). An appointment outcome acts on
 -- the appointment itself.
 if cause in ('user','outcome') and cur.id is not null and (spec->>'_outcome_of') is distinct from cur.id::text then
  if cur.task_type='center_visit' and (spec->>'replace_action_id') is distinct from cur.id::text then
   raise exception 'Replacing an appointment needs the « Remplace » confirmation' using errcode='22023',hint='crm_next_action.replace_confirmation'; end if;
  if cur.task_type='enrollment_followup' and typ<>'enrollment_followup' and nullif(btrim(spec->>'cancel_enrollment_reason'),'') is null then
   raise exception 'Reschedule, cancel or complete the enrolment action first' using errcode='22023',hint='crm_next_action.enrollment_kept'; end if;
 end if;
 task_spec:=spec-array['keep_existing','replace_action_id','cancel_enrollment_reason','with_test','test_examiner','test_notes'];
 task_spec:=task_spec-array(select k from jsonb_object_keys(task_spec) k where left(k,1)='_');
 -- « En attente » without a choice: relance today + 5 days (OD-5).
 if typ='awaiting_prospect' and cause in ('user','outcome') and not (spec ? 'due_at') and not (spec ? 'due_preset') then
  task_spec:=task_spec||jsonb_build_object('due_preset','in_5_days');
 end if;
 if typ='center_visit' then
  due:=(task_spec->>'due_at')::timestamptz;
  if due is null then raise exception 'Appointment date and time required' using errcode='22023'; end if;
  -- The appointment's test moves with it unless the user unticks it.
  select t.placement_test_id into carried from public.crm_tasks t join public.placement_tests p on p.id=t.placement_test_id and p.status='Planifié'
  where t.id in (cur.id,against.id) and t.task_type='center_visit' order by (t.id=cur.id) desc limit 1;
  with_test:=coalesce((spec->>'with_test')::boolean,carried is not null);
  perform crm_security.assert_no_overlap(l,due,60,carried,cur.id);
  if with_test and carried is null
   and exists(select 1 from public.placement_tests where crm_lead_id=l.id and status='Planifié') then
   raise exception 'Placement already scheduled' using errcode='22023'; end if;
 elsif typ='enrollment_followup' then
  -- « Finaliser l'inscription » carries a planned test (owner decision
  -- 2026-11-22, §4.8): the test of the appointment an enrolment start replaces,
  -- or the test of the enrolment action it replaces (moved, not abandoned).
  select t.placement_test_id into carried from public.crm_tasks t join public.placement_tests p on p.id=t.placement_test_id and p.status='Planifié'
  where t.id in (cur.id,against.id) and (t.task_type='enrollment_followup' or (cause='enrollment' and t.task_type='center_visit'))
  order by (t.id=cur.id) desc,p.date_test,p.heure,p.id limit 1;
  with_test:=carried is not null;
 end if;

 -- Close the current action, the action acted on and every legacy duplicate,
 -- before inserting (M-A2's unique index cannot be deferred).
 complete:=cause in ('outcome','system','test_result');
 -- An appointment still to come that an exchange replaces did not take place:
 -- it is cancelled « Remplacée », never completed (§4.8). Its own outcome
 -- (_outcome_of) and an explicit completion of it (old « Terminer ») still
 -- complete it.
 if complete and cause='outcome' and cur.task_type='center_visit' and cur.due_at>now() and (spec->>'_outcome_of') is distinct from cur.id::text
  and against.id is distinct from cur.id then
  complete:=false;
 end if;
 replaced:=coalesce(nullif(btrim(spec->>'cancel_enrollment_reason'),''),nullif(btrim(spec->>'_replaced_reason'),''),'Remplacée par une nouvelle prochaine action');
 if cur.id is not null then
  if complete then perform crm_security.finish_task(cur,false,spec->>'_note',source||':complete',null,spec->>'_outcome_code');
  else perform crm_security.finish_task(cur,true,replaced,source||':replaced',replaced); end if;
  closed_ids:=closed_ids||cur.id;
 end if;
 if against.id is not null and against.id is distinct from cur.id then
  perform crm_security.finish_task(against,false,spec->>'_note',source||':complete:'||against.id);
  closed_ids:=closed_ids||against.id;
 end if;
 for o in select * from public.crm_tasks where lead_id=l.id and status='open' order by id loop
  perform crm_security.finish_task(o,true,'Doublon de prochaine action',source||':duplicate:'||o.id);
  closed_ids:=closed_ids||o.id;
 end loop;
 -- Step 4: a planned test no open action points to any more is cancelled,
 -- except the one carried by the new appointment or enrolment action and a
 -- test being resulted. Replacing or cancelling an enrolment action that
 -- carries a test cancels it, unless the new action carries it.
 if cause<>'test_result' then
  for x in select p.* from public.placement_tests p where p.status='Planifié'
   and p.id in (select placement_test_id from public.crm_tasks where id=any(closed_ids))
   and p.id is distinct from case when with_test then carried end order by p.id loop
   perform crm_security.cancel_planned_test(x.id,'Rendez-vous remplacé');
  end loop;
 end if;
 if typ='center_visit' and with_test then
  start_local:=due at time zone public.centre_utc_offset();
  if carried is null then
   insert into public.placement_tests(crm_lead_id,student_id,student_name,date_test,heure,examinateur,notes,status,niveau_recommande)
   values(l.id,l.student_id,coalesce(nullif(btrim(l.learner_name),''),(select display_name from public.crm_contacts where id=l.contact_id)),
    start_local::date,to_char(start_local,'HH24:MI'),nullif(btrim(spec->>'test_examiner'),''),nullif(btrim(spec->>'test_notes'),''),'Planifié',null)
   returning id into carried;
  else
   update public.placement_tests set date_test=start_local::date,heure=to_char(start_local,'HH24:MI'),
    examinateur=case when spec ? 'test_examiner' then nullif(btrim(spec->>'test_examiner'),'') else examinateur end,
    notes=case when spec ? 'test_notes' then nullif(btrim(spec->>'test_notes'),'') else notes end
   where id=carried and (date_test,heure,examinateur,notes) is distinct from (start_local::date,to_char(start_local,'HH24:MI'),
    case when spec ? 'test_examiner' then nullif(btrim(spec->>'test_examiner'),'') else examinateur end,
    case when spec ? 'test_notes' then nullif(btrim(spec->>'test_notes'),'') else notes end);
  end if;
 end if;
 new_id:=crm_security.new_task(l,task_spec,coalesce(spec->>'_key',source||':next-action'),coalesce(spec->>'_kind','manual'),
  (spec->>'_ordinal')::smallint,spec->>'_event_source',cur.id,
  case when typ in ('center_visit','enrollment_followup') and with_test then carried else (spec->>'_placement_test_id')::uuid end,
  (spec->>'_source_activity_id')::uuid,false,case when cause='intake' then spec->>'_intake_actor' end);
 perform set_config('eh.crm_next_action_writer','',true);
 return new_id;
end $function$

;

-- command: create_prospect (sibling, same person, duplicate gate), update_prospect, the wrong-number correction.
CREATE OR REPLACE FUNCTION crm_security.command(cmd text, request uuid, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; result jsonb;
 l public.crm_leads%rowtype; t public.crm_tasks%rowtype; p public.crm_followup_policies%rowtype; na public.crm_tasks%rowtype;
 contact uuid; submission uuid; aid uuid; tid uuid; source text; allowed text[]; offsets integer[];
 phone text; email text; candidates jsonb; count_failed integer; ordinal smallint;
 due timestamptz; happened timestamptz; outcome text; meaningful boolean:=false; needs_next boolean:=false;
 reason text; target text; initial_status text; next_spec jsonb; policy_version integer;
 nested boolean:=coalesce(current_setting('eh.crm_command_key',true),'')<>''; before_label text; after_label text;
 chan text; res text; next_mode text; next_obj jsonb; note text; close_target text; close_reason text; close_note text;
 cause text; qualify_step text; primary_channel text; outcome_code text; x public.placement_tests%rowtype;
 -- 138 (RWR-r5 §5.1–5.3): people identity.
 existing public.crm_contacts%rowtype; whatsapp text; matches jsonb; edit jsonb; result_extra jsonb:='{}'::jsonb; edit_label text;
begin
 if cmd in ('create_manual_lead','create_prospect','resolve_submission') then
  perform crm_security.lifecycle_barrier(true);
  if cmd='resolve_submission' then

   perform crm_security.lifecycle_preidentity_keys(src.id,fm.connection_id)
   from public.crm_submissions src join public.crm_form_mappings fm on fm.id=src.form_mapping_id where src.id=(data->>'submission_id')::uuid;
  end if;
 end if;

 perform crm_security.require_reader(cmd='create_followup_policy');
 if request is null or jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>32768 then
  raise exception 'Request key and bounded object payload required' using errcode='22023'; end if;
 allowed:=case cmd
 when 'create_followup_policy' then array['weekly_hours','opening_hours','date_exceptions','timezone','attempt_offsets','minimum_attempt_gap_minutes','first_contact_sla_minutes','post_test_sla_minutes','stale_contacting_minutes','effective_from']
 when 'create_manual_lead' then array['display_name','contact_kind','phone','whatsapp','email','preferred_channel','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','source_label','owner_id','first_exchange']
 when 'create_prospect' then array['display_name','contact_kind','phone','whatsapp','email','preferred_channel','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','source_label','owner_id','first_exchange','contact_id','same_person','acknowledged_matches']
 when 'update_prospect' then array['lead_id','expected_version','display_name','phone','whatsapp','email','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','acknowledged_matches']
 when 'resolve_submission' then array['lead_id','expected_version','submission_id']
 when 'add_note' then array['lead_id','expected_version','note']
 when 'record_call_outcome' then array['lead_id','expected_version','task_id','expected_task_version','outcome','occurred_at','note','next_task']
 when 'record_whatsapp' then array['lead_id','expected_version','kind','occurred_at','note','next_task']
 when 'record_conversation' then array['lead_id','expected_version','channel','occurred_at','note','next_task']
 when 'schedule_task' then array['lead_id','expected_version','task_id','expected_task_version','task','note']
 when 'complete_task' then array['lead_id','expected_version','task_id','expected_task_version','outcome','note','next_task']
 when 'cancel_task' then array['lead_id','expected_version','task_id','expected_task_version','reason','next_task']
 when 'qualify_lead' then array['lead_id','expected_version','qualification_step','note','conversation_channel','next_task']
 when 'close_lost' then array['lead_id','expected_version','reason','note']
 when 'close_not_qualified' then array['lead_id','expected_version','reason','note']
 when 'reopen_lead' then array['lead_id','expected_version','reason','next_task']
 when 'reassign' then array['lead_id','expected_version','owner_id','task_id','expected_task_version','assigned_to','note']
 when 'log_exchange' then array['lead_id','expected_version','task_id','channel','result','note','next','occurred_at','real_attempt_override','corrected_phone','acknowledged_matches']
 when 'change_next_action' then array['lead_id','expected_version','expected_action_id','next','note']
 when 'appointment_outcome' then array['lead_id','expected_version','action_id','outcome_code','next','note']
 when 'close_prospect' then array['lead_id','expected_version','status','reason','note']
 when 'reopen_prospect' then array['lead_id','expected_version','reason','next']
 else null end;
 if allowed is null or data-allowed<>'{}'::jsonb then raise exception 'Unsupported command fields' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':'||cmd||':'||request,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name=cmd and request_key=request;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 source:='command:'||actor||':'||cmd||':'||request;
 -- One history entry per user action (§4.7): rows written below share this key.
 if not nested and cmd not in ('create_followup_policy','resolve_submission') then perform set_config('eh.crm_command_key',source,true); end if;

 if cmd='create_followup_policy' then
  if coalesce(data->>'timezone','Africa/Casablanca')<>'Africa/Casablanca' then raise exception 'Timezone must be Africa/Casablanca' using errcode='22023'; end if;
  if data ? 'attempt_offsets' then select array_agg(value::integer order by ord) into offsets from jsonb_array_elements_text(data->'attempt_offsets') with ordinality a(value,ord);
  else offsets:=array[0,0,1,3,5]; end if;
  perform crm_security.validate_policy(data->'weekly_hours',offsets);
  perform crm_security.validate_hours_set(case when jsonb_typeof(data->'opening_hours')='null' then null else data->'opening_hours' end,coalesce(data->'date_exceptions','[]'::jsonb));
  if coalesce((data->>'minimum_attempt_gap_minutes')::integer,180) not between 180 and 10080
   or coalesce((data->>'first_contact_sla_minutes')::integer,15) not between 1 and 1440
   or coalesce((data->>'post_test_sla_minutes')::integer,120) not between 1 and 10080
   or coalesce((data->>'stale_contacting_minutes')::integer,2880) not between 60 and 43200 then
   raise exception 'Invalid policy timing' using errcode='22023'; end if;
  happened:=coalesce((data->>'effective_from')::timestamptz,now());
  if not isfinite(happened) or happened<now()-interval '1 minute' then raise exception 'Policy cannot be backdated' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm:policy:publish',0));
  select coalesce(max(version),0)+1 into policy_version from public.crm_followup_policies;
  insert into public.crm_followup_policies(version,weekly_hours,opening_hours,date_exceptions,attempt_offsets,minimum_attempt_gap_minutes,
   first_contact_sla_minutes,post_test_sla_minutes,stale_contacting_minutes,effective_from,created_by)
  values(policy_version,data->'weekly_hours',case when jsonb_typeof(data->'opening_hours')='object' then data->'opening_hours' end,coalesce(data->'date_exceptions','[]'::jsonb),offsets,coalesce((data->>'minimum_attempt_gap_minutes')::integer,180),
   coalesce((data->>'first_contact_sla_minutes')::integer,15),coalesce((data->>'post_test_sla_minutes')::integer,120),
   coalesce((data->>'stale_contacting_minutes')::integer,2880),happened,actor) returning * into p;
  result:=jsonb_build_object('policy_id',p.id,'version',p.version,'timezone',p.timezone,'weekly_hours',p.weekly_hours,'opening_hours',p.opening_hours,'date_exceptions',p.date_exceptions,'effective_from',p.effective_from);

 elsif cmd in ('create_manual_lead','create_prospect') then
  select * into p from public.crm_followup_policies where id=crm_security.current_policy_id();
  if cmd='create_prospect' then
   if (data ? 'same_person' and jsonb_typeof(data->'same_person')<>'boolean') or (data ? 'contact_id' and jsonb_typeof(data->'contact_id')<>'string')
    or (data ? 'acknowledged_matches' and jsonb_typeof(data->'acknowledged_matches')<>'array') then
    raise exception 'Invalid prospect fields' using errcode='22023'; end if;
   if data ? 'contact_id' then
    -- « Ajouter un enfant » (§5.3): a new learner for an existing contact, which
    -- is reused as it is (its own edit changes its fields).
    if data ?| array['phone','whatsapp','email','preferred_channel','contact_kind'] or coalesce((data->>'same_person')::boolean,false) then
     raise exception 'A sibling reuses the contact as it is' using errcode='22023',hint='people.sibling_contact_fields'; end if;
    select * into existing from public.crm_contacts where id=(data->>'contact_id')::uuid for update;
    if not found or existing.merged_into_contact_id is not null then raise exception 'Contact not found' using errcode='22023'; end if;
    data:=data||jsonb_build_object('display_name',coalesce(nullif(btrim(existing.display_name),''),data->>'display_name'));
   end if;
   if coalesce((data->>'same_person')::boolean,false) then
    -- « C'est la même personne »: the contact is the learner.
    if nullif(btrim(data->>'learner_name'),'') is not null and lower(btrim(data->>'learner_name'))<>lower(btrim(data->>'display_name')) then
     raise exception 'The learner is the contact' using errcode='22023',hint='people.same_person_name'; end if;
    data:=data||jsonb_build_object('learner_name',btrim(data->>'display_name'),'contact_kind','adult_learner');
   end if;
  end if;
  if nullif(btrim(data->>'learner_name'),'') is null or length(data->>'learner_name')>200
   or nullif(btrim(data->>'display_name'),'') is null or length(data->>'display_name')>200
   or nullif(btrim(data->>'source_label'),'') is null or length(data->>'source_label')>200 then
   raise exception 'Contact, learner and source label required (maximum 200 characters)' using errcode='22023'; end if;
  if (data->>'learner_birth_date')::date>public.business_date() then raise exception 'Birth date cannot be in the future' using errcode='22023'; end if;
  perform crm_security.assert_staff((data->>'owner_id')::uuid);
  -- §4.2/§4.8: a walk-in or an inbound call is created with its first exchange and
  -- that exchange's next action, in this transaction; « Premier contact » is never scheduled.
  next_obj:=data->'first_exchange';
  if next_obj is not null and (jsonb_typeof(next_obj)<>'object' or next_obj-array['channel','next','note']<>'{}'::jsonb
   or coalesce(next_obj->>'channel','') not in ('phone','whatsapp','in_person') or jsonb_typeof(next_obj->'next') is distinct from 'object'
   or next_obj->'next' ? 'close' or length(next_obj->>'note')>4000) then
   raise exception 'Valid first exchange required' using errcode='22023'; end if;
  -- A walk-in has always spoken with us: its exchange is recorded at creation and
  -- no « Premier contact » is scheduled (§4.8, audit observation 5).
  if btrim(data->>'source_label')='Manuel · Visite au centre' and (next_obj is null or next_obj->>'channel'<>'in_person') then
   raise exception 'A walk-in is created with its exchange' using errcode='22023',hint='crm_create.walk_in_exchange_required'; end if;
  phone:=crm_security.normalize_phone(data->>'phone'); email:=nullif(lower(btrim(data->>'email')),'');
  if email is not null and (length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email' using errcode='22023'; end if;
  if cmd='create_prospect' then
   -- §5.1: an invalid or placeholder number is refused on this form, never stored.
   if existing.id is null then
    phone:=public.require_phone(data->>'phone'); whatsapp:=public.require_phone(data->>'whatsapp');
   else
    phone:=existing.phone_e164; whatsapp:=existing.whatsapp_e164; email:=existing.email_normalized;
   end if;
   -- §5.2: a strong match (same phone, or same name and birth date) refuses the
   -- create until the user has said, for each one, « Même famille » or
   -- « Personne différente ». A sibling shares the contact's phone by design.
   matches:=crm_security.person_matches(case when existing.id is null then array_remove(array[phone,whatsapp],null) else '{}'::text[] end,
    data->>'learner_name',(data->>'learner_birth_date')::date,null,null,null);
   perform crm_security.assert_matches_acknowledged(matches,data->'acknowledged_matches');
  end if;
  -- No automatic reuse, including a unique phone/email match: shared family
  -- identifiers are not proof of contact identity. Return bounded suggestions.
  if existing.id is not null then
   contact:=existing.id; candidates:='[]'::jsonb;
  else
   if cmd='create_manual_lead' then
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'version',c.version)),'[]'::jsonb) into candidates
    from (select id,display_name,version from public.crm_contacts where merged_into_contact_id is null
     and ((phone is not null and phone_e164=phone) or (email is not null and email_normalized=email)) order by id limit 10) c;
    whatsapp:=crm_security.normalize_phone(data->>'whatsapp');
   else candidates:='[]'::jsonb; end if;
   insert into public.crm_contacts(display_name,contact_kind,phone_raw,phone_e164,whatsapp_raw,whatsapp_e164,email_raw,email_normalized,preferred_channel,created_by)
   values(btrim(data->>'display_name'),coalesce(data->>'contact_kind','unknown'),data->>'phone',phone,data->>'whatsapp',whatsapp,
    data->>'email',email,data->>'preferred_channel',actor) returning id into contact;
  end if;
  submission:=gen_random_uuid(); l.id:=gen_random_uuid();
  due:=crm_security.next_window(p.id,now()+make_interval(mins=>p.first_contact_sla_minutes));
  -- §4.6: a manual prospect belongs to its creator unless another owner is chosen.
  insert into public.crm_leads(id,contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,
    owner_id,first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date)
  values(l.id,contact,btrim(data->>'learner_name'),lower(btrim(data->>'learner_name')),(data->>'learner_age')::integer,
   case when data->>'learner_age' is not null then now() end,(data->>'learner_birth_date')::date,data->>'session_type',data->>'program_interest_text',
   case when data ? 'owner_id' then (data->>'owner_id')::uuid else actor end,submission,submission,p.id,(due at time zone public.centre_utc_offset())::date) returning * into l;
  insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,resolved_by,resolved_at,payload_hash)
  values(submission,l.id,'manual',now(),now(),'server',data-array['first_exchange','contact_id','same_person','acknowledged_matches'],'[]',btrim(data->>'source_label'),'resolved',actor,now(),digest);
  perform crm_security.event(l.id,'lead_created',source||':lead',null,null,null,null,null,null,null,null,'NEW');
  aid:=crm_security.event(l.id,'submission_received',source||':submission',submission=>submission);
  if cmd='create_prospect' then perform crm_security.record_match_decisions('prospect',l.id,matches,data->'acknowledged_matches'); end if;
  -- Activity ownership FK is satisfied; acquisition snapshots are never edited.
  if next_obj is null then
   tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','first_contact','due_at',due,'_key','attempt:'||l.id||':1:1','_kind','intake',
    '_ordinal',1,'_event_source',source||':initial-task'),'intake',source);
  else
   -- The exchange runs nested under this command's key (one history entry); its
   -- private key is fresh per execution, and the outer request owns the replay.
   perform crm_security.command('log_exchange',gen_random_uuid(),jsonb_build_object('lead_id',l.id,'expected_version',(select version from public.crm_leads where id=l.id),
    'channel',next_obj->>'channel','result','spoke','next',next_obj->'next')||case when nullif(btrim(next_obj->>'note'),'') is not null then jsonb_build_object('note',next_obj->>'note') else '{}'::jsonb end);
   tid:=crm_security.next_action_id(l.id);
  end if;
  if not nested then
   perform crm_security.primary_event(l.id,cmd,nullif(btrim(next_obj->>'note'),''),nullif(next_obj->>'channel','other'),case when next_obj is not null then 'spoke' end,null,
    crm_security.action_label((select t0 from public.crm_tasks t0 where t0.id=tid)),null,
    jsonb_build_object('result_label',case when next_obj is null then 'Prospect créé' else 'Prospect créé · On a parlé' end
     ||case when existing.id is not null then ' · Même contact' else '' end));
  end if;
  result:=crm_security.result(l.id,source)||jsonb_build_object('submission_id',submission,'contact_candidates',candidates,
   'contact_id',contact,'contact_version',(select version from public.crm_contacts where id=contact));

 else
  select * into l from public.crm_leads where id=(data->>'lead_id')::uuid for update;
  if not found then raise exception 'Lead not found' using errcode='22023'; end if;
  if (data->>'expected_version')::bigint is distinct from l.version then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
  if l.merged_into_lead_id is not null or l.status='CONVERTED' then raise exception 'Lead is not operationally editable' using errcode='22023'; end if;
  if cmd not in ('add_note','reopen_lead','reassign','reopen_prospect','update_prospect') and l.status in ('LOST','NOT_QUALIFIED') then raise exception 'Reopen lead before this operation' using errcode='22023'; end if;
  initial_status:=l.status;
  select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
  before_label:=crm_security.action_label(na);
  if data->>'task_id' is not null then
   select * into t from public.crm_tasks where id=(data->>'task_id')::uuid and lead_id=l.id for update;
   if not found or t.status<>'open' then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
   if data ? 'expected_task_version' and (data->>'expected_task_version')::bigint is distinct from t.version then raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
   if cmd<>'log_exchange' and not (data ? 'expected_task_version') then raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
  end if;
  if cmd in ('complete_task','cancel_task') and t.id is null then raise exception 'Task required' using errcode='22023'; end if;
  happened:=coalesce((data->>'occurred_at')::timestamptz,now());
  if not isfinite(happened) or happened>now() or happened<l.created_at then raise exception 'Occurrence time must be between lead creation and now' using errcode='22023'; end if;
  if happened<(select max(occurred_at) from public.crm_activities where lead_id=l.id and event_type='lead_reopened') then
   raise exception 'Activity predates the latest reopening' using errcode='22023'; end if;
  note:=case when nullif(btrim(coalesce(data->>'note',data->>'outcome',data->>'reason')),'') is not null then coalesce(data->>'note',data->>'outcome',data->>'reason') end;

  -- Old exchange wrappers are translated into one exchange (§4.3).
  if cmd='record_call_outcome' then
   chan:='phone'; outcome:=data->>'outcome';
   if outcome is null or outcome<>all(array['no_answer','busy','declined','unreachable','spoke_with_contact','wrong_number']) then raise exception 'Invalid phone outcome' using errcode='22023'; end if;
   if t.id is not null and t.task_type not in ('first_contact','contact_attempt','callback') then raise exception 'Phone outcome requires a call task' using errcode='22023'; end if;
   res:=case when outcome='spoke_with_contact' then 'spoke' else outcome end;
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='record_whatsapp' then
   if (data->>'kind') is null or data->>'kind' not in ('whatsapp_sent','meaningful_whatsapp_conversation') then raise exception 'Invalid WhatsApp activity' using errcode='22023'; end if;
   chan:='whatsapp'; res:=case when data->>'kind'='meaningful_whatsapp_conversation' then 'spoke' else 'whatsapp_sent' end;
   if res='whatsapp_sent' and data ? 'next_task' then raise exception 'WhatsApp sent is activity-only' using errcode='22023'; end if;
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='record_conversation' then
   if coalesce(data->>'channel','') not in ('phone','whatsapp','in_person') then raise exception 'Conversation channel and evidence required' using errcode='22023'; end if;
   chan:=data->>'channel'; res:='spoke';
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='log_exchange' then
   chan:=data->>'channel'; res:=data->>'result'; note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end;
   if chan is null or chan not in ('phone','whatsapp','in_person','other')
    or res is null or res not in ('no_answer','busy','declined','unreachable','wrong_number','spoke','whatsapp_sent','note')
    or (res in ('no_answer','busy','declined','unreachable','wrong_number') and chan<>'phone')
    or (res='whatsapp_sent' and chan<>'whatsapp') or length(data->>'note')>4000 then
    raise exception 'Valid channel and result required' using errcode='22023'; end if;
   if res='note' and note is null then raise exception 'Note required' using errcode='22023'; end if;
   if data ? 'real_attempt_override' and jsonb_typeof(data->'real_attempt_override')<>'boolean' then raise exception 'Invalid attempt override' using errcode='22023'; end if;
   -- next = "keep" | next-action spec | {"close":{status,reason,note}} | {"enrol":{due_at|due_preset}}
   if data->'next' is null or data->'next'='"keep"'::jsonb then next_mode:='keep';
   elsif jsonb_typeof(data->'next')='object' and data->'next' ? 'close' then next_mode:='close'; next_obj:=data->'next'->'close';
   elsif jsonb_typeof(data->'next')='object' and data->'next' ? 'enrol' then next_mode:='enrol';
    next_obj:=jsonb_build_object('task_type','enrollment_followup','instructions','Finaliser l’inscription avec le contact.')
     ||case when jsonb_typeof(data->'next'->'enrol')='object' and data->'next'->'enrol' ? 'due_at' then jsonb_build_object('due_at',data->'next'->'enrol'->'due_at')
        else jsonb_build_object('due_preset',coalesce(data->'next'->'enrol'->>'due_preset','tomorrow')) end;
   elsif jsonb_typeof(data->'next')='object' then next_mode:='spec'; next_obj:=crm_security.user_spec(data->'next');
   else raise exception 'Valid next action required' using errcode='22023'; end if;
   if res='spoke' and next_mode='keep' and na.id is null then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
   if res in ('note','whatsapp_sent') and next_mode in ('close','enrol') then raise exception 'Valid next action required' using errcode='22023'; end if;
   if res in ('no_answer','busy','declined','unreachable') and next_mode in ('close','enrol') then raise exception 'Valid next action required' using errcode='22023'; end if;
  end if;
  if next_mode='close' then
   close_target:=next_obj->>'status'; close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note';
   if close_target is null or close_target not in ('LOST','NOT_QUALIFIED') or jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then
    raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
  end if;

  if cmd='resolve_submission' then
   -- Private only: future trusted intake can attach an unresolved acquisition
   -- without rewriting accepted snapshots or the lead's original first touch.
   perform 1 from public.crm_submissions where id=(data->>'submission_id')::uuid and match_status='needs_review' and lead_id is null for update;
   if not found then raise exception 'Unresolved submission required' using errcode='22023'; end if;
   update public.crm_submissions set lead_id=l.id,match_status='resolved',resolved_by=actor,resolved_at=now()
    where id=(data->>'submission_id')::uuid;
   update public.crm_leads set latest_submission_id=(data->>'submission_id')::uuid where id=l.id
    and (select row(occurred_at,id) from public.crm_submissions where id=(data->>'submission_id')::uuid)>
        (select row(occurred_at,id) from public.crm_submissions where id=l.latest_submission_id);
   perform crm_security.lifecycle_pending_handoff((data->>'submission_id')::uuid);
   perform crm_security.event(l.id,'submission_received',source||':submission',submission=>(data->>'submission_id')::uuid);
  elsif cmd='update_prospect' then
   -- §5.3 « Modifier la fiche »: contact and learner fields, version-checked,
   -- one primary history entry « Fiche modifiée » (phones masked).
   select * into existing from public.crm_contacts where id=l.contact_id for update;
   edit:='[]'::jsonb;
   if data ? 'display_name' then
    if nullif(btrim(data->>'display_name'),'') is null or length(data->>'display_name')>200 then raise exception 'Contact name required (maximum 200 characters)' using errcode='22023'; end if;
    if btrim(data->>'display_name') is distinct from existing.display_name then
     edit:=edit||jsonb_build_object('field','display_name','label','Contact','before',existing.display_name,'after',btrim(data->>'display_name'));
     existing.display_name:=btrim(data->>'display_name'); end if;
   end if;
   if data ? 'phone' then
    phone:=public.require_phone(data->>'phone');
    if phone is distinct from existing.phone_e164 then
     edit:=edit||jsonb_build_object('field','phone','label','Téléphone','before',public.phone_mask(existing.phone_e164),'after',public.phone_mask(phone));
     existing.phone_e164:=phone; existing.phone_raw:=nullif(btrim(data->>'phone'),''); end if;
   end if;
   if data ? 'whatsapp' then
    whatsapp:=public.require_phone(data->>'whatsapp');
    if whatsapp is distinct from existing.whatsapp_e164 then
     edit:=edit||jsonb_build_object('field','whatsapp','label','WhatsApp','before',public.phone_mask(existing.whatsapp_e164),'after',public.phone_mask(whatsapp));
     existing.whatsapp_e164:=whatsapp; existing.whatsapp_raw:=nullif(btrim(data->>'whatsapp'),''); end if;
   end if;
   if data ? 'email' then
    email:=nullif(lower(btrim(data->>'email')),'');
    if email is not null and (length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email' using errcode='22023'; end if;
    if email is distinct from existing.email_normalized then
     edit:=edit||jsonb_build_object('field','email','label','E-mail','before',existing.email_normalized,'after',email);
     existing.email_normalized:=email; existing.email_raw:=nullif(btrim(data->>'email'),''); end if;
   end if;
   if data ? 'learner_name' then
    if nullif(btrim(data->>'learner_name'),'') is null or length(data->>'learner_name')>200 then raise exception 'Learner name required (maximum 200 characters)' using errcode='22023'; end if;
    if btrim(data->>'learner_name') is distinct from l.learner_name then
     edit:=edit||jsonb_build_object('field','learner_name','label','Apprenant','before',l.learner_name,'after',btrim(data->>'learner_name'));
     l.learner_name:=btrim(data->>'learner_name'); end if;
   end if;
   if data ? 'learner_birth_date' then
    if (data->>'learner_birth_date')::date>public.business_date() then raise exception 'Birth date cannot be in the future' using errcode='22023'; end if;
    if (data->>'learner_birth_date')::date is distinct from l.learner_birth_date then
     edit:=edit||jsonb_build_object('field','learner_birth_date','label','Date de naissance','before',l.learner_birth_date,'after',(data->>'learner_birth_date')::date);
     l.learner_birth_date:=(data->>'learner_birth_date')::date; end if;
   end if;
   if data ? 'learner_age' then
    if (data->>'learner_age')::integer is distinct from l.learner_age then
     edit:=edit||jsonb_build_object('field','learner_age','label','Âge','before',l.learner_age,'after',(data->>'learner_age')::integer);
     l.learner_age:=(data->>'learner_age')::integer; l.age_recorded_at:=case when l.learner_age is not null then now() end; end if;
   end if;
   if data ? 'session_type' and (data->>'session_type') is distinct from l.session_type then
    edit:=edit||jsonb_build_object('field','session_type','label','Programme','before',l.session_type,'after',data->>'session_type');
    l.session_type:=data->>'session_type';
   end if;
   if data ? 'program_interest_text' and nullif(btrim(data->>'program_interest_text'),'') is distinct from l.program_interest_text then
    if length(data->>'program_interest_text')>500 then raise exception 'Programme text too long' using errcode='22023'; end if;
    edit:=edit||jsonb_build_object('field','program_interest_text','label','Intérêt','before',l.program_interest_text,'after',nullif(btrim(data->>'program_interest_text'),''));
    l.program_interest_text:=nullif(btrim(data->>'program_interest_text'),'');
   end if;
   if jsonb_array_length(edit)=0 then raise exception 'Nothing to change' using errcode='22023',hint='people.no_change'; end if;
   if edit @> '[{"label":"Téléphone"}]' or edit @> '[{"label":"WhatsApp"}]' or edit @> '[{"label":"Contact"}]' or edit @> '[{"label":"E-mail"}]' then
    update public.crm_contacts set display_name=existing.display_name,phone_raw=existing.phone_raw,phone_e164=existing.phone_e164,
     whatsapp_raw=existing.whatsapp_raw,whatsapp_e164=existing.whatsapp_e164,email_raw=existing.email_raw,email_normalized=existing.email_normalized,
     version=version+1,updated_at=now() where id=existing.id;
   end if;
   update public.crm_leads set learner_name=l.learner_name,learner_name_normalized=lower(btrim(l.learner_name)),learner_birth_date=l.learner_birth_date,
    learner_age=l.learner_age,age_recorded_at=l.age_recorded_at,session_type=l.session_type,program_interest_text=l.program_interest_text where id=l.id;
   -- Decisions sent with the edit are recorded; the matches still open are returned (never blocking an edit).
   matches:=crm_security.person_matches(array_remove(array[existing.phone_e164,existing.whatsapp_e164],null),l.learner_name,l.learner_birth_date,l.id,l.student_id,l.contact_id);
   perform crm_security.record_match_decisions('prospect',l.id,matches,data->'acknowledged_matches');
   result_extra:=jsonb_build_object('duplicate_candidates',crm_security.undecided_matches('prospect',l.id,matches));
   edit_label:='Fiche modifiée : '||(select string_agg(lower(e->>'label'),', ' order by ord) from jsonb_array_elements(edit) with ordinality x(e,ord));
   note:=null;

  elsif cmd='add_note' then
   if nullif(btrim(data->>'note'),'') is null then raise exception 'Note required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'note_added',source||':note',data->>'note');
   note:=data->>'note'; res:='note';

  elsif cmd in ('record_call_outcome','record_whatsapp','record_conversation','log_exchange') then
   primary_channel:=nullif(chan,'other');
   if res in ('no_answer','busy','declined','unreachable') then
    if l.last_attempt_at is not null and happened<l.last_attempt_at then raise exception 'Call time predates last recorded attempt' using errcode='22023'; end if;
    if l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
     select * into strict p from public.crm_followup_policies where id=l.followup_policy_id;
     -- OD-14: a real attempt inside the gap is recorded only when the user says so.
     if l.last_attempt_at is not null and happened<l.last_attempt_at+make_interval(mins=>p.minimum_attempt_gap_minutes)
      and not coalesce((data->>'real_attempt_override')::boolean,false) then
      raise exception 'Failed calls must respect the policy minimum spacing' using errcode='22023',hint='crm_exchange.attempt_gap'; end if;
     if l.last_conversation_at is not null and happened<l.last_conversation_at then
      raise exception 'Failed call predates the latest meaningful conversation' using errcode='22023'; end if;
     count_failed:=crm_security.failed_count(l); ordinal:=(count_failed+1)::smallint;
     -- Each uninterrupted sequence anchors to its first actual failed call,
     -- independently of lifecycle and any earlier intake/conversation dates.
     if count_failed=0 then l.outreach_anchor_date:=(happened at time zone public.centre_utc_offset())::date; end if;
     -- The first five need not have a task supplied, but consume the current
     -- sequence slot exactly once. An explicit call after five is still possible.
     if t.id is null then
      select * into t from public.crm_tasks where lead_id=l.id and status='open' and outreach_cycle=l.outreach_cycle and attempt_ordinal=ordinal order by id limit 1 for update;
     elsif t.attempt_ordinal is not null and (t.outreach_cycle<>l.outreach_cycle or t.attempt_ordinal<>ordinal) then
      raise exception 'Task is not the current attempt' using errcode='PT409';
     end if;
     perform crm_security.event(l.id,'contact_attempted',source||':attempt',note,'phone',res,t.id,happened,l.outreach_cycle,ordinal);
     perform crm_security.event(l.id,'call_'||res,source||':outcome',null,'phone',res,t.id,happened);
     if l.status='NEW' then l.status:='CONTACTING'; end if;
     l.last_attempt_at:=happened;
     if next_mode='spec' then
      -- An explicit choice after a failed call is the user's, as in « Changer ».
      tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'user',source);
     elsif ordinal<5 then
      due:=crm_security.attempt_due(l.followup_policy_id,l.outreach_anchor_date,ordinal+1,happened,now());
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','contact_attempt','due_at',due,'_key','attempt:'||l.id||':'||l.outreach_cycle||':'||(ordinal+1),
       '_kind','attempt_sequence','_ordinal',ordinal+1,'_event_source',source||':next-attempt')
       ||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'system',source);
     else
      -- OD-17: after the fifth failure the prospect waits, with no relance date.
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','awaiting_prospect','_key',source||':awaiting')
       ||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'system',source);
     end if;
    else
     perform crm_security.event(l.id,'contact_attempted',source||':attempt',note,'phone',res,t.id,happened);
    end if;
   elsif res='wrong_number' then
    -- Wrong number never counts as an unreachable attempt.
    perform crm_security.event(l.id,'call_wrong_number',source||':outcome',note,'phone','wrong_number',t.id,happened);
    if data ? 'corrected_phone' then
     -- §5.3 / day script 8: « Mauvais numéro » with the right number. The
     -- contact's phone is corrected and calling starts again on that number.
     if next_mode<>'keep' then raise exception 'A corrected number keeps the next action' using errcode='22023',hint='people.corrected_phone_keep'; end if;
     phone:=public.require_phone(data->>'corrected_phone');
     if phone is null then raise exception 'Corrected number required' using errcode='22023',hint='people.phone_invalid'; end if;
     select * into existing from public.crm_contacts where id=l.contact_id for update;
     if phone is not distinct from existing.phone_e164 then raise exception 'This is the number on file' using errcode='22023',hint='people.phone_unchanged'; end if;
     -- The new number meets the same duplicate gate as a create (§5.2, review of #217):
     -- each other person already on it is answered first (pairs answered before are not
     -- asked again). Siblings on this contact are skipped by design.
     matches:=crm_security.undecided_matches('prospect',l.id,crm_security.person_matches(array[phone],null,null,l.id,l.student_id,l.contact_id));
     perform crm_security.assert_matches_acknowledged(matches,data->'acknowledged_matches');
     perform crm_security.record_match_decisions('prospect',l.id,matches,data->'acknowledged_matches');
     edit:=jsonb_build_array(jsonb_build_object('field','phone','label','Téléphone','before',public.phone_mask(existing.phone_e164),'after',public.phone_mask(phone)));
     update public.crm_contacts set phone_raw=btrim(data->>'corrected_phone'),phone_e164=phone,version=version+1,updated_at=now() where id=existing.id;
     edit_label:='Mauvais numéro · numéro corrigé';
     if na.task_type in ('first_contact','contact_attempt','callback','awaiting_prospect') then
      -- A new outreach sequence on the new number: its first call is due at the next open slot.
      l.outreach_cycle:=l.outreach_cycle+1; l.outreach_anchor_date:=null; l.last_attempt_at:=null;
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','contact_attempt','due_at',crm_security.next_window(l.followup_policy_id,now()),
       '_key','attempt:'||l.id||':'||l.outreach_cycle||':1','_kind','attempt_sequence','_ordinal',1,'_event_source',source||':corrected-phone'),'system',source);
     end if;
    elsif next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null and cmd<>'log_exchange' then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'user',source);
    elsif next_mode='legacy' and t.id is not null then tid:=crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',false)),'outcome',source||':complete'); end if;
    needs_next:=true;
   elsif res='spoke' then
    if next_mode='close' then
     -- Closing after a conversation records the evidence but, as the
     -- conversation decision always did, no engagement step.
     perform crm_security.event(l.id,'conversation_recorded',source||':conversation',note,chan,case when chan='phone' then 'spoke_with_contact' end,t.id,happened);
     l.last_conversation_at:=happened; l.outreach_cycle:=l.outreach_cycle+1; l.outreach_anchor_date:=null; l.last_attempt_at:=null;
    else
     perform crm_security.event(l.id,case when chan='whatsapp' then 'whatsapp_conversation' else 'conversation_recorded' end,
      source||case when chan='whatsapp' then ':whatsapp' else ':conversation' end,note,nullif(chan,'other'),
      case when chan='phone' and cmd in ('record_call_outcome','log_exchange') then 'spoke_with_contact' end,
      case when chan='phone' then t.id end,happened);
     meaningful:=true;
     -- Old call wrapper: the call task spoken on is completed, as before.
     if next_mode='legacy' and t.id is not null then
      perform crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',false,'reason',note)),'outcome',source||':complete');
     end if;
    end if;
   elsif res='whatsapp_sent' then
    perform crm_security.event(l.id,'whatsapp_sent',source||':whatsapp',note,'whatsapp',null,null,happened);
    if next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj,'user',source); needs_next:=true; end if;
   else
    perform crm_security.event(l.id,'note_added',source||':note',note);
    if next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj,'user',source); needs_next:=true; end if;
   end if;
   if cmd='log_exchange' and res='spoke' and next_mode in ('spec','enrol') then
    -- Qualification is implied (OD-11).
    qualify_step:=case when next_mode='enrol' then 'enrollment'
     when next_obj->>'task_type'='center_visit' and coalesce((next_obj->>'with_test')::boolean,false) then 'placement_test'
     when next_obj->>'task_type'='center_visit' then 'center_visit' end;
   end if;

  elsif cmd='schedule_task' then
   if t.id is null then tid:=crm_security.set_next_action(l,crm_security.legacy_spec(data->'task'),'user',source);
   else
    next_spec:=data->'task';
    if jsonb_typeof(next_spec) is distinct from 'object' or next_spec-array['due_at','instructions']<>'{}'::jsonb then raise exception 'Reschedule accepts due_at and instructions only' using errcode='22023'; end if;
    tid:=crm_security.set_next_action(l,jsonb_build_object('_reschedule',next_spec||jsonb_build_object('task_id',t.id)),'user',source);
    perform crm_security.event(l.id,'task_rescheduled',source||':rescheduled',data->>'note',null,null,t.id);
   end if;

  elsif cmd in ('complete_task','cancel_task') then
   if cmd='complete_task' then
    if t.task_type in ('first_contact','contact_attempt','callback') then raise exception 'Complete call tasks through record_call_outcome' using errcode='22023'; end if;
    if nullif(btrim(data->>'outcome'),'') is null or length(data->>'outcome')>200 then raise exception 'Completion outcome required' using errcode='22023'; end if;
   elsif nullif(btrim(data->>'reason'),'') is null then raise exception 'Cancellation reason required' using errcode='22023';
   end if;
   if data ? 'next_task' and data->'next_task'<>'null'::jsonb then
    tid:=crm_security.set_next_action(l,crm_security.legacy_spec(data->'next_task')||jsonb_build_object('_against',t.id,'_note',case when cmd='complete_task' then data->>'outcome' end,
     '_replaced_reason',case when cmd='cancel_task' then data->>'reason' end,'replace_action_id',t.id),case when cmd='complete_task' then 'outcome' else 'user' end,source);
   else
    tid:=crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',cmd='cancel_task',
     'reason',case when cmd='complete_task' then data->>'outcome' else data->>'reason' end)),'user',source||case when cmd='complete_task' then ':complete' else ':cancel' end);
   end if;
   needs_next:=true;

  elsif cmd='qualify_lead' then
   if l.status not in ('NEW','CONTACTING','ENGAGED') then raise exception 'Lead must be unqualified and active' using errcode='22023'; end if;
   if data->>'conversation_channel' is not null then
    if data->>'conversation_channel' not in ('phone','whatsapp','in_person') then raise exception 'Conversation evidence required' using errcode='22023'; end if;
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note',data->>'conversation_channel');
    meaningful:=true;
   elsif l.last_conversation_at is null or not exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then
    raise exception 'Qualification requires meaningful conversation evidence' using errcode='22023';
   end if;
   target:=data->>'qualification_step';
   if target is null or target not in ('placement_test','center_visit','enrollment','other') or (target='other' and nullif(btrim(data->>'note'),'') is null) then raise exception 'Valid qualification step and explanation required' using errcode='22023'; end if;
   if data->'next_task' is null or data->'next_task'='null'::jsonb then raise exception 'Qualification next task required' using errcode='22023'; end if;
   if (target='placement_test' and data->'next_task'->>'task_type' is distinct from 'confirm_placement_test')
    or (target='center_visit' and data->'next_task'->>'task_type' is distinct from 'center_visit')
    or (target='enrollment' and data->'next_task'->>'task_type' is distinct from 'enrollment_followup') then raise exception 'Task must match qualification step' using errcode='22023'; end if;
   l.qualification_step:=target;
   next_mode:='spec'; next_obj:=crm_security.legacy_spec(data->'next_task')||case when target='center_visit' then jsonb_build_object('keep_existing',true) else '{}'::jsonb end;

  elsif cmd in ('close_lost','close_not_qualified','close_prospect') then
   close_target:=case cmd when 'close_lost' then 'LOST' when 'close_not_qualified' then 'NOT_QUALIFIED' else data->>'status' end;
   close_reason:=data->>'reason'; close_note:=data->>'note'; next_mode:='close'; note:=null;

  elsif cmd='change_next_action' then
   -- The action the user saw must still be the current one (NF-1).
   if (data->>'expected_action_id') is distinct from na.id::text then raise exception 'Next action changed; refresh and retry' using errcode='PT409'; end if;
   note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end;
   if jsonb_typeof(data->'next')='object' and data->'next' ? 'close' then next_mode:='close'; next_obj:=data->'next'->'close';
    close_target:=next_obj->>'status'; close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note';
    if jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   else
    -- OD-11: booking an appointment qualifies, and qualification needs the
    -- conversation, so a new appointment for a prospect not yet qualified is
    -- booked through « Noter un échange » (« On a parlé »), never here. Moving
    -- an existing appointment stays possible.
    if data->'next'->>'task_type'='center_visit' and l.status<>'QUALIFIED' and na.task_type is distinct from 'center_visit' then
     raise exception 'Book an appointment through the exchange that qualifies the prospect' using errcode='22023',hint='crm_next_action.appointment_needs_exchange'; end if;
    tid:=crm_security.set_next_action(l,crm_security.user_spec(data->'next'),'user',source); needs_next:=true;
   end if;

  elsif cmd='appointment_outcome' then
   outcome_code:=data->>'outcome_code';
   if outcome_code is null or outcome_code not in ('came_enrolled','came_will_return','came_not_interested','no_show') then raise exception 'Valid appointment outcome required' using errcode='22023'; end if;
   if na.id is null or (data->>'action_id') is distinct from na.id::text or na.task_type<>'center_visit' then raise exception 'Next action changed; refresh and retry' using errcode='PT409'; end if;
   if na.due_at>now() then raise exception 'Outcome can be recorded only from the appointment time' using errcode='22023',hint='crm_appointment.before_start'; end if;
   note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end; res:=outcome_code;
   -- « Venu · pas intéressé » closes the prospect: the reason is asked, never
   -- assumed (§4.8, « reason required »).
   if outcome_code='came_not_interested' and jsonb_typeof(data->'next'->'close') is distinct from 'object' then
    raise exception 'Closure reason required' using errcode='22023',hint='crm_appointment.reason_required'; end if;
   -- An appointment that already exists on a prospect not yet qualified (reopened
   -- with an appointment, an old tab, D1 rule b): the visit is the in-person
   -- conversation, and coming to enrol or to come back qualifies (OD-11), so
   -- every outcome row of §4.8 starts from QUALIFIED.
   if outcome_code in ('came_enrolled','came_will_return') and l.status in ('NEW','CONTACTING','ENGAGED') then
    happened:=now();
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',null,'in_person',null,na.id,happened);
    meaningful:=true;
    qualify_step:=case when outcome_code='came_enrolled' then 'enrollment' else 'center_visit' end;
   end if;
   -- The linked test: attended, or « Absent » for a no-show.
   if na.placement_test_id is not null then
    update public.placement_tests set status=case when outcome_code='no_show' then 'Absent' else 'Passé' end where id=na.placement_test_id and status='Planifié';
   end if;
   if outcome_code='came_not_interested' or (jsonb_typeof(data->'next')='object' and data->'next' ? 'close') then
    next_obj:=data->'next'->'close';
    if jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
    close_target:=coalesce(next_obj->>'status','LOST'); close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note'; next_mode:='close';
    perform crm_security.set_next_action(l,jsonb_build_object('_against',na.id,'_finish',jsonb_build_object('cancelled',false,'reason',note),'_outcome_code',outcome_code),'outcome',source||':complete');
   else
    next_obj:=case when jsonb_typeof(data->'next')='object' then crm_security.user_spec(data->'next')
     when outcome_code='came_enrolled' then jsonb_build_object('task_type','enrollment_followup','due_preset','tomorrow','instructions','Finaliser l’inscription avec le contact.')
     when outcome_code='came_will_return' then jsonb_build_object('task_type','awaiting_prospect')
     else jsonb_build_object('task_type','callback','schedule_kind','reminder','due_preset','tomorrow') end;
    if outcome_code='came_enrolled' then qualify_step:='enrollment'; end if;
    tid:=crm_security.set_next_action(l,next_obj||jsonb_build_object('_outcome_of',na.id,'_outcome_code',outcome_code,'_note',note),'outcome',source);
    needs_next:=true;
   end if;

  elsif cmd in ('reopen_lead','reopen_prospect') then
   if l.status not in ('LOST','NOT_QUALIFIED') or nullif(btrim(data->>'reason'),'') is null then raise exception 'Closed lead and reopen reason required' using errcode='22023'; end if;
   l.status:=case when exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then 'ENGAGED' else 'CONTACTING' end;
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   l.closure_reason:=null;l.closure_note:=null;l.closed_at:=null;l.qualification_step:=null;
   if cmd='reopen_lead' and (data->'next_task' is null or data->'next_task'='null'::jsonb) then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   if cmd='reopen_prospect' and (data->'next' is null or jsonb_typeof(data->'next')<>'object') then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'lead_reopened',source||':reopened',data->>'reason',null,null,null,null,null,null,initial_status,l.status);
   note:=data->>'reason';
   next_mode:='spec'; next_obj:=case when cmd='reopen_lead' then crm_security.legacy_spec(data->'next_task') else crm_security.user_spec(data->'next') end;
   -- A reopened prospect is CONTACTING or ENGAGED: like « Changer », its first
   -- appointment is booked through the exchange that qualifies (OD-11; owner
   -- decision 2026-11-22).
   if next_obj->>'task_type'='center_visit' then
    raise exception 'Book an appointment through the exchange that qualifies the prospect' using errcode='22023',hint='crm_next_action.appointment_needs_exchange'; end if;
   needs_next:=true;

  elsif cmd='reassign' then
   if not(data ? 'owner_id') and not(data ? 'assigned_to') then raise exception 'Explicit reassignment required' using errcode='22023'; end if;
   if data ? 'owner_id' then
    perform crm_security.assert_staff((data->>'owner_id')::uuid);l.owner_id:=(data->>'owner_id')::uuid;
    perform crm_security.event(l.id,'lead_reassigned',source||':lead-owner',data->>'note');
    -- §4.6: the next action's assignee follows the owner.
    perform crm_security.set_next_action(l,jsonb_build_object('_reassign',true),'user',source);
   end if;
   if data ? 'assigned_to' then
    if t.id is null then raise exception 'Task required for task reassignment' using errcode='22023'; end if;
    perform crm_security.assert_staff((data->>'assigned_to')::uuid);
    perform crm_security.set_next_action(l,jsonb_build_object('_delegate',jsonb_build_object('task_id',t.id,'assigned_to',data->'assigned_to')),'user',source);
    perform crm_security.event(l.id,'task_reassigned',source||':task-owner',data->>'note',null,null,t.id);
   end if;
   note:=data->>'note';
  end if;

  -- Closure (old close commands, « Pas intéressé / Pas pour nous » in an
  -- exchange or a change, appointment « pas intéressé »).
  if next_mode='close' then
   reason:=close_reason; target:=close_target;
   if target is null or target not in ('LOST','NOT_QUALIFIED') or reason is null or (target='LOST' and reason<>all(array['unreachable','not_interested','price','schedule','location','chose_competitor','postponed','other']))
    or (target='NOT_QUALIFIED' and reason<>all(array['age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other']))
    or (reason='other' and nullif(btrim(close_note),'') is null) then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   if reason='unreachable' and (l.status not in ('CONTACTING','ENGAGED','QUALIFIED') or crm_security.failed_count(l)<5) then raise exception 'Unreachable requires five current-cycle failed phone calls' using errcode='22023'; end if;
   perform crm_security.event(l.id,case when target='LOST' then 'lead_lost' else 'lead_not_qualified' end,source||':closed',close_note,null,reason,null,null,null,null,l.status,target);
   l.status:=target;l.closure_reason:=reason;l.closure_note:=close_note;l.closed_at:=now();
   perform crm_security.set_next_action(l,jsonb_build_object('none',true,'reason','Lead closed: '||reason),'close',source||':cancel');
   note:=concat_ws(' — ',note,nullif(btrim(close_note),''));
  end if;

  if meaningful then
   if happened<greatest(l.last_conversation_at,l.last_attempt_at) then
    raise exception 'Conversation predates the latest outreach evidence' using errcode='22023'; end if;
   l.last_conversation_at:=happened;
   -- A conversation interrupts outreach even for an already qualified lead.
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   if l.status in ('NEW','CONTACTING') then
    perform crm_security.event(l.id,'lead_engaged',source||':engaged',null,null,null,null,null,null,null,l.status,'ENGAGED');
    l.status:='ENGAGED';
   end if;
   if next_mode not in ('spec','enrol') then
    perform crm_security.set_next_action(l,jsonb_build_object('_cancel_slots','Meaningful conversation ended outreach'),'user',source||':cancel-attempt');
   end if;
   needs_next:=true;
  end if;
  if cmd='qualify_lead' or (qualify_step is not null and l.status in ('NEW','CONTACTING','ENGAGED')) then
   perform crm_security.event(l.id,'lead_qualified',source||':qualified',data->>'note',null,null,null,null,null,null,'ENGAGED','QUALIFIED');
   l.status:='QUALIFIED';needs_next:=true;
  end if;
  if qualify_step is not null then l.qualification_step:=qualify_step; end if;
  if next_mode in ('spec','enrol') and cmd in ('record_call_outcome','record_whatsapp','record_conversation','log_exchange','qualify_lead','reopen_lead','reopen_prospect')
   and coalesce(res,'') not in ('no_answer','busy','declined','unreachable','wrong_number','whatsapp_sent','note') then
   cause:=case when cmd in ('reopen_lead','reopen_prospect','qualify_lead') then 'user' else 'outcome' end;
   tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null and cause='outcome' and cmd<>'log_exchange' then jsonb_build_object('_against',t.id) else '{}'::jsonb end,
    cause,source);
   needs_next:=true;
  end if;
  if needs_next and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and not exists(select 1 from public.crm_tasks where lead_id=l.id and status='open') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
  update public.crm_leads set status=l.status,owner_id=l.owner_id,qualification_step=l.qualification_step,
   closure_reason=l.closure_reason,closure_note=l.closure_note,closed_at=l.closed_at,outreach_cycle=l.outreach_cycle,
   outreach_anchor_date=l.outreach_anchor_date,last_attempt_at=l.last_attempt_at,last_conversation_at=l.last_conversation_at,
   version=version+1,updated_at=now() where id=l.id;
  if not nested and cmd<>'resolve_submission' then
   select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
   after_label:=crm_security.action_label(na);
   perform crm_security.primary_event(l.id,cmd,note,primary_channel,res,before_label,after_label,case when res is not null then happened end,
    jsonb_build_object('result_label',coalesce(edit_label,crm_security.result_label(res)),'real_attempt_override',case when (data->>'real_attempt_override')::boolean then true end)
    ||case when edit is not null then jsonb_build_object('changes',edit) else '{}'::jsonb end);
  end if;
  result:=crm_security.result(l.id,source)||result_extra;
 end if;
 if not nested and cmd not in ('create_followup_policy','resolve_submission') then perform set_config('eh.crm_command_key','',true); end if;
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,cmd,request,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM command input' using errcode='22023';
end $function$

;

-- Searches: phone keys in any format; merged students hidden.
CREATE OR REPLACE FUNCTION crm_security.opportunity_ids(v text, q text, contact uuid, owner_mode text, owner uuid, channel text, source text, program_kind text, program text, as_of timestamp with time zone)
 RETURNS TABLE(id uuid, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
begin return query
 select l.id,l.status,l.created_at from public.crm_leads l
 join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 where l.merged_into_lead_id is null
 and ($3 is null or l.contact_id=$3)
 and ($4='all' or $4='me' and l.owner_id=auth.uid()
   or $4='unassigned' and l.owner_id is null or $4='staff' and l.owner_id=$5)
 and ($6 is null or s.channel=$6) and ($7 is null or s.source_label=$7)
 and ($8='all' or $8='session' and nullif(l.session_type,'')=$9
   or $8='interest' and nullif(l.session_type,'') is null and nullif(l.program_interest_text,'')=$9
   or $8='unspecified' and nullif(l.session_type,'') is null and nullif(l.program_interest_text,'') is null)
 and ($2='' or strpos(lower(c.display_name),lower($2))>0 or strpos(lower(coalesce(l.learner_name,'')),lower($2))>0
   or (crm_security.normalize_phone($2) is not null and (c.phone_e164=crm_security.normalize_phone($2) or c.whatsapp_e164=crm_security.normalize_phone($2)))
   or (length(regexp_replace($2,'[^0-9]','','g'))>=3 and strpos(coalesce(c.phone_e164,c.phone_raw,''),regexp_replace($2,'[^0-9]','','g'))>0)
   -- 138 (§5.1): « 06 12 34 56 », « 00212… », « 212… » find the stored number.
   or (public.phone_search_key($2) is not null and (strpos(coalesce(public.phone_key(c.phone_e164),public.phone_key(c.phone_raw),''),public.phone_search_key($2))>0
     or strpos(coalesce(public.phone_key(c.whatsapp_e164),''),public.phone_search_key($2))>0)))
 and case $1
 when 'all' then true
 when 'mine' then l.owner_id=auth.uid()
 when 'new_today' then l.created_at>=(($10 at time zone public.centre_utc_offset())::date)::timestamp at time zone public.centre_utc_offset()
   and l.created_at<((($10 at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset()
 when 'qualified' then l.status='QUALIFIED'
 when 'closed' then l.status in ('LOST','NOT_QUALIFIED')
 when 'no_response' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>0
 when 'follow_up_today' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and exists(
   select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open'
   and t.due_at>=(($10 at time zone public.centre_utc_offset())::date)::timestamp at time zone public.centre_utc_offset()
   and t.due_at<((($10 at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset())
 when 'placement' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and
   (exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié')
    or exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type in ('confirm_placement_test','post_test_followup')))
 when 'attention' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and (
   exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.due_at<$10)
   or l.status='NEW' and exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='first_contact')
   or (select t.due_at from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)
      <((($10 at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset()
   or not exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')
      and not exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' and (p.date_test+crm_security.calendar_time(p.heure)) at time zone public.centre_utc_offset()>=$10)
   or l.status='CONTACTING' and coalesce(l.last_attempt_at,l.created_at)<$10-make_interval(mins=>(select p.stale_contacting_minutes from public.crm_followup_policies p where p.id=l.followup_policy_id)))
 else false end;
end
$function$

;

CREATE OR REPLACE FUNCTION public.crm_search_leads(p_query text DEFAULT ''::text, p_status text DEFAULT NULL::text, p_contact uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb; q text:=btrim(coalesce(p_query,'')); canonical text; qkey text;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 if length(q)>120 or (p_status is not null and p_status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED','LOST','NOT_QUALIFIED','CONVERTED')) then raise exception 'Invalid search' using errcode='22023'; end if;
 canonical:=crm_security.normalize_phone(q); qkey:=public.phone_search_key(q);
 with matching as (
 select l.id,l.created_at from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 where l.merged_into_lead_id is null and (p_status is null or l.status=p_status) and (p_contact is null or c.id=p_contact)
 and (q='' or strpos(lower(coalesce(c.display_name,'')),lower(q))>0 or strpos(lower(coalesce(l.learner_name,'')),lower(q))>0
 or (canonical is not null and (c.phone_e164=canonical or c.whatsapp_e164=canonical))
 or (length(regexp_replace(q,'[^0-9]','','g'))>=3 and (strpos(coalesce(c.phone_e164,c.phone_raw,''),regexp_replace(q,'[^0-9]','','g'))>0))
 -- 138 (§5.1): phone keys in any format.
 or (qkey is not null and (strpos(coalesce(public.phone_key(c.phone_e164),public.phone_key(c.phone_raw),''),qkey)>0
  or strpos(coalesce(public.phone_key(c.whatsapp_e164),''),qkey)>0)))
 ), page as(select id,created_at from matching order by created_at desc,id desc limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(crm_security.operational_card(id) order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
 return result;
end $function$

;

CREATE OR REPLACE FUNCTION public.search_students_page(p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_age_category text DEFAULT ''::text, p_session text DEFAULT ''::text, p_level text DEFAULT ''::text, p_incomplete boolean DEFAULT false, p_source text DEFAULT ''::text, p_plan text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_group text DEFAULT ''::text, p_payment text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if p_page < 1 or p_page_size < 0 or p_page_size > 100
    or pg_catalog.length(p_search) > 120
    or coalesce(p_payment, '') not in ('', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none') then
    raise exception 'Invalid student page request' using errcode = '22023';
  end if;
  if p_page_size = 0 and public.get_my_role()='receptionist' then
    raise exception 'Student export forbidden' using errcode='42501';
  end if;
  if p_page_size = 0 and p_page <> 1 then
    raise exception 'Export page must be first page' using errcode = '22023';
  end if;

  -- Batch G: the learner filters run first; the finance aggregate covers only the
  -- learners it can affect (the page when no payment filter is set, else the candidates).
  with candidates as materialized (
    select s.*
    from public.students s
    where (
      p_status = 'all_shown'
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_group,'') = '' or
      (p_group = 'unassigned' and (
        exists (select 1 from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null)
        or (s.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e
          where e.student_id = s.id and e.group_id is not null and e.status in ('Validated','Trial'))
          and not exists (select 1 from public.enrollments e where e.student_id = s.id
            and e.status in ('Submitted','Under Review','Confirmed'))))))
    and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
    and (coalesce(p_session,'') = '' or s.session_type = p_session)
    and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
    and (not coalesce(p_incomplete,false) or (s.email is null or s.email = '') and (s.parent_email is null or s.parent_email = ''))
    and (coalesce(p_source,'') = '' or s.referral_source = p_source)
    and (coalesce(p_plan,'') = '' or coalesce(s.plan_type,'Standard') = p_plan)
    and (coalesce(p_search,'') = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.full_name,'')),pg_catalog.lower(p_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(s.email,'')),pg_catalog.lower(p_search)) > 0
      -- 138 (§5.1): a phone in any format, from 6 significant digits.
      or (public.phone_search_key(p_search) is not null
        and pg_catalog.strpos(coalesce(public.phone_key(s.telephone),''),public.phone_search_key(p_search)) > 0))
    -- 138 (§5.3): a student merged into another is shown through the one kept.
    and s.merged_into_student_id is null
  ), scope as materialized (
    select c.id from candidates c where coalesce(p_payment, '') <> ''
    union all
    select p.id from (select c.id from candidates c where coalesce(p_payment, '') = ''
      order by c.created_at desc, c.id asc
      limit nullif(p_page_size,0)
      offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end) p
  ), finance as materialized (
    select sc.id as student_id, f.charge_count, f.payment_balance, f.has_overdue, f.has_partial
    from scope sc
    cross join lateral (
      select count(*) as charge_count,
        sum(c.balance)::numeric(12,2) as payment_balance,
        bool_or(c.balance > 0 and c.settlement_status = 'En retard') as has_overdue,
        bool_or(c.balance > 0 and c.paid_amount > 0) as has_partial
      from public.charge_balances c
      where c.voided_at is null and c.student_id = sc.id
      having count(*) > 0) f
  ), priced as materialized (
    select s.*,
      coalesce(f.payment_balance, 0)::numeric(12,2) as payment_balance,
      case
        when f.charge_count is null then 'Aucun engagement'
        when f.payment_balance <= 0 then 'Soldé'
        when f.has_overdue then 'En retard'
        when f.has_partial then 'Acompte versé'
        else 'En attente'
      end as payment_status
    from candidates s
    left join finance f on f.student_id = s.id
  ), filtered as materialized (
    select * from priced
    where coalesce(p_payment, '') = ''
      or (p_payment = 'due' and payment_balance > 0)
      or (p_payment = 'unpaid' and payment_status = 'En attente')
      or (p_payment = 'partial' and payment_status = 'Acompte versé')
      or (p_payment = 'overdue' and payment_status = 'En retard')
      or (p_payment = 'paid' and payment_status = 'Soldé')
      or (p_payment = 'none' and payment_status = 'Aucun engagement')
  ), rows as (
    select s.*,
      (select g.name from public.groups g where g.id = s.groupe_id) as group_name,
      (select count(*) from public.enrollments e where e.student_id = s.id and e.group_id is not null
        and e.status in ('Validated','Trial') and e.group_id is distinct from s.groupe_id) as extra_group_count,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null), '[]'::jsonb) as pending_enrollments
    from (select * from filtered order by created_at desc, id asc
      limit nullif(p_page_size,0)
      offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end) s
  )
  select pg_catalog.jsonb_build_object(
    'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc,r.id asc) from rows r),'[]'::jsonb),
    'count',(select count(*) from filtered),
    'total',(select count(*) from public.students),
    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial'))
  ) into v_result;
  return v_result;
end;
$function$

;

-- Reads: the edit form's fields, siblings, the merge set.
CREATE OR REPLACE FUNCTION public.crm_get_workspace_detail(p_lead uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.operational_card(l.id)||jsonb_build_object('contact',jsonb_build_object('display_name',c.display_name,'phone',coalesce(c.phone_e164,c.phone_raw),
 'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),'email',c.email_normalized,
 -- 138 (§5.3): the edit form and the « numéro à vérifier » flag.
 'id',c.id,'version',c.version,'contact_kind',c.contact_kind,'whatsapp_own',c.whatsapp_e164,
 'phone_needs_review',nullif(btrim(c.phone_raw),'') is not null and c.phone_e164 is null),
 'contact_id',l.contact_id,'lead_version',l.version,'merged_into_lead_id',l.merged_into_lead_id,
 'learner_birth_date',l.learner_birth_date,'learner_age',l.learner_age,'session_type',l.session_type,'program_interest_text',l.program_interest_text,
 'merged_from',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'learner_name',m.learner_name) order by m.created_at),'[]'::jsonb)
   from public.crm_leads m where m.id=any(crm_security.lead_merge_set(l.id)) and m.id<>l.id),
 'siblings',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'learner_name',o.learner_name,'status',o.status) order by o.created_at),'[]'::jsonb)
   from public.crm_leads o where o.contact_id=l.contact_id and o.id<>l.id and o.merged_into_lead_id is null),
 'duplicate_candidates',crm_security.undecided_matches('prospect',l.id,crm_security.person_matches(array_remove(array[c.phone_e164,c.whatsapp_e164],null),
   l.learner_name,l.learner_birth_date,l.id,l.student_id,l.contact_id)),
 'enrollment',(select crm_security.enrollment_summary(e) from public.enrollments e where e.id=l.enrollment_id),
 'conversion_review_required',case when public.get_my_role()='director' then l.conversion_review_required else false end,
 'qualification_step',l.qualification_step,'closure_reason',l.closure_reason,'closure_note',l.closure_note,'last_conversation_at',l.last_conversation_at,
 'outreach_cycle',l.outreach_cycle,'failed_attempts',crm_security.failed_count(l),
 'unreachable_eligible',l.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>=5,
 'open_tasks',public.crm_list_open_tasks(l.id,null,100,0),
 'confirm_placement_task',(select jsonb_build_object('id',t.id,'version',t.version) from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='confirm_placement_test' order by t.due_at,t.id limit 1),
 'placement_count',(select count(*) from public.placement_tests where crm_lead_id=l.id),
 'open_task_count',(select count(*) from public.crm_tasks where lead_id=l.id and status='open')) into result
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=p_lead;
 return result;
end $function$

;

CREATE OR REPLACE FUNCTION public.crm_get_timeline(p_lead uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 20, p_details boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb; fingerprint text:=md5(jsonb_build_array(p_lead,coalesce(p_details,false))::text); stamp timestamptz; cid uuid;
begin
 perform crm_security.require_reader(false);
 if p_lead is null or p_limit is null or p_limit not between 1 and 50 or p_details is null then raise exception 'Invalid timeline input' using errcode='22023'; end if;
 perform crm_security.o3_cursor(p_cursor,'timeline',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','at','id']<>'{}'::jsonb or jsonb_typeof(p_cursor->'at') is distinct from 'string' or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'Invalid cursor' using errcode='22023'; end if;
  stamp:=(p_cursor->>'at')::timestamptz; cid:=(p_cursor->>'id')::uuid;
  if not isfinite(stamp) then raise exception 'Invalid cursor' using errcode='22023'; end if;
 end if;
 with page as materialized(select a.id,a.lead_id,a.occurred_at,a.event_type,a.body,a.outcome,a.actor_id,a.actor_kind,a.channel,a.details,a.command_key,a.is_primary from public.crm_activities a
 where a.lead_id=any(crm_security.lead_merge_set(p_lead)) and (p_details or a.is_primary or a.command_key is null)
 and (stamp is null or (a.occurred_at,a.id)<(stamp,cid)) order by a.occurred_at desc,a.id desc limit p_limit+1),
 shown as(select * from page order by occurred_at desc,id desc limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'occurred_at',a.occurred_at,'event_type',a.event_type,'body',a.body,'outcome',a.outcome,
 'channel',a.channel,'is_primary',a.is_primary,'command',a.details->>'command','summary',a.details->>'summary',
 'secondary_count',case when a.is_primary then (select count(*) from public.crm_activities s where s.lead_id=a.lead_id and s.command_key=a.command_key and not s.is_primary) end,
 -- 138 (OD-8): a merged prospect's history is read here, marked with its id.
 'merged_from',case when a.lead_id<>p_lead then a.lead_id end,
 'actor_name',coalesce(nullif(p.full_name,''),case when a.actor_kind='user' then 'Équipe accueil' else 'Système' end)) order by a.occurred_at desc,a.id desc) from shown a left join public.profiles p on p.id=a.actor_id),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),'next_cursor',case when (select count(*)>p_limit from page) then
 (select jsonb_build_object('v',1,'kind','timeline','filter',fingerprint,'at',a.occurred_at,'id',a.id) from shown a order by a.occurred_at,a.id limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid cursor' using errcode='22023';
end $function$

;

-- save_receptionist_student: a replayed create compares the stored (normalised) phone.
CREATE OR REPLACE FUNCTION public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.students%rowtype; begin
  perform operational_security.require_receptionist();
  if p_student is null then raise exception 'Stable student id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone','email',
      'parent_email','age_category','notes','session_type','niveau_cefr','referral_source','photo_url']);
    if nullif(btrim(p_changes->>'full_name'),'') is null then raise exception 'Name required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau_cefr') is not true then
      raise exception 'Invalid session/level' using errcode='22023'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    insert into public.students(id,full_name,date_naissance,telephone,email,parent_email,age_category,
      notes,session_type,niveau_cefr,referral_source,photo_url,status,plan_type)
    values(p_student,p_changes->>'full_name',(p_changes->>'date_naissance')::date,p_changes->>'telephone',
      p_changes->>'email',p_changes->>'parent_email',p_changes->>'age_category',p_changes->>'notes',
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau_cefr',p_changes->>'referral_source',
      p_changes->>'photo_url','Prospect','Standard') on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Prospect' or s.plan_type is distinct from 'Standard' or
        s.full_name is distinct from p_changes->>'full_name' or
        s.date_naissance is distinct from (p_changes->>'date_naissance')::date or
        s.telephone is distinct from public.require_phone(p_changes->>'telephone') or
        s.email is distinct from p_changes->>'email' or s.parent_email is distinct from p_changes->>'parent_email' or
        s.age_category is distinct from p_changes->>'age_category' or s.notes is distinct from p_changes->>'notes' or
        s.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        s.niveau_cefr is distinct from p_changes->>'niveau_cefr' or
        s.referral_source is distinct from p_changes->>'referral_source' or
        s.photo_url is distinct from p_changes->>'photo_url' then
        raise exception 'Student create identity conflict' using errcode='23505'; end if;
      id:=s.id; updated_at:=s.updated_at;
    end if;
  else
    -- RPW-r2 items 2 and 3: programme, level and source (the admin rule: guard_student_membership
    -- refuses a programme or level change while the learner is in a group) and the two e-mails
    -- (refused while an active or pending family link uses the old address; every change logged).
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url','session_type','niveau_cefr','referral_source','email','parent_email']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into s from public.students where students.id=p_student and deleted_at is null for update;
    if not found or s.updated_at is distinct from p_expected_updated_at then
      raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
    if (p_changes ? 'session_type' or p_changes ? 'niveau_cefr') and operational_security.valid_session_level(
        case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
        case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end) is not true then
      raise exception 'Programme ou niveau invalide.' using errcode='22023', hint='rpw.level_invalid'; end if;
    if p_changes ? 'email' and nullif(btrim(p_changes->>'email'),'') is distinct from s.email
       and operational_security.family_link_holds(s.id, 'self', s.email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'parent_email' and nullif(btrim(p_changes->>'parent_email'),'') is distinct from s.parent_email
       and operational_security.family_link_holds(s.id, 'parent', s.parent_email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    update public.students set
      full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else s.full_name end,
      date_naissance=case when p_changes ? 'date_naissance' then (p_changes->>'date_naissance')::date else s.date_naissance end,
      telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else s.telephone end,
      age_category=case when p_changes ? 'age_category' then p_changes->>'age_category' else s.age_category end,
      notes=case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
      photo_url=case when p_changes ? 'photo_url' then p_changes->>'photo_url' else s.photo_url end,
      session_type=case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
      niveau_cefr=case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end,
      referral_source=case when p_changes ? 'referral_source' then nullif(p_changes->>'referral_source','') else s.referral_source end,
      email=case when p_changes ? 'email' then nullif(btrim(p_changes->>'email'),'') else s.email end,
      parent_email=case when p_changes ? 'parent_email' then nullif(btrim(p_changes->>'parent_email'),'') else s.parent_email end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  return next;
end $function$

;

-- crm_start_enrollment: the new student gets the contact's number in E.164, or none
-- (a legacy placeholder or unreadable number is not copied: the phone rule would refuse it).
CREATE OR REPLACE FUNCTION public.crm_start_enrollment(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; c public.crm_contacts%rowtype;
 s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; a uuid; t public.crm_tasks%rowtype; keep_task uuid;
 learner text; birth date; session text; year text; level text; initial_status text; due timestamptz; result jsonb;
 followup_at timestamptz; followup_task uuid; followup jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
 or p_data-array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date','candidate_review','confirm_new','enrollment_id','expected_enrollment_updated_at','session_type','school_year','level','group_id','initial_status','followup_at','notes']<>'{}'::jsonb then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- EAP (D3): the enrollment is created Confirmed and placed after the payment.
 if p_data->>'group_id' is not null then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- E9: hint only the helper's own lock collision, at its original position.
 -- Every other error, including a malformed student_id cast, propagates as before.
 begin
  perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
 exception when sqlstate 'PT409' then
  if sqlerrm='Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' then
   raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409',hint='crm_enrollment.enrollment_in_progress'; end if;
  raise;
 end;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':start_enrollment:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='start_enrollment' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023',hint='crm_enrollment.request_conflict'; end if;return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 -- E1: one reason per condition of the former combined lead check.
 if not found or l.merged_into_lead_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_unavailable'; end if;
 if l.enrollment_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_already_enrolled'; end if;
 if l.status<>'QUALIFIED' then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_not_qualified'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409',hint='crm_enrollment.lead_changed'; end if;
 select * into strict c from public.crm_contacts where id=l.contact_id;
 learner:=btrim(p_data->>'learner_name');
 -- E3: same cast at the same position; only its cast errors gain a reason.
 begin
  birth:=nullif(p_data->>'birth_date','')::date;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.birth_date_invalid';
 end;
 session:=p_data->>'session_type';year:=p_data->>'school_year';level:=nullif(p_data->>'level','');initial_status:=coalesce(p_data->>'initial_status','Submitted');
 -- E2: the former combined program/year/notes check, split in its original order.
 if session is null or session<>all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One']) then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.program_invalid'; end if;
 if year is null or year!~'^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer<>left(year,4)::integer+1 then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.school_year_invalid'; end if;
 if length(p_data->>'notes')>2000 then raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.notes_too_long'; end if;
 if initial_status is distinct from 'Confirmed' then raise exception 'Only pre-confirmation enrollment initiation is permitted' using errcode='42501',hint='crm_enrollment.initial_status_not_permitted'; end if;
 if p_data->>'student_choice'='new' then
  -- E3: the same rejected set as 084, one reason per condition. A birth date is
  -- bounded by the Casablanca civil date (enrollment initiation only).
  if l.student_id is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_already_linked'; end if;
  if p_data->>'student_id' is not null or p_data->>'enrollment_id' is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
  if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_name_invalid'; end if;
  if not isfinite(birth) then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_invalid'; end if;
  if birth>public.business_date() then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_future'; end if;
  -- Serializes new-student decisions for equal names, including separate leads.
  perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner),0));
  if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id,learner,birth) then raise exception 'Student candidates changed; review again' using errcode='PT409',hint='crm_enrollment.candidates_changed'; end if;
  if exists(select 1 from crm_security.student_candidates(l.id,learner,birth)) and coalesce((p_data->>'confirm_new')::boolean,false) is not true then raise exception 'Explicit new learner decision required' using errcode='22023',hint='crm_enrollment.new_learner_confirmation_required'; end if;
  insert into public.students(full_name,date_naissance,telephone,email,parent_email,status,session_type,niveau_cefr,notes)
  values(learner,birth,crm_security.normalize_phone(coalesce(c.phone_e164,c.phone_raw)),case when c.contact_kind='adult_learner' then c.email_normalized end,
   case when c.contact_kind<>'adult_learner' then c.email_normalized end,'Prospect',session,level,
   case when c.contact_kind<>'adult_learner' then 'Contact : '||coalesce(c.display_name,'Non renseigné') end) returning * into s;
 elsif p_data->>'student_choice'='existing' then
  select * into s from public.students where id=(p_data->>'student_id')::uuid and deleted_at is null for update;
  -- E4: the former combined check, split by linkage.
  if not found then
   if l.student_id is not null and l.student_id=(p_data->>'student_id')::uuid then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.linked_learner_unavailable'; end if;
   if l.student_id is not null then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
   raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_unavailable';
  end if;
  if l.student_id is not null and l.student_id<>s.id then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
 else raise exception 'Explicit student choice required' using errcode='22023',hint='crm_enrollment.learner_choice_required'; end if;
 if p_data->>'enrollment_id' is not null then
  select * into e from public.enrollments where id=(p_data->>'enrollment_id')::uuid for update;
  -- E5: the former combined check, split into incompatibility and linkage.
  if not found or e.student_id is distinct from s.id or e.status is null or e.status in ('Rejected','Ended')
  or coalesce(e.session_type,s.session_type) is distinct from session or crm_security.enrollment_year(e) is distinct from year then
   raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_incompatible'; end if;
  if exists(select 1 from public.crm_leads where enrollment_id=e.id) then raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_already_linked'; end if;
  if e.group_id is not null then
   select * into g from public.groups where id=e.group_id for share;
   if not found or g.session_type is distinct from session or (e.level is not null and g.niveau is distinct from e.level) then
    raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.enrollment_group_incompatible'; end if;
  end if;
  if e.updated_at is distinct from (p_data->>'expected_enrollment_updated_at')::timestamptz then raise exception 'Stale enrollment; refresh and retry' using errcode='PT409',hint='crm_enrollment.enrollment_changed'; end if;
 else
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status is null and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment status requires review' using errcode='22023',hint='crm_enrollment.existing_enrollment_needs_review'; end if;
  -- E6: same condition and message; the hint says whether any match is still selectable.
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended') and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended')
    and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year and not exists(select 1 from public.crm_leads where enrollment_id=x.id))
    then 'crm_enrollment.existing_enrollment_requires_selection' else 'crm_enrollment.existing_enrollment_linked_elsewhere' end; end if;
  if p_data->>'group_id' is not null then
   select * into g from public.groups where id=(p_data->>'group_id')::uuid for share;
   if not found or g.session_type is distinct from session or (level is not null and g.niveau is distinct from level) then raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.group_incompatible'; end if;
   level:=g.niveau;
   -- Batch H (H5): the enrollment year must be the group's (22023: the handler
   -- below turns 23514 into a generic refusal).
   perform academic_security.check_group_year(g.annee, year, '22023');
  end if;
  if not crm_security.valid_enrollment_level(session,level) and not coalesce(g.id is not null or s.session_type=session and s.niveau_cefr=level and p_data->>'student_choice'='existing',false) then raise exception 'Invalid level for selected program' using errcode='22023',hint='crm_enrollment.level_invalid'; end if;
  -- EGC (I3): a concurrent duplicate on the one-live-enrollment index is a
  -- record conflict (PT409, egc.duplicate_enrollment), not a raw 23505.
  begin
   insert into public.enrollments(student_id,session_type,school_year,level,group_id,status,date_inscription,notes)
   values(s.id,session,year,level,g.id,initial_status,public.business_date(),p_data->>'notes') returning * into e;
  exception when unique_violation then
   perform academic_security.duplicate();
  end;
 end if;
 update public.crm_leads set student_id=s.id,enrollment_id=e.id,version=version+1,updated_at=now() where id=l.id;
 insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
 values(l.id,e.id,now(),actor,'user','enrollment_started','enrollment-started:'||l.id||':'||e.id,'Inscription rattachée à l’apprenant.') returning id into a;
 perform crm_security.evaluate_conversion(l.id,statement_timestamp());
 if (select status from public.crm_leads where id=l.id)<>'CONVERTED' then
  -- Keep the earliest appropriate follow-up, cancel only redundant enrollment tasks.
  select * into t from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' order by due_at,id limit 1 for update;
  if t.id is null then
   -- E7: pre-checks logically identical to next_window and new_task, in their
   -- order; new_task still validates. An empty string stays a parse error.
   begin
    followup_at:=(p_data->>'followup_at')::timestamptz;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.followup_invalid';
   end;
   if not isfinite(followup_at) then raise exception 'Finite due time required' using errcode='22023',hint='crm_enrollment.followup_invalid'; end if;
   begin
    due:=crm_security.next_window(crm_security.current_policy_id(),coalesce(followup_at,now()+interval '1 day'));
   exception when invalid_parameter_value then
    if sqlerrm='Policy has no available calling window' then
     raise exception 'Policy has no available calling window' using errcode='22023',hint='crm_enrollment.followup_policy_unavailable'; end if;
    raise;
   end;
   if due<now() then raise exception 'Valid future task required' using errcode='22023',hint='crm_enrollment.followup_in_past'; end if;
   if l.owner_id is not null and not exists(select 1 from public.profiles where id=l.owner_id and role in ('director','admin','receptionist')) then
    raise exception 'Assignee must be operational staff' using errcode='22023',hint='crm_enrollment.owner_not_operational'; end if;
   -- « Finaliser l'inscription » replaces the current action (§4.2).
   followup_task:=crm_security.set_next_action(l,jsonb_build_object('task_type','enrollment_followup','due_at',due,'instructions','Finaliser l’inscription avec le contact.',
    '_key','enrollment-followup:'||l.id||':'||e.id,'_kind','enrollment','_replaced_reason','Remplacée par « Finaliser l’inscription »'),'enrollment','enrollment-followup:'||l.id||':'||e.id);
   followup:=jsonb_build_object('id',followup_task,'created',true);
  else
   keep_task:=t.id;
   -- An open « Finaliser l'inscription » is kept; every other open action goes.
   perform crm_security.set_next_action(l,jsonb_build_object('_keep_task_id',keep_task,'_reason','Suivi de cette inscription déjà prévu'),'enrollment','enrollment-duplicate:'||e.id);
   followup_task:=keep_task;followup:=jsonb_build_object('id',keep_task,'created',false);
  end if;
  -- E8: the created or retained task, read by id; never the loop variable.
  followup:=followup||crm_security.scheduled_civil((select due_at from public.crm_tasks where id=followup_task));
 end if;
 result:=crm_security.result(l.id,'enrollment-started:'||l.id||':'||e.id)||jsonb_build_object('enrollment',crm_security.enrollment_summary(e),'enrollment_followup',followup);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'start_enrollment',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected or unique_violation then raise exception 'Concurrent enrollment change; refresh and retry' using errcode='PT409',hint='crm_enrollment.concurrent_change';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.record_rejected';
end $function$

;

-- Tâches (§5.3, plan « UI impact »: siblings grouped by contact): one row per contact
-- in each bucket.
CREATE OR REPLACE FUNCTION public.crm_get_work_queue(p_bucket text DEFAULT 'today'::text, p_assignee_mode text DEFAULT 'me'::text, p_assignee uuid DEFAULT NULL::uuid, p_owner_mode text DEFAULT 'all'::text, p_owner uuid DEFAULT NULL::uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare stamp timestamptz:=now(); bounds record; fingerprint text; after_due timestamptz; after_id uuid; result jsonb;
begin
 perform crm_security.require_reader(false);
 if p_bucket is null or p_bucket not in ('overdue','today','tomorrow','upcoming','awaiting')
 or p_assignee_mode is null or p_assignee_mode not in ('all','me','unassigned','staff','me_or_unassigned')
 or (p_assignee_mode='staff')<>(p_assignee is not null)
 or p_owner_mode is null or p_owner_mode not in ('all','me','unassigned','staff')
 or (p_owner_mode='staff')<>(p_owner is not null)
 or p_limit is null or p_limit not between 1 and 50 then
 raise exception 'Invalid work filters' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(auth.uid(),p_bucket,p_assignee_mode,p_assignee,p_owner_mode,p_owner)::text);
 perform crm_security.o3_cursor(p_cursor,'work',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','due','id']<>'{}'::jsonb
  or jsonb_typeof(p_cursor->'due') is distinct from 'string'
  or jsonb_typeof(p_cursor->'id') is distinct from 'string' then
  raise exception 'Invalid work cursor' using errcode='22023'; end if;
  after_due:=(p_cursor->>'due')::timestamptz; after_id:=(p_cursor->>'id')::uuid;
  if not isfinite(after_due) then raise exception 'Invalid work cursor' using errcode='22023'; end if;
 end if;
 select * into bounds from crm_security.work_boundaries(stamp);
 -- Counts and the selected page share a single statement snapshot; only page IDs
 -- are enriched. A task's assignee never falls back to its lead's owner.
 -- 138 (§5.3, day script 4): one row per contact in each bucket. Siblings (prospects
 -- sharing a contact) whose actions fall in the same bucket are grouped on the row of
 -- the earliest; a sibling due in another bucket keeps its own row and count there, so
 -- no action leaves its bucket (review of #217). Every row lists the other siblings
 -- with their own next action. Each prospect still holds exactly one action.
 with candidates as materialized (
  select t.id,t.lead_id,l.contact_id,coalesce(t.due_at,'9999-12-31 00:00:00+00'::timestamptz) due_at,
  case when t.task_type='awaiting_prospect' then 'awaiting' when t.due_at<stamp then 'overdue' when t.due_at<bounds.d1 then 'today' when t.due_at<bounds.d2 then 'tomorrow' else 'upcoming' end bucket
  from public.crm_leads l join crm_security.next_actions() n on n.lead_id=l.id join public.crm_tasks t on t.id=n.task_id
  where l.merged_into_lead_id is null
  and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
  and (p_assignee_mode='all' or p_assignee_mode='me' and t.assigned_to=auth.uid()
   or p_assignee_mode='unassigned' and t.assigned_to is null or p_assignee_mode='staff' and t.assigned_to=p_assignee
   or p_assignee_mode='me_or_unassigned' and (t.assigned_to=auth.uid() or t.assigned_to is null))
  and (p_owner_mode='all' or p_owner_mode='me' and l.owner_id=auth.uid()
   or p_owner_mode='unassigned' and l.owner_id is null or p_owner_mode='staff' and l.owner_id=p_owner)),
 matching as materialized (
  select id,lead_id,due_at,bucket from (select c.*,row_number() over (partition by c.contact_id,c.bucket order by c.due_at,c.id) rn from candidates c) x where rn=1),
 page as materialized(select * from matching where bucket=p_bucket
  and (after_due is null or (due_at,id)>(after_due,after_id)) order by due_at,id limit p_limit+1),
 shown as(select * from page order by due_at,id limit p_limit)
 select jsonb_build_object('as_of',stamp,'timezone','Africa/Casablanca',
 'boundaries',jsonb_build_object('d0',bounds.d0,'d1',bounds.d1,'d2',bounds.d2),
 'counts',(select jsonb_object_agg(b,coalesce(n,0)) from unnest(array['overdue','today','tomorrow','upcoming','awaiting'])b
  left join(select bucket,count(*) n from matching group by bucket)x on x.bucket=b),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'lead_id',t.lead_id,
  'task_type',t.task_type,'local_date',crm_security.scheduled_civil(t.due_at)->'local_date',
  'local_time',crm_security.scheduled_civil(t.due_at)->'local_time','due_at',t.due_at,'scheduled_end_at',t.scheduled_end_at,
  'version',t.version,'assigned_to',t.assigned_to,'assignee_name',a.full_name,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal,
  'schedule_kind',t.schedule_kind,'followup_reason',t.followup_reason,'review_flag',t.review_flag,
  'next_action',crm_security.action_json(t),
  'siblings',(select count(*) from public.crm_leads z where z.contact_id=l.contact_id and z.merged_into_lead_id is null and z.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')),
  'family',(select coalesce(jsonb_agg(jsonb_build_object('lead_id',z.id,'learner_name',z.learner_name,'version',z.version,
    'next_action',(select crm_security.action_json(x) from public.crm_tasks x where x.id=crm_security.next_action_id(z.id))) order by z.created_at,z.id),'[]'::jsonb) from public.crm_leads z
   where z.contact_id=l.contact_id and z.id<>l.id and z.merged_into_lead_id is null and z.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')),
  'lead',jsonb_build_object('id',l.id,'version',l.version,'contact_name',c.display_name,
  'failed_attempts',crm_security.failed_count(l),
  'learner_name',l.learner_name,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
  'status',l.status,'owner_id',l.owner_id,'owner_name',o.full_name,'owner_display_label',crm_security.staff_display_label(l.owner_id))) order by s.due_at,s.id)
  from shown s join public.crm_tasks t on t.id=s.id join public.crm_leads l on l.id=s.lead_id
  join public.crm_contacts c on c.id=l.contact_id left join public.profiles a on a.id=t.assigned_to
  left join public.profiles o on o.id=l.owner_id),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),
 'next_cursor',case when (select count(*)>p_limit from page) then
  (select jsonb_build_object('v',1,'kind','work','filter',fingerprint,'due',due_at,'id',id)
   from shown order by due_at desc,id desc limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
 raise exception 'Invalid work cursor' using errcode='22023';
end $function$;

-- Enrollment learner candidates (CrmEnrollmentDialog), body from 084: a student merged
-- into another file is no longer offered; the kept file is (§5.3).
CREATE OR REPLACE FUNCTION crm_security.student_candidates(lead uuid, learner text, birth date)
 RETURNS SETOF students
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 select s.* from public.students s join public.crm_leads l on l.id=lead join public.crm_contacts c on c.id=l.contact_id
 where s.deleted_at is null and s.merged_into_student_id is null and (
  (length(btrim(learner))>=2 and position(lower(btrim(learner)) in lower(s.full_name))>0)
  or (birth is not null and s.date_naissance=birth and split_part(lower(btrim(s.full_name)),' ',1)=split_part(lower(btrim(learner)),' ',1))
  or (c.phone_e164 is not null and crm_security.normalize_phone(s.telephone)=c.phone_e164)
  or (c.email_normalized is not null and c.email_normalized in (lower(s.email),lower(s.parent_email)))
 )
$function$;

-- ---------------------------------------------------------------------------
-- 10. Grants. New private helpers: no API role. New public commands and reads:
--     authenticated only (each checks the role itself).
-- ---------------------------------------------------------------------------
revoke all on function crm_security.person_matches(text[],text,date,uuid,uuid,uuid), crm_security.match_pair(text,uuid,text,uuid),
 crm_security.assert_matches_acknowledged(jsonb,jsonb), crm_security.record_match_decisions(text,uuid,jsonb,jsonb),
 crm_security.undecided_matches(text,uuid,jsonb), crm_security.lead_merge_set(uuid), crm_security.require_merger(),
 academic_security.student_merge_check(uuid,uuid), academic_security.merge_students_core(uuid,uuid), academic_security.unmerge_student_core(uuid),
 crm_security.d3_rows(), crm_security.d3_plan(), crm_security.d3_apply(jsonb), crm_security.d3_revert(),
 crm_security.d5_plan(jsonb), crm_security.d5_apply(jsonb,jsonb)
 from public, anon, authenticated;
revoke all on function public.find_people(text,text,text,date,integer), public.search_desk_students(text,integer),
 public.record_person_match_decisions(text,uuid,jsonb), public.crm_create_prospect(uuid,jsonb), public.crm_update_prospect(uuid,jsonb),
 public.crm_merge_prospects(uuid,uuid,uuid,bigint,bigint), public.crm_merge_contacts(uuid,uuid,uuid,bigint,bigint),
 public.student_merge_set(uuid), public.student_merge_preview(uuid,uuid), public.merge_students(uuid,uuid), public.unmerge_student(uuid)
 from public, anon;
grant execute on function public.find_people(text,text,text,date,integer), public.search_desk_students(text,integer),
 public.record_person_match_decisions(text,uuid,jsonb), public.crm_create_prospect(uuid,jsonb), public.crm_update_prospect(uuid,jsonb),
 public.crm_merge_prospects(uuid,uuid,uuid,bigint,bigint), public.crm_merge_contacts(uuid,uuid,uuid,bigint,bigint),
 public.student_merge_set(uuid), public.student_merge_preview(uuid,uuid), public.merge_students(uuid,uuid), public.unmerge_student(uuid)
 to authenticated;
