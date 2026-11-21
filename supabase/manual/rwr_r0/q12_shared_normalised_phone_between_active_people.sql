-- RWR-r5 R0 Q12 — invariant 7: shared normalised phone between active people
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q12).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
with p as (
 select l.id, l.contact_id, right(regexp_replace(c.phone_e164,'[^0-9]','','g'),9) key
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null and c.phone_e164 is not null
 union all
 select s.id, null, right(regexp_replace(s.telephone,'[^0-9]','','g'),9)
 from public.students s where s.deleted_at is null and s.status in ('Enrolled','Prospect') and length(regexp_replace(coalesce(s.telephone,''),'[^0-9]','','g'))>=9),
g as (select array_agg(distinct id order by id) ids from p group by key
      having count(distinct coalesce(contact_id::text, id::text))>1)
select count(*) keys_shared, sum(cardinality(ids)) people, (array_agg(ids[1] order by ids[1]))[1:5] sample_ids from g
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
