import 'server-only';
import { getServerClient } from '@/lib/supabase';
import { lifecycleLiveEnabled } from '@/lib/crm/lifecycle/server';
// Phase 10 deliberately exposes reconciliation only. No token/fetch/send path.
export const runtime = 'nodejs';
async function authorize() {
  const client = await getServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'director') return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  return { client };
}
export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  return Response.json({ live_server_gate: lifecycleLiveEnabled(process.env) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  const { client } = auth;
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await client.rpc('crm_reconcile_external_deliveries', { p_limit: 100 });
  if (error) return Response.json({ error: 'Reconciliation unavailable' }, { status: 503 });
  return Response.json({ reconciled: data, live_delivery_enabled: false });
}
