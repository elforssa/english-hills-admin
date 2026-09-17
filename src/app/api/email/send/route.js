// =============================================================================
// POST /api/email/send
//
// Authenticated proxy in front of src/lib/email.js. Pages call this route
// via the integrations.Core.SendEmail shim. We require a signed-in user
// so the endpoint can't be abused as an open relay.
//
// Body shape:
//   { to: string|string[], subject: string, body: string,
//     html?: boolean, reply_to?: string }
//
// Note: the From display name is derived from the caller's profile —
// callers cannot spoof it. A `from_name` field in the body is ignored.
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';

// Cap on recipients per request — defends against a compromised account
// fanning a single call out to the whole address book.
const MAX_RECIPIENTS = 20;

// Per-user rate limit on this endpoint. Both windows must pass: this caps
// burst (10/min) and sustained abuse (100/hour) without blocking normal use.
const RATE_LIMITS = [
  { scope: 'email_send:minute', max: 10,  windowSeconds: 60 },
  { scope: 'email_send:hour',   max: 100, windowSeconds: 60 * 60 },
];

const emailField = z.string().trim().email();

const SendEmailSchema = z.object({
  to: z.union([
    emailField,
    z.array(emailField).min(1).max(MAX_RECIPIENTS),
  ]),
  subject:   z.string().trim().min(1).max(998),  // RFC 5322 line-length cap
  body:      z.string().min(1).max(200_000),
  html:      z.boolean().optional(),
  reply_to:  emailField.optional(),
  message_id: z.string().uuid().optional(),
});

export async function POST(request) {
  // Gate: require an authenticated session.
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Look up caller's display name server-side so callers can't spoof it.
  const { data: callerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role, email')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !callerProfile || !['director', 'admin', 'teacher', 'parent', 'student'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const callerName = callerProfile?.full_name || null;

  // Gate: per-user rate limit (atomic, DB-backed).
  for (const limit of RATE_LIMITS) {
    const { data: allowed, error: rlError } = await supabase.rpc('consume_rate_limit', { p_scope: limit.scope });
    if (rlError) {
      // eslint-disable-next-line no-console
      console.error('[POST /api/email/send] rate-limit RPC failed:', rlError);
      return NextResponse.json({ error: 'Rate limiter unavailable' }, { status: 503 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many emails. Please wait before sending again.' },
        { status: 429, headers: { 'Retry-After': String(limit.windowSeconds) } },
      );
    }
  }

  let raw;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SendEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request payload',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { to, subject, body, html, message_id } = parsed.data;
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map(value => value.toLowerCase()))];
  const staff = ['director', 'admin'].includes(callerProfile.role);
  if (!staff && (recipients.length !== 1 || !message_id || html)) {
    return NextResponse.json({ error: 'A saved message is required' }, { status: 403 });
  }

  for (const recipient of recipients) {
    const { data: permitted, error: permissionError } = await supabase.rpc('can_message_recipient', { p_email: recipient });
    if (permissionError) return NextResponse.json({ error: 'Recipient authorization unavailable' }, { status: 503 });
    if (!permitted) return NextResponse.json({ error: 'Recipient forbidden' }, { status: 403 });
  }

  let effectiveSubject = subject;
  let effectiveBody = body;
  if (!staff) {
    const { data: message, error: messageError } = await supabase.from('messages')
      .select('id, from_user_email, to_user_email, subject, body, created_at')
      .eq('id', message_id).maybeSingle();
    if (messageError || !message
      || message.from_user_email?.toLowerCase() !== callerProfile.email?.toLowerCase()
      || message.to_user_email?.toLowerCase() !== recipients[0]
      || Date.now() - new Date(message.created_at).getTime() > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Message not eligible for email notification' }, { status: 403 });
    }
    effectiveSubject = `Nouveau message English Hills : ${message.subject}`;
    effectiveBody = `Bonjour,\n\nVous avez reçu un message via votre espace English Hills :\n\n${message.body}\n\nConnectez-vous à votre espace pour répondre.`;
  }

  try {
    const options = {};
    if (html)      options.html = true;
    if (callerProfile.email) options.replyTo = callerProfile.email;
    if (callerName && process.env.RESEND_FROM_ADDRESS) {
      // Use the server-side display name so callers can't spoof it.
      const verified = process.env.RESEND_FROM_ADDRESS;
      const addrMatch = verified.match(/<([^>]+)>/) || [null, verified];
      options.from = `${callerName} <${addrMatch[1]}>`;
    }
    const result = await sendEmail(recipients, effectiveSubject, effectiveBody, options);
    return NextResponse.json({ success: true, id: result?.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/email/send] Resend error:', err);
    return NextResponse.json({ error: err.message || 'Email send failed' }, { status: 500 });
  }
}
