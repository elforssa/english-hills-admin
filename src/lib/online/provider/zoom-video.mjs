// Zoom Video SDK adapter (plan OL-r6 adapter addendum, decisions A1–A4, A7). Server only.
//
// Zoom has no room object: a session exists by name and is created when its first
// participant joins. The opaque course `roomRef` is therefore a prefix, and each lesson
// gets its own session name `lower(roomRef + '.' + lessonRef)` (A2), so a token for
// lesson A cannot enter lesson B at the provider. The session token is an HS256 JWT
// signed with the Video SDK Secret, which exists only in the server environment
// (ONLINE_VIDEO_PROVIDER_API_SECRET); the Video SDK Key (ONLINE_VIDEO_PROVIDER_API_KEY)
// is the `app_key` claim and is visible to the participant inside the token.
//
// Zoom requires `exp - iat >= 1800`, so the token lives until the pass expiry or 30
// minutes after issue, whichever is later (A1). The webhook follows Zoom's platform
// scheme (x-zm-signature = v0=HMAC-SHA256("v0:{timestamp}:{raw body}", secret token),
// timestamp within five minutes) and answers the endpoint.url_validation challenge only
// after the same checks (A3). No telemetry_tracking_id is ever set (A7). Zoom cannot
// revoke an issued token, so supportsRevoke is false (D6 "where it does not").
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ZOOM_SESSION_NAME = /^[a-z0-9._:-]{1,200}$/;
const ROOM_REF = /^[A-Za-z0-9-]{1,40}$/;
const PLAIN_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const MIN_LIFETIME_S = 1800;
const MAX_LIFETIME_S = 48 * 3600;
const TIMESTAMP_WINDOW_S = 300;
const EVENT_KINDS = { 'session.user_joined': 'joined', 'session.user_left': 'left' };

const b64url = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const hmacHex = (secret, message) => createHmac('sha256', secret).update(message).digest('hex');
const sameString = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Zoom's session name rule (A2, I2): course prefix plus lesson id, lowercased and bounded.
export function zoomSessionName(roomRef, lessonRef) {
  if (typeof roomRef !== 'string' || !ROOM_REF.test(roomRef)) throw new Error('roomRef invalid');
  if (typeof lessonRef !== 'string' || !/^[A-Za-z0-9-]{1,36}$/.test(lessonRef)) throw new Error('lessonRef invalid');
  const name = `${roomRef}.${lessonRef}`.toLowerCase();
  if (!ZOOM_SESSION_NAME.test(name)) throw new Error('session name invalid');
  return name;
}

export function signZoomJwt(claims, secret) {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url(claims);
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function createZoomVideoProvider(env = process.env, clock = () => Date.now()) {
  const credentials = () => {
    const key = env.ONLINE_VIDEO_PROVIDER_API_KEY, secret = env.ONLINE_VIDEO_PROVIDER_API_SECRET;
    if (typeof key !== 'string' || !key || typeof secret !== 'string' || !secret) throw new Error('Zoom Video SDK credentials missing');
    return { key, secret };
  };
  return Object.freeze({
    id: 'zoom-video',
    supportsWebhooks: true,
    supportsRevoke: false,

    async createRoom({ courseRef }) {
      if (typeof courseRef !== 'string' || !courseRef) throw new Error('courseRef required');
      return { roomRef: `eh-${randomBytes(12).toString('hex')}` };
    },

    // Nothing to close at Zoom: a session ends when its last participant leaves, every
    // pass of the course is revoked by the database, and a closed course mints no token.
    async closeRoom(roomRef) {
      if (typeof roomRef !== 'string' || !ROOM_REF.test(roomRef)) throw new Error('roomRef required');
      return { closed: true };
    },

    async mintJoinToken({ roomRef, displayName, role, expiresAt, participantRef, lessonRef }) {
      if (!roomRef || !displayName || !['host', 'participant'].includes(role) || !expiresAt || !participantRef || !lessonRef) {
        throw new Error('Incomplete join request');
      }
      if (typeof participantRef !== 'string' || participantRef.length > 36) throw new Error('participantRef invalid');
      const { key, secret } = credentials();
      const sessionName = zoomSessionName(roomRef, lessonRef);
      const expiresMs = new Date(expiresAt).getTime();
      if (!Number.isFinite(expiresMs)) throw new Error('expiresAt invalid');
      const iat = Math.floor(clock() / 1000) - 30;
      const exp = Math.max(Math.floor(expiresMs / 1000), iat + MIN_LIFETIME_S);
      if (exp > iat + MAX_LIFETIME_S) throw new Error('expiresAt too far ahead');
      const token = signZoomJwt({ app_key: key, tpc: sessionName, role_type: role === 'host' ? 1 : 0, version: 1, iat, exp,
        user_key: participantRef, video_webrtc_mode: 1, audio_webrtc_mode: 1 }, secret);
      return { token, embed: { kind: 'zoom-video', sessionName, token, displayName, role,
        expiresAt: new Date(expiresMs).toISOString(), tokenExpiresAt: new Date(exp * 1000).toISOString() } };
    },

    // { ok, events, challenge? }. The signature and the timestamp window are checked
    // before the body is parsed, for every event including the validation challenge.
    async verifyWebhook({ rawBody, headers, secret }) {
      const refused = { ok: false, events: [] };
      if (!secret || typeof rawBody !== 'string' || rawBody.length > 65536) return refused;
      const timestamp = String(headers?.get?.('x-zm-request-timestamp') || '');
      const given = String(headers?.get?.('x-zm-signature') || '');
      if (!/^\d{1,13}$/.test(timestamp)) return refused;
      const seconds = Number(timestamp);
      if (Math.abs(Math.floor(clock() / 1000) - seconds) > TIMESTAMP_WINDOW_S) return refused;
      if (!sameString(given, `v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`)) return refused;
      let body;
      try { body = JSON.parse(rawBody); } catch { return refused; }
      if (!body || typeof body !== 'object') return refused;
      if (body.event === 'endpoint.url_validation') {
        const plainToken = body.payload?.plainToken;
        if (typeof plainToken !== 'string' || !PLAIN_TOKEN.test(plainToken)) return refused;
        return { ok: true, events: [], challenge: { plainToken, encryptedToken: hmacHex(secret, plainToken) } };
      }
      const kind = EVENT_KINDS[body.event];
      if (!kind) return { ok: true, events: [] };
      const user = body.payload?.object?.user;
      if (!user || typeof user !== 'object') return { ok: true, events: [] };
      const at = kind === 'joined' ? user.join_time : user.leave_time;
      return { ok: true, events: [{ participantRef: user.user_key, kind, at,
        providerParticipantRef: typeof user.participant_uuid === 'string' ? user.participant_uuid.slice(0, 200) : null }] };
    },
  });
}

export const zoomVideoProvider = createZoomVideoProvider();
