import 'server-only';
import { metaRpcError } from './protocol.mjs';
import { getServiceRoleClient } from '@/lib/supabase-admin';
export async function metaRpc(name, args) {
  const { data, error } = await getServiceRoleClient().rpc(name, args);
  if (error) throw metaRpcError(name, error);
  return data;
}
