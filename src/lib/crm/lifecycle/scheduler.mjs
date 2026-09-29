import { secretEquals } from '../meta/protocol.mjs';
import { processLifecycleEvidence } from './evidence.mjs';
import { processLifecycleDeliveries } from './worker.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function runScheduledLifecycle(request, { env, rpc, fetchImpl, liveGate, now = () => Date.now() }) {
  const token = env.CRM_META_LIFECYCLE_SCHEDULER_TOKEN;
  if (!token || !secretEquals(request.headers.get('authorization'), `Bearer ${token}`)) return json({ error: 'Unauthorized' }, 401);
  const deadline = now() + 50000;
  const counts = { evidence: { evaluated: 0, granted: 0, denied: 0 }, reconciled: 0, processed: 0, cleanup: {} };
  try {
    await rpc('crm_record_lifecycle_scheduler_run', { p_status: 'started', p_counts: {}, p_error_code: null });
    counts.evidence = await processLifecycleEvidence({ rpc, limit: 25 });
    counts.reconciled = await rpc('crm_reconcile_external_deliveries', { p_limit: 100 });
    counts.cleanup = await rpc('crm_cleanup_lifecycle_retention', { p_limit: 100 });
    if (now() > deadline - 10000) throw new Error('deadline_exceeded');
    const outcomes = await processLifecycleDeliveries({
      rpc, env, fetchImpl, liveGate, limit: 3,
      canStart: () => now() <= deadline - 10000,
    });
    counts.processed = outcomes.length;
    counts.sent = outcomes.filter(outcome => outcome.status === 'sent').length;
    counts.failed = outcomes.filter(outcome => outcome.status !== 'sent').length;
    await rpc('crm_record_lifecycle_scheduler_run', { p_status: 'success', p_counts: counts, p_error_code: null });
    return json({ ok: true, ...counts });
  } catch (error) {
    const code = error?.message === 'deadline_exceeded' ? 'deadline_exceeded' : error?.code === 'storage_unavailable' ? 'storage_unavailable' : 'worker_unavailable';
    try { await rpc('crm_record_lifecycle_scheduler_run', { p_status: 'failed', p_counts: counts, p_error_code: code }); } catch {}
    return json({ error: 'Worker unavailable' }, 503);
  }
}
