-- RWR-r5 R0 Q25 — free-text programmes and sources
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q25).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select 'program' k, coalesce(session_type,'∅') code, left(md5(lower(btrim(coalesce(program_interest_text,'')))),8) text_hash, count(*) n
 from public.crm_leads group by 1,2,3
union all
select 'source', s.channel, left(md5(lower(btrim(coalesce(s.source_label,'')))),8), count(*)
 from public.crm_leads l join public.crm_submissions s on s.id=l.first_submission_id group by 1,2,3
union all
select 'student_referral', coalesce(referral_source,'∅'), null, count(*)
 from public.students where deleted_at is null group by 1,2,3
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
