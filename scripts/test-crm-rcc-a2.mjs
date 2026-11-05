// RCC-A2 pure contract, after EAP (migration 127, « Inscrire et encaisser »): reason
// table, definite/uncertain classifier, safe fallbacks, payment and eap.* refusals,
// Casablanca bounds, contextual actions and result origin.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandError, casablancaInstant } from '../src/lib/crm/presentation.mjs';
import { ENROLLMENT_REASONS, YEAR_REASONS, EAP_REASONS, FALLBACK_REASONS, UNCERTAIN_MESSAGE, DEFINITE_GENERIC_MESSAGE, PAID_LINK_REFUSED_MESSAGE, PAYMENT_CONFLICT_MESSAGE, isDefiniteRejection, enrollmentReason, enrollmentFailure, paymentFailure } from '../src/lib/crm/enrollmentErrors.mjs';
import { ARCHIVED_PRE_ENROLLMENT_NOTE, casablancaToday, casablancaNowInput, birthDateReason, enrollmentAction, studentHref, enrollmentParam, enrollmentSuccess, placementLine } from '../src/lib/crm/enrollmentActions.mjs';
import { EAP_REASON_TEXT } from '../src/lib/academic/membershipActions.mjs';

// The closed plan §1 vocabulary, the migration's hints and the browser table agree.
const PLAN = ['lead_unavailable','lead_already_enrolled','lead_not_qualified','program_invalid','school_year_invalid','notes_too_long','initial_status_not_permitted',
  'learner_already_linked','learner_link_mismatch','linked_learner_unavailable','learner_unavailable','learner_choice_required','learner_name_invalid','birth_date_future',
  'birth_date_invalid','candidates_changed','new_learner_confirmation_required','enrollment_incompatible','enrollment_already_linked','enrollment_group_incompatible',
  'enrollment_changed','existing_enrollment_needs_review','existing_enrollment_requires_selection','existing_enrollment_linked_elsewhere','group_incompatible','level_invalid',
  'followup_invalid','followup_in_past','owner_not_operational','followup_policy_unavailable','enrollment_in_progress','concurrent_change','record_rejected'];
assert.deepEqual(Object.keys(ENROLLMENT_REASONS).sort(), [...PLAN].sort(), 'browser table equals the plan vocabulary');
assert.deepEqual(FALLBACK_REASONS, ['request_invalid','request_conflict','lead_changed']);
// The latest command bodies (127): crm_start_enrollment and its crm_enroll_and_collect wrapper.
const eap = readFileSync(new URL('../supabase/migrations/127_enrollment_at_payment.sql', import.meta.url), 'utf8');
const commands = eap.slice(eap.indexOf('CREATE OR REPLACE FUNCTION public.crm_start_enrollment'), eap.indexOf('-- ── D4'));
const hinted = new Set([...commands.matchAll(/'crm_enrollment\.([a-z_]+)'/g)].map(m => m[1]));
assert.deepEqual([...hinted].sort(), [...PLAN, ...FALLBACK_REASONS].sort(), 'every server hint is mapped and every mapped reason is emitted');
assert(!/trial_requires_group/.test(commands), 'the essai reason is gone from the server command');
const eapHints = new Set([...commands.matchAll(/hint = 'eap\.([a-z_]+)'/g)].map(m => m[1]));
assert.deepEqual([...eapHints].sort(), Object.keys(EAP_REASONS).sort(), 'the wrapper\'s eap.* refusals are mapped');
for (const [reason, entry] of Object.entries(EAP_REASONS)) assert.equal(entry.message, EAP_REASON_TEXT[reason], `${reason}: the shared French wording`);
const FIELDS = [null,'name','birth','confirmNew','session','year','level','group','amount'];
for (const [reason, entry] of Object.entries({ ...ENROLLMENT_REASONS, ...EAP_REASONS })) {
  assert(entry.message && /[éèàâêîôûçÉ’«]|^[A-Z]/.test(entry.message) && !/[A-Za-z]+_[a-z]+|crm_|SQL|uuid/i.test(entry.message), `${reason}: French message without tokens`);
  assert([null,1,2,3].includes(entry.step), `${reason}: step`);assert(FIELDS.includes(entry.field), `${reason}: field`);
  assert([true,false,'until-change'].includes(entry.submit), `${reason}: submit`);
  assert(['close','discovered','correct','linked','escalate','reselect','refresh','enrollments','retry'].includes(entry.recovery), `${reason}: recovery`);
  if (entry.field) assert(entry.step, `${reason}: a field always has a step`);
}
for (const reason of ['birth_date_future','birth_date_invalid','learner_name_invalid']) assert.equal(ENROLLMENT_REASONS[reason].step, 1, `${reason} goes to step 1, not step 2`);
for (const reason of ['lead_unavailable','lead_already_enrolled','lead_not_qualified','linked_learner_unavailable','followup_policy_unavailable','initial_status_not_permitted']) assert.equal(ENROLLMENT_REASONS[reason].submit, false);
for (const reason of Object.keys(ENROLLMENT_REASONS)) assert.notEqual(ENROLLMENT_REASONS[reason].field, 'due', `${reason}: no follow-up date field any more`);
assert.doesNotMatch(JSON.stringify(ENROLLMENT_REASONS), /pré-inscription|essai/i, 'no retired wording');
assert.equal(ENROLLMENT_REASONS.lead_already_enrolled.recovery, 'discovered');
assert.equal(ENROLLMENT_REASONS.learner_already_linked.message, ENROLLMENT_REASONS.learner_link_mismatch.message);
assert(!Object.values(ENROLLMENT_REASONS).some(r => /paiement/.test(r.message) && r !== ENROLLMENT_REASONS.enrollment_in_progress), 'only the intent-lock text mentions payment among crm_enrollment reasons');

// Definite rejection only when a SQLSTATE proves the rollback.
for (const code of ['22023','PT409','40001','42501','P0001','23514','22P02']) assert.equal(isDefiniteRejection({ code }), true, code);
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
  lead_changed: ['PT409','Stale lead version; refresh and retry'], program_invalid: ['22023','Invalid enrollment program or school year'],
  school_year_invalid: ['22023','Invalid enrollment program or school year'], notes_too_long: ['22023','Invalid enrollment program or school year'],
  initial_status_not_permitted: ['42501','Only pre-confirmation enrollment initiation is permitted'], learner_already_linked: ['22023','Invalid new learner'],
  learner_link_mismatch: ['22023','Student unavailable or inconsistent'], linked_learner_unavailable: ['22023','Student unavailable or inconsistent'],
  learner_unavailable: ['22023','Student unavailable or inconsistent'], learner_choice_required: ['22023','Explicit student choice required'],
  learner_name_invalid: ['22023','Invalid new learner'], birth_date_future: ['22023','Invalid new learner'], birth_date_invalid: ['22023','Invalid enrollment fields or incompatible group'],
  candidates_changed: ['PT409','Student candidates changed; review again'], new_learner_confirmation_required: ['22023','Explicit new learner decision required'],
  enrollment_incompatible: ['22023','Enrollment unavailable or incompatible'], enrollment_already_linked: ['22023','Enrollment unavailable or incompatible'],
  enrollment_group_incompatible: ['22023','Enrollment group must match session and level'], enrollment_changed: ['PT409','Stale enrollment; refresh and retry'],
  existing_enrollment_needs_review: ['22023','Existing enrollment status requires review'], existing_enrollment_requires_selection: ['22023','Existing enrollment requires explicit selection'],
  existing_enrollment_linked_elsewhere: ['22023','Existing enrollment requires explicit selection'], group_incompatible: ['22023','Enrollment group must match session and level'],
  level_invalid: ['22023','Invalid level for selected program'],
  followup_invalid: ['22023','Invalid enrollment fields or incompatible group'], followup_in_past: ['22023','Valid future task required'],
  owner_not_operational: ['22023','Assignee must be operational staff'], followup_policy_unavailable: ['22023','Policy has no available calling window'],
  enrollment_in_progress: ['PT409','Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.'], concurrent_change: ['PT409','Concurrent enrollment change; refresh and retry'],
  record_rejected: ['22023','Invalid enrollment fields or incompatible group']
};
assert.deepEqual(Object.keys(SCENARIOS).sort(), [...PLAN, ...FALLBACK_REASONS].sort());
const raw = /crm_enrollment|Invalid|Qualified|Student|Enrollment|Policy|Assignee|Stale|Request|Valid|Explicit|Concurrent|22023|PT409|40001|42501|[0-9a-f]{8}-/;
for (const [reason, [code, message]] of Object.entries(SCENARIOS)) {
  const error = { code, message, details: 'lead a2000000-0000-0000-0000-000000000003', hint: `crm_enrollment.${reason}` };
  const failure = enrollmentFailure(error);
  assert.equal(failure.definite, true);assert(!raw.test(failure.message), `${reason}: no raw server text, hint, SQLSTATE or identifier`);
  if (ENROLLMENT_REASONS[reason]) assert.equal(failure.message, ENROLLMENT_REASONS[reason].message, reason);
  // Old frontend + new database: the legacy matcher ignores the additive hint.
  assert.equal(commandError(error), commandError({ code, message }), `${reason}: legacy text unchanged by the hint`);
  // Database before migration 119: the legacy conflict code maps exactly like PT409.
  if (code === 'PT409') assert.deepEqual(enrollmentFailure({ ...error, code: '40001' }), failure, `${reason}: legacy code`);
}
assert.equal(enrollmentFailure({ code: '22023', message: 'Request key payload conflict', hint: 'crm_enrollment.request_conflict' }).message, DEFINITE_GENERIC_MESSAGE);
for (const code of ['PT409', '40001']) {
  assert.equal(enrollmentFailure({ code, message: 'Stale lead version; refresh and retry', hint: 'crm_enrollment.lead_changed' }).message, commandError({ code }), 'lead_changed keeps today\'s text');
  assert.equal(enrollmentFailure({ code, message: 'Stale lead version; refresh and retry', hint: 'crm_enrollment.lead_changed' }).recovery, 'refresh');
}

// New frontend + old database: no hint uses the legacy matcher, then the definite generic text.
const noHint = (code, message) => enrollmentFailure({ code, message });
assert.equal(noHint('22023', 'Existing enrollment requires explicit selection').message, 'Une inscription existe déjà pour ce programme et cette année. Sélectionnez-la.');
assert.equal(noHint('22023', 'Invalid new learner').message, DEFINITE_GENERIC_MESSAGE, 'hint-less generic becomes the definite generic');
assert.equal(noHint('22023', 'Valid future task required').message, DEFINITE_GENERIC_MESSAGE);
assert.equal(enrollmentFailure({ code: '22023', message: 'Invalid new learner', hint: 'crm_enrollment.something_new' }).message, DEFINITE_GENERIC_MESSAGE, 'unknown hint falls back');
assert.equal(noHint('42501', 'CRM access denied').message, 'Vous n’avez pas accès à cette action.');
for (const code of ['PT409', '40001']) assert.equal(noHint(code, 'Whatever').recovery, 'refresh', code);
assert.equal(noHint('P0001', 'internal detail a2000000-0000-0000-0000-000000000003').message, DEFINITE_GENERIC_MESSAGE);
// Uncertain outcomes never claim that nothing was saved, and keep the key.
for (const error of [{ code: '', message: 'TypeError: Failed to fetch' }, { code: 'PGRST301', message: 'JWT' }, { message: 'Bad Gateway', status: 502 }, null]) {
  const failure = enrollmentFailure(error);
  assert.equal(failure.definite, false);assert.equal(failure.message, UNCERTAIN_MESSAGE);assert(!/rien n’a été enregistré/.test(failure.message));
}
assert(DEFINITE_GENERIC_MESSAGE.includes('rien n’a été enregistré'));

// EAP: the wrapper's refusals and the payment command's hint-less refusals.
const required = { code: '22023', message: 'L’inscription se confirme à l’encaissement : saisissez un paiement.', hint: 'eap.payment_required' };
assert.deepEqual(enrollmentFailure(required), { definite: true, reason: 'payment_required', ...EAP_REASONS.payment_required });
assert.equal(enrollmentFailure(required).step, 3);assert.equal(enrollmentFailure(required).field, 'amount');
const refusedLink = enrollmentFailure(required, { linkingPaid: true });
assert.equal(refusedLink.message, PAID_LINK_REFUSED_MESSAGE);assert.equal(refusedLink.recovery, 'pay', 'a refused paid link moves to the payment step');assert.equal(refusedLink.step, 3);
const other = enrollmentFailure({ code: '22023', message: 'Choisissez le programme de l’inscription : « Autre » s’encaisse sans inscription.', hint: 'eap.program_not_enrollable' });
assert.equal(other.message, EAP_REASON_TEXT.program_not_enrollable);assert.equal(other.field, 'session');assert.equal(other.step, 2);
assert.equal(enrollmentFailure({ code: '23514', message: 'x', hint: 'eap.status_retired' }).message, EAP_REASON_TEXT.status_retired);
const today = 'La date du paiement ne peut pas être dans le futur (aujourd’hui à Casablanca : 04/11/2026).';
for (const [message, field] of [['Indiquez le motif de la remise.', 'reasonCode'], ['Motif de remise inconnu.', 'reasonCode'], ['Précisez le motif de la remise « Autre ».', 'reasonText'],
  ['Le motif de la remise ne doit pas dépasser 200 caractères.', 'reasonText'], [today, 'paymentDate'], ['La date du paiement ne peut pas être antérieure de plus de 7 jours.', 'paymentDate']]) {
  const refused = enrollmentFailure({ code: '22023', message });
  assert.deepEqual([refused.message, refused.step, refused.field, refused.recovery], [message, 3, field, 'correct'], message);
}
assert.equal(paymentFailure({ code: '22023', message: 'Indiquez le motif de la remise. drop table' }), null, 'only the exact desk-guard texts are shown as is');
assert.equal(paymentFailure({ code: '22023', message: 'Indiquez le motif de la remise.', hint: 'crm_enrollment.request_invalid' }), null, 'a hinted error is never a payment refusal');
assert.equal(paymentFailure({ message: 'Indiquez le motif de la remise.' }), null, 'an uncertain outcome is never a payment refusal');
assert.equal(enrollmentFailure({ code: 'P0001', message: 'Payment exceeds the remaining balance of 100.00 MAD.' }).field, 'amount');
assert.doesNotMatch(enrollmentFailure({ code: 'P0001', message: 'Payment exceeds the remaining balance of 100.00 MAD.' }).message, /Payment|MAD\./);
assert.deepEqual([enrollmentFailure({ code: 'P0001', message: 'Idempotency key conflict: request contents changed.' }).message, enrollmentFailure({ code: 'P0001', message: 'Idempotency key conflict: request contents changed.' }).submit], [PAYMENT_CONFLICT_MESSAGE, false]);
assert.equal(enrollmentFailure({ code: 'P0001', message: 'Invalid price or discount.' }).field, 'gross');
assert.equal(enrollmentFailure({ code: 'P0001', message: 'A valid email recipient is required when email delivery is requested.' }).field, 'emailRecipient');

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

// Contextual actions, plan §5 rows: exactly one action or none. EAP (D6): former rows
// 3–5 (pre-inscription or essai, by lead state) are one historical row 3.
const e = status => ({ id: 'e', student_id: 's', status });
const rows = [
  [{ status: 'CONVERTED', enrollment: e('Confirmed') }, 1, 'open'], [{ status: 'QUALIFIED', enrollment: e('Validated') }, 1, 'open'],
  [{ status: 'CONVERTED', enrollment: e('Submitted') }, 2, 'open'], [{ status: 'CONVERTED', enrollment: e('Rejected') }, 2, 'open'], [{ status: 'CONVERTED', enrollment: e(null) }, 2, 'open'],
  [{ status: 'QUALIFIED', enrollment: e('Submitted') }, 3, 'open'], [{ status: 'QUALIFIED', enrollment: e('Under Review') }, 3, 'open'], [{ status: 'QUALIFIED', enrollment: e('Trial') }, 3, 'open'],
  [{ status: 'NEW', enrollment: e('Submitted') }, 3, 'open'], [{ status: 'CONTACTING', enrollment: e('Trial') }, 3, 'open'], [{ status: 'ENGAGED', enrollment: e('Under Review') }, 3, 'open'],
  [{ status: 'LOST', enrollment: e('Submitted') }, 3, 'open'], [{ status: 'NOT_QUALIFIED', enrollment: e('Trial') }, 3, 'open'],
  [{ status: 'QUALIFIED', enrollment: e('Rejected') }, 6, 'open'], [{ status: 'LOST', enrollment: e('Rejected') }, 6, 'open'],
  [{ status: 'QUALIFIED', enrollment: e(null) }, 7, 'open'], [{ status: 'QUALIFIED', enrollment: e('Mystery') }, 7, 'open'], [{ status: 'CONVERTED', enrollment: null }, 7, null],
  [{ status: 'QUALIFIED', enrollment: null }, 8, 'start'],
  [{ status: 'NEW', enrollment: null }, 9, null], [{ status: 'CONTACTING', enrollment: null }, 9, null], [{ status: 'ENGAGED', enrollment: null }, 9, null],
  [{ status: 'LOST', enrollment: null }, 10, null], [{ status: 'NOT_QUALIFIED', enrollment: null }, 10, null]
];
for (const [lead, row, action] of rows) {
  const result = enrollmentAction(lead);
  assert.equal(result.row, row, JSON.stringify(lead));assert.equal(result.action, action, JSON.stringify(lead));
  assert(!/Finaliser/.test(result.note || ''), 'no Finaliser note in any state');
  if (row === 3) assert.equal(result.note, ARCHIVED_PRE_ENROLLMENT_NOTE);else assert(!/paiement|payer|Encaisser/i.test(result.note || ''), 'no payment wording outside the historical row');
  assert.notEqual(result.action, 'continue', 'no « Continuer l’inscription » any more');
}
assert.equal(ARCHIVED_PRE_ENROLLMENT_NOTE, 'Ancienne pré-inscription archivée ; relancez « Inscrire et encaisser » si le prospect s’inscrit.');
assert.match(enrollmentAction({ status: 'CONVERTED', enrollment: e('Submitted') }).note, /vérification par la direction/);
// An enrollment ended after its confirmation raises no server review: its note claims none.
assert.deepEqual(enrollmentAction({ status: 'CONVERTED', enrollment: e('Ended') }), { row: 2, action: 'open', note: 'Inscription terminée après sa confirmation. Le prospect reste converti.' });
assert.match(enrollmentAction({ status: 'QUALIFIED', enrollment: e('Rejected') }).note, /Inscription refusée/);
const back = '/crm/leads?lead=a2000000-0000-0000-0000-000000000001';
assert.equal(studentHref({ student_id: 's1' }, back), '/students/s1?returnTo=%2Fcrm%2Fleads%3Flead%3Da2000000-0000-0000-0000-000000000001');
assert.equal(enrollmentParam('A2000000-0000-0000-0000-0000000000E1'), 'a2000000-0000-0000-0000-0000000000e1');
for (const bad of [null, undefined, '', 'x', 'a2000000-0000-0000-0000-0000000000e1;x', '<script>']) assert.equal(enrollmentParam(bad), null);

// Result origin: discovered results never claim this request's work; the request's own
// result names the receipt, the 100 % discount or the paid link (Q12), and the group.
const enrolled = { student_name: 'Adam', session_type: 'Yearly', school_year: '2026/2027', status: 'Confirmed', group_name: null };
const paidResult = { lead: { status: 'CONVERTED' }, enrollment: enrolled, receipt_id: 'r', receipt_number: '2026-0443', free_enrollment: false, replayed_enrollment: false, replayed_payment: false };
const paidView = enrollmentSuccess(paidResult, 'request', { placement: null });
assert.equal(paidView.heading, 'Inscription confirmée · reçu 2026-0443');assert.equal(paidView.learner, 'Adam · Programme annuel · 2026/2027');
assert.equal(paidView.group, 'Groupe à affecter');assert.equal(paidView.intro, null);assert.match(paidView.lead, /Prospect converti/);
assert.equal(enrollmentSuccess({ ...paidResult, receipt_id: null, receipt_number: null, free_enrollment: true }, 'request').heading, 'Inscription confirmée sans paiement (remise 100 %)');
assert.equal(enrollmentSuccess({ ...paidResult, receipt_id: null, receipt_number: null }, 'request', { linkedPaid: true }).heading, 'Inscription payée rattachée');
assert.match(enrollmentSuccess({ ...paidResult, replayed_enrollment: true, replayed_payment: true }, 'request').intro, /déjà enregistrée/);
assert.equal(enrollmentSuccess(paidResult, 'request', { placement: { status: 'placed', name: 'Kids A' } }).group, 'Groupe : Kids A');
assert.equal(enrollmentSuccess(paidResult, 'request', { placement: { status: 'failed', message: 'Ce groupe est complet.' } }).group,
  'Groupe non affecté : Ce groupe est complet. Apprenant inscrit — groupe à affecter.', 'a placement refusal never reads as a payment failure');
assert.equal(placementLine(null, { ...enrolled, group_name: 'Teens B' }), 'Groupe : Teens B', 'a linked Validated enrollment keeps its group');
for (const status of ['Submitted','Trial','Under Review','Confirmed']) {
  const found = enrollmentSuccess({ lead: { status: 'QUALIFIED' }, enrollment: { ...enrolled, status } }, 'discovered');
  assert.equal(found.heading, 'Inscription déjà rattachée');
  assert(!/reçu|remise|payée rattachée/.test(JSON.stringify(found)), `discovered ${status} never claims this request's payment`);
}
// Batch H (H5): the placement year check (egc.* hint) has its own French text, no "Réessayez".
for (const [hint, message] of [['egc.school_year_mismatch', 'L’année scolaire de l’inscription (2025/2026) ne correspond pas à celle du groupe (2026/2027).'],
  ['egc.group_year_missing', 'Renseignez l’année scolaire du groupe.']]) {
  const failure = enrollmentFailure({ code: '22023', message, hint });
  assert.equal(failure.definite, true, hint);assert.equal(failure.field, 'group', hint);assert.equal(failure.recovery, 'correct', hint);
  assert.equal(failure.message, YEAR_REASONS[hint.slice(4)].message, hint);assert.doesNotMatch(failure.message, /Réessayez|egc\./, hint);
}
// EAP (D3/D6) source contract of the dialog, the panel section and the follow-up label.
const dialogSource = readFileSync(new URL('../src/components/crm/CrmEnrollmentDialog.jsx', import.meta.url), 'utf8');
assert.equal((dialogSource.match(/crmRpc\('crm_enroll_and_collect'/g) || []).length, 1, 'one submit command');
assert.match(dialogSource, /crmRpc\('crm_enroll_and_collect', \{ p_request_key: requestKey\.current, p_data: sent\.payload \}\)/, 'the request key of this dialog opening, reused for every resend');
assert.match(dialogSource, /if \(!requestKey\.current\) requestKey\.current = crypto\.randomUUID\(\);/);
assert.doesNotMatch(dialogSource, /crm_start_enrollment|initial_status|group_id|idempotency_key|Démarrage|'Trial'|Pré-inscription|followup_at|customDue/, 'no retired path or client-side idempotency key');
assert.match(dialogSource, /if \(f\.mode === 'link' && f\.enrollment\) return \{ enrollment \};/, 'a paid link sends no payment object (Q12)');
assert.match(dialogSource, /placeLearnerInGroup\(client, \{ student, group: groupId, enrollment \}\)/, 'placement after the payment on re-read rows');
assert.match(dialogSource, /from\('students'\)\.select\('id,updated_at'\)[\s\S]*from\('enrollments'\)\.select\('id,updated_at'\)/);
const sectionSource = readFileSync(new URL('../src/components/crm/LeadEnrollmentSection.jsx', import.meta.url), 'utf8');
assert.match(sectionSource, />Inscrire et encaisser<\/Button>/);assert.doesNotMatch(sectionSource, /Commencer l|Continuer l/);
assert.match(readFileSync(new URL('../src/components/crm/CrmActionDialog.jsx', import.meta.url), 'utf8'), /enrollment_followup: 'Suivi d’inscription'/);
console.log('PASS RCC-A2 reason table/vocabulary, definite vs uncertain, legacy compatibility, Casablanca bounds, contextual actions, result origin and the « Inscrire et encaisser » dialog contract');
