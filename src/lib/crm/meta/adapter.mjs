import { MetaError, boundedBody, providerId } from './protocol.mjs';
import { normalizeForm, safeKey } from '../intake/form.mjs';
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
  const { core_fields: core, form_answers: answers } = normalizeForm(lead.field_data, mapping);
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
