import { MetaError } from '../meta/protocol.mjs';
import { retrieveLead, normalizeLead } from '../meta/adapter.mjs';
import { normalizeWebsite } from '../website/normalize.mjs';
// One claim/retry/lease architecture. Website processing performs no provider call.
export async function processExternalJobs({ rpc, env, fetchImpl, limit = 5, provider = null }) {
  const jobs = await rpc(provider === 'meta' ? 'crm_claim_meta_jobs' : 'crm_claim_ingestion_jobs', provider === 'meta' ? { p_limit: limit } : { p_limit: limit, p_provider: provider });
  const outcomes = [];
  for (const job of jobs) {
    try {
      let result;
      if (job.connection.provider === 'website') {
        const mapping = await rpc('crm_get_website_job_mapping', { p_job: job.id, p_lease: job.lease_token });
        result = await rpc('crm_finalize_website_job', { p_job: job.id, p_lease: job.lease_token, p_mapping: mapping?.id,
          p_data: normalizeWebsite(job, mapping) });
      } else {
        const ref = job.connection.access_token_secret_ref;
        if (!/^CRM_META_PAGE_TOKEN_[A-Z0-9_]{1,64}$/.test(ref || '') || !env[ref]) throw new MetaError('missing_secret');
        const retrieved = await retrieveLead(job, env[ref], fetchImpl);
        const mapping = await rpc('crm_get_meta_job_mapping', { p_job: job.id, p_lease: job.lease_token,
          p_form: retrieved.lead.form_id, p_occurred: retrieved.lead.created_time });
        const normalized = normalizeLead(job, retrieved, mapping);
        result = await rpc('crm_finalize_meta_job', { p_job: job.id, p_lease: job.lease_token, p_mapping: mapping.id, p_data: normalized });
      }
      outcomes.push({ id: job.id, status: result.status });
    } catch (error) {
      const code = error instanceof MetaError ? error.code : 'storage_unavailable';
      try { await rpc('crm_fail_meta_job', { p_job: job.id, p_lease: job.lease_token, p_code: code }); }
      catch { /* A stale worker cannot change a reclaimed job. */ }
      outcomes.push({ id: job.id, error_code: code });
    }
  }
  return outcomes;
}
