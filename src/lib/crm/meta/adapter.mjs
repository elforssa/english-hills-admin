import { MetaError, boundedBody, providerId } from './protocol.mjs';
import { normalizeForm, safeKey } from '../intake/form.mjs';
const text = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
export async function graphGet({ apiVersion, token, id, edge, fields, after, limit, fetchImpl = fetch }) {
  if (!/^v[0-9]{1,3}\.0$/.test(apiVersion) || !providerId(id) || (edge !== undefined && edge !== 'leads')) throw new MetaError('invalid_provider_data');
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${id}${edge === 'leads' ? '/leads' : ''}`);
  url.searchParams.set('fields', fields);
  if (after !== undefined) {
    if (typeof after !== 'string' || after.length > 512 || !/^[A-Za-z0-9_+/=-]+$/.test(after)) throw new MetaError('invalid_provider_data');
    url.searchParams.set('after', after);
  }
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new MetaError('invalid_provider_data');
    url.searchParams.set('limit', String(limit));
  }
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
  let ad = null, ad_lookup_error = null;
  if (core.ad_id) {
    // Optional metadata must never block operational intake. Only the fixed MetaError
    // code of a failed lookup is kept (DGI-B D1); never a provider message or body.
    try { ad = await graphGet({ ...base, id: core.ad_id, fields: 'id,name,campaign{id,name},adset{id,name}' }); }
    catch (error) { ad_lookup_error = error instanceof MetaError ? error.code : 'network'; }
    if (ad?.id !== core.ad_id) { if (ad !== null) ad_lookup_error = ad_lookup_error || 'invalid_provider_data'; ad = null; }
  }
  return { lead: core, ad, ad_lookup_error };
}
export function normalizeLead(job, retrieved, mapping) {
  if (!mapping) throw new MetaError('missing_mapping');
  const { lead, ad, ad_lookup_error = null } = retrieved;
  const { core_fields: core, form_answers: answers } = normalizeForm(lead.field_data, mapping);
  const campaign = providerId(ad?.campaign?.id) ? ad.campaign : null;
  const adset = providerId(ad?.adset?.id) ? ad.adset : null;
  const attribution = {
    external_submission_id: lead.id, page_id: job.payload.page_id, form_id: lead.form_id,
    form_name_snapshot: mapping.form_name || null,
    ad_id: lead.ad_id || null, ad_name_snapshot: text(ad?.name), campaign_id: campaign?.id || null,
    campaign_name_snapshot: text(campaign?.name), adset_id: adset?.id || null, adset_name_snapshot: text(adset?.name),
    platform: null, attribution_status: campaign && adset && text(ad?.name) && text(campaign.name) && text(adset.name) && mapping.form_name ? 'complete' : 'partial',
    // DGI-B D1: informational only; the report's trusted predicate never reads them.
    hierarchy_source: campaign && adset ? 'provider' : null,
    hierarchy_error_code: typeof ad_lookup_error === 'string' && /^[a-z_]{1,40}$/.test(ad_lookup_error) ? ad_lookup_error : null,
    raw_payload: { ...lead, field_data: lead.field_data.filter(f => safeKey(f.name)) }
  };
  return { core_fields: core, form_answers: answers, attribution, occurred_at: new Date(lead.created_time).toISOString(),
    source_label: `Meta${core.program_interest_text || mapping.form_name ? ` • ${core.program_interest_text || mapping.form_name}` : ''}` };
}
