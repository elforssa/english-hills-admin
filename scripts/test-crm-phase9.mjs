import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inquiryPost, inquiryOptions } from '../src/lib/crm/website/endpoint.mjs';
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
console.log('PASS Phase 9 endpoint, CORS, limits, Turnstile binding, privacy, mappings, shared worker and client attribution fixtures');
