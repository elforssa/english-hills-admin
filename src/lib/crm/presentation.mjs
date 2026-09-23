export const STATUS = {
  NEW: 'Nouveau',
  CONTACTING: 'À contacter',
  ENGAGED: 'En discussion',
  QUALIFIED: 'Qualifié',
  LOST: 'Perdu',
  NOT_QUALIFIED: 'Non qualifié',
  CONVERTED: 'Converti'
};
export const TASKS = {
  first_contact: 'Premier contact',
  contact_attempt: 'Appel de suivi',
  callback: 'Rappel',
  whatsapp_followup: 'Suivi WhatsApp',
  confirm_placement_test: 'Préparer un test de niveau',
  post_test_followup: 'Rappeler le parent · Résultat disponible',
  center_visit: 'Visite au centre',
  enrollment_followup: 'Suivi de pré-inscription'
};
export const OUTCOMES = {
  no_answer: 'Pas de réponse',
  busy: 'Occupé',
  declined: 'Appel refusé',
  unreachable: 'Injoignable',
  spoke_with_contact: 'Conversation avec le parent',
  wrong_number: 'Mauvais numéro'
};
export const LOST = {
  unreachable: 'Injoignable',
  not_interested: 'Pas intéressé',
  price: 'Prix',
  schedule: 'Horaires',
  location: 'Localisation',
  chose_competitor: 'Autre centre choisi',
  postponed: 'Projet reporté',
  other: 'Autre'
};
export const NOT_QUALIFIED = {
  age_not_suitable: 'Âge non adapté',
  program_not_suitable: 'Programme non adapté',
  invalid_spam: 'Invalide / indésirable',
  duplicate: 'Doublon',
  outside_scope: 'Hors périmètre',
  other: 'Autre'
};
export const EVENTS = {
  placement_test_booked: 'Test de niveau réservé',
  placement_test_rescheduled: 'Test de niveau reprogrammé',
  placement_test_attended: 'Test passé',
  placement_result_entered: 'Résultat saisi',
  lead_created: 'Prospect créé',
  submission_received: 'Nouvelle demande',
  note_added: 'Note ajoutée',
  contact_attempted: 'Tentative d’appel',
  call_no_answer: 'Pas de réponse',
  call_busy: 'Occupé',
  call_declined: 'Appel refusé',
  call_unreachable: 'Injoignable',
  call_wrong_number: 'Mauvais numéro',
  conversation_recorded: 'Conversation',
  whatsapp_sent: 'Message WhatsApp envoyé',
  whatsapp_conversation: 'Conversation WhatsApp',
  task_created: 'Prochaine action planifiée',
  task_completed: 'Action terminée',
  task_rescheduled: 'Action replanifiée',
  task_cancelled: 'Action annulée',
  lead_engaged: 'Discussion engagée',
  lead_qualified: 'Prospect qualifié',
  lead_lost: 'Prospect perdu',
  lead_not_qualified: 'Prospect non qualifié',
  lead_reopened: 'Prospect rouvert',
  lead_reassigned: 'Responsable modifié',
  task_reassigned: 'Action réattribuée'
};
export const ACTIVE = ['NEW', 'CONTACTING', 'ENGAGED', 'QUALIFIED'];
export const CALL_TASKS = ['first_contact', 'contact_attempt', 'callback'];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function dateLabel(value) {
  return value ? new Intl.DateTimeFormat('fr-MA', {
    timeZone: 'Africa/Casablanca',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value)) : 'À planifier';
}
export function phoneLinks(contact) {
  const valid = value => /^\+[1-9]\d{7,14}$/.test(value || '') ? value : null;
  const phone = valid(contact?.phone_e164),
    wa = valid(contact?.whatsapp_e164);
  return {
    tel: phone ? `tel:${phone}` : null,
    whatsapp: wa ? `https://wa.me/${wa.slice(1)}` : null
  };
}
// Interpret wall-clock input in Casablanca, independently of the browser zone.
// This converts time only; calling windows remain exclusively server-authoritative.
export function casablancaInstant(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) throw new Error('Choisissez une date et une heure.');
  const target = Date.parse(value + 'Z');
  let guess = target;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const wall = ms => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  for (let i = 0; i < 4; i++) guess += target - Date.parse(wall(guess) + 'Z');
  if (wall(guess) !== value) throw new Error('Cette heure locale n’existe pas. Choisissez une autre heure.');
  return new Date(guess).toISOString();
}
export function commandError(error) {
  if (error?.code === '40001') return 'Ce prospect a changé depuis son ouverture. Les informations sont actualisées. Vérifiez puis réessayez.';
  if (error?.code === '42501') return 'Vous n’avez pas accès à cette action.';
  const message = error?.message || '';
  if (/placement already scheduled/i.test(message)) return 'Un test est déjà prévu. Ouvrez-le pour le reprogrammer.';
  if (/recommended level|missing result/i.test(message)) return 'Renseignez le niveau recommandé avant de valider le résultat.';
  if (/future placement|invalid placement/i.test(message)) return 'Vérifiez la date, l’heure et le résultat du test.';
  if (message.includes('No effective follow-up policy')) return 'Le calendrier de suivi n’est pas encore configuré. Demandez à un directeur de le publier.';
  if (message.includes('minimum spacing')) return 'Le délai minimum entre deux appels n’est pas encore écoulé (3 heures par défaut).';
  if (message.includes('five current-cycle')) return 'Cinq appels sans réponse dans la séquence actuelle sont nécessaires.';
  if (message.includes('next') || message.includes('Next')) return 'Choisissez une prochaine action et une date future.';
  if (error?.code === '22023') return 'Vérifiez les champs, la date future et les conditions de cette action.';
  return 'Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.';
}
// Retain a request UUID across uncertain retries of the same exact payload.
export function retryKey(previous, command, payload, makeId = () => crypto.randomUUID()) {
  const signature = JSON.stringify([command, payload]);
  return previous?.signature === signature ? previous : {
    signature,
    key: makeId()
  };
}
export function activityBody(body) {
  if (body === 'Meaningful conversation ended outreach') return 'La conversation a interrompu la séquence d’appels.';
  if (body === 'Conversation follow-up replaced') return 'Le rappel précédent est remplacé par la suite convenue.';
  if (body === 'Attempt recorded') return 'Appel enregistré.';
  if (body?.startsWith('Lead closed: ')) return 'Suivi arrêté à la clôture du prospect.';
  return body;
}
