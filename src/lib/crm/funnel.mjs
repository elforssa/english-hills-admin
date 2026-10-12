// Director cohort funnel (DGI-B D10/D11). Rates are derived here from the counts the
// cohort RPC returns; nothing is stored. A stage rate is unavailable (null) when the
// previous stage is 0 or a count is missing (an older RPC without the funnel fields),
// never 0; a genuine 0 is returned when the stage is 0 and the previous one is not.
export const FUNNEL_STAGES = [
  ['leads', 'Prospects'],
  ['contacted', 'Contactés'],
  ['qualified', 'Qualifiés'],
  ['booked_leads', 'Tests réservés'],
  ['attended_leads', 'Tests passés'],
  ['converted', 'Inscrits'],
];

const count = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const ratio = (numerator, denominator) => (numerator == null || denominator == null || denominator === 0 ? null : numerator / denominator);

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
