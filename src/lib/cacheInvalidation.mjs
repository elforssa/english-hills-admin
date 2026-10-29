// Cache refresh after writes (plan SCG-r1, REL-8). Every finance command and every
// learner, enrollment, group, teacher or attendance save marks the cached lists,
// dossiers and report totals that depend on it as stale, so no screen keeps
// pre-save figures for up to five minutes. Prefix keys: ['Student'] covers
// ['Student', 'page', …] and every other Student query.
export const FINANCE_KEYS = ['Receipt', 'Charge', 'Student', 'Enrollment', 'Payroll', 'report'];
export const LEARNER_KEYS = ['Student', 'Enrollment', 'Group', 'Attendance', 'Teacher', 'report'];

const refresh = (queryClient, keys) => Promise.all(keys.map(key => queryClient.invalidateQueries({ queryKey: [key] })));

/** After a payment, charge, receipt correction or deletion, or a payroll change. */
export function invalidateAfterFinance(queryClient) {
  return refresh(queryClient, FINANCE_KEYS);
}

/** After a learner, enrollment, group, teacher or attendance save. */
export function invalidateAfterLearnerSave(queryClient) {
  return refresh(queryClient, LEARNER_KEYS);
}
