// Thin wrappers over the enrollment and group commands (plan EGC-r2, D-4) and the
// French text of their closed egc.<reason> vocabulary. Conflicts (PT409, ADR-009)
// are recognised through isRecordConflict and never replayed. The client is
// injected so the node tests run this code.
import { isRecordConflict, recordConflictMessage } from '../conflictErrors.mjs';
import { onlineReason, ONLINE_REASON_TEXT } from '../online/reasons.mjs';
import { courseErrorMessage } from './courseClose.mjs';

export const ENROLLMENT_CHANGED_MESSAGE = 'Cette inscription a changé, rechargez.';
export const DUPLICATE_ENROLLMENT_MESSAGE = 'Une inscription active existe déjà pour ce programme et cette année.';
export const GROUP_HISTORY_MESSAGE = 'Ce groupe a un historique d’inscriptions : il ne peut pas être supprimé.';
// CDC (128): a closed course keeps its past learners (ended_group_id), so it stays in history.
export const CLOSED_GROUP_HISTORY_MESSAGE = 'Ce cours clôturé garde l’historique de ses anciens apprenants : il ne peut pas être supprimé.';

export const EGC_REASON_TEXT = {
  capacity: 'Ce groupe est complet.',
  capacity_override_forbidden: 'Le dépassement de capacité demande un motif de 200 caractères au plus.',
  group_level_locked: 'Réaffectez les apprenants avant de changer le programme ou le niveau du groupe.',
  group_from_enrollment: 'Affectez le groupe depuis l’inscription.',
  programme_follows_group: 'Le programme et le niveau suivent le groupe ; modifiez l’inscription.',
  use_leaver: 'Utilisez « Ancien apprenant » pour terminer les inscriptions.',
  status_follows_enrollment: 'Le statut de l’apprenant suit ses inscriptions.',
  history_protected: 'Cette inscription ne peut être modifiée ou supprimée que par les actions dédiées (« Ancien apprenant », « Retirer du groupe », « Rouvrir l’inscription »).',
  already_placed: 'Cet apprenant est déjà dans un autre groupe de ce programme pour cette année. Changez son groupe depuis son inscription.',
  select_enrollment: 'Plusieurs inscriptions sont possibles : choisissez-la depuis la fiche apprenant.',
  school_year_required: 'Indiquez l’année scolaire (sur le groupe ou l’inscription).',
  group_mismatch: 'Le groupe doit correspondre au programme et au niveau de l’inscription.',
  group_unavailable: 'Ce groupe est introuvable.',
  enrollment_not_placeable: 'Cette inscription ne peut pas être affectée à un groupe.',
  not_a_member: 'Cet apprenant n’est pas dans ce groupe.',
  final_status_invalid: 'Choisissez « Ancien apprenant » ou « Inactif ».',
  reason_required: 'Indiquez un motif (200 caractères au plus).',
  not_ended: 'Seule une inscription terminée peut être rouverte.',
  programme_required: 'Programme et année scolaire requis.',
  status_not_permitted: 'Ce changement de statut passe par le paiement, l’affectation ou « Ancien apprenant ».',
  group_required: 'Affectez d’abord un groupe.',
  programme_fixed: 'Le programme et l’année scolaire ne changent plus une fois fixés.',
  level_invalid: 'Programme, niveau ou année scolaire invalide.',
  ended_read_only: 'Une inscription terminée ne se modifie que par ses notes.',
  // Batch H (H5): the group school year.
  school_year_mismatch: 'L’année scolaire de l’inscription ne correspond pas à celle du groupe.',
  group_year_missing: 'Renseignez l’année scolaire du groupe.',
  group_year_invalid: 'Année scolaire du groupe invalide : utilisez le format 2026/2027.',
  group_year_locked: 'Réaffectez les apprenants avant de changer l’année scolaire du groupe.',
};

// EAP (migration 127): enrollment at payment. The server's own French message is the
// same text; these keep the client independent of it.
export const EAP_REASON_TEXT = {
  status_retired: 'La pré-inscription et l’essai n’existent plus : l’inscription se confirme à l’encaissement.',
  payment_required: 'L’inscription se confirme à l’encaissement : saisissez un paiement.',
  paid_enrollment_required: 'Inscrivez et encaissez d’abord : l’affectation suit une inscription payée.',
  placement_reason_required: 'Motif requis pour affecter sans inscription payée (200 caractères au plus).',
  archived_not_reopenable: 'Une pré-inscription archivée ne se rouvre pas : inscrivez et encaissez.',
  program_not_enrollable: 'Choisissez le programme de l’inscription : « Autre » s’encaisse sans inscription.',
  enrollment_already_charged: 'Cette inscription a déjà un montant enregistré : encaissez sur ce montant depuis le reçu, ou rattachez-la si elle est payée.',
  public_registration_retired: 'Les inscriptions en ligne sont fermées. Contactez le centre.',
  // RWR-r5 C1 (migration 139): one commitment per learner, programme and year; OD-2 = A.
  unlinked_commitment_exists: 'Un engagement sans inscription existe déjà pour ce programme et cette année : encaissez sur cet engagement, ou choisissez « Nouvelle session ».',
  commitment_unavailable: 'Cet engagement ne correspond plus à cet apprenant, ce programme et cette année. Les soldes sont actualisés.',
  reservation_price_required: 'Indiquez le prix convenu (supérieur à la remise) pour réserver sans paiement.',
  reservation_free: 'Une remise de 100 % confirme l’inscription : utilisez « Inscrire et encaisser ».',
  reservation_due_required: 'Indiquez la date d’échéance de l’acompte.',
  reservation_due_invalid: 'L’échéance doit être entre aujourd’hui et dans un an.',
  reservation_already_enrolled: 'Cet apprenant a déjà une inscription pour ce programme et cette année : encaissez sur son inscription.',
  // The 139 payment guards: a reserved commitment is collected only from its prospect's card.
  reservation_collect_on_prospect: 'Cet engagement est réservé pour un prospect : encaissez-le depuis la fiche du prospect avec « Inscrire et encaisser ».',
  reservation_append_only: 'Une réservation ne se modifie pas et ne se supprime pas.',
};

export function eapReason(hint) {
  const match = /^eap\.([a-z_]+)$/.exec(typeof hint === 'string' ? hint : '');
  return match && Object.hasOwn(EAP_REASON_TEXT, match[1]) ? match[1] : null;
}

const GENERIC = 'L’action n’a pas pu aboutir. Réessayez ; si le problème persiste, contactez la direction.';

export function egcReason(hint) {
  const match = /^egc\.([a-z_]+)$/.exec(typeof hint === 'string' ? hint : '');
  return match ? match[1] : null;
}

// One French message for any refusal of these commands or of the guards behind
// direct writes. Raw server text is shown only when nothing better is known.
export function membershipErrorMessage(error) {
  if (!error) return '';
  // CDC (128): the course refusals and the close conflicts carry their own words.
  const course = courseErrorMessage(error);
  if (course) return course;
  const reason = egcReason(error.hint);
  // ADR-009: a record conflict first; its egc hint picks the precise text.
  if (isRecordConflict(error)) {
    if (reason === 'duplicate_enrollment') return DUPLICATE_ENROLLMENT_MESSAGE;
    if (reason === 'stale') return ENROLLMENT_CHANGED_MESSAGE;
    return recordConflictMessage();
  }
  // The year mismatch names both years in the server's own French words.
  if (reason === 'school_year_mismatch' && /^L’année scolaire/.test(error.message || '')) return error.message;
  if (reason && Object.hasOwn(EGC_REASON_TEXT, reason)) return EGC_REASON_TEXT[reason];
  const eap = eapReason(error.hint);
  if (eap) return EAP_REASON_TEXT[eap];
  const online = onlineReason(error.hint);
  if (online) return ONLINE_REASON_TEXT[online];
  const text = `${error.message || ''} ${error.details || ''}`;
  if (/enrollments_one_active_programme_year/.test(text)) return DUPLICATE_ENROLLMENT_MESSAGE;
  if (/enrollments_confirmed_has_programme/.test(text)) return EGC_REASON_TEXT.programme_required;
  if (/enrollments_(group_id|ended_group_id)_fkey|groups_pkey|enrollments.*violates foreign key/.test(text)) return GROUP_HISTORY_MESSAGE;
  if (error.code === '42501') return 'Vous n’avez pas accès à cette action.';
  // RPW-r2 (C1-2): a server text in plain ASCII is an English internal message
  // ("Student unavailable or stale"); the generic French text replaces it.
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  return message && !/^[\x00-\x7F]*$/.test(message) ? message : GENERIC;
}

// Deleting a group is refused while any enrollment (current or ended) refers to it;
// a closed course says why (its past learners reference it).
export function groupDeleteErrorMessage(error, group = null) {
  if (error?.code === '23503') return group?.closed_at ? CLOSED_GROUP_HISTORY_MESSAGE : GROUP_HISTORY_MESSAGE;
  return membershipErrorMessage(error);
}

// EAP (Q3 = B): reception places a paid (Confirmed/Validated) enrollment only;
// director/admin may place a learner without one with withoutEnrollmentReason, a
// reason distinct from the capacity override (overrideReason).
export function placeLearnerInGroup(client, { student, group, enrollment = null, schoolYear = null, overrideReason = null,
  withoutEnrollmentReason = null }) {
  return client.rpc('place_learner_in_group', {
    p_student: student.id, p_group: group, p_student_updated_at: student.updated_at,
    p_enrollment: enrollment?.id ?? null, p_school_year: schoolYear || null,
    p_enrollment_updated_at: enrollment?.updated_at ?? null, p_capacity_override_reason: overrideReason || null,
    p_without_enrollment_reason: withoutEnrollmentReason || null,
  });
}

export function removeLearnerFromGroup(client, { student, group, enrollment = null }) {
  return client.rpc('remove_learner_from_group', {
    p_student: student.id, p_group: group, p_student_updated_at: student.updated_at,
    p_enrollment: enrollment?.id ?? null, p_enrollment_updated_at: enrollment?.updated_at ?? null,
  });
}

export function endLearner(client, { student, finalStatus, reason, enrollmentIds = null }) {
  return client.rpc('end_learner', {
    p_student: student.id, p_student_updated_at: student.updated_at, p_final_status: finalStatus,
    p_reason: reason, p_enrollments: enrollmentIds?.length ? enrollmentIds : null,
  });
}

export function reopenEnrollment(client, enrollment) {
  return client.rpc('reopen_enrollment', { p_enrollment: enrollment.id, p_expected_updated_at: enrollment.updated_at });
}

export function closeSchoolYear(client, { schoolYear, expectedCount, reason }) {
  return client.rpc('close_school_year', { p_school_year: schoolYear, p_expected_count: expectedCount, p_reason: reason });
}

export function restoreStudent(client, studentId) {
  return client.rpc('restore_student', { p_student: studentId });
}

export function listArchivedStudents(client, page = 1, pageSize = 20) {
  return client.rpc('list_archived_students', { p_page: page, p_page_size: pageSize });
}

// ACA-5: admin enrollment edits send the changed allow-listed fields only. EAP: the
// status is never edited (payment, placement and « Ancien apprenant » set it).
export const ENROLLMENT_EDIT_FIELDS = ['level', 'date_inscription', 'notes', 'session_type', 'school_year'];
export function changedEnrollmentFields(original, form) {
  const changes = {};
  for (const key of ENROLLMENT_EDIT_FIELDS) {
    const blank = value => (value === '' || value === undefined ? null : value);
    const before = blank(original?.[key] ?? null), after = blank(form?.[key] ?? null);
    if (before !== after) changes[key] = after;
  }
  // Programme and year are set once (the server refuses a change).
  for (const key of ['session_type', 'school_year']) if (original?.[key] && key in changes) delete changes[key];
  return changes;
}

export function saveEnrollmentChanges(client, enrollment, changes) {
  return client.rpc('save_enrollment_changes', {
    p_enrollment: enrollment.id, p_expected_updated_at: enrollment.updated_at, p_changes: changes,
  });
}
