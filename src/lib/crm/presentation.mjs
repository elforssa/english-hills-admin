export const STATUS = {
  NEW: 'Nouveau',
  CONTACTING: 'Contact en cours',
  ENGAGED: 'En discussion',
  QUALIFIED: 'Qualifié',
  LOST: 'Perdu',
  NOT_QUALIFIED: 'Non qualifié',
  CONVERTED: 'Inscription confirmée'
};
export const TASKS = {
  first_contact: 'Premier contact',
  contact_attempt: 'Appel de suivi',
  callback: 'Rappel',
  whatsapp_followup: 'Suivi WhatsApp',
  confirm_placement_test: 'Préparer un test de niveau',
  post_test_followup: 'Rappeler le parent · Résultat disponible',
  center_visit: 'Visite au centre',
  enrollment_followup: 'Finaliser l’inscription'
};
// Agreed appointments and internal reminders are separate server facts.
export const SCHEDULE_KINDS = {
  appointment: 'Rendez-vous convenu',
  reminder: 'Rappel interne'
};
export const FOLLOWUP_REASONS = { considering: 'En réflexion' };
// Bounded presets; the server resolves each against the Casablanca follow-up policy.
export const REMINDER_PRESETS = {
  in_2_hours: 'Dans 2 heures',
  tomorrow: 'Demain',
  in_2_days: 'Dans 2 jours',
  in_3_days: 'Dans 3 jours',
  next_week: 'Dans une semaine'
};
// Outcome-led conversation results: the receptionist records what happened and the
// server command derives the stage. Qualifying results are hidden once QUALIFIED.
export const CONVERSATION_OUTCOMES = {
  placement_test: { label: 'Souhaite passer un test de niveau', decision: 'qualify', step: 'placement_test', task: 'confirm_placement_test', qualifies: true },
  center_visit: { label: 'Souhaite visiter le centre', decision: 'qualify', step: 'center_visit', task: 'center_visit', qualifies: true },
  enrollment: { label: 'Prêt à avancer vers l’inscription', decision: 'qualify', step: 'enrollment', task: 'enrollment_followup', defaultKind: 'appointment', qualifies: true },
  considering: { label: 'Intéressé, a besoin de réfléchir', decision: 'considering', task: 'callback', defaultKind: 'reminder' },
  callback: { label: 'Souhaite être rappelé', decision: 'callback', task: 'callback', defaultKind: 'appointment' },
  not_interested: { label: 'Pas intéressé', decision: 'lost' },
  not_suitable: { label: 'Projet non adapté', decision: 'not_qualified' },
  other_step: { label: 'Autre prochaine étape', decision: 'qualify', step: 'other', qualifies: true }
};
export function conversationOutcomes(status) {
  return Object.fromEntries(Object.entries(CONVERSATION_OUTCOMES)
    .filter(([, outcome]) => !(outcome.qualifies && status === 'QUALIFIED')).map(([key, outcome]) => [key, outcome.label]));
}
// Explains the server rule; the confirmation screen shows the actual saved stage.
export function outcomeStage(key, status) {
  const decision = CONVERSATION_OUTCOMES[key]?.decision;
  if (!decision) return null;
  if (decision === 'qualify') return 'QUALIFIED';
  if (decision === 'lost') return 'LOST';
  if (decision === 'not_qualified') return 'NOT_QUALIFIED';
  return ['NEW', 'CONTACTING'].includes(status) ? 'ENGAGED' : status;
}
// A conversation by WhatsApp naturally continues on WhatsApp while the parent decides.
export function outcomeTask(key, channel) {
  const outcome = CONVERSATION_OUTCOMES[key];
  return outcome?.decision === 'considering' && channel === 'whatsapp' ? 'whatsapp_followup' : outcome?.task || null;
}
// Center visits are always agreed; preparing a placement test is internal work.
export function scheduleKindRule(taskType, preferred) {
  if (taskType === 'center_visit') return { fixed: true, kind: 'appointment' };
  if (taskType === 'confirm_placement_test') return { fixed: true, kind: 'reminder' };
  return { fixed: false, kind: preferred || 'reminder' };
}
export function nextTaskSpec({ taskType, kind, preset, due, instructions }) {
  const spec = { task_type: taskType, ...(kind ? { schedule_kind: kind } : {}) };
  if (kind === 'reminder' && REMINDER_PRESETS[preset]) spec.due_preset = preset;
  else spec.due_at = casablancaInstant(due);
  spec.instructions = instructions || null;
  return spec;
}
export function conversationDecision(key, { channel, note, reason, next }) {
  const outcome = CONVERSATION_OUTCOMES[key];
  if (!outcome) throw new Error('Choisissez le résultat de l’échange.');
  const data = { decision: outcome.decision, channel, ...(note?.trim() ? { note: note.trim() } : {}) };
  if (outcome.decision === 'lost') data.reason = 'not_interested';
  else if (outcome.decision === 'not_qualified') data.reason = reason;
  else {
    data.next_task = next;
    if (outcome.step) data.qualification_step = outcome.step;
  }
  return data;
}
export function taskTitle(task) {
  if (!task) return 'Action';
  return `${TASKS[task.task_type] || 'Action'}${FOLLOWUP_REASONS[task.followup_reason] ? ` · ${FOLLOWUP_REASONS[task.followup_reason]}` : ''}`;
}
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
  enrollment_started: 'Inscription commencée',
  lead_converted: 'Inscription confirmée',
  conversion_review_required: 'Inscription à vérifier par la direction',
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
const operationalDateFormatter = new Intl.DateTimeFormat('fr-MA', {
  timeZone:'Africa/Casablanca',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
});
export function dateLabel(value) {
  return value ? operationalDateFormatter.format(new Date(value)) : 'À planifier';
}
// Only database-projected civil values may label operational scheduled times.
// No browser tzdata fallback: a missing projection is visibly unconfirmed.
export function scheduledLabel(value) {
  const day = value?.local_date;
  if (!/^\d{4}-\d\d-\d\d$/.test(day || '')) return 'Horaire à confirmer';
  const [year, month, date] = day.split('-');
  const label = `${date}/${month}/${year}`;
  return /^\d\d:\d\d/.test(value?.local_time || '')
    ? `${label} · ${value.local_time.slice(0,5)}` : `${label} · Heure non précisée`;
}
export function staffLabel(person) {
  return person?.display_label || person?.name || 'Responsable sélectionné';
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
  if (/Existing enrollment status requires review/i.test(message)) return 'Une inscription existe sans statut. Demandez à l’administration de la vérifier avant de poursuivre.';
  if (/Existing enrollment requires explicit selection/i.test(message)) return 'Une inscription existe déjà pour ce programme et cette année. Sélectionnez-la.';
  if (/Explicit new learner|Explicit student choice/i.test(message)) return 'Vérifiez les correspondances et choisissez explicitement l’apprenant.';
  if (/Enrollment unavailable|Student unavailable/i.test(message)) return 'Cet apprenant ou cette inscription ne peut pas être rattaché. Vérifiez votre sélection.';
  if (/Invalid enrollment|Invalid level/i.test(message)) return 'Vérifiez le programme, l’année scolaire, le niveau et le groupe.';
  if (/placement already scheduled/i.test(message)) return 'Un test est déjà prévu. Ouvrez-le pour le reprogrammer.';
  if (/recommended level|missing result/i.test(message)) return 'Renseignez le niveau recommandé avant de valider le résultat.';
  if (/future placement|invalid placement/i.test(message)) return 'Vérifiez la date, l’heure et le résultat du test.';
  if (message.includes('No effective follow-up policy')) return 'Le calendrier de suivi n’est pas encore configuré. Demandez à un directeur de le publier.';
  if (message.includes('minimum spacing')) return 'Le délai minimum entre deux appels n’est pas encore écoulé (3 heures par défaut).';
  if (message.includes('five current-cycle')) return 'Cinq appels sans réponse dans la séquence actuelle sont nécessaires.';
  if (message.includes('Reminder preset')) return 'Choisissez soit un rappel rapide, soit une date précise.';
  if (message.includes('Invalid follow-up kind')) return 'Une visite au centre est toujours un rendez-vous convenu avec le parent.';
  if (message.includes('Considering decision')) return 'Pour un parent en réflexion, prévoyez un rappel ou un suivi WhatsApp.';
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

export const BOARD_STAGES = [...ACTIVE, 'CONVERTED'];
export const OPPORTUNITY_VIEWS = {
  all: 'Tous les prospects', mine: 'Mes prospects', new_today: 'Nouveaux aujourd’hui',
  attention: 'À traiter', follow_up_today: 'Suivi aujourd’hui', placement: 'Tests de niveau',
  qualified: 'Qualifiés', no_response: 'Sans réponse', closed: 'Clôturés'
};
// Presentation routing only. The server command owns evidence and resulting stage.
export function opportunityAction(from, to) {
  if (from === to) return null;
  if (from === 'NEW' && to === 'CONTACTING') return 'call';
  if (['NEW', 'CONTACTING'].includes(from) && to === 'ENGAGED') return 'conversation';
  if (['NEW', 'CONTACTING', 'ENGAGED'].includes(from) && to === 'QUALIFIED') return 'qualify';
  if (from === 'QUALIFIED' && to === 'CONVERTED') return 'enrollment';
  return 'unsupported';
}
