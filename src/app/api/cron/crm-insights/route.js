import 'server-only';
import { runScheduledInsights } from '@/lib/crm/insights/scheduler.mjs';
import { insightsLiveEnabled, insightsRpc } from '@/lib/crm/insights/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function GET(request) {
  // Supabase pg_cron (crm-insights-primary) supplies the dedicated scheduler bearer.
  // Live work additionally requires CRM_META_INSIGHTS_LIVE_ENABLED=true.
  return runScheduledInsights(request, {
    env: process.env,
    rpc: insightsRpc,
    fetchImpl: fetch,
    liveGate: insightsLiveEnabled(process.env),
  });
}
