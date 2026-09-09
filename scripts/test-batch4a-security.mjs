// Local-only REST security suite. --ui retains synthetic fixtures until Enter.
// Run sequentially with other batch suites; cleanup restores the director guard.
import { createServerClient } from '@supabase/ssr';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';

const root = new URL('../', import.meta.url);
assert.ok(!process.argv.includes('--ui') || process.stdin.isTTY, '--ui requires an interactive terminal so fixture cleanup can run');
assert.equal(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),'codex-migration');
const env = {};
for(const line of readFileSync(new URL('.env.local',root),'utf8').split('\n')) {
  const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if(m) env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'').trim();
}
const base='http://127.0.0.1:54321', container='supabase_db_hills-admin-next';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,base);
assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
function sql(input) {
  return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],
    {input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='045'"),'1');
assert.equal(sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"),'0');
const run='batch4a-'+randomUUID(), password=randomBytes(24).toString('base64url');
const users=[], records={}, service={service:true};
let checks=0;
async function request(actor,table,method='GET',body,query='',prefer='return=representation') {
  const res=await fetch(base+'/rest/v1/'+table+query,{method,redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{apikey:actor?.service?env.SUPABASE_SERVICE_ROLE_KEY:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Content-Type':'application/json',Prefer:prefer,...(actor?.token?{Authorization:'Bearer '+actor.token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,ok:res.ok,data:await res.json().catch(()=>null)};
}
function ok(r) { assert.ok(r.ok,JSON.stringify(r)); return r.data; }
async function create(table,body,actor=service) {
  const [row]=ok(await request(actor,table,'POST',body)); (records[table]??=[]).push(row.id); return row;
}
const row=(table,id)=>sql(`select row_to_json(t) from public.${table} t where id='${id}';`);
const count=table=>sql(`select count(*) from public.${table};`);
async function denyInsert(actor,table,body,query='',prefer) {
  const before=count(table); const r=await request(actor,table,'POST',body,query,prefer);
  assert.ok([401,403].includes(r.status),JSON.stringify(r)); assert.equal(count(table),before); checks++;
}
async function denyMutation(actor,table,id,method,body) {
  const before=row(table,id); const r=await request(actor,table,method,body,'?id=eq.'+id);
  if(r.ok) assert.deepEqual(r.data,[]); else assert.ok([401,403].includes(r.status),JSON.stringify(r));
  assert.equal(row(table,id),before); checks++;
}
async function makeUser(role,label=role) {
  const email=run+'-'+label+'@example.invalid';
  const res=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email,password,email_confirm:true})});
  assert.ok(res.ok); const u=await res.json(); const actor={id:u.id,email,role}; users.push(actor);
  sql(`update public.profiles set role='${role}' where id='${u.id}';`);
  const login=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.ok(login.ok); const session=await login.json(); actor.token=session.access_token; actor.refreshToken=session.refresh_token; return actor;
}
const assets=[];
const policies=sql("select json_agg(p) from (select * from pg_policies where schemaname='storage' order by policyname) p;");
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
async function rpc(actor,name,body) { return request(actor,'rpc/'+name,'POST',body); }
const snapshot=()=>sql("select json_build_array((select json_agg(a order by id) from public.storage_assets a),(select json_agg(b order by id) from public.storage_asset_bindings b));");
async function denied(action) { const before=snapshot(); const r=await action(); assert.equal(r.ok,false,JSON.stringify(r)); assert.equal(snapshot(),before); checks++; }
async function app(actor,operation,body) {
  const cookies=new Map();
  if(actor) {
    const client=createServerClient(base,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{
      getAll:()=>[...cookies].map(([name,value])=>({name,value})),
      setAll:items=>items.forEach(({name,value})=>cookies.set(name,value)),
    }});
    assert.equal((await client.auth.setSession({access_token:actor.token,refresh_token:actor.refreshToken})).error,null);
  }
  const r=await fetch('http://127.0.0.1:3101/api/storage/'+operation,{method:'POST',redirect:'error',
    headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify(body)});
  assert.equal(r.headers.get('cache-control'),'no-store');
  return {status:r.status,ok:r.ok,data:await r.json()};
}
async function reserve(actor,purpose,sid=null,tid=null,eid=null) {
  const a=ok(await rpc(actor,'reserve_storage_asset',{p_purpose:purpose,p_student_id:sid,p_teacher_id:tid,p_enrollment_id:eid}));
  assets.push(a); checks++; return a;
}
async function upload(actor,a,bytes=png) {
  const r=await fetch(base+'/storage/v1/object/'+a.bucket+'/'+a.path,{method:'POST',
    headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:'Bearer '+actor.token,'Content-Type':'image/png','x-upsert':'false'},body:bytes});
  assert.ok(r.ok,await r.text()); checks++;
}
async function ready(actor,a) { await upload(actor,a); ok(await app(actor,'finalize',{assetId:a.id})); checks++; }
try {
  for(const role of ['pending','parent','student','teacher','admin','director']) await makeUser(role);
  const get=r=>users.find(u=>u.role===r);
  const admin=get('admin'), director=get('director'), parent=get('parent'), student=get('student'), teacher=get('teacher');
  const otherParent=await makeUser('parent','other-parent'), otherTeacher=await makeUser('teacher','other-teacher');
  const missing=await makeUser('pending','missing'); sql("delete from public.profiles where id='"+missing.id+"';"); missing.role='missing';
  const t=await create('teachers',{full_name:run+' Teacher',email:teacher.email});
  const t2=await create('teachers',{full_name:run+' Other Teacher',email:otherTeacher.email});
  const g=await create('groups',{name:run+' Group',niveau:'A1',teacher_id:t.id});
  const children=[];
  for(let i=0;i<3;i++) children.push(await create('students',{full_name:run+' Child '+i,parent_email:i<2?parent.email:otherParent.email,email:i===0?student.email:null,groupe_id:i<2?g.id:null}));
  const [child,child2,unrelated]=children;
  const a=await reserve(student,'portfolio',child.id); await ready(student,a);
  const pf=await create('portfolios',{student_id:child.id,title:run,project_type:'Other',file_url:'asset:'+a.id,visible_to_parent:false,teacher_note:'forged'},student);
  assert.equal(pf.teacher_note,null); assert.equal(pf.visible_to_parent,true); checks+=2;
  const a2=await reserve(admin,'portfolio',child2.id); await ready(admin,a2);
  await create('portfolios',{student_id:child2.id,title:run,project_type:'Other',file_url:'asset:'+a2.id},admin);
  for(const actor of [null,...users]) {
    const canRead=[admin,director,parent,student,teacher].includes(actor);
    const result=await rpc(actor,'resolve_storage_asset',{p_asset_id:a.id});
    assert.equal(result.ok,canRead,JSON.stringify({role:actor?.role,result})); checks++;
    const signed=await app(actor,'sign',{assetId:a.id,expiresIn:99999999,path:'forged',actorId:admin.id});
    assert.equal(signed.ok,canRead); checks++;
    if(signed.ok) {
      assert.equal(signed.data.expiresIn,300);
      assert.ok(new URL(signed.data.url).pathname.endsWith('/'+a.path));
      const downloaded=await fetch(signed.data.url,{redirect:'error'});
      assert.equal(downloaded.status,200);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png); checks++;
      const token=new URL(signed.data.url).searchParams.get('token');
      const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
      assert.equal(claims.exp-claims.iat,300); checks++;
    }
    for(const table of ['storage_assets','storage_asset_bindings']) {
      await denied(()=>request(actor,table,'POST',table==='storage_assets'?{bucket_id:'documents',object_path:'forged',purpose:'student_photo'}:{asset_id:a.id,student_photo_id:unrelated.id}));
      await denied(()=>request(actor,table,'PATCH',{state:'active'},'?id=eq.'+a.id));
    }
    await denied(()=>rpc(actor,'finalize_storage_asset',{p_actor:student.id,p_asset_id:a.id,p_size:png.length,p_type:'image/png',p_version:'forged'}));
    await denied(()=>rpc(actor,'resolve_storage_asset',{p_asset_id:randomUUID()}));
  }
  ok(await rpc(parent,'resolve_storage_asset',{p_asset_id:a2.id})); checks++;
  await denied(()=>rpc(student,'resolve_storage_asset',{p_asset_id:a2.id}));
  for(const actor of [null,get('pending'),missing,parent,otherParent,otherTeacher])
    await denied(()=>rpc(actor,'reserve_storage_asset',{p_purpose:'portfolio',p_student_id:child.id}));
  for(const body of [{p_purpose:'portfolio',p_student_id:unrelated.id},{p_purpose:'teacher_photo',p_teacher_id:t2.id},
    {p_purpose:'legacy_unclassified'},{p_purpose:'portfolio',p_student_id:child.id,p_teacher_id:t.id},
    {p_purpose:'portfolio',p_student_id:child.id,p_path:a.path}])
    await denied(()=>rpc(student,'reserve_storage_asset',body));
  const teacherAsset=await reserve(teacher,'portfolio',child.id); await ready(teacher,teacherAsset);
  await denied(()=>create('portfolios',{student_id:unrelated.id,title:run,project_type:'Other',file_url:'asset:'+teacherAsset.id},teacher).then(()=>({ok:true})).catch(()=>({ok:false})));
  await denied(()=>request(admin,'students','PATCH',{photo_url:'asset:'+teacherAsset.id},'?id=eq.'+child.id));
  await denied(()=>request(student,'portfolios','PATCH',{visible_to_parent:false},'?id=eq.'+pf.id));
  await denied(()=>request(admin,'portfolios','PATCH',{student_id:unrelated.id},'?id=eq.'+pf.id));
  ok(await request(admin,'portfolios','PATCH',{visible_to_parent:false,visible_to_student:false},'?id=eq.'+pf.id));
  for(const actor of [parent,student]) await denied(()=>app(actor,'sign',{assetId:a.id}));
  for(const actor of [teacher,admin,director]) { ok(await app(actor,'sign',{assetId:a.id})); checks++; }
  ok(await request(admin,'portfolios','PATCH',{visible_to_parent:true,visible_to_student:true},'?id=eq.'+pf.id));
  for(const [hidden,visible,patch] of [[parent,student,{visible_to_parent:false,visible_to_student:true}], [student,parent,{visible_to_parent:true,visible_to_student:false}]]) {
    ok(await request(admin,'portfolios','PATCH',patch,'?id=eq.'+pf.id));
    await denied(()=>app(hidden,'sign',{assetId:a.id})); ok(await app(visible,'sign',{assetId:a.id})); checks++;
  }
  ok(await request(admin,'portfolios','PATCH',{visible_to_parent:true,visible_to_student:true},'?id=eq.'+pf.id));
  for(const table of ['storage_assets','storage_asset_bindings']) {
    for(const actor of [student,admin,service]) {
      await denied(()=>request(actor,table,'GET'));
      await denied(()=>request(actor,table,'DELETE',undefined,'?id=eq.'+a.id));
    }
  }
  await denied(()=>rpc(service,'reserve_storage_asset',{p_purpose:'student_photo'}));
  await denied(()=>rpc(service,'resolve_storage_asset',{p_asset_id:a.id}));
  await denied(()=>rpc(student,'get_storage_upload',{p_asset_id:a.id}));
  assert.throws(()=>sql("update public.profiles set role='unknown' where id='"+student.id+"';")); checks++;
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and (n.nspname='storage_security' or p.proname in ('reserve_storage_asset','get_storage_upload','resolve_storage_asset','finalize_storage_asset')) and not ('search_path=pg_catalog, pg_temp'=any(p.proconfig));"),'0'); checks++;
  const draft=await reserve(admin,'student_photo');
  await denied(()=>app(admin,'finalize',{assetId:draft.id}));
  await denied(()=>app(director,'finalize',{assetId:draft.id}));
  await ready(admin,draft);
  await denied(()=>app(admin,'finalize',{assetId:draft.id}));
  await denied(()=>app(admin,'sign',{assetId:draft.id}));
  const photoChild=await create('students',{full_name:run+' Photo Child',parent_email:parent.email,photo_url:'asset:'+draft.id},admin);
  ok(await app(parent,'sign',{assetId:draft.id})); checks++;
  await denied(()=>request(admin,'students','PATCH',{photo_url:'asset:'+draft.id},'?id=eq.'+unrelated.id));
  const replacement=await reserve(director,'student_photo',photoChild.id); await ready(director,replacement);
  ok(await request(director,'students','PATCH',{photo_url:'asset:'+replacement.id},'?id=eq.'+photoChild.id));
  await denied(()=>app(admin,'sign',{assetId:draft.id}));
  const tp=await reserve(admin,'teacher_photo',null,t.id); await ready(admin,tp);
  ok(await request(admin,'teachers','PATCH',{photo_url:'asset:'+tp.id},'?id=eq.'+t.id));
  ok(await app(director,'sign',{assetId:tp.id})); checks++;
  await denied(()=>app(teacher,'sign',{assetId:tp.id}));
  const enrollment=await create('enrollments',{student_id:child.id,status:'Submitted'});
  const document=await reserve(admin,'enrollment_document',child.id,null,enrollment.id); await ready(admin,document);
  ok(await request(admin,'enrollments','PATCH',{documents_urls:['asset:'+document.id]},'?id=eq.'+enrollment.id));
  ok(await app(director,'sign',{assetId:document.id})); checks++;
  await denied(()=>app(parent,'sign',{assetId:document.id}));
  const expired=await reserve(admin,'student_photo',child.id);
  sql("update public.storage_assets set expires_at=now()-interval '1 second' where id='"+expired.id+"'");
  await denied(()=>rpc(admin,'get_storage_upload',{p_asset_id:expired.id}));
  await denied(()=>app(admin,'finalize',{assetId:expired.id}));
  const wrong=await reserve(admin,'student_photo',child.id); await upload(director,wrong);
  await denied(()=>app(admin,'finalize',{assetId:wrong.id}));
  const invalid=await reserve(admin,'student_photo',child.id); await upload(admin,invalid,Buffer.from('not a png'));
  await denied(()=>app(admin,'finalize',{assetId:invalid.id}));
  const unclassified=await reserve(admin,'student_photo',child.id);
  sql("update public.storage_assets set state='staff_only',provenance='unclassified' where id='"+unclassified.id+"'");
  await denied(()=>app(admin,'sign',{assetId:unclassified.id}));
  const legacyId=randomUUID();
  sql("insert into public.storage_assets(id,bucket_id,object_path,purpose,uploader_id,state,provenance) values ('"+legacyId+"','documents','assets/"+legacyId+"','legacy_unclassified','"+admin.id+"','staff_only','synthetic_unknown');");
  await denied(()=>app(admin,'sign',{assetId:legacyId}));
  const registration={full_name:run+' Registration',telephone:'0600000000',email:run+'-registration@example.invalid',consent:true};
  async function register(body) { return fetch('http://127.0.0.1:3101/api/public/inscription',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:3101','x-real-ip':run},body:JSON.stringify(body)}); }
  const studentCount=count('students');
  assert.equal((await register({...registration,documents_urls:['https://example.invalid/forged']})).status,400);
  assert.equal(count('students'),studentCount); checks++;
  assert.equal((await register(registration)).status,200); checks++;
  assert.equal(sql("select json_agg(p) from (select * from pg_policies where schemaname='storage' order by policyname) p;"),policies); checks++;
  console.log('PASS Batch 4A: '+checks+' checks; broad Storage policies unchanged (NOT final isolation).');
  if(process.argv.includes('--ui')) {
    console.log('SYNTHETIC LOCAL UI FIXTURES '+JSON.stringify({password,users:users.slice(0,6).map(({email,role})=>({email,role})),childName:child.full_name}));
    process.stdin.resume(); await new Promise(resolve=>process.stdin.once('data',resolve)); process.stdin.pause();
  }
} finally {
  // Include only assets/records created by this run's synthetic users/UI.
  if(users.length) {
    const userList=users.map(u=>"'"+u.id+"'").join(',');
    const discovered=JSON.parse(sql("select coalesce(json_agg(json_build_object('id',id,'bucket',bucket_id,'path',object_path)),'[]') from public.storage_assets where uploader_id in ("+userList+");"));
    for(const a of discovered) if(!assets.some(x=>x.id===a.id)) assets.push(a);
    for(const table of ['students','teachers']) {
      const discoveredIds=JSON.parse(sql("select coalesce(json_agg(id),'[]') from public."+table+" where full_name like '"+run+"%';"));
      records[table]=[...new Set([...(records[table]||[]),...discoveredIds])];
    }
    if(records.students?.length) for(const table of ['portfolios','enrollments']) {
      const discoveredIds=JSON.parse(sql("select coalesce(json_agg(id),'[]') from public."+table+" where student_id in ("+records.students.map(id=>"'"+id+"'").join(',')+");"));
      records[table]=[...new Set([...(records[table]||[]),...discoveredIds])];
    }
  }
  for(const bucket of ['documents','portfolios']) {
    const prefixes=assets.filter(a=>a.bucket===bucket).map(a=>a.path);
    if(prefixes.length) {
      const r=await fetch(base+'/storage/v1/object/'+bucket,{method:'DELETE',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefixes})});
      assert.ok(r.ok,'Local fixture object cleanup failed');
    }
  }
  const quoted=values=>values.map(x=>"'"+x+"'::uuid").join(',');
  let cleanup='begin; lock table public.profiles in access exclusive mode;';
  if(assets.length) cleanup+="delete from public.storage_asset_bindings where asset_id in ("+quoted(assets.map(a=>a.id))+"); delete from public.storage_assets where id in ("+quoted(assets.map(a=>a.id))+");";
  for(const table of ['portfolios','enrollments','students','groups','teachers']) if(records[table]?.length) cleanup+='delete from public.'+table+' where id in ('+quoted(records[table])+');';
  if(users.length) cleanup+="alter table public.profiles disable trigger role_security_guard; delete from auth.users where id in ("+quoted(users.map(u=>u.id))+"); alter table public.profiles enable trigger role_security_guard; update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director'); delete from public.activity_log where actor_id in ("+quoted(users.map(u=>u.id))+");";
  const targetIds=[...Object.values(records).flat(),...assets.map(a=>a.id),...users.map(u=>u.id)];
  if(targetIds.length) cleanup+='delete from public.activity_log where target_id in ('+quoted(targetIds)+');';
  cleanup+="delete from public.anon_rate_limits where ip_key='"+run+"';";
  sql(cleanup+'commit;'); console.log('Synthetic local files/records removed; director guard restored.');
}
