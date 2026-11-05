// RCC-A2 enrollment initiation error contract, reached through « Inscrire et
// encaisser » (crm_enroll_and_collect, migration 127). The server keeps SQLSTATE and
// message unchanged and adds a closed crm_enrollment.* or eap.* HINT; the browser maps
// only known reasons and never renders raw server text, hints or identifiers.
import { commandError } from './presentation.mjs';
import { isRecordConflict } from '../conflictErrors.mjs';
import { EAP_REASON_TEXT, eapReason } from '../academic/membershipActions.mjs';

// submit: true, false (blocked for this dialog) or 'until-change' (blocked until
// the receptionist changes the selection). recovery drives the dialog response.
export const ENROLLMENT_REASONS = {
  lead_unavailable: { message: 'Ce prospect n’est plus disponible. Fermez puis rouvrez la liste.', step: null, field: null, submit: false, recovery: 'close' },
  lead_already_enrolled: { message: 'Une inscription a déjà été commencée pour ce prospect.', step: null, field: null, submit: false, recovery: 'discovered' },
  lead_not_qualified: { message: 'Ce prospect n’est plus « Qualifié ». Qualifiez le projet avant de commencer une inscription.', step: null, field: null, submit: false, recovery: 'close' },
  program_invalid: { message: 'Choisissez un programme de la liste.', step: 2, field: 'session', submit: true, recovery: 'correct' },
  school_year_invalid: { message: 'Indiquez l’année scolaire au format 2026/2027 (deux années consécutives).', step: 2, field: 'year', submit: true, recovery: 'correct' },
  notes_too_long: { message: 'La note ne peut pas dépasser 2000 caractères.', step: 2, field: null, submit: true, recovery: 'correct' },
  // EAP: the wrapper always asks for a Confirmed enrollment; an older build sent another status.
  initial_status_not_permitted: { message: 'L’inscription se confirme à l’encaissement. Fermez puis rouvrez « Inscrire et encaisser ».', step: null, field: null, submit: false, recovery: 'close' },
  learner_already_linked: { message: 'Ce prospect est déjà rattaché à un apprenant. L’inscription doit être créée pour cet apprenant.', step: 1, field: null, submit: true, recovery: 'linked' },
  learner_link_mismatch: { message: 'Ce prospect est déjà rattaché à un apprenant. L’inscription doit être créée pour cet apprenant.', step: 1, field: null, submit: true, recovery: 'linked' },
  linked_learner_unavailable: { message: 'Le dossier de l’apprenant rattaché à ce prospect n’est plus actif. Contactez la direction.', step: 1, field: null, submit: false, recovery: 'escalate' },
  learner_unavailable: { message: 'Ce dossier d’apprenant n’est plus disponible. Choisissez un autre apprenant.', step: 1, field: null, submit: true, recovery: 'reselect' },
  learner_choice_required: { message: 'Choisissez un apprenant existant ou créez un nouvel apprenant.', step: 1, field: null, submit: true, recovery: 'correct' },
  learner_name_invalid: { message: 'Indiquez le nom de l’apprenant (2 à 120 caractères).', step: 1, field: 'name', submit: true, recovery: 'correct' },
  birth_date_future: { message: 'La date de naissance ne peut pas être dans le futur.', step: 1, field: 'birth', submit: true, recovery: 'correct' },
  birth_date_invalid: { message: 'Date de naissance invalide. Corrigez-la ou laissez le champ vide.', step: 1, field: 'birth', submit: true, recovery: 'correct' },
  candidates_changed: { message: 'Les apprenants existants ont changé. Vérifiez à nouveau les correspondances.', step: 1, field: null, submit: true, recovery: 'refresh' },
  new_learner_confirmation_required: { message: 'Vérifiez les correspondances et confirmez qu’il s’agit d’un autre apprenant.', step: 1, field: 'confirmNew', submit: true, recovery: 'correct' },
  enrollment_incompatible: { message: 'Cette inscription ne correspond plus à l’apprenant, au programme ou à l’année. Choisissez à nouveau.', step: 2, field: null, submit: true, recovery: 'enrollments' },
  enrollment_already_linked: { message: 'Cette inscription est déjà rattachée à un autre prospect.', step: 2, field: null, submit: true, recovery: 'enrollments' },
  enrollment_group_incompatible: { message: 'Le groupe de cette inscription ne correspond pas à son programme ou niveau. Demandez à l’administration de la corriger.', step: 2, field: null, submit: 'until-change', recovery: 'escalate' },
  enrollment_changed: { message: 'Cette inscription a changé. Les informations sont actualisées.', step: 2, field: null, submit: true, recovery: 'enrollments' },
  existing_enrollment_needs_review: { message: 'Une inscription existe sans statut. Demandez à l’administration de la vérifier avant de poursuivre.', step: 2, field: null, submit: 'until-change', recovery: 'escalate' },
  existing_enrollment_requires_selection: { message: 'Une inscription existe déjà pour ce programme et cette année. Sélectionnez-la.', step: 2, field: null, submit: true, recovery: 'enrollments' },
  existing_enrollment_linked_elsewhere: { message: 'Cet apprenant a déjà une inscription pour ce programme et cette année, rattachée à un autre prospect. Choisissez un autre programme ou une autre année, ou clôturez ce prospect comme doublon.', step: 2, field: 'session', submit: true, recovery: 'enrollments' },
  group_incompatible: { message: 'Le groupe choisi ne correspond plus au programme ou au niveau. Choisissez un autre groupe.', step: 2, field: 'group', submit: true, recovery: 'correct' },
  level_invalid: { message: 'Choisissez un niveau compatible avec le programme.', step: 2, field: 'level', submit: true, recovery: 'correct' },
  // The follow-up branch remains in the server command but a Confirmed enrollment
  // converts the prospect first; no follow-up date is chosen in this dialog any more.
  followup_invalid: { message: 'Le suivi d’inscription n’a pas pu être planifié. Réessayez ; si le problème persiste, contactez la direction.', step: null, field: null, submit: true, recovery: 'correct' },
  followup_in_past: { message: 'Le suivi d’inscription n’a pas pu être planifié. Réessayez ; si le problème persiste, contactez la direction.', step: null, field: null, submit: true, recovery: 'correct' },
  owner_not_operational: { message: 'Le responsable de ce prospect n’est plus un membre actif de l’équipe. Attribuez un responsable (Autres actions → Attribuer un responsable), puis réessayez.', step: null, field: null, submit: true, recovery: 'correct' },
  followup_policy_unavailable: { message: 'Le calendrier de suivi ne permet pas de planifier ce suivi. Demandez à la direction de vérifier les horaires.', step: null, field: null, submit: false, recovery: 'escalate' },
  enrollment_in_progress: { message: 'Une inscription ou un paiement est en cours pour cet apprenant. Patientez puis réessayez.', step: null, field: null, submit: true, recovery: 'retry' },
  concurrent_change: { message: 'Ce prospect a changé pendant l’enregistrement. Les informations sont actualisées.', step: null, field: null, submit: true, recovery: 'refresh' },
  record_rejected: { message: 'Ces informations n’ont pas pu être enregistrées. Vérifiez le programme, le niveau et le groupe ; si le problème persiste, contactez la direction.', step: 2, field: null, submit: true, recovery: 'correct' }
};
// Batch H (H5): the placement year check answers with an egc.* hint (no "Réessayez":
// the group or the year must change).
export const YEAR_REASONS = {
  school_year_mismatch: { message: 'L’année scolaire de l’inscription doit être celle du groupe. Choisissez un groupe de cette année ou une autre année.', step: 2, field: 'group', submit: true, recovery: 'correct' },
  group_year_missing: { message: 'Ce groupe n’a pas d’année scolaire. Choisissez un autre groupe ou demandez à la direction de la renseigner.', step: 2, field: 'group', submit: true, recovery: 'correct' },
};
// EAP (migration 127): the wrapper's own refusals, in the shared French wording.
// payment_required on a « Rattacher cette inscription payée » request means the linked
// enrollment has no payment: the dialog moves to the payment step (recovery 'pay').
export const EAP_REASONS = {
  payment_required: { message: EAP_REASON_TEXT.payment_required, step: 3, field: 'amount', submit: true, recovery: 'correct' },
  program_not_enrollable: { message: EAP_REASON_TEXT.program_not_enrollable, step: 2, field: 'session', submit: true, recovery: 'correct' },
  // The chosen enrollment already has a charge: step 2 re-reads the enrollments, which
  // then offer « Encaisser sur ce montant » (receipt form) or the Q12 link.
  enrollment_already_charged: { message: EAP_REASON_TEXT.enrollment_already_charged, step: 2, field: null, submit: true, recovery: 'enrollments' },
};
export const PAID_LINK_REFUSED_MESSAGE = 'Aucun paiement n’est enregistré pour cette inscription : saisissez le paiement pour la confirmer.';
// Payment refusals of create_charge_payment (122) carry no hint. The desk guard answers
// in French and is shown as is; the few English checks get their French text here.
export const PAYMENT_CONFLICT_MESSAGE = 'Ce paiement a peut-être déjà été enregistré. Ne le saisissez pas une deuxième fois : fermez cette fenêtre et vérifiez les reçus de l’apprenant.';
const PAYMENT_GUARD = /^(Indiquez le motif de la remise\.|Motif de remise inconnu\.|Précisez le motif de la remise « Autre »\.|Le motif de la remise ne doit pas dépasser 200 caractères\.|La date du paiement ne peut pas (être dans le futur \(aujourd’hui à Casablanca : \d\d\/\d\d\/\d{4}\)|être antérieure de plus de \d+ jours)\.)$/;
const PAYMENT_FIELDS = [[/^(Indiquez|Motif de remise)/, 'reasonCode'], [/^(Précisez|Le motif)/, 'reasonText'], [/^La date du paiement/, 'paymentDate']];
const PAYMENT_TEXT = [
  [/^Idempotency key conflict/, PAYMENT_CONFLICT_MESSAGE, null, false],
  [/^Payment exceeds the remaining balance/, 'Le paiement dépasse le prix net. Corrigez le montant payé.', 'amount', true],
  [/^Invalid price or discount/, 'Vérifiez le prix convenu et la remise.', 'gross', true],
  [/^A valid email recipient/, 'Indiquez un destinataire e-mail valide ou désactivez l’envoi.', 'emailRecipient', true],
];
// Programming-error reasons and the stale lead version keep the generic or
// existing behavior; they are recognised but have no dedicated text.
export const FALLBACK_REASONS = ['request_invalid', 'request_conflict', 'lead_changed'];

export const UNCERTAIN_MESSAGE = 'Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.';
export const DEFINITE_GENERIC_MESSAGE = 'L’inscription n’a pas pu être créée et rien n’a été enregistré. Réessayez ; si le problème persiste, contactez la direction.';
const LEGACY_GENERIC = 'Vérifiez les champs, la date future et les conditions de cette action.';

// Only a PostgreSQL SQLSTATE proves the database rolled the request back.
// Network, gateway, HTTP 5xx and PGRST… failures leave the commit unknown.
export function isDefiniteRejection(error) {
  return typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code);
}
export function enrollmentReason(error) {
  const match = /^crm_enrollment\.([a-z_]+)$/.exec(typeof error?.hint === 'string' ? error.hint : '');
  return match && (ENROLLMENT_REASONS[match[1]] || FALLBACK_REASONS.includes(match[1])) ? match[1] : null;
}
// The payment step's refusal for a hint-less create_charge_payment error, or null.
export function paymentFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (!isDefiniteRejection(error) || error.hint) return null;
  if (error.code === '22023' && PAYMENT_GUARD.test(message)) {
    return { definite: true, reason: 'payment_refused', message, step: 3, field: PAYMENT_FIELDS.find(([pattern]) => pattern.test(message))?.[1] || null, submit: true, recovery: 'correct' };
  }
  const known = PAYMENT_TEXT.find(([pattern]) => pattern.test(message));
  return known ? { definite: true, reason: 'payment_refused', message: known[1], step: known[3] ? 3 : null, field: known[2], submit: known[3], recovery: known[3] ? 'correct' : 'close' } : null;
}
// A pure description of what the dialog must do; message is always our own text.
// linkingPaid: the request linked an existing enrollment without a payment (Q12).
export function enrollmentFailure(error, { linkingPaid = false } = {}) {
  if (!isDefiniteRejection(error)) return { definite: false, reason: null, message: UNCERTAIN_MESSAGE, step: null, field: null, submit: true, recovery: 'uncertain' };
  const reason = enrollmentReason(error), known = ENROLLMENT_REASONS[reason];
  if (known) return { definite: true, reason, ...known };
  const eap = eapReason(error.hint);
  if (eap === 'payment_required' && linkingPaid) return { definite: true, reason: eap, message: PAID_LINK_REFUSED_MESSAGE, step: 3, field: null, submit: true, recovery: 'pay' };
  if (eap) return { definite: true, reason: eap, ...(EAP_REASONS[eap] || { message: EAP_REASON_TEXT[eap], step: null, field: null, submit: true, recovery: 'correct' }) };
  const payment = paymentFailure(error);
  if (payment) return payment;
  const year = /^egc\.(school_year_mismatch|group_year_missing)$/.exec(typeof error?.hint === 'string' ? error.hint : '');
  if (year) return { definite: true, reason: year[1], ...YEAR_REASONS[year[1]] };
  if (isRecordConflict(error)) return { definite: true, reason, message: commandError(error), step: null, field: null, submit: true, recovery: 'refresh' };
  if (error.code === '42501' && !reason) return { definite: true, reason, message: commandError(error), step: null, field: null, submit: true, recovery: 'correct' };
  const legacy = reason ? null : commandError(error);
  return { definite: true, reason, message: legacy && ![LEGACY_GENERIC, UNCERTAIN_MESSAGE].includes(legacy) ? legacy : DEFINITE_GENERIC_MESSAGE,
    step: null, field: null, submit: true, recovery: 'correct' };
}
