// RWR-r5 §5.4 (migration 140): the e-mail reads a receipt's stored programme code in
// French. The function is deployed on its own, so it carries its own copy of the
// catalogue labels; scripts/test-catalogue-labels.mjs asserts it equals
// src/lib/programCatalog.mjs (and so the seed of public.programmes).
export const PROGRAMME_LABELS = {
  Yearly: 'Programme annuel',
  Adults: 'Adultes',
  'Summer Camp': 'Stage d’été',
  'Communication Junior': 'Communication junior',
  'Communication Adult': 'Communication adultes',
  'One-to-One': 'Cours individuel',
  'Mise à niveau': 'Mise à niveau',
  Online: 'Cours en ligne',
  'Online One-to-One': 'Cours individuel en ligne',
  Other: 'Autre programme',
  Legacy: 'Ancien solde',
};

export function programmeName(code) {
  return PROGRAMME_LABELS[code] || code || '';
}

// A stored « Programme · 2026/2027 » service line, read in French.
export function serviceLine(text) {
  const value = String(text || '');
  const [head, ...rest] = value.split(' · ');
  return PROGRAMME_LABELS[head] ? [PROGRAMME_LABELS[head], ...rest].join(' · ') : value;
}
