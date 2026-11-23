// RWR-r5 §9 time travel on the local stack. Prospects are aged with the test-only
// scripts/lib/age-crm-fixture.sql (no clock override exists in application code) to
// « lendemain 09:00 » and « fin de journée »; « En attente » is aged by days. System-made
// times are computed from the real clock, so they are checked at the boundary instants
// (« fin de journée », « samedi », « dimanche », a closed date) through the scheduling
// functions themselves. Asserts buckets, « En attente » never overdue, system times
// inside hours and never on a closed date, agreed times never moved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sql, q, actor, staffSetup, createLead, LIVE_POLICY } from './lib/crm-next-action-local.mjs';

const OFFSET = 'public.centre_utc_offset()';
const staff = staffSetup('aa000000');
const fixture = readFileSync('scripts/lib/age-crm-fixture.sql', 'utf8').replace('\\set ON_ERROR_STOP on', '');
const age = (lead, minutes) => sql(fixture.replaceAll(":'lead'", q(lead)).replaceAll(":'delta'", q(`${minutes} minutes`)));
const last = out => out.split('\n').filter(Boolean).pop();
const run = (cmd, lead, payload) => JSON.parse(last(sql(`begin;${actor(staff.receptionist)}
 select public.crm_${cmd}(gen_random_uuid(),jsonb_build_object('lead_id',${q(lead)}::uuid,'expected_version',(select version from public.crm_leads where id=${q(lead)}))||${q(JSON.stringify(payload))}::jsonb);commit;`)));
const action = lead => JSON.parse(sql(`select coalesce(to_jsonb(t),'null') from public.crm_tasks t where t.id=crm_security.next_action_id(${q(lead)})`));
const bucket = lead => last(sql(`begin;${actor(staff.receptionist)}
 select string_agg(b,',') from unnest(array['overdue','today','tomorrow','upcoming','awaiting']) b
 where exists(select 1 from jsonb_array_elements(public.crm_get_work_queue(p_bucket=>b,p_assignee_mode=>'all',p_owner_mode=>'staff',p_owner=>${q(staff.receptionist)}::uuid,p_limit=>50)->'rows') x where x->>'lead_id'=${q(lead)});commit;`));
// Local wall time `days` from today as a timestamptz expression.
const local = (days, hhmm) => `(((now() at time zone ${OFFSET})::date+${days})+time ${q(hhmm)}) at time zone ${OFFSET}`;
const minutesUntil = expr => Number(sql(`select ceil(extract(epoch from (${expr})-now())/60)::int`));
const daysToIsodow = dow => Number(sql(`select min(d) from generate_series(1,7) d where extract(isodow from (now() at time zone ${OFFSET})::date+d)=${dow}`));
const localDate = ts => sql(`select (${q(ts)}::timestamptz at time zone ${OFFSET})::date::text`);
const insideCalling = ts => sql(`select crm_security.window_at(crm_security.current_policy_id(),'calling',${q(ts)}::timestamptz)=${q(ts)}::timestamptz`) === 't';

// The run's policy: live hours plus a closed date (a weekday three to nine days ahead).
const closedIn = [3, 4, 5, 6, 7, 8, 9].find(d => Number(sql(`select extract(isodow from (now() at time zone ${OFFSET})::date+${d})`)) <= 5);
const closed = sql(`select ((now() at time zone ${OFFSET})::date+${closedIn})::text`);
sql(`begin;${actor(staff.director)}select public.crm_create_followup_policy(gen_random_uuid(),${q(JSON.stringify({ ...LIVE_POLICY, date_exceptions: [closed] }))}::jsonb);commit;`);
// Later suites in the same shard must not inherit the closed date: publish the live hours again on exit.
process.on('exit', () => sql(`begin;${actor(staff.director)}select public.crm_create_followup_policy(gen_random_uuid(),${q(JSON.stringify(LIVE_POLICY))}::jsonb);commit;`));

// 1. Agreed callback: aged so the clock sits « la veille », « le jour même » and « après l'heure ».
// The buckets use the real local day boundaries (d1 = tomorrow 00:00, d2 = the day after),
// so each step moves the callback to a position relative to those boundaries.
{
  const lead = createLead(staff.receptionist, 'Travel agreed');
  const due = sql(`select crm_security.window_at(crm_security.current_policy_id(),'calling',${local(2, '16:00')})`);
  run('log_exchange', lead, { channel: 'phone', result: 'spoke', next: { task_type: 'callback', schedule_kind: 'appointment', due_at: due } });
  const before = action(lead);
  assert.equal(new Date(before.due_at).getTime(), new Date(due).getTime(), 'agreed time stored as given');
  assert.equal(bucket(lead), 'upcoming');
  const [d1, d2] = sql(`select ${local(1, '00:00')}, ${local(2, '00:00')}`).split('|').map(v => new Date(v));
  const moveTo = target => age(lead, Math.round((new Date(action(lead).due_at) - target) / 60000));
  const now = () => new Date(sql('select now()'));
  moveTo(new Date((d1.getTime() + d2.getTime()) / 2));
  assert.equal(bucket(lead), 'tomorrow', '« la veille »: the agreed callback is tomorrow');
  const sameDay = new Date((now().getTime() + d1.getTime()) / 2);
  if (d1 - now() > 5 * 60000) { moveTo(sameDay); assert.equal(bucket(lead), 'today', '« le jour même »: the callback is today'); }
  moveTo(new Date(now().getTime() - 60 * 60000));
  assert.equal(bucket(lead), 'overdue', '« après l\'heure »: a missed agreed callback is overdue');
  const shifted = action(lead);
  assert.equal(shifted.id, before.id, 'same action throughout');
  assert.equal(new Date(before.due_at) - new Date(before.created_at), new Date(shifted.due_at) - new Date(shifted.created_at), 'agreed time never moved relative to its creation');
  console.log('PASS agreed callback: upcoming → tomorrow → today → overdue, same action, time unchanged');
}

// 2. « En attente » (OD-5 five-day relance) is never overdue; « à relancer » once its date has passed.
{
  const lead = createLead(staff.receptionist, 'Travel awaiting');
  run('change_next_action', lead, { expected_action_id: action(lead).id, next: { task_type: 'awaiting_prospect' } });
  const check = () => JSON.parse(last(sql(`begin;${actor(staff.receptionist)}select public.crm_check_action(${q(lead)});commit;`)));
  assert.equal(check().next_action.relance_due, false);
  for (const days of [1, 4, 3]) { // total 8 days: before, on and after the relance date
    age(lead, days * 24 * 60);
    assert.equal(bucket(lead), 'awaiting', `« En attente » stays out of « En retard » (aged ${days} more days)`);
    assert.equal(check().next_action.overdue, false);
  }
  assert.equal(check().next_action.relance_due, true, 'relance date reached: « à relancer »');
  const today = JSON.parse(last(sql(`begin;${actor(staff.receptionist)}select public.crm_get_today(50);commit;`)));
  assert.ok(!today.needs_attention.some(c => c.id === lead && c.priority === 1), '« Aujourd\'hui » never ranks it as overdue');
  console.log('PASS « En attente » never overdue; « à relancer » once its date has passed');
}

// 3. System-made times at the boundary instants: next attempt, post-test follow-up and an hours-snapped preset.
{
  const sat = daysToIsodow(6); const sun = daysToIsodow(7);
  const instants = [
    ['fin de journée 20:30', local(0, '20:30')],
    ['samedi 19:30', local(sat, '19:30')],
    ['dimanche 11:00', local(sun, '11:00')],
    ['veille du jour fermé 19:45', local(closedIn - 1, '19:45')],
    ['jour fermé 10:00', local(closedIn, '10:00')],
  ];
  for (const [label, at] of instants) {
    const [attempt, followup, snapped] = sql(`select crm_security.attempt_due(crm_security.current_policy_id(),(${at} at time zone ${OFFSET})::date,2,${at},${at}),
      crm_security.placement_followup_due(crm_security.current_policy_id(),${at}),
      crm_security.next_window(crm_security.current_policy_id(),${at})`).split('|');
    for (const [kind, ts] of [['next attempt', attempt], ['post-test follow-up', followup], ['snapped', snapped]]) {
      assert.ok(insideCalling(ts), `${label}: ${kind} ${ts} inside calling hours`);
      assert.notEqual(localDate(ts), closed, `${label}: ${kind} never on the closed date`);
      assert.notEqual(Number(sql(`select extract(isodow from ${q(ts)}::timestamptz at time zone ${OFFSET})`)), 7, `${label}: ${kind} never on Sunday`);
      assert.ok(new Date(ts) >= new Date(sql(`select ${at}`)), `${label}: ${kind} not before the instant`);
    }
  }
  console.log('PASS system-made times at end of day, Saturday, Sunday and around a closed date: inside hours, never closed');
}

// 4. A real failed call now: the system slot is inside hours and not on the closed date; an agreed time on the closed date is refused.
{
  const lead = createLead(staff.receptionist, 'Travel failed call');
  const result = run('log_exchange', lead, { channel: 'phone', result: 'no_answer' });
  const next = action(lead);
  assert.ok(next.due_at === null || insideCalling(next.due_at));
  if (next.due_at) assert.notEqual(localDate(next.due_at), closed);
  assert.equal(result.failed_attempts ?? 1, 1);
  const onClosed = sql(`select ${local(closedIn, '16:00')}`);
  let refused = '';
  try { run('change_next_action', lead, { expected_action_id: next.id, next: { task_type: 'callback', schedule_kind: 'appointment', due_at: onClosed } }); } catch (e) { refused = e.stderr; }
  assert.match(refused, /outside calling hours/, 'an agreed callback on a closed date is refused, never moved');
  run('change_next_action', lead, { expected_action_id: next.id, next: { task_type: 'callback', due_at: onClosed } });
  const reminder = action(lead);
  assert.notEqual(reminder.schedule_kind, 'appointment');
  assert.ok(insideCalling(reminder.due_at) && localDate(reminder.due_at) > closed, 'a reminder on a closed date moves to the next open window');
  console.log('PASS failed call now: system slot inside hours; on a closed date an agreed time is refused and a reminder moves');
}
