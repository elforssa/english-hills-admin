// RCC-A1 pure presentation contract: labels, outcome routing and payload shapes.
import assert from 'node:assert/strict';
import { STATUS, CONVERSATION_OUTCOMES, REMINDER_PRESETS, SCHEDULE_KINDS, conversationOutcomes, outcomeStage, outcomeTask, scheduleKindRule, nextTaskSpec, conversationDecision, taskTitle, casablancaInstant, noteRequired, commandError } from '../src/lib/crm/presentation.mjs';

// Presentation labels only; stored status values are unchanged.
assert.equal(STATUS.CONTACTING, 'Contact en cours');
assert.equal(STATUS.CONVERTED, 'Inscription confirmée');
assert.deepEqual(Object.keys(STATUS), ['NEW','CONTACTING','ENGAGED','QUALIFIED','LOST','NOT_QUALIFIED','CONVERTED']);
assert(!Object.values(STATUS).includes('En réflexion'), 'En réflexion is never a stage');

// The server allowlists; every outcome payload must stay inside them.
const decisionKeys = ['lead_id','expected_version','task_id','expected_task_version','decision','channel','note','next_task','qualification_step','reason'];
const taskKeys = ['task_type','due_at','due_preset','schedule_kind','followup_reason','assigned_to','instructions'];
const presets = ['in_2_hours','tomorrow','in_2_days','in_3_days','next_week'];
assert.deepEqual(Object.keys(REMINDER_PRESETS), presets, 'presets match reminder_due');
assert.deepEqual(Object.keys(SCHEDULE_KINDS), ['appointment','reminder']);

assert.deepEqual(Object.keys(conversationOutcomes('NEW')), Object.keys(CONVERSATION_OUTCOMES));
assert.deepEqual(Object.keys(conversationOutcomes('QUALIFIED')), ['considering','callback','not_interested','not_suitable'], 'a qualified lead is never re-qualified');
for (const status of ['NEW','CONTACTING']) {
  assert.equal(outcomeStage('considering', status), 'ENGAGED');
  assert.equal(outcomeStage('callback', status), 'ENGAGED');
}
assert.equal(outcomeStage('considering', 'QUALIFIED'), 'QUALIFIED', 'qualified + needs time stays QUALIFIED');
assert.equal(outcomeStage('considering', 'ENGAGED'), 'ENGAGED');
assert.equal(outcomeStage('center_visit', 'ENGAGED'), 'QUALIFIED');
assert.equal(outcomeStage('not_interested', 'QUALIFIED'), 'LOST');
assert.equal(outcomeStage('not_suitable', 'NEW'), 'NOT_QUALIFIED');
assert.equal(outcomeStage('unknown', 'NEW'), null);
assert.equal(outcomeTask('considering', 'whatsapp'), 'whatsapp_followup');
assert.equal(outcomeTask('considering', 'phone'), 'callback');
assert.equal(outcomeTask('callback', 'whatsapp'), 'callback', 'callback decision requires a callback');
assert.equal(outcomeTask('other_step', 'phone'), null, 'other step lets the receptionist choose');

assert.deepEqual(scheduleKindRule('center_visit', 'reminder'), { fixed: true, kind: 'appointment' });
assert.deepEqual(scheduleKindRule('confirm_placement_test', 'appointment'), { fixed: true, kind: 'reminder' });
assert.deepEqual(scheduleKindRule('callback', 'appointment'), { fixed: false, kind: 'appointment' });
assert.deepEqual(scheduleKindRule('callback'), { fixed: false, kind: 'reminder' });

const due = '2030-03-12T13:00';
assert.deepEqual(nextTaskSpec({ taskType: 'callback', kind: 'reminder', preset: 'tomorrow', due: '' }),
  { task_type: 'callback', schedule_kind: 'reminder', due_preset: 'tomorrow', instructions: null }, 'browser sends a preset, never a computed time');
const exact = nextTaskSpec({ taskType: 'callback', kind: 'reminder', preset: 'exact', due, instructions: 'Après 18h' });
assert.equal(exact.due_preset, undefined);assert.equal(exact.due_at, casablancaInstant(due));assert.equal(exact.instructions, 'Après 18h');
const agreed = nextTaskSpec({ taskType: 'center_visit', kind: 'appointment', preset: 'tomorrow', due });
assert.equal(agreed.due_preset, undefined, 'an appointment never uses a preset');assert.equal(agreed.schedule_kind, 'appointment');
assert.throws(() => nextTaskSpec({ taskType: 'callback', kind: 'appointment', due: '' }), /Choisissez une date/);
assert.deepEqual(Object.keys(nextTaskSpec({ taskType: 'callback', due })).sort(), ['due_at','instructions','task_type'], 'explicit legacy shape unchanged without a kind');

const next = nextTaskSpec({ taskType: 'callback', kind: 'reminder', preset: 'in_2_days' });
const considering = conversationDecision('considering', { channel: 'phone', note: '  ', next });
assert.deepEqual(considering, { decision: 'considering', channel: 'phone', next_task: next }, 'blank prose is omitted');
assert(!('followup_reason' in considering.next_task), 'the server, not the browser, marks En réflexion');
assert.deepEqual(conversationDecision('center_visit', { channel: 'whatsapp', note: ' Visite samedi ', next }),
  { decision: 'qualify', channel: 'whatsapp', note: 'Visite samedi', next_task: next, qualification_step: 'center_visit' });
assert.deepEqual(conversationDecision('not_interested', { channel: 'in_person', next }), { decision: 'lost', channel: 'in_person', reason: 'not_interested' }, 'closure schedules nothing');
assert.deepEqual(conversationDecision('not_suitable', { channel: 'phone', reason: 'age_not_suitable' }), { decision: 'not_qualified', channel: 'phone', reason: 'age_not_suitable' });
assert.throws(() => conversationDecision('', { channel: 'phone' }), /résultat de l’échange/);
for (const key of Object.keys(CONVERSATION_OUTCOMES)) {
  const payload = conversationDecision(key, { channel: 'phone', note: 'x', reason: 'other', next });
  assert(Object.keys(payload).every(field => decisionKeys.includes(field)), `${key} payload stays inside the server allowlist`);
  if (payload.next_task) assert(Object.keys(payload.next_task).every(field => taskKeys.includes(field)), `${key} task stays inside the server allowlist`);
}

// Stale hidden selection: other_step chosen, then the call outcome changed to no answer.
const stale = { action: 'call', interaction: 'other_step', reason: 'not_interested', step: 'placement_test', unsuitableReason: 'other' };
assert.equal(noteRequired({ ...stale, outcomeLed: true }), true, 'visible Other step requires an explanation');
assert.equal(noteRequired({ ...stale, outcomeLed: false }), false, 'hidden other_step no longer requires a note');
assert.equal(noteRequired({ ...stale, interaction: 'not_suitable', outcomeLed: false }), false, 'hidden not_suitable/Other no longer requires a note');
assert.equal(noteRequired({ ...stale, interaction: 'not_suitable', outcomeLed: true }), true);
assert.equal(noteRequired({ action: 'whatsapp', outcomeLed: false, interaction: 'other_step' }), false, 'sent WhatsApp ignores a hidden result');
for (const action of ['note', 'cancel', 'reopen', 'complete']) assert.equal(noteRequired({ action, outcomeLed: false }), true, `${action} explanation required`);
assert.equal(noteRequired({ action: 'lost', outcomeLed: false, reason: 'other' }), true);
assert.equal(noteRequired({ action: 'qualify', outcomeLed: false, step: 'other' }), true);
assert.equal(noteRequired({ action: 'qualify', outcomeLed: false, step: 'center_visit' }), false);
assert.match(commandError({ code: '22023', message: 'Agreed callback time is outside calling hours' }), /hors des horaires d’appel/);
assert.equal(taskTitle({ task_type: 'callback', followup_reason: 'considering' }), 'Rappel · En réflexion');
assert.equal(taskTitle({ task_type: 'center_visit' }), 'Visite au centre');
assert.equal(taskTitle(null), 'Action');
console.log('PASS RCC-A1 labels, outcome-led routing, server-resolved presets and allowlisted payloads');
