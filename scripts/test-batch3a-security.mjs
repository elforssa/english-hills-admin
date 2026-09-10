// Local-only integration tests. Use --app for local API tests, --ui to retain
// synthetic fixtures until Enter is pressed for manual browser verification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

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

assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='043'"),'1');
assert.equal(sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"),'0');
const run='batch3a-'+randomUUID(), password=randomBytes(24).toString('base64url');
const roles=['pending','parent','student','teacher','admin','director'];
const users=[], records={}, service={service:true};
let checks=0;
const hidden=['salaire_mensuel','taux_horaire','iban','notes','contract_type','telephone','photo_url','certifications','niveaux_autorises','created_at','updated_at','deleted_at'];
async function request(actor,path,method='GET',body,extraHeaders={}) {
  const res=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{apikey:actor?.service?env.SUPABASE_SERVICE_ROLE_KEY:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Content-Type':'application/json',Prefer:'return=representation',
      ...(actor?.token?{Authorization:'Bearer '+actor.token}:{}),...extraHeaders},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {ok:res.ok,status:res.status,data:await res.json().catch(()=>null)};
}
function ok(r) { assert.ok(r.ok,`HTTP ${r.status}: ${JSON.stringify(r.data)}`); return r.data; }
const rpc=(a,name,args={})=>request(a,'/rest/v1/rpc/'+name,'POST',args);
function blockedRead(r) {
  if(r.ok) assert.deepEqual(r.data,[]);
  else assert.ok([401,403].includes(r.status));
}
function safe(rows) {
  for(const row of rows) {
    assert.deepEqual(Object.keys(row).sort(),['email','full_name','id']);
    for(const key of hidden) assert.ok(!(key in row));
  }
}
function snapshot(table,id) { return sql(`select row_to_json(t) from public.${table} t where id='${id}';`); }
async function create(table,body,actor=service) {
  const [row]=ok(await request(actor,'/rest/v1/'+table,'POST',body));
  (records[table]??=[]).push(row.id); return row;
}
async function makeUser(role,label=role) {
  const email=run+'-'+label+'@example.invalid';
  const u=ok(await request(service,'/auth/v1/admin/users','POST',{email,password,email_confirm:true}));
  const actor={id:u.id,email,role}; users.push(actor);
  sql(`update public.profiles set role='${role}' where id='${u.id}';`);
  const session=ok(await request(null,'/auth/v1/token?grant_type=password','POST',{email,password}));
  actor.token=session.access_token; actor.refreshToken=session.refresh_token;
  return actor;
}
async function app(actor,path,body) {
  const cookies=new Map();
  const client=createServerClient(base,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{
    getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:items=>items.forEach(({name,value})=>cookies.set(name,value)),
  }});
  assert.equal((await client.auth.setSession({access_token:actor.token,refresh_token:actor.refreshToken})).error,null);
  const res=await fetch('http://127.0.0.1:3101'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify(body)});
  return {ok:res.ok,status:res.status,data:await res.json()};
}
try {
  for(const role of roles) await makeUser(role);
  const teacher=users.find(u=>u.role==='teacher'), parent=users.find(u=>u.role==='parent'), student=users.find(u=>u.role==='student');
  const admin=users.find(u=>u.role==='admin'), director=users.find(u=>u.role==='director');
  const teacher2=await makeUser('teacher','teacher2');
  const missing=await makeUser('pending','missing');
  sql(`delete from public.profiles where id='${missing.id}';`);
  missing.role='missing';
  const hr={salaire_mensuel:12345.67,taux_horaire:321.09,iban:'SYNTHETIC-PRIVATE-IBAN',notes:'SYNTHETIC-HR-NOTE',contract_type:'Employé',telephone:'0000000000',certifications:['private'],niveaux_autorises:['A1']};
  const t1=await create('teachers',{full_name:run+' Teacher One',email:teacher.email,...hr},admin);
  const t2=await create('teachers',{full_name:run+' Teacher Two',email:teacher2.email,...hr},director);
  const archived=await create('teachers',{full_name:run+' Archived',email:run+'-archived@example.invalid',...hr,deleted_at:new Date().toISOString()});
  const g1=await create('groups',{name:run+' Group One',niveau:'A1',teacher_id:t1.id,jours:'Lundi',horaire:'10:00–11:00',annee:'2026-2027'});
  const g2=await create('groups',{name:run+' Group Two',niveau:'A1',teacher_id:t2.id,jours:'Mardi',horaire:'10:00–11:00'});
  const s1=await create('students',{full_name:run+' Learner',email:student.email,parent_email:parent.email,groupe_id:g1.id,status:'Enrolled',niveau_cefr:'A1'});
  const s2=await create('students',{full_name:run+' Other Learner',email:run+'-other@example.invalid',parent_email:run+'-other-parent@example.invalid',groupe_id:g2.id,status:'Enrolled'});
  await create('payroll',{teacher_id:t1.id,teacher_name:t1.full_name,mois:'Janvier',annee:'2026',taux_horaire:hr.taux_horaire,salaire_brut:hr.salaire_mensuel,salaire_net:9999,notes:hr.notes});
  for(const actor of [null,...users]) {
    const privileged=['admin','director'].includes(actor?.role);
    for(const select of ['*','id,salaire_mensuel,taux_horaire,iban,notes']) {
      const r=await request(actor,`/rest/v1/teachers?id=eq.${t1.id}&select=${select}`);
      if(privileged) { assert.equal(ok(r)[0].iban,hr.iban); assert.equal(r.data[0].salaire_mensuel,hr.salaire_mensuel); }
      else blockedRead(r);
      checks++;
    }
    const pay=await request(actor,`/rest/v1/payroll?teacher_id=eq.${t1.id}&select=*`);
    if(privileged) assert.equal(ok(pay)[0].taux_horaire,hr.taux_horaire); else blockedRead(pay);
    const embedded=await request(actor,`/rest/v1/groups?id=eq.${g1.id}&select=id,teachers(*)`);
    if(embedded.ok) for(const row of embedded.data) {
      if(privileged) assert.equal(row.teachers.iban,hr.iban);
      else assert.equal(row.teachers,null);
    } else assert.ok([401,403].includes(embedded.status));
    const directory=await rpc(actor,'get_teacher_directory');
    if(roles.includes(actor?.role)&&actor.role!=='pending') {
      const rows=ok(directory); safe(rows);
      assert.ok(rows.some(t=>t.id===t1.id)); assert.ok(rows.some(t=>t.id===t2.id));
      assert.ok(!rows.some(t=>t.id===archived.id));
      assert.deepEqual(ok(await rpc(actor,'get_teacher_directory',{p_teacher_id:archived.id})),[]);
      assert.equal(ok(await rpc(actor,'get_teacher_directory',{p_teacher_id:t1.id}))[0].email,teacher.email);
    } else assert.ok([401,403].includes(directory.status));
    checks+=3;
    for(const patch of [{salaire_mensuel:999999},{taux_horaire:9999},{iban:'FORGED'},{notes:'FORGED'},{email:run+'-forged@example.invalid'}]) {
      const before=snapshot('teachers',t1.id);
      const r=await request(actor,`/rest/v1/teachers?id=eq.${t1.id}`,'PATCH',patch);
      if(privileged) {
        assert.equal(ok(r)[0][Object.keys(patch)[0]],Object.values(patch)[0]);
        ok(await request(service,`/rest/v1/teachers?id=eq.${t1.id}`,'PATCH',{...hr,email:teacher.email}));
      } else { if(r.ok) assert.ok(r.data===null||r.data.length===0); else assert.ok([401,403].includes(r.status)); assert.equal(snapshot('teachers',t1.id),before); }
      checks++;
    }
    if(!privileged) {
      const before=snapshot('teachers',t1.id);
      const insert=await request(actor,'/rest/v1/teachers','POST',{id:t1.id,full_name:'FORGED',email:teacher.email,...hr});
      assert.ok([401,403].includes(insert.status));
      const upsert=await request(actor,'/rest/v1/teachers?on_conflict=id','POST',{id:t1.id,full_name:'FORGED',email:teacher.email,...hr},
        {Prefer:'resolution=merge-duplicates,return=representation'});
      assert.ok([401,403].includes(upsert.status));
      const del=await request(actor,`/rest/v1/teachers?id=eq.${t1.id}`,'DELETE');
      if(del.ok) assert.ok(del.data===null||del.data.length===0); else assert.ok([401,403].includes(del.status));
      assert.equal(snapshot('teachers',t1.id),before); checks+=3;
    }
  }
  console.log('PASS table/directory/payroll role matrix, embedded reads and protected-field mutations');
  for(const actor of [teacher,parent,student,admin,director]) {
    for(const query of ['select=iban','select=*,teachers(*)','iban=eq.SYNTHETIC-PRIVATE-IBAN','order=salaire_mensuel']) {
      const result=await request(actor,'/rest/v1/rpc/get_teacher_directory?'+query,'POST',{});
      assert.ok([400,404].includes(result.status),JSON.stringify(result)); checks++;
    }
  }
  assert.equal(ok(await rpc(teacher,'get_my_teacher_id')),t1.id);
  assert.equal(ok(await rpc(teacher2,'get_my_teacher_id')),t2.id);
  assert.equal(sql(`select linked_teacher_id is null from public.profiles where id='${teacher.id}'`),'t');
  for(const actor of [teacher,parent,student]) {
    const roster=ok(await request(actor,`/rest/v1/students?id=in.(${s1.id},${s2.id})&select=id`));
    assert.deepEqual(roster.map(s=>s.id),[s1.id]); checks++;
  }
  const attendance=await create('attendance',{student_id:s1.id,group_id:g1.id,session_date:'2026-09-08',status:'Présent'},teacher);
  assert.equal(ok(await request(teacher,`/rest/v1/attendance?id=eq.${attendance.id}`))[0].student_id,s1.id);
  const forbidden=await request(teacher,'/rest/v1/attendance','POST',{student_id:s2.id,group_id:g2.id,session_date:'2026-09-08',status:'Présent'});
  assert.equal(forbidden.status,403); checks+=3;
  for(const sender of [parent,student]) {
    const [recipient]=ok(await rpc(sender,'get_teacher_directory',{p_teacher_id:t1.id}));
    const msg=await create('messages',{from_user_email:sender.email,to_user_email:recipient.email,subject:run,body:'Synthetic directory-recipient test'},sender);
    assert.equal(ok(await request(teacher,`/rest/v1/messages?id=eq.${msg.id}`))[0].body,'Synthetic directory-recipient test'); checks++;
  }
  assert.equal(sql("select has_function_privilege('anon','public.get_teacher_directory(uuid)','execute') or has_function_privilege('service_role','public.get_teacher_directory(uuid)','execute')"),'f');
  assert.equal(sql("select proconfig @> array['search_path=pg_catalog, pg_temp'] from pg_proc where oid='public.get_teacher_directory(uuid)'::regprocedure"),'t');
  console.log('PASS directory bypasses, unchanged RLS identity, rosters, attendance and messaging');
  // Exercise the actual browser adapter against local PostgREST. Only replace
  // its client factory import; no DOM/browser rendering is claimed by this test.
  const adapterSource=readFileSync(new URL('src/lib/teacher-directory.js',root),'utf8')
    .replace("import { getBrowserClient } from './supabase';",'')
    .replaceAll('export async function','async function');
  const adapterFactory=new Function('getBrowserClient',adapterSource+'\nreturn {getTeacherDirectory,getMyTeacher};');
  for(const actor of [teacher,parent,student,admin,director]) {
    const client=createClient(base,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:'Bearer '+actor.token}}});
    const adapter=adapterFactory(()=>client);
    const directory=await adapter.getTeacherDirectory(); safe(directory);
    assert.ok(directory.some(t=>t.id===t1.id));
    assert.equal((await adapter.getTeacherDirectory({id:t1.id}))[0].email,teacher.email);
    assert.equal((await adapter.getMyTeacher())?.id??null,actor===teacher?t1.id:null);
    checks+=3;
  }
  console.log('PASS shared portal/group/timetable adapter with real local Supabase clients');
  // Ensure the reviewed non-admin modules cannot silently return to Teacher.*.
  for(const name of ['teacher-portal','parent-portal','student-portal','groups','groups/[id]','timetable']) {
    const source=readFileSync(new URL('src/app/(admin)/'+name+'/page.jsx',root),'utf8');
    assert.ok(source.includes('@/lib/teacher-directory')); assert.ok(!source.includes('entities.Teacher.')); checks++;
  }
  if(process.argv.includes('--app')) {
    for(const actor of users.filter(u=>roles.includes(u.role))) {
      const r=await app(actor,'/api/admin/payroll',{teacher_id:t1.id,mois:actor.role==='director'?'Mars':'Février',annee:'2026',heures:20});
      if(['admin','director'].includes(actor.role)) {
        const {payroll}=ok(r); (records.payroll??=[]).push(payroll.id);
        assert.equal(payroll.salaire_brut,hr.salaire_mensuel); assert.equal(payroll.taux_horaire,hr.taux_horaire);
      } else assert.equal(r.status,403);
      checks++;
    }
    console.log('PASS payroll API authorization and privileged salary calculation');
  }
  console.log(`PASS Batch 3A: ${checks} checks`);
  if(process.argv.includes('--ui')) {
    console.log('LOCAL SYNTHETIC UI FIXTURES '+JSON.stringify({password,users:users.filter(u=>['teacher','parent','student','admin'].includes(u.role)).map(({email,role})=>({email,role})),groupId:g1.id}));
    console.log('Press Enter after browser checks to remove fixtures.');
    process.stdin.resume(); await new Promise(resolve=>process.stdin.once('data',resolve)); process.stdin.pause();
  }
} finally {
  const ids=Object.values(records).flat(), userIds=users.map(u=>u.id);
  // Atomic teardown touches only generated UUIDs. The owner-only temporary
  // guard disable restores the original director count; no bypass is deployed.
  let cleanup='begin; lock table public.profiles in access exclusive mode;';
  for(const table of ['messages','attendance','payroll','students','groups','teachers']) if(records[table]?.length)
    cleanup+=`delete from public.${table} where id in (${records[table].map(id=>"'"+id+"'::uuid").join(',')});`;
  if(userIds.length) {
    const list=userIds.map(id=>"'"+id+"'::uuid").join(',');
    cleanup+=`alter table public.profiles disable trigger role_security_guard; delete from auth.users where id in (${list});
      alter table public.profiles enable trigger role_security_guard;
      update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
      delete from public.rate_limits where user_id in (${list});`;
  }
  if([...ids,...userIds].length) {
    const list=[...ids,...userIds].map(id=>"'"+id+"'::uuid").join(',');
    cleanup+=`delete from public.activity_log where actor_id in (${list}) or target_id in (${list});`;
  }
  sql(cleanup+'commit;');
  console.log('Synthetic Batch 3A fixtures removed; guard restored.');
}
