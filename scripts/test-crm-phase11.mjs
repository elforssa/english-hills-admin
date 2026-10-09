import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchInsights, fetchInsightsFixture } from '../src/lib/crm/insights/adapter.mjs';
import { processInsights, processInsightsFixture } from '../src/lib/crm/insights/worker.mjs';
import { isDirectorAnalyticsPath, isDirectorLifecyclePath, loginDestination } from '../src/lib/roleAccess.mjs';
const config={mode:'mock',account_id:'1100',currency:'MAD',timezone:'Africa/Casablanca',api_version:'v99.0',secret_ref:'CRM_META_INSIGHTS_TOKEN_FIXTURE'};
const row={account_id:'1100',campaign_id:'1101',adset_id:'1102',ad_id:'1103',ad_name:'Fixture',date_start:'2026-01-01',date_stop:'2026-01-01',spend:'12.345678',impressions:'90',reach:'80',clicks:'4',inline_link_clicks:'2',actions:[{action_type:'lead',value:'99',ignored:'secret'}]};
const args={config,from:'2026-01-01',to:'2026-01-02',token:'fixture-secret'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
let checks=0;
function mock(insights,metadata={account_id:'1100',currency:'MAD',timezone_name:'Africa/Casablanca'}) {return async(url,options)=>{
 const u=new URL(url);assert.equal(u.host,'graph.facebook.com');assert(!url.includes('fixture-secret'));assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fixture-secret');checks++;
 if(u.pathname.endsWith('/act_1100'))return response(metadata);
 if(/\/(campaigns|adsets|ads)$/.test(u.pathname))return response({data:[]});
 return insights(u);
};}
let calls=0;
const result=await fetchInsightsFixture({...args,mockFetch:mock(u=>{assert.equal(u.searchParams.get('level'),'ad');assert.equal(u.searchParams.get('time_increment'),'1');return response(++calls===1?{data:[row],paging:{next:'https://evil.invalid/steal?access_token=secret',cursors:{after:'cursor1'}}}:{data:[{...row,date_start:'2026-01-02',date_stop:'2026-01-02'}]});})});
assert.equal(result.rows.length,2);assert.equal(result.rows[0].spend,'12.345678');assert.deepEqual(result.rows[0].actions,[{action_type:'lead',value:'99'}]);
for(const [status,code] of [[429,'rate_limit'],[500,'provider_unavailable'],[401,'provider_auth'],[403,'provider_auth'],[302,'invalid_data']])await assert.rejects(fetchInsightsFixture({...args,mockFetch:mock(()=>response({},status))}),new RegExp(code));
for(const metadata of [{account_id:'999',currency:'MAD',timezone_name:'Africa/Casablanca'},{account_id:'1100',currency:'USD',timezone_name:'Africa/Casablanca'},{account_id:'1100',currency:'MAD',timezone_name:'UTC'}])await assert.rejects(fetchInsightsFixture({...args,mockFetch:mock(()=>response({data:[]}),metadata)}),/invalid_data/);
for(const bad of [{...row,spend:'NaN'},{...row,spend:'-1'},{...row,level:'campaign'},{...row,date_stop:'2026-01-02'},{...row,date_start:'2025-12-31',date_stop:'2025-12-31'},{...row,clicks:'-1'},{...row,actions:{}},{...row,ad_id:'not-id'}])await assert.rejects(fetchInsightsFixture({...args,mockFetch:mock(()=>response({data:[bad]}))}),/invalid_data/);
await assert.rejects(fetchInsightsFixture({...args,mockFetch:mock(()=>response({data:[row,row]}))}),/invalid_data/);
let partial=0;await assert.rejects(fetchInsightsFixture({...args,mockFetch:mock(()=>++partial===1?response({data:[row],paging:{next:'ignored',cursors:{after:'x'}}}):response({},500))}),e=>e.message==='provider_unavailable'&&e.rowsProcessed===1);
let asyncCalls=0;const asyncResult=await fetchInsightsFixture({...args,mockFetch:mock(u=>{asyncCalls++;if(u.pathname.endsWith('/act_1100/insights'))return response({report_run_id:'9999'});if(u.pathname.endsWith('/9999'))return response({async_status:'Job Completed'});return response({data:[row]});})});assert.equal(asyncResult.rows.length,1);assert.equal(asyncCalls,3);
await assert.rejects(fetchInsightsFixture({...args,mockFetch:mock(u=>response(u.pathname.endsWith('/act_1100/insights')?{report_run_id:'9999'}:{async_status:'Job Running'}))}),/async_pending/);
await assert.rejects(fetchInsightsFixture(args),/live_not_available/);
await assert.rejects(processInsightsFixture({rpc:()=>assert.fail('must not claim')}),/live_not_available/);
const log=[];const run={id:'run',lease_token:'lease',date_from:args.from,date_to:args.to,config};
const rpc=async(name,data)=>{log.push({name,data});return name==='crm_claim_insights_sync'?run:null;};
assert.equal((await processInsightsFixture({rpc,env:{CRM_META_INSIGHTS_TOKEN_FIXTURE:'fixture-secret'},mockFetch:mock(()=>response({data:[row]}))})).status,'completed');assert.equal(log.at(-1).name,'crm_finish_insights_sync');
log.length=0;assert.equal((await processInsightsFixture({rpc,env:{},mockFetch:mock(()=>assert.fail())})).status,'failed');assert.equal(log.at(-1).data.p_code,'missing_secret');
assert(isDirectorAnalyticsPath('/crm/analytics/extra'));assert(!isDirectorAnalyticsPath('/crm/analytics-other'));
assert(isDirectorLifecyclePath('/crm/integrations/lifecycle'));assert(!isDirectorLifecyclePath('/crm/integrations/lifecycle-other'));
for(const role of ['admin','receptionist','teacher','parent','student'])assert.notEqual(loginDestination(role,'/crm/analytics'),'/crm/analytics');assert.equal(loginDestination('director','/crm/analytics'),'/crm/analytics');
for(const role of ['admin','receptionist','teacher','parent','student'])assert.notEqual(loginDestination(role,'/crm/integrations/lifecycle'),'/crm/integrations/lifecycle');assert.equal(loginDestination('director','/crm/integrations/lifecycle'),'/crm/integrations/lifecycle');

// ---- Live transport (DGI-A D4): injected fetch only, never a real token or Meta host.
const liveConfig={...config,mode:'live',currency:'USD'},liveArgs={config:liveConfig,from:'2026-01-01',to:'2026-01-02',token:'fixture-secret'};
const sentinel='provider-body-sentinel-never-surfaced';
const usd={account_id:'1100',currency:'USD',timezone_name:'Africa/Casablanca'};
let liveRequests=0;
function live(insights,metadata=usd){return async(url,options)=>{
 const u=new URL(url);assert.equal(u.protocol,'https:');assert.equal(u.host,'graph.facebook.com');assert(!url.includes('fixture-secret'));assert(!u.searchParams.has('access_token'));
 assert.deepEqual(Object.keys(options.headers),['Authorization']);assert.equal(options.headers.Authorization,'Bearer fixture-secret');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert(options.signal instanceof AbortSignal);liveRequests++;
 if(u.pathname.endsWith('/act_1100'))return response(metadata);
 if(/\/(campaigns|adsets|ads)$/.test(u.pathname))return response({data:[]});
 return insights(u);
};}
const liveRow={...row,actions:[]};
const liveResult=await fetchInsights({...liveArgs,fetchImpl:live(()=>response({data:[liveRow]}))});
assert.equal(liveResult.currency,'USD');assert.equal(liveResult.rows.length,1);assert.equal(liveRequests,5);
// Mode isolation: live never uses the test double and mock never uses the injected fetch.
await assert.rejects(fetchInsights({...liveArgs,mockFetch:live(()=>assert.fail())}),/live_not_available/);
await assert.rejects(fetchInsightsFixture({...liveArgs,mockFetch:live(()=>assert.fail())}),/live_not_available/);
await assert.rejects(fetchInsights({...args,fetchImpl:mock(()=>assert.fail())}),/live_not_available/);
await assert.rejects(fetchInsights({...liveArgs,token:'',fetchImpl:()=>assert.fail('no request without token')}),/missing_secret/);
// Error mapping is code-only; a provider body never reaches the error.
const graphError=(status,code)=>new Response(JSON.stringify({error:{code,message:sentinel,fbtrace_id:'trace'}}),{status});
const cases=[[()=>new Response(sentinel,{status:429}),'rate_limit'],...[4,17,80000,613].map(code=>[()=>graphError(400,code),'rate_limit']),[()=>graphError(403,4),'rate_limit'],
 [()=>new Response(sentinel,{status:401}),'provider_auth'],[()=>new Response(sentinel,{status:403}),'provider_auth'],[()=>graphError(400,190),'provider_auth'],
 [()=>new Response(sentinel,{status:500}),'provider_unavailable'],[()=>new Response(null,{status:503}),'provider_unavailable'],[()=>graphError(400,100),'invalid_data'],
 [()=>new Response(sentinel,{status:302,headers:{Location:'https://evil.invalid/'}}),'invalid_data'],[()=>Object.defineProperty(response({data:[]}),'redirected',{value:true}),'invalid_data'],
 [()=>response({report_run_id:'9999'}),'invalid_data'],[()=>{throw new TypeError('fetch failed',{cause:new Error('unexpected redirect')});},'invalid_data'],[()=>{throw new TypeError('fetch failed');},'network']];
for(const [reply,code] of cases){
 let reportPolls=0;
 const error=await fetchInsights({...liveArgs,fetchImpl:live(u=>{if(u.pathname.endsWith('/9999'))reportPolls++;return reply();})}).then(()=>assert.fail(`expected ${code}`),e=>e);
 assert.equal(error.message,code);assert.deepEqual(Object.keys(error),['rowsProcessed']);assert(!`${error.message}${error.stack}`.includes(sentinel));assert.equal(reportPolls,0,'live never polls an async report');
}
// Invocation deadline: an expired deadline makes no request; a slow request is aborted.
await assert.rejects(fetchInsights({...liveArgs,deadline:Date.now()-1,fetchImpl:()=>assert.fail('no request after deadline')}),/timeout/);
let aborted=false;
await assert.rejects(fetchInsights({...liveArgs,deadline:Date.now()+150,fetchImpl:(url,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));}))}),/timeout/);
assert(aborted,'slow live request aborted at the deadline');
// Worker: the live gate is checked before the secret is resolved; a missing secret fails before any fetch.
function recordingEnv(values){const reads=[];return {reads,env:new Proxy(values,{get(target,key){reads.push(key);return target[key];}})};}
const liveRun={id:'live-run',lease_token:'lease',date_from:'2026-01-01',date_to:'2026-01-02',attempt_count:1,config:liveConfig};
const workerLog=[];const liveRpc=(claim=liveRun)=>async(name,data)=>{workerLog.push({name,data});return name==='crm_claim_insights_sync'?claim:null;};
for(const [liveGate,gateValue] of [[false,'true'],[true,undefined],[true,'false']]){
 workerLog.length=0;const {reads,env}=recordingEnv({CRM_META_INSIGHTS_TOKEN_FIXTURE:'fixture-secret',...(gateValue?{CRM_META_INSIGHTS_LIVE_ENABLED:gateValue}:{})});
 const outcome=await processInsights({rpc:liveRpc(),env,liveGate,fetchImpl:()=>assert.fail('closed gate never fetches')});
 assert.equal(outcome.status,'failed');assert.equal(workerLog.at(-1).name,'crm_fail_insights_sync');assert.equal(workerLog.at(-1).data.p_code,'live_not_available');
 assert(!reads.includes('CRM_META_INSIGHTS_TOKEN_FIXTURE'),'closed gate never reads the secret');
}
workerLog.length=0;
let gated=recordingEnv({CRM_META_INSIGHTS_LIVE_ENABLED:'true'});
assert.equal((await processInsights({rpc:liveRpc(),env:gated.env,liveGate:true,fetchImpl:()=>assert.fail('no fetch without secret')})).status,'failed');assert.equal(workerLog.at(-1).data.p_code,'missing_secret');
workerLog.length=0;let liveFetches=0;
gated=recordingEnv({CRM_META_INSIGHTS_LIVE_ENABLED:'true',CRM_META_INSIGHTS_TOKEN_FIXTURE:'fixture-secret'});
assert.deepEqual(await processInsights({rpc:liveRpc(),env:gated.env,liveGate:true,fetchImpl:live(()=>{liveFetches++;return response({data:[liveRow]});})}),{id:'live-run',status:'completed'});
assert.equal(liveFetches,1);assert(gated.reads.includes('CRM_META_INSIGHTS_TOKEN_FIXTURE'));assert.equal(workerLog.at(-1).name,'crm_finish_insights_sync');assert.equal(workerLog.at(-1).data.p_data.currency,'USD');
assert(!JSON.stringify(workerLog).includes('fixture-secret'),'token never reaches an RPC');
// Transient live failures are deferred while attempts remain; the third is terminal.
for(const [attempt,status] of [[1,'deferred'],[2,'deferred'],[3,'failed']]){workerLog.length=0;
 assert.equal((await processInsights({rpc:liveRpc({...liveRun,attempt_count:attempt}),env:gated.env,liveGate:true,fetchImpl:live(()=>response({},500))})).status,status);assert.equal(workerLog.at(-1).data.p_code,'provider_unavailable');}
// An uncertain publish is left to the lease; a mock run never runs without the test double.
assert.equal((await processInsights({rpc:async name=>{if(name==='crm_finish_insights_sync')throw new Error('timeout');return name==='crm_claim_insights_sync'?liveRun:null;},env:gated.env,liveGate:true,fetchImpl:live(()=>response({data:[liveRow]}))})).status,'unknown');
workerLog.length=0;assert.equal((await processInsights({rpc:liveRpc(run),env:gated.env,liveGate:true,fetchImpl:()=>assert.fail()})).status,'failed');assert.equal(workerLog.at(-1).data.p_code,'live_not_available');
// ---- Live HTTP shape through the real fetch against a local stub (no Meta host).
const seen=[];let big=false;
const stub=http.createServer((req,res)=>{seen.push({url:req.url,authorization:req.headers.authorization});
 const u=new URL(req.url,'http://stub');
 if(u.pathname==='/elsewhere'){res.writeHead(200);return res.end('{}');}
 if(u.pathname.endsWith('/act_1100')){if(big==='redirect'){res.writeHead(302,{Location:'/elsewhere'});return res.end();}res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(usd));}
 if(/\/(campaigns|adsets|ads)$/.test(u.pathname)){res.writeHead(200,{'content-type':'application/json'});return res.end('{"data":[]}');}
 res.writeHead(200,{'content-type':'application/json'});
 if(big===true){res.write('{"data":[');const chunk=Buffer.alloc(65536,32);for(let i=0;i<70;i++)res.write(chunk);return res.end(']}');}
 res.end(JSON.stringify({data:[liveRow]}));});
await new Promise(resolve=>stub.listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${stub.address().port}`;
// The adapter builds the fixed Graph URL; the test rewrites only the origin onto the stub.
const realFetch=(url,options)=>{const u=new URL(url);assert.equal(u.origin,'https://graph.facebook.com');return fetch(local+u.pathname+u.search,options);};
try{
 const real=await fetchInsights({...liveArgs,fetchImpl:realFetch});assert.equal(real.rows.length,1);
 assert.equal(seen.length,5);assert(seen.every(s=>s.authorization==='Bearer fixture-secret'&&!s.url.includes('fixture-secret')&&!s.url.includes('access_token')));
 assert(seen.some(s=>s.url.startsWith('/v99.0/act_1100/insights?')&&new URL(s.url,local).searchParams.get('level')==='ad'));
 seen.length=0;big='redirect';await assert.rejects(fetchInsights({...liveArgs,fetchImpl:realFetch}),/invalid_data/);assert(!seen.some(s=>s.url==='/elsewhere'),'redirect never followed');
 seen.length=0;big=true;await assert.rejects(fetchInsights({...liveArgs,fetchImpl:realFetch}),/limit_exceeded/);
}finally{stub.close();}
console.log(`PASS Phase 11 provider validation, pagination, async, sanitized errors, partial isolation, worker and role routing (${checks} mock requests); live transport, gate, deadline, error mapping and real-fetch stub (${liveRequests} live requests)`);
