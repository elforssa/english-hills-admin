import assert from 'node:assert/strict';
import {
  CANONICAL_KEYS, JOB_ERROR_LABELS, PUBLISH_KEYS, attributionDay, buildPublishPayload, canRetry, copyFromMapping,
  defaultEffectiveFrom, effectiveFromError, formStatusLabel, groupMetaForms, jobChannel, jobErrorLabel, jobHint,
  jobsToHandle, metaConnection, pollingStatus, retirePlan, rpcErrorMessage, spendFreshness, websiteForms,
} from '../src/lib/crm/intakeAdmin.mjs';
import { ratioGuard, ratioGuardNote } from '../src/lib/crm/funnel.mjs';

const DAY = 86400000;
const now = Date.parse('2026-10-24T08:00:00Z');
const iso = offsetDays => new Date(now + offsetDays * DAY).toISOString();
const meta = { id: 'meta-1', provider: 'meta', settings: { meta_reconciliation: { enabled: true, lookback_minutes: 1440 },
  attribution_enrichment: { enabled: true, started_at: '2026-10-12T00:33:39.957Z' } }, page_id: '41', account_id: '42', access_token_secret_ref: 'CRM_META_PAGE_TOKEN_X' };
const website = { id: 'web-1', provider: 'website', settings: { origin: 'https://example.invalid' } };
const mapping = (form_key, version, effective, retired = null, extra = {}) => ({
  id: `${form_key}-v${version}`, connection_id: 'meta-1', channel: 'meta_instant_form', form_key, version,
  form_name: `Form ${form_key} v${version}`, effective_from: iso(effective), retired_at: retired == null ? null : iso(retired),
  field_map: { contact_name: 'full_name', phone: 'phone_number' }, question_labels: { travel: 'Distance' },
  option_labels: { travel: { yes: 'Oui' } }, learner_policy: 'optional', default_session_type: 'Yearly',
  default_program_interest_text: 'Annuel', ...extra,
});

// Connection choice and polling status.
assert.equal(metaConnection([website, meta]).id, 'meta-1');
assert.equal(metaConnection([website]), null);
assert.equal(metaConnection([{ id: 'off', provider: 'meta', settings: {} }, meta]).id, 'meta-1');
assert.deepEqual(pollingStatus(meta), { enabled: true, lookbackHours: 24 });
assert.deepEqual(pollingStatus({ settings: { meta_reconciliation: { enabled: true, lookback_minutes: 60 } } }), { enabled: true, lookbackHours: 1 });
assert.deepEqual(pollingStatus({ settings: { meta_reconciliation: { enabled: false, lookback_minutes: 60 } } }), { enabled: false, lookbackHours: null });
assert.deepEqual(pollingStatus(null), { enabled: false, lookbackHours: null });

// Grouping and state follow the claim predicate: any effective, unretired version polls.
const forms = groupMetaForms([
  mapping('100', 1, -40), mapping('100', 2, -5), // Production shape: two unretired versions
  mapping('200', 1, -40, -1), mapping('200', 2, -5), // only the newer one unretired
  mapping('300', 1, -40, -1), mapping('300', 2, -5, -1), // fully retired
  mapping('400', 1, 2), // future only
  mapping('500', 1, -40), mapping('500', 2, -5, -1), // the regression: latest retired, older still polls
  mapping('600', 1, -40, -1), mapping('600', 2, 3), // retired past + future unretired
  { ...mapping('700', 1, -40), connection_id: 'other' },
  { ...mapping('website_form', 1, -40), channel: 'website', connection_id: 'web-1' },
], 'meta-1', now);
const byKey = Object.fromEntries(forms.map(f => [f.form_key, f]));
assert.deepEqual(forms.map(f => f.form_key), ['100', '200', '300', '400', '500', '600']);
assert.deepEqual(byKey['100'].versions.map(v => v.version), [1, 2]);
assert.equal(byKey['100'].latest.version, 2);
assert.deepEqual([byKey['100'].status, byKey['100'].partial, formStatusLabel(byKey['100'])], ['active', false, 'Actif']);
assert.deepEqual([byKey['200'].status, byKey['200'].partial, formStatusLabel(byKey['200'])], ['active', true, 'Partiellement arrêté']);
assert.deepEqual([byKey['300'].status, byKey['300'].partial, formStatusLabel(byKey['300'])], ['stopped', false, 'Arrêté']);
assert.deepEqual([byKey['400'].status, formStatusLabel(byKey['400'])], ['scheduled', 'Planifié']);
assert.deepEqual([byKey['500'].status, byKey['500'].partial, formStatusLabel(byKey['500'])], ['active', true, 'Partiellement arrêté']);
assert.deepEqual([byKey['600'].status, byKey['600'].partial], ['scheduled', true]);
// A version retired in the future (retire of a future-dated version) still counts as polled until then.
assert.equal(groupMetaForms([mapping('800', 1, -2, 1)], 'meta-1', now)[0].status, 'active');
assert.deepEqual(websiteForms([mapping('a', 1, -1, null, { channel: 'website' }), mapping('a', 3, -1, null, { channel: 'website' }),
  mapping('a', 2, -1, null, { channel: 'website' }), mapping('100', 1, -1)]).map(m => m.version), [3]);

// Arrêter l'import retires every unretired version, oldest first, one call each.
assert.deepEqual(retirePlan(byKey['100']), ['100-v1', '100-v2']);
assert.deepEqual(retirePlan(byKey['500']), ['500-v1']);
assert.deepEqual(retirePlan(byKey['300']), []);

// Copy and payload builder: only accepted keys, Meta connection only, digits-only form ID.
const copied = copyFromMapping(byKey['100'].latest);
assert.deepEqual(Object.keys(copied).sort(), ['default_program_interest_text', 'default_session_type', 'field_map', 'learner_policy', 'option_labels', 'question_labels']);
copied.field_map.phone = 'changed';
assert.equal(byKey['100'].latest.field_map.phone, 'phone_number', 'copies are independent');
assert.deepEqual(copyFromMapping(null), {});
const draft = { form_key: ' 987654321 ', form_name: ' Rentrée ', field_map: { contact_name: 'full_name', phone: ' phone_number ', email: '' },
  question_labels: { q: 'Question' }, option_labels: {}, learner_policy: 'required', default_session_type: 'Adults',
  default_program_interest_text: '', effective_from: iso(-30) };
const built = buildPublishPayload(meta, draft, [], now);
assert.equal(built.p_connection, 'meta-1');
assert.deepEqual(Object.keys(built).sort(), ['p_connection', 'p_data']);
assert(Object.keys(built.p_data).every(k => PUBLISH_KEYS.includes(k)));
assert.deepEqual(built.p_data, { form_key: '987654321', form_name: 'Rentrée', field_map: { contact_name: 'full_name', phone: 'phone_number' },
  question_labels: { q: 'Question' }, option_labels: {}, learner_policy: 'required', default_session_type: 'Adults', effective_from: iso(-30) });
assert(!JSON.stringify(built).includes('page') && !JSON.stringify(built).includes('TOKEN'));
for (const connection of [website, null, { ...meta, provider: undefined }]) assert(buildPublishPayload(connection, draft, [], now).errors);
for (const form_key of ['', 'abc', '12a', '1'.repeat(33), '-1', '1.5']) assert(buildPublishPayload(meta, { ...draft, form_key }, [], now).errors, form_key);
assert(!buildPublishPayload(meta, { ...draft, form_key: '1'.repeat(32) }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, form_name: 'x'.repeat(201) }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, field_map: { unknown: 'x' } }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, field_map: { phone: 'x'.repeat(101) } }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, default_session_type: 'Kids' }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, learner_policy: 'maybe' }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, question_labels: null }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, option_labels: [] }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, default_program_interest_text: 'x'.repeat(201) }, [], now).errors);
assert.deepEqual(CANONICAL_KEYS, ['contact_name', 'phone', 'whatsapp', 'email', 'learner_name', 'learner_age', 'learner_birth_date', 'session_type', 'program_interest_text']);

// D4 effective-date rules.
assert.equal(defaultEffectiveFrom([], now), iso(-30));
assert.equal(defaultEffectiveFrom(byKey['100'].versions, now), iso(0));
assert.equal(effectiveFromError(iso(-30), [], now), null);
assert.equal(effectiveFromError(iso(-90), [], now), null);
assert.match(effectiveFromError(iso(-90.01), [], now), /90 jours/);
assert.equal(effectiveFromError(iso(1), [], now), null, 'a future first version is Planifié');
assert.match(effectiveFromError('not a date', [], now), /invalide/);
assert.equal(effectiveFromError(iso(0), byKey['100'].versions, now), null);
assert.match(effectiveFromError(iso(-5), byKey['100'].versions, now), /postérieure/);
assert.match(effectiveFromError(iso(-6), byKey['100'].versions, now), /postérieure/);
assert.equal(effectiveFromError(iso(-4.9), byKey['100'].versions, now), null);
assert.match(effectiveFromError(iso(2), byKey['600'].versions, now), /postérieure/, 'later than the latest version, even a future one');
assert(buildPublishPayload(meta, { ...draft, effective_from: iso(-91) }, [], now).errors);
assert(buildPublishPayload(meta, { ...draft, effective_from: iso(-6) }, byKey['100'].versions, now).errors);

// Jobs to handle and the retry predicate (crm_retry_meta_job: blocked/retry, attempts < 8).
const jobs = [
  { id: 'a', status: 'blocked', attempt_count: 1, last_error_code: 'missing_mapping', connection_id: 'meta-1' },
  { id: 'b', status: 'retry', attempt_count: 7, last_error_code: 'timeout', connection_id: 'web-1' },
  { id: 'c', status: 'retry', attempt_count: 8, last_error_code: 'timeout', connection_id: 'meta-1' },
  { id: 'd', status: 'dead', attempt_count: 8, last_error_code: 'attempts_exhausted', connection_id: 'meta-1' },
  { id: 'e', status: 'done', attempt_count: 1, last_error_code: null, connection_id: 'meta-1' },
  { id: 'f', status: 'pending', attempt_count: 0, last_error_code: null, connection_id: 'meta-1' },
  { id: 'g', status: 'processing', attempt_count: 1, last_error_code: null, connection_id: 'meta-1' },
];
assert.deepEqual(jobsToHandle(jobs).map(j => j.id), ['a', 'b', 'c', 'd']);
assert.deepEqual(jobs.filter(canRetry).map(j => j.id), ['a', 'b']);
assert.equal(canRetry(null), false);
assert.equal(jobChannel(jobs[0], [meta, website]), 'Formulaire Meta');
assert.equal(jobChannel(jobs[1], [meta, website]), 'Site web');
assert.equal(jobChannel({ connection_id: 'gone' }, [meta]), '—');
assert.match(jobHint(jobs[0]), /date d’effet antérieure au lead, puis réessayez/);
assert.match(jobHint(jobs[3]), /non réessayable/i);
assert.equal(jobHint(jobs[1]), null);
// Every code a job can carry (crm_fail_meta_job 086 and the claim) has a French label.
for (const code of ['timeout', 'rate_limit', 'provider_unavailable', 'network', 'storage_unavailable', 'missing_secret', 'provider_auth',
  'missing_mapping', 'missing_policy', 'connection_disabled', 'invalid_provider_data', 'invalid_mapping', 'attempts_exhausted']) {
  assert(JOB_ERROR_LABELS[code] && jobErrorLabel(code) === JOB_ERROR_LABELS[code], code);
}
assert.equal(jobErrorLabel(null), '—');
assert.equal(jobErrorLabel('something_new'), 'Erreur inconnue');

// RPC errors in French; 40001 asks for a manual refresh.
assert.equal(rpcErrorMessage({ code: '22023' }), 'Champs refusés : vérifiez l’identifiant et les champs');
assert.equal(rpcErrorMessage({ code: '42501' }), 'Réservé à la direction');
assert.equal(rpcErrorMessage({ code: '40001' }), 'Actualisez puis réessayez');
assert.equal(rpcErrorMessage({ code: 'PT409' }, 'retire'), 'Actualisez puis réessayez', 'ADR-009 barrier conflict');
assert.equal(rpcErrorMessage({ code: '22023' }, 'publish'), 'Champs refusés : vérifiez l’identifiant et les champs');
assert.equal(rpcErrorMessage({ code: '22023' }, 'retire'), 'Version déjà arrêtée : la liste est actualisée.');
assert.equal(rpcErrorMessage({ code: '22023' }, 'retry'), 'Ce lead n’est plus réessayable : la liste est actualisée.');
assert.equal(rpcErrorMessage({ code: '42501' }, 'retry'), 'Réservé à la direction');
assert.match(rpcErrorMessage({ code: '23505', message: 'duplicate key value violates crm_form_mappings' }), /^Action refusée/);
assert(!rpcErrorMessage({ code: 'XX000', message: 'secret detail' }).includes('secret'));

// Spend freshness: red when enabled and older than 2 × interval, or never completed.
const hoursAgo = h => new Date(now - h * 3600000).toISOString();
assert.deepEqual(spendFreshness({ enabled: true, refresh_interval_hours: 6, last_completed_at: hoursAgo(3) }, now), { enabled: true, hoursAgo: 3, stale: false });
assert.equal(spendFreshness({ enabled: true, refresh_interval_hours: 6, last_completed_at: hoursAgo(12) }, now).stale, false);
assert.equal(spendFreshness({ enabled: true, refresh_interval_hours: 6, last_completed_at: hoursAgo(12.5) }, now).stale, true);
assert.deepEqual(spendFreshness({ enabled: true, refresh_interval_hours: 6, last_completed_at: null }, now), { enabled: true, hoursAgo: null, stale: true });
assert.equal(spendFreshness({ enabled: false, refresh_interval_hours: 6, last_completed_at: hoursAgo(100) }, now).stale, false);
assert.equal(spendFreshness(null, now), null);

// Attribution day in the account time zone.
assert.equal(attributionDay(meta, 'Africa/Casablanca'), '2026-10-12');
// Day boundaries with fixed-offset zones (Etc/GMT-1 is UTC+1, Etc/GMT+4 is UTC−4): Morocco's
// offset depends on the tzdata release (plain UTC+0 from 2026-09-20 since tzdata 2026c).
const started = at => ({ settings: { attribution_enrichment: { started_at: at } } });
assert.equal(attributionDay(started('2026-10-11T23:30:00Z'), 'Etc/GMT-1'), '2026-10-12');
assert.equal(attributionDay(started('2026-10-11T22:59:59Z'), 'Etc/GMT-1'), '2026-10-11');
assert.equal(attributionDay(started('2026-10-12T02:00:00Z'), 'Etc/GMT+4'), '2026-10-11');
assert.equal(attributionDay(started('2026-10-12T04:00:00Z'), 'Etc/GMT+4'), '2026-10-12');
assert.equal(attributionDay(started('2026-10-11T12:00:00Z'), 'Africa/Casablanca'), '2026-10-11');
assert.equal(attributionDay(started('2026-10-11T12:00:00Z')), '2026-10-11', 'defaults to Africa/Casablanca');
assert.equal(attributionDay({ settings: {} }), null);
assert.equal(attributionDay(null), null);

// ratioGuard (P1-D).
const row = (bucket, leads) => ({ bucket, leads });
assert.deepEqual(ratioGuard({ from: '2026-10-01', attributionDay: '2026-10-12', rows: [row('meta:1', 5)], total: 1 }),
  { hidden: true, attributionDay: '2026-10-12', partial: false, unattributed: 0, truncated: false });
assert.equal(ratioGuard({ from: '2026-10-11', attributionDay: '2026-10-12' }).hidden, true);
assert.equal(ratioGuard({ from: '2026-10-12', attributionDay: '2026-10-12' }).hidden, false);
assert.equal(ratioGuard({ from: '2026-11-01', attributionDay: '2026-10-12', rows: [row('meta:1', 5)], total: 1 }).partial, false);
assert.equal(ratioGuard({ from: '2026-11-01', attributionDay: null }).hidden, true, 'attribution never started');
assert.deepEqual(ratioGuard({ from: '2026-11-01', attributionDay: '2026-10-12',
  rows: [row('meta:1', 5), row('pending:meta_instant_form', 2), row('unknown:meta_instant_form', 3), row('unknown:website', 9), row('pending:website', 4)], total: 5 }),
{ hidden: false, attributionDay: '2026-10-12', partial: true, unattributed: 5, truncated: false });
assert.deepEqual(ratioGuard({ from: '2026-11-01', attributionDay: '2026-10-12', rows: [row('meta:1', 5)], total: 60 }),
  { hidden: false, attributionDay: '2026-10-12', partial: true, unattributed: 0, truncated: true });
assert.equal(ratioGuard({ from: '2026-11-01', attributionDay: '2026-10-12', rows: [row('pending:meta_instant_form', 0)], total: 1 }).partial, false);
const note = (rows, total, from = '2026-11-01') => ratioGuardNote(ratioGuard({ from, attributionDay: '2026-10-12', rows, total }));
assert.equal(note([row('pending:meta_instant_form', 2)], 1), 'partiel : 2 prospects Meta sans attribution');
assert.equal(note([row('unknown:meta_instant_form', 1)], 1), 'partiel : 1 prospect Meta sans attribution');
assert.equal(note([row('unknown:meta_instant_form', 3)], 60), 'partiel : 3 prospects Meta sans attribution (lignes affichées)');
assert.equal(note([row('meta:1', 5)], 60), 'partiel : couverture vérifiée sur les lignes affichées uniquement', 'never "0 prospect"');
assert.equal(note([row('meta:1', 5)], 1), null);
assert.equal(note([row('pending:meta_instant_form', 2)], 1, '2026-10-01'), null, 'hidden ratios carry no note');

console.log('PASS intake admin helpers: claim-predicate form state, every-version retire plan, allowed-keys Meta-only payload, D4 dates, retry predicate, French labels, spend freshness, attribution day and ratioGuard');
