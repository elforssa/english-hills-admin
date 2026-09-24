import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { safeKey } from '../intake/form.mjs';
import { boundedBody } from '../meta/protocol.mjs';
import { attributionKeys, sanitizeAttribution } from './attribution.mjs';
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean()]);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export function normalizePhone(raw) {
  if (!raw || /[^0-9+(). /-]/.test(raw)) return null;
  let n = raw.replace(/[(). /-]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (/^0[5-7][0-9]{8}$/.test(n)) n = '+212' + n.slice(1);
  else if (/^[5-7][0-9]{8}$/.test(n)) n = '+212' + n;
  if (!/^\+[1-9][0-9]{7,14}$/.test(n) || n.startsWith('+212') && !/^\+212[5-7][0-9]{8}$/.test(n)) return null;
  return n;
}
const schema = z.object({
  site_key: key, form_key: key, request_key: z.string().uuid(),
  contact: z.object({ name: z.string().trim().min(1).max(200).optional(), phone: z.string().max(30).optional(),
    email: z.string().trim().email().max(254).optional(), whatsapp: z.string().max(30).optional() }).strict()
    .refine(c => !!normalizePhone(c.phone) || !!c.email),
  answers: z.record(z.string().min(1).max(100), z.union([scalar, z.array(scalar).max(30)])).refine(a => Object.keys(a).length <= 60),
  attribution: z.object(Object.fromEntries(attributionKeys.map(k => [k, z.string().max(['landing_page', 'referrer'].includes(k) ? 2048 : k === 'fbclid' ? 512 : 256).optional()]))).strict().optional(),
  consent: z.literal(true), turnstileToken: z.string().min(1).max(2048).optional(), honeypot: z.string().max(200).optional()
}).strict();
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function challengeKey(secret, value) {
  const h = createHmac('sha256', secret).update(canonical(value)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const success = { success: true, message: 'Merci. Votre demande a bien été reçue.' };
export async function inquiryPost(request, { rpc, env, fetchImpl = fetch }) {
  let origin;
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Origin', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), ...(status === 429 ? { 'Retry-After': '3600' } : {}) } });
  try {
    if (request.method !== 'POST') return reply({ error: 'Méthode non autorisée.' }, 405);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return reply({ error: 'Format non accepté.' }, 415);
    const suppliedOrigin = request.headers.get('origin');
    try {
      if (!suppliedOrigin || suppliedOrigin === 'null' || new URL(suppliedOrigin).origin !== suppliedOrigin) return reply({ error: 'Origine non autorisée.' }, 403);
    } catch { return reply({ error: 'Origine non autorisée.' }, 403); }
    let data;
    try { data = JSON.parse((await boundedBody(request, 32768)).toString('utf8')); }
    catch (error) { return reply({ error: 'Demande invalide.' }, error.code === 'oversized' ? 413 : 400); }
    const parsed = schema.safeParse(data);
    if (!parsed.success) return reply({ error: 'Vérifiez le formulaire et indiquez un téléphone ou un email valide.' }, 400);
    data = parsed.data;
    if (!await rpc('crm_get_website_site', { p_key: data.site_key, p_origin: suppliedOrigin })) return reply({ error: 'Formulaire indisponible.' }, 403);
    origin = suppliedOrigin;
    if (!env.CRM_WEBSITE_RATE_LIMIT_SECRET) return reply({ error: 'Service indisponible. Réessayez plus tard.' }, 503);
    // IP exists only in memory. Persist only a keyed pseudonym in the existing
    // short-lived limiter. Production must use a proxy that overwrites this header.
    const ip = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(0, 128);
    const rateKey = createHmac('sha256', env.CRM_WEBSITE_RATE_LIMIT_SECRET).update(ip).digest('hex');
    if (!await rpc('crm_check_website_rate_limit', { p_key: rateKey })) return reply({ error: 'Trop de demandes. Réessayez dans une heure.' }, 429);
    if (data.honeypot) return reply({ error: 'Demande invalide.' }, 400);
    const payload = { form_key: data.form_key, contact: data.contact, answers: Object.fromEntries(Object.entries(data.answers).filter(([key]) => safeKey(key))), attribution: sanitizeAttribution(data.attribution), consent: true };
    if (payload.attribution.landing_page && new URL(payload.attribution.landing_page).origin !== origin) return reply({ error: 'Page de provenance invalide.' }, 400);
    const args = { p_site: data.site_key, p_form: data.form_key, p_request: data.request_key, p_payload: payload };
    const prior = await rpc('crm_website_inquiry_status', args);
    if (prior === 'conflict') return reply({ error: 'Cette demande a été modifiée. Envoyez-la comme une nouvelle demande.' }, 409);
    if (prior === 'received') return reply(success); // A lost acknowledgment never consumes a second challenge token.
    if (env.TURNSTILE_SECRET_KEY) {
      if (!data.turnstileToken) return reply({ error: 'Veuillez effectuer la vérification anti-robot.' }, 403);
      let verified = false;
      try {
        const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: data.turnstileToken, idempotency_key: challengeKey(env.CRM_WEBSITE_RATE_LIMIT_SECRET, { ...args, token: data.turnstileToken }) }) });
        const result = JSON.parse((await boundedBody(res, 16384)).toString('utf8'));
        verified = res.ok && result.success === true && result.hostname === new URL(origin).hostname && result.action === 'crm_inquiry';
      } catch { /* No provider bodies or secrets in logs/errors. */ }
      if (!verified) return reply({ error: 'Vérification anti-robot échouée. Veuillez réessayer.' }, 403);
    }
    await rpc('crm_accept_website_inquiry', args);
    return reply(success);
  } catch (error) {
    return reply({ error: error.code === '23505' ? 'Cette demande a été modifiée. Envoyez-la comme une nouvelle demande.' : 'Service indisponible. Réessayez avec la même demande.' }, error.code === '23505' ? 409 : 503);
  }
}
export async function inquiryOptions(request, rpc) {
  const origin = request.headers.get('origin');
  try {
    if (!origin || new URL(origin).origin !== origin || request.headers.get('access-control-request-method') !== 'POST' ||
      !await rpc('crm_get_website_site', { p_key: null, p_origin: origin })) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' } });
  } catch { return new Response(null, { status: 503 }); }
}
