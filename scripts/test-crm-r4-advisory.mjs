import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateLifecycleEvidence } from '../src/lib/crm/lifecycle/evidence.mjs';
import { prepareLifecyclePayload } from '../src/lib/crm/lifecycle/adapter.mjs';
import { processLifecycleDeliveries } from '../src/lib/crm/lifecycle/worker.mjs';
import { runScheduledLifecycle } from '../src/lib/crm/lifecycle/scheduler.mjs';
const mapping = { mode:'live',api_version:'v99.0',dataset_id:'882003',secret_ref:'CRM_META_LIFECYCLE_TOKEN_TEST',events:{intake:'Intake',not_qualified:'Not qualified',lost:'Lost',qualified:'Qualified',converted:'Converted'},action_source:'system_generated',lifecycle_model:'r4_stage_entry',uncertainty_policy:'no_uncertain_replay',accepted_response_field:'events_received',accepted_response_count:1,maximum_event_age_seconds:604800,required_constants:{event_source:'crm',lead_event_source:'English Hills CRM'} };
const delivery = {mapping,matching:{lead_id:'98765432109876543210987654321012'},event_time:Math.floor(Date.now()/1000)-10,source_generated_time:Math.floor(Date.now()/1000)-20,event_id:'eh:r4:synthetic:destination'};
for (const [kind,name] of Object.entries(mapping.events)) {
 const p=prepareLifecyclePayload({...delivery,event_kind:kind});
 assert.equal(p.data[0].event_name,name);assert.deepEqual(p.data[0].user_data,delivery.matching);
 assert.deepEqual(p.data[0].custom_data,mapping.required_constants);
 assert(!/adult|child|learner|email|phone|currency|value|hash/i.test(JSON.stringify(p)));
}
for (const lead_id of [123,NaN,'1e20','', '1'.repeat(33)]) assert.throws(()=>prepareLifecyclePayload({...delivery,event_kind:'intake',matching:{lead_id}}),/invalid_identity/);
// All five live kinds must follow original Meta generation in exported integer seconds.
const realNow = Date.now;
const now = 1800000000;
Date.now = () => now * 1000;
try {
 for (const event_kind of Object.keys(mapping.events)) {
  const valid = {...delivery,event_kind,event_time:now-10,source_generated_time:now-11};
  const payload = prepareLifecyclePayload(valid);
  assert.equal(prepareLifecyclePayload({...valid,payload,matching:null}), payload);
  for (const source_generated_time of [now-10,now-9,null,undefined,0,NaN,Infinity,now-10.1]) {
   for (const prepared of [false,true]) assert.throws(()=>prepareLifecyclePayload({...valid,source_generated_time,...(prepared?{payload,matching:null}:{})}),/invalid_event_time/);
  }
  for (const event_time of [now+1, now-604800, now-604792, now-10.1]) {
   const expired = {...valid,event_time,source_generated_time:now-604801};
   for (const prepared of [false,true]) assert.throws(()=>prepareLifecyclePayload({...expired,...(prepared?{payload:{data:[{...payload.data[0],event_time}]},matching:null}:{})}),/invalid_event_time/);
  }
  assert.equal(prepareLifecyclePayload({...valid,event_time:now-604791,source_generated_time:now-604792}).data[0].event_time,now-604791);
  assert.throws(()=>prepareLifecyclePayload({...valid,payload:{data:[{...payload.data[0],event_time:now-11}]}}),/invalid_event_time/);
  // Subsecond times after flooring are equality, never rounded or incremented.
  assert.throws(()=>prepareLifecyclePayload({...valid,event_time:Math.floor(now-10+0.9),source_generated_time:Math.floor(now-10+0.1)}),/invalid_event_time/);
 }
} finally { Date.now = realNow; }
for (const prepared of [false,true]) {
 let attempts=0,http=0,prepares=0;
 const invalid={...delivery,event_kind:'intake',source_generated_time:delivery.event_time};
 const payload=prepareLifecyclePayload({...invalid,source_generated_time:delivery.event_time-1});
 const results=await processLifecycleDeliveries({env:{CRM_META_LIFECYCLE_LIVE_ENABLED:'true',CRM_META_LIFECYCLE_TOKEN_TEST:'synthetic'},liveGate:true,limit:1,
  fetchImpl:async()=>{http++;throw Error('must not dispatch');},rpc:async name=>{
   if(name==='crm_claim_external_deliveries')return [{id:'equal',lease_token:'synthetic'}];
   if(name==='crm_get_external_delivery')return {...invalid,...(prepared?{payload,matching:null}:{})};
   if(name==='crm_prepare_external_delivery'){prepares++;return 'digest';}
   if(name==='crm_begin_external_attempt'){attempts++;return 1;}
   if(name==='crm_block_external_delivery')return;
   throw Error(name);
  }});
 assert.deepEqual(results,[{status:'blocked'}]);assert.equal(attempts,0);assert.equal(http,0);assert.equal(prepares,0);
}
assert.equal(evaluateLifecycleEvidence({answers:[]}).eligible,false);
assert.equal(evaluateLifecycleEvidence({sharing_field_key:'share',sharing_accepted_values:[true],answers:[{key:'share',value:'true'}]}).eligible,false);
assert.equal(evaluateLifecycleEvidence({sharing_field_key:'share',sharing_accepted_values:[true],answers:[{key:'share',value:true}]}).eligible,true);
let http=0,claims=0;
const result=await processLifecycleDeliveries({env:{CRM_META_LIFECYCLE_LIVE_ENABLED:'true',CRM_META_LIFECYCLE_TOKEN_TEST:'synthetic'},liveGate:true,limit:1,fetchImpl:async()=>{http++;throw Error('HTTP must not happen');},rpc:async name=>{
 if(name==='crm_claim_external_deliveries') return claims++===0?[{id:'fixture',lease_token:'fixture'}]:[];
 if(name==='crm_get_external_delivery') return {...delivery,event_kind:'intake'};
 if(name==='crm_prepare_external_delivery') return 'digest';
 if(name==='crm_begin_external_attempt') throw Error('sharing_stopped');
 if(name==='crm_block_external_delivery') return;
 throw Error(name);
}});
assert.equal(http,0);assert.deepEqual(result,[{status:'blocked'}]);
const req=()=>new Request('http://127.0.0.1/api/cron/crm-lifecycle',{headers:{authorization:'Bearer synthetic-scheduler'}});
const env={CRM_META_LIFECYCLE_SCHEDULER_TOKEN:'synthetic-scheduler',CRM_META_LIFECYCLE_LIVE_ENABLED:'false'};
let reconciled=0;
const rpc=async(name,args)=>{
 if(name==='crm_claim_lifecycle_evidence') {if(args.p_requirement==='advisory')throw Error('optional unavailable');return [];}
 if(name==='crm_reconcile_external_deliveries'){reconciled++;return 1;}
 if(name==='crm_cleanup_lifecycle_retention')return {};
 if(name==='crm_cleanup_lifecycle_stop_audit')return 0;
 if(name==='crm_record_lifecycle_scheduler_run')return;
 throw Error(name);
};
const scheduled=await runScheduledLifecycle(req(),{env,rpc,liveGate:false});assert.equal(scheduled.status,200);assert.equal(reconciled,1);assert.deepEqual((await scheduled.json()).advisory_evidence,{unavailable:true});
for(const broken of ['crm_claim_lifecycle_evidence','crm_reconcile_external_deliveries','crm_cleanup_lifecycle_retention','crm_cleanup_lifecycle_stop_audit']) {
 const r=await runScheduledLifecycle(req(),{env,rpc:async(name,args)=>{if(name===broken)throw Error('mandatory storage unavailable');return rpc(name,args);},liveGate:false});assert.equal(r.status,503);
}
// Static protocol coverage supplements forced multi-session execution.
const sql=readFileSync(new URL('../supabase/migrations/103_crm_meta_funnel_r4_advisory_d2.sql',import.meta.url),'utf8');
const definitions=readFileSync(new URL('../supabase/migrations/102_crm_meta_funnel_r4_runtime_safety.sql',import.meta.url),'utf8')+'\n'+sql+'\n'+readFileSync(new URL('../supabase/migrations/104_crm_lifecycle_strict_exported_seconds.sql',import.meta.url),'utf8');
const funcs=[...definitions.matchAll(/^create(?: or replace)? function ([\w.]+)\([^]*?\bas (\$function\$|\$\$)([^]*?)\2;/gim)];
const def=name=>{const found=funcs.findLast(x=>x[1]===name);assert(found,name);return found[3];};
for(const name of ['lifecycle_hold','lifecycle_route','lifecycle_retry_hold','lifecycle_predecessor_hold']) assert(!/for\s+(?:update|share|key share)|pg_(?:try_)?advisory|\b(?:insert into|update public|delete from)\b/i.test(def('crm_security.'+name)),name+' must be pure');
for(const name of ['crm_prepare_external_delivery','crm_get_external_delivery','crm_begin_external_attempt','crm_finish_external_attempt','crm_retry_external_delivery','crm_block_external_delivery']) {
 const body=def('public.'+name);assert(body.indexOf('lifecycle_lock_delivery')>=0,name);
 assert((body.search(/for (?:update|share)/i)<0 || body.indexOf('lifecycle_lock_delivery')<body.search(/for (?:update|share)/i)),name+' locks scope before delivery');
}
for(const name of ['crm_claim_lifecycle_evidence','crm_record_lifecycle_evidence_check','crm_revoke_lifecycle_evidence','crm_reconcile_external_deliveries','crm_cleanup_lifecycle_retention','crm_cleanup_lifecycle_stop_audit','crm_finalize_meta_job','crm_finalize_website_job','crm_resolve_meta_intake','crm_publish_lifecycle_policy','crm_publish_lifecycle_producer_boundary','crm_activate_lifecycle_destination','crm_disable_lifecycle','crm_configure_lifecycle','crm_save_meta_connection','crm_publish_meta_form_mapping','crm_retire_meta_form_mapping','crm_retire_lifecycle_policy']) assert(def('public.'+name).includes('lifecycle_barrier'),name);
assert(def('crm_security.repair_lifecycle_evidence').includes('lifecycle_lock_delivery'));
assert(def('crm_security.command').includes('lifecycle_barrier'));
assert(def('crm_security.lifecycle_pending_handoff').includes('lifecycle_materialize_submission_safety'));
assert(def('crm_security.lifecycle_materialize_submission_safety').includes('lifecycle_has_barrier(true)'));
assert(!/lifecycle_scope_keys|pg_(?:try_)?advisory|crm_external_deliveries|crm_lifecycle_producer_ownership/.test(def('crm_security.lifecycle_materialize_submission_safety')));
assert(def('crm_security.command').includes('lifecycle_pending_handoff'));
assert(def('crm_security.accept_external_submission').includes('lifecycle_pending_handoff'));
assert(def('public.crm_list_pending_lifecycle_stops').includes('require_reader(true)'));
assert(def('crm_security.resolve_external_submission').includes('lifecycle_has_intake'));
assert(def('crm_security.accept_external_submission').includes('lifecycle_has_barrier'));
for(const [key,text] of [[460046,'barrier'],[460047,'opportunity'],[460048,'submission'],[460049,'reconcile']])assert(sql.includes(String(key)),text);
assert(!/insert into public\.crm_lifecycle_provider_contracts|alter_job|schedule\(/i.test(sql));
assert(!/pg_advisory_lock\(|pg_advisory_lock_shared\(/i.test(sql));
console.log('PASS advisory payload, typed optional proof, stop-first zero HTTP, scheduler isolation and complete entry-point/pure-hold protocol assertions');
