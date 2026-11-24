// The 10k opportunities fixture of test-crm-opportunities.sql, for runs that COMMIT it at the
// current migration (the browser read budget). Since M-A2 (137) a committed planned test of an
// active prospect must belong to its open appointment, so the fixture's 120 direct « Planifié »
// rows are booked through the real path instead: « Changer » to a visit « avec test de niveau »
// tomorrow from 10:00 (one minute apart), which creates each test with its appointment.
// The SQL file itself stays as is: it is rollback-only and also loads at migration 106.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DIRECT_TESTS = "insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id) select 'O3 learner '||i,current_date+1,'10:00','Planifié',lead from fixture where i between 7001 and 7120;";

export function committedOpportunitiesFixture() {
  let load = readFileSync('scripts/test-crm-opportunities.sql', 'utf8');
  load = load.slice(load.indexOf('begin;'), load.indexOf('do $$ declare r jsonb;'));
  assert(load.includes(DIRECT_TESTS), 'the 10k fixture still inserts its 120 planned tests directly');
  return load.replace(DIRECT_TESTS, `do $o3$ declare r record; begin
 for r in select f.i,f.lead from fixture f where f.i between 7001 and 7120 order by f.i loop
  perform public.crm_change_next_action(gen_random_uuid(),jsonb_build_object('lead_id',r.lead,
   'expected_version',(select version from public.crm_leads where id=r.lead),'expected_action_id',crm_security.next_action_id(r.lead),
   'next',jsonb_build_object('task_type','center_visit','with_test',true,'due_at',crm_security.window_at(crm_security.current_policy_id(),'opening',
    (((now() at time zone public.centre_utc_offset())::date+1)::timestamp+time '10:00'+make_interval(mins=>r.i-7001)) at time zone public.centre_utc_offset()))));
 end loop;
end $o3$;`);
}
