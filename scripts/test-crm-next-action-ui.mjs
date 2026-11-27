// RWR-r5 §4.9 pure helpers: plural, picker slots, the `next` payload, OD-18
// confirmations, refusal messages and the attempt-gap pre-check label.
import assert from 'node:assert/strict';
import { pluralFr } from '../src/lib/ui/pluralFr.mjs';
import {
  WORK_BUCKETS, NEXT_KINDS, CALL_RESULTS, STALE_MESSAGE, exchangeResults, prefillFromAction, replaceRules, slotTimes, firstSlotDate,
  nextActionPayload, actionErrorMessage, attemptGapLabel, isCallAction, taskTitle, placementStatusOptions
} from '../src/lib/crm/presentation.mjs';
import { draftFrom, hoursDraftProblem, hoursPayload } from '../src/lib/crm/centreHours.mjs';

assert.equal(pluralFr(0, 'apprenant'), '0 apprenant');
assert.equal(pluralFr(1, 'apprenant'), '1 apprenant');
assert.equal(pluralFr(2, 'apprenant'), '2 apprenants');
assert.equal(pluralFr(5, 'appel infructueux', 'appels infructueux'), '5 appels infructueux');

assert.deepEqual(Object.values(WORK_BUCKETS), ['En retard', 'Aujourd’hui', 'Demain', 'À venir', 'En attente']);
assert.deepEqual(Object.values(CALL_RESULTS), ['Pas de réponse', 'Occupé', 'Refusé', 'Injoignable', 'Mauvais numéro', 'On a parlé']);
assert.deepEqual(Object.keys(exchangeResults('whatsapp')), ['whatsapp_sent', 'spoke']);
assert.deepEqual(Object.keys(exchangeResults('other')), ['spoke', 'note']);
assert.equal(taskTitle({ task_type: 'awaiting_prospect' }), 'En attente du prospect');
assert.ok(isCallAction({ task_type: 'contact_attempt' }) && !isCallAction({ task_type: 'center_visit' }));

// Slots: weekday windows, closed dates, past times of today removed.
const hours = {
  calling_hours: { 1: [['15:00', '16:00']], 2: [['10:00', '10:30'], ['15:20', '16:00']], 7: [] },
  opening_hours: { 1: [['14:00', '15:00']], 2: [['09:30', '10:00']], 7: [] },
  closed_dates: ['2026-11-24']
};
assert.deepEqual(slotTimes(hours, 'calling', '2026-11-23'), ['15:00', '15:15', '15:30', '15:45']); // a Monday
// « Changer » opens on the current agreed time; reminders and calls start empty.
assert.deepEqual(prefillFromAction({ task_type: 'callback', schedule_kind: 'appointment', due_at: '2026-11-25T16:05:00Z' }), { kind: 'callback', date: '2026-11-25', time: '16:05' });
assert.deepEqual(prefillFromAction({ task_type: 'center_visit', due_at: '2026-11-25T10:30:00Z', placement_test_id: 'x' }), { kind: 'center_visit', date: '2026-11-25', time: '10:30', withTest: true });
assert.deepEqual(prefillFromAction({ task_type: 'callback', schedule_kind: 'reminder', due_at: '2026-11-25T09:00:00Z' }), {});
assert.deepEqual(prefillFromAction({ task_type: 'first_contact', due_at: '2026-11-25T09:00:00Z' }), {});
assert.deepEqual(prefillFromAction(null), {});
assert.deepEqual(slotTimes(hours, 'opening', '2026-11-23'), ['14:00', '14:15', '14:30', '14:45']);
assert.deepEqual(slotTimes(hours, 'calling', '2026-11-24'), [], 'closed date has no slot');
assert.deepEqual(slotTimes(hours, 'calling', '2026-11-22'), [], 'Sunday closed');
assert.deepEqual(slotTimes(hours, 'calling', '2026-11-23', { now: { date: '2026-11-23', time: '15:20' } }), ['15:30', '15:45']);
assert.deepEqual(slotTimes(hours, 'calling', '2026-12-01'), ['10:00', '10:15', '15:20', '15:35', '15:50']); // a Tuesday
// An agreed time off the grid stays offered inside the hours, never outside them or in the past.
assert.deepEqual(slotTimes(hours, 'calling', '2026-12-01', { keep: '15:40' }), ['10:00', '10:15', '15:20', '15:35', '15:40', '15:50']);
assert.deepEqual(slotTimes(hours, 'calling', '2026-12-01', { keep: '13:00' }), ['10:00', '10:15', '15:20', '15:35', '15:50'], 'lunch is never kept');
assert.deepEqual(slotTimes(hours, 'calling', '2026-11-23', { keep: '15:10', now: { date: '2026-11-23', time: '15:20' } }), ['15:30', '15:45'], 'a past time is never kept');
assert.deepEqual(slotTimes(hours, 'calling', '2026-11-24', { keep: '15:40' }), [], 'a closed date keeps nothing');
// The create form proposes the first day with a free slot.
assert.equal(firstSlotDate(hours, 'calling', '2026-11-22'), '2026-11-23');
assert.equal(firstSlotDate(hours, 'calling', '2026-11-23', { date: '2026-11-23', time: '15:50' }), '2026-11-30', 'past slots, a closed Tuesday and days without hours are skipped');
assert.equal(firstSlotDate(null, 'calling', '2026-11-23'), '');

// Payloads.
const visit = { id: 'v1', task_type: 'center_visit' };
const enrol = { id: 'e1', task_type: 'enrollment_followup' };
const call = { id: 'c1', task_type: 'contact_attempt' };
assert.deepEqual(nextActionPayload({ kind: 'callback', date: '2026-11-23', time: '15:30' }, call),
  { task_type: 'callback', schedule_kind: 'appointment', due_at: '2026-11-23T15:30:00.000Z' });
assert.deepEqual(nextActionPayload({ kind: 'center_visit', date: '2026-11-23', time: '14:00', withTest: true, instructions: ' Venir avec le bulletin ' }, call),
  { task_type: 'center_visit', due_at: '2026-11-23T14:00:00.000Z', with_test: true, instructions: 'Venir avec le bulletin' });
assert.deepEqual(nextActionPayload({ kind: 'our_step', preset: 'in_3_days' }, call), { task_type: 'whatsapp_followup', due_preset: 'in_3_days' });
assert.deepEqual(nextActionPayload({ kind: 'reminder', preset: 'in_2_hours' }, call), { task_type: 'callback', schedule_kind: 'reminder', due_preset: 'in_2_hours' });
assert.deepEqual(nextActionPayload({ kind: 'awaiting' }, call), { task_type: 'awaiting_prospect' }, 'default relance is the server’s today + 5');
assert.deepEqual(nextActionPayload({ kind: 'awaiting', noRelance: true }, call), { task_type: 'awaiting_prospect', due_at: null });
assert.deepEqual(nextActionPayload({ kind: 'enrol' }, call), { enrol: { due_preset: 'tomorrow' } });
// RWR-r5 §5.4 (migration 140): one « Clôturer » with one reason list; the server derives
// the status from the reason, so the payload carries none.
assert.deepEqual(nextActionPayload({ kind: 'close', reason: 'not_interested', why: 'price' }, visit), { close: { reason: 'price' } }, 'closing never needs « Remplace »');
assert.deepEqual(nextActionPayload({ kind: 'close', reason: 'wrong_number' }, call), { close: { reason: 'wrong_number' } });
assert.throws(() => nextActionPayload({ kind: 'close', reason: 'other' }, call), /Précisez/);
assert.throws(() => nextActionPayload({ kind: 'close', reason: 'not_interested' }, call), /Choisissez pourquoi/);
assert.throws(() => nextActionPayload({ kind: 'close' }, call), /motif/);
assert.equal(NEXT_KINDS.lost, undefined, 'no separate « Perdu » / « Non qualifié » kinds');
assert.throws(() => nextActionPayload({ kind: 'callback', date: '2026-11-23' }, call), /date et l’heure/);
assert.throws(() => nextActionPayload({}, call), /prochaine action/);
// OD-18.
assert.deepEqual(replaceRules(visit, 'callback'), { confirmAppointment: true, enrollmentReason: false });
assert.deepEqual(replaceRules(visit, 'center_visit'), { confirmAppointment: true, enrollmentReason: false }, 'moving a visit replaces it');
assert.deepEqual(replaceRules(enrol, 'enrol'), { confirmAppointment: false, enrollmentReason: false });
assert.deepEqual(replaceRules(enrol, 'awaiting'), { confirmAppointment: false, enrollmentReason: true });
assert.deepEqual(replaceRules(call, 'callback'), { confirmAppointment: false, enrollmentReason: false });
assert.throws(() => nextActionPayload({ kind: 'callback', date: '2026-11-23', time: '15:30' }, visit), /Remplace/);
assert.equal(nextActionPayload({ kind: 'callback', date: '2026-11-23', time: '15:30', replaceConfirmed: true }, visit).replace_action_id, 'v1');
assert.throws(() => nextActionPayload({ kind: 'awaiting' }, enrol), /inscription/);
assert.equal(nextActionPayload({ kind: 'awaiting', cancelEnrollmentReason: 'Reporté à janvier' }, enrol).cancel_enrollment_reason, 'Reporté à janvier');

// Messages.
assert.equal(actionErrorMessage({ code: 'PT409' }), STALE_MESSAGE);
assert.match(actionErrorMessage({ code: '22023', hint: 'crm_exchange.attempt_gap' }), /Tentative réelle/);
assert.match(actionErrorMessage({ code: '22023', hint: 'crm_hours.outside_opening' }), /ouverture/);
assert.match(actionErrorMessage({ code: '22023', hint: 'crm_next_action.overlap' }), /apprenant/);
// C2 (141): a visit whose linked test starts later is refused until the test's start.
assert.equal(actionErrorMessage({ code: '22023', hint: 'placement.result_before_start' }), 'Le test de niveau lié commence plus tard : le résultat se saisit à partir de l’heure du test.');
assert.match(actionErrorMessage(new Error('Choisissez la date et l’heure.')), /^Choisissez/);
assert.match(actionErrorMessage({ code: '22023', message: 'x' }), /Vérifiez/);
assert.equal(attemptGapLabel({ attempt_gap_ok: false, next_attempt_allowed_at: '2026-11-23T14:20:00Z' }), 'Prochain essai possible à 14:20');
assert.equal(attemptGapLabel({ attempt_gap_ok: true }), null);
assert.ok(Object.keys(NEXT_KINDS).includes('enrol'));
assert.equal(nextActionPayload({ kind: 'keep' }, visit), 'keep', 'keeping never needs « Remplace »');
assert.deepEqual(replaceRules(visit, 'keep'), { confirmAppointment: false, enrollmentReason: false });

// « Horaires du centre »: draft, checks as the server, payload keeps the cadence.
const live = { calling_hours: { 1: [['09:00', '12:00'], ['14:00', '19:00']], 2: [], 3: [], 4: [], 5: [], 6: [['10:00', '13:00']], 7: [] }, closed_dates: ['2026-12-25'],
  attempt_offsets: [0, 0, 1, 3, 5], minimum_attempt_gap_minutes: 180, first_contact_sla_minutes: 15, post_test_sla_minutes: 120, stale_contacting_minutes: 2880 };
const draft = draftFrom(live);
assert.equal(hoursDraftProblem(draft), null);
const payload = hoursPayload({ ...draft, closed: ['2026-12-31', '2026-12-25', '2026-12-31'] }, live);
assert.deepEqual(payload.weekly_hours[1], [['09:00', '12:00'], ['14:00', '19:00']]);
assert.deepEqual(payload.date_exceptions, ['2026-12-25', '2026-12-31'], 'sorted, no duplicate');
assert.equal(payload.opening_hours, null, 'OD-3 = B: one set of hours');
assert.deepEqual(payload.attempt_offsets, [0, 0, 1, 3, 5]);
assert.equal(payload.minimum_attempt_gap_minutes, 180);
assert.match(hoursDraftProblem({ ...draft, week: { ...draft.week, 1: [{ start: '12:00', end: '11:00' }] } }), /Lundi/);
assert.match(hoursDraftProblem({ ...draft, week: { ...draft.week, 6: [{ start: '10:00', end: '13:00' }, { start: '12:00', end: '14:00' }] } }), /chevauchent/);
assert.match(hoursDraftProblem({ week: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }, closed: [] }), /au moins une plage/);

console.log('PASS next-action UI helpers: plural, slots, payloads, OD-18 confirmations, messages, centre hours');

// Re-review of #208 (owner decision 2): the test form never offers « Planifié » for a
// prospect's test that has left it (one or two steps); a student's own test is unchanged.
assert.deepEqual(placementStatusOptions(null), ['Planifié', 'Résultat saisi', 'Affecté']);
assert.deepEqual(placementStatusOptions({ status: 'Planifié', crm_lead_id: 'x' }), ['Planifié', 'Résultat saisi', 'Affecté']);
for (const status of ['Annulé', 'Absent', 'Passé', 'Résultat saisi', 'Affecté']) {
  assert.ok(!placementStatusOptions({ status, crm_lead_id: 'x' }).includes('Planifié'), `prospect test ${status}`);
  assert.ok(!placementStatusOptions({ status, is_crm: true }).includes('Planifié'), `CRM test ${status}`);
  assert.ok(placementStatusOptions({ status, crm_lead_id: null }).includes('Planifié'), `student test ${status}`);
}
assert.deepEqual(placementStatusOptions({ status: 'Annulé', crm_lead_id: 'x' }), ['Annulé', 'Résultat saisi', 'Affecté']);
// RWR-r5 §6.2 (141): « Passé » is derived, never offered; an old row keeps showing it.
assert.ok(!placementStatusOptions({ status: 'Planifié', crm_lead_id: 'x' }).includes('Passé'));
assert.deepEqual(placementStatusOptions({ status: 'Passé', crm_lead_id: 'x' }), ['Passé', 'Résultat saisi', 'Affecté']);
console.log('PASS placement status options: no « Planifié » for a prospect test that left it');

// PR A2 (migration 137): no screen calls a revoked command wrapper.
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const REVOKED = /\bcrm_(add_note|record_call_outcome|record_whatsapp|record_conversation|record_conversation_decision|qualify_lead|schedule_task|complete_task|cancel_task|close_lost|close_not_qualified|reopen_lead)\b/;
  const walk = dir => readdirSync(dir).flatMap(name => { const path = `${dir}/${name}`; return statSync(path).isDirectory() ? walk(path) : [path]; });
  const callers = walk('src').filter(path => /\.(js|jsx|mjs|ts|tsx)$/.test(path) && REVOKED.test(readFileSync(path, 'utf8')));
  assert.deepEqual(callers, [], 'no source file names a wrapper revoked by migration 137');
  console.log('PASS no screen calls a command wrapper revoked by migration 137');
}
