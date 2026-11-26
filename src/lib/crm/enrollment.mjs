// Operational labels only. Enrollment permission and conversion stay in SQL.
import { centreSchoolYear } from '../centreClock.mjs';
import { PROGRAMMES } from '../programCatalog.mjs';
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
// §5.4: the catalogue labels (programCatalog.mjs, equal to the seed of migration 140).
export const PROGRAMS = Object.fromEntries(PROGRAMMES.map(p => [p.code, p.label]));
export function enrollmentSchoolYear(now = new Date()) {
  return centreSchoolYear(now);
}
