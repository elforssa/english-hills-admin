// Operational labels only. Enrollment permission and conversion stay in SQL.
import { centreSchoolYear } from '../centreClock.mjs';
export const ENROLLMENT_STATUS = {
  Submitted: 'Pré-inscription créée · En attente',
  'Under Review': 'Inscription en cours d’examen',
  Trial: 'Essai en cours',
  Confirmed: 'Inscription confirmée',
  Validated: 'Inscription validée',
  Rejected: 'Inscription refusée'
};
export const PROGRAMS = {
  Yearly: 'Programme annuel', Adults: 'Adultes', 'Summer Camp': 'Stage d’été',
  'Communication Junior': 'Communication junior', 'Communication Adult': 'Communication adultes',
  'One-to-One': 'Cours individuel', 'Mise à niveau': 'Mise à niveau', Other: 'Autre programme',
  Online: 'Cours en ligne', 'Online One-to-One': 'Cours individuel en ligne'
};
export function enrollmentSchoolYear(now = new Date()) {
  return centreSchoolYear(now);
}
