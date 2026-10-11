import { secretEquals } from '../meta/protocol.mjs';
import { processInsights } from './worker.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// One tick: enqueue due rolling refreshes, then claim runs only while a bounded fetch
// still fits. The response carries counts only: never run IDs, account IDs, provider
// data or error text.
export async function runScheduledInsights(request, { env, rpc, fetchImpl, liveGate = false, now = () => Date.now() }) {
  const token = env.CRM_META_INSIGHTS_SCHEDULER_TOKEN;
  if (!token || !secretEquals(request.headers.get('authorization'), `Bearer ${token}`)) return json({ error: 'Unauthorized' }, 401);
  const deadline = now() + 55000;
  const counts = { enqueued: 0, processed: 0, completed: 0, failed: 0, deferred: 0, enriched: { eligible: 0, resolved: 0, unresolved: 0 } };
  // Server live gate (S1 invariant 7): when closed, nothing is enqueued, claimed or fetched.
  if (!liveGate || env.CRM_META_INSIGHTS_LIVE_ENABLED !== 'true' || typeof fetchImpl !== 'function') return json({ ok: true, ...counts });
  try {
    const enqueued = await rpc('crm_enqueue_insights_refresh', {});
    counts.enqueued = Number.isSafeInteger(enqueued) ? enqueued : 0;
    // A claim needs at least 45 s left, so a tick never spends a run's attempt on a
    // deadline it created; each fetch keeps a 5 s margin for the publish call.
    for (let index = 0; index < 5 && deadline - now() >= 45000; index += 1) {
      const outcome = await processInsights({ rpc, env, fetchImpl, liveGate, deadline: deadline - 5000 });
      if (!outcome) break;
      counts.processed += 1;
      if (outcome.status === 'completed') counts.completed += 1;
      else if (outcome.status === 'failed' || outcome.status === 'partial') counts.failed += 1;
      else counts.deferred += 1;
    }
    // DGI-B D4: one bounded in-database attribution sweep per tick, after the claims loop,
    // only with at least 5 s of budget left. Counts only; a sweep error never fails the tick.
    if (deadline - now() >= 5000) {
      try {
        const enriched = await rpc('crm_enrich_meta_attribution', { p_limit: 200 });
        for (const key of Object.keys(counts.enriched)) counts.enriched[key] = Number.isSafeInteger(enriched?.[key]) ? enriched[key] : 0;
      } catch { /* The next tick sweeps again; nothing else depends on it. */ }
    }
    return json({ ok: true, ...counts });
  } catch {
    return json({ error: 'Worker unavailable' }, 503);
  }
}
