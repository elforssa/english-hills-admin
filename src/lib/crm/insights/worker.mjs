import { fetchInsights } from './adapter.mjs';
// Server/test only. The scheduler route passes the platform fetch and the server
// live gate; the synthetic harness passes mockFetch for mock runs.
const codes = ['rate_limit', 'provider_auth', 'provider_unavailable', 'invalid_data', 'limit_exceeded', 'timeout', 'async_pending', 'missing_secret', 'network', 'live_not_available'];
const transient = ['rate_limit', 'provider_unavailable', 'network', 'timeout'];

export async function processInsights({ rpc, env = {}, fetchImpl, mockFetch, liveGate = false, deadline }) {
  if (typeof window !== 'undefined') throw new Error('live_not_available');
  const run = await rpc('crm_claim_insights_sync', {});
  if (!run) return null;
  const args = { p_run: run.id, p_lease: run.lease_token };
  const live = run.config?.mode === 'live';
  let publishing = false;
  try {
    // The live gate is checked before the secret is resolved or any request is made.
    if (live && (!liveGate || env.CRM_META_INSIGHTS_LIVE_ENABLED !== 'true' || typeof fetchImpl !== 'function')) throw new Error('live_not_available');
    if (!live && typeof mockFetch !== 'function') throw new Error('live_not_available');
    const ref = run.config.secret_ref;
    if (!/^CRM_META_INSIGHTS_TOKEN_[A-Z0-9_]{1,64}$/.test(ref || '') || !env[ref]) throw new Error('missing_secret');
    const payload = await fetchInsights({
      config: run.config, from: run.date_from, to: run.date_to, token: env[ref], deadline,
      ...(live ? { fetchImpl } : { mockFetch }),
    });
    publishing = true;
    await rpc('crm_finish_insights_sync', { ...args, p_data: payload });
    return { id: run.id, status: 'completed' };
  } catch (error) {
    // Uncertain commit outcome must be recovered by the lease, not overwritten.
    if (publishing) return { id: run.id, status: 'unknown' };
    const code = codes.includes(error.message) ? error.message : 'invalid_data';
    try {
      await rpc('crm_fail_insights_sync', { ...args, p_code: code, p_rows: error.rowsProcessed || 0 });
      // A transient live failure is requeued with backoff by the database (D5).
      if (live && transient.includes(code) && run.attempt_count < 3) return { id: run.id, status: 'deferred' };
      return { id: run.id, status: error.rowsProcessed ? 'partial' : 'failed' };
    } catch { return { id: run.id, status: 'unknown' }; }
  }
}

// Mock-only entry point kept for the synthetic harness.
export async function processInsightsFixture({ rpc, env = {}, mockFetch }) {
  if (typeof window !== 'undefined' || typeof mockFetch !== 'function') throw new Error('live_not_available');
  return processInsights({ rpc, env, mockFetch });
}
