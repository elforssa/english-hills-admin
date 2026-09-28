import { graphGet } from './adapter.mjs';
import { MetaError, providerId } from './protocol.mjs';

const FIELDS = 'id,created_time,form_id,ad_id,field_data';
const PAGE_SIZE = 25;
const MAX_PAGES = 2;

export async function reconcileMetaLeads({ rpc, env, fetchImpl }) {
  // The database leases one due active form. A disabled configuration returns null,
  // so the scheduler makes no Graph request or token lookup.
  const form = await rpc('crm_claim_meta_reconciliation');
  if (!form) return { forms: 0, discovered: 0, enqueued: 0, failed: 0 };
  let discovered = 0, enqueued = 0, errorCode = null;
  try {
    const ref = form.access_token_secret_ref;
    if (!/^CRM_META_PAGE_TOKEN_[A-Z0-9_]{1,64}$/.test(ref || '') || !env[ref]) throw new MetaError('missing_secret');
    if (!providerId(form.form_key) || !providerId(form.page_id) ||
      !Number.isInteger(form.lookback_minutes) || form.lookback_minutes < 10 || form.lookback_minutes > 1440 ||
      !Number.isFinite(Date.parse(form.started_at))) throw new MetaError('invalid_provider_data');
    const lower = Math.max(Date.parse(form.started_at), Date.now() - form.lookback_minutes * 60000);
    let after, priorTime = Infinity;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = await graphGet({ apiVersion: form.api_version, token: env[ref], id: form.form_key, edge: 'leads',
        fields: FIELDS, after, limit: PAGE_SIZE, fetchImpl });
      if (!Array.isArray(body.data) || body.data.length > PAGE_SIZE) throw new MetaError('invalid_provider_data');
      const events = [];
      let reachedLower = false;
      for (const lead of body.data) {
        const time = Date.parse(lead?.created_time);
        if (!providerId(lead?.id) || lead.form_id !== form.form_key || !Number.isFinite(time) ||
          time > Date.now() + 300000 || time > priorTime) throw new MetaError('invalid_provider_data');
        priorTime = time;
        if (time < lower) { reachedLower = true; break; }
        events.push({ page_id: form.page_id, leadgen_id: lead.id, form_id: form.form_key,
          created_time: Math.floor(time / 1000) });
      }
      if (events.length) {
        const result = await rpc('crm_enqueue_meta_reconciled', {
          p_connection: form.connection_id, p_form: form.form_key, p_lease: form.lease_token, p_events: events,
        });
        discovered += events.length;
        enqueued += result.enqueued;
      }
      if (reachedLower || body.data.length < PAGE_SIZE) break;
      const cursor = body.paging?.cursors?.after;
      if (!cursor) break;
      if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_+/=-]+$/.test(cursor) || cursor === after) {
        throw new MetaError('invalid_provider_data');
      }
      after = cursor;
    }
  } catch (error) {
    errorCode = error instanceof MetaError ? error.code : 'storage_unavailable';
  }
  try {
    await rpc('crm_finish_meta_reconciliation', { p_connection: form.connection_id, p_form: form.form_key,
      p_lease: form.lease_token, p_error: errorCode });
  } catch { errorCode = 'storage_unavailable'; }
  return { forms: 1, discovered, enqueued, failed: errorCode ? 1 : 0 };
}
