// Server/test module: deliberately no default transport and no global fetch.
// Live transport must be separately reviewed after provider/account verification.
const fail = (code) => { throw new Error(code); };
const id = (v) => typeof v === 'string' && /^[0-9]{1,32}$/.test(v) ? v : fail('invalid_data');
const text = (v, max = 300) => v == null ? null : typeof v === 'string' && v.length <= max ? v : fail('invalid_data');
const integer = (v) => v == null ? null : (typeof v === 'string' || (typeof v === 'number' && Number.isSafeInteger(v))) && /^\d{1,19}$/.test(String(v)) && BigInt(v) <= 9223372036854775807n ? String(v) : fail('invalid_data');
const decimal = (v) => typeof v === 'string' && /^\d{1,12}(\.\d{1,6})?$/.test(v) ? v : fail('invalid_data');
const date = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v).toISOString().slice(0, 10) === v ? v : fail('invalid_data');

export async function fetchInsightsFixture({ config, from, to, token, mockFetch }) {
  if (typeof window !== 'undefined' || typeof mockFetch !== 'function' || config.mode !== 'mock') fail('live_not_available');
  const account = id(config.account_id);
  if (!/^v\d{1,3}\.0$/.test(config.api_version) || !token) fail('missing_secret');
  date(from); date(to);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 30) fail('invalid_data');
  const rows = [], objects = [], grains = new Set(), identities = new Set();
  let bytes = 0, calls = 0;
  async function request(path, params = {}) {
    if (++calls > 100) fail('limit_exceeded');
    const url = new URL(`https://graph.facebook.com/${config.api_version}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await mockFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: controller.signal });
          if (response.status === 429) fail('rate_limit');
          if ([401, 403].includes(response.status)) fail('provider_auth');
          if (response.status >= 500) fail('provider_unavailable');
          if (!response.ok || response.redirected) fail('invalid_data');
          // Stream the body with a global bound; don't buffer unlimited provider data.
          const reader = response.body?.getReader();
          if (!reader) fail('invalid_data');
          const decoder = new TextDecoder(); let body = '';
          while (true) {
            const part = await reader.read(); if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 4194304) { await reader.cancel(); fail('limit_exceeded'); }
            body += decoder.decode(part.value, { stream: true });
          }
          body += decoder.decode();
          let data; try { data = JSON.parse(body); } catch { fail('invalid_data'); }
          if (!data || typeof data !== 'object' || Array.isArray(data)) fail('invalid_data');
          if (data.error) fail(data.error.code === 190 ? 'provider_auth' : 'invalid_data');
          return data;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 10000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function pages(path, params, accept, first) {
    let after; const cursors = new Set();
    for (let page = 0; page < 30; page++) {
      const data = page === 0 && first ? first : await request(path, { ...params, ...(after ? { after } : {}) });
      if (!Array.isArray(data.data)) fail('invalid_data');
      for (const row of data.data) accept(row);
      if (!data.paging?.next) return;
      // Ignore provider URLs entirely; reconstruct the fixed host/path with cursor only.
      after = data.paging?.cursors?.after;
      if (typeof after !== 'string' || after.length > 500 || !after || cursors.has(after)) fail('invalid_data');
      cursors.add(after);
    }
    fail('limit_exceeded');
  }
  try {
    const metadata = await request(`act_${account}`, { fields: 'account_id,currency,timezone_name' });
    if (metadata.account_id !== account || metadata.currency !== config.currency || metadata.timezone_name !== config.timezone) fail('invalid_data');
    for (const [edge, type, fields] of [
      ['campaigns', 'campaign', 'id,account_id,name,objective,effective_status'],
      ['adsets', 'adset', 'id,account_id,name,campaign_id,effective_status'],
      ['ads', 'ad', 'id,account_id,name,adset_id,effective_status'],
    ]) await pages(`act_${account}/${edge}`, { fields, limit: '100' }, (x) => {
      if (objects.length >= 10000 || x.account_id !== account) fail('invalid_data');
      const key = `${type}:${id(x.id)}`; if (identities.has(key)) fail('invalid_data'); identities.add(key);
      objects.push({ type, id: x.id, parent_id: type === 'campaign' ? null : id(type === 'adset' ? x.campaign_id : x.adset_id), name: text(x.name), objective: text(x.objective, 100), status: text(x.effective_status, 100) });
    });
    const params = { level: 'ad', time_increment: '1', time_range: JSON.stringify({ since: from, until: to }), limit: '100', fields: 'account_id,campaign_id,adset_id,ad_id,ad_name,date_start,date_stop,spend,impressions,reach,clicks,inline_link_clicks,actions' };
    let path = `act_${account}/insights`, first = await request(path, params);
    if (first.report_run_id) {
      const report = id(first.report_run_id); let done = false;
      for (let poll = 0; poll < 3; poll++) {
        const state = await request(report, { fields: 'async_status,async_percent_completion' });
        if (state.async_status === 'Job Completed') { done = true; break; }
        if (state.async_status === 'Job Failed') fail('provider_unavailable');
      }
      if (!done) fail('async_pending');
      path = `${report}/insights`; first = null;
    }
    await pages(path, params, (x) => {
      if (rows.length >= 5000) fail('limit_exceeded');
      if (x.account_id !== account || x.date_stop !== x.date_start || date(x.date_start) < from || x.date_start > to || (x.level && x.level !== 'ad')) fail('invalid_data');
      const grain = `${x.date_start}:${id(x.ad_id)}`; if (grains.has(grain)) fail('invalid_data'); grains.add(grain);
      if (!Array.isArray(x.actions || [])) fail('invalid_data');
      const actions = (x.actions || []).map(a => ({ action_type: text(a.action_type, 100), value: decimal(a.value) }));
      if (JSON.stringify(actions).length > 8192) fail('limit_exceeded');
      rows.push({ date: x.date_start, campaign_id: id(x.campaign_id), adset_id: id(x.adset_id), ad_id: x.ad_id, spend: decimal(x.spend), impressions: integer(x.impressions), reach: integer(x.reach), clicks: integer(x.clicks), link_clicks: integer(x.inline_link_clicks), actions, name: text(x.ad_name) });
    }, first);
    return { account_id: account, currency: config.currency, timezone: config.timezone, rows, objects };
  } catch (error) {
    const codes = ['rate_limit', 'provider_auth', 'provider_unavailable', 'invalid_data', 'limit_exceeded', 'timeout', 'async_pending'];
    const safe = new Error(codes.includes(error.message) ? error.message : 'network');
    safe.rowsProcessed = rows.length; throw safe;
  }
}
