// RCC-A2 pure enrollment presentation rules, for « Inscrire et encaisser »
// (crm_enroll_and_collect, migration 127). Conversion, linkage and payment stay
// server-authoritative; these only choose labels and bounds.
import { ENROLLMENT_STATUS, PROGRAMS } from './enrollment.mjs';
import { recordHref } from '../navigation.mjs';
import { centreDate, centreDateTimeInput } from '../centreClock.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Centre civil today, the same calendar the server compares birth dates with.
export function casablancaToday(now = new Date()) {
  return centreDate(now);
}
// Centre wall-clock minute (datetime-local form).
export function casablancaNowInput(now = new Date()) {
  return centreDateTimeInput(now);
}
export function birthDateReason(value, now = new Date()) {
  if (!value) return null;
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) return 'birth_date_invalid';
  return value > casablancaToday(now) ? 'birth_date_future' : null;
}

const PRE_CONFIRMATION = ['Submitted', 'Under Review', 'Trial'];
const OPEN_LEAD = ['NEW', 'CONTACTING', 'ENGAGED'];
const CLOSED_LEAD = ['LOST', 'NOT_QUALIFIED'];
export const ARCHIVED_PRE_ENROLLMENT_NOTE = 'Ancienne pré-inscription archivée ; relancez « Inscrire et encaisser » si le prospect s’inscrit.';
// Plan §5 rows, in priority order: at most one action per state. EAP (D6): former
// rows 3–5 (a pre-inscription or essai by lead state) are one historical row 3; row 8
// starts « Inscrire et encaisser ».
export function enrollmentAction({ status, enrollment }) {
  if (!enrollment) {
    if (status === 'QUALIFIED') return { row: 8, action: 'start', note: null };
    if (OPEN_LEAD.includes(status)) return { row: 9, action: null, note: 'Qualifiez le projet avant de commencer une inscription.' };
    if (CLOSED_LEAD.includes(status)) return { row: 10, action: null, note: 'Rouvrez le prospect pour reprendre une inscription.' };
    return { row: 7, action: null, note: 'Statut d’inscription à vérifier par l’administration.' };
  }
  if (['Confirmed', 'Validated'].includes(enrollment.status)) return { row: 1, action: 'open', note: null };
  // An enrollment ended after its confirmation is a normal departure: the server raises
  // no review for it (evaluate_conversion, 120), so the note does not claim one.
  if (status === 'CONVERTED' && enrollment.status === 'Ended') return { row: 2, action: 'open', note: 'Inscription terminée après sa confirmation. Le prospect reste converti.' };
  if (status === 'CONVERTED') return { row: 2, action: 'open', note: 'Cette inscription a changé après sa confirmation. Elle est signalée pour vérification par la direction.' };
  if (PRE_CONFIRMATION.includes(enrollment.status)) return { row: 3, action: 'open', note: ARCHIVED_PRE_ENROLLMENT_NOTE };
  if (enrollment.status === 'Rejected') return { row: 6, action: 'open', note: 'Inscription refusée. Ce prospect reste rattaché à cette inscription ; pour une nouvelle demande, contactez la direction.' };
  return { row: 7, action: 'open', note: 'Statut d’inscription à vérifier par l’administration.' };
}
export function studentHref(enrollment, returnTo) {
  return recordHref(`/students/${enrollment.student_id}`, returnTo);
}
export function enrollmentParam(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

// The group line of the success panel. placement: { status: 'placed' | 'failed' |
// 'none', name?, message? }. A refusal never undoes the payment (D3).
export function placementLine(placement, enrollment) {
  if (enrollment?.group_name) return `Groupe : ${enrollment.group_name}`;
  if (placement?.status === 'placed') return `Groupe : ${placement.name}`;
  if (placement?.status === 'failed') return `Groupe non affecté : ${String(placement.message || '').replace(/[.\s]+$/, '')}. Apprenant inscrit — groupe à affecter.`;
  return 'Groupe à affecter';
}
// origin 'request' covers this dialog's own success, including its same-key replay;
// 'discovered' is a refetch that found another request's or actor's enrollment.
// linkedPaid: this request linked an already paid enrollment without a payment (Q12).
export function enrollmentSuccess(result, origin, { linkedPaid = false, placement = null } = {}) {
  const enrollment = result.enrollment, converted = result.lead?.status === 'CONVERTED';
  const learner = [enrollment.student_name, PROGRAMS[enrollment.session_type] || 'Programme à préciser', enrollment.school_year].filter(Boolean).join(' · ');
  if (origin === 'discovered') return { heading: 'Inscription déjà rattachée', intro: 'Une inscription a été rattachée à ce prospect entre-temps. Vérifiez-la avant de poursuivre.',
    status: ENROLLMENT_STATUS[enrollment.status] || 'Statut à vérifier', learner, lead: null, group: null };
  const heading = linkedPaid ? 'Inscription payée rattachée'
    : result.free_enrollment ? 'Inscription confirmée sans paiement (remise 100 %)'
      : result.receipt_number ? `Inscription confirmée · reçu ${result.receipt_number}` : 'Inscription confirmée';
  return { heading, intro: result.replayed_enrollment || result.replayed_payment ? 'Cette inscription était déjà enregistrée : rien n’a été saisi deux fois.' : null,
    status: null, learner,
    lead: converted ? 'Prospect converti : le suivi commercial est terminé.' : 'Le prospect reste qualifié : vérifiez l’inscription dans le dossier de l’apprenant.',
    group: placementLine(placement, enrollment) };
}
