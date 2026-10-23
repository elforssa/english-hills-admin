// Online learning node regressions (plan OL-r4 test strategy, OL-r6 adapter addendum):
// display labels, the fake and Zoom adapters, the live gate, and the join, course, lesson
// and webhook handlers with injected clients. No network, database, real secret or e-mail.
// Run by npm test.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { baseLabel, courseLabels, providerDisplayName } from '../src/lib/online/label.mjs';
import { onlineGate } from '../src/lib/online/gate.mjs';
import { getProvider, ADAPTER_METHODS } from '../src/lib/online/provider/index.mjs';
import { onlineReason, onlineErrorText, ONLINE_REASON_TEXT } from '../src/lib/online/reasons.mjs';
import { handleJoin, handleCourseAction, handleLessonAction, handleWebhook } from '../src/lib/online/handlers.mjs';
import { createZoomVideoProvider, zoomSessionName, ZOOM_SESSION_NAME } from '../src/lib/online/provider/zoom-video.mjs';

// Labels: the same cases as the SQL suite (online_security.base_label).
assert.equal(baseLabel('Amal Bennani'), 'Amal B.');
assert.equal(baseLabel('  amal   el  idrissi '), 'Amal I.');
assert.equal(baseLabel('Élodie'), 'Élodie');
assert.equal(baseLabel('jean-pierre écrivain'), 'Jean-pierre É.');
assert.equal(baseLabel(''), 'Participant');
assert.equal(baseLabel(null), 'Participant');
assert.equal(baseLabel(`${'b'.repeat(40)} z`), `B${'b'.repeat(29)} Z.`);
assert.equal(baseLabel('Ömer\tÇelik'), 'Ömer Ç.');
const labels = courseLabels([{ id: 'b', fullName: 'Amal Berrada' }, { id: 'a', fullName: 'Amal Bennani' }, { id: 'c', fullName: 'Sara Lahlou' }]);
assert.deepEqual([...labels], [['a', 'Amal B.'], ['b', 'Amal B. 2'], ['c', 'Sara L.']]);
assert.equal(providerDisplayName('Amal\u0000 B.\n'), 'Amal B.');
assert.equal(providerDisplayName(''), 'Participant');
assert.equal(Array.from(providerDisplayName('x'.repeat(80))).length, 40);

// Gate: closed unless exactly "true"; fake refused in Production; unknown providers refused.
assert.deepEqual(onlineGate({}), { open: false, reason: 'gate_closed' });
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'TRUE', ONLINE_VIDEO_PROVIDER: 'fake' }), { open: false, reason: 'gate_closed' });
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'true' }), { open: false, reason: 'provider_invalid' });
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'fake', VERCEL_ENV: 'production' }), { open: false, reason: 'provider_invalid' });
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'fake', VERCEL_ENV: 'preview' }), { open: true, provider: 'fake' });
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'zoom' }), { open: false, reason: 'provider_invalid' });
// zoom-video fails closed without both credential variables (A4).
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'zoom-video' }), { open: false, reason: 'provider_invalid' });
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'zoom-video', ONLINE_VIDEO_PROVIDER_API_KEY: 'k' }), { open: false, reason: 'provider_invalid' });
assert.deepEqual(onlineGate({ ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'zoom-video', ONLINE_VIDEO_PROVIDER_API_KEY: 'k', ONLINE_VIDEO_PROVIDER_API_SECRET: 's', VERCEL_ENV: 'production' }),
  { open: true, provider: 'zoom-video' });

// Adapter interface with the fake provider.
const fake = getProvider('fake');
assert.equal(getProvider('whereby'), null, 'only the fake and the chosen provider exist (Q12 = Zoom)');
assert.equal(getProvider('zoom-video')?.id, 'zoom-video');
assert.equal(getProvider('__proto__'), null);
for (const method of ADAPTER_METHODS) assert.equal(typeof fake[method], 'function', method);
assert.equal(fake.supportsWebhooks, true);
const room = await fake.createRoom({ courseRef: 'group-1', audience: 'adult' });
assert.match(room.roomRef, /^fake-room-[0-9a-f]{16}$/);
assert.ok(!room.roomRef.includes('://'));
const expiresAt = '2026-10-20T19:40:00.000Z';
const minted = await fake.mintJoinToken({ roomRef: room.roomRef, displayName: 'Amal B.', role: 'participant', expiresAt, participantRef: 'jti-1', lessonRef: 'l1' });
assert.deepEqual(minted.embed, { kind: 'fake', displayName: 'Amal B.', role: 'participant', expiresAt });
assert.deepEqual(JSON.parse(Buffer.from(minted.token, 'base64url').toString()), { room: room.roomRef, ref: 'jti-1', role: 'participant', exp: expiresAt });
await assert.rejects(fake.mintJoinToken({ roomRef: room.roomRef, displayName: 'x', role: 'admin', expiresAt, participantRef: 'j' }));

// Reasons: closed vocabulary only.
assert.equal(onlineReason('online.capacity'), 'capacity');
assert.equal(onlineReason('online.drop_table'), null);
assert.equal(onlineReason('crm_enrollment.capacity'), null);
assert.equal(onlineErrorText({ hint: 'online.consent_missing', message: 'raw server text' }), ONLINE_REASON_TEXT.consent_missing);
assert.ok(!onlineErrorText({ message: 'raw server text' }).includes('raw'));

// Handlers with injected clients.
const SECRET = 'test-provider-secret-value-0001';
const SERVICE = 'test-service-role-value-0002';
const LIVE = { ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'fake', ONLINE_VIDEO_PROVIDER_API_KEY: SECRET,
  ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET: 'hook-secret', SUPABASE_SERVICE_ROLE_KEY: SERVICE };
const LESSON = '00000000-0000-4000-8000-000000000501', GROUP = '00000000-0000-4000-8000-000000000301', JTI = '00000000-0000-4000-8000-0000000000aa';
function userClient({ user = { id: 'u1' }, role = 'student', rpc = {} } = {}) {
  const calls = [];
  return { calls, client: {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }) }) }),
    rpc: async (name, args) => { calls.push([name, args]); return rpc[name] ? rpc[name](args) : { data: null, error: { code: '42501', hint: 'online.forbidden' } }; },
  } };
}
function serviceClient(rpc = {}, notices = []) {
  const calls = [];
  const table = { updates: [] };
  return { calls, table, client: {
    rpc: async (name, args) => { calls.push([name, args]); return rpc[name] ? rpc[name](args) : { data: null, error: { code: '42501' } }; },
    from: () => ({
      select: () => ({ in: () => ({ eq: () => ({ in: async () => ({ data: notices, error: null }) }) }) }),
      update: values => ({ eq: async (_k, id) => { table.updates.push([id, values]); return { error: null }; } }),
    }),
  } };
}
const noSecret = result => { const text = JSON.stringify(result); assert.ok(!text.includes(SECRET) && !text.includes(SERVICE) && !text.includes('hook-secret') && !text.includes('fake-room-'), text); };

// Join: gate off → 503 with a reason, before any database call.
for (const env of [{}, { ...LIVE, ONLINE_LEARNING_LIVE_ENABLED: 'false' }, { ...LIVE, VERCEL_ENV: 'production' }]) {
  const user = userClient(), service = serviceClient();
  const result = await handleJoin({ body: { lesson: LESSON }, env, getUserClient: async () => user.client, getServiceClient: () => service.client, getProvider });
  assert.equal(result.status, 503); assert.ok(['gate_closed', 'provider_invalid'].includes(result.body.reason));
  assert.equal(user.calls.length + service.calls.length, 0); noSecret(result);
}
{ // Unauthenticated and malformed requests.
  const anon = userClient({ user: null });
  assert.equal((await handleJoin({ body: { lesson: LESSON }, env: LIVE, getUserClient: async () => anon.client, getServiceClient: () => null, getProvider })).status, 401);
  assert.equal((await handleJoin({ body: { lesson: 'x' }, env: LIVE, getUserClient: async () => anon.client, getServiceClient: () => null, getProvider })).body.reason, 'invalid_input');
}
{ // Database refusal passes through as a closed reason only.
  const user = userClient({ rpc: { online_issue_join: () => ({ data: null, error: { code: '42501', hint: 'online.consent_missing', message: 'Accès au cours refusé.' } }) } });
  const result = await handleJoin({ body: { lesson: LESSON }, env: LIVE, getUserClient: async () => user.client, getServiceClient: () => serviceClient().client, getProvider });
  assert.deepEqual(result, { status: 403, body: { reason: 'consent_missing' } });
}
{ // Success: the pass is issued as the caller, the room resolved as the service role, no room reference returned.
  const user = userClient({ rpc: { online_issue_join: () => ({ data: { jti: JTI, provider_role: 'participant' }, error: null }) } });
  const service = serviceClient({ online_resolve_join: () => ({ data: { provider: 'fake', room_ref: 'fake-room-0123456789abcdef', display_label: 'Amal B.\u0007',
    provider_role: 'participant', expires_at: '2026-10-20T19:40:00.000Z' }, error: null }) });
  const result = await handleJoin({ body: { lesson: LESSON, student: null }, env: LIVE, getUserClient: async () => user.client, getServiceClient: () => service.client, getProvider });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { provider: 'fake', embed: { kind: 'fake', displayName: 'Amal B.', role: 'participant', expiresAt: '2026-10-20T19:40:00.000Z' },
    role: 'participant', display_label: 'Amal B.\u0007', expires_at: '2026-10-20T19:40:00.000Z' });
  assert.deepEqual(user.calls, [['online_issue_join', { p_lesson: LESSON, p_student: null }]]);
  assert.deepEqual(service.calls, [['online_resolve_join', { p_jti: JTI }]]);
  noSecret(result);
}
{ // A course activated with another provider than the configured one is refused.
  const user = userClient({ rpc: { online_issue_join: () => ({ data: { jti: JTI }, error: null }) } });
  const service = serviceClient({ online_resolve_join: () => ({ data: { provider: 'daily', room_ref: 'r1', display_label: 'A', provider_role: 'participant', expires_at: 'x' }, error: null }) });
  assert.equal((await handleJoin({ body: { lesson: LESSON }, env: LIVE, getUserClient: async () => user.client, getServiceClient: () => service.client, getProvider })).body.reason, 'provider_invalid');
}

// Activation route: refused with the gate off and for the fake provider in Production, before any provider call.
let created = 0;
const countingProvider = name => name === 'fake' ? { ...fake, createRoom: async a => { created += 1; return fake.createRoom(a); }, closeRoom: async () => ({}) } : null;
for (const env of [{}, { ...LIVE, VERCEL_ENV: 'production' }]) {
  const user = userClient({ role: 'director' });
  const result = await handleCourseAction({ action: 'activate', body: { group: GROUP, version: 1 }, env, getUserClient: async () => user.client, getProvider: countingProvider });
  assert.equal(result.status, 503); assert.equal(created, 0); assert.equal(user.calls.length, 0);
}
{ // Receptionist and teacher never reach the provider.
  for (const role of ['receptionist', 'teacher', 'parent']) {
    const user = userClient({ role });
    const result = await handleCourseAction({ action: 'activate', body: { group: GROUP, version: 1 }, env: LIVE, getUserClient: async () => user.client, getProvider: countingProvider });
    assert.deepEqual(result, { status: 403, body: { reason: 'forbidden' } }); assert.equal(created, 0);
  }
}
{ // Director: room created, opaque reference stored by the RPC; a refused RPC closes the room again.
  const user = userClient({ role: 'director', rpc: { online_activate_course: args => ({ data: { status: 'active', version: 2, ...(args.p_room_ref ? {} : {}) }, error: null }) } });
  const result = await handleCourseAction({ action: 'activate', body: { group: GROUP, version: 1 }, env: LIVE, getUserClient: async () => user.client, getProvider: countingProvider });
  assert.deepEqual(result, { status: 200, body: { status: 'active', version: 2 } }); assert.equal(created, 1);
  assert.match(user.calls[0][1].p_room_ref, /^fake-room-/); assert.equal(user.calls[0][1].p_provider, 'fake'); noSecret(result);
  let closed = 0;
  const stale = userClient({ role: 'director', rpc: { online_activate_course: () => ({ data: null, error: { code: '40001', hint: 'online.stale' } }) } });
  const refused = await handleCourseAction({ action: 'activate', body: { group: GROUP, version: 1 }, env: LIVE, getUserClient: async () => stale.client,
    getProvider: () => ({ ...fake, closeRoom: async () => { closed += 1; } }) });
  assert.deepEqual(refused, { status: 409, body: { reason: 'stale' } }); assert.equal(closed, 1);
  // Close (N1, migration 118): the RPC returns no room reference; the route resolves it as the
  // service role and closes the provider room; the caller sees only the outcome.
  let roomsClosed = [];
  const closing = userClient({ role: 'admin', rpc: { online_close_course: () => ({ data: { status: 'closed', version: 3, revoked: 2 }, error: null }) } });
  const resolver = serviceClient({ online_resolve_room: () => ({ data: { provider: 'fake', room_ref: 'fake-room-x', status: 'closed' }, error: null }) });
  const close = await handleCourseAction({ action: 'close', body: { group: GROUP, version: 2 }, env: LIVE, getUserClient: async () => closing.client,
    getServiceClient: () => resolver.client, getProvider: name => name === 'fake' ? { ...fake, closeRoom: async ref => { roomsClosed.push(ref); return { closed: true }; } } : null });
  assert.deepEqual(close, { status: 200, body: { status: 'closed', version: 3, revoked: 2, provider_closed: true } }); noSecret(close);
  assert.deepEqual(roomsClosed, ['fake-room-x']); assert.deepEqual(resolver.calls, [['online_resolve_room', { p_group: GROUP }]]);
  const otherProvider = serviceClient({ online_resolve_room: () => ({ data: { provider: 'daily', room_ref: 'r', status: 'closed' }, error: null }) });
  roomsClosed = [];
  const mismatch = await handleCourseAction({ action: 'close', body: { group: GROUP, version: 2 }, env: LIVE, getUserClient: async () => userClient({ role: 'admin', rpc: { online_close_course: () => ({ data: { status: 'closed', version: 3, revoked: 0 }, error: null }) } }).client,
    getServiceClient: () => otherProvider.client, getProvider });
  assert.deepEqual(mismatch.body, { status: 'closed', version: 3, revoked: 0, provider_closed: false }); assert.deepEqual(roomsClosed, []);
  const refusedClose = await handleCourseAction({ action: 'close', body: { group: GROUP, version: 9 }, env: LIVE, getUserClient: async () => userClient({ role: 'admin', rpc: { online_close_course: () => ({ data: null, error: { code: '40001' } }) } }).client,
    getServiceClient: () => { throw new Error('must not resolve after a refused close'); }, getProvider });
  assert.deepEqual(refusedClose, { status: 409, body: { reason: 'stale' } });
}

// Lesson actions: gate, roles, and e-mails sent server-side to addresses never returned.
{
  const off = await handleLessonAction({ action: 'cancel', body: { lesson: LESSON, version: 1, scope: 'this', reason: 'x' }, env: {}, getUserClient: async () => { throw Error('no'); } });
  assert.deepEqual(off, { status: 503, body: { reason: 'gate_closed' } });
  const teacher = userClient({ role: 'teacher' });
  assert.equal((await handleLessonAction({ action: 'cancel', body: { lesson: LESSON, version: 1, scope: 'this', reason: 'x' }, env: LIVE, getUserClient: async () => teacher.client, getProvider })).status, 403);
  assert.equal(teacher.calls.length, 0, 'a teacher never triggers the command');
  const ids = ['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2'];
  const user = userClient({ role: 'receptionist', rpc: { online_cancel_lesson: () => ({ data: { cancelled: 1, version: 2, notification_ids: ids }, error: null }) } });
  const service = serviceClient({}, [{ id: ids[0], recipient_email: 'family1@example.test', subject: 'S', message: 'M' },
    { id: ids[1], recipient_email: 'family2@example.test', subject: 'S', message: 'M' }]);
  const sent = [];
  const result = await handleLessonAction({ action: 'cancel', body: { lesson: LESSON, version: 1, scope: 'this', reason: 'Malade' }, env: LIVE,
    getUserClient: async () => user.client, getServiceClient: () => service.client, getProvider,
    sendEmail: async (to, subject) => { if (to === 'family2@example.test') throw Error('down'); sent.push([to, subject]); } });
  assert.deepEqual(result, { status: 200, body: { cancelled: 1, version: 2, notified: 2, emailed: 1, failed: 1 } });
  assert.deepEqual(sent, [['family1@example.test', 'S']]);
  assert.deepEqual(service.table.updates.map(([id, v]) => [id, v.sent ?? null, v.error]), [[ids[0], true, null], [ids[1], null, 'delivery_failed']]);
  assert.ok(!JSON.stringify(result).includes('@'), 'no address in the response');
  assert.equal((await handleLessonAction({ action: 'delete', body: {}, env: LIVE })).status, 404);
}

// Webhook: 404 unless gate on, same provider and webhook support; bad signature writes nothing.
{
  const body = JSON.stringify({ events: [{ participant_ref: JTI, kind: 'joined', at: '2026-10-20T18:02:00Z' }] });
  const signed = new Headers({ 'x-online-signature': createHmac('sha256', 'hook-secret').update(body).digest('hex') });
  const run = (provider, env, headers = signed, service = serviceClient({ online_record_join_event: () => ({ data: { recorded: true }, error: null }) })) =>
    handleWebhook({ provider, rawBody: body, headers, env, getServiceClient: () => service.client, getProvider }).then(r => ({ r, service }));
  for (const [provider, env] of [['fake', {}], ['fake', { ...LIVE, VERCEL_ENV: 'production' }], ['daily', LIVE], ['whereby', { ...LIVE, ONLINE_VIDEO_PROVIDER: 'whereby' }]]) {
    const { r, service } = await run(provider, env);
    assert.equal(r.status, 404, `${provider} ${JSON.stringify(env)}`); assert.equal(service.calls.length, 0);
  }
  const bad = await run('fake', LIVE, new Headers({ 'x-online-signature': 'f'.repeat(64) }));
  assert.equal(bad.r.status, 401); assert.equal(bad.service.calls.length, 0, 'bad signature writes nothing');
  const unsigned = await run('fake', { ...LIVE, ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET: '' });
  assert.equal(unsigned.r.status, 401); assert.equal(unsigned.service.calls.length, 0, 'no secret, no write');
  const good = await run('fake', LIVE);
  assert.deepEqual(good.r, { status: 200, body: { recorded: 1 } });
  assert.deepEqual(good.service.calls, [['online_record_join_event', { p_jti: JTI, p_kind: 'joined', p_at: '2026-10-20T18:02:00.000Z', p_ref: null }]]);
}
// Zoom Video SDK adapter (OL-r6 A1, A2, A3, A4, A7): session JWT, session name, webhook.
{
  const ZK = 'zoom-sdk-key-test-0001', ZS = 'zoom-sdk-secret-test-0002', HOOK = 'zoom-hook-secret-test-0003';
  const NOW = Date.parse('2026-10-22T18:00:00.000Z');
  const zoom = createZoomVideoProvider({ ONLINE_VIDEO_PROVIDER_API_KEY: ZK, ONLINE_VIDEO_PROVIDER_API_SECRET: ZS }, () => NOW);
  assert.equal(zoom.supportsWebhooks, true); assert.equal(zoom.supportsRevoke, false, 'Zoom cannot revoke an issued token (D6 residual case)');
  const zroom = await zoom.createRoom({ courseRef: GROUP, audience: 'adult' });
  assert.match(zroom.roomRef, /^eh-[0-9a-f]{24}$/); assert.ok(zroom.roomRef.length <= 40);
  // Session name per lesson: lowercased, bounded, refused outside Zoom's alphabet.
  assert.equal(zoomSessionName('EH-ABC', 'A1B2-C3D4'), 'eh-abc.a1b2-c3d4');
  assert.equal(zoomSessionName(zroom.roomRef, LESSON), `${zroom.roomRef}.${LESSON}`);
  assert.ok(zoomSessionName(zroom.roomRef, LESSON).length <= 77 && ZOOM_SESSION_NAME.test(zoomSessionName(zroom.roomRef, LESSON)));
  assert.throws(() => zoomSessionName('x'.repeat(41), LESSON)); assert.throws(() => zoomSessionName('room/x', LESSON)); assert.throws(() => zoomSessionName('eh-1', 'lesson name'));
  assert.throws(() => zoomSessionName('://eh', LESSON));
  const decode = token => { const [h, p] = token.split('.'); return { header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(p, 'base64url')) }; };
  const verify = token => { const [h, p, sig] = token.split('.'); return createHmac('sha256', ZS).update(`${h}.${p}`).digest('base64url') === sig; };
  // A pass expiring in 70 minutes: exp equals the pass expiry.
  const far = await zoom.mintJoinToken({ roomRef: zroom.roomRef, displayName: 'Amal B.', role: 'participant', expiresAt: new Date(NOW + 70 * 60000).toISOString(), participantRef: JTI, lessonRef: LESSON });
  const { header, claims } = decode(far.token);
  assert.deepEqual(header, { alg: 'HS256', typ: 'JWT' }); assert.ok(verify(far.token), 'signed with the SDK secret');
  assert.equal(claims.app_key, ZK); assert.equal(claims.tpc, `${zroom.roomRef}.${LESSON}`); assert.equal(claims.role_type, 0); assert.equal(claims.version, 1);
  assert.equal(claims.user_key, JTI); assert.equal(claims.iat, Math.floor(NOW / 1000) - 30); assert.equal(claims.exp, Math.floor(NOW / 1000) + 70 * 60);
  assert.equal(claims.video_webrtc_mode, 1); assert.equal(claims.audio_webrtc_mode, 1);
  assert.ok(!('telemetry_tracking_id' in claims), 'telemetry correlation id never set (A7)');
  assert.deepEqual(Object.keys(claims).sort(), ['app_key', 'audio_webrtc_mode', 'exp', 'iat', 'role_type', 'tpc', 'user_key', 'version', 'video_webrtc_mode']);
  assert.ok(!far.token.includes(ZS) && !JSON.stringify(far.embed).includes(ZS), 'the secret is not in the token or the embed');
  assert.deepEqual(far.embed, { kind: 'zoom-video', sessionName: claims.tpc, token: far.token, displayName: 'Amal B.', role: 'participant',
    expiresAt: new Date(NOW + 70 * 60000).toISOString(), tokenExpiresAt: new Date(claims.exp * 1000).toISOString() });
  // A pass expiring in 10 minutes: Zoom's 1800-second floor applies (A1); the pass expiry is kept beside it.
  const near = await zoom.mintJoinToken({ roomRef: zroom.roomRef, displayName: 'Sara L.', role: 'host', expiresAt: new Date(NOW + 10 * 60000).toISOString(), participantRef: JTI, lessonRef: LESSON });
  const nearClaims = decode(near.token).claims;
  assert.equal(nearClaims.role_type, 1); assert.equal(nearClaims.exp, nearClaims.iat + 1800); assert.equal(near.embed.expiresAt, new Date(NOW + 10 * 60000).toISOString());
  assert.equal(near.embed.tokenExpiresAt, new Date((nearClaims.iat + 1800) * 1000).toISOString());
  await assert.rejects(zoom.mintJoinToken({ roomRef: zroom.roomRef, displayName: 'x', role: 'participant', expiresAt: new Date(NOW + 60000).toISOString(), participantRef: JTI }), /Incomplete/, 'lessonRef is required (A2)');
  await assert.rejects(zoom.mintJoinToken({ roomRef: zroom.roomRef, displayName: 'x', role: 'admin', expiresAt: new Date(NOW + 60000).toISOString(), participantRef: JTI, lessonRef: LESSON }));
  await assert.rejects(zoom.mintJoinToken({ roomRef: zroom.roomRef, displayName: 'x', role: 'participant', expiresAt: new Date(NOW + 49 * 3600000).toISOString(), participantRef: JTI, lessonRef: LESSON }), /too far/);
  await assert.rejects(zoom.mintJoinToken({ roomRef: zroom.roomRef, displayName: 'x', role: 'participant', expiresAt: new Date(NOW + 60000).toISOString(), participantRef: 'x'.repeat(37), lessonRef: LESSON }));
  await assert.rejects(createZoomVideoProvider({}).mintJoinToken({ roomRef: zroom.roomRef, displayName: 'x', role: 'participant', expiresAt: new Date(NOW + 60000).toISOString(), participantRef: JTI, lessonRef: LESSON }), /credentials missing/);
  assert.deepEqual(await zoom.closeRoom(zroom.roomRef), { closed: true });
  // Webhook (A3, B2): signature over v0:{timestamp}:{raw body}, five-minute window, bounded plainToken.
  const ts = String(Math.floor(NOW / 1000));
  const sign = (body, when = ts, secret = HOOK) => new Headers({ 'x-zm-request-timestamp': when, 'x-zm-signature': 'v0=' + createHmac('sha256', secret).update(`v0:${when}:${body}`).digest('hex') });
  const challenge = JSON.stringify({ event: 'endpoint.url_validation', payload: { plainToken: 'qgg8vlvZRS6UYooatFL8Aw' }, event_ts: NOW });
  const unsigned = await zoom.verifyWebhook({ rawBody: challenge, headers: new Headers({ 'x-zm-request-timestamp': ts }), secret: HOOK });
  assert.deepEqual(unsigned, { ok: false, events: [] }, 'unsigned challenge refused');
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: challenge, headers: sign(challenge, ts, 'wrong-secret'), secret: HOOK }), { ok: false, events: [] }, 'forged signature refused');
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: challenge, headers: new Headers({ 'x-zm-request-timestamp': ts, 'x-zm-signature': 'v0=' + 'a'.repeat(64) }), secret: HOOK }), { ok: false, events: [] }, 'right shape, wrong hash');
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: challenge, headers: sign(challenge, String(Number(ts) - 360)), secret: HOOK }), { ok: false, events: [] }, 'six-minute-old timestamp refused');
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: challenge, headers: sign(challenge), secret: '' }), { ok: false, events: [] }, 'no secret, nothing verified');
  const longToken = JSON.stringify({ event: 'endpoint.url_validation', payload: { plainToken: 'a'.repeat(65) } });
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: longToken, headers: sign(longToken), secret: HOOK }), { ok: false, events: [] }, 'over-long plainToken refused');
  const badToken = JSON.stringify({ event: 'endpoint.url_validation', payload: { plainToken: 'bad token!' } });
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: badToken, headers: sign(badToken), secret: HOOK }), { ok: false, events: [] }, 'malformed plainToken refused');
  const good = await zoom.verifyWebhook({ rawBody: challenge, headers: sign(challenge, String(Number(ts) - 200)), secret: HOOK });
  assert.deepEqual(good, { ok: true, events: [], challenge: { plainToken: 'qgg8vlvZRS6UYooatFL8Aw', encryptedToken: createHmac('sha256', HOOK).update('qgg8vlvZRS6UYooatFL8Aw').digest('hex') } });
  // Events: user_key maps back to the pass; other events verify but carry nothing.
  const joined = JSON.stringify({ event: 'session.user_joined', payload: { account_id: 'a', object: { id: 's1', session_id: 's1', session_name: claims.tpc,
    user: { id: '16778240', name: 'Amal B.', participant_uuid: 'p-uuid-1', join_time: '2026-10-22T18:02:00Z', user_key: JTI } } }, event_ts: NOW });
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: joined, headers: sign(joined), secret: HOOK }),
    { ok: true, events: [{ participantRef: JTI, kind: 'joined', at: '2026-10-22T18:02:00Z', providerParticipantRef: 'p-uuid-1' }] });
  const left = JSON.stringify({ event: 'session.user_left', payload: { object: { user: { user_key: JTI, leave_time: '2026-10-22T19:00:00Z', leave_reason: 'Removed by host.' } } } });
  assert.deepEqual((await zoom.verifyWebhook({ rawBody: left, headers: sign(left), secret: HOOK })).events, [{ participantRef: JTI, kind: 'left', at: '2026-10-22T19:00:00Z', providerParticipantRef: null }]);
  const started = JSON.stringify({ event: 'session.started', payload: { object: { id: 's1' } } });
  assert.deepEqual(await zoom.verifyWebhook({ rawBody: started, headers: sign(started), secret: HOOK }), { ok: true, events: [] });
  // The webhook handler answers the challenge after verification, without any write, and 404s off-gate.
  const ZLIVE = { ONLINE_LEARNING_LIVE_ENABLED: 'true', ONLINE_VIDEO_PROVIDER: 'zoom-video', ONLINE_VIDEO_PROVIDER_API_KEY: ZK, ONLINE_VIDEO_PROVIDER_API_SECRET: ZS, ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET: HOOK };
  const zoomProvider = name => name === 'zoom-video' ? zoom : null;
  const serviceCalls = [];
  const svc = { rpc: async (name, args) => { serviceCalls.push([name, args]); return { data: { recorded: true }, error: null }; } };
  const answered = await handleWebhook({ provider: 'zoom-video', rawBody: challenge, headers: sign(challenge), env: ZLIVE, getServiceClient: () => svc, getProvider: zoomProvider });
  assert.deepEqual(answered, { status: 200, body: good.challenge }); assert.equal(serviceCalls.length, 0, 'the challenge writes nothing');
  assert.equal((await handleWebhook({ provider: 'zoom-video', rawBody: challenge, headers: new Headers(), env: ZLIVE, getServiceClient: () => svc, getProvider: zoomProvider })).status, 401);
  assert.equal((await handleWebhook({ provider: 'zoom-video', rawBody: challenge, headers: sign(challenge), env: { ...ZLIVE, ONLINE_LEARNING_LIVE_ENABLED: '' }, getServiceClient: () => svc, getProvider: zoomProvider })).status, 404, 'gate off: 404, no validation');
  assert.equal((await handleWebhook({ provider: 'fake', rawBody: challenge, headers: sign(challenge), env: ZLIVE, getServiceClient: () => svc, getProvider })).status, 404, 'other provider path: 404');
  const recorded = await handleWebhook({ provider: 'zoom-video', rawBody: joined, headers: sign(joined), env: ZLIVE, getServiceClient: () => svc, getProvider: zoomProvider });
  assert.deepEqual(recorded, { status: 200, body: { recorded: 1 } });
  assert.deepEqual(serviceCalls, [['online_record_join_event', { p_jti: JTI, p_kind: 'joined', p_at: '2026-10-22T18:02:00.000Z', p_ref: 'p-uuid-1' }]]);
  assert.ok(!JSON.stringify([answered, recorded]).includes(HOOK) && !JSON.stringify([answered, recorded]).includes(ZS));
  // Join through the handler with the Zoom adapter: the lesson id becomes the session suffix; the room reference never leaves.
  const user = userClient({ rpc: { online_issue_join: () => ({ data: { jti: JTI, provider_role: 'participant' }, error: null }) } });
  const service = serviceClient({ online_resolve_join: () => ({ data: { provider: 'zoom-video', room_ref: zroom.roomRef, display_label: 'Amal B.', provider_role: 'participant', expires_at: new Date(NOW + 70 * 60000).toISOString() }, error: null }) });
  const joinResult = await handleJoin({ body: { lesson: LESSON }, env: ZLIVE, getUserClient: async () => user.client, getServiceClient: () => service.client, getProvider: zoomProvider });
  assert.equal(joinResult.status, 200); assert.equal(joinResult.body.provider, 'zoom-video'); assert.equal(joinResult.body.embed.kind, 'zoom-video');
  assert.equal(decode(joinResult.body.embed.token).claims.tpc, `${zroom.roomRef}.${LESSON}`.toLowerCase());
  assert.ok(!JSON.stringify(joinResult).includes(ZS) && !JSON.stringify(joinResult).includes('"room_ref"'), 'no secret, no room reference field in the join response');
}

console.log('PASS online unit regressions: labels, gate, fake and Zoom adapters, session names, webhook challenge, join/activation/close/lesson/webhook handlers, no secret, room reference or address in any response');
