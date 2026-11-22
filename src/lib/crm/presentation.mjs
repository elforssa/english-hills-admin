import { centreFormatter, centreInstant, CENTRE_UTC_OFFSET_MINUTES } from '../centreClock.mjs';
import { isRecordConflict } from '../conflictErrors.mjs';

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
  whatsapp_followup: 'À faire par nous (WhatsApp)',
  confirm_placement_test: 'Préparer un test de niveau',
  post_test_followup: 'Proposer l’inscription',
  center_visit: 'Rendez-vous au centre',
  enrollment_followup: 'Finaliser l’inscription',
  awaiting_prospect: 'En attente du prospect'
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
// A conversation by WhatsApp naturally continues on WhatsApp while the contact decides.
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
// Prose is required only for explanations; a hidden conversation result never counts.
export function noteRequired({ action, outcomeLed, interaction, reason, step, unsuitableReason }) {
  const result = outcomeLed ? interaction : '';
  return ['note', 'cancel', 'reopen', 'complete'].includes(action)
    || ['lost', 'unreachable', 'notQualified'].includes(action) && reason === 'other'
    || action === 'qualify' && step === 'other'
    || result === 'other_step'
    || result === 'not_suitable' && unsuitableReason === 'other';
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
  spoke_with_contact: 'Conversation avec le contact',
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
  conversion_review_cleared: 'Vérification levée : paiement de remplacement',
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
const operationalDateFormatter = centreFormatter('fr-MA', {
  day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
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
// Interpret wall-clock input on the centre's clock, independently of the browser zone.
// This converts time only; calling windows remain exclusively server-authoritative.
export function casablancaInstant(value) {
  return centreInstant(value);
}
export function commandError(error) {
  if (isRecordConflict(error)) return 'Ce prospect a changé depuis son ouverture. Les informations sont actualisées. Vérifiez puis réessayez.';
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
  if (message.includes('Agreed callback time is outside calling hours')) return 'Cette heure convenue est hors des horaires d’appel. Choisissez avec le contact une autre heure compatible.';
  if (message.includes('Reminder preset')) return 'Choisissez soit un rappel rapide, soit une date précise.';
  if (message.includes('Invalid follow-up kind')) return 'Une visite au centre est toujours un rendez-vous convenu avec le contact.';
  if (message.includes('Considering decision')) return 'Pour un contact en réflexion, prévoyez un rappel ou un suivi WhatsApp.';
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

// RCC-B1 responsive presentation. The only width thresholds deciding Opportunities
// layout: the Tailwind sm/lg queries, shared verbatim by CSS variants and matchMedia.
export const BAND_QUERIES = { sm: '(min-width: 640px)', lg: '(min-width: 1024px)' };
export function resolveBand({ sm, lg }) {
  return lg ? 'desktop' : sm ? 'tablet' : 'phone';
}
// List below lg renders the stage list; view=closed keeps forcing List.
export function resolvePresentation({ band, layout }) {
  if (layout === 'board') return 'board';
  return band === 'desktop' ? 'list' : 'stage-list';
}
// Display/navigation only: chips set the existing stage filter and never a command.
export function stageChips(view, stage) {
  const chips = view === 'closed' ? ['LOST', 'NOT_QUALIFIED'] : [...BOARD_STAGES];
  return STATUS[stage] && !chips.includes(stage) ? [...chips, stage] : chips;
}
export const MEANINGFUL_EVENTS = new Set([
  'contact_attempted', 'call_no_answer', 'call_busy', 'call_declined', 'call_unreachable', 'call_wrong_number',
  'conversation_recorded', 'whatsapp_sent', 'whatsapp_conversation', 'note_added',
  'lead_engaged', 'lead_qualified', 'lead_lost', 'lead_not_qualified', 'lead_reopened',
  'placement_test_booked', 'placement_test_rescheduled', 'placement_test_attended', 'placement_result_entered',
  'enrollment_started', 'lead_converted', 'conversion_review_required', 'conversion_review_cleared'
]);
// Collapsed history: the latest meaningful exchanges of the first loaded page, else the latest entries.
export function historySummary(rows, size = 3) {
  const list = Array.isArray(rows) ? rows : [];
  const meaningful = list.filter(row => MEANINGFUL_EVENTS.has(row?.event_type));
  return (meaningful.length ? meaningful : list).slice(0, size);
}
// Escape inside a modal sheet: an already consumed Escape is final; otherwise a nested
// popup closes before the sheet. Independent of document listener order.
export function nestedEscapeAction({ defaultPrevented, nestedDetected, openCount }) {
  if (defaultPrevented) return 'none';
  return nestedDetected || openCount > 0 ? 'close-top' : 'allow-sheet';
}
// One controlled popup. close() changes only its own state and is idempotent.
export function createGuardedEntry(setClosed) {
  let open = false;
  return {
    get open() { return open; },
    opened() { open = true; },
    closed() { open = false; },
    close() { if (!open) return false; open = false; setClosed(); return true; }
  };
}
// Popups currently open inside one sheet, in opening order.
export function createLayerStack() {
  const entries = [];
  return {
    size: () => entries.length,
    push(entry) { if (!entries.includes(entry)) entries.push(entry); },
    remove(entry) { const index = entries.indexOf(entry); if (index >= 0) entries.splice(index, 1); },
    closeTop() { const top = entries.pop(); return top ? top.close() : false; }
  };
}
// Board scroll is presentation state: restored only within the same filter scope, clamped.
export function restoredScroll(saved, filterKey, { scrollWidth, clientWidth, scrollHeight, clientHeight }) {
  if (!saved || saved.filterKey !== filterKey) return null;
  const clamp = (value, max) => Math.max(0, Math.min(Number(value) || 0, Math.max(0, max)));
  return { left: clamp(saved.left, scrollWidth - clientWidth), top: clamp(saved.top, scrollHeight - clientHeight) };
}
// Reception sees the Meta ad behind an inquiry as names (migration 126, owner decision
// 2026-11-03): "ad set › ad" with the campaign as a muted suffix, the campaign alone
// when no ad set or ad name exists, nothing when the read gives no name (ids alone
// never show).
export function adSourceLabel(ad) {
  if (!ad || typeof ad !== 'object') return null;
  const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const main = [text(ad.adset_name), text(ad.ad_name)].filter(Boolean).join(' › ');
  const campaign = text(ad.campaign_name);
  if (!main && !campaign) return null;
  return main ? { main, campaign } : { main: campaign, campaign: null };
}

// ---------------------------------------------------------------------------
// RWR-r5 §4.9: one next action per prospect. Vocabulary, payload builder, slot
// list and refusal messages shared by NextActionPanel, ExchangeDialog,
// NextActionDialog and AppointmentOutcome. The server stays authoritative: these
// helpers only shape what the user picked.
// ---------------------------------------------------------------------------
export const WORK_BUCKETS = { overdue: 'En retard', today: 'Aujourd’hui', tomorrow: 'Demain', upcoming: 'À venir', awaiting: 'En attente' };
export const STALE_MESSAGE = 'Ce prospect a été modifié, rechargez.';
export const CALL_RESULTS = { no_answer: 'Pas de réponse', busy: 'Occupé', declined: 'Refusé', unreachable: 'Injoignable', wrong_number: 'Mauvais numéro', spoke: 'On a parlé' };
export const FAILED_CALL_RESULTS = ['no_answer', 'busy', 'declined', 'unreachable'];
export const EXCHANGE_CHANNELS = { phone: 'Téléphone', whatsapp: 'WhatsApp', in_person: 'Au centre', other: 'Autre' };
export function exchangeResults(channel) {
  if (channel === 'phone') return CALL_RESULTS;
  if (channel === 'whatsapp') return { whatsapp_sent: 'Message envoyé', spoke: 'On a échangé' };
  if (channel === 'in_person') return { spoke: 'On a parlé' };
  return { spoke: 'On a parlé', note: 'Simple note' };
}
// What was agreed (« On a parlé ») or what comes next (« Changer »).
export const NEXT_KINDS = {
  keep: 'Garder l’action actuelle',
  center_visit: 'Rendez-vous au centre',
  callback: 'Rappel convenu',
  our_step: 'À faire par nous',
  reminder: 'Rappel pour l’équipe',
  awaiting: 'En attente du prospect',
  enrol: 'Inscrire maintenant',
  lost: 'Pas intéressé',
  not_qualified: 'Pas pour nous'
};
export const CLOSE_KINDS = ['lost', 'not_qualified'];
export const OUR_STEP_PRESETS = { tomorrow: 'Demain', in_2_days: 'Dans 2 jours', in_3_days: 'Dans 3 jours', next_week: 'Dans une semaine' };
export const APPOINTMENT_OUTCOMES = { came_enrolled: 'Venu · s’inscrit', came_will_return: 'Venu · reviendra', came_not_interested: 'Venu · pas intéressé', no_show: 'Absent' };
export const COMMAND_LABELS = {
  log_exchange: 'Échange', change_next_action: 'Prochaine action changée', appointment_outcome: 'Résultat du rendez-vous',
  close_prospect: 'Prospect clôturé', reopen_prospect: 'Prospect rouvert', create_manual_lead: 'Prospect créé'
};
const CALL_ACTIONS = ['first_contact', 'contact_attempt', 'callback'];
export function isCallAction(action) {
  return CALL_ACTIONS.includes(action?.task_type);
}
// OD-18: replacing an appointment needs « Remplace » ; leaving « Finaliser
// l’inscription » for anything but another enrolment action needs a reason.
// Closing is not a replacement.
export function replaceRules(current, kind) {
  const replacing = !!current && !!kind && kind !== 'keep' && !CLOSE_KINDS.includes(kind);
  return {
    confirmAppointment: replacing && current.task_type === 'center_visit',
    enrollmentReason: replacing && current.task_type === 'enrollment_followup' && kind !== 'enrol'
  };
}
const pad = n => String(n).padStart(2, '0');
const isoDow = date => { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
// Times offered by the picker: the windows of that weekday in the current hours
// (calling for calls, opening for visits), none on a closed date, never in the past.
export function slotTimes(hours, kind, date, { step = 15, now = null } = {}) {
  if (!hours || !/^\d{4}-\d\d-\d\d$/.test(date || '')) return [];
  if ((hours.closed_dates || []).includes(date)) return [];
  const windows = (kind === 'opening' ? hours.opening_hours : hours.calling_hours)?.[String(isoDow(date))] || [];
  const minutes = value => { const [h, m] = String(value).split(':').map(Number); return h * 60 + m; };
  const floor = now && now.date === date ? minutes(now.time) : -1;
  const out = [];
  for (const [open, close] of windows) {
    for (let t = minutes(open); t < minutes(close); t += step) if (t > floor) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return out;
}
// The `next` of crm_log_exchange / crm_change_next_action from the picker state.
// Throws a French message the form shows when a required choice is missing.
export function nextActionPayload(form, current) {
  const kind = form?.kind;
  if (!NEXT_KINDS[kind]) throw new Error('Choisissez la prochaine action.');
  if (kind === 'keep') return 'keep';
  if (CLOSE_KINDS.includes(kind)) {
    if (!form.reason) throw new Error('Choisissez le motif.');
    if (form.reason === 'other' && !form.closeNote?.trim()) throw new Error('Précisez le motif « Autre ».');
    return { close: { status: kind === 'lost' ? 'LOST' : 'NOT_QUALIFIED', reason: form.reason, ...(form.closeNote?.trim() ? { note: form.closeNote.trim() } : {}) } };
  }
  if (kind === 'enrol') return { enrol: form.date ? { due_at: centreInstant(`${form.date}T00:00`) } : { due_preset: 'tomorrow' } };
  const at = () => {
    if (!form.date || !form.time) throw new Error('Choisissez la date et l’heure.');
    return centreInstant(`${form.date}T${form.time}`);
  };
  let spec;
  if (kind === 'center_visit') spec = { task_type: 'center_visit', due_at: at(), with_test: !!form.withTest };
  else if (kind === 'callback') spec = { task_type: 'callback', schedule_kind: 'appointment', due_at: at() };
  else if (kind === 'our_step' || kind === 'reminder') {
    const base = kind === 'our_step' ? { task_type: 'whatsapp_followup' } : { task_type: 'callback', schedule_kind: 'reminder' };
    if (OUR_STEP_PRESETS[form.preset] || (kind === 'reminder' && REMINDER_PRESETS[form.preset])) spec = { ...base, due_preset: form.preset };
    else if (form.date) spec = { ...base, due_at: centreInstant(`${form.date}T00:00`) };
    else throw new Error('Choisissez quand le faire.');
  } else {
    // « En attente »: default relance today + 5 days (server), an explicit date, or none.
    spec = { task_type: 'awaiting_prospect', ...(form.noRelance ? { due_at: null } : form.date ? { due_at: centreInstant(`${form.date}T00:00`) } : {}) };
  }
  if (form.instructions?.trim()) spec.instructions = form.instructions.trim();
  const rules = replaceRules(current, kind);
  if (rules.confirmAppointment) {
    if (!form.replaceConfirmed) throw new Error('Cochez « Remplace » pour changer le rendez-vous.');
    spec.replace_action_id = current.id;
  }
  if (rules.enrollmentReason) {
    if (!form.cancelEnrollmentReason?.trim()) throw new Error('Indiquez pourquoi l’inscription n’est plus à finaliser.');
    spec.cancel_enrollment_reason = form.cancelEnrollmentReason.trim();
  }
  return spec;
}
const HINT_MESSAGES = {
  'crm_exchange.attempt_gap': 'Le délai minimum entre deux appels n’est pas écoulé. Cochez « Tentative réelle (hors délai) » si l’appel a bien eu lieu.',
  'crm_hours.outside_calling': 'Cette heure est hors des horaires d’appel. Choisissez un créneau proposé.',
  'crm_hours.outside_opening': 'Cette heure est hors des horaires d’ouverture du centre. Choisissez un créneau proposé.',
  'crm_next_action.replace_confirmation': 'Cochez « Remplace » pour changer le rendez-vous.',
  'crm_next_action.enrollment_kept': 'Indiquez pourquoi l’inscription n’est plus à finaliser, ou gardez l’action actuelle.',
  'crm_next_action.overlap': 'Un autre rendez-vous ou test de cet apprenant est prévu à cette heure.',
  'crm_appointment.before_start': 'Le résultat du rendez-vous se saisit à partir de son heure de début.'
};
// Refusal text for the next-action forms: hint first, then the shared command messages.
export function actionErrorMessage(error) {
  if (error instanceof Error && !error.code && /^(Choisissez|Cochez|Indiquez|Précisez)/.test(error.message)) return error.message;
  if (isRecordConflict(error)) return STALE_MESSAGE;
  return HINT_MESSAGES[error?.hint] || commandError(error);
}
// « Prochain essai possible à 14:20 » from crm_check_action.
export function attemptGapLabel(check) {
  if (!check || check.attempt_gap_ok !== false || !check.next_attempt_allowed_at) return null;
  return `Prochain essai possible à ${centreTimeLabel(check.next_attempt_allowed_at)}`;
}
function centreTimeLabel(value) {
  const shifted = new Date(new Date(value).getTime() + CENTRE_UTC_OFFSET_MINUTES * 60000);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}
