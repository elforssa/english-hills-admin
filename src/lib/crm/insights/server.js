import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase-admin';

export const insightsLiveEnabled = env => env.CRM_META_INSIGHTS_LIVE_ENABLED === 'true';

export async function insightsRpc(name, args = {}) {
  const { data, error } = await getServiceRoleClient().rpc(name, args);
  if (error) throw new Error('storage_unavailable');
  return data;
}
