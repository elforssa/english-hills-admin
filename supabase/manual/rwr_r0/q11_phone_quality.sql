-- RWR-r5 R0 Q11 — phone quality (students, contacts)
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q11).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select 'students' src,
 count(*) filter (where telephone is null or btrim(telephone)='') empty,
 count(*) filter (where telephone ~ '^\+212[5-7][0-9]{8}$') e164,
 count(*) filter (where regexp_replace(telephone,'[^0-9]','','g') ~ '^212[5-7][0-9]{8}$' and telephone !~ '^\+') no_plus,
 count(*) filter (where regexp_replace(telephone,'[^0-9]','','g') ~ '^[5-7][0-9]{8}$') no_leading_zero,
 count(*) filter (where regexp_replace(telephone,'[^0-9]','','g') ~ '^0[5-7]([0-9])\1{7}$|^0[5-7]0{8}$') placeholder,
 count(*) filter (where telephone is not null and btrim(telephone)<>'' and crm_security.normalize_phone(telephone) is null) unnormalisable
from public.students where deleted_at is null
union all
select 'crm_contacts', count(*) filter (where phone_raw is null), count(*) filter (where phone_e164 is not null),
 null, null, count(*) filter (where phone_e164 ~ '^\+212[5-7]0{8}$'), count(*) filter (where phone_raw is not null and phone_e164 is null)
from public.crm_contacts where merged_into_contact_id is null
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
