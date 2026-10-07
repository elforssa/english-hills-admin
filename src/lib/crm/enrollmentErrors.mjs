// RCC-A2 enrollment initiation error contract. The server keeps SQLSTATE and
// message unchanged and adds a closed crm_enrollment.* HINT; the browser maps
// only known reasons and never renders raw server text, hints or identifiers.
import { commandError } from './presentation.mjs';

// submit: true, false (blocked for this dialog) or 'until-change' (blocked until
// the receptionist changes the selection). recovery drives the dialog response.
export const ENROLLMENT_REASONS = {
  lead_unavailable: { message: 'Ce prospect n’est plus disponible. Fermez puis rouvrez la liste.', step: null, field: null, submit: false, recovery: 'close' },
  lead_already_enrolled: { message: 'Une inscription a déjà été commencée pour ce prospect.', step: null, field: null, submit: false, recovery: 'discovered' },
  lead_not_qualified: { message: 'Ce prospect n’est plus « Qualifié ». Qualifiez le projet avant de commencer une inscription.', step: null, field: null, submit: false, recovery: 'close' },
  program_invalid: { message: 'Choisissez un programme de la liste.', step: 2, field: 'session', submit: true, recovery: 'correct' },
  school_year_invalid: { message: 'Indiquez l’année scolaire au format 2026/2027 (deux années consécutives).', step: 2, field: 'year', submit: true, recovery: 'correct' },
  notes_too_long: { message: 'La note ne peut pas dépasser 2000 caractères.', step: 2, field: 'notes', submit: true, recovery: 'correct' },
  initial_status_not_permitted: { message: 'Seule une pré-inscription ou un essai peut être démarré ici. La confirmation suit le parcours habituel.', step: 2, field: 'status', submit: true, recovery: 'correct' },
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
  trial_requires_group: { message: 'Un essai nécessite un groupe. Choisissez un groupe ou démarrez une pré-inscription.', step: 2, field: 'group', submit: true, recovery: 'correct' },
  followup_invalid: { message: 'Date de suivi invalide. Choisissez une date et une heure, ou laissez la valeur par défaut.', step: 2, field: 'due', submit: true, recovery: 'correct' },
  followup_in_past: { message: 'Cette date de suivi est passée. Choisissez une date future ou gardez le suivi par défaut.', step: 2, field: 'due', submit: true, recovery: 'correct' },
  owner_not_operational: { message: 'Le responsable de ce prospect n’est plus un membre actif de l’équipe. Attribuez un responsable (Autres actions → Attribuer un responsable), puis réessayez.', step: null, field: null, submit: true, recovery: 'correct' },
  followup_policy_unavailable: { message: 'Le calendrier de suivi ne permet pas de planifier ce suivi. Demandez à la direction de vérifier les horaires.', step: null, field: null, submit: false, recovery: 'escalate' },
  enrollment_in_progress: { message: 'Une inscription ou un paiement est en cours pour cet apprenant. Patientez puis réessayez.', step: null, field: null, submit: true, recovery: 'retry' },
  concurrent_change: { message: 'Ce prospect a changé pendant l’enregistrement. Les informations sont actualisées.', step: null, field: null, submit: true, recovery: 'refresh' },
  record_rejected: { message: 'Ces informations n’ont pas pu être enregistrées. Vérifiez le programme, le niveau et le groupe ; si le problème persiste, contactez la direction.', step: 2, field: null, submit: true, recovery: 'correct' }
};
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
// A pure description of what the dialog must do; message is always our own text.
export function enrollmentFailure(error) {
  if (!isDefiniteRejection(error)) return { definite: false, reason: null, message: UNCERTAIN_MESSAGE, step: null, field: null, submit: true, recovery: 'uncertain' };
  const reason = enrollmentReason(error), known = ENROLLMENT_REASONS[reason];
  if (known) return { definite: true, reason, ...known };
  if (error.code === '40001') return { definite: true, reason, message: commandError(error), step: null, field: null, submit: true, recovery: 'refresh' };
  if (error.code === '42501' && !reason) return { definite: true, reason, message: commandError(error), step: null, field: null, submit: true, recovery: 'correct' };
  const legacy = reason ? null : commandError(error);
  return { definite: true, reason, message: legacy && ![LEGACY_GENERIC, UNCERTAIN_MESSAGE].includes(legacy) ? legacy : DEFINITE_GENERIC_MESSAGE,
    step: null, field: null, submit: true, recovery: 'correct' };
}
// Existing request-key contract: 22023/42501/40001 discard; other SQLSTATEs and
// uncertain outcomes retain it for an exact same-key resend.
export function discardsRequestKey(error) {
  return ['22023', '42501', '40001'].includes(error?.code);
}
