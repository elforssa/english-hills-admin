import { MetaError, boundedBody, providerId } from './protocol.mjs';
const sessions = ['Yearly', 'Adults', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One', 'Mise à niveau', 'Other'];
const technical = /^(campaignid|campaignname|adsetid|adsetname|adid|adname|accountid|pageid|formid|formname|metaleadid|leadgenid|externalsubmissionid|rawpayload|trackingid|fbclid|fbc|fbp|accesstoken|appsecret|verifytoken|utmsource|utmmedium|utmcampaign|utmcontent|utmterm)$/;
const safeKey = key => !technical.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
const text = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
export async function graphGet({ apiVersion, token, id, fields, fetchImpl = fetch }) {
  if (!/^v[0-9]{1,3}\.0$/.test(apiVersion) || !providerId(id)) throw new MetaError('invalid_provider_data');
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${id}`);
  url.searchParams.set('fields', fields);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, redirect: 'error', cache: 'no-store' });
    if (response.status === 429) throw new MetaError('rate_limit');
    if (response.status >= 500) throw new MetaError('provider_unavailable');
    if ([401, 403].includes(response.status)) throw new MetaError('provider_auth');
    let raw, data;
    try { raw = await boundedBody(response); } catch (error) {
      throw new MetaError(error.code === 'oversized' ? 'invalid_provider_data' : controller.signal.aborted ? 'timeout' : 'network');
    }
    try { data = JSON.parse(raw.toString('utf8')); } catch { throw new MetaError('invalid_provider_data'); }
    if (data?.error) {
      if ([102, 190, 10, 200].includes(data.error.code)) throw new MetaError('provider_auth');
      if ([4, 17, 32, 613].includes(data.error.code)) throw new MetaError('rate_limit');
      if (data.error.is_transient) throw new MetaError('provider_unavailable');
      throw new MetaError('invalid_provider_data');
    }
    if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)) throw new MetaError('invalid_provider_data');
    return data;
  } catch (error) {
    if (error instanceof MetaError) throw error;
    throw new MetaError(controller.signal.aborted ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
}
export async function retrieveLead(job, token, fetchImpl) {
  const base = { apiVersion: job.connection.api_version, token, fetchImpl };
  const lead = await graphGet({ ...base, id: job.payload.leadgen_id, fields: 'id,created_time,form_id,ad_id,field_data' });
  if (lead.id !== job.payload.leadgen_id || lead.form_id !== job.payload.form_id || !Array.isArray(lead.field_data) || lead.field_data.length > 100 ||
    !Number.isFinite(Date.parse(lead.created_time)) || Date.parse(lead.created_time) > Date.now() + 300000) throw new MetaError('invalid_provider_data');
  // Never retain arbitrary provider response/error bodies. Only documented fields
  // used by this adapter enter the protected acquisition snapshot.
  const core = { id: lead.id, form_id: lead.form_id, created_time: lead.created_time, field_data: lead.field_data };
  if (providerId(lead.ad_id)) core.ad_id = lead.ad_id;
  let ad = null;
  if (core.ad_id) {
    try { ad = await graphGet({ ...base, id: core.ad_id, fields: 'id,name,campaign{id,name},adset{id,name}' }); }
    catch { /* Optional metadata must never block operational intake. */ }
    if (ad?.id !== core.ad_id) ad = null;
  }
  return { lead: core, ad };
}
export function normalizeLead(job, retrieved, mapping) {
  if (!mapping) throw new MetaError('missing_mapping');
  const { lead, ad } = retrieved;
  const values = new Map(), answers = [];
  for (const field of lead.field_data) {
    if (!field || !text(field.name, 100) || !Array.isArray(field.values) || field.values.length > 30 || values.has(field.name)) throw new MetaError('invalid_provider_data');
    if (!safeKey(field.name)) continue;
    if (field.values.some(v => !['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'string' && v.length > 2000) || (typeof v === 'number' && !Number.isFinite(v)))) throw new MetaError('invalid_provider_data');
    const value = field.values.length === 1 ? field.values[0] : field.values;
    values.set(field.name, value);
    const configured = text(mapping.question_labels?.[field.name]);
    answers.push({ key: field.name, label: configured || field.name.replace(/[_-]+/g, ' '), value,
      value_type: Array.isArray(value) ? 'array' : typeof value, label_source: configured ? 'mapping' : 'provider_key' });
  }
  const fields = {};
  for (const [canonical, key] of Object.entries(mapping.field_map)) {
    const value = values.get(key);
    if (value != null && !Array.isArray(value)) fields[canonical] = String(value).trim();
  }
  const core = {};
  for (const key of ['contact_name', 'phone', 'whatsapp', 'email', 'learner_name', 'program_interest_text']) core[key] = text(fields[key], key === 'email' ? 254 : 200);
  if (core.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(core.email)) core.email = null;
  core.learner_age = /^\d{1,3}$/.test(fields.learner_age || '') && Number(fields.learner_age) <= 120 ? Number(fields.learner_age) : null;
  core.learner_birth_date = /^\d{4}-\d{2}-\d{2}$/.test(fields.learner_birth_date || '') && Number.isFinite(Date.parse(fields.learner_birth_date)) && Date.parse(fields.learner_birth_date) <= Date.now() ? fields.learner_birth_date : null;
  core.session_type = sessions.includes(fields.session_type) ? fields.session_type : mapping.default_session_type || null;
  core.program_interest_text ||= mapping.default_program_interest_text || null;
  const campaign = providerId(ad?.campaign?.id) ? ad.campaign : null;
  const adset = providerId(ad?.adset?.id) ? ad.adset : null;
  const attribution = {
    external_submission_id: lead.id, page_id: job.payload.page_id, form_id: lead.form_id,
    form_name_snapshot: mapping.form_name || null,
    ad_id: lead.ad_id || null, ad_name_snapshot: text(ad?.name), campaign_id: campaign?.id || null,
    campaign_name_snapshot: text(campaign?.name), adset_id: adset?.id || null, adset_name_snapshot: text(adset?.name),
    platform: null, attribution_status: campaign && adset && text(ad?.name) && text(campaign.name) && text(adset.name) && mapping.form_name ? 'complete' : 'partial',
    raw_payload: { ...lead, field_data: lead.field_data.filter(f => safeKey(f.name)) }
  };
  return { core_fields: core, form_answers: answers, attribution, occurred_at: new Date(lead.created_time).toISOString(),
    source_label: `Meta${core.program_interest_text || mapping.form_name ? ` • ${core.program_interest_text || mapping.form_name}` : ''}` };
}
