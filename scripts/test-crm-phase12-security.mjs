// Full CRM role matrix through real LOCAL Auth/PostgREST. No customer data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
assert(readFileSync('.git/HEAD','utf8').startsWith('ref: refs/heads/codex/'));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').flatMap(l=>{const m=l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);return m?[[m[1],m[2].trim().replace(/^['"]|['"]$/g,'')]]:[];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const sql=s=>execFileSync('psql',['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim();
const roles=['director','admin','receptionist','teacher','parent','student','pending'];const users=[],clients={};const nil='00000000-0000-0000-0000-000000000001';let checks=0;
const root=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cases=[
 ['crm_get_today',{},'operations'],['crm_search_leads',{p_query:'phase12 synthetic'},'operations'],['crm_list_intake_review',{},'operations'],['crm_get_workspace_detail',{p_lead:nil},'operations'],['crm_list_placements',{p_lead:nil},'operations'],['crm_get_enrollment_context',{p_lead:nil},'operations'],
 ['crm_get_submission_attribution',{p_submission:nil},'director'],['crm_get_revenue_entries_for_lead',{p_lead:nil},'director'],['crm_get_revenue_reconciliation_queue',{},'director'],['crm_get_meta_diagnostics',{},'director'],['crm_list_external_deliveries',{},'director'],['crm_insights_diagnostics',{},'director'],['crm_get_marketing_cohort',{p_from:'2026-01-01',p_to:'2026-01-02'},'director'],
 ['crm_claim_ingestion_jobs',{p_limit:1},'service'],['crm_claim_external_deliveries',{p_limit:1},'service'],['crm_claim_insights_sync',{},'service'],
];
try {
 for(const role of roles){
  const password=randomBytes(24).toString('hex'),email=`phase12-security-${randomUUID()}@example.invalid`;
  const {data,error}=await root.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'director'}});assert.ifError(error);users.push(data.user.id);sql(`update profiles set role='${role}' where id='${data.user.id}'`);
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);clients[role]=client;
 }
 clients.anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.service=root;
 const tables=sql("select c.relname,a.attname from pg_class c join pg_index i on i.indrelid=c.oid and i.indisprimary join pg_attribute a on a.attrelid=c.oid and a.attnum=i.indkey[0] where c.relnamespace='public'::regnamespace and c.relname like 'crm_%' order by 1").split('\n').map(row=>row.split('|'));
 for(const [role,client] of Object.entries(clients)){
  for(const [table,primaryKey] of tables){
   const read=await client.from(table).select('*').limit(1);assert.equal(read.error?.code,'42501',`${role} direct read ${table}`);checks++;
   const write=await client.from(table).delete().eq(primaryKey,nil);assert.equal(write.error?.code,'42501',`${role} direct delete ${table}`);checks++;
  }
  for(const [name,args,access] of cases){
   const allowed=access==='operations'?['director','admin','receptionist'].includes(role):role===access;
   const {error}=await client.rpc(name,args);
   if(allowed)assert.ifError(error);
   else assert(error && ['42501','PGRST301','PGRST302'].includes(error.code),`${role} bypass ${name}: ${error?.code}`);
   checks++;
  }
 }
 console.log(`PASS Phase12 real REST/table/RPC matrix: ${checks} checks, 9 identities, forged director metadata ignored`);
} finally {
 for(const id of users){const {error}=await root.auth.admin.deleteUser(id);assert.ifError(error);sql(`delete from activity_log where actor_id='${id}' or target_id='${id}'`);}
}
