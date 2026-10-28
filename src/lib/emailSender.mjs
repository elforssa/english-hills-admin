// Sender rules of /api/email/send (plan PRF-r2 D7, Q5 = A). Pure, so the
// fixed-sender and no-Reply-To rules are unit-tested (scripts/test-portal-readiness-unit.mjs).
import { sanitizeDisplayName } from './displayName.mjs';

// The verified address inside RESEND_FROM_ADDRESS ("Name <address>" or a bare address).
export function senderAddress(fromSetting) {
  if (!fromSetting) return null;
  return (fromSetting.match(/<([^>]+)>/) || [null, fromSetting])[1].trim();
}

// Staff: their sanitised profile name, replies to the office mailbox, never to a person.
export function staffEmailOptions({ profileName, sender, office, html = false }) {
  const options = {};
  if (html) options.html = true;
  if (office) options.replyTo = office;
  const name = sanitizeDisplayName(profileName);
  if (name && sender) options.from = `${name} <${sender}>`;
  return options;
}

// Portal notice: fixed "English Hills" sender, no Reply-To, the sender named by
// the message's server-set from_name; the caller's `to` never matters.
export function portalNoticeEmail({ fromName, subject, body, sender }) {
  const from = sanitizeDisplayName(fromName) || 'English Hills';
  return {
    subject: `Nouveau message English Hills : ${subject}`,
    body: `Bonjour,\n\n${from} vous a envoyé un message via votre espace English Hills :\n\n${body}\n\nConnectez-vous à votre espace pour répondre.`,
    options: sender ? { from: `English Hills <${sender}>` } : {},
  };
}
