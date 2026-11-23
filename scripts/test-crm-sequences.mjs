// RWR-r5 §9 property-based sequences (fast-check) on the local stack.
// Each run: two synthetic prospects sharing one learner, 2–6 generated actions through
// the RPCs as a synthetic receptionist, the §7 invariant checks 1–5, 8–10 and the
// cross-view comparison (9) after every step, all in one transaction that is rolled
// back. Invariant 15 is a browser invariant (forms), covered by the browser suites.
// Seeds are logged; replay one with CRM_SEQ_SEED (and CRM_SEQ_PATH from the report).
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { sql, q, staffSetup, actor, LIVE_POLICY } from './lib/crm-next-action-local.mjs';

const RUNS = Number(process.env.CRM_SEQ_RUNS || 200);
const SEED = process.env.CRM_SEQ_SEED ? Number(process.env.CRM_SEQ_SEED) : Math.floor(Math.random() * 2 ** 31);
const PATH = process.env.CRM_SEQ_PATH || undefined;
console.log(`test-crm-sequences: seed=${SEED} runs=${RUNS}${PATH ? ` path=${PATH}` : ''}`);

const staff = staffSetup('ab000000');
sql(`begin;${actor(staff.director)}select public.crm_create_followup_policy(gen_random_uuid(),${q(JSON.stringify(LIVE_POLICY))}::jsonb);commit;`);

// Helpers and invariant checks, created per run (pg_temp lives with the session).
const PRELUDE = String.raw`
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.l(i integer) returns uuid language sql as $$ select current_setting('t.l'||i)::uuid $$;
create function pg_temp.data(lead uuid,payload jsonb) returns jsonb language sql as $$
 select jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload $$;
create function pg_temp.act(cmd text,lead uuid,payload jsonb) returns jsonb language plpgsql as $$ declare result jsonb; begin
 execute format('select public.crm_%I($1,$2)',cmd) into result using gen_random_uuid(),pg_temp.data(lead,payload); return result; end $$;
create function pg_temp.at(kind text,days integer,hhmm text) returns timestamptz language sql as $$
 select crm_security.window_at(crm_security.current_policy_id(),kind,
  (((now() at time zone public.centre_utc_offset())::date+days)::timestamp+hhmm::time) at time zone public.centre_utc_offset()) $$;
-- {"slot":{"kind","days","hhmm"}} → an in-hours due_at; everything else unchanged.
-- {"confirm":true} → the « Remplace » confirmation and an enrolment cancellation reason (OD-18).
create function pg_temp.spec(j jsonb,lead uuid) returns jsonb language sql as $$
 select (case when j ? 'slot' then (j-'slot')||jsonb_build_object('due_at',pg_temp.at(j->'slot'->>'kind',(j->'slot'->>'days')::integer,j->'slot'->>'hhmm')) else j end-'confirm')
  ||case when (j->>'confirm')::boolean then jsonb_build_object('replace_action_id',crm_security.next_action_id(lead),'cancel_enrollment_reason','Changement demandé par le contact') else '{}'::jsonb end $$;
create temp table refused(step integer, state text, message text);
create function pg_temp.inv(lead uuid,label text) returns void language plpgsql as $$
declare l public.crm_leads; cur public.crm_tasks; open_n integer; ids jsonb; queue jsonb:='[]'::jsonb; b text; begin
 select * into strict l from public.crm_leads where id=lead;
 select count(*) into open_n from public.crm_tasks where lead_id=lead and status='open';
 select * into cur from public.crm_tasks where id=crm_security.next_action_id(lead);
 -- 1 and 2: one open action when active; none, and no planned test, when closed.
 if l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
  perform pg_temp.ok(open_n=1 and cur.id is not null and cur.status='open','I1 exactly one open next action — '||label);
  -- Q29 / the M-A2 test trigger (amended 2026-11-22): an active prospect's planned test
  -- belongs to its open appointment or to its open enrolment action, and only those.
  perform pg_temp.ok(not exists(select 1 from public.placement_tests p where p.crm_lead_id=lead and p.status='Planifié'
   and p.id is distinct from (case when cur.task_type in ('center_visit','enrollment_followup') then cur.placement_test_id end)),'I2 planned test is the open appointment''s or enrolment action''s — '||label);
 else
  perform pg_temp.ok(open_n=0 and cur.id is null,'I2 closed prospect has no open action — '||label);
  -- A converted prospect keeps its test (it is now the student's, plan §4.2 table).
  perform pg_temp.ok(l.status='CONVERTED' or not exists(select 1 from public.placement_tests where crm_lead_id=lead and status='Planifié'),'I2 closed prospect has no planned test — '||label);
 end if;
 -- 3 (Q08 for this prospect and its learner): no overlapping appointments or tests.
 perform pg_temp.ok(not exists(
  with ev as (
   select t.lead_id, x.student_id, t.id, t.due_at s, coalesce(t.scheduled_end_at,t.due_at+interval '60 min') e
   from public.crm_tasks t join public.crm_leads x on x.id=t.lead_id where t.status='open' and t.task_type='center_visit' and (x.id=lead or x.student_id=l.student_id)
   union all
   select p.crm_lead_id, p.student_id, p.id, (p.date_test+p.heure::time) at time zone public.centre_utc_offset(),
    (p.date_test+p.heure::time) at time zone public.centre_utc_offset()+interval '45 min'
   from public.placement_tests p where p.status='Planifié' and (p.crm_lead_id=lead or p.student_id=l.student_id)
    and not exists(select 1 from public.crm_tasks k where k.placement_test_id=p.id and k.status='open'))
  select 1 from ev a join ev b on a.id<b.id and ((a.lead_id is not null and a.lead_id=b.lead_id) or (a.student_id is not null and a.student_id=b.student_id)) and a.s<b.e and b.s<a.e),
  'I3 no overlapping appointments or tests for the person — '||label);
 -- 4 (Q09): future open items inside hours; agreed times and visits in their own window.
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks t where t.lead_id=lead and t.status='open' and t.due_at>now()
  and crm_security.window_at(crm_security.current_policy_id(),case when t.task_type='center_visit' then 'opening' else 'calling' end,t.due_at)<>t.due_at),
  'I4 open action inside hours — '||label);
 perform pg_temp.ok(not exists(select 1 from public.placement_tests p where p.crm_lead_id=lead and p.status='Planifié' and p.heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  and (p.date_test+p.heure::time) at time zone public.centre_utc_offset()>now()
  and crm_security.window_at(crm_security.current_policy_id(),'opening',(p.date_test+p.heure::time) at time zone public.centre_utc_offset())<>(p.date_test+p.heure::time) at time zone public.centre_utc_offset()),
  'I4 planned test inside opening hours — '||label);
 -- 5 (Q10): no result or outcome before its time.
 perform pg_temp.ok(not exists(select 1 from public.placement_tests where crm_lead_id=lead and status in ('Passé','Absent','Résultat saisi','Affecté')
  and (date_test+coalesce(nullif(heure,''),'00:00')::time) at time zone public.centre_utc_offset()>now()),'I5 no test result in the future — '||label);
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=lead and outcome_code is not null and outcome_at<due_at),'I5 no appointment outcome before its start — '||label);
 -- 8 (Q13): one primary history row per user action; the note text once.
 perform pg_temp.ok(not exists(select 1 from public.crm_activities where lead_id=lead and command_key is not null group by command_key
  having count(*) filter (where is_primary)>1 or count(*) filter (where nullif(btrim(body),'') is not null)>1),'I8 one primary row and the note once per action — '||label);
 -- 10 (Q14): the open action has an assignee (a manual prospect's owner is its creator).
 perform pg_temp.ok(cur.id is null or cur.assigned_to is not null,'I10 open action has an assignee — '||label);
 -- 9: card, drawer, check, Aujourd'hui and Tâches show the same action.
 foreach b in array array['overdue','today','tomorrow','upcoming','awaiting'] loop
  queue:=queue||(public.crm_get_work_queue(p_bucket=>b,p_assignee_mode=>'all',p_owner_mode=>'staff',p_owner=>l.owner_id,p_limit=>50)->'rows');
 end loop;
 ids:=jsonb_build_object('card',crm_security.opportunity_card(lead)->'next_action'->>'id','operational',crm_security.operational_card(lead)->'next_task'->>'id',
  'drawer',public.crm_get_workspace_detail(lead)->'next_task'->>'id','check',public.crm_check_action(lead)->'next_action'->>'id',
  'queue',coalesce((select jsonb_agg(x->>'id') from jsonb_array_elements(queue)x where x->>'lead_id'=lead::text),'[]'::jsonb));
 if cur.id is null then
  perform pg_temp.ok(ids->>'card' is null and ids->>'operational' is null and ids->>'drawer' is null and ids->>'check' is null and ids->'queue'='[]'::jsonb,'I9 no action in any reader — '||label||' '||ids::text);
 else
  perform pg_temp.ok(ids->>'card'=cur.id::text and ids->>'operational'=cur.id::text and ids->>'drawer'=cur.id::text and ids->>'check'=cur.id::text
   and ids->'queue'=jsonb_build_array(cur.id::text),'I9 same action in every reader — '||label||' '||ids::text);
 end if;
end $$;
`;

// Arbitraries -----------------------------------------------------------------
const slot = kind => fc.record({ kind: fc.constant(kind), days: fc.integer({ min: 1, max: 9 }), hhmm: fc.constantFrom('09:45', '10:00', '11:30', '15:30', '16:00', '17:15', '19:00') });
const baseSpec = fc.oneof(
  fc.record({ task_type: fc.constant('callback'), due_preset: fc.constantFrom('in_2_hours', 'tomorrow', 'in_2_days', 'next_week') }),
  fc.record({ task_type: fc.constant('callback'), schedule_kind: fc.constant('appointment'), slot: slot('calling') }),
  fc.record({ task_type: fc.constant('whatsapp_followup'), due_preset: fc.constantFrom('tomorrow', 'in_3_days') }),
  fc.record({ task_type: fc.constant('awaiting_prospect') }),
  fc.record({ task_type: fc.constant('center_visit'), slot: slot('opening'), with_test: fc.boolean() }),
);
const nextSpec = fc.tuple(baseSpec, fc.boolean()).map(([spec, confirm]) => (confirm ? { ...spec, confirm } : spec));
const close = fc.oneof(
  fc.record({ status: fc.constant('LOST'), reason: fc.constantFrom('not_interested', 'price', 'schedule', 'location', 'chose_competitor', 'postponed', 'unreachable') }),
  fc.record({ status: fc.constant('NOT_QUALIFIED'), reason: fc.constantFrom('age_not_suitable', 'program_not_suitable', 'invalid_spam', 'outside_scope') }),
  fc.record({ status: fc.constantFrom('LOST', 'NOT_QUALIFIED'), reason: fc.constant('other'), note: fc.constant('Raison précisée') }),
);
const lead = fc.integer({ min: 0, max: 1 });
const step = fc.oneof(
  { weight: 4, arbitrary: fc.record({ k: fc.constant('call'), lead, result: fc.constantFrom('no_answer', 'busy', 'declined', 'unreachable'), override: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('wrong_number'), lead }) },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('spoke'), lead, channel: fc.constantFrom('phone', 'in_person', 'whatsapp'), next: fc.oneof({ weight: 4, arbitrary: nextSpec }, fc.constant('keep'), fc.record({ close }), fc.constant({ enrol: { due_preset: 'tomorrow' } })) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('note'), lead }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('whatsapp'), lead, next: fc.oneof(nextSpec, fc.constant('keep')) }) },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('change'), lead, next: nextSpec }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('outcome'), lead, code: fc.constantFrom('came_enrolled', 'came_will_return', 'came_not_interested', 'no_show') }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('close'), lead, close }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('reopen'), lead, next: nextSpec }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('legacy_schedule'), lead }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('enrol'), lead }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('visit_outcome'), lead, slot: slot('opening'), with_test: fc.boolean(), code: fc.constantFrom('came_enrolled', 'came_will_return', 'came_not_interested', 'no_show') }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('qualify_enrol'), lead }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('close_reopen'), lead, close, next: nextSpec }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('stale'), lead }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('double'), lead, result: fc.constantFrom('no_answer', 'spoke') }) },
);
const run = fc.record({
  creates: fc.tuple(fc.constantFrom('Manual', 'Walk-in', 'Phone call', 'Website'), fc.constantFrom('Manual', 'Walk-in', 'Phone call', 'Website')),
  steps: fc.array(step, { minLength: 2, maxLength: 6 }),
});

// Rendering -------------------------------------------------------------------
const J = value => `${q(JSON.stringify(value))}::jsonb`;
const next = (n, L) => (n === 'keep' ? `'"keep"'::jsonb` : n.close ? J({ close: n.close }) : n.enrol ? J(n) : `pg_temp.spec(${J(n)},${L})`);
function body(s) {
  const L = `pg_temp.l(${s.lead})`;
  switch (s.k) {
    case 'call': return `perform pg_temp.act('log_exchange',${L},${J({ channel: 'phone', result: s.result, ...(s.override ? { real_attempt_override: true } : {}) })});`;
    case 'wrong_number': return `perform pg_temp.act('log_exchange',${L},${J({ channel: 'phone', result: 'wrong_number' })});`;
    case 'spoke': return `perform pg_temp.act('log_exchange',${L},jsonb_build_object('channel',${q(s.channel)},'result','spoke','note','Échange généré','next',${next(s.next, L)}));`;
    case 'note': return `perform pg_temp.act('log_exchange',${L},${J({ channel: 'other', result: 'note', note: 'Note générée' })});`;
    case 'whatsapp': return `perform pg_temp.act('log_exchange',${L},jsonb_build_object('channel','whatsapp','result','whatsapp_sent','next',${next(s.next, L)}));`;
    case 'change': return `perform pg_temp.act('change_next_action',${L},jsonb_build_object('expected_action_id',crm_security.next_action_id(${L}),'next',${next(s.next, L)}));`;
    case 'outcome': return `t:=(select x from public.crm_tasks x where x.id=crm_security.next_action_id(${L}));
   if t.task_type='center_visit' then -- fixture only: the appointment (and its test) moved into the past
    update public.crm_tasks set due_at=now()-interval '90 minutes',created_at=least(created_at,now()-interval '91 minutes') where id=t.id;
    set local session_replication_role=replica;
    update public.placement_tests set date_test=(now() at time zone public.centre_utc_offset())::date-1 where id=t.placement_test_id;
    set local session_replication_role=origin;
   end if;
   perform pg_temp.act('record_appointment_outcome',${L},jsonb_build_object('action_id',t.id,'outcome_code',${q(s.code)}));`;
    // Booked through the exchange that qualifies (OD-11): « Changer » refuses a first appointment (review B1).
    case 'visit_outcome': return `perform pg_temp.act('log_exchange',${L},jsonb_build_object('channel','phone','result','spoke','next',
     pg_temp.spec(${J({ task_type: 'center_visit', slot: s.slot, with_test: s.with_test, confirm: true })},${L})));
   ${body({ k: 'outcome', lead: s.lead, code: s.code })}`;
    case 'qualify_enrol': return `perform pg_temp.act('log_exchange',${L},jsonb_build_object('channel','phone','result','spoke','next',${J({ enrol: { due_preset: 'tomorrow' } })}));
   ${body({ k: 'enrol', lead: s.lead })}`;
    case 'close_reopen': return `${body({ k: 'close', lead: s.lead, close: s.close })}
   ${body({ k: 'reopen', lead: s.lead, next: s.next })}`;
    case 'close': return `perform pg_temp.act('close_prospect',${L},${J(s.close)});`;
    case 'reopen': return `perform pg_temp.act('reopen_prospect',${L},jsonb_build_object('reason','Le contact rappelle','next',${next(s.next, L)}));`;
    // M-A2 (137): the old wrapper is refused for authenticated (42501) and changes nothing;
    // the same change goes through crm_change_next_action (trusted session, as every step).
    case 'legacy_schedule': return `d:=pg_temp.data(${L},${J({ task: { task_type: 'callback', due_preset: 'in_2_days' } })});
   begin
    perform set_config('role','authenticated',true);
    perform public.crm_schedule_task(gen_random_uuid(),d);
    raise exception 'FAIL: revoked crm_schedule_task ran for authenticated — %',label;
   exception when insufficient_privilege then null;
   end;
   perform pg_temp.ok(current_user='postgres' and (select version from public.crm_leads where id=${L})=v0
     and crm_security.next_action_id(${L}) is not distinct from o0,'refused wrapper changed nothing — '||label);
   perform pg_temp.act('change_next_action',${L},jsonb_build_object('expected_action_id',crm_security.next_action_id(${L}),'next',${next({ task_type: 'callback', due_preset: 'in_2_days' }, L)}));`;
    case 'enrol': return `perform public.crm_start_enrollment(gen_random_uuid(),pg_temp.data(${L},jsonb_build_object('student_choice','existing','student_id',(select student_id from public.crm_leads where id=${L}),'session_type','Adults','school_year',extract(year from now())::integer||'/'||extract(year from now())::integer+1,'initial_status','Confirmed')));`;
    case 'stale': return `begin
    perform public.crm_change_next_action(gen_random_uuid(),jsonb_build_object('lead_id',${L},'expected_version',v0-1,'expected_action_id',o0,'next','{"task_type":"awaiting_prospect"}'::jsonb));
    raise exception 'FAIL: stale second tab accepted — %',label;
   exception when sqlstate 'PT409' then null; -- refused; checked unchanged below
   end;
   perform pg_temp.ok((select version from public.crm_leads where id=${L})=v0 and crm_security.next_action_id(${L}) is not distinct from o0,'stale tab changed nothing — '||label);`;
    case 'double': return `d:=pg_temp.data(${L},${J(s.result === 'spoke' ? { channel: 'phone', result: 'spoke', next: { task_type: 'callback', due_preset: 'tomorrow' } } : { channel: 'phone', result: 'no_answer', real_attempt_override: true })});
   k:=gen_random_uuid(); r1:=public.crm_log_exchange(k,d); r2:=public.crm_log_exchange(k,d);
   perform pg_temp.ok(r1=r2,'double submit replays the same result — '||label);`;
    default: throw new Error(`unknown step ${s.k}`);
  }
}
function render({ creates, steps }) {
  const parts = [`\\set ON_ERROR_STOP on\nbegin;\nset local statement_timeout='60s';\n${PRELUDE}`, actor(staff.receptionist)];
  parts.push(`do $c$ declare s uuid; begin
 ${creates.map((label, i) => `perform set_config('t.l${i}',public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name',${q(`Séquence ${i}`)},'learner_name','Apprenant généré',
   'email','seq-'||gen_random_uuid()||'@example.invalid','source_label',${q(label)}))->'lead'->>'id',true);`).join('\n ')}
 insert into public.students(full_name,status,session_type) values('Apprenant généré','Prospect','Adults') returning id into s;
 update public.crm_leads set student_id=s where id in (pg_temp.l(0),pg_temp.l(1)); -- two prospects, one learner (invariant 3)
end $c$;
select pg_temp.inv(pg_temp.l(0),'created'),pg_temp.inv(pg_temp.l(1),'created');`);
  steps.forEach((s, n) => {
    const label = `step ${n + 1} ${s.k}`;
    parts.push(`do $s$ declare label text:=${q(label)}; v0 bigint; o0 uuid; t public.crm_tasks; d jsonb; k uuid; r1 jsonb; r2 jsonb; begin
 select version into v0 from public.crm_leads where id=pg_temp.l(${s.lead}); o0:=crm_security.next_action_id(pg_temp.l(${s.lead}));
 begin
   ${body(s)}
 exception when sqlstate '22023' or sqlstate 'PT409' then
  -- a refused step leaves the prospect exactly as it was
  perform pg_temp.ok((select version from public.crm_leads where id=pg_temp.l(${s.lead}))=v0 and crm_security.next_action_id(pg_temp.l(${s.lead})) is not distinct from o0,'refused step changed nothing — '||label);
  insert into refused values(${n + 1},sqlstate,sqlerrm);
 end;
end $s$;
select pg_temp.inv(pg_temp.l(0),${q(label)}),pg_temp.inv(pg_temp.l(1),${q(label)});`);
  });
  parts.push(`select 'refused='||coalesce(string_agg(step::text,',' order by step),'') from refused;
select 'why='||step||' '||state||' '||message from refused order by step;\nrollback;`);
  return parts.join('\n');
}

// Property --------------------------------------------------------------------
let total = 0; let refusedTotal = 0; const kinds = {}; const acceptedKinds = {}; const why = {};
function execute(r) {
  let out;
  try { out = sql(render(r)); } catch (e) {
    const fail = (e.stderr || '').match(/FAIL: [^\n]*/);
    throw new Error(fail ? fail[0] : (e.stderr || e.message).split('\n').slice(0, 4).join('\n'));
  }
  total += r.steps.length;
  const refusedSteps = new Set(((out.match(/refused=([\d,]*)/) || [])[1] || '').split(',').filter(Boolean).map(Number));
  refusedTotal += refusedSteps.size;
  for (const m of out.matchAll(/^why=(\d+) (.*)$/gm)) {
    const key = `${r.steps[Number(m[1]) - 1].k}: ${m[2]}`;
    why[key] = (why[key] || 0) + 1;
  }
  r.steps.forEach((s, i) => {
    kinds[s.k] = (kinds[s.k] || 0) + 1;
    if (!refusedSteps.has(i + 1)) acceptedKinds[s.k] = (acceptedKinds[s.k] || 0) + 1;
  });
  return refusedSteps;
}

// Fixed regression cases (a failing seed's shrunk counterexample goes here). They also
// make sure the deep paths are reached: qualify → enrol, appointment → outcome, close → reopen.
const slotAt = (kind, days, hhmm) => ({ kind, days, hhmm });
const REGRESSIONS = [
  { name: 'spoke → enrol next → start enrollment', creates: ['Manual', 'Walk-in'], steps: [
    { k: 'spoke', lead: 0, channel: 'phone', next: { enrol: { due_preset: 'tomorrow' } } }, { k: 'enrol', lead: 0 }], accepted: [1, 2] },
  { name: 'visit with test → outcome no-show', creates: ['Manual', 'Website'], steps: [
    { k: 'spoke', lead: 0, channel: 'phone', next: { task_type: 'center_visit', slot: slotAt('opening', 3, '10:00'), with_test: true } }, { k: 'outcome', lead: 0, code: 'no_show' }], accepted: [1, 2] },
  // Review B1 (OD-11, §4.8): « Changer » does not book a first appointment for a prospect not yet qualified.
  { name: 'appointment through « Changer » before qualification → refused', creates: ['Manual', 'Manual'], steps: [
    { k: 'change', lead: 0, next: { task_type: 'center_visit', slot: slotAt('opening', 3, '10:00'), with_test: true } }], accepted: [] },
  { name: 'visits for both prospects of one learner at the same time → one refused', creates: ['Manual', 'Phone call'], steps: [
    { k: 'spoke', lead: 0, channel: 'phone', next: { task_type: 'center_visit', slot: slotAt('opening', 4, '11:30'), with_test: false } },
    { k: 'spoke', lead: 1, channel: 'phone', next: { task_type: 'center_visit', slot: slotAt('opening', 4, '11:30'), with_test: true } }], accepted: [1] },
  { name: 'close → reopen → stale tab → double submit', creates: ['Walk-in', 'Manual'], steps: [
    { k: 'close', lead: 0, close: { status: 'LOST', reason: 'price' } }, { k: 'reopen', lead: 0, next: { task_type: 'awaiting_prospect' } },
    { k: 'stale', lead: 0 }, { k: 'double', lead: 0, result: 'spoke' }], accepted: [1, 2, 3, 4] },
  // Seed 512551702 (shrunk): enrolment start converts the prospect; its planned test is kept as the student's.
  { name: 'visit with test → enrolment start converts, test kept', creates: ['Manual', 'Manual'], steps: [
    { k: 'spoke', lead: 0, channel: 'phone', next: { task_type: 'center_visit', slot: slotAt('opening', 1, '09:45'), with_test: false } },
    { k: 'change', lead: 0, next: { task_type: 'center_visit', slot: slotAt('opening', 1, '09:45'), with_test: true, confirm: true } },
    { k: 'enrol', lead: 0 }, { k: 'change', lead: 0, next: { task_type: 'awaiting_prospect' } }, { k: 'call', lead: 0, result: 'no_answer', override: false }], accepted: [1, 2, 3] },
];
for (const c of REGRESSIONS) {
  const refusedSteps = execute(c);
  const accepted = c.steps.map((_, i) => i + 1).filter(n => !refusedSteps.has(n));
  assert.deepEqual(accepted, c.accepted, `${c.name}: accepted steps`);
  console.log(`PASS regression: ${c.name}`);
}

fc.assert(fc.property(run, r => { execute(r); }), { numRuns: RUNS, seed: SEED, path: PATH, verbose: 1 });

const accepted = total - refusedTotal;
console.log(`steps=${total} accepted=${accepted} refused=${refusedTotal}`);
console.log(`accepted/generated per kind: ${Object.keys(kinds).sort().map(k => `${k} ${acceptedKinds[k] || 0}/${kinds[k]}`).join(', ')}`);
if (process.env.CRM_SEQ_DEBUG) console.log(Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join('\n'));
assert.ok(accepted / total > 0.4, 'the generator mostly produces accepted actions');
console.log(`PASS ${RUNS} generated sequences: invariants 1–5, 8–10 and the cross-view comparison held after every step (seed ${SEED})`);
