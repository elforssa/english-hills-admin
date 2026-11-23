-- RWR-r5 task T-R0: synthetic fixture for validating Q01–Q30 on a LOCAL clean build.
--
-- LOCAL ONLY. Never run against Production. It refuses to run unless the session sets
-- eh.rwr_r0_fixture = 'local' and the CRM and student tables are empty (a clean build).
-- Load it through run_local.sh --seed, which also refuses any non-local database URL.
--
-- All data is synthetic: generated names, generated digits (built by pg_temp.ph, never
-- written as literals), ids of the form 00000000-0000-4000-8000-<12 digits>.
-- Triggers are bypassed (session_replication_role = replica) so that each shape is placed
-- exactly and every query has a known expected result (see the T-R0 table in
-- docs/architecture/evidence/receptionist-workflow-r0.md). Check
-- constraints still apply.
do $$
begin
  if coalesce(current_setting('eh.rwr_r0_fixture', true), '') <> 'local' then
    raise exception 'local_fixture.sql: set eh.rwr_r0_fixture = local (run_local.sh --seed)';
  end if;
  if exists (select 1 from public.crm_leads) or exists (select 1 from public.students)
     or exists (select 1 from public.crm_followup_policies) then
    raise exception 'local_fixture.sql: needs a clean build (CRM, policy and student tables empty)';
  end if;
end $$;

set local session_replication_role = replica;

create function pg_temp.u(n int) returns uuid language sql immutable
  as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
-- Nine national digits, distinct per n, never a repeated-digit placeholder.
create function pg_temp.ph(n int) returns text language sql immutable
  as $$ select '6' || (20000000 + n * 1111117)::text $$;
create function pg_temp.e164(n int) returns text language sql immutable
  as $$ select '+' || '212' || pg_temp.ph(n) $$;
-- Week anchors (UTC; public.centre_utc_offset() is 00:00 at the ceiling).
create function pg_temp.prev_tue(t time) returns timestamptz language sql stable
  as $$ select ((date_trunc('week', now() at time zone 'UTC')::date - 6) + t) at time zone 'UTC' $$;
create function pg_temp.next_tue(t time) returns timestamptz language sql stable
  as $$ select ((date_trunc('week', now() at time zone 'UTC')::date + 8) + t) at time zone 'UTC' $$;
create function pg_temp.next_tue_date() returns date language sql stable
  as $$ select date_trunc('week', now() at time zone 'UTC')::date + 8 $$;

-- Staff: P1 director, P2 receptionist without a name (Q27), P3 admin.
insert into public.profiles (id, email, full_name, role) values
  (pg_temp.u(1), 'director@example.com', 'Synthetic Director', 'director'),
  (pg_temp.u(2), 'reception@example.com', null, 'receptionist'),
  (pg_temp.u(3), 'admin@example.com', 'Synthetic Admin', 'admin');

insert into public.crm_followup_policies (id, version, timezone, weekly_hours, date_exceptions, attempt_offsets,
  minimum_attempt_gap_minutes, first_contact_sla_minutes, post_test_sla_minutes, stale_contacting_minutes, effective_from, created_by)
values (pg_temp.u(10), 1, 'Africa/Casablanca',
  '{"1":[["09:00","19:00"]],"2":[["09:00","19:00"]],"3":[["09:00","19:00"]],"4":[["09:00","19:00"]],"5":[["09:00","19:00"]],"6":[["09:00","13:00"]],"7":[]}',
  '[]', '{0,1,2,4,7}', 180, 60, 1440, 4320, now() - interval '60 days', pg_temp.u(1));

-- Contacts. C3 is shared by L3 and L4 (siblings, never a Q12 duplicate). C1 shares its
-- phone with student S1 (the Q12 pair). C13 is a placeholder, C14 is unnormalisable.
insert into public.crm_contacts (id, display_name, contact_kind, phone_raw, phone_e164, created_by)
select pg_temp.u(100 + n), 'Synthetic contact ' || n, 'guardian', pg_temp.e164(p), pg_temp.e164(p), pg_temp.u(2)
from (values (1, 1), (2, 12), (3, 13), (5, 15), (6, 16), (7, 17), (9, 19), (10, 20), (11, 21), (12, 22)) v(n, p);
insert into public.crm_contacts (id, display_name, contact_kind, phone_raw, phone_e164, created_by) values
  (pg_temp.u(108), 'TEST Claude contact', 'guardian', null, null, pg_temp.u(2)),
  (pg_temp.u(113), 'Synthetic contact 13', 'guardian', '+' || '212' || '6' || repeat('0', 8), '+' || '212' || '6' || repeat('0', 8), pg_temp.u(2)),
  (pg_temp.u(114), 'Synthetic contact 14', 'guardian', 'not a phone', null, pg_temp.u(2));

-- Students. S1 e164, S2 no « + », S3 no leading 0, S4 placeholder, S5 empty, S6 unnormalisable,
-- S8/S9 one name in two word orders (Q28), S10 test data (Q24), S11 the converted learner.
insert into public.students (id, full_name, telephone, status, age_category, referral_source) values
  (pg_temp.u(601), 'Synthetic Student One', pg_temp.e164(1), 'Enrolled', 'Teens (13-17)', 'Recherche Google'),
  (pg_temp.u(602), 'Synthetic Student Two', '212' || pg_temp.ph(2), 'Prospect', 'Teens (13-17)', null),
  (pg_temp.u(603), 'Synthetic Student Three', pg_temp.ph(3), 'Enrolled', 'Adults (18+)', 'Famille / Ami(e)'),
  (pg_temp.u(604), 'Synthetic Student Four', '0' || '6' || repeat('0', 8), 'Inactive', 'Adults (18+)', null),
  (pg_temp.u(605), 'Synthetic Student Five', null, 'Enrolled', 'Young Learners (6-12)', null),
  (pg_temp.u(606), 'Synthetic Student Six', 'abc', 'Prospect', 'Young Learners (6-12)', null),
  (pg_temp.u(608), 'Fixture Sara Alami', null, 'Alumni', 'Adults (18+)', null),
  (pg_temp.u(609), 'alami sara  fixture', null, 'Alumni', 'Adults (18+)', null),
  (pg_temp.u(610), 'TEST Claude fixture', null, 'Prospect', 'Adults (18+)', null),
  (pg_temp.u(611), 'Synthetic Student Eleven', null, 'Enrolled', 'Adults (18+)', 'Recherche Google');

-- Groups: G1 has no teacher (Q22); G2 is closed test data (Q24 only).
insert into public.groups (id, name, niveau, session_type, closed_at) values
  (pg_temp.u(1001), 'Fixture Yearly A', 'Junior 1', 'Yearly', null),
  (pg_temp.u(1002), 'TEST R4 fixture', 'Junior 1', 'Yearly', now() - interval '1 day');

insert into public.enrollments (id, student_id, status, session_type, school_year) values
  (pg_temp.u(701), pg_temp.u(611), 'Confirmed', 'Adults', '2026/2027'),
  (pg_temp.u(702), pg_temp.u(601), 'Confirmed', 'Yearly', '2026/2027');

-- Q16: S1 holds an unlinked commitment and a linked charge for the same programme and year.
insert into public.charges (id, student_id, enrollment_id, session_type, service_description, plan_type, gross_amount, discount_amount, school_year, created_by) values
  (pg_temp.u(801), pg_temp.u(601), null, 'Yearly', 'Synthetic yearly commitment', 'Standard', 3000, 0, '2026/2027', pg_temp.u(1)),
  (pg_temp.u(802), pg_temp.u(601), pg_temp.u(702), 'Yearly', 'Synthetic yearly charge', 'Standard', 3000, 0, '2026/2027', pg_temp.u(1));

-- Q17 and Q24: two live receipts, same learner, amount and day; the third is voided.
insert into public.receipts (id, student_id, receipt_number, date, nom_prenom, montant_total, montant_paye, mode_paiement, voided_at, voided_by, void_reason) values
  (pg_temp.u(901), pg_temp.u(601), 'EH-2026-00459', current_date - 2, 'Synthetic Student One', 3000, 500, 'Espèces', null, null, null),
  (pg_temp.u(902), pg_temp.u(601), 'EH-2026-00460', current_date - 2, 'Synthetic Student One', 3000, 500, 'Espèces', null, null, null),
  (pg_temp.u(903), pg_temp.u(601), 'EH-2026-00461', current_date - 2, 'Synthetic Student One', 3000, 500, 'Espèces', now(), pg_temp.u(1), 'Synthetic void');

-- One resolved submission per lead (first = latest).
insert into public.crm_submissions (id, lead_id, channel, received_at, occurred_at, time_source, core_fields, form_answers, source_label, match_status, resolved_at, payload_hash)
select pg_temp.u(1100 + n), pg_temp.u(200 + n), case when n % 3 = 0 then 'website' when n % 3 = 1 then 'manual' else 'meta_instant_form' end,
  now() - interval '1 day', now() - interval '1 day', 'server', '{}', '[]',
  case when n % 3 = 0 then 'Site web' when n % 3 = 1 then 'Saisie manuelle' else 'Formulaire Meta' end,
  'resolved', now() - interval '1 day', md5('s' || n) || md5('t' || n)
from generate_series(1, 12) n;

-- Leads. Active: L1–L9. L10 LOST, L11 CONVERTED, L12 NEW but merged into L1.
insert into public.crm_leads (id, created_at, contact_id, learner_name, learner_name_normalized, session_type, program_interest_text,
  status, owner_id, qualification_step, closure_reason, closed_at, first_submission_id, latest_submission_id, student_id, enrollment_id,
  converted_at, conversion_activity_id, outreach_cycle, followup_policy_id, merged_into_lead_id)
select pg_temp.u(200 + n), case when n in (7, 8) then now() - interval '20 days' else now() - interval '1 day' end,
  pg_temp.u(100 + c), name, lower(btrim(name)), st, interest, status, owner, step,
  case when n = 10 then 'price' end, case when n = 10 then now() - interval '2 hours' end,
  pg_temp.u(1100 + n), pg_temp.u(1100 + n),
  case when n = 11 then pg_temp.u(611) end, case when n = 11 then pg_temp.u(701) end,
  case when n = 11 then now() - interval '3 hours' end, case when n = 11 then pg_temp.u(450) end,
  1, pg_temp.u(10), case when n = 12 then pg_temp.u(201) end
from (values
  (1, 1, 'Synthetic learner 1', 'Yearly', 'cours anglais', 'NEW', pg_temp.u(2), null),
  (2, 2, 'Synthetic learner 2', 'Yearly', null, 'CONTACTING', null, null),
  (3, 3, 'Synthetic learner 3', 'Yearly', 'cours anglais', 'ENGAGED', pg_temp.u(2), null),
  (4, 3, 'Synthetic learner 4', 'Yearly', null, 'QUALIFIED', pg_temp.u(2), 'placement_test'),
  (5, 5, 'Synthetic learner 5', 'Adults', 'adultes soir', 'QUALIFIED', pg_temp.u(2), 'placement_test'),
  (6, 6, 'Synthetic learner 6', 'Adults', null, 'QUALIFIED', pg_temp.u(2), 'center_visit'),
  (7, 7, 'Synthetic learner 7', null, null, 'ENGAGED', pg_temp.u(2), null),
  (8, 8, 'TEST Claude learner', null, null, 'CONTACTING', pg_temp.u(2), null),
  (9, 9, 'Synthetic learner 9', 'Yearly', null, 'QUALIFIED', pg_temp.u(2), 'placement_test'),
  (10, 10, 'Synthetic learner 10', 'Yearly', null, 'LOST', pg_temp.u(2), null),
  (11, 11, 'Synthetic learner 11', 'Yearly', null, 'CONVERTED', pg_temp.u(2), 'enrollment'),
  (12, 12, 'Synthetic learner 12', 'Yearly', null, 'NEW', null, null)
) v(n, c, name, st, interest, status, owner, step);

-- Placement tests (next Tuesday unless stated).
insert into public.placement_tests (id, student_id, student_name, date_test, heure, niveau_recommande, status, crm_lead_id) values
  (pg_temp.u(504), null, 'Synthetic learner 4', pg_temp.next_tue_date(), '10:30', null, 'Planifié', pg_temp.u(204)),
  (pg_temp.u(505), null, 'Synthetic learner 5', pg_temp.next_tue_date(), '20:00', null, 'Planifié', pg_temp.u(205)),
  (pg_temp.u(509), null, 'Synthetic learner 9', pg_temp.next_tue_date(), '11:00', 'Junior 1', 'Planifié', pg_temp.u(209)),
  (pg_temp.u(510), null, 'Synthetic learner 10', pg_temp.next_tue_date(), '12:00', null, 'Planifié', pg_temp.u(210)),
  (pg_temp.u(520), pg_temp.u(602), 'Synthetic Student Two', pg_temp.next_tue_date(), '09:30', 'Junior 2', 'Passé', null),
  (pg_temp.u(521), null, 'Synthetic walk-in', current_date - 10, '10:00', 'Junior 3', 'Résultat saisi', null);

-- Activities.
insert into public.crm_activities (id, lead_id, occurred_at, actor_id, actor_kind, event_type, channel, outcome, from_status, to_status, body, details, task_id, source_key, outreach_cycle, attempt_ordinal) values
  (pg_temp.u(401), pg_temp.u(202), now() - interval '5 hours', pg_temp.u(2), 'user', 'task_rescheduled', 'phone', null, null, null, null, '{}', null, 'fx:401', null, null),
  (pg_temp.u(402), pg_temp.u(202), now() - interval '4 hours', pg_temp.u(2), 'user', 'task_rescheduled', 'phone', null, null, null, null, '{}', null, 'fx:402', null, null),
  (pg_temp.u(403), pg_temp.u(202), now() - interval '3 hours', pg_temp.u(2), 'user', 'task_cancelled', 'phone', null, null, null, null, '{}', null, 'fx:403', null, null),
  (pg_temp.u(404), pg_temp.u(202), now() - interval '2 hours', pg_temp.u(2), 'user', 'note_added', 'phone', null, null, null, 'Synthetic note A', '{}', null, 'fx:404', null, null),
  (pg_temp.u(405), pg_temp.u(202), now() - interval '2 hours' + interval '30 seconds', pg_temp.u(2), 'user', 'note_added', 'phone', null, null, null, 'Synthetic note A', '{}', null, 'fx:405', null, null),
  (pg_temp.u(450), pg_temp.u(211), now() - interval '3 hours', pg_temp.u(2), 'user', 'lead_converted', 'system', null, 'QUALIFIED', 'CONVERTED', null, '{}', null, 'fx:450', null, null),
  (pg_temp.u(460), pg_temp.u(201), now() - interval '1 hour', pg_temp.u(2), 'user', 'task_completed', 'phone', null, null, null, null, '{}', pg_temp.u(313), 'fx:460', null, null);
insert into public.crm_activities (id, lead_id, occurred_at, actor_id, actor_kind, event_type, channel, outcome, details, source_key, outreach_cycle, attempt_ordinal)
select pg_temp.u(410 + k), pg_temp.u(207), now() - interval '10 days' + k * interval '1 day', pg_temp.u(2), 'user', 'contact_attempted', 'phone',
  'no_answer', '{}', 'fx:41' || k, 1, k
from generate_series(1, 5) k;

-- Tasks.
insert into public.crm_tasks (id, lead_id, task_type, status, assigned_to, due_at, scheduled_end_at, source_kind, source_key, placement_test_id,
  outreach_cycle, attempt_ordinal, policy_id, schedule_kind, completed_at, completed_by, completion_activity_id) values
  (pg_temp.u(301), pg_temp.u(201), 'first_contact', 'open', pg_temp.u(2), pg_temp.next_tue('10:00'), null, 'intake', 'fx:301', null, null, null, null, null, null, null, null),
  (pg_temp.u(302), pg_temp.u(202), 'contact_attempt', 'open', null, pg_temp.prev_tue('09:00'), null, 'attempt_sequence', 'fx:302', null, 1, 1, pg_temp.u(10), null, null, null, null),
  (pg_temp.u(303), pg_temp.u(202), 'callback', 'open', null, pg_temp.prev_tue('14:30'), null, 'manual', 'fx:303', null, null, null, null, 'appointment', null, null, null),
  (pg_temp.u(304), pg_temp.u(202), 'whatsapp_followup', 'open', null, pg_temp.next_tue('21:00'), null, 'manual', 'fx:304', null, null, null, null, 'reminder', null, null, null),
  (pg_temp.u(305), pg_temp.u(203), 'callback', 'open', pg_temp.u(2), pg_temp.next_tue('09:00'), null, 'manual', 'fx:305', null, null, null, null, 'appointment', null, null, null),
  (pg_temp.u(306), pg_temp.u(203), 'callback', 'open', pg_temp.u(2), pg_temp.next_tue('09:00'), null, 'manual', 'fx:306', null, null, null, null, 'appointment', null, null, null),
  (pg_temp.u(307), pg_temp.u(204), 'center_visit', 'open', pg_temp.u(2), pg_temp.next_tue('10:00'), null, 'manual', 'fx:307', pg_temp.u(504), null, null, null, 'appointment', null, null, null),
  (pg_temp.u(308), pg_temp.u(205), 'callback', 'open', pg_temp.u(2), pg_temp.next_tue('16:00'), null, 'manual', 'fx:308', null, null, null, null, 'appointment', null, null, null),
  (pg_temp.u(309), pg_temp.u(206), 'center_visit', 'open', null, pg_temp.next_tue('11:00'), null, 'manual', 'fx:309', null, null, null, null, 'appointment', null, null, null),
  (pg_temp.u(310), pg_temp.u(206), 'center_visit', 'open', null, pg_temp.next_tue('15:00'), null, 'manual', 'fx:310', null, null, null, null, 'appointment', null, null, null),
  (pg_temp.u(311), pg_temp.u(210), 'callback', 'open', pg_temp.u(2), pg_temp.next_tue('17:00'), null, 'manual', 'fx:311', null, null, null, null, 'appointment', null, null, null),
  (pg_temp.u(312), pg_temp.u(212), 'first_contact', 'open', null, pg_temp.next_tue('12:00'), null, 'intake', 'fx:312', null, null, null, null, null, null, null, null),
  (pg_temp.u(313), pg_temp.u(201), 'callback', 'completed', pg_temp.u(2), pg_temp.next_tue('10:00') + interval '1 day', null, 'manual', 'fx:313', null, null, null, null, 'appointment', now() - interval '1 hour', pg_temp.u(2), pg_temp.u(460));

-- Q10: one future attendance row.
insert into public.attendance (id, student_id, group_id, session_date, status) values
  (pg_temp.u(1201), pg_temp.u(601), pg_temp.u(1001), current_date + 3, 'Présent');
