// Closed online.<reason> vocabulary (migration 117 and the online routes) mapped to
// French text. Pages render only this text, never raw server messages.
export const ONLINE_REASON_TEXT = {
  gate_closed: 'Les cours en ligne ne sont pas encore ouverts.',
  provider_invalid: 'La salle de cours n’est pas disponible pour le moment.',
  provider_error: 'La salle de cours n’a pas pu être ouverte. Réessayez dans un instant.',
  unauthenticated: 'Connectez-vous pour rejoindre le cours.',
  forbidden: 'Vous n’avez pas accès à cette action.',
  not_found: 'Ce cours est introuvable.',
  invalid_input: 'Vérifiez les informations saisies.',
  stale: 'Ces informations ont changé. Actualisez la page puis réessayez.',
  course_exists: 'Ce groupe a déjà une fiche de cours en ligne.',
  course_closed: 'Ce cours en ligne est clôturé.',
  course_not_draft: 'Seul un cours en préparation peut être activé.',
  course_inactive: 'Ce cours en ligne n’est pas ouvert.',
  teacher_unavailable: 'Choisissez un enseignant actif.',
  term_invalid: 'Vérifiez la période du cours (26 semaines au plus).',
  pattern_invalid: 'Vérifiez l’horaire hebdomadaire.',
  scope_invalid: 'Choisissez « ce cours » ou « ce cours et les suivants ».',
  lesson_overlap: 'Deux cours de ce groupe se chevauchent ou sont trop rapprochés.',
  lesson_in_use: 'Un cours concerné a déjà des invités, des présences ou des accès ; modifiez-le individuellement.',
  lesson_past: 'Ce cours a déjà commencé ou est terminé.',
  lesson_cancelled: 'Ce cours est annulé.',
  window_closed: 'La salle n’est pas ouverte à cette heure.',
  not_eligible: 'Vous n’êtes pas inscrit à ce cours.',
  student_required: 'Choisissez l’enfant qui rejoint le cours.',
  consent_missing: 'Le consentement vidéo de l’enfant n’est pas encore enregistré. Contactez l’accueil.',
  capacity: 'Ce cours en ligne est complet.',
  already_enrolled: 'Cet apprenant est déjà inscrit à ce cours.',
  guest_exists: 'Cet apprenant est déjà invité à ce cours.',
  not_on_roster: 'Cet apprenant ne participe pas à ce cours.',
  room_ref_invalid: 'La salle du fournisseur est invalide.',
  pass_invalid: 'Votre accès a expiré. Rouvrez la salle depuis votre espace.',
  teacher_on_course: 'Un groupe en ligne n’a pas d’enseignant de groupe ; choisissez-le sur la fiche du cours.',
  course_type_locked: 'Le programme d’un cours en ligne ne peut pas redevenir présentiel.',
  group_not_online: 'Ce groupe n’a pas un programme en ligne.',
};

const GENERIC = 'L’action n’a pas pu aboutir. Réessayez ; si le problème persiste, contactez la direction.';

export function onlineReason(value) {
  const match = /^online\.([a-z_]+)$/.exec(typeof value === 'string' ? value : '');
  const reason = match ? match[1] : typeof value === 'string' ? value : null;
  return reason && Object.hasOwn(ONLINE_REASON_TEXT, reason) ? reason : null;
}

// Accepts a PostgREST error ({ hint }) or a route body ({ reason }).
export function onlineErrorText(error) {
  const reason = onlineReason(error?.hint) || onlineReason(error?.reason);
  if (reason) return ONLINE_REASON_TEXT[reason];
  if (error?.code === '40001') return ONLINE_REASON_TEXT.stale;
  return GENERIC;
}
