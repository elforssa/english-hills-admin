import { prepareLifecyclePayload, postLifecycleFixture } from './adapter.mjs';
// Only the synthetic test harness supplies mockFetch. No live transport exists.
export async function processLifecycleFixtures({ rpc, env = {}, mockFetch, limit = 3 }) {
  if (typeof mockFetch !== 'function') throw new Error('live_not_available');
  const claims = await rpc('crm_claim_external_deliveries', { p_limit: limit });
  const results = [];
  for (const claim of claims) {
    const args = { p_delivery: claim.id, p_lease: claim.lease_token };
    let started = false;
    try {
      const delivery = await rpc('crm_get_external_delivery', args);
      const ref = delivery.mapping.secret_ref;
      if (!/^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$/.test(ref || '') || !env[ref]) throw new Error('missing_secret');
      const payload = prepareLifecyclePayload(delivery);
      await rpc('crm_prepare_external_delivery', { ...args, p_payload: payload });
      await rpc('crm_begin_external_attempt', args); started = true;
      const outcome = await postLifecycleFixture({ mapping: delivery.mapping, payload, token: env[ref], mockFetch });
      await rpc('crm_finish_external_attempt', { ...args, p_result: outcome });
      results.push({ id: claim.id, status: outcome.outcome });
    } catch (error) {
      // Once an attempt starts, uncertain finalization is left for lease recovery.
      // Never overwrite it with a fabricated success or create a second identity.
      let status = 'unknown';
      if (!started) {
        const code = ['missing_secret', 'configuration_missing', 'invalid_identity', 'live_not_available'].includes(error.message) ? error.message : 'delivery_held';
        try { await rpc('crm_block_external_delivery', { ...args, p_code: code }); status = 'blocked'; } catch {}
      }
      results.push({ id: claim.id, status });
    }
  }
  return results;
}
