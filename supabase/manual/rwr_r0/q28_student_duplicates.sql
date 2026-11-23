-- RWR-r5 R0 Q28 — student duplicates
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q28).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
with k as (select id, array_to_string(array(select w from unnest(regexp_split_to_array(lower(btrim(full_name)),'\s+')) w order by w),' ') nm,
 right(regexp_replace(coalesce(telephone,''),'[^0-9]','','g'),9) ph from public.students where deleted_at is null)
select count(*) groups, (array_agg(ids[1]))[1:5] sample from (
 select nm, array_agg(id) ids from k group by nm having count(*)>1) x
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
