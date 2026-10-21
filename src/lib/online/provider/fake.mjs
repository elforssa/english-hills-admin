// Fake video provider for local development, CI and preview deployments only. It
// creates opaque room references, mints unsigned descriptor tokens and renders a
// placeholder; it never contacts a network service. The online gate refuses it
// whenever VERCEL_ENV is production.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

export const fakeProvider = Object.freeze({
  id: 'fake',
  supportsWebhooks: true,
  supportsRevoke: true,

  async createRoom({ courseRef }) {
    if (typeof courseRef !== 'string' || !courseRef) throw new Error('courseRef required');
    return { roomRef: `fake-room-${randomBytes(8).toString('hex')}` };
  },

  async closeRoom(roomRef) {
    if (typeof roomRef !== 'string' || !roomRef) throw new Error('roomRef required');
    return { closed: true };
  },

  async mintJoinToken({ roomRef, displayName, role, expiresAt, participantRef }) {
    if (!roomRef || !displayName || !['host', 'participant'].includes(role) || !expiresAt || !participantRef) {
      throw new Error('Incomplete join request');
    }
    const token = encode({ room: roomRef, ref: participantRef, role, exp: new Date(expiresAt).toISOString() });
    return { token, embed: { kind: 'fake', displayName, role, expiresAt: new Date(expiresAt).toISOString() } };
  },

  async revokeParticipant(roomRef, participantRef) {
    if (!roomRef || !participantRef) throw new Error('roomRef and participantRef required');
    return { revoked: true };
  },

  // Signature: hex HMAC-SHA256 of the raw body under the webhook secret, header
  // x-online-signature. Body: { events: [{ participant_ref, kind, at, provider_participant_ref? }] }.
  async verifyWebhook({ rawBody, headers, secret }) {
    if (!secret || typeof rawBody !== 'string') return { ok: false, events: [] };
    const given = String(headers?.get?.('x-online-signature') || '');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      return { ok: false, events: [] };
    }
    let body;
    try { body = JSON.parse(rawBody); } catch { return { ok: false, events: [] }; }
    const events = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
    return {
      ok: true,
      events: events.map(e => ({
        participantRef: e?.participant_ref, kind: e?.kind, at: e?.at,
        providerParticipantRef: e?.provider_participant_ref ?? null,
      })),
    };
  },
});
