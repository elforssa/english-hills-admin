import { MetaError } from './protocol.mjs';
import { retrieveLead, normalizeLead } from './adapter.mjs';
export async function processMetaJobs({ rpc, env, fetchImpl, limit = 5 }) {
  const jobs = await rpc('crm_claim_meta_jobs', { p_limit: limit });
  const outcomes = [];
  for (const job of jobs) {
    try {
      const ref = job.connection.access_token_secret_ref;
      if (!/^CRM_META_PAGE_TOKEN_[A-Z0-9_]{1,64}$/.test(ref || '') || !env[ref]) throw new MetaError('missing_secret');
      const retrieved = await retrieveLead(job, env[ref], fetchImpl);
      const mapping = await rpc('crm_get_meta_job_mapping', { p_job: job.id, p_lease: job.lease_token,
        p_form: retrieved.lead.form_id, p_occurred: retrieved.lead.created_time });
      const normalized = normalizeLead(job, retrieved, mapping);
      const result = await rpc('crm_finalize_meta_job', { p_job: job.id, p_lease: job.lease_token, p_mapping: mapping.id, p_data: normalized });
      outcomes.push({ id: job.id, status: result.status });
    } catch (error) {
      const code = error instanceof MetaError ? error.code : 'storage_unavailable';
      try { await rpc('crm_fail_meta_job', { p_job: job.id, p_lease: job.lease_token, p_code: code }); }
      catch { /* Expired/stolen lease cannot be changed; durable claim will recover. */ }
      outcomes.push({ id: job.id, error_code: code });
    }
  }
  return outcomes;
}
