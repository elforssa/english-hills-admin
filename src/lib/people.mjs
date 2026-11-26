// People identity (RWR-r5 §5.1–5.3, migration 139): one place for the duplicate
// gate's payload, the French labels of a match and the server's people.* refusals.
// Pure module: used by the CRM, student and receipt forms and by the node tests.

export const DUPLICATE_HINT = 'people.possible_duplicate';

export const MATCH_REASONS = {
  phone: 'Même téléphone',
  name_birth: 'Même nom et même date de naissance',
  name: 'Même nom',
  email: 'Même e-mail'
};

export const PERSON_KINDS = { prospect: 'Prospect', student: 'Apprenant' };

// « Même famille, autre personne » and « Personne différente » are recorded
// (person_match_decisions); « C'est cette personne » opens the existing record.
export const MATCH_DECISIONS = {
  same_family: 'Même famille, autre personne',
  different_people: 'Personne différente'
};

export const PEOPLE_MESSAGES = {
  'people.possible_duplicate': 'Cette personne existe peut-être déjà : répondez pour chaque fiche, puis enregistrez.',
  'people.phone_invalid': 'Numéro invalide',
  'people.phone_placeholder': 'Numéro fictif : laissez vide',
  'people.phone_unchanged': 'C’est déjà le numéro enregistré. Saisissez le numéro corrigé.',
  'people.corrected_phone_keep': 'Avec un numéro corrigé, l’action actuelle est conservée : choisissez « Garder l’action actuelle ».',
  'people.no_change': 'Aucune modification à enregistrer.',
  'people.sibling_contact_fields': 'Le contact existant est réutilisé tel quel : modifiez-le depuis sa fiche.',
  'people.same_person_name': 'Avec « C’est la même personne », le nom de l’apprenant est celui du contact.',
  'people.merge_already': 'Cette fiche est déjà fusionnée.',
  'people.merge_same': 'Choisissez deux fiches différentes.',
  'people.merge_not_found': 'Fiche introuvable.',
  'people.merge_direction': 'La fiche qui a une inscription en cours doit être conservée : inversez le sens.',
  'people.merge_both_converted': 'Les deux prospects sont déjà inscrits : la fusion reste une décision de la direction.',
  'people.merge_both_live': 'Les deux apprenants ont une inscription en cours : fusion impossible.',
  'people.merge_both_portal': 'Les deux apprenants ont un accès au portail : fusion impossible.',
  'people.merge_target_closed': 'La fiche conservée est clôturée alors que l’autre est active : inversez le sens ou rouvrez-la.',
  'people.merge_source_balance': 'Encaissez ou soldez d’abord le solde de ce dossier.',
  'people.merge_source_reservation': 'La fiche à fusionner a un acompte réservé : encaissez-le (« Inscrire et encaisser ») ou annulez-le d’abord.',
  'people.merge_source_appointment': 'La fiche à fusionner a un rendez-vous, un test prévu ou une inscription en cours : traitez-les d’abord.',
  'people.unmerge_not_merged': 'Cette fiche n’est pas fusionnée.',
  'people.unmerge_changed': 'Les liens ont changé depuis la fusion : annulation impossible sans vérification.'
};

export function peopleMessage(error) {
  return PEOPLE_MESSAGES[error?.hint] || null;
}

// The gate's refusal carries the matches in its detail (PostgREST « details »).
export function duplicateMatches(error) {
  if (error?.hint !== DUPLICATE_HINT) return null;
  try {
    const rows = JSON.parse(error.details ?? error.detail ?? '[]');
    return Array.isArray(rows) ? rows.filter(m => m && PERSON_KINDS[m.kind] && m.id) : [];
  } catch {
    return [];
  }
}

// Every reported match needs an answer before the create is resubmitted.
export function allAnswered(matches, answers) {
  return (matches || []).every(m => MATCH_DECISIONS[answers?.[`${m.kind}:${m.id}`]]);
}

export function acknowledgedMatches(matches, answers) {
  return (matches || []).map(m => ({ kind: m.kind, id: m.id, decision: answers[`${m.kind}:${m.id}`] }));
}

// find_people's strong rows, as the gate's match list (student forms run the gate
// in the browser, then record the answers once the student exists).
export function strongMatches(found) {
  return (found?.strong || []).filter(m => m && PERSON_KINDS[m.kind] && m.id);
}

export function personHref(row) {
  if (row.kind === 'student') return `/students/${row.id}`;
  return `/crm/leads?lead=${row.id}`;
}

export function personLine(row) {
  return [PERSON_KINDS[row.kind], row.contact_name && row.contact_name !== row.name ? `contact ${row.contact_name}` : null,
    row.phone_masked || null].filter(Boolean).join(' · ');
}
