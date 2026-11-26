// RWR-r5 §5.4 (migration 140): the origin and close-reason catalogues. These rows
// equal the seed of public.acquisition_sources and public.crm_close_reasons
// (scripts/test-catalogue-labels.mjs); the programme catalogue is in programCatalog.mjs.

// `selectable`: offered on the forms. meta_form is read from a Meta prospect's first
// touch; social_media keeps the old learner answer « Réseaux sociaux (Facebook /
// Instagram) » and is not offered.
export const ORIGINS = [
  { code: 'instagram', label: 'Instagram', channel: 'manual', requiresReferrer: false, selectable: true },
  { code: 'facebook', label: 'Facebook', channel: 'manual', requiresReferrer: false, selectable: true },
  { code: 'meta_form', label: 'Meta (formulaire)', channel: 'meta', requiresReferrer: false, selectable: false },
  { code: 'website', label: 'Site web', channel: 'website', requiresReferrer: false, selectable: true },
  { code: 'google', label: 'Google', channel: 'manual', requiresReferrer: false, selectable: true },
  { code: 'recommendation', label: 'Recommandation', channel: 'manual', requiresReferrer: true, selectable: true },
  { code: 'walk_by', label: 'Passage devant le centre', channel: 'manual', requiresReferrer: false, selectable: true },
  { code: 'inbound_call', label: 'Appel entrant', channel: 'manual', requiresReferrer: false, selectable: true },
  { code: 'former_student', label: 'Ancien élève', channel: 'manual', requiresReferrer: false, selectable: true },
  { code: 'other', label: 'Autre', channel: 'manual', requiresReferrer: false, selectable: true },
  { code: 'social_media', label: 'Réseaux sociaux', channel: 'manual', requiresReferrer: false, selectable: false },
];
export const ORIGIN_LABELS = Object.fromEntries(ORIGINS.map(o => [o.code, o.label]));
export const SELECTABLE_ORIGINS = ORIGINS.filter(o => o.selectable);

export function originLabel(code) {
  return ORIGIN_LABELS[code] || 'Non renseigné';
}

export function originNeedsReferrer(code) {
  return !!ORIGINS.find(o => o.code === code)?.requiresReferrer;
}

// The five answers of the old learner question (students.referral_source) on the
// origin list: the same mapping as crm_security.referral_origin and data step D4.
export const REFERRAL_ORIGINS = {
  'Réseaux sociaux (Facebook / Instagram)': 'social_media',
  'Recherche Google': 'google',
  'Famille / Ami(e)': 'recommendation',
  'Passage devant le centre (walk-in)': 'walk_by',
  'Ancien élève / Réinscription': 'former_student',
};

// A learner file's origin: its own code, else its old answer (until D4 maps it).
export function studentOriginCode(student) {
  return student?.origin_code || REFERRAL_ORIGINS[student?.referral_source] || '';
}

// One list; the status (LOST or NOT_QUALIFIED) is derived from the reason by the server.
// age_not_suitable reads as the one « Âge ou programme non adapté » entry and is no
// longer offered.
export const CLOSE_REASONS = [
  { code: 'not_interested', label: 'Pas intéressé', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'price', label: 'Prix', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'schedule', label: 'Horaires', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'location', label: 'Localisation', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'chose_competitor', label: 'Autre centre choisi', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'postponed', label: 'Projet reporté', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'unreachable', label: 'Injoignable', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: true },
  { code: 'wrong_number', label: 'Mauvais numéro', status: 'NOT_QUALIFIED', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'duplicate', label: 'Doublon', status: 'LOST', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'program_not_suitable', label: 'Âge ou programme non adapté', status: 'NOT_QUALIFIED', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'age_not_suitable', label: 'Âge ou programme non adapté', status: 'NOT_QUALIFIED', selectable: false, requiresNote: false, requiresFailedCalls: false },
  { code: 'invalid_spam', label: 'Invalide / indésirable', status: 'NOT_QUALIFIED', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'outside_scope', label: 'Hors périmètre', status: 'NOT_QUALIFIED', selectable: true, requiresNote: false, requiresFailedCalls: false },
  { code: 'other', label: 'Autre', status: 'LOST', selectable: true, requiresNote: true, requiresFailedCalls: false },
];
export const CLOSE_REASON_LABELS = Object.fromEntries(CLOSE_REASONS.map(r => [r.code, r.label]));

export function closeReasonLabel(code) {
  return CLOSE_REASON_LABELS[code] || 'Clôturé';
}

// « Pas intéressé » always asks why: these five, or « Autre raison » (not_interested
// itself, with a précision).
export const NOT_INTERESTED_WHY = ['price', 'schedule', 'location', 'chose_competitor', 'postponed'];
// The « Motif » menu: « Pas intéressé » first, then the other reasons offered.
export const CLOSE_MENU = CLOSE_REASONS
  .filter(r => r.selectable && !NOT_INTERESTED_WHY.includes(r.code))
  .map(r => r.code);

// The close a form sends: { reason, note? } (the server derives the status).
// form: { reason, why, closeNote }. Throws a French message for a missing choice.
export function closeChoice(form) {
  const reason = form?.reason;
  if (!reason) throw new Error('Choisissez le motif.');
  const note = form.closeNote?.trim();
  let code = reason;
  if (reason === 'not_interested') {
    if (!form.why) throw new Error('Choisissez pourquoi le prospect n’est pas intéressé.');
    if (form.why === 'not_interested' && !note) throw new Error('Précisez la raison.');
    code = form.why;
  }
  if (code === 'other' && !note) throw new Error('Précisez le motif « Autre ».');
  return { reason: code, ...(note ? { note } : {}) };
}

// Server refusals of the catalogue rules (migration 140 hints), in French.
export const CATALOGUE_MESSAGES = {
  'catalogue.programme_unknown': 'Ce programme n’est pas proposé : choisissez-en un dans la liste.',
  'catalogue.origin_unknown': 'Choisissez une origine dans la liste.',
  'catalogue.origin_first_touch': 'L’origine d’un prospect venu par Meta ou le site web est celle de son formulaire : elle ne se modifie pas.',
  'catalogue.referrer_required': 'Indiquez qui a recommandé le centre (« Recommandé par »).',
  'catalogue.referrer_invalid': '« Recommandé par » : une seule personne, un nom, un apprenant ou un prospect.',
  'catalogue.price_stale': 'Ce prix a été modifié entre-temps. Rechargez puis réessayez.',
  'catalogue.programme_stale': 'Ce programme a été modifié entre-temps. Rechargez puis réessayez.',
  'catalogue.price_invalid': 'Saisissez un prix positif (deux décimales au plus).',
  'catalogue.school_year_invalid': 'Choisissez une année scolaire (par exemple 2026/2027).',
  'catalogue.no_change': 'Aucun changement à enregistrer.',
  'catalogue.unsupported_change': 'Ce changement n’est pas possible ici.',
};

// The catalogue price of a programme for a school year, or null (none, or cleared).
// `catalogue` is get_catalogue's answer.
export function cataloguePrice(catalogue, programme, schoolYear) {
  const price = catalogue?.programmes?.find(p => p.code === programme)?.prices?.find(x => x.school_year === schoolYear);
  return price?.amount != null ? Number(price.amount) : null;
}
