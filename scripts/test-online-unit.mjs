// Online learning node regressions (plan OL-r4 test strategy): display labels, the fake
// adapter interface, the live gate, and the join, course, lesson and webhook handlers
// with injected clients. No network, database, secret or e-mail. Run by npm test.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { baseLabel, courseLabels, providerDisplayName } from '../src/lib/online/label.mjs';
import { onlineGate } from '../src/lib/online/gate.mjs';
import { getProvider, ADAPTER_METHODS } from '../src/lib/online/provider/index.mjs';
import { onlineReason, onlineErrorText, ONLINE_REASON_TEXT } from '../src/lib/online/reasons.mjs';
import { handleJoin, handleCourseAction, handleLessonAction, handleWebhook } from '../src/lib/online/handlers.mjs';

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

// Adapter interface with the fake provider.
const fake = getProvider('fake');
assert.equal(getProvider('whereby'), null, 'no real adapter before the provider test (Q12)');
assert.equal(getProvider('__proto__'), null);
for (const method of ADAPTER_METHODS) assert.equal(typeof fake[method], 'function', method);
assert.equal(fake.supportsWebhooks, true);
const room = await fake.createRoom({ courseRef: 'group-1', audience: 'adult' });
assert.match(room.roomRef, /^fake-room-[0-9a-f]{16}$/);
assert.ok(!room.roomRef.includes('://'));
const expiresAt = '2026-10-20T19:40:00.000Z';
const minted = await fake.mintJoinToken({ roomRef: room.roomRef, displayName: 'Amal B.', role: 'participant', expiresAt, participantRef: 'jti-1' });
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
  const closing = userClient({ role: 'admin', rpc: { online_close_course: () => ({ data: { status: 'closed', version: 3, revoked: 2, provider: 'fake', room_ref: 'fake-room-x' }, error: null }) } });
  const close = await handleCourseAction({ action: 'close', body: { group: GROUP, version: 2 }, env: LIVE, getUserClient: async () => closing.client, getProvider });
  assert.deepEqual(close, { status: 200, body: { status: 'closed', version: 3, revoked: 2, provider_closed: true } }); noSecret(close);
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
console.log('PASS online unit regressions: labels, gate, fake adapter, join/activation/lesson/webhook handlers, no secret or address in any response');
