import 'server-only';
import { getServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
// Queue only. Processing is available solely to the injected fixture harness.
export async function POST(request) {
  const client = await getServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'director' || request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const decoder = new TextDecoder(); let raw = '', bytes = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024) { await reader.cancel(); throw new Error(); }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    body = JSON.parse(raw);
    if (!body || Object.keys(body).some(k => !['connection', 'request', 'from', 'to'].includes(k))) throw new Error();
    if (![body.connection, body.request].every(v => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v))) throw new Error();
    if ([body.from, body.to].some(v => v != null && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)))) throw new Error();
  } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  const { data, error } = await client.rpc('crm_request_insights_sync', { p_connection: body.connection, p_request: body.request, p_from: body.from ?? null, p_to: body.to ?? null });
  if (error) return Response.json({ error: 'Synchronization unavailable' }, { status: 409 });
  return Response.json({ run_id: data, live_sync_enabled: false }, { status: 202 });
}
