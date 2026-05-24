// =============================================================================
// Email helper — Resend-backed sendEmail(to, subject, body)
//
// SERVER ONLY. Imports the `resend` package and reads RESEND_API_KEY from
// process.env. Do not import this file from a "use client" component — the
// API key would be bundled into the browser. Use the
// /api/email/send route instead (which calls this helper internally).
// =============================================================================

import { Resend } from 'resend';

const apiKey      = process.env.RESEND_API_KEY;
const fromDefault = process.env.RESEND_FROM_ADDRESS
  || 'English Hills <onboarding@resend.dev>';

let client;

// Mock client used when RESEND_API_KEY is unset in dev. Logs the would-be
// send so the developer sees activity, returns a fake id so callers don't
// crash. In production, missing key still throws.
const mockClient = {
  emails: {
    async send(payload) {
      // eslint-disable-next-line no-console
      console.warn('[email] RESEND_API_KEY unset — mock send:', {
        to: payload.to, subject: payload.subject,
      });
      return { data: { id: `mock-${Date.now()}` }, error: null };
    },
  },
};

function getClient() {
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') return mockClient;
    throw new Error(
      'RESEND_API_KEY is required in production. Set it in your environment.'
    );
  }
  if (!client) client = new Resend(apiKey);
  return client;
}

/**
 * sendEmail(to, subject, body, options?) → Promise<{ id }>
 *
 * @param {string|string[]} to            Recipient or recipients.
 * @param {string}          subject       Email subject line.
 * @param {string}          body          Plain text (default) or HTML body.
 * @param {object}          [options]
 * @param {string}          [options.from]      Override the sender (must be a
 *                                              verified Resend domain).
 * @param {boolean}         [options.html]      Treat `body` as HTML.
 * @param {string|string[]} [options.replyTo]   Reply-To header.
 *
 * Throws on Resend API errors. The Resend response includes a message id
 * which is useful for logging/audit trails.
 */
export async function sendEmail(to, subject, body, options = {}) {
  const resend = getClient();

  const payload = {
    from:    options.from    || fromDefault,
    to:      Array.isArray(to) ? to : [to],
    subject,
  };
  if (options.html) payload.html = body;
  else              payload.text = body;
  if (options.replyTo) payload.replyTo = options.replyTo;

  const { data, error } = await resend.emails.send(payload);
  if (error) {
    const msg = error.message || error.name || 'Email send failed';
    throw new Error(msg);
  }
  return data;
}
