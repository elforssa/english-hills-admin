// Operational labels only. Enrollment permission and conversion stay in SQL.
import { centreSchoolYear } from '../centreClock.mjs';
// EAP (migration 127): Submitted, Under Review, Trial and Rejected are retired. Their
// labels stay so older rows and the CRM history still read; nothing creates them.
export const ENROLLMENT_STATUS = {
  Submitted: 'Pré-inscription créée · En attente',
  'Under Review': 'Inscription en cours d’examen',
  Trial: 'Essai en cours',
  Confirmed: 'Inscription confirmée',
  Validated: 'Inscription validée',
  Rejected: 'Inscription refusée',
  Ended: 'Inscription terminée'
};
// Statuses a CRM prospect's enrollment can be linked to or paid on (crm_start_enrollment
// refuses Rejected and Ended); Confirmed and Validated are the paid ones (Q12).
export const PAID_ENROLLMENT_STATUSES = ['Confirmed', 'Validated'];
export const CLOSED_ENROLLMENT_STATUSES = ['Rejected', 'Ended'];
export const PROGRAMS = {
  Yearly: 'Programme annuel', Adults: 'Adultes', 'Summer Camp': 'Stage d’été',
  'Communication Junior': 'Communication junior', 'Communication Adult': 'Communication adultes',
  'One-to-One': 'Cours individuel', 'Mise à niveau': 'Mise à niveau', Other: 'Autre programme',
  Online: 'Cours en ligne', 'Online One-to-One': 'Cours individuel en ligne'
};
export function enrollmentSchoolYear(now = new Date()) {
  return centreSchoolYear(now);
}
