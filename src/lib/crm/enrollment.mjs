// Operational labels only. Enrollment permission and conversion stay in SQL.
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
  'One-to-One': 'Cours individuel', 'Mise à niveau': 'Mise à niveau', Other: 'Autre programme'
};
export function enrollmentSchoolYear(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: 'numeric' }).formatToParts(now).map(p => [p.type, p.value]));
  const start = Number(parts.year) - (Number(parts.month) < 9 ? 1 : 0);
  return `${start}/${start + 1}`;
}
