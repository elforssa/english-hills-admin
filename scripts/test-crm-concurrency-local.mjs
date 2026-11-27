// RWR-r5 §9 concurrency on the local stack: two sessions on one prospect.
// A saves, B saves stale → PT409 and nothing changes; parallel distinct keys → one
// wins; the same key twice → one row and the replayed result; a retry after commit
// replays. Synthetic committed fixtures with a private id prefix.
import assert from 'node:assert/strict';
import { sql, sqlAsync, q, actor, staffSetup, createLead, LIVE_POLICY } from './lib/crm-next-action-local.mjs';

const staff = staffSetup('a9000000');
sql(`begin;${actor(staff.director)}select public.crm_create_followup_policy(gen_random_uuid(),${q(JSON.stringify(LIVE_POLICY))}::jsonb);commit;`);
const SET = "set local lock_timeout='5s';set local statement_timeout='15s';";
const state = lead => JSON.parse(sql(`select jsonb_build_object('version',version,'action',crm_security.next_action_id(id),
 'open',(select count(*) from public.crm_tasks where lead_id=l.id and status='open'),
 'attempts',(select count(*) from public.crm_activities where lead_id=l.id and event_type='contact_attempted')) from public.crm_leads l where id=${q(lead)}`));
const call = (cmd, key, data, hold = 0) => sqlAsync(`\\set VERBOSITY verbose
begin;${SET}${actor(staff.receptionist)}select public.crm_${cmd}(${q(key)},${q(JSON.stringify(data))}::jsonb);${hold ? `select pg_sleep(${hold});` : ''}commit;`);
const sqlstate = r => (r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/) || [])[1];

// 1. Stale second tab: A holds its transaction; B waits, then is refused with PT409.
{
  const lead = createLead(staff.receptionist, 'Race stale');
  const before = state(lead);
  const change = task => ({ lead_id: lead, expected_version: before.version, expected_action_id: before.action, next: { task_type: task, due_preset: 'tomorrow' } });
  const a = call('change_next_action', crypto.randomUUID(), change('callback'), 0.6);
  await new Promise(r => setTimeout(r, 150));
  const b = call('change_next_action', crypto.randomUUID(), change('whatsapp_followup'));
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.status, 0, ra.stderr);
  assert.notEqual(rb.status, 0, 'stale save must fail');
  assert.equal(sqlstate(rb), 'PT409', rb.stderr);
  const after = state(lead);
  assert.equal(after.open, 1);
  assert.equal(sql(`select task_type from public.crm_tasks where id=${q(after.action)}`), 'callback', 'B changed nothing');
  console.log('PASS stale second tab refused with PT409, no row changed');
}

// 2. Parallel distinct keys on one prospect: exactly one wins.
{
  const lead = createLead(staff.receptionist, 'Race distinct');
  const before = state(lead);
  const data = { lead_id: lead, expected_version: before.version, channel: 'phone', result: 'no_answer' };
  const results = await Promise.all([call('log_exchange', crypto.randomUUID(), data), call('log_exchange', crypto.randomUUID(), data)]);
  assert.equal(results.filter(r => r.status === 0).length, 1, results.map(r => r.stderr).join('\n'));
  assert.equal(sqlstate(results.find(r => r.status !== 0)), 'PT409');
  const after = state(lead);
  assert.equal(after.attempts, 1); assert.equal(after.open, 1);
  console.log('PASS parallel distinct keys: one wins, one PT409, one attempt');
}

// 3. The same key twice at once (double tap): one row, the same replayed result.
{
  const lead = createLead(staff.receptionist, 'Race same key');
  const before = state(lead);
  const key = crypto.randomUUID();
  const data = { lead_id: lead, expected_version: before.version, channel: 'phone', result: 'no_answer' };
  const results = await Promise.all([call('log_exchange', key, data), call('log_exchange', key, data)]);
  assert.ok(results.every(r => r.status === 0), results.map(r => r.stderr).join('\n'));
  assert.equal(results[0].stdout.split('\n').pop(), results[1].stdout.split('\n').pop(), 'replayed result is identical');
  assert.equal(state(lead).attempts, 1);
  // 4. A network retry after commit replays the first result.
  const retry = await call('log_exchange', key, data);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(retry.stdout.split('\n').pop(), results[0].stdout.split('\n').pop());
  assert.equal(state(lead).attempts, 1);
  console.log('PASS same key twice and retry after commit: one attempt, replayed result');
}

// 5. Booking races on one student: two prospects, overlapping appointments → one wins.
{
  const a = createLead(staff.receptionist, 'Race student A');
  const b = createLead(staff.receptionist, 'Race student B');
  const student = sql(`insert into public.students(id,full_name,status,session_type) values(gen_random_uuid(),'Race learner','Enrolled','Mise à niveau') returning id`).split('\n').pop();
  sql(`update public.crm_leads set student_id=${q(student)} where id in (${q(a)},${q(b)})`);
  const slot = sql(`select crm_security.window_at(crm_security.current_policy_id(),'opening',(((now() at time zone public.centre_utc_offset())::date+5)::timestamp+time '11:00') at time zone public.centre_utc_offset())`);
  // Booked through the exchange that qualifies (OD-11; « Changer » refuses a first appointment).
  const visit = lead => { const s = state(lead); return { lead_id: lead, expected_version: s.version, channel: 'phone', result: 'spoke', next: { task_type: 'center_visit', due_at: slot } }; };
  const results = await Promise.all([call('log_exchange', crypto.randomUUID(), visit(a), 0.4), call('log_exchange', crypto.randomUUID(), visit(b), 0.4)]);
  assert.equal(results.filter(r => r.status === 0).length, 1, results.map(r => r.stderr).join('\n'));
  assert.match(results.find(r => r.status !== 0).stderr, /overlaps/);
  console.log('PASS overlapping appointments for one student: one wins under the student lock');
}

// 6. CPO-r2 « Je m'en occupe »: two people take the same unowned prospect at the same moment.
//    The take is crm_reassign with the version on screen and the caller as owner: one wins, the
//    other is refused with PT409, and the prospect has one owner, one action and one history line.
{
  const lead = createLead(staff.receptionist, 'Race take');
  sql(`update public.crm_tasks set assigned_to=null where lead_id=${q(lead)} and status='open';update public.crm_leads set owner_id=null,version=version+1 where id=${q(lead)};`);
  const before = state(lead);
  const take = who => sqlAsync(`\\set VERBOSITY verbose
begin;${SET}${actor(who)}select public.crm_reassign(${q(crypto.randomUUID())},${q(JSON.stringify({ lead_id: lead, expected_version: before.version, owner_id: who }))}::jsonb);select pg_sleep(0.4);commit;`);
  const results = await Promise.all([take(staff.receptionist), take(staff.director)]);
  assert.equal(results.filter(r => r.status === 0).length, 1, results.map(r => r.stderr).join('\n'));
  assert.equal(sqlstate(results.find(r => r.status !== 0)), 'PT409');
  const winner = results[0].status === 0 ? staff.receptionist : staff.director;
  const after = JSON.parse(sql(`select jsonb_build_object('owner',l.owner_id,'holder',(select assigned_to from public.crm_tasks t where t.lead_id=l.id and t.status='open'),
   'open',(select count(*) from public.crm_tasks t where t.lead_id=l.id and t.status='open'),
   'changes',(select count(*) from public.crm_activities a where a.lead_id=l.id and a.event_type='lead_reassigned'),'version',l.version) from public.crm_leads l where id=${q(lead)}`));
  assert.deepEqual([after.owner, after.holder, after.open, after.changes, after.version], [winner, winner, 1, 1, before.version + 1]);
  // A screen that still shows the old version can never take it from the winner.
  const late = await take(winner === staff.director ? staff.receptionist : staff.director);
  assert.equal(sqlstate(late), 'PT409', late.stderr);
  assert.equal(sql(`select owner_id from public.crm_leads where id=${q(lead)}`), winner);
  console.log('PASS two simultaneous takes: one owner, one PT409, one action, one history line; a stale screen cannot take over');
}
