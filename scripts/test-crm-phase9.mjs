import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { inquiryPost, inquiryOptions, visitorIp, VISITOR_HEADER } from '../src/lib/crm/website/endpoint.mjs';
import { sanitizeAttribution } from '../src/lib/crm/website/attribution.mjs';
import { prepareWebsiteInquiry, captureWebsiteAttribution } from '../src/lib/crm/website/client.mjs';
import { normalizeWebsite } from '../src/lib/crm/website/normalize.mjs';
import { processExternalJobs } from '../src/lib/crm/intake/worker.mjs';
const env = { CRM_WEBSITE_RATE_LIMIT_SECRET: 'synthetic-rate-key' };
const data = { site_key: 'school', form_key: 'annual', request_key: randomUUID(), contact: { name: 'Sara', phone: '0612345678' },
 answers: { child: 'Adam', age: 12, days: ['Lundi', 'Mardi'], consent: true, campaign_id: 'hidden', landing_page: 'https://private.example/?secret', referrer: 'https://private.example', cookies: 'secret'  }, consent: true,
 attribution: { landing_page: 'https://school.example/annual?email=private@example.invalid&utm_source=fb#secret', referrer: 'https://search.example/find?q=private', utm_source: 'fb', utm_campaign: 'Original exact value', fbclid: 'click', fbc: 'observed-fbc', fbp: 'observed-fbp' } };
let stored = 0, rate = true, prior = 'absent';let payload;
const rpc = async (name, args) => {
 if (name === 'crm_get_website_site') return args.p_origin === 'https://school.example';
 if (name === 'crm_check_website_rate_limit') { assert.match(args.p_key, /^[0-9a-f]{64}$/); assert(!args.p_key.includes('192.0.2')); return rate; }
 if (name === 'crm_website_inquiry_status') return prior;
 if (name === 'crm_accept_website_inquiry') { stored++;payload=args.p_payload;return null; }
 throw Error(name);
};
const request = (value = data, headers = {}) => new Request('http://localhost/api/public/crm-inquiry', { method: 'POST', body: typeof value === 'string' ? value : JSON.stringify(value), headers: { 'Content-Type': 'application/json', Origin: 'https://school.example', 'x-real-ip': '192.0.2.1', ...headers } });
const run = (value = data, options = {}, headers = {}) => inquiryPost(request(value, headers), { rpc, env, ...options });
let response = await run();assert.equal(response.status, 200);assert.deepEqual(await response.json(), { success:true,message:'Merci. Votre demande a bien été reçue.' });
for(const key of ['campaign_id','landing_page','referrer','cookies'])assert(!(key in payload.answers));
assert.equal(payload.attribution.landing_page, 'https://school.example/annual');assert.equal(payload.attribution.referrer, 'https://search.example');assert.equal(payload.attribution.utm_campaign,'Original exact value');
assert.equal((await run('{')).status,400);assert.equal((await run('x'.repeat(32769))).status,413);
assert.equal((await run(data,{}, {'Content-Type':'text/plain'})).status,415);
assert.equal((await run(data,{}, {Origin:'https://evil.example'})).status,403);assert.equal((await run(data,{}, {Origin:'invalid'})).status,403);
assert.equal((await run({...data,contact:{name:'No contact'}})).status,400);
assert.equal((await run({...data,contact:{email:'email-only@example.invalid'}})).status,200);
assert.equal((await run({...data,attribution:{campaign_id:'forged'}})).status,400);
assert.equal((await run({...data,honeypot:'bot'})).status,400);
rate=false;assert.equal((await run()).status,429);rate=true;
prior='received';const before=stored;assert.equal((await run(data,{env:{...env,TURNSTILE_SECRET_KEY:'fake'}})).status,200);assert.equal(stored,before);
prior='conflict';assert.equal((await run()).status,409);prior='absent';
assert.equal((await run(data,{rpc:async()=>{throw Error('sensitive SQL error');}})).status,503);
assert.equal((await run(data,{env:{...env,TURNSTILE_SECRET_KEY:'fake'}})).status,403);
let challengeKeys=[];
const verify=async(_url,options)=>{const b=JSON.parse(options.body);assert.equal(b.secret,'fake');assert(!('remoteip' in b));challengeKeys.push(b.idempotency_key);return Response.json({success:true,hostname:'school.example',action:'crm_inquiry'});};
assert.equal((await run({...data,turnstileToken:'synthetic'},{env:{...env,TURNSTILE_SECRET_KEY:'fake'},fetchImpl:verify})).status,200);
assert.equal((await run({...data,form_key:'summer',turnstileToken:'synthetic'},{env:{...env,TURNSTILE_SECRET_KEY:'fake'},fetchImpl:verify})).status,200);assert.notEqual(...challengeKeys);
assert.equal((await run({...data,turnstileToken:'synthetic'},{env:{...env,TURNSTILE_SECRET_KEY:'fake'},fetchImpl:async()=>Response.json({success:true,hostname:'evil.example',action:'crm_inquiry'})})).status,403);
assert.equal((await run({...data,turnstileToken:'synthetic'},{env:{...env,TURNSTILE_SECRET_KEY:'fake'},fetchImpl:async()=>Response.json({success:false})})).status,403);
assert.equal((await inquiryOptions(new Request('http://localhost',{method:'OPTIONS',headers:{Origin:'https://school.example','Access-Control-Request-Method':'POST'}}),rpc)).status,204);
assert.equal((await inquiryOptions(new Request('http://localhost',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST'}}),rpc)).status,403);
assert.deepEqual(sanitizeAttribution({landing_page:'javascript:alert(1)',referrer:'https://user:secret@site.example',campaign_id:'forged'}),{});
const map={id:'map',field_map:{learner_name:'child',learner_age:'age'},question_labels:{days:'Jours'},default_program_interest_text:'Annual',default_session_type:'Yearly'};
const normalized=normalizeWebsite({payload:{...payload,answers:data.answers,contact:data.contact}},map);
assert.equal(normalized.core_fields.learner_name,'Adam');assert.equal(normalized.core_fields.learner_age,12);assert.equal(normalized.core_fields.phone,'0612345678');
assert(!normalized.form_answers.some(a=>['campaign_id','landing_page','referrer','cookies'].includes(a.key)));assert.equal(normalized.form_answers.find(a=>a.key==='consent').value_type,'boolean');
assert.deepEqual(normalized.form_answers.find(a=>a.key==='days').value,['Lundi','Mardi']);
assert.equal(normalizeWebsite({payload:{...payload,answers:{other_name:'Lina'},contact:data.contact}},{...map,field_map:{learner_name:'other_name'},default_program_interest_text:'Summer'}).core_fields.program_interest_text,'Summer');
for (const form of ['general_contact_v1', 'campaign_adult_lead_v1']) {
 const inquiry = normalizeWebsite({payload:{...payload,form_key:form,contact:{name:'Business contact',email:'business@example.invalid'},answers:{program_interest:'Formation entreprise',company_size:'10-20'}}},
  {id:form,form_name:'Inquiry',field_map:{program_interest_text:'program_interest'},question_labels:{}});
 assert.equal(inquiry.core_fields.contact_name,'Business contact');
 assert.equal(inquiry.core_fields.learner_name,null);
 assert.equal(inquiry.core_fields.program_interest_text,'Formation entreprise');
 assert.equal(inquiry.form_answers.find(a=>a.key==='company_size').value,'10-20');
}
const parentInquiry=normalizeWebsite({payload:{...payload,contact:{name:'Parent'},answers:{learner_name:'Child A',program_interest:'Yearly'}}},
 {id:'campaign_parent_lead_v1',field_map:{learner_name:'learner_name',program_interest_text:'program_interest'},question_labels:{}});
assert.equal(parentInquiry.core_fields.learner_name,'Child A');
assert.throws(()=>normalizeWebsite({payload},null),e=>e.code==='missing_mapping');
let finalizations=0;
await processExternalJobs({env:{},fetchImpl:async()=>{throw Error('Website must never call Meta');},rpc:async(name,args)=>{
 if(name==='crm_claim_ingestion_jobs')return[{id:'job',lease_token:'lease',connection:{provider:'website'},payload:{...payload,answers:data.answers,contact:data.contact}}];
 if(name==='crm_get_website_job_mapping')return map;
 if(name==='crm_finalize_website_job'){finalizations++;assert.equal(args.p_lease,'lease');return{status:'done'};}
 throw Error(name);
}});assert.equal(finalizations,1);
const memory=new Map();const browser={location:{href:'https://school.example/annual?utm_source=facebook&fbclid=click&email=private'},document:{referrer:'https://search.example/?q=private',cookie:'other=secret; _fbc=observed; _fbp=browser'},sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
assert.deepEqual(captureWebsiteAttribution({browser}),{});
const first=captureWebsiteAttribution({browser,consent:true,now:1000});browser.location.href='https://school.example/contact';assert.deepEqual(captureWebsiteAttribution({browser,consent:true,now:2000}),first);
assert(!JSON.stringify(first).includes('private'));assert(!JSON.stringify(first).includes('secret'));
assert.equal(captureWebsiteAttribution({browser,consent:true,now:2000000}).landing_page,'https://school.example/contact');
const prepared=prepareWebsiteInquiry({...data,attribution:first});assert(prepared.request_key);assert.equal(prepareWebsiteInquiry(data,prepared.request_key).request_key,prepared.request_key);
// Signed visitor header: limiter keys on the visitor, falls back to x-real-ip on any defect, never 503s.
const proxySecret = 'synthetic-proxy-secret-0123456789abcdef';
const venv = { ...env, CRM_WEBSITE_PROXY_SECRET: proxySecret };
const rateKeyOf = ip => createHmac('sha256', env.CRM_WEBSITE_RATE_LIMIT_SECRET).update(ip).digest('hex');
const sign = ({ ip = '203.0.113.9', key = data.request_key, ts = Math.floor(Date.now() / 1000), secret = proxySecret } = {}) => {
 const ipb64 = Buffer.from(ip, 'utf8').toString('base64url');
 return `v1.${ts}.${ipb64}.${createHmac('sha256', secret).update(`v1.${ts}.${ipb64}.${key}`).digest('base64url')}`;
};
assert.equal(VISITOR_HEADER, 'x-eh-visitor-token');
const seenKeys = [];
const capture = async (name, args) => {
 if (name === 'crm_check_website_rate_limit') { seenKeys.push(args.p_key); assert.match(args.p_key, /^[0-9a-f]{64}$/);
  for (const raw of ['192.0.2', '203.0.113', '2001:db8', 'ffff']) assert(!JSON.stringify(args).includes(raw)); return rate; }
 for (const raw of ['192.0.2.1', '203.0.113.9', '2001:db8']) assert(!JSON.stringify(args ?? {}).includes(raw));
 return rpc(name, args);
};
const warnings = [];const realWarn = console.warn;
console.warn = (...line) => { warnings.push(JSON.stringify(line)); };
const sentry = [];
const probe = async (header, envOverride = venv) => {
 seenKeys.length = 0;
 const r = await run(data, { rpc: capture, env: envOverride, captureWarning: (m, t) => sentry.push([m, t]) }, header === undefined ? {} : { [VISITOR_HEADER]: header });
 assert.notEqual(r.status, 503); assert.equal(seenKeys.length, 1, 'limiter must always run'); return seenKeys[0];
};
try {
 const egressKey = rateKeyOf('192.0.2.1');
 const visitorKey = await probe(sign());
 assert.equal(visitorKey, rateKeyOf('203.0.113.9'));assert.notEqual(visitorKey, egressKey);
 assert.equal(await probe(undefined), egressKey);
 assert.equal(await probe(sign(), env), egressKey);
 // Secret minimum is 32 characters: a 31-character secret is unconfigured even when both sides use it.
 const short = 'x'.repeat(31), exact = 'x'.repeat(32);
 assert.equal(await probe(sign({ secret: short }), { ...env, CRM_WEBSITE_PROXY_SECRET: short }), egressKey);
 assert.equal(await probe(sign({ secret: exact }), { ...env, CRM_WEBSITE_PROXY_SECRET: exact }), visitorKey);
 const now = Math.floor(Date.now() / 1000);
 const reasonOf = (header, e = venv) => visitorIp(new Request('http://localhost', { headers: header === undefined ? {} : { [VISITOR_HEADER]: header } }), data.request_key, e).reason;
 const valid = sign(); const [, ts, ipb64, sig] = valid.split('.');
 const fallbacks = {
  badSignature: sign({ secret: 'another-synthetic-proxy-secret-0123456789' }),
  stalePast: sign({ ts: now - 360 }), staleFuture: sign({ ts: now + 360 }),
  otherRequestKey: sign({ key: randomUUID() }),
  threeParts: `v1.${ts}.${ipb64}`, fiveParts: `${valid}.x`, wrongVersion: `v2.${ts}.${ipb64}.${sig}`,
  emptyTs: `v1..${ipb64}.${sig}`, emptyIp: `v1.${ts}..${sig}`, emptySig: `v1.${ts}.${ipb64}.`, dots: '...',
  nonBase64Ip: `v1.${ts}.${ipb64}+/=.${sig}`, nonBase64Sig: `v1.${ts}.${ipb64}.${sig.slice(0, 42)}+`, paddedSig: `${valid}=`,
  shortSig: `v1.${ts}.${ipb64}.${sig.slice(0, 42)}`, longSig: `v1.${ts}.${ipb64}.${sig}A`,
  oversize: `v1.${ts}.${'A'.repeat(300)}.${sig}`, nonNumericTs: `v1.12ab.${ipb64}.${sig}`, negativeTs: `v1.-${ts}.${ipb64}.${sig}`,
  longIp: sign({ ip: '1'.repeat(46) }), badIpChars: sign({ ip: '203.0.113.9<script>' }), ipWithSpace: sign({ ip: '203.0.113.9 ' }), ipNewline: sign({ ip: '203.0.113.9\n' }),
 };
 for (const [name, header] of Object.entries(fallbacks)) assert.equal(await probe(header), egressKey, `fallback expected: ${name}`);
 assert.equal(await probe(sign({ ts: now - 240 })), visitorKey);
 // Exact window boundaries are pinned with the pure helper's clock argument (no wall-clock flake).
 const at = (header, nowSeconds, e = venv) => visitorIp(new Request('http://localhost', { headers: { [VISITOR_HEADER]: header } }), data.request_key, e, nowSeconds * 1000).reason;
 const T = 1_800_000_000;
 assert.equal(at(sign({ ts: T }), T + 300), 'ok');assert.equal(at(sign({ ts: T }), T - 300), 'ok');
 assert.equal(at(sign({ ts: T }), T + 301), 'stale');assert.equal(at(sign({ ts: T }), T - 301), 'stale');
 assert.equal(at(sign({ ts: T, secret: short }), T, { ...env, CRM_WEBSITE_PROXY_SECRET: short }), 'unconfigured');
 assert.equal(at(sign({ ts: T, secret: exact }), T, { ...env, CRM_WEBSITE_PROXY_SECRET: exact }), 'ok');
 // Non-canonical signature: flipping the last character's spare bits decodes to the same bytes but is rejected.
 const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 const flipped = `${valid.slice(0, -1)}${alphabet[alphabet.indexOf(valid.at(-1)) ^ 1]}`;
 assert.deepEqual(Buffer.from(flipped.split('.')[3], 'base64url'), Buffer.from(sig, 'base64url'));
 assert.equal(reasonOf(flipped), 'invalid');assert.equal(await probe(flipped), egressKey);
 for (const ip of ['198.51.100.7', '2001:db8::1', '::ffff:203.0.113.10']) {
  const result = visitorIp(new Request('http://localhost', { headers: { [VISITOR_HEADER]: sign({ ip }) } }), data.request_key, venv);
  assert.deepEqual(result, { reason: 'ok', ip });assert.equal(await probe(sign({ ip })), rateKeyOf(ip));
 }
 assert.equal(reasonOf(undefined), 'missing');assert.equal(reasonOf(sign(), env), 'unconfigured');
 assert.equal(reasonOf(fallbacks.stalePast), 'stale');assert.equal(reasonOf(fallbacks.badSignature), 'invalid');assert.equal(reasonOf(fallbacks.oversize), 'invalid');
 assert.equal(visitorIp({ headers: { get() { throw Error('boom'); } } }, data.request_key, venv).reason, 'invalid');
 assert.equal(visitorIp(new Request('http://localhost', { headers: { [VISITOR_HEADER]: sign() } }), undefined, venv).reason, 'invalid');
 // Every invalid/stale result warns with only site, form and reason.
 warnings.length = 0;await probe(fallbacks.stalePast);await probe(fallbacks.badSignature);
 assert.equal(warnings.length, 2);assert(warnings.every(w => w.includes('[crm-inquiry] visitor_rejected')));
 assert(warnings[0].includes('"stale"') && warnings[1].includes('"invalid"'));
 warnings.length = 0;await probe(sign());await probe(undefined);assert.equal(warnings.length, 0);
 // A header that arrives while the admin secret is unset or short warns exactly once as unconfigured.
 for (const e of [env, { ...env, CRM_WEBSITE_PROXY_SECRET: short }]) {
  warnings.length = 0;await probe(sign(), e);
  assert.equal(warnings.length, 1);assert(warnings[0].includes('[crm-inquiry] visitor_rejected') && warnings[0].includes('"unconfigured"'));
  for (const leak of ['192.0.2', '203.0.113', 'v1.', 'Sara', '0612345678']) assert(!warnings[0].includes(leak));
  assert.deepEqual(Object.keys(JSON.parse(warnings[0])[1]), ['site', 'form', 'visitor']);
 }
 // 429 warns and reports a Sentry warning, never with the IP, header or contact data.
 rate = false;warnings.length = 0;sentry.length = 0;
 for (const header of [sign(), undefined]) {
  seenKeys.length = 0;
  const limited = await run(data, { rpc: capture, env: venv, captureWarning: (m, t) => sentry.push([m, t]) }, header === undefined ? {} : { [VISITOR_HEADER]: header });
  assert.equal(limited.status, 429);
 }
 assert.equal((await run(data, { rpc: capture, env: venv, captureWarning: () => { throw Error('sentry down'); } }, { [VISITOR_HEADER]: sign() })).status, 429);
 rate = true;
 assert.equal(warnings.filter(w => w.includes('[crm-inquiry] rate_limited')).length, 3);
 assert.deepEqual(sentry, [['[crm-inquiry] rate_limited', { site: 'school', form: 'annual', visitor: 'ok' }], ['[crm-inquiry] rate_limited', { site: 'school', form: 'annual', visitor: 'missing' }]]);
 const logged = JSON.stringify([warnings, sentry]);
 for (const leak of ['192.0.2', '203.0.113', 'v1.', 'Sara', '0612345678', proxySecret]) assert(!logged.includes(leak), `log leaked ${leak}`);
} finally { console.warn = realWarn; }
// Preflight is unchanged: the visitor header is server-to-server only and never CORS-allowed.
assert.equal((await inquiryOptions(new Request('http://localhost',{method:'OPTIONS',headers:{Origin:'https://school.example','Access-Control-Request-Method':'POST'}}),rpc)).headers.get('Access-Control-Allow-Headers'),'Content-Type');
console.log('PASS Phase 9 endpoint, CORS, limits, signed visitor key, Turnstile binding, privacy, mappings, shared worker and client attribution fixtures');
