import 'server-only';
import { getServerClient } from '@/lib/supabase';
// Phase 10 deliberately exposes reconciliation only. No token/fetch/send path.
export const runtime = 'nodejs';
export async function POST(request) {
  const client = await getServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'director' || request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await client.rpc('crm_reconcile_external_deliveries', { p_limit: 100 });
  if (error) return Response.json({ error: 'Reconciliation unavailable' }, { status: 503 });
  return Response.json({ reconciled: data, live_delivery_enabled: false });
}
