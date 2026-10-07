// RCC-A2 pure contract: reason table, definite/uncertain classifier, safe
// fallbacks, Casablanca bounds, contextual actions and result origin.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandError, casablancaInstant } from '../src/lib/crm/presentation.mjs';
import { ENROLLMENT_REASONS, FALLBACK_REASONS, UNCERTAIN_MESSAGE, DEFINITE_GENERIC_MESSAGE, isDefiniteRejection, enrollmentReason, enrollmentFailure, discardsRequestKey } from '../src/lib/crm/enrollmentErrors.mjs';
import { casablancaToday, casablancaNowInput, birthDateReason, followupReason, enrollmentAction, continueHref, studentHref, enrollmentParam, enrollmentSuccess, followupNotice } from '../src/lib/crm/enrollmentActions.mjs';

// The closed plan §1 vocabulary, the migration's hints and the browser table agree.
const PLAN = ['lead_unavailable','lead_already_enrolled','lead_not_qualified','program_invalid','school_year_invalid','notes_too_long','initial_status_not_permitted',
  'learner_already_linked','learner_link_mismatch','linked_learner_unavailable','learner_unavailable','learner_choice_required','learner_name_invalid','birth_date_future',
  'birth_date_invalid','candidates_changed','new_learner_confirmation_required','enrollment_incompatible','enrollment_already_linked','enrollment_group_incompatible',
  'enrollment_changed','existing_enrollment_needs_review','existing_enrollment_requires_selection','existing_enrollment_linked_elsewhere','group_incompatible','level_invalid',
  'trial_requires_group','followup_invalid','followup_in_past','owner_not_operational','followup_policy_unavailable','enrollment_in_progress','concurrent_change','record_rejected'];
assert.deepEqual(Object.keys(ENROLLMENT_REASONS).sort(), [...PLAN].sort(), 'browser table equals the plan vocabulary');
assert.deepEqual(FALLBACK_REASONS, ['request_invalid','request_conflict','lead_changed']);
const migration = readFileSync(new URL('../supabase/migrations/112_crm_rcc_a2_enrollment_ux.sql', import.meta.url), 'utf8');
const hinted = new Set([...migration.matchAll(/'crm_enrollment\.([a-z_]+)'/g)].map(m => m[1]));
assert.deepEqual([...hinted].sort(), [...PLAN, ...FALLBACK_REASONS].sort(), 'every server hint is mapped and every mapped reason is emitted');
const FIELDS = [null,'name','birth','confirmNew','session','year','notes','status','level','group','due'];
for (const [reason, entry] of Object.entries(ENROLLMENT_REASONS)) {
  assert(entry.message && /[éèàâêîôûçÉ’«]|^[A-Z]/.test(entry.message) && !/[A-Za-z]+_[a-z]+|crm_|SQL|uuid/i.test(entry.message), `${reason}: French message without tokens`);
  assert([null,1,2].includes(entry.step), `${reason}: step`);assert(FIELDS.includes(entry.field), `${reason}: field`);
  assert([true,false,'until-change'].includes(entry.submit), `${reason}: submit`);
  assert(['close','discovered','correct','linked','escalate','reselect','refresh','enrollments','retry'].includes(entry.recovery), `${reason}: recovery`);
  if (entry.field) assert(entry.step, `${reason}: a field always has a step`);
}
for (const reason of ['birth_date_future','birth_date_invalid','learner_name_invalid']) assert.equal(ENROLLMENT_REASONS[reason].step, 1, `${reason} goes to step 1, not step 2`);
for (const reason of ['lead_unavailable','lead_already_enrolled','lead_not_qualified','linked_learner_unavailable','followup_policy_unavailable']) assert.equal(ENROLLMENT_REASONS[reason].submit, false);
assert.equal(ENROLLMENT_REASONS.lead_already_enrolled.recovery, 'discovered');
assert.equal(ENROLLMENT_REASONS.learner_already_linked.message, ENROLLMENT_REASONS.learner_link_mismatch.message);
assert(!Object.values(ENROLLMENT_REASONS).some(r => /paiement/.test(r.message) && r !== ENROLLMENT_REASONS.enrollment_in_progress), 'only the intent-lock text mentions payment');

// Definite rejection only when a SQLSTATE proves the rollback.
for (const code of ['22023','40001','42501','P0001','23514','22P02']) assert.equal(isDefiniteRejection({ code }), true, code);
for (const code of ['PGRST202','PGRST301','','502','5000',undefined,null,22023]) assert.equal(isDefiniteRejection({ code }), false, String(code));
assert.equal(isDefiniteRejection(null), false);assert.equal(isDefiniteRejection(new TypeError('Failed to fetch')), false);
assert.equal(enrollmentReason({ code: '22023', hint: 'crm_enrollment.birth_date_future' }), 'birth_date_future');
assert.equal(enrollmentReason({ code: '22023', hint: 'crm_enrollment.unknown_thing' }), null);
assert.equal(enrollmentReason({ code: '22023', hint: 'crm_enrollment.birth_date_future; drop' }), null);
assert.equal(enrollmentReason({ code: '22023', hint: 'Some other hint' }), null);

// Server scenarios, as the SQL suite produces them: same code and message per reason.
const SCENARIOS = {
  request_invalid: ['22023','Valid bounded enrollment request required'], request_conflict: ['22023','Request key payload conflict'],
  lead_unavailable: ['22023','Qualified unlinked lead required'], lead_already_enrolled: ['22023','Qualified unlinked lead required'], lead_not_qualified: ['22023','Qualified unlinked lead required'],
  lead_changed: ['40001','Stale lead version; refresh and retry'], program_invalid: ['22023','Invalid enrollment program or school year'],
  school_year_invalid: ['22023','Invalid enrollment program or school year'], notes_too_long: ['22023','Invalid enrollment program or school year'],
  initial_status_not_permitted: ['42501','Only pre-confirmation enrollment initiation is permitted'], learner_already_linked: ['22023','Invalid new learner'],
  learner_link_mismatch: ['22023','Student unavailable or inconsistent'], linked_learner_unavailable: ['22023','Student unavailable or inconsistent'],
  learner_unavailable: ['22023','Student unavailable or inconsistent'], learner_choice_required: ['22023','Explicit student choice required'],
  learner_name_invalid: ['22023','Invalid new learner'], birth_date_future: ['22023','Invalid new learner'], birth_date_invalid: ['22023','Invalid enrollment fields or incompatible group'],
  candidates_changed: ['40001','Student candidates changed; review again'], new_learner_confirmation_required: ['22023','Explicit new learner decision required'],
  enrollment_incompatible: ['22023','Enrollment unavailable or incompatible'], enrollment_already_linked: ['22023','Enrollment unavailable or incompatible'],
  enrollment_group_incompatible: ['22023','Enrollment group must match session and level'], enrollment_changed: ['40001','Stale enrollment; refresh and retry'],
  existing_enrollment_needs_review: ['22023','Existing enrollment status requires review'], existing_enrollment_requires_selection: ['22023','Existing enrollment requires explicit selection'],
  existing_enrollment_linked_elsewhere: ['22023','Existing enrollment requires explicit selection'], group_incompatible: ['22023','Enrollment group must match session and level'],
  level_invalid: ['22023','Invalid level for selected program'], trial_requires_group: ['22023','Invalid enrollment fields or incompatible group'],
  followup_invalid: ['22023','Invalid enrollment fields or incompatible group'], followup_in_past: ['22023','Valid future task required'],
  owner_not_operational: ['22023','Assignee must be operational staff'], followup_policy_unavailable: ['22023','Policy has no available calling window'],
  enrollment_in_progress: ['40001','Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.'], concurrent_change: ['40001','Concurrent enrollment change; refresh and retry'],
  record_rejected: ['22023','Invalid enrollment fields or incompatible group']
};
assert.deepEqual(Object.keys(SCENARIOS).sort(), [...PLAN, ...FALLBACK_REASONS].sort());
const raw = /crm_enrollment|Invalid|Qualified|Student|Enrollment|Policy|Assignee|Stale|Request|Valid|Explicit|Concurrent|22023|40001|42501|[0-9a-f]{8}-/;
for (const [reason, [code, message]] of Object.entries(SCENARIOS)) {
  const error = { code, message, details: 'lead a2000000-0000-0000-0000-000000000003', hint: `crm_enrollment.${reason}` };
  const failure = enrollmentFailure(error);
  assert.equal(failure.definite, true);assert(!raw.test(failure.message), `${reason}: no raw server text, hint, SQLSTATE or identifier`);
  if (ENROLLMENT_REASONS[reason]) assert.equal(failure.message, ENROLLMENT_REASONS[reason].message, reason);
  // Old frontend + new database: the legacy matcher ignores the additive hint.
  assert.equal(commandError(error), commandError({ code, message }), `${reason}: legacy text unchanged by the hint`);
}
assert.equal(enrollmentFailure({ code: '22023', message: 'Request key payload conflict', hint: 'crm_enrollment.request_conflict' }).message, DEFINITE_GENERIC_MESSAGE);
assert.equal(enrollmentFailure({ code: '40001', message: 'Stale lead version; refresh and retry', hint: 'crm_enrollment.lead_changed' }).message, commandError({ code: '40001' }), 'lead_changed keeps today\'s text');
assert.equal(enrollmentFailure({ code: '40001', message: 'Stale lead version; refresh and retry', hint: 'crm_enrollment.lead_changed' }).recovery, 'refresh');

// New frontend + old database: no hint uses the legacy matcher, then the definite generic text.
const noHint = (code, message) => enrollmentFailure({ code, message });
assert.equal(noHint('22023', 'Existing enrollment requires explicit selection').message, 'Une inscription existe déjà pour ce programme et cette année. Sélectionnez-la.');
assert.equal(noHint('22023', 'Invalid new learner').message, DEFINITE_GENERIC_MESSAGE, 'hint-less generic becomes the definite generic');
assert.equal(noHint('22023', 'Valid future task required').message, DEFINITE_GENERIC_MESSAGE);
assert.equal(enrollmentFailure({ code: '22023', message: 'Invalid new learner', hint: 'crm_enrollment.something_new' }).message, DEFINITE_GENERIC_MESSAGE, 'unknown hint falls back');
assert.equal(noHint('42501', 'CRM access denied').message, 'Vous n’avez pas accès à cette action.');
assert.equal(noHint('40001', 'Whatever').recovery, 'refresh');
assert.equal(noHint('P0001', 'internal detail a2000000-0000-0000-0000-000000000003').message, DEFINITE_GENERIC_MESSAGE);
// Uncertain outcomes never claim that nothing was saved, and keep the key.
for (const error of [{ code: '', message: 'TypeError: Failed to fetch' }, { code: 'PGRST301', message: 'JWT' }, { message: 'Bad Gateway', status: 502 }, null]) {
  const failure = enrollmentFailure(error);
  assert.equal(failure.definite, false);assert.equal(failure.message, UNCERTAIN_MESSAGE);assert(!/rien n’a été enregistré/.test(failure.message));
  assert.equal(discardsRequestKey(error), false, 'uncertain retains the request key');
}
assert(DEFINITE_GENERIC_MESSAGE.includes('rien n’a été enregistré'));
for (const code of ['22023','42501','40001']) assert.equal(discardsRequestKey({ code }), true);
assert.equal(discardsRequestKey({ code: '23514' }), false, 'other SQLSTATEs keep today\'s retained key');

// Casablanca civil bounds with fixed clocks around Casablanca midnight. The instants
// come from the runtime's own Casablanca conversion: no UTC offset is assumed, since
// tz data versions disagree on Morocco's offset (the plan assumes no fixed difference).
const at = wall => new Date(casablancaInstant(wall));
const halfPast = at('2026-10-07T00:30'), beforeMidnight = at('2026-10-06T23:59');
assert.equal(halfPast.getTime() - beforeMidnight.getTime(), 31 * 60000, 'consecutive civil minutes across midnight');
assert.equal(casablancaToday(halfPast), '2026-10-07', '00:30 Casablanca is already the next civil day');
assert.equal(casablancaToday(beforeMidnight), '2026-10-06');
assert.equal(birthDateReason('2026-10-07', halfPast), null, 'today allowed at 00:30 Casablanca');
assert.equal(birthDateReason('2026-10-08', halfPast), 'birth_date_future');
assert.equal(birthDateReason('2026-10-07', beforeMidnight), 'birth_date_future', 'still yesterday in Casablanca');
assert.equal(birthDateReason('', beforeMidnight), null, 'blank stays valid');
assert.equal(birthDateReason('2015-01-01'), null);assert.equal(birthDateReason('07/10/2026'), 'birth_date_invalid');
assert.equal(casablancaNowInput(halfPast), '2026-10-07T00:30');
assert.equal(followupReason('2026-10-07T00:29', halfPast), 'followup_in_past');
assert.equal(followupReason('2026-10-07T00:31', halfPast), null);
assert.equal(followupReason('', halfPast), null);
assert.equal(followupReason('not-a-date'), 'followup_invalid');

// Contextual actions, plan §5 rows 1–10: exactly one action or none.
const e = status => ({ id: 'e', student_id: 's', status });
const rows = [
  [{ status: 'CONVERTED', enrollment: e('Confirmed') }, 1, 'open'], [{ status: 'QUALIFIED', enrollment: e('Validated') }, 1, 'open'],
  [{ status: 'CONVERTED', enrollment: e('Submitted') }, 2, 'open'], [{ status: 'CONVERTED', enrollment: e('Rejected') }, 2, 'open'], [{ status: 'CONVERTED', enrollment: e(null) }, 2, 'open'],
  [{ status: 'QUALIFIED', enrollment: e('Submitted') }, 3, 'continue'], [{ status: 'QUALIFIED', enrollment: e('Under Review') }, 3, 'continue'], [{ status: 'QUALIFIED', enrollment: e('Trial') }, 3, 'continue'],
  [{ status: 'NEW', enrollment: e('Submitted') }, 4, 'open'], [{ status: 'CONTACTING', enrollment: e('Trial') }, 4, 'open'], [{ status: 'ENGAGED', enrollment: e('Under Review') }, 4, 'open'],
  [{ status: 'LOST', enrollment: e('Submitted') }, 5, 'open'], [{ status: 'NOT_QUALIFIED', enrollment: e('Trial') }, 5, 'open'],
  [{ status: 'QUALIFIED', enrollment: e('Rejected') }, 6, 'open'], [{ status: 'LOST', enrollment: e('Rejected') }, 6, 'open'],
  [{ status: 'QUALIFIED', enrollment: e(null) }, 7, 'open'], [{ status: 'QUALIFIED', enrollment: e('Mystery') }, 7, 'open'], [{ status: 'CONVERTED', enrollment: null }, 7, null],
  [{ status: 'QUALIFIED', enrollment: null }, 8, 'start'],
  [{ status: 'NEW', enrollment: null }, 9, null], [{ status: 'CONTACTING', enrollment: null }, 9, null], [{ status: 'ENGAGED', enrollment: null }, 9, null],
  [{ status: 'LOST', enrollment: null }, 10, null], [{ status: 'NOT_QUALIFIED', enrollment: null }, 10, null]
];
for (const [lead, row, action] of rows) {
  const result = enrollmentAction(lead);
  assert.equal(result.row, row, JSON.stringify(lead));assert.equal(result.action, action, JSON.stringify(lead));
  assert(!/Finaliser/.test(result.note || ''), 'no Finaliser note in any state');assert(!/paiement|payer|Encaisser/i.test(result.note || ''), 'no payment wording');
}
assert.match(enrollmentAction({ status: 'CONVERTED', enrollment: e('Submitted') }).note, /vérification par la direction/);
assert.match(enrollmentAction({ status: 'ENGAGED', enrollment: e('Submitted') }).note, /Qualifiez-le à nouveau/);
assert.match(enrollmentAction({ status: 'QUALIFIED', enrollment: e('Rejected') }).note, /Inscription refusée/);
const back = '/crm/leads?lead=a2000000-0000-0000-0000-000000000001';
assert.equal(continueHref({ id: 'a2000000-0000-0000-0000-0000000000e1', student_id: 'a2000000-0000-0000-0000-0000000000a1' }, back),
  '/students/a2000000-0000-0000-0000-0000000000a1?enrollment=a2000000-0000-0000-0000-0000000000e1&returnTo=%2Fcrm%2Fleads%3Flead%3Da2000000-0000-0000-0000-000000000001');
assert.equal(studentHref({ student_id: 's1' }, back), '/students/s1?returnTo=%2Fcrm%2Fleads%3Flead%3Da2000000-0000-0000-0000-000000000001');
assert.equal(enrollmentParam('A2000000-0000-0000-0000-0000000000E1'), 'a2000000-0000-0000-0000-0000000000e1');
for (const bad of [null, undefined, '', 'x', 'a2000000-0000-0000-0000-0000000000e1;x', '<script>']) assert.equal(enrollmentParam(bad), null);

// Result origin: discovered results never claim creation by this request.
const base = { lead: { status: 'QUALIFIED' }, enrollment: { status: 'Submitted', student_name: 'Adam', session_type: 'Yearly', school_year: '2026/2027' } };
const created = enrollmentSuccess({ ...base, enrollment_followup: { id: 't', created: true, local_date: '2026-10-08', local_time: '15:20:00' } }, 'request');
assert.equal(created.heading, 'Pré-inscription créée');assert.equal(created.followup, 'Suivi « Finaliser l’inscription » prévu le 08/10/2026 à 15:20.');
assert.match(created.lead, /Le prospect reste qualifié/);assert.equal(created.learner, 'Adam · Programme annuel · 2026/2027');
assert.equal(enrollmentSuccess({ ...base, enrollment_followup: { id: 't', created: false, local_date: '2026-10-09', local_time: '10:00:00' } }, 'request').followup, 'Le suivi d’inscription déjà prévu est conservé : 09/10/2026 à 10:00.');
assert.equal(enrollmentSuccess(base, 'request').followup, 'Le suivi d’inscription apparaît dans Prochaine action.', 'pre-migration replay without the field');
assert.equal(enrollmentSuccess({ ...base, enrollment: { ...base.enrollment, status: 'Trial' } }, 'request').heading, 'Essai démarré');
assert.equal(enrollmentSuccess({ ...base, enrollment: { ...base.enrollment, status: 'Under Review' } }, 'request').heading, 'Inscription rattachée');
const confirmed = enrollmentSuccess({ lead: { status: 'CONVERTED' }, enrollment: { ...base.enrollment, status: 'Confirmed' }, enrollment_followup: null }, 'request');
assert.equal(confirmed.heading, 'Inscription confirmée rattachée');assert.equal(confirmed.followup, null);assert.match(confirmed.lead, /Le suivi commercial est terminé/);
for (const status of ['Submitted','Trial','Under Review','Confirmed']) {
  const found = enrollmentSuccess({ ...base, enrollment: { ...base.enrollment, status } }, 'discovered');
  assert.equal(found.heading, 'Inscription déjà rattachée');
  assert(!/créée|démarré|Pré-inscription créée|Essai démarré/.test(JSON.stringify(found).replace('Pré-inscription créée · En attente', '')), `discovered ${status} never claims creation`);
}
assert.equal(enrollmentSuccess(base, 'discovered').followup, 'Le suivi d’inscription apparaît dans Prochaine action.');
assert.equal(followupNotice({ local_date: '2026-10-09', local_time: '10:00:00' }), 'Un suivi d’inscription est déjà prévu le 09/10/2026 à 10:00. Il est conservé.');
console.log('PASS RCC-A2 reason table/vocabulary, definite vs uncertain, legacy compatibility, Casablanca bounds, contextual actions and result origin');
