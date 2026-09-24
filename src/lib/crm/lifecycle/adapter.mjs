import { createHash } from 'node:crypto';
import { boundedBody } from '../meta/protocol.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export function prepareLifecyclePayload(delivery) {
  if (delivery.payload) return delivery.payload;
  const { mapping, matching, event_kind, event_id, event_time } = delivery;
  if (mapping?.mode !== 'mock' || matching?.adult_contact !== true || !mapping.events?.[event_kind]) throw new Error('configuration_missing');
  const user = {};
  if (/^[0-9]{1,32}$/.test(matching.lead_id || '')) user.lead_id = matching.lead_id;
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
// Deliberately no default/global fetch: Phase 10 accepts only injected fixture I/O.
// Current event names, Graph version and CRM action_source remain activation checks.
export async function postLifecycleFixture({ mapping, payload, token, mockFetch, timeoutMs = 8000 }) {
  if (mapping?.mode !== 'mock' || typeof mockFetch !== 'function') throw new Error('live_not_available');
  if (!/^v[0-9]{1,3}\.0$/.test(mapping.api_version) || !/^[0-9]{1,32}$/.test(mapping.dataset_id) || !token || JSON.stringify(payload).length > 8192) throw new Error('configuration_missing');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await mockFetch(`https://graph.facebook.com/${mapping.api_version}/${mapping.dataset_id}/events`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal, redirect: 'error', cache: 'no-store'
    });
    const base = { http_status: response.status };
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const seconds = /^\d+$/.test(header || '') ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
      return { ...base, outcome: 'retry', error_code: 'rate_limit', ...(Number.isFinite(seconds) ? { retry_after: Math.min(86400, Math.max(30, seconds)) } : {}) };
    }
    if ([401, 403].includes(response.status)) return { ...base, outcome: 'blocked', error_code: 'provider_auth' };
    if (response.status >= 500) return { ...base, outcome: 'retry', error_code: 'provider_unavailable' };
    let body;
    try { body = JSON.parse((await boundedBody(response, 16384)).toString('utf8')); }
    catch { return { ...base, outcome: response.ok ? 'unknown' : 'dead', error_code: response.ok ? 'malformed_response' : 'validation' }; }
    if ([4, 17, 32, 613].includes(body?.error?.code)) return { ...base, outcome: 'retry', error_code: 'rate_limit' };
    if (body?.error) return { ...base, outcome: [102, 190, 10, 200].includes(body.error.code) ? 'blocked' : body.error.is_transient ? 'retry' : 'dead',
      error_code: [102, 190, 10, 200].includes(body.error.code) ? 'provider_auth' : body.error.is_transient ? 'provider_unavailable' : 'validation' };
    if (!response.ok) return { ...base, outcome: 'dead', error_code: 'validation' };
    if (body?.events_received !== 1) return { ...base, outcome: 'unknown', error_code: 'malformed_response' };
    return { ...base, outcome: 'sent', ...(/^[A-Za-z0-9_-]{1,100}$/.test(body.fbtrace_id || '') ? { request_id: body.fbtrace_id } : {}) };
  } catch { return { outcome: 'unknown', error_code: controller.signal.aborted ? 'timeout' : 'network' }; }
  finally { clearTimeout(timer); }
}
