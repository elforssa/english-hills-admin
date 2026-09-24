import 'server-only';
import { MetaError } from './protocol.mjs';
import { getServiceRoleClient } from '@/lib/supabase-admin';
export async function metaRpc(name, args) {
  const { data, error } = await getServiceRoleClient().rpc(name, args);
  if (error) throw new MetaError(['22023', '23514', '22007', '22008', '23502'].includes(error.code) ? 'invalid_provider_data' : 'storage_unavailable');
  return data;
}
