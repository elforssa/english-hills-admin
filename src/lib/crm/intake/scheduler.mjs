import { secretEquals } from '../meta/protocol.mjs';
import { processExternalJobs } from './worker.mjs';
import { reconcileMetaLeads } from '../meta/reconcile.mjs';

const response = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function runScheduledIntake(request, {
  env,
  rpc,
  fetchImpl,
  processJobs = processExternalJobs,
  reconcile = reconcileMetaLeads,
  limit = 3,
}) {
  const token = env.CRM_INTAKE_SCHEDULER_TOKEN;
  if (!token || !secretEquals(request.headers.get('authorization'), `Bearer ${token}`)) {
    return response({ error: 'Unauthorized' }, 401);
  }

  try {
    let discovery;
    try { discovery = await reconcile({ rpc, env, fetchImpl }); }
    catch { discovery = { forms: 0, discovered: 0, enqueued: 0, failed: 1 }; }
    const outcomes = await processJobs({ rpc, env, fetchImpl, limit: discovery.forms ? Math.min(limit, 2) : limit });
    return response({
      ok: true,
      processed: outcomes.length,
      succeeded: outcomes.filter(outcome => 'status' in outcome).length,
      failed: outcomes.filter(outcome => 'error_code' in outcome).length,
      reconciliation: discovery,
    });
  } catch {
    return response({ error: 'Worker unavailable' }, 503);
  }
}
