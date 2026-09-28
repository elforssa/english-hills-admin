import 'server-only';
import { runScheduledIntake } from '@/lib/crm/intake/scheduler.mjs';
import { metaRpc } from '@/lib/crm/meta/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function GET(request) {
  // Supabase pg_cron (primary) and GitHub Actions (backup) supply the same
  // dedicated scheduler bearer. It stays separate from the worker credential.
  return runScheduledIntake(request, {
    env: process.env,
    rpc: metaRpc,
    fetchImpl: fetch,
  });
}
