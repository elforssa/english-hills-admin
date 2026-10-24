import { secretEquals } from '../meta/protocol.mjs';
import { processExternalJobs } from './worker.mjs';
import { reconcileMetaLeads } from '../meta/reconcile.mjs';

const response = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

// Poll codes that end a pass without an intake problem (another worker owns the
// lease, or the director switched polling or the form off).
export const BENIGN_POLL = new Set(['reconciliation_lease_lost', 'reconciliation_disabled', 'reconciliation_form_inactive']);
// Job codes that block or kill a job; retry codes are not alerts.
export const ALERT_JOB = new Set(['missing_secret', 'provider_auth', 'missing_mapping', 'missing_policy',
  'connection_disabled', 'invalid_provider_data', 'invalid_mapping', 'attempts_exhausted']);

// A finalizer blocks missing_policy/connection_disabled itself and returns a
// success-shaped {status:'blocked'} outcome, so the status is checked as well.
export function intakeAlert(discovery, outcomes) {
  return (discovery.failed > 0 && !BENIGN_POLL.has(discovery.code)) ||
    outcomes.some(outcome => outcome.status === 'blocked' || ALERT_JOB.has(outcome.error_code));
}

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
    catch { discovery = { forms: 0, discovered: 0, enqueued: 0, failed: 1, code: 'storage_unavailable' }; }
    const outcomes = await processJobs({ rpc, env, fetchImpl, limit: discovery.forms ? Math.min(limit, 2) : limit });
    const alert = intakeAlert(discovery, outcomes);
    // Counts only: the error code never leaves the server (public workflow logs).
    const { forms, discovered, enqueued, failed } = discovery;
    const body = {
      processed: outcomes.length,
      succeeded: outcomes.filter(outcome => 'status' in outcome).length,
      failed: outcomes.filter(outcome => 'error_code' in outcome).length,
      reconciliation: { forms, discovered, enqueued, failed },
    };
    // 424 because curl --retry does not retry it: one alert, no extra passes.
    return alert ? response({ ok: false, alert: true, ...body }, 424) : response({ ok: true, ...body });
  } catch {
    return response({ error: 'Worker unavailable' }, 503);
  }
}
