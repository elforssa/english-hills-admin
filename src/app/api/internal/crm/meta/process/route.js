import 'server-only';
import { secretEquals } from '@/lib/crm/meta/protocol.mjs';
import { processExternalJobs } from '@/lib/crm/intake/worker.mjs';
import { metaRpc } from '@/lib/crm/meta/server';
import { getServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request) {
  const token = process.env.CRM_META_WORKER_TOKEN;
  if (!token || !secretEquals(request.headers.get('authorization'), `Bearer ${token}`)) {
    const client = await getServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await client.from('profiles').select('role').eq('id', user.id).single();
    if (error || data?.role !== 'director') return Response.json({ error: 'Forbidden' }, { status: 403 });
    // Same-origin director command; machine bearer is the scheduler pathway.
    if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  try { return Response.json({ jobs: await processExternalJobs({ rpc: metaRpc, env: process.env, limit: 3 }) }); }
  catch { return Response.json({ error: 'Worker unavailable' }, { status: 503 }); }
}
