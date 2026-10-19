// =============================================================================
// POST /api/public/inscription
//
// Public endpoint that receives the self-enrollment form submission.
// No authentication required — enforced instead by:
//   1. Origin / Referer check (CSRF-S12)
//   2. IP-based rate limit via anon_rate_limits table (S10)
//   3. Zod input validation
// =============================================================================

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { InscriptionSchema } from '@/lib/publicInscription.mjs';

// 5 submissions per IP per hour from the public form
const RATE_LIMITS = [
  { scope: 'inscription:hour', max: 5, windowSeconds: 60 * 60 },
];

function getIp(request) {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

// Verify a Cloudflare Turnstile token against Cloudflare's siteverify
// endpoint. Returns true on a confirmed human, false otherwise. If the
// secret key isn't configured we treat the gate as bypassed — local dev
// shouldn't require Turnstile, but production MUST set TURNSTILE_SECRET_KEY.
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('response', token);
  if (ip && ip !== 'unknown') params.set('remoteip', ip);

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: params },
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[inscription] Turnstile verify failed:', err);
    return false;
  }
}

function checkOrigin(request) {
  const origin  = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host    = request.headers.get('host');
  if (!host || (!origin && !referer)) return false;
  try {
    const source = new URL(origin || referer);
    return ['http:', 'https:'].includes(source.protocol)
      && source.host === host
      && (!origin || source.origin === origin);
  } catch { return false; }
}

export async function POST(request) {
  // ── CSRF: reject cross-origin form submissions ──────────────────────────
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── IP rate limiting ────────────────────────────────────────────────────
  const ip    = getIp(request);
  const admin = getServiceRoleClient();

  for (const limit of RATE_LIMITS) {
    const { data: allowed, error: rlErr } = await admin.rpc('check_anon_rate_limit', {
      p_ip_key:         ip,
      p_scope:          limit.scope,
      p_max_requests:   limit.max,
      p_window_seconds: limit.windowSeconds,
    });
    if (rlErr) {
      // eslint-disable-next-line no-console
      console.error('[inscription] rate-limit RPC failed:', rlErr);
      return NextResponse.json({ error: 'Rate limiter unavailable' }, { status: 503 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de soumissions. Veuillez réessayer dans une heure.' },
        { status: 429, headers: { 'Retry-After': String(limit.windowSeconds) } },
      );
    }
  }

  // ── Parse + validate body ───────────────────────────────────────────────
  let raw;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const parsed = InscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    full_name, date_naissance, telephone, email, parent_email,
    age_category, session_type, niveau_cefr, notes, turnstileToken, idempotency_key,
  } = parsed.data;

  // ── Cloudflare Turnstile: confirm submission isn't from a bot. ──────────
  // Runs AFTER schema validation so bots burning CPU on the wrong shape
  // get rejected by Zod first (cheaper than the network round-trip).
  const turnstileOk = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileOk) {
    return NextResponse.json(
      { error: 'Vérification anti-robot échouée. Veuillez réessayer.' },
      { status: 403 },
    );
  }

  const payload = {
    full_name, date_naissance: date_naissance || '', telephone,
    email: email || '', parent_email: parent_email || '',
    age_category: age_category || '', session_type: session_type || 'Yearly',
    niveau_cefr: niveau_cefr || '', notes: notes || '', consent: true,
  };
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const { data: studentId, error: registrationError } = await admin.rpc('create_public_registration', {
    p_payload: payload, p_request_id: idempotency_key, p_hash: hash,
  });
  if (registrationError) {
    // eslint-disable-next-line no-console
    console.error('[inscription] transactional registration failed:', registrationError.code);
    return NextResponse.json({ error: 'Erreur lors de la création du dossier. Veuillez réessayer.' }, { status: registrationError.code === '23505' ? 409 : 500 });
  }
  return NextResponse.json({ success: true, studentId });
}
