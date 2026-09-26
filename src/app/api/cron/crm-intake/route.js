import 'server-only';
import { runScheduledIntake } from '@/lib/crm/intake/scheduler.mjs';
import { metaRpc } from '@/lib/crm/meta/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function GET(request) {
  // GitHub Actions supplies a dedicated scheduler bearer. It is intentionally
  // separate from the existing worker endpoint credential.
  return runScheduledIntake(request, {
    env: process.env,
    rpc: metaRpc,
    fetchImpl: fetch,
  });
}
