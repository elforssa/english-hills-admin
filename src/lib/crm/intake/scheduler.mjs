import { secretEquals } from '../meta/protocol.mjs';
import { processExternalJobs } from './worker.mjs';

const response = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function runScheduledIntake(request, {
  env,
  rpc,
  fetchImpl,
  processJobs = processExternalJobs,
  limit = 3,
}) {
  const token = env.CRM_INTAKE_SCHEDULER_TOKEN;
  if (!token || !secretEquals(request.headers.get('authorization'), `Bearer ${token}`)) {
    return response({ error: 'Unauthorized' }, 401);
  }

  try {
    const outcomes = await processJobs({ rpc, env, fetchImpl, limit });
    return response({
      ok: true,
      processed: outcomes.length,
      succeeded: outcomes.filter(outcome => 'status' in outcome).length,
      failed: outcomes.filter(outcome => 'error_code' in outcome).length,
    });
  } catch {
    return response({ error: 'Worker unavailable' }, 503);
  }
}
