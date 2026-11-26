// Clean-up for browser suites that take payments (RWR-r5 PR C1): removes the synthetic staff
// of a run and everything they created — prospects as in removeStaff (crm-next-action-local.mjs),
// plus « Réserver sans paiement » reservations, CRM revenue entries, receipts, charges,
// enrollments and the learners of their prospects and payments — so the next suite starts
// from a clean policy and finance baseline. Local stack only; the same test switches as
// test-crm-rcc-a2-browser.mjs (receipt_test_cleanup, enrollment_command, membership_sync).
import { q, sql } from './crm-next-action-local.mjs';

export function learnersOf(ids) {
  if (!ids.length) return [];
  const list = ids.map(q).join(',');
  return JSON.parse(sql(`select coalesce(json_agg(distinct s),'[]') from (
    select student_id s from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${list}))
    union select student_id from public.charges where created_by in(${list})
    union select student_id from public.receipts where actor_id in(${list})
    union select student_id from public.crm_charge_reservations where created_by in(${list})) x where s is not null`));
}

export function removeStaffAndPayments(ids, extraStudents = []) {
  if (!ids.length) return;
  const list = ids.map(q).join(','), mine = `select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${list}))`;
  const students = [...new Set([...learnersOf(ids), ...extraStudents])].map(q).join(',') || 'null';
  sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks,public.crm_revenue_entries,public.crm_charge_reservations in access exclusive mode;
 alter table public.crm_charge_reservations disable trigger crm_charge_reservations_append_only;delete from public.crm_charge_reservations where created_by in(${list}) or student_id in(${students}) or lead_id in(${mine});alter table public.crm_charge_reservations enable trigger crm_charge_reservations_append_only;
 alter table public.crm_revenue_entries disable trigger crm_revenue_immutable;delete from public.crm_revenue_entries where lead_id in(${mine}) or charge_id in(select id from public.charges where student_id in(${students}));alter table public.crm_revenue_entries enable trigger crm_revenue_immutable;
 alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;alter table public.placement_tests disable trigger crm_placement_integrity;
 -- One statement: a converted prospect references its conversion activity and activities reference
 -- tests; the foreign keys are checked at the end of the statement.
 with t as(delete from public.crm_tasks where lead_id in(${mine}) returning id),a as(delete from public.crm_activities where lead_id in(${mine}) or actor_id in(${list}) returning id),p as(delete from public.placement_tests where crm_lead_id in(${mine}) returning id),s as(delete from public.crm_submissions where resolved_by in(${list}) returning id),l as(delete from public.crm_leads where id in(${mine}) returning id) select count(*) from l;
 delete from public.crm_contacts where created_by in(${list});delete from public.crm_command_requests where actor_scope in(${list});delete from public.crm_followup_policies where created_by in(${list});
 set constraints all immediate;
 alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;alter table public.placement_tests enable trigger crm_placement_integrity;
 set local english_hills.receipt_test_cleanup = 'on';delete from public.financial_events where actor_id in(${list}) or charge_id in(select id from public.charges where student_id in(${students}));delete from public.financial_requests where actor_id in(${list});
 delete from public.receipts where student_id in(${students}) or actor_id in(${list});delete from public.charge_discount_reasons where charge_id in(select id from public.charges where student_id in(${students}));delete from public.charges where student_id in(${students});
 set local eh.enrollment_command = on;set local eh.membership_sync = on;delete from public.enrollments where student_id in(${students});delete from public.students where id in(${students});
 alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${list});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;
 delete from public.activity_log where actor_id in(${list}) or target_id in(${list});delete from public.rate_limits where user_id in(${list});commit;`);
}
