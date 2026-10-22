// Route logic for /api/online/* and /api/webhooks/online/<provider> (plan OL-r4 D6, D7,
// D9, D11). Dependencies are injected so the node tests exercise the same code as the
// route files. Every handler authenticates itself, checks the live gate first and
// answers with a closed { reason } vocabulary only: no raw database or provider text,
// no room reference and no secret ever reaches a response.
import { onlineGate } from './gate.mjs';
import { onlineReason } from './reasons.mjs';
import { providerDisplayName } from './label.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = {
  gate_closed: 503, provider_invalid: 503, provider_error: 502, unauthenticated: 401, not_found: 404,
  forbidden: 403, not_eligible: 403, consent_missing: 403, window_closed: 403, lesson_cancelled: 403,
  course_inactive: 403, student_required: 403, pass_invalid: 403,
  capacity: 409, stale: 409, course_not_draft: 409, course_closed: 409, lesson_past: 409, lesson_overlap: 409,
  lesson_in_use: 409,
};
const refuse = reason => ({ status: STATUS[reason] || 400, body: { reason } });
const isUuid = value => typeof value === 'string' && UUID.test(value);
const isVersion = value => Number.isSafeInteger(value) && value > 0;
// A database refusal carries online.<reason> (or the stale SQLSTATE); anything else is generic.
const fromDatabase = error => refuse(onlineReason(error?.hint) || (error?.code === '40001' ? 'stale' : 'invalid_input'));

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
  const gate = onlineGate(env);
  if (!gate.open) return { failure: refuse(gate.reason) };
  const adapter = getProvider(gate.provider);
  if (!adapter) return { failure: refuse('provider_invalid') };
  return { adapter };
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
  if (roomError || !room?.room_ref) return refuse('pass_invalid');
  if (room.provider !== gate.adapter.id) return refuse('provider_invalid');
  let minted;
  try {
    minted = await gate.adapter.mintJoinToken({ roomRef: room.room_ref, displayName: providerDisplayName(room.display_label),
      role: room.provider_role, expiresAt: room.expires_at, participantRef: pass.jti, lessonRef: body.lesson });
  } catch {
    return refuse('provider_error');
  }
  // The embed descriptor carries whatever the provider's client needs; for a real
  // provider that is its short-lived token, never a durable room address.
  return { status: 200, body: { provider: gate.adapter.id, embed: minted.embed,
    role: room.provider_role, display_label: room.display_label, expires_at: room.expires_at } };
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

// POST /api/webhooks/online/<provider> — signature verified before any write; 404 when
// the gate is off, for another provider name, for an adapter without webhooks, and for
// the fake provider in Production (through the gate).
export async function handleWebhook({ provider, rawBody, headers, env, getServiceClient, getProvider }) {
  const gate = onlineGate(env);
  if (!gate.open || provider !== gate.provider) return { status: 404, body: { reason: 'not_found' } };
  const adapter = getProvider(provider);
  if (!adapter?.supportsWebhooks) return { status: 404, body: { reason: 'not_found' } };
  let verified;
  try { verified = await adapter.verifyWebhook({ rawBody, headers, secret: env.ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET }); }
  catch { verified = { ok: false }; }
  if (!verified?.ok) return { status: 401, body: { reason: 'forbidden' } };
  // Zoom's endpoint validation challenge (OL-r6 A3): answered only after the signature
  // and timestamp checks above, and it writes nothing.
  if (verified.challenge) return { status: 200, body: { plainToken: verified.challenge.plainToken, encryptedToken: verified.challenge.encryptedToken } };
  const service = getServiceClient();
  let recorded = 0;
  for (const event of verified.events || []) {
    if (!isUuid(event.participantRef) || !['joined', 'left'].includes(event.kind) || Number.isNaN(Date.parse(event.at))) continue;
    const { data } = await service.rpc('online_record_join_event', { p_jti: event.participantRef, p_kind: event.kind,
      p_at: new Date(event.at).toISOString(), p_ref: typeof event.providerParticipantRef === 'string' ? event.providerParticipantRef.slice(0, 200) : null });
    if (data?.recorded) recorded += 1;
  }
  return { status: 200, body: { recorded } };
}
