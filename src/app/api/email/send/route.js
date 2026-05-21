// =============================================================================
// POST /api/email/send
//
// Authenticated proxy in front of src/lib/email.js. Pages call this route
// via the integrations.Core.SendEmail shim. We require a signed-in user
// so the endpoint can't be abused as an open relay.
//
// Body shape:
//   { to: string|string[], subject: string, body: string,
//     html?: boolean, from_name?: string, reply_to?: string }
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';

// Cap on recipients per request — defends against a compromised account
// fanning a single call out to the whole address book.
const MAX_RECIPIENTS = 50;

const emailField = z.string().trim().email();

const SendEmailSchema = z.object({
  to: z.union([
    emailField,
    z.array(emailField).min(1).max(MAX_RECIPIENTS),
  ]),
  subject:   z.string().trim().min(1).max(998),  // RFC 5322 line-length cap
  body:      z.string().min(1).max(200_000),
  html:      z.boolean().optional(),
  from_name: z.string().trim().min(1).max(100).optional(),
  reply_to:  emailField.optional(),
});

export async function POST(request) {
  // Gate: require an authenticated session.
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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

  const { to, subject, body, html, from_name, reply_to } = parsed.data;

  try {
    const options = {};
    if (html)      options.html = true;
    if (reply_to)  options.replyTo = reply_to;
    if (from_name && process.env.RESEND_FROM_ADDRESS) {
      // Only allow overriding the display name if we already have a verified
      // sender domain. Otherwise Resend will reject the request.
      const verified = process.env.RESEND_FROM_ADDRESS;
      const addrMatch = verified.match(/<([^>]+)>/) || [null, verified];
      options.from = `${from_name} <${addrMatch[1]}>`;
    }
    const result = await sendEmail(to, subject, body, options);
    return NextResponse.json({ success: true, id: result?.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/email/send] Resend error:', err);
    return NextResponse.json({ error: err.message || 'Email send failed' }, { status: 500 });
  }
}
