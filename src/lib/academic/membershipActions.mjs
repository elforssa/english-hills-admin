// Thin wrappers over the enrollment and group commands (plan EGC-r2, D-4) and the
// French text of their closed egc.<reason> vocabulary. Conflicts (PT409, ADR-009)
// are recognised through isRecordConflict and never replayed. The client is
// injected so the node tests run this code.
import { isRecordConflict, recordConflictMessage } from '../conflictErrors.mjs';
import { onlineReason, ONLINE_REASON_TEXT } from '../online/reasons.mjs';

export const ENROLLMENT_CHANGED_MESSAGE = 'Cette inscription a changé, rechargez.';
export const DUPLICATE_ENROLLMENT_MESSAGE = 'Une inscription active existe déjà pour ce programme et cette année.';
export const GROUP_HISTORY_MESSAGE = 'Ce groupe a un historique d’inscriptions : il ne peut pas être supprimé.';

export const EGC_REASON_TEXT = {
  capacity: 'Ce groupe est complet.',
  capacity_override_forbidden: 'Seule la direction peut dépasser la capacité, avec un motif de 200 caractères au plus.',
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

const GENERIC = 'L’action n’a pas pu aboutir. Réessayez ; si le problème persiste, contactez la direction.';

export function egcReason(hint) {
  const match = /^egc\.([a-z_]+)$/.exec(typeof hint === 'string' ? hint : '');
  return match ? match[1] : null;
}

// One French message for any refusal of these commands or of the guards behind
// direct writes. Raw server text is shown only when nothing better is known.
export function membershipErrorMessage(error) {
  if (!error) return '';
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
  const online = onlineReason(error.hint);
  if (online) return ONLINE_REASON_TEXT[online];
  const text = `${error.message || ''} ${error.details || ''}`;
  if (/enrollments_one_active_programme_year/.test(text)) return DUPLICATE_ENROLLMENT_MESSAGE;
  if (/enrollments_confirmed_has_programme/.test(text)) return EGC_REASON_TEXT.programme_required;
  if (/enrollments_(group_id|ended_group_id)_fkey|groups_pkey|enrollments.*violates foreign key/.test(text)) return GROUP_HISTORY_MESSAGE;
  if (error.code === '42501') return 'Vous n’avez pas accès à cette action.';
  return error.message || GENERIC;
}

// Deleting a group is refused while any enrollment (current or ended) refers to it.
export function groupDeleteErrorMessage(error) {
  return error?.code === '23503' ? GROUP_HISTORY_MESSAGE : membershipErrorMessage(error);
}

export function placeLearnerInGroup(client, { student, group, enrollment = null, schoolYear = null, overrideReason = null }) {
  return client.rpc('place_learner_in_group', {
    p_student: student.id, p_group: group, p_student_updated_at: student.updated_at,
    p_enrollment: enrollment?.id ?? null, p_school_year: schoolYear || null,
    p_enrollment_updated_at: enrollment?.updated_at ?? null, p_capacity_override_reason: overrideReason || null,
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

// ACA-5: admin enrollment edits send the changed allow-listed fields only.
export const ENROLLMENT_EDIT_FIELDS = ['status', 'level', 'date_inscription', 'notes', 'session_type', 'school_year'];
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

export function createEnrollment(client, studentId, changes) {
  return client.rpc('create_enrollment', { p_student: studentId, p_changes: changes });
}

export function saveEnrollmentChanges(client, enrollment, changes) {
  return client.rpc('save_enrollment_changes', {
    p_enrollment: enrollment.id, p_expected_updated_at: enrollment.updated_at, p_changes: changes,
  });
}
