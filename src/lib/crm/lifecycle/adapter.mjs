import { createHash } from 'node:crypto';
import { boundedBody } from '../meta/protocol.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export function prepareLifecyclePayload(delivery) {
  if (delivery.payload) return delivery.payload;
  const { mapping, matching, event_kind, event_id, event_time, source_generated_time } = delivery;
  if (!['mock', 'live'].includes(mapping?.mode) || matching?.adult_contact !== true || !mapping.events?.[event_kind]) throw new Error('configuration_missing');
  if (!Number.isSafeInteger(event_time) || event_time <= 0) throw new Error('invalid_event_time');
  const user = {};
  if (/^[0-9]{1,32}$/.test(matching.lead_id || '')) user.lead_id = matching.lead_id;
  if (mapping.mode === 'live') {
    if (!user.lead_id || Object.keys(user).length !== 1) throw new Error('invalid_identity');
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(source_generated_time) || source_generated_time <= 0 || event_time < source_generated_time
      || event_time > nowSeconds || !Number.isSafeInteger(mapping.maximum_event_age_seconds)
      || event_time + mapping.maximum_event_age_seconds <= nowSeconds + 8) throw new Error('invalid_event_time');
    const expectedEvents = { intake: 'Intake', not_qualified: 'Not qualified', lost: 'Lost', qualified: 'Qualified', converted: 'Converted' };
    if (mapping.lifecycle_model !== 'r4_stage_entry' || mapping.uncertainty_policy !== 'no_uncertain_replay'
      || mapping.action_source !== 'system_generated' || mapping.maximum_event_age_seconds > 604800
      || Object.keys(mapping.events || {}).length !== 5 || Object.entries(expectedEvents).some(([key, value]) => mapping.events?.[key] !== value)
      || JSON.stringify(mapping.required_constants) !== JSON.stringify({ event_source: 'crm', lead_event_source: 'English Hills CRM' })) throw new Error('configuration_missing');
    return { data: [{
      event_name: mapping.events[event_kind], event_id, event_time,
      action_source: mapping.action_source, user_data: user,
      custom_data: { event_source: 'crm', lead_event_source: 'English Hills CRM' },
    }] };
  }
  for (const key of ['fbc', 'fbp']) if (typeof matching[key] === 'string' && matching[key].length <= 256 && !/[\u0000-\u001f\u007f]/.test(matching[key])) user[key] = matching[key];
  // Only the contact envelope is supplied by the protected RPC. Never learner data.
  if (typeof matching.email === 'string') {
    const email = matching.email.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) user.em = [hash(email)];
  }
  if (/^\+[1-9][0-9]{7,14}$/.test(matching.phone || '')) user.ph = [hash(matching.phone.slice(1))];
  if (!user.lead_id && !user.fbc && !user.fbp) throw new Error('invalid_identity');
  return { data: [{ event_name: mapping.events[event_kind], event_id, event_time, action_source: mapping.action_source, user_data: user }] };
}
async function postLifecycle({ mapping, payload, token, fetchImpl, timeoutMs = 8000 }) {
  if (typeof fetchImpl !== 'function') throw new Error('live_not_available');
  if (!/^v[0-9]{1,3}\.0$/.test(mapping.api_version) || !/^[0-9]{1,32}$/.test(mapping.dataset_id) || !token || JSON.stringify(payload).length > 8192) throw new Error('configuration_missing');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://graph.facebook.com/${mapping.api_version}/${mapping.dataset_id}/events`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal, redirect: 'error', cache: 'no-store'
    });
    const base = { http_status: response.status };
    if (response.status === 429) {
      if (mapping.mode === 'live') return { ...base, outcome: 'unknown', error_code: 'rate_limit' };
      const header = response.headers.get('retry-after');
      const seconds = /^\d+$/.test(header || '') ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
      return { ...base, outcome: 'retry', error_code: 'rate_limit', ...(Number.isFinite(seconds) ? { retry_after: Math.min(86400, Math.max(30, seconds)) } : {}) };
    }
    if ([401, 403].includes(response.status)) return { ...base, outcome: 'blocked', error_code: 'provider_auth' };
    if (response.status >= 500) return { ...base, outcome: mapping.mode === 'live' ? 'unknown' : 'retry', error_code: 'provider_unavailable' };
    let body;
    try { body = JSON.parse((await boundedBody(response, 16384)).toString('utf8')); }
    catch { return { ...base, outcome: response.ok ? 'unknown' : 'dead', error_code: response.ok ? 'malformed_response' : 'validation' }; }
    if (mapping.mode === 'live' && response.ok && body?.error) return { ...base, outcome: 'unknown', error_code: 'malformed_response' };
    if ([4, 17, 32, 613].includes(body?.error?.code)) return { ...base, outcome: mapping.mode === 'live' ? 'unknown' : 'retry', error_code: 'rate_limit' };
    if (body?.error) {
      const auth = mapping.mode === 'live'
        ? [102, 190].includes(body.error.code) || body.error.code === 10 || (body.error.code >= 200 && body.error.code <= 299)
        : [102, 190, 10, 200].includes(body.error.code);
      const transient = body.error.is_transient || (mapping.mode === 'live' && [1, 2].includes(body.error.code));
      return { ...base, outcome: auth ? 'blocked' : transient ? mapping.mode === 'live' ? 'unknown' : 'retry' : 'dead',
        error_code: auth ? 'provider_auth' : transient ? 'provider_unavailable' : 'validation' };
    }
    if (!response.ok) return { ...base, outcome: 'dead', error_code: 'validation' };
    const acceptedField = mapping.mode === 'live' ? mapping.accepted_response_field : 'events_received';
    const acceptedCount = mapping.mode === 'live' ? mapping.accepted_response_count : 1;
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(acceptedField || '') || body?.[acceptedField] !== acceptedCount) return { ...base, outcome: 'unknown', error_code: 'malformed_response' };
    return { ...base, outcome: 'sent', ...(/^[A-Za-z0-9_-]{1,100}$/.test(body.fbtrace_id || '') ? { request_id: body.fbtrace_id } : {}) };
  } catch { return { outcome: 'unknown', error_code: controller.signal.aborted ? 'timeout' : 'network' }; }
  finally { clearTimeout(timer); }
}

// Phase 10 fixture behavior remains injected and cannot fall through to live fetch.
export async function postLifecycleFixture({ mapping, payload, token, mockFetch, timeoutMs = 8000 }) {
  if (mapping?.mode !== 'mock' || typeof mockFetch !== 'function') throw new Error('live_not_available');
  return postLifecycle({ mapping, payload, token, fetchImpl: mockFetch, timeoutMs });
}

// Live callers must come through a server-only module and a separately checked gate.
export async function postLifecycleLive({ mapping, payload, token, fetchImpl, timeoutMs = 8000 }) {
  if (mapping?.mode !== 'live' || typeof fetchImpl !== 'function') throw new Error('live_not_available');
  return postLifecycle({ mapping, payload, token, fetchImpl, timeoutMs });
}
