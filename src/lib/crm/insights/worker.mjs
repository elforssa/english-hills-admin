import { fetchInsightsFixture } from './adapter.mjs';
// Server/test only. No schedule or live transport is wired into the application.
export async function processInsightsFixture({ rpc, env = {}, mockFetch }) {
  if (typeof window !== 'undefined' || typeof mockFetch !== 'function') throw new Error('live_not_available');
  const run = await rpc('crm_claim_insights_sync', {});
  if (!run) return null;
  const args = { p_run: run.id, p_lease: run.lease_token };
  let publishing = false;
  try {
    const ref = run.config.secret_ref;
    if (!/^CRM_META_INSIGHTS_TOKEN_[A-Z0-9_]{1,64}$/.test(ref || '') || !env[ref]) throw new Error('missing_secret');
    const payload = await fetchInsightsFixture({ config: run.config, from: run.date_from, to: run.date_to, token: env[ref], mockFetch });
    publishing = true;
    await rpc('crm_finish_insights_sync', { ...args, p_data: payload });
    return { id: run.id, status: 'completed' };
  } catch (error) {
    // Uncertain commit outcome must be recovered by the lease, not overwritten.
    if (publishing) return { id: run.id, status: 'unknown' };
    const codes = ['rate_limit', 'provider_auth', 'provider_unavailable', 'invalid_data', 'limit_exceeded', 'timeout', 'async_pending', 'missing_secret', 'network'];
    try {
      await rpc('crm_fail_insights_sync', { ...args, p_code: codes.includes(error.message) ? error.message : 'invalid_data', p_rows: error.rowsProcessed || 0 });
      return { id: run.id, status: error.rowsProcessed ? 'partial' : 'failed' };
    } catch { return { id: run.id, status: 'unknown' }; }
  }
}
