// Node/server protocol primitives; production entry points import server-only.
import { createHmac, timingSafeEqual } from 'node:crypto';
export class MetaError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function secretEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function boundedBody(request, limit = 131072) {
  if (Number(request.headers.get('content-length')) > limit) throw new MetaError('oversized');
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let size = 0; const parts = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new MetaError('oversized'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
export function verifySignature(raw, signature, secret) {
  return !!secret && /^sha256=[a-f0-9]{64}$/.test(signature || '') &&
    secretEquals(signature, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
}
export const providerId = value => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
export function parseEvents(raw) {
  let data;
  try { data = JSON.parse(raw.toString('utf8')); } catch { throw new MetaError('malformed'); }
  if (data?.object !== 'page' || !Array.isArray(data.entry) || data.entry.length > 100) throw new MetaError('unsupported');
  const events = [];
  for (const entry of data.entry) {
    if (!providerId(entry.id) || !Array.isArray(entry.changes) || entry.changes.length > 100) throw new MetaError('malformed');
    for (const change of entry.changes) {
      if (change.field !== 'leadgen') continue;
      const v = change.value;
      if (!v || !providerId(v.leadgen_id) || !providerId(v.form_id) || !providerId(v.page_id) || v.page_id !== entry.id ||
        !Number.isSafeInteger(v.created_time) || v.created_time <= 0 || v.created_time * 1000 > Date.now() + 300000) throw new MetaError('malformed');
      events.push({ page_id: entry.id, leadgen_id: v.leadgen_id, form_id: v.form_id, created_time: v.created_time });
      if (events.length > 100) throw new MetaError('oversized');
    }
  }
  return events;
}
export async function webhookGet(request, verifyToken) {
  const query = new URL(request.url).searchParams;
  if (!verifyToken) return new Response('Unavailable', { status: 503 });
  if (query.get('hub.mode') !== 'subscribe' || !secretEquals(query.get('hub.verify_token'), verifyToken)) return new Response('Forbidden', { status: 403 });
  const challenge = query.get('hub.challenge');
  if (!challenge || challenge.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(challenge)) return new Response('Invalid challenge', { status: 400 });
  return new Response(challenge, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
export async function webhookPost(request, { appSecret, persist }) {
  if (!appSecret) return new Response('Unavailable', { status: 503 });
  try {
    const raw = await boundedBody(request);
    if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), appSecret)) return new Response('Forbidden', { status: 403 });
    const events = parseEvents(raw);
    await persist(events); // A database error is never acknowledged as success.
    return new Response('EVENT_RECEIVED', { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error.code === 'oversized' ? 413 : ['malformed', 'unsupported'].includes(error.code) ? 400 : 503;
    return new Response(status === 503 ? 'Unavailable' : 'Invalid request', { status });
  }
}
