// Route logic for /api/online/* and /api/webhooks/online/<provider> (plan OL-r4 D6, D7,
// D9, D11). Dependencies are injected so the node tests exercise the same code as the
// route files. Every handler authenticates itself, checks the live gate first and
// answers with a closed { reason } vocabulary only: no raw database or provider text,
// no room reference and no secret ever reaches a response.
// Reliability PR (plan ORR-r2): the join route picks the adapter of the pass's own
// provider (sections 6.1–6.2), from the set of enabled providers, which today holds
// exactly ONLINE_VIDEO_PROVIDER, and answers the pass id so that the page can confirm
// it from inside the room (online_confirm_pass) and check it (online_check_pass). The
// status route answers director and admin whatever the live switch and the gate say.
// Webhook PR (plan ORR-r2, section 3): the webhook route has its own gate
// (onlineWebhookGate, independent of the live switch), refuses an oversized request with
// 413 before reading its body, verifies the signature before any database call, stores
// the four events, and never answers 200 to a failed write (503, or 429 for the write
// ceiling), so that the provider's retry can deliver it; the unique keys make a retry
// write nothing twice. Refused writes are counted per deployment (D16).
import { onlineGate, onlineCredentialShape, onlineWebhookGate, onlineWebhookSecretShape } from './gate.mjs';
import { onlineReason } from './reasons.mjs';
import { isRecordConflict } from '../conflictErrors.mjs';
import { providerDisplayName } from './label.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = {
  gate_closed: 503, provider_invalid: 503, provider_error: 502, unauthenticated: 401, not_found: 404,
  forbidden: 403, not_eligible: 403, consent_missing: 403, window_closed: 403, lesson_cancelled: 403,
  course_inactive: 403, student_required: 403, pass_invalid: 403,
  capacity: 409, stale: 409, course_not_draft: 409, course_closed: 409, lesson_past: 409, lesson_overlap: 409,
  lesson_in_use: 409, superseded: 409, too_large: 413, rate_limited: 429, unavailable: 503,
};
const refuse = reason => ({ status: STATUS[reason] || 400, body: { reason } });
const isUuid = value => typeof value === 'string' && UUID.test(value);
const isVersion = value => Number.isSafeInteger(value) && value > 0;
// A database refusal carries online.<reason> (or a record-conflict SQLSTATE); anything else is generic.
const fromDatabase = error => refuse(onlineReason(error?.hint) || (isRecordConflict(error) ? 'stale' : 'invalid_input'));

async function caller(getUserClient, roles) {
  const client = await getUserClient();
  const { data: { user } = {}, error } = await client.auth.getUser();
  if (error || !user) return { failure: refuse('unauthenticated') };
  if (roles) {
    const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError || !roles.includes(profile?.role)) return { failure: refuse('forbidden') };
  }
  return { client };
}

function openGate(env, getProvider) {
  const gate = onlineGate(env, getProvider);
  if (!gate.open) return { failure: refuse(gate.reason) };
  const adapter = getProvider(gate.provider);
  if (!adapter) return { failure: refuse('provider_invalid') };
  return { adapter, enabled: enabledProviders(gate) };
}

// POST /api/online/join { lesson, student? }
export async function handleJoin({ body, env, getUserClient, getServiceClient, getProvider }) {
  const gate = openGate(env, getProvider);
  if (gate.failure) return gate.failure;
  if (!isUuid(body?.lesson) || (body.student != null && !isUuid(body.student))) return refuse('invalid_input');
  const who = await caller(getUserClient);
  if (who.failure) return who.failure;
  const { data: pass, error } = await who.client.rpc('online_issue_join', { p_lesson: body.lesson, p_student: body.student ?? null });
  if (error || !pass?.jti) return fromDatabase(error);
  const { data: room, error: roomError } = await getServiceClient().rpc('online_resolve_join', { p_jti: pass.jti });
  if (roomError) return refuse(onlineReason(roomError.hint) === 'superseded' ? 'superseded' : 'pass_invalid');
  if (!room?.room_ref) return refuse('pass_invalid');
  // The adapter of the pass's provider, and only from the enabled set.
  if (!gate.enabled.includes(room.provider)) return refuse('provider_invalid');
  const adapter = getProvider(room.provider);
  if (!adapter || adapter.id !== room.provider) return refuse('provider_invalid');
  // A failed mint leaves the pass issued and unconfirmed: it supersedes nothing, so the
  // person's earlier connection stays current (B2).
  let minted;
  try {
    minted = await adapter.mintJoinToken({ roomRef: room.room_ref, displayName: providerDisplayName(room.display_label),
      role: room.provider_role, expiresAt: room.expires_at, participantRef: pass.jti, lessonRef: body.lesson });
  } catch {
    return refuse('provider_error');
  }
  // The embed descriptor carries whatever the provider's client needs; for a real
  // provider that is its short-lived token, never a durable room address.
  return { status: 200, body: { provider: adapter.id, embed: minted.embed, pass: pass.jti,
    role: room.provider_role, display_label: room.display_label, expires_at: room.expires_at } };
}

// The providers a pass may use. Today exactly the configured one; the Meeting SDK plan
// (D14) widens it.
export function enabledProviders(gate) {
  return gate?.open && gate.provider ? [gate.provider] : [];
}

// GET /api/online/status — director and admin only. Not behind the live gate: it says
// what the gate sees (binding note 1). Words only: never a value, a length, a class of
// mistake or a fragment of a credential.
// Webhook PR rows (section 3, D7 c, D9, D16): whether the webhook secret is « présent »,
// « absent » or « incorrect » (never its value), whether the webhook route is « ouvert »
// or « fermé » (its own gate), the time of the last event received and the refused writes
// counted for this deployment. The database rows come from online_room_status, read as
// the caller; if that read fails, they are null and the words still answer.
const KEY_WORDS = { correct: 'correctes', incorrect: 'incorrectes', absent: 'absentes' };
const SECRET_WORDS = { present: 'présent', incorrect: 'incorrect', absent: 'absent' };
export async function handleStatus({ env, getUserClient, getProvider }) {
  const who = await caller(getUserClient, ['director', 'admin']);
  if (who.failure) return who.failure;
  const provider = env.ONLINE_VIDEO_PROVIDER || '';
  const body = {
    keys: KEY_WORDS[onlineCredentialShape(env, getProvider)] || KEY_WORDS.absent,
    webhook_secret: SECRET_WORDS[onlineWebhookSecretShape(env)],
    webhook: onlineWebhookGate(env, provider, getProvider).open ? 'ouvert' : 'fermé',
    last_event_at: null,
    refused: null,
  };
  try {
    const { data, error } = await who.client.rpc('online_room_status', { p_deployment: webhookDeployment(env) });
    if (!error && data && typeof data === 'object') {
      body.last_event_at = typeof data.last_event_at === 'string' ? data.last_event_at : null;
      const count = value => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
      body.refused = { rate_limited: count(data.refused_rate_limited), unavailable: count(data.refused_unavailable) };
    }
  } catch { /* the words above still answer */ }
  return { status: 200, body };
}

// The deployment a refusal is counted against (D16): Vercel's deployment id, else the
// commit, else « local ». Neither is a secret; anything outside the stored pattern is
// « unknown ».
export function webhookDeployment(env = process.env) {
  const value = env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || 'local';
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value) ? value : 'unknown';
}

// POST /api/online/courses/activate|close { group, version } — management only.
export async function handleCourseAction({ action, body, env, getUserClient, getServiceClient, getProvider }) {
  if (!['activate', 'close'].includes(action)) return refuse('not_found');
  const gate = openGate(env, getProvider);
  if (gate.failure) return gate.failure;
  if (!isUuid(body?.group) || !isVersion(body?.version)) return refuse('invalid_input');
  const who = await caller(getUserClient, ['director', 'admin']);
  if (who.failure) return who.failure;
  if (action === 'activate') {
    let room;
    try { room = await gate.adapter.createRoom({ courseRef: body.group, audience: body.audience ?? null }); }
    catch { return refuse('provider_error'); }
    const { data, error } = await who.client.rpc('online_activate_course', { p_group: body.group, p_expected_version: body.version,
      p_provider: gate.adapter.id, p_room_ref: room?.roomRef ?? null });
    if (error) {
      // Compensate: the provider room was created but the course was not activated.
      await gate.adapter.closeRoom(room.roomRef).catch(() => {});
      return fromDatabase(error);
    }
    return { status: 200, body: { status: data.status, version: data.version } };
  }
  // Close the course first: every pass is revoked even if the provider call fails. The
  // opaque room reference never reaches the caller (review fix N1): it is resolved here
  // as the service role, after the close, and handed to the adapter only.
  const { data, error } = await who.client.rpc('online_close_course', { p_group: body.group, p_expected_version: body.version });
  if (error) return fromDatabase(error);
  let providerClosed = false;
  const { data: room } = await getServiceClient().rpc('online_resolve_room', { p_group: body.group });
  if (room?.room_ref && room.provider === gate.adapter.id) {
    try { await gate.adapter.closeRoom(room.room_ref); providerClosed = true; } catch { providerClosed = false; }
  }
  return { status: 200, body: { status: data.status, version: data.version, revoked: data.revoked, provider_closed: providerClosed } };
}

// POST /api/online/lessons/cancel|reschedule — operations staff; e-mails families server-side.
export async function handleLessonAction({ action, body, env, getUserClient, getServiceClient, getProvider, sendEmail }) {
  if (!['cancel', 'reschedule'].includes(action)) return refuse('not_found');
  const gate = openGate(env, getProvider);
  if (gate.failure) return gate.failure;
  if (!isUuid(body?.lesson) || !isVersion(body?.version) || !['this', 'following'].includes(body?.scope)) return refuse('invalid_input');
  if (action === 'cancel' && (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 200)) return refuse('invalid_input');
  if (action === 'reschedule' && (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes))) return refuse('invalid_input');
  const who = await caller(getUserClient, ['director', 'admin', 'receptionist']);
  if (who.failure) return who.failure;
  const { data, error } = action === 'cancel'
    ? await who.client.rpc('online_cancel_lesson', { p_lesson: body.lesson, p_expected_version: body.version, p_reason: body.reason, p_scope: body.scope })
    : await who.client.rpc('online_update_lesson', { p_lesson: body.lesson, p_expected_version: body.version, p_changes: body.changes, p_scope: body.scope });
  if (error) return fromDatabase(error);
  const ids = Array.isArray(data?.notification_ids) ? data.notification_ids.filter(isUuid) : [];
  let emailed = 0, failed = 0;
  if (ids.length) {
    // Addresses are read with the privileged client; they never reach the caller.
    const service = getServiceClient();
    const { data: notices, error: readError } = await service.from('notifications')
      .select('id, recipient_email, subject, message').in('id', ids).eq('sent', false)
      .in('type', ['online_lesson_cancelled', 'online_lesson_rescheduled']);
    for (const notice of readError ? [] : notices || []) {
      try {
        await sendEmail(notice.recipient_email, notice.subject, notice.message);
        await service.from('notifications').update({ sent: true, sent_at: new Date().toISOString(), error: null }).eq('id', notice.id);
        emailed += 1;
      } catch {
        await service.from('notifications').update({ error: 'delivery_failed' }).eq('id', notice.id);
        failed += 1;
      }
    }
    if (readError) failed = ids.length;
  }
  return { status: 200, body: { ...(action === 'cancel' ? { cancelled: data.cancelled } : { lesson_id: data.lesson_id }),
    version: data.version, notified: ids.length, emailed, failed } };
}

// The body of a webhook request, read only after its size is known (plan ORR-r2, N8):
// 413 when Content-Length is missing, malformed or above the limit, without reading the
// body; the body is then read as a stream that stops at the limit, and a body longer than
// its header or the limit is 413 too. The signature is computed over the bytes read,
// decoded as strict UTF-8 (bytes that are not UTF-8 cannot carry a valid signature).
export const WEBHOOK_BODY_LIMIT = 65536;
export async function readBoundedBody(request, limit = WEBHOOK_BODY_LIMIT) {
  const header = request?.headers?.get?.('content-length');
  if (typeof header !== 'string' || !/^\d{1,10}$/.test(header)) return { tooLarge: true };
  const declared = Number(header);
  if (declared > limit) return { tooLarge: true };
  const bound = Math.min(declared, limit);
  const reader = request.body?.getReader?.();
  const chunks = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > bound) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }; }
  catch { return { invalid: true }; }
}

const WEBHOOK_RPC_TIMEOUT_MS = 2500;
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const isTime = value => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
const shortRef = value => (typeof value === 'string' ? value.slice(0, 200) : null);

// One evidence event as an RPC call, or null for an event that is acknowledged and dropped
// (malformed, unknown kind, not ours). The database writes only for an existing pass or
// lesson and re-checks every bound.
function evidenceCall(provider, event, now) {
  if (!event || typeof event !== 'object' || !isTime(event.at) || Date.parse(event.at) > now + FUTURE_SLACK_MS) return null;
  const at = new Date(event.at).toISOString();
  if (['joined', 'left'].includes(event.kind)) {
    if (!isUuid(event.participantRef)) return null;
    return ['online_record_join_event', { p_jti: event.participantRef, p_kind: event.kind, p_at: at, p_ref: shortRef(event.providerParticipantRef) }];
  }
  if (['started', 'ended'].includes(event.kind)) {
    if (!isUuid(event.lessonRef) || typeof event.sessionName !== 'string' || !event.sessionName || event.sessionName.length > 200) return null;
    return ['online_record_session_event', { p_lesson: event.lessonRef, p_provider: provider, p_kind: event.kind, p_at: at,
      p_session_name: event.sessionName, p_ref: shortRef(event.providerSessionRef) }];
  }
  return null;
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); })]);
  } finally { clearTimeout(timer); }
}

// POST /api/webhooks/online/<provider> — in this order: the webhook gate (404, headers
// only), the size limit (413, before the body), the signature and timestamp (401, before
// any database call), the validation challenge (200, writes nothing), then the events.
// A failed write (error, timeout) answers 503 { reason: 'unavailable' }, the write
// ceiling 429 { reason: 'rate_limited' }: never 200. Events already written stay, and a
// retry writes nothing twice (unique keys). Evidence never writes attendance.
export async function handleWebhook({ provider, request, env, getServiceClient, getProvider, clock = () => Date.now(),
  timeoutMs = WEBHOOK_RPC_TIMEOUT_MS }) {
  const gate = onlineWebhookGate(env, provider, getProvider);
  if (!gate.open) return { status: 404, body: { reason: 'not_found' } };
  const read = await readBoundedBody(request);
  if (read.tooLarge) return refuse('too_large');
  if (read.invalid) return { status: 401, body: { reason: 'forbidden' } };
  let verified;
  try { verified = await gate.adapter.verifyWebhook({ rawBody: read.text, headers: request.headers, secret: env.ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET }); }
  catch { verified = { ok: false }; }
  if (!verified?.ok) return { status: 401, body: { reason: 'forbidden' } };
  // Zoom's endpoint validation challenge (OL-r6 A3): answered only after the signature
  // and timestamp checks above, and it writes nothing.
  if (verified.challenge) return { status: 200, body: { plainToken: verified.challenge.plainToken, encryptedToken: verified.challenge.encryptedToken } };
  const calls = (Array.isArray(verified.events) ? verified.events : []).map(event => evidenceCall(provider, event, clock())).filter(Boolean);
  if (!calls.length) return { status: 200, body: { recorded: 0 } };
  const service = getServiceClient();
  let recorded = 0;
  for (const [name, args] of calls) {
    let outcome;
    try { outcome = await withTimeout(service.rpc(name, args), timeoutMs); }
    catch { outcome = { error: { hint: null } }; }
    if (outcome?.error) {
      const reason = onlineReason(outcome.error.hint) === 'rate_limited' ? 'rate_limited' : 'unavailable';
      // Best effort (D16): a refusal the database cannot record (an outage) goes uncounted.
      try { await withTimeout(service.rpc('online_note_webhook_refusal', { p_deployment: webhookDeployment(env), p_reason: reason }), timeoutMs); }
      catch { /* uncounted */ }
      return refuse(reason);
    }
    if (outcome?.data?.recorded) recorded += 1;
  }
  return { status: 200, body: { recorded } };
}
