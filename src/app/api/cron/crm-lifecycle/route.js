import 'server-only';
import { runScheduledLifecycle } from '@/lib/crm/lifecycle/scheduler.mjs';
import { lifecycleLiveEnabled, lifecycleRpc } from '@/lib/crm/lifecycle/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function GET(request) {
  return runScheduledLifecycle(request, {
    env: process.env,
    rpc: lifecycleRpc,
    fetchImpl: fetch,
    liveGate: lifecycleLiveEnabled(process.env),
  });
}
