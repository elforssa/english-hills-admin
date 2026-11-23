// RWR-r5 PR A1: the next-action commands and reads over HTTP (GoTrue sign-in + PostgREST) on the
// local stack, as real signed-in staff. It proves what the SQL suites cannot: the role boundary
// at the HTTP edge, the PT409 → 409 and 22023 → 400 transport, request-key replay over the
// wire, and invariants 1, 2, 8 and 10 after each HTTP command. Synthetic data, removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, removeStaff, signIn, slotAt, sql } from './lib/crm-next-action-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), base = env.NEXT_PUBLIC_SUPABASE_URL, run = 'na-http-' + randomUUID();
let users = [];
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

async function call(token, name, body) {
  const headers = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const command = (token, name, data, key = randomUUID()) => call(token, name, { p_request_key: key, p_data: data });
const version = lead => Number(sql(`select version from public.crm_leads where id=${q(lead)}`));
const openActions = lead => Number(sql(`select count(*) from public.crm_tasks where lead_id=${q(lead)} and status='open'`));
const activities = lead => Number(sql(`select count(*) from public.crm_activities where lead_id=${q(lead)}`));
const nextAction = lead => JSON.parse(sql(`select to_json(t) from public.crm_tasks t where lead_id=${q(lead)} and status='open'`) || 'null');
// Invariants 1, 8 and 10 for one prospect, after every HTTP command.
function invariants(lead, label) {
  const status = sql(`select status from public.crm_leads where id=${q(lead)}`);
  const active = ['NEW', 'CONTACTING', 'ENGAGED', 'QUALIFIED'].includes(status);
  eq(openActions(lead), active ? 1 : 0, `${label}: invariant 1/2 — ${active ? 'exactly one' : 'no'} open action (${status})`);
  eq(sql(`select count(*) from (select command_key from public.crm_activities where lead_id=${q(lead)} and command_key is not null group by command_key having count(*) filter(where is_primary)<>1) x`), '0', `${label}: invariant 8 — one primary row per command`);
  eq(sql(`select count(*) from public.crm_tasks where lead_id=${q(lead)} and status='open' and assigned_to is null`), '0', `${label}: invariant 10 — every open action has an owner`);
}

// Earlier suites in the same CI step leave their own policies (the CRM concurrency scripts);
// this suite publishes a newer version and removes only its own rows.
const policiesBefore = sql('select count(*) from public.crm_followup_policies');
try {
  users = await createStaff(env, run, ['director', 'receptionist', 'receptionist', 'teacher']);
  const [director, reception, colleague, teacher] = users;
  const tokens = Object.fromEntries(await Promise.all([['director', director], ['reception', reception], ['colleague', colleague], ['teacher', teacher]].map(async ([k, u]) => [k, await signIn(env, u)])));

  // The director publishes the hours over HTTP; reads follow the published version (§4.5).
  const policy = await command(tokens.director, 'crm_create_followup_policy', LIVE_POLICY);
  eq(policy.status, 200, 'director publishes the centre hours over HTTP');
  const hours = await call(tokens.reception, 'crm_get_centre_hours', {});
  eq(hours.status, 200, 'crm_get_centre_hours: receptionist reads');
  eq(hours.body.calling_hours['2'], LIVE_POLICY.weekly_hours['2'], 'calling hours are the published version');
  eq(hours.body.opening_hours['2'], LIVE_POLICY.opening_hours['2'], 'opening hours are the published version');

  // Role boundary at the HTTP edge.
  const created = await command(tokens.reception, 'crm_create_manual_lead', { display_name: 'HTTP prospect', learner_name: 'Apprenant synthétique', email: `${run}@example.invalid`, source_label: 'Manuel · Téléphone' });
  eq(created.status, 200, 'receptionist creates a prospect');
  const lead = created.body.lead.id;
  eq(created.body.lead.owner_id, reception.id, '§4.6: a manual prospect is owned by its creator');
  ok(nextAction(lead)?.id, 'the created prospect has its first action');
  invariants(lead, 'create');
  for (const [name, data] of [['crm_log_exchange', { lead_id: lead, expected_version: version(lead), channel: 'phone', result: 'no_answer' }], ['crm_change_next_action', { lead_id: lead, expected_version: version(lead) }], ['crm_close_prospect', { lead_id: lead, expected_version: version(lead) }]]) {
    const anon = await command(null, name, data);
    ok([401, 403].includes(anon.status) && anon.body.code === '42501', `${name}: anonymous refused (${anon.status} ${anon.body.code})`);
    const denied = await command(tokens.teacher, name, data);
    eq([denied.status, denied.body.code], [403, '42501'], `${name}: a teacher is refused`);
  }
  for (const [name, body] of [['crm_get_centre_hours', {}], ['crm_check_action', { p_lead: lead }]]) {
    const denied = await call(tokens.teacher, name, body);
    eq([denied.status, denied.body.code], [403, '42501'], `${name}: a teacher is refused`);
  }
  invariants(lead, 'refused calls');

  // Pre-form check (invariant 15's read).
  const check = await call(tokens.reception, 'crm_check_action', { p_lead: lead });
  eq(check.status, 200, 'crm_check_action: receptionist reads');
  eq(check.body.next_action.id, nextAction(lead).id, 'the pre-check reads the same action');

  // One-tap « Pas de réponse » over HTTP; the same key replays the first result.
  const key = randomUUID(), payload = { lead_id: lead, expected_version: version(lead), channel: 'phone', result: 'no_answer' };
  const before = activities(lead);
  const first = await command(tokens.reception, 'crm_log_exchange', payload, key);
  eq(first.status, 200, 'no_answer saved');
  eq(first.body.next_action?.id, nextAction(lead).id, '§4.3: a command returns the lead and its single next action');
  const attempts = () => sql(`select count(*) from public.crm_activities where lead_id=${q(lead)} and event_type='call_no_answer'`);
  eq(attempts(), '1', 'one attempt row');
  const replay = await command(tokens.reception, 'crm_log_exchange', payload, key);
  eq(replay.status, 200, 'network retry after commit: replayed');
  eq(replay.body, first.body, 'the replay returns the first result byte for byte');
  eq(attempts(), '1', 'the replay records no second attempt');
  invariants(lead, 'no_answer + replay');

  // Stale version over HTTP: 409 with PT409, nothing written (ADR-009).
  const written = activities(lead);
  const stale = await command(tokens.colleague, 'crm_log_exchange', payload);
  eq([stale.status, stale.body.code], [409, 'PT409'], 'a stale version is HTTP 409 / PT409');
  eq(activities(lead), written, 'the stale write changed nothing');
  ok(activities(lead) > before, 'the first write was recorded');

  // An agreed time outside the calling hours is refused with its hint (§4.4), nothing written.
  const night = sql(`select to_json((((now() at time zone public.centre_utc_offset())::date+3)::timestamp+time '03:00') at time zone public.centre_utc_offset())#>>'{}'`);
  const outside = await command(tokens.reception, 'crm_log_exchange', { lead_id: lead, expected_version: version(lead), channel: 'phone', result: 'spoke', next: { task_type: 'callback', schedule_kind: 'appointment', due_at: night } });
  eq([outside.status, outside.body.code, outside.body.hint], [400, '22023', 'crm_hours.outside_calling'], 'an agreed callback at 03:00 is refused (400, hint)');
  eq(activities(lead), written, 'the refused exchange changed nothing');

  // « On a parlé » + appointment with test → QUALIFIED, one appointment carrying the test (§4.2, OD-11).
  const visit = slotAt('opening', 6, '16:00');
  const spoke = await command(tokens.reception, 'crm_log_exchange', { lead_id: lead, expected_version: version(lead), channel: 'phone', result: 'spoke', next: { task_type: 'center_visit', due_at: visit, with_test: true } });
  eq(spoke.status, 200, 'spoke + appointment with test saved');
  eq(spoke.body.lead.status, 'QUALIFIED', 'OD-11: qualification is implied');
  const appointment = nextAction(lead);
  eq([appointment.task_type, !!appointment.placement_test_id], ['center_visit', true], 'one appointment action carrying its planned test');
  eq(sql(`select status from public.placement_tests where id=${q(appointment.placement_test_id)}`), 'Planifié', 'the test is planned');
  invariants(lead, 'spoke + appointment');

  // « Changer » with an action the user did not see: 409; replacing the appointment needs « Remplace ».
  const unseen = await command(tokens.reception, 'crm_change_next_action', { lead_id: lead, expected_version: version(lead), expected_action_id: randomUUID(), next: { task_type: 'callback', due_preset: 'tomorrow' } });
  eq([unseen.status, unseen.body.code], [409, 'PT409'], 'an unseen action is a conflict');
  const noToken = await command(tokens.reception, 'crm_change_next_action', { lead_id: lead, expected_version: version(lead), expected_action_id: appointment.id, next: { task_type: 'callback', due_preset: 'tomorrow' } });
  eq([noToken.status, noToken.body.hint], [400, 'crm_next_action.replace_confirmation'], 'OD-18 A: an appointment is replaced only with the confirmation');
  invariants(lead, 'refused changes');

  // An appointment outcome before its start is refused (invariant 5).
  const early = await command(tokens.reception, 'crm_record_appointment_outcome', { lead_id: lead, expected_version: version(lead), action_id: appointment.id, outcome_code: 'no_show' });
  eq([early.status, early.body.hint], [400, 'crm_appointment.before_start'], 'no outcome before the appointment starts');

  // Close: no action and no planned test remain (invariant 2); reopen needs a next action.
  const close = await command(tokens.reception, 'crm_close_prospect', { lead_id: lead, expected_version: version(lead), status: 'LOST', reason: 'not_interested' });
  eq([close.status, close.body.lead.status], [200, 'LOST'], 'closed over HTTP');
  eq(sql(`select count(*) from public.placement_tests where crm_lead_id=${q(lead)} and status='Planifié'`), '0', 'invariant 2: no planned test on a closed prospect');
  invariants(lead, 'close');
  const bare = await command(tokens.reception, 'crm_reopen_prospect', { lead_id: lead, expected_version: version(lead), reason: 'Revient' });
  eq(bare.status, 400, 'reopen without a next action is refused');
  const reopen = await command(tokens.reception, 'crm_reopen_prospect', { lead_id: lead, expected_version: version(lead), reason: 'Revient', next: { task_type: 'awaiting_prospect' } });
  eq(reopen.status, 200, 'reopen with « En attente »');
  eq(nextAction(lead).task_type, 'awaiting_prospect', 'the reopened prospect waits, with no date forced');
  invariants(lead, 'reopen');

  // An old wrapper over HTTP still leaves one action (old browser tabs, §4.3).
  const legacy = await command(tokens.reception, 'crm_schedule_task', { lead_id: lead, expected_version: version(lead), task: { task_type: 'callback', due_preset: 'tomorrow' } });
  eq(legacy.status, 200, 'old crm_schedule_task still callable before M-A2');
  invariants(lead, 'old wrapper');

  // §4.2/§4.8: an inbound call created with its first exchange — one transaction, QUALIFIED with
  // the appointment and its test, « Premier contact » never scheduled, one history entry.
  const visitAt = slotAt('opening', 9, '11:00');
  const firstKey = randomUUID();
  const firstData = { display_name: 'HTTP appel entrant', learner_name: 'Apprenant synthétique', email: `in-${run}@example.invalid`, source_label: 'Manuel · Téléphone', first_exchange: { channel: 'phone', next: { task_type: 'center_visit', due_at: visitAt, with_test: true } } };
  const inbound = await command(tokens.reception, 'crm_create_manual_lead', firstData, firstKey);
  eq(inbound.status, 200, 'create with a first exchange');
  const inboundLead = inbound.body.lead.id;
  eq(inbound.body.lead.status, 'QUALIFIED', 'OD-11: the agreed appointment with a test qualifies the new prospect');
  eq(inbound.body.next_action?.task_type, 'center_visit', 'the result carries the exchange’s next action');
  eq(sql(`select count(*) from public.crm_tasks where lead_id=${q(inboundLead)} and task_type='first_contact'`), '0', '« Premier contact » is never scheduled for an inbound call');
  eq(sql(`select status from public.placement_tests where id=(select placement_test_id from public.crm_tasks where lead_id=${q(inboundLead)} and status='open')`), 'Planifié', 'the test is booked with the appointment');
  eq(sql(`select count(*) from public.crm_activities where lead_id=${q(inboundLead)} and is_primary`), '1', '§4.7: one history entry for create and exchange');
  eq(sql(`select count(*) from public.crm_submissions where lead_id=${q(inboundLead)} and core_fields ? 'first_exchange'`), '0', 'the acquisition snapshot keeps the contact fields only');
  invariants(inboundLead, 'create with first exchange');
  const inboundReplay = await command(tokens.reception, 'crm_create_manual_lead', firstData, firstKey);
  eq(inboundReplay.body.lead.id, inboundLead, 'replaying the create returns the same prospect');
  eq(sql(`select count(*) from public.crm_leads where id in (select lead_id from public.crm_submissions where core_fields->>'display_name'='HTTP appel entrant')`), '1', 'the replay creates nothing');
  const walkIn = await command(tokens.reception, 'crm_create_manual_lead', { display_name: 'HTTP visite', learner_name: 'Apprenant synthétique', source_label: 'Manuel · Visite au centre', first_exchange: { channel: 'in_person', next: { task_type: 'awaiting_prospect' } } });
  eq([walkIn.status, walkIn.body.lead.status, walkIn.body.next_action?.task_type], [200, 'ENGAGED', 'awaiting_prospect'], 'a walk-in « reviendra » waits, with no date chosen');
  invariants(walkIn.body.lead.id, 'walk-in');
  // Review Important 2 (§4.8 observation 5): a walk-in is never created without its in-person exchange.
  for (const first_exchange of [undefined, { channel: 'phone', next: { task_type: 'awaiting_prospect' } }]) {
    const refused = await command(tokens.reception, 'crm_create_manual_lead', { display_name: 'HTTP visite refusée', learner_name: 'Apprenant synthétique', source_label: 'Manuel · Visite au centre', ...(first_exchange ? { first_exchange } : {}) });
    eq([refused.status, refused.body?.hint], [400, 'crm_create.walk_in_exchange_required'], `a walk-in ${first_exchange ? 'with a phone exchange' : 'without its exchange'} is refused`);
  }
  eq(sql(`select count(*) from public.crm_submissions where core_fields->>'display_name'='HTTP visite refusée'`), '0', 'a refused walk-in leaves no prospect and no « Premier contact »');
  const lunch = sql(`select to_json((((now() at time zone public.centre_utc_offset())::date+9)::timestamp+'13:00') at time zone public.centre_utc_offset())#>>'{}'`);
  for (const bad of [{ channel: 'phone', next: 'keep' }, { channel: 'phone', next: { close: { status: 'LOST', reason: 'price' } } }, { channel: 'other', next: { task_type: 'awaiting_prospect' } }, { channel: 'phone', next: { task_type: 'callback', schedule_kind: 'appointment', due_at: lunch } }]) {
    const refused = await command(tokens.reception, 'crm_create_manual_lead', { display_name: 'HTTP refusé', learner_name: 'Apprenant synthétique', source_label: 'Manuel · Téléphone', first_exchange: bad });
    eq(refused.status, 400, `an invalid first exchange is refused whole (${JSON.stringify(bad.next).slice(0, 40)})`);
  }
  eq(sql(`select count(*) from public.crm_submissions where core_fields->>'display_name'='HTTP refusé'`), '0', 'a refused first exchange leaves no prospect behind');

  // History over HTTP: primary rows by default, secondary rows only with details (§4.7).
  const timeline = await call(tokens.reception, 'crm_get_timeline', { p_lead: lead });
  const detailed = await call(tokens.reception, 'crm_get_timeline', { p_lead: lead, p_details: true });
  ok(timeline.body.rows.every(row => row.is_primary || !sql(`select command_key from public.crm_activities where id=${q(row.id)}`)), 'default history: primary rows and pre-136 rows only');
  ok(detailed.body.rows.length > timeline.body.rows.length, '« Détails » adds the secondary rows');
  console.log(`PASS RWR-r5 next action over HTTP: role edge, 409/PT409 and 400/22023 transport, replay, hours, OD-11/18, outcome before start, close/reopen, old wrapper, history grouping; invariants 1, 2, 8, 10 after every command (${checks} checks)`);
} finally {
  removeStaff(users.map(u => u.id));
  assert.equal(sql('select count(*) from public.crm_followup_policies'), policiesBefore, 'synthetic policies removed');
  console.log('PASS synthetic HTTP fixtures removed');
}
