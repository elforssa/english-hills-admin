import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSource, prepareSources, receiptPayload, studentPayload } from './lib/payment-tracking-sync.mjs';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  for (const key of ['annual', 'mise-a-niveau', 'output']) if (!out[key]) throw new Error(`Missing --${key}`);
  return out;
}

function sqlDollarJson(value) {
  const text = JSON.stringify(value);
  if (text.includes('$sync$')) throw new Error('Unexpected SQL delimiter in source');
  return `$sync$${text}$sync$`;
}

const options = args(process.argv.slice(2));
const prepared = prepareSources([
  loadSource(resolve(options.annual), 'annual', 'Annual payment tracking 2026', 'Yearly'),
  loadSource(resolve(options['mise-a-niveau']), 'mise-a-niveau', 'Mise à niveau payment tracking 2026', 'Mise à niveau'),
]);
const unexpected = prepared.issues.filter(issue => issue.type !== 'missing_payment_mode');
if (unexpected.length) throw new Error(`Unexpected source issues: ${JSON.stringify(unexpected)}`);

const rows = prepared.children.map(child => {
  if (child.payment && !child.payment.mode) child.payment.mode = 'Espèces';
  const student = studentPayload(child);
  const receipt = child.payment ? receiptPayload(child, null) : null;
  return {
    external_key: `${child.source}:row-${child.sourceRow}`,
    source: child.source,
    source_row: child.sourceRow,
    student_name: child.studentName,
    parent_name: child.parentName,
    full_name: student.full_name,
    phone: student.telephone,
    age_category: student.age_category,
    session_type: student.session_type,
    notes: student.notes,
    payment: Boolean(receipt),
    payment_date: receipt?.date || null,
    category: receipt?.categorie || null,
    course_type: receipt?.type_cours || null,
    total: receipt?.montant_total ?? null,
    discount_percent: receipt?.remise ?? null,
    paid: receipt?.montant_paye ?? null,
    payment_mode: receipt?.mode_paiement || null,
    payment_status: receipt?.statut_paiement || null,
    receipt_note: receipt?.observation || null,
    receipt_marker: child.payment?.marker || null,
  };
});

const sql = `begin;

create or replace function pg_temp.sync_norm(value text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(
    translate(lower(coalesce(value, '')),
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
      'aaaaaaceeeeiiiinooooouuuuyy'),
    '[^a-z0-9]+', ' ', 'g')::text
$$;

create temp table payment_tracking_stage on commit drop as
select * from jsonb_to_recordset(${sqlDollarJson(rows)}::jsonb) as x(
  external_key text, source text, source_row integer, student_name text,
  parent_name text, full_name text, phone text, age_category text,
  session_type text, notes text, payment boolean, payment_date date,
  category text, course_type text, total numeric, discount_percent numeric,
  paid numeric, payment_mode text, payment_status text, receipt_note text,
  receipt_marker text
);

create temp table payment_tracking_matches on commit drop as
with candidates as (
  select st.external_key, s.id as student_id,
    case when trim(pg_temp.sync_norm(s.full_name)) in (
      trim(pg_temp.sync_norm(st.student_name)),
      trim(pg_temp.sync_norm(st.full_name)),
      trim(pg_temp.sync_norm(st.parent_name || ' ' || st.student_name))
    ) then 1 else 2 end as priority
  from payment_tracking_stage st
  join public.students s on s.deleted_at is null and (
    trim(pg_temp.sync_norm(s.full_name)) in (
      trim(pg_temp.sync_norm(st.student_name)),
      trim(pg_temp.sync_norm(st.full_name)),
      trim(pg_temp.sync_norm(st.parent_name || ' ' || st.student_name))
    ) or (
    nullif(regexp_replace(coalesce(st.phone, ''), '\\D', '', 'g'), '') is not null
    and case
      when length(regexp_replace(coalesce(s.telephone, ''), '\\D', '', 'g')) = 10
        and regexp_replace(coalesce(s.telephone, ''), '\\D', '', 'g') like '0%'
        then '212' || substring(regexp_replace(s.telephone, '\\D', '', 'g') from 2)
      when length(regexp_replace(coalesce(s.telephone, ''), '\\D', '', 'g')) = 9
        then '212' || regexp_replace(s.telephone, '\\D', '', 'g')
      else regexp_replace(coalesce(s.telephone, ''), '\\D', '', 'g')
    end = regexp_replace(st.phone, '\\D', '', 'g')
    and pg_temp.sync_norm(s.full_name) like '%' || trim(pg_temp.sync_norm(st.student_name)) || '%'
    )
  )
), preferred as (
  select *, min(priority) over (partition by external_key) as best_priority
  from candidates
), unique_external as (
  select external_key, (array_agg(student_id))[1] as student_id
  from preferred where priority = best_priority
  group by external_key having count(*) = 1
), unique_student as (
  select student_id from unique_external group by student_id having count(*) = 1
)
select u.external_key, u.student_id
from unique_external u join unique_student s using (student_id);

do $$
declare
  ambiguous_count integer;
  match_count integer;
  other_count integer;
  existing_marker_count integer;
begin
  select count(*) into ambiguous_count from (
    select external_key from payment_tracking_matches group by external_key having count(*) > 1
  ) q;
  select count(*) into match_count from payment_tracking_matches;
  select count(*) into other_count
    from public.students s
    where s.deleted_at is null and s.session_type = 'Yearly'
      and not exists (
        select 1 from payment_tracking_matches m
        join payment_tracking_stage st using (external_key)
        where m.student_id = s.id and st.source = 'annual'
      );
  select count(*) into existing_marker_count
    from public.receipts r join payment_tracking_stage st
      on st.receipt_marker is not null and position(st.receipt_marker in coalesce(r.observation, '')) > 0;
  if (select count(*) from payment_tracking_stage) <> 54 then raise exception 'Expected 54 staged students'; end if;
  if ambiguous_count <> 0 then raise exception 'Ambiguous matches: %', ambiguous_count; end if;
  if match_count <> 9 then raise exception 'Production changed: expected 9 matches, found %', match_count; end if;
  if other_count <> 32 then raise exception 'Production changed: expected 32 Yearly-to-Other rows, found %', other_count; end if;
  if existing_marker_count <> 0 then raise exception 'Import receipt markers already exist: %', existing_marker_count; end if;
end $$;

update public.students s set
  session_type = st.session_type,
  telephone = coalesce(nullif(s.telephone, ''), st.phone),
  age_category = coalesce(s.age_category, st.age_category),
  status = case when s.status = 'Prospect' then 'Enrolled' else s.status end,
  notes = case when position('Source: ' || case when st.source = 'annual' then 'Annual payment tracking 2026' else 'Mise à niveau payment tracking 2026' end || ', row ' || st.source_row in coalesce(s.notes, '')) > 0
    then s.notes else concat_ws(E'\\n', nullif(s.notes, ''), st.notes) end
from payment_tracking_matches m
join payment_tracking_stage st using (external_key)
where s.id = m.student_id;

insert into public.students (full_name, telephone, age_category, session_type, status, notes)
select st.full_name, st.phone, st.age_category, st.session_type, 'Enrolled', st.notes
from payment_tracking_stage st
where not exists (select 1 from payment_tracking_matches m where m.external_key = st.external_key);

create temp table payment_tracking_resolved on commit drop as
select st.*, s.id as student_id
from payment_tracking_stage st
join public.students s on s.deleted_at is null and (
  exists (select 1 from payment_tracking_matches m where m.external_key = st.external_key and m.student_id = s.id)
  or (s.full_name = st.full_name and s.notes = st.notes)
);

do $$ begin
  if (select count(*) from payment_tracking_resolved) <> 54 then
    raise exception 'Expected 54 resolved students, found %', (select count(*) from payment_tracking_resolved);
  end if;
end $$;

update public.students s set session_type = 'Other'
where s.deleted_at is null and s.session_type = 'Yearly'
  and not exists (
    select 1 from payment_tracking_resolved r where r.student_id = s.id and r.source = 'annual'
  );

alter table public.receipts disable trigger user;

insert into public.receipts (
  student_id, date, nom_prenom, telephone, categorie, niveau, type_cours,
  session_type, montant_total, remise, montant_paye, mode_paiement,
  statut_paiement, observation
)
select student_id, payment_date, full_name, phone, category, 'CECRL', course_type,
  session_type, total, discount_percent, paid, payment_mode, payment_status, receipt_note
from payment_tracking_resolved r
where payment and not exists (
  select 1 from public.receipts old where position(r.receipt_marker in coalesce(old.observation, '')) > 0
);

alter table public.receipts enable trigger user;

do $$ begin
  if (select count(*) from public.receipts r where r.observation like 'payment-tracking-2026:%') <> 54 then
    raise exception 'Expected 54 imported receipts';
  end if;
end $$;

select
  (select count(*) from payment_tracking_matches) as matched_students,
  (select count(*) from payment_tracking_stage) - (select count(*) from payment_tracking_matches) as new_students,
  (select count(*) from public.students where deleted_at is null and session_type = 'Other') as students_in_other,
  (select count(*) from public.students where deleted_at is null and session_type = 'Mise à niveau') as mise_a_niveau_students,
  (select count(*) from public.receipts where observation like 'payment-tracking-2026:%') as imported_receipts,
  (select sum(montant_paye) from public.receipts where observation like 'payment-tracking-2026:%') as imported_paid;

commit;
`;

const output = resolve(options.output);
writeFileSync(output, sql, { mode: 0o600, flag: 'wx' });
chmodSync(output, 0o600);
console.log(JSON.stringify({ output, stagedStudents: rows.length, defaultedCashModes: prepared.issues.length }));
