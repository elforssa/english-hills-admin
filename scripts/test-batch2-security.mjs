// Run: node scripts/test-batch2-security.mjs [--app]
// Requires local Supabase, Docker, and migration 042. Never targets cloud.
// Synthetic fixtures are removed in finally; no existing records are deleted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';

const root = new URL('../', import.meta.url);
assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(), 'codex-migration');
const env = {};
for (const line of readFileSync(new URL('.env.local', root), 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '').trim();
}
const base = 'http://127.0.0.1:54321';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'Refusing non-local environment');
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
const container = 'supabase_db_hills-admin-next';
function sql(statement) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='041'"), '1');
// Receipt fixtures must never trigger an external email webhook.
assert.equal(sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"), '0', 'Refusing configured receipt webhooks');


assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='042'"), '1');
// Last-director races require exactly our synthetic directors. Never remove or
// demote pre-existing directors to manufacture this condition.
assert.equal(sql("select count(*) from public.profiles where role='director'"), '0',
  'Use a disposable local instance with no pre-existing directors for this suite');
const roles = ['pending','parent','student','teacher','admin','director'];
const run = `batch2-${randomUUID()}`;
const password = randomBytes(24).toString('base64url');
const users = [];
const emails = new Set();
const service = { service: true };
let checks = 0;
async function request(actor, path, method='POST', body={}) {
  const res = await fetch(base + path, {
    method, redirect:'error', signal:AbortSignal.timeout(30000),
    headers:{ apikey:actor?.service ? env.SUPABASE_SERVICE_ROLE_KEY : env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Content-Type':'application/json', ...(actor?.token ? { Authorization:`Bearer ${actor.token}` } : {}) },
    ...(method === 'GET' ? {} : {body:JSON.stringify(body)}),
  });
  return { status:res.status, data:await res.json().catch(() => null), ok:res.ok };
}
function ok(r) { assert.ok(r.ok, `HTTP ${r.status}: ${r.data?.code || ''} ${r.data?.message || r.data?.error || ''}`); return r.data; }
function deny(r) { assert.ok([401,403].includes(r.status), `Expected denial, got ${r.status}: ${JSON.stringify(r.data)}`); }
const rpc = (actor,name,args={}) => request(actor,'/rest/v1/rpc/'+name,'POST',args);
const snapshot = id => sql(`select row_to_json(p) from public.profiles p where id='${id}';`);
const setRole = (id,role) => sql(`update public.profiles set role='${role}' where id='${id}';`);
const getRole = id => sql(`select role from public.profiles where id='${id}';`);
async function makeUser(label,role='pending') {
  const email=`${run}-${label}@example.invalid`; emails.add(email);
  const u=ok(await request(service,'/auth/v1/admin/users','POST',{email,password,email_confirm:true}));
  const actor={id:u.id,email,role}; users.push(actor);
  assert.equal(getRole(actor.id),'pending');
  setRole(actor.id,role);
  const session=ok(await request(null,'/auth/v1/token?grant_type=password','POST',{email,password}));
  actor.token=session.access_token; actor.refreshToken=session.refresh_token;
  return actor;
}
function can(c,t,r) {
  return r!=='pending' && (c==='director' || c==='admin' && ['pending','parent','student','teacher'].includes(t) && ['parent','student','teacher'].includes(r));
}
function queue(target,role,issuer,extra='') {
  emails.add(target.email);
  sql(`delete from public.pending_roles where email='${target.email}';
    insert into public.pending_roles(email,role,invited_by,target_user_id,expires_at)
    values('${target.email}','${role}',${issuer ? "'"+issuer.id+"'" : 'null'},'${target.id}',now()+interval '1 day'); ${extra}`);
}
function concurrentSql(statement) {
  return new Promise(resolve=>{
    const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1']);
    let output=''; child.stdout.on('data',d=>output+=d); child.stderr.on('data',d=>output+=d);
    child.on('close',code=>resolve({code,output})); child.stdin.end(statement);
  });
}
async function app(actor,path,body) {
  const cookies=new Map();
  const client=createServerClient(base,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{
    getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:items=>items.forEach(({name,value})=>cookies.set(name,value)),
  }});
  assert.equal((await client.auth.setSession({access_token:actor.token,refresh_token:actor.refreshToken})).error,null);
  const r=await fetch('http://127.0.0.1:3101'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify(body)});
  return {status:r.status,ok:r.ok,data:await r.json()};
}
try {
  const pending=await makeUser('pending');
  deny(await rpc(pending,'claim_director_if_none')); // genuinely zero directors
  for(const role of roles.slice(1)) await makeUser(role,role);
  const actors=users.slice();
  const admin=actors.find(u=>u.role==='admin'), director=actors.find(u=>u.role==='director');
  // Owner-maintenance upserts must not inflate the last-director counter.
  sql(`insert into public.profiles(id,role) values('${director.id}','director') on conflict(id) do nothing;
    insert into public.profiles(id,role) values('${director.id}','director') on conflict(id) do update set role=excluded.role;`);
  assert.equal(sql("select director_count=(select count(*) from public.profiles where role='director') from role_security.director_guard"),'t');
  checks++;
  let target=await makeUser('target');
  for(const actor of actors) for(const current of roles) for(const desired of roles) {
    setRole(target.id,current);
    const before=snapshot(target.id);
    const result=await rpc(actor,'change_user_role',{p_user_id:target.id,p_role:desired});
    if(can(actor.role,current,desired)) {
      ok(result); assert.equal(getRole(target.id),desired);
      if(current!==desired) assert.equal(sql(`select actor_id from public.activity_log where target_id='${target.id}' and action='UPDATE' order by created_at desc,id desc limit 1;`),actor.id);
    } else { deny(result); assert.equal(snapshot(target.id),before); }
    checks++;
  }
  console.log('PASS 216 caller/current/requested role transitions and audit attribution');
  for(const actor of actors) for(const current of roles) for(const desired of roles) {
    setRole(target.id,current);
    const before=snapshot(target.id);
    const result=await rpc(actor,'prepare_role_invitation',{p_email:target.email.toUpperCase(),p_role:desired});
    if(!can(actor.role,current,desired)) { deny(result); assert.equal(snapshot(target.id),before); }
    else if(current!=='pending' && desired!==current) {
      assert.equal(result.status,400); assert.equal(result.data.code,'23514'); assert.equal(snapshot(target.id),before);
    } else {
      ok(result); assert.equal(snapshot(target.id),before);
      if(current==='pending') {
        assert.equal(ok(await rpc(target,'apply_pending_role')),desired);
        assert.equal(ok(await rpc(target,'apply_pending_role')),null);
        assert.equal(getRole(target.id),desired);
      }
    }
    assert.equal(sql(`select count(*) from public.pending_roles where email='${target.email}';`),'0');
    checks++;
  }
  console.log('PASS 216 invitation transitions, privileged reinvites and repeated activation');
  setRole(target.id,'pending');
  for(const actor of [null,...actors,service]) {
    const before=snapshot(target.id);
    for(const patch of [{role:'director'},{id:randomUUID()}]) {
      deny(await request(actor,`/rest/v1/profiles?id=eq.${target.id}`,'PATCH',patch));
      assert.equal(snapshot(target.id),before); checks++;
    }
    if(!actor?.service) {
      for(const patch of [{email:'other@example.invalid'},{linked_student_id:randomUUID()},{linked_teacher_id:randomUUID()}]) {
        deny(await request(actor,`/rest/v1/profiles?id=eq.${target.id}`,'PATCH',patch));
        assert.equal(snapshot(target.id),before); checks++;
      }
    }
    deny(await request(actor,'/rest/v1/profiles','POST',{id:target.id,role:'director'}));
    deny(await request(actor,`/rest/v1/profiles?id=eq.${target.id}`,'DELETE'));
    assert.equal(snapshot(target.id),before);
    queue(target,'student',director);
    const qbefore=sql(`select row_to_json(p) from public.pending_roles p where email='${target.email}';`);
    for(const [method,path,body] of [
      ['POST','/rest/v1/pending_roles',{email:target.email,role:'director'}],
      ['PATCH',`/rest/v1/pending_roles?email=eq.${target.email}`,{role:'director'}],
      ['DELETE',`/rest/v1/pending_roles?email=eq.${target.email}`,{}],
    ]) {
      deny(await request(actor,path,method,body));
      assert.equal(sql(`select row_to_json(p) from public.pending_roles p where email='${target.email}';`),qbefore); checks++;
    }
    deny(await rpc(actor,'claim_director_if_none'));
  }
  for(const actor of [null,service]) for(const [fn,args] of [
    ['change_user_role',{p_user_id:target.id,p_role:'director'}],
    ['prepare_role_invitation',{p_email:target.email,p_role:'director'}],['apply_pending_role',{}],
  ]) { deny(await rpc(actor,fn,args)); checks++; }
  console.log('PASS direct table bypasses, queue writes, anonymous and service-key-only RPC denial');

  for(const current of ['parent','student','teacher','admin','director']) {
    setRole(target.id,current); queue(target,'student',director);
    const before=snapshot(target.id);
    assert.equal(ok(await rpc(target,'apply_pending_role')),null);
    assert.equal(snapshot(target.id),before); checks++;
  }
  setRole(target.id,'pending');
  for(const [issuer,extra] of [
    [null,''],
    [director,`update public.pending_roles set expires_at=now()-interval '1 second' where email='${target.email}';`],
    [admin,''], // admin cannot authorize queued director
    [director,`update public.pending_roles set target_user_id='${pending.id}' where email='${target.email}';`],
  ]) {
    queue(target,'director',issuer,extra);
    assert.equal(ok(await rpc(target,'apply_pending_role')),null);
    assert.equal(getRole(target.id),'pending'); checks++;
  }
  queue(target,'admin',director);
  // Revocation of the issuer's authority is respected at activation.
  setRole(target.id,'director'); setRole(director.id,'teacher');
  setRole(pending.id,'pending'); queue(pending,'admin',director);
  assert.equal(ok(await rpc(pending,'apply_pending_role')),null);
  setRole(director.id,'director'); setRole(target.id,'pending');
  queue(target,'teacher',director);
  ok(await rpc(director,'change_user_role',{p_user_id:target.id,p_role:'student'}));
  assert.equal(ok(await rpc(target,'apply_pending_role')),null);
  assert.equal(getRole(target.id),'student'); checks+=2;
  console.log('PASS stale, expired, untrusted, mismatched and revoked-issuer queues');

  // Unknown/missing identities, NULL requests, private helpers and inherited
  // grants must not create alternative entrances to the role matrix.
  for (const args of [{p_user_id:target.id,p_role:null},{p_user_id:randomUUID(),p_role:'admin'}]) {
    const before=snapshot(target.id);
    deny(await rpc(director,'change_user_role',args));
    assert.equal(snapshot(target.id),before); checks++;
  }
  const missing=await makeUser('missing-profile');
  sql(`delete from public.profiles where id='${missing.id}';`);
  deny(await rpc(missing,'change_user_role',{p_user_id:target.id,p_role:'director'}));
  deny(await rpc(missing,'prepare_role_invitation',{p_email:target.email,p_role:'director'}));
  assert.equal(ok(await rpc(missing,'apply_pending_role')),null);
  assert.equal(sql("select bool_and(not has_function_privilege(r,f,'EXECUTE')) from unnest(array['anon','service_role']) r cross join unnest(array['public.change_user_role(uuid,text)','public.prepare_role_invitation(text,text)','public.apply_pending_role()']) f;"),'t');
  assert.equal(sql("select bool_and(not has_schema_privilege(r,'role_security','USAGE')) from unnest(array['anon','authenticated','service_role']) r;"),'t');
  assert.equal(sql("select bool_and(proconfig @> array['search_path=pg_catalog, pg_temp']) from pg_proc where proname in ('change_user_role','prepare_role_invitation','apply_pending_role','guard_directors');"),'t');
  checks+=6;

  // Real two-connection races: both transactions attempt removal of the only
  // two directors. Exercise row-trigger protection, Auth cascades and stronger
  // isolation. Failure must be a safeguard/serialization error, not a deadlock.
  for(const isolation of ['read committed','repeatable read']) for(const mode of ['demote','delete','mixed']) {
    setRole(target.id,'director'); setRole(director.id,'director');
    const deletionTarget=await makeUser('race-'+isolation.replace(' ','')+'-'+mode);
    // Use two disposable race users; keep the ordinary director as non-director.
    setRole(deletionTarget.id,'director'); setRole(director.id,'teacher');
    const ids=[target.id,deletionTarget.id];
    const results=await Promise.all(ids.map((id,i)=>{
      const deletion=mode==='delete'||mode==='mixed'&&i===1;
      const mutation=deletion ? `delete from auth.users where id='${id}';` : `update public.profiles set role='student' where id='${id}';`;
      return concurrentSql(`begin isolation level ${isolation}; set local statement_timeout='10s'; select count(*) from public.profiles; select pg_sleep(0.15); ${mutation} select pg_sleep(0.15); commit;`);
    }));
    assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
    const failed=results.find(r=>r.code!==0);
    assert.match(failed.output,/Cannot remove the last director|could not serialize/);
    assert.equal(sql("select count(*) from public.profiles where role='director'"),'1');
    assert.equal(sql("select director_count from role_security.director_guard"),'1');
    setRole(director.id,'director');
    // Recreate target if its Auth deletion won. Keep the target binding stable
    // for later tests by using the surviving profile instead.
    for(const id of ids) if(getRole(id)==='director') setRole(id,'student');
    if(!getRole(target.id)) {
      const replacement=await makeUser('target-replacement-'+isolation.replace(' ','')+'-'+mode);
      target=replacement;
    }
    checks++;
  }
  // Authenticated RPC race cannot use stale caller-role reads either.
  setRole(target.id,'director');
  const race=await Promise.all([
    rpc(director,'change_user_role',{p_user_id:director.id,p_role:'student'}),
    rpc(target,'change_user_role',{p_user_id:target.id,p_role:'student'}),
  ]);
  assert.equal(race.filter(r=>r.ok).length,1);
  assert.equal(race.find(r=>!r.ok).status,400);
  assert.equal(race.find(r=>!r.ok).data.code,'23514');
  assert.equal(sql("select count(*) from public.profiles where role='director'"),'1');
  setRole(director.id,'director'); setRole(target.id,'pending'); checks++;
  console.log('PASS concurrent demote/delete/mixed races and authenticated RPC races');

  if(process.argv.includes('--app')) {
    for(const [actor,role] of [[admin,'teacher'],[director,'admin']]) {
      setRole(target.id,'pending');
      ok(await app(actor,'/api/admin/update-role',{userId:target.id,role}));
      assert.equal(getRole(target.id),role);
      setRole(target.id,'pending');
      ok(await app(actor,'/api/admin/invite',{email:target.email,role}));
      assert.equal(ok(await rpc(target,'apply_pending_role')),role); checks+=2;
    }
    const before=snapshot(director.id);
    deny(await app(admin,'/api/admin/invite',{email:director.email,role:'student'}));
    assert.equal((await app(director,'/api/admin/invite',{email:director.email,role:'student'})).status,409);
    assert.equal(snapshot(director.id),before);
    const newEmail=`${run}-new-invite@example.invalid`; emails.add(newEmail);
    ok(await app(director,'/api/admin/invite',{email:newEmail,role:'teacher'}));
    const newId=sql(`select id from auth.users where email='${newEmail}';`);
    assert.ok(newId); users.push({id:newId,email:newEmail});
    assert.equal(getRole(newId),'pending');
    assert.equal(sql(`select invited_by from public.pending_roles where email='${newEmail}';`),director.id);
    assert.equal(ok(await rpc(director,'prepare_role_invitation',{p_email:newEmail,p_role:'teacher'})).needsDelivery,true);
    // Simulate email verification locally, then exercise a real Auth login and
    // activation. This is not a browser/email-link end-to-end test.
    ok(await request(service,`/auth/v1/admin/users/${newId}`,'PUT',{password,email_confirm:true}));
    const session=ok(await request(null,'/auth/v1/token?grant_type=password','POST',{email:newEmail,password}));
    const invited={id:newId,token:session.access_token};
    assert.equal(ok(await rpc(invited,'apply_pending_role')),'teacher');
    assert.equal(ok(await rpc(invited,'apply_pending_role')),null);
    assert.equal(getRole(newId),'teacher');
    checks+=3;
    console.log('PASS real HTTP role changes, existing invitations and new local Auth invitation');
  }
  assert.equal(sql("select director_count=(select count(*) from public.profiles where role='director') from role_security.director_guard"),'t');
  console.log(`PASS Batch 2: ${checks} checks`);
} finally {
  // Owner-only local teardown is atomic. Temporarily disable only the director
  // guard to restore the initial zero-director state; never expose a bypass RPC.
  // Target IDs/emails belong solely to this run. Do not touch other profiles.
  if(users.length) {
    const ids=[...new Set(users.map(u=>u.id))].map(id=>"'"+id+"'::uuid").join(',');
    const mails=[...emails].map(e=>"'"+e+"'").join(',');
    sql(`begin; lock table public.profiles in access exclusive mode;
      alter table public.profiles disable trigger role_security_guard;
      delete from public.pending_roles where email in (${mails});
      delete from auth.users where id in (${ids});
      alter table public.profiles enable trigger role_security_guard;
      update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
      delete from public.activity_log where actor_id in (${ids}) or target_id in (${ids});
      delete from public.rate_limits where user_id in (${ids}); commit;`);
    assert.equal(sql(`select count(*) from public.profiles where id in (${ids});`),'0');
    console.log('Synthetic fixtures removed; director guard restored');
  }
}
