// Director lead-intake panel (LIR-r1 P1-B). Pure helpers over the payloads of the
// existing director RPCs crm_get_meta_diagnostics, crm_publish_meta_form_mapping,
// crm_retire_meta_form_mapping and crm_retry_meta_job; nothing here talks to the
// database, so the rules can be tested without a browser.
import { PROGRAMS } from './funnel.mjs';

const DAY = 86400000;
export const FIRST_VERSION_BACKDATE_DAYS = 30;
// Meta keeps Instant Form leads for 90 days, so an earlier date recovers nothing.
export const FIRST_VERSION_FLOOR_DAYS = 90;
export const MAX_ATTEMPTS = 8;
export const DIAGNOSTICS_PAGE = { p_limit: 100, p_offset: 0 };
export const CANONICAL_KEYS = ['contact_name', 'phone', 'whatsapp', 'email', 'learner_name', 'learner_age',
  'learner_birth_date', 'session_type', 'program_interest_text'];
export const SESSION_TYPES = PROGRAMS;
export const LEARNER_POLICIES = ['required', 'optional'];
// The keys crm_publish_meta_form_mapping (103) accepts; anything else is refused there.
export const PUBLISH_KEYS = ['form_key', 'form_name', 'field_map', 'question_labels', 'default_session_type',
  'default_program_interest_text', 'effective_from', 'learner_policy', 'option_labels'];
const COPIED_KEYS = ['field_map', 'question_labels', 'option_labels', 'learner_policy', 'default_session_type',
  'default_program_interest_text'];

const time = value => (value == null ? null : Date.parse(value));
const isObject = value => value != null && typeof value === 'object' && !Array.isArray(value);

// The Meta connection the claim polls. Publishing must target it: the publish RPC
// does not check the provider itself.
export function metaConnection(connections = []) {
  const meta = connections.filter(c => c?.provider === 'meta');
  return meta.find(c => c.settings?.meta_reconciliation?.enabled === true) || meta[0] || null;
}

export function pollingStatus(connection) {
  const settings = connection?.settings?.meta_reconciliation;
  const enabled = settings?.enabled === true;
  const minutes = Number(settings?.lookback_minutes);
  return { enabled, lookbackHours: enabled && Number.isFinite(minutes) ? minutes / 60 : null };
}

// Exactly the claim predicate of crm_claim_meta_reconciliation (094).
export const versionEffective = (version, now) =>
  time(version.effective_from) <= now && (version.retired_at == null || time(version.retired_at) > now);

// One entry per Instant Form. `status` follows the claim: active when any version is
// effective and unretired, scheduled when only future versions are unretired, stopped
// when every version is retired. `partial` marks a form with both retired and
// unretired versions, which Arrêter l'import has to finish.
export function groupMetaForms(mappings = [], connectionId, now = Date.now()) {
  const forms = new Map();
  for (const mapping of mappings) {
    if ((mapping.channel || 'meta_instant_form') !== 'meta_instant_form') continue;
    if (connectionId && mapping.connection_id !== connectionId) continue;
    if (!forms.has(mapping.form_key)) forms.set(mapping.form_key, []);
    forms.get(mapping.form_key).push(mapping);
  }
  return [...forms.entries()].map(([formKey, versions]) => {
    versions.sort((a, b) => a.version - b.version);
    const unretired = versions.filter(v => v.retired_at == null);
    const status = versions.some(v => versionEffective(v, now)) ? 'active'
      : unretired.some(v => time(v.effective_from) > now) ? 'scheduled' : 'stopped';
    return {
      form_key: formKey, versions, latest: versions.at(-1), unretired, status,
      partial: unretired.length > 0 && unretired.length < versions.length,
    };
  }).sort((a, b) => a.form_key.localeCompare(b.form_key));
}

export const FORM_STATUS_LABELS = { active: 'Actif', scheduled: 'Planifié', stopped: 'Arrêté' };

export function formStatusLabel(form) {
  return form.partial ? 'Partiellement arrêté' : FORM_STATUS_LABELS[form.status];
}

// Website mappings are listed read-only: their latest version per form key.
export function websiteForms(mappings = []) {
  const latest = new Map();
  for (const mapping of mappings) {
    if (mapping.channel !== 'website') continue;
    const key = `${mapping.connection_id}:${mapping.form_key}`;
    if (!latest.has(key) || latest.get(key).version < mapping.version) latest.set(key, mapping);
  }
  return [...latest.values()].sort((a, b) => a.form_key.localeCompare(b.form_key));
}

// Retire every unretired version, oldest first: if a call fails midway, the newest
// version still maps the form's leads.
export const retirePlan = form => form.unretired.map(v => v.id);

export function copyFromMapping(mapping) {
  if (!mapping) return {};
  return Object.fromEntries(COPIED_KEYS.filter(key => mapping[key] != null)
    .map(key => [key, isObject(mapping[key]) ? structuredClone(mapping[key]) : mapping[key]]));
}

// D4: a new form's first version defaults to publication − 30 days, so the leads
// already submitted on it are imported instead of blocking on missing_mapping. A
// new version of an existing form defaults to publication time.
export function defaultEffectiveFrom(versions = [], now = Date.now()) {
  return new Date(versions.length ? now : now - FIRST_VERSION_BACKDATE_DAYS * DAY).toISOString();
}

export function effectiveFromError(value, versions = [], now = Date.now()) {
  const at = time(value);
  if (!Number.isFinite(at)) return 'Date d’effet invalide.';
  if (!versions.length) {
    if (at < now - FIRST_VERSION_FLOOR_DAYS * DAY) return 'Date d’effet antérieure à 90 jours : Meta ne conserve pas les leads plus anciens.';
    return null;
  }
  // The database accepts any date; an earlier date would change how older leads map.
  const latest = Math.max(...versions.map(v => time(v.effective_from)));
  if (at <= latest) return 'La date d’effet doit être postérieure à celle de la dernière version.';
  return null;
}

// Builds {p_connection, p_data} for crm_publish_meta_form_mapping with only the
// accepted keys. Returns {errors} instead when a field would be refused.
export function buildPublishPayload(connection, draft, versions = [], now = Date.now()) {
  const errors = [];
  if (connection?.provider !== 'meta' || !connection.id) errors.push('Connexion Meta introuvable.');
  const formKey = String(draft.form_key ?? '').trim();
  if (!/^[0-9]{1,32}$/.test(formKey)) errors.push('Identifiant du formulaire : chiffres uniquement, 32 au plus.');
  const formName = String(draft.form_name ?? '').trim();
  if (formName.length > 200) errors.push('Nom : 200 caractères au plus.');
  const fieldMap = {};
  for (const key of CANONICAL_KEYS) {
    const value = String(draft.field_map?.[key] ?? '').trim();
    if (!value) continue;
    if (value.length > 100) errors.push(`Champ ${key} : 100 caractères au plus.`);
    fieldMap[key] = value;
  }
  for (const key of Object.keys(draft.field_map || {})) {
    if (!CANONICAL_KEYS.includes(key)) errors.push(`Champ inconnu : ${key}.`);
  }
  const sessionType = draft.default_session_type || null;
  if (sessionType && !SESSION_TYPES.includes(sessionType)) errors.push('Type de session invalide.');
  const programText = String(draft.default_program_interest_text ?? '').trim();
  if (programText.length > 200) errors.push('Programme : 200 caractères au plus.');
  const learnerPolicy = draft.learner_policy || 'required';
  if (!LEARNER_POLICIES.includes(learnerPolicy)) errors.push('Politique apprenant invalide.');
  // Absent means empty; null is an unparseable JSON field in the dialog.
  const questionLabels = draft.question_labels === undefined ? {} : draft.question_labels;
  const optionLabels = draft.option_labels === undefined ? {} : draft.option_labels;
  if (!isObject(questionLabels)) errors.push('Libellés des questions : objet JSON attendu.');
  if (!isObject(optionLabels)) errors.push('Libellés des options : objet JSON attendu.');
  const dateError = effectiveFromError(draft.effective_from, versions, now);
  if (dateError) errors.push(dateError);
  if (errors.length) return { errors };
  const data = {
    form_key: formKey,
    field_map: fieldMap,
    question_labels: questionLabels,
    option_labels: optionLabels,
    learner_policy: learnerPolicy,
    effective_from: new Date(time(draft.effective_from)).toISOString(),
  };
  if (formName) data.form_name = formName;
  if (sessionType) data.default_session_type = sessionType;
  if (programText) data.default_program_interest_text = programText;
  return { p_connection: connection.id, p_data: data };
}

export const JOB_STATUSES_TO_HANDLE = ['blocked', 'retry', 'dead'];
export const jobsToHandle = (jobs = []) => jobs.filter(job => JOB_STATUSES_TO_HANDLE.includes(job.status));
// crm_retry_meta_job (086) re-queues blocked/retry jobs below 8 attempts only.
export const canRetry = job => ['blocked', 'retry'].includes(job?.status) && Number(job.attempt_count) < MAX_ATTEMPTS;

export const JOB_ERROR_LABELS = {
  missing_secret: 'Jeton Meta absent du serveur',
  provider_auth: 'Accès Meta refusé (jeton ou autorisation)',
  missing_mapping: 'Formulaire sans correspondance publiée',
  missing_policy: 'Politique de suivi absente',
  connection_disabled: 'Connexion désactivée',
  invalid_provider_data: 'Réponse Meta invalide',
  invalid_mapping: 'Correspondance de formulaire invalide',
  attempts_exhausted: 'Tentatives épuisées',
  timeout: 'Délai dépassé',
  rate_limit: 'Limite de requêtes Meta atteinte',
  provider_unavailable: 'Meta temporairement indisponible',
  network: 'Erreur réseau',
  storage_unavailable: 'Enregistrement indisponible',
};
export const JOB_STATUS_LABELS = { pending: 'En attente', processing: 'En cours', retry: 'Nouvel essai prévu',
  blocked: 'Bloqué', dead: 'Abandonné', done: 'Traité' };

export const jobErrorLabel = code => (code ? JOB_ERROR_LABELS[code] || 'Erreur inconnue' : '—');

export function jobHint(job) {
  if (job.status === 'dead') return 'Non réessayable : récupérez le lead dans l’Espace prospects Meta (Leads Center) et saisissez-le à la main.';
  if (job.last_error_code === 'missing_mapping') return 'Publiez le formulaire avec une date d’effet antérieure au lead, puis réessayez.';
  return null;
}

export const CHANNEL_LABELS = { meta: 'Formulaire Meta', website: 'Site web' };
export function jobChannel(job, connections = []) {
  const provider = connections.find(c => c.id === job.connection_id)?.provider;
  return CHANNEL_LABELS[provider] || '—';
}

// French messages for the fixed SQLSTATEs of the director RPCs. 40001 is a stale
// version or a lifecycle barrier conflict (the 103 bodies take lifecycle_barrier):
// the director refreshes and retries by hand; nothing is retried automatically.
export function rpcErrorMessage(error) {
  switch (error?.code) {
    case '22023': return 'Champs refusés : vérifiez l’identifiant et les champs';
    case '42501': return 'Réservé à la direction';
    case '40001': return 'Actualisez puis réessayez';
    default: return 'Action refusée. Actualisez puis réessayez.';
  }
}

// "Dépenses Meta : dernière synchronisation complète il y a X h". Stale when Insights
// is enabled and the last completed sync is missing or older than twice the interval.
export function spendFreshness(insightsConnection, now = Date.now()) {
  if (!insightsConnection) return null;
  const enabled = insightsConnection.enabled === true;
  const completed = time(insightsConnection.last_completed_at);
  const hoursAgo = Number.isFinite(completed) ? Math.max(0, Math.floor((now - completed) / 3600000)) : null;
  const interval = Number(insightsConnection.refresh_interval_hours);
  const limit = 2 * (Number.isFinite(interval) && interval > 0 ? interval : 6);
  return { enabled, hoursAgo, stale: enabled && (hoursAgo == null || (now - completed) / 3600000 > limit) };
}

// The account-timezone date on which campaign attribution started, or null.
export function attributionDay(connection, timezone = 'Africa/Casablanca') {
  const started = time(connection?.settings?.attribution_enrichment?.started_at);
  if (!Number.isFinite(started)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Africa/Casablanca' }).format(new Date(started));
}
