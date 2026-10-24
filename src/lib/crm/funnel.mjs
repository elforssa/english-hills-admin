// Director cohort funnel (DGI-B D10/D11). Rates are derived here from the counts the
// cohort RPC returns; nothing is stored. A stage rate is unavailable (null) when the
// previous stage is 0 or a count is missing (an older RPC without the funnel fields),
// never 0; a genuine 0 is returned when the stage is 0 and the previous one is not.
// Stages are not nested (a lead can be qualified without a recorded contact and enrolled
// without a placement test), so a stage can exceed the previous one: that rate is also
// unavailable, never a percentage above 100 %.
export const FUNNEL_STAGES = [
  ['leads', 'Prospects'],
  ['contacted', 'Contactés'],
  ['qualified', 'Qualifiés'],
  ['booked_leads', 'Tests réservés'],
  ['attended_leads', 'Tests passés'],
  ['converted', 'Inscrits'],
];

const count = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const ratio = (numerator, denominator) => (numerator == null || denominator == null || denominator === 0 || numerator > denominator ? null : numerator / denominator);

export function funnelStages(summary) {
  let previous = null;
  return FUNNEL_STAGES.map(([key, label], index) => {
    const value = count(summary?.[key]);
    const stage = { key, label, count: value, rate: index === 0 ? null : ratio(value, previous) };
    previous = value;
    return stage;
  });
}

export const overallRate = (summary) => ratio(count(summary?.converted), count(summary?.leads));

// session_type is the only program field (one Meta form = one program until a program
// question is mapped). 'none' selects leads without a session type.
export const PROGRAMS = ['Yearly', 'Adults', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One', 'Mise à niveau', 'Other'];

// LIR-r1 P1-D. Spend before the campaign attribution switch has no attributed leads,
// so CPL, CPQL and CAC are hidden when the range starts before the attribution day
// (or attribution never started). Otherwise the ratios are flagged as partial when
// fetched rows hold Meta leads without attribution, or when rows were truncated;
// the count is taken from the fetched rows only.
const UNATTRIBUTED_META_BUCKETS = ['pending:meta_instant_form', 'unknown:meta_instant_form'];
export function ratioGuard({ from, attributionDay, rows = [], total = 0 }) {
  if (!attributionDay || !from || from < attributionDay) {
    return { hidden: true, attributionDay: attributionDay || null, partial: false, unattributed: 0, truncated: false };
  }
  const unattributed = rows.filter(row => UNATTRIBUTED_META_BUCKETS.includes(row.bucket))
    .reduce((sum, row) => sum + (count(row.leads) || 0), 0);
  const truncated = Number(total) > rows.length;
  return { hidden: false, attributionDay, partial: unattributed > 0 || truncated, unattributed, truncated };
}

// The note under the summary ratios, or null. Truncated rows with no unattributed
// bucket among them say so, rather than "0 prospect sans attribution".
export function ratioGuardNote(guard) {
  if (guard.hidden || !guard.partial) return null;
  if (!guard.unattributed) return 'partiel : couverture vérifiée sur les lignes affichées uniquement';
  return `partiel : ${guard.unattributed} prospect${guard.unattributed > 1 ? 's' : ''} Meta sans attribution${guard.truncated ? ' (lignes affichées)' : ''}`;
}
