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
import { z } from 'zod';
import { getServiceRoleClient } from '@/lib/supabase-admin';

const AGE_CATEGORIES = ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)', 'Corporate'];
const NIVEAUX       = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const InscriptionSchema = z.object({
  full_name:     z.string().trim().min(2).max(120),
  date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  telephone:     z.string().trim().min(6).max(30),
  email:         z.string().trim().email().optional().or(z.literal('')),
  parent_email:  z.string().trim().email().optional().or(z.literal('')),
  age_category:  z.enum(AGE_CATEGORIES).optional().or(z.literal('')),
  niveau_cefr:   z.enum(NIVEAUX).optional().or(z.literal('')),
  notes:         z.string().max(2000).optional().or(z.literal('')),
  documents_urls: z.array(z.string().url()).max(10).optional(),
  // CNDP (Loi 09-08) requires an explicit consent record. The client form
  // gates submission on a checkbox, but we re-enforce here so a direct POST
  // can't bypass it.
  consent:       z.literal(true, {
    errorMap: () => ({ message: 'Consentement requis pour soumettre le formulaire.' }),
  }),
  // Cloudflare Turnstile token; required when TURNSTILE_SECRET_KEY is set.
  turnstileToken: z.string().min(1).max(2048).optional(),
}).refine(
  (data) => Boolean(data.email) || Boolean(data.parent_email),
  {
    message: 'Au moins un email (apprenant ou parent) est requis.',
    path: ['email'],
  },
);

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
  if (!host) return true; // local / server-to-server — allow
  const expected = [`http://${host}`, `https://${host}`];
  if (origin  && expected.some(e => origin.startsWith(e)))  return true;
  if (referer && expected.some(e => referer.startsWith(e))) return true;
  return false;
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
    age_category, niveau_cefr, notes, documents_urls, turnstileToken,
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

  // ── Create student + enrollment ─────────────────────────────────────────
  const { data: student, error: studentErr } = await admin
    .from('students')
    .insert({
      full_name,
      date_naissance: date_naissance || null,
      telephone,
      email:         email         || null,
      parent_email:  parent_email  || null,
      age_category:  age_category  || null,
      niveau_cefr:   niveau_cefr   || null,
      notes:         notes         || null,
      status:        'Prospect',
    })
    .select('id')
    .single();

  if (studentErr) {
    // eslint-disable-next-line no-console
    console.error('[inscription] student insert failed:', studentErr);
    return NextResponse.json({ error: 'Erreur lors de la création du dossier.' }, { status: 500 });
  }

  const { error: enrollErr } = await admin.from('enrollments').insert({
    student_id:      student.id,
    status:          'Submitted',
    date_inscription: new Date().toISOString().split('T')[0],
    documents_urls:  documents_urls || [],
    notes:           notes || null,
  });

  if (enrollErr) {
    // eslint-disable-next-line no-console
    console.error('[inscription] enrollment insert failed:', enrollErr);
    // Don't return 500 — student is created, log the partial failure.
  }

  return NextResponse.json({ success: true, studentId: student.id });
}
