// =============================================================================
// POST /api/email/send
//
// Authenticated proxy in front of src/lib/email.js. Pages call this route
// via the integrations.Core.SendEmail shim. We require a signed-in user
// so the endpoint can't be abused as an open relay.
//
// Staff (director/admin) body shape:
//   { to: string|string[], subject: string, body: string,
//     html?: boolean, message_id?: uuid }
// Portal (teacher/parent/student) body shape: { message_id: uuid } — every
// other field is ignored; the recipient is the saved message's recipient
// account (plan PRF-r2 D7).
//
// Sender names are server-set: staff send under their sanitised profile name
// with the office as Reply-To; portal notices use the fixed "English Hills"
// sender with no Reply-To, and name the sender by the message's from_name.
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { readBoundedJson } from '@/lib/boundedJson.mjs';
import { portalNoticeEmail, senderAddress, staffEmailOptions } from '@/lib/emailSender.mjs';
import { rejectCrossOrigin } from '@/lib/http/requestOrigin.mjs';

// Cap on recipients per request — defends against a compromised account
// fanning a single call out to the whole address book.
const MAX_RECIPIENTS = 20;

// Per-user rate limit on this endpoint. Both windows must pass: this caps
// burst (10/min) and sustained abuse (100/hour) without blocking normal use.
const RATE_LIMITS = [
  { scope: 'email_send:minute', max: 10,  windowSeconds: 60 },
  { scope: 'email_send:hour',   max: 100, windowSeconds: 60 * 60 },
];

// Fits a 200 000-character message plus the other fields; larger bodies are refused unread.
const BODY_LIMIT = 1024 * 1024;

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
  message_id: z.guid().optional(),
});
// Portal callers name only the saved message; anything else they send is ignored.
const PortalNoticeSchema = z.object({ message_id: z.guid() });

async function officeAddress(supabase) {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'center_info').maybeSingle();
  try {
    const email = JSON.parse(data?.value || '{}').email;
    return emailField.safeParse(email).success ? String(email).trim() : null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  const refused = rejectCrossOrigin(request);
  if (refused) return refused;
  // Gate: require an authenticated session.
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: callerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role, email')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !callerProfile || !['director', 'admin', 'teacher', 'parent', 'student'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const staff = ['director', 'admin'].includes(callerProfile.role);
  // Gate: per-user rate limit (atomic, DB-backed). A portal notice consumed it once
  // already when portal_send_message saved the message, and is sent once per message.
  if (staff) for (const limit of RATE_LIMITS) {
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

  const raw = await readBoundedJson(request, BODY_LIMIT);
  if (raw.status) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: raw.status });
  }

  let recipients;
  let claimed = null;
  let effectiveSubject;
  let effectiveBody;
  let options;
  const sender = senderAddress(process.env.RESEND_FROM_ADDRESS);

  if (staff) {
    // Fixed message: validation issues are not echoed back.
    const parsed = SendEmailSchema.safeParse(raw.data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }
    const { to, subject, body, html } = parsed.data;
    recipients = [...new Set((Array.isArray(to) ? to : [to]).map(value => value.toLowerCase()))];
    for (const recipient of recipients) {
      const { data: permitted, error: permissionError } = await supabase.rpc('can_message_recipient', { p_email: recipient });
      if (permissionError) return NextResponse.json({ error: 'Recipient authorization unavailable' }, { status: 503 });
      if (!permitted) return NextResponse.json({ error: 'Recipient forbidden' }, { status: 403 });
    }
    effectiveSubject = subject;
    effectiveBody = body;
    // Replies reach the office mailbox, never a personal address.
    options = staffEmailOptions({ profileName: callerProfile.full_name, sender, office: await officeAddress(supabase), html });
  } else {
    const parsed = PortalNoticeSchema.safeParse(raw.data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'A saved message is required' }, { status: 403 });
    }
    // Portal accounts cannot read messages directly: the server reads the saved
    // row and its recipient account with the service role, after the checks above.
    // One notice per message: claim it atomically (caller is the sender, under five
    // minutes old, not yet notified); a failed delivery releases the claim below.
    const admin = getServiceRoleClient();
    const { data: message, error: messageError } = await admin.from('messages')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', parsed.data.message_id).eq('sender_profile_id', user.id).is('notified_at', null)
      .not('recipient_profile_id', 'is', null).gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .select('id, recipient_profile_id, from_name, subject, body').maybeSingle();
    if (messageError || !message) {
      return NextResponse.json({ error: 'Message not eligible for email notification' }, { status: 403 });
    }
    claimed = message.id;
    const { data: recipient } = await admin.from('profiles').select('email')
      .eq('id', message.recipient_profile_id).maybeSingle();
    if (!recipient?.email || !emailField.safeParse(recipient.email).success) {
      await admin.from('messages').update({ notified_at: null }).eq('id', claimed);
      return NextResponse.json({ error: 'Message not eligible for email notification' }, { status: 403 });
    }
    recipients = [recipient.email.toLowerCase()];
    ({ subject: effectiveSubject, body: effectiveBody, options } = portalNoticeEmail({
      fromName: message.from_name, subject: message.subject, body: message.body, sender }));
  }

  try {
    const result = await sendEmail(recipients, effectiveSubject, effectiveBody, options);
    return NextResponse.json({ success: true, id: result?.id });
  } catch (err) {
    if (claimed) await getServiceRoleClient().from('messages').update({ notified_at: null }).eq('id', claimed);
    // eslint-disable-next-line no-console
    console.error('[POST /api/email/send] Resend error:', err);
    return NextResponse.json({ error: err.message || 'Email send failed' }, { status: 500 });
  }
}
