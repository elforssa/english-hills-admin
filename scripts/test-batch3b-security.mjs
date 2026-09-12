// Local-only REST security suite. --ui retains synthetic fixtures until Enter.
// Run sequentially with other batch suites; cleanup restores the director guard.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';

const root = new URL('../', import.meta.url);
assert.ok(['codex-migration', 'codex/storage-hardening-final'].includes(
  execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),
));
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
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='044'"),'1');
assert.equal(sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')"),'0');
const run='batch3b-'+randomUUID(), password=randomBytes(24).toString('base64url');
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
  assert.ok(login.ok); actor.token=(await login.json()).access_token; return actor;
}
try {
  for(const role of ['pending','parent','student','teacher','admin','director']) await makeUser(role);
  const byRole=role=>users.find(u=>u.role===role);
  const parent=byRole('parent'), teacher=byRole('teacher'), admin=byRole('admin'), director=byRole('director');
  const otherParent=await makeUser('parent','other-parent'), otherTeacher=await makeUser('teacher','other-teacher');
  const unlinked=await makeUser('teacher','unlinked');
  const missing=await makeUser('pending','missing'); sql(`delete from public.profiles where id='${missing.id}';`); missing.role='missing';
  const t1=await create('teachers',{full_name:run+' Teacher One',email:teacher.email});
  const t2=await create('teachers',{full_name:run+' Teacher Two',email:otherTeacher.email});
  const group=await create('groups',{name:run+' Group',niveau:'A1',teacher_id:t1.id});
  const children=[];
  for(let i=0;i<3;i++) children.push(await create('students',{full_name:run+' Child '+i,parent_email:i<2?parent.email:otherParent.email,
    email:i===0?byRole('student').email:run+'-child'+i+'@example.invalid',status:'Enrolled'}));
  const enrollments=[];
  for(const child of children) enrollments.push(await create('enrollments',{student_id:child.id,status:'Validated',group_id:group.id}));
  const enrollment={student_id:children[0].id,status:'Submitted',date_inscription:'2026-09-08',notes:'Synthetic request'};
  const leave={teacher_id:t1.id,teacher_name:t1.full_name,date_debut:'2026-10-01',date_fin:'2026-10-02',type_conge:'Personnel',status:'En attente',notes:'Synthetic request'};
  const l1=await create('leave_requests',leave,teacher);
  const l2=await create('leave_requests',{...leave,teacher_id:t2.id,teacher_name:t2.full_name},otherTeacher);
  for(const actor of [null,...users]) {
    const staff=['admin','director'].includes(actor?.role);
    const e=ok(await request(actor,'enrollments','GET',undefined,'?id=in.('+enrollments.map(x=>x.id).join(',')+')&select=id'));
    const visible=staff||actor===teacher?enrollments:actor===parent?enrollments.slice(0,2):actor===otherParent?enrollments.slice(2):[];
    assert.deepEqual(e.map(x=>x.id).sort(),visible.map(x=>x.id).sort()); checks++;
    const l=ok(await request(actor,'leave_requests','GET',undefined,`?id=in.(${l1.id},${l2.id})&select=id`));
    const own=staff?[l1,l2]:actor===teacher?[l1]:actor===otherTeacher?[l2]:[];
    assert.deepEqual(l.map(x=>x.id).sort(),own.map(x=>x.id).sort()); checks++;
    if(!staff) {
      for(const patch of [{status:'Validated'},{group_id:group.id},{student_id:children[2].id},{notes:'overwrite'}]) await denyMutation(actor,'enrollments',enrollments[0].id,'PATCH',patch);
      await denyMutation(actor,'enrollments',enrollments[0].id,'DELETE');
      for(const patch of [{status:'Approuvé'},{status:'Refusé'},{remplacant:'forged'},{teacher_id:t2.id},{notes:'overwrite'}]) await denyMutation(actor,'leave_requests',l1.id,'PATCH',patch);
      await denyMutation(actor,'leave_requests',l1.id,'DELETE');
      if(actor!==parent) await denyInsert(actor,'enrollments',enrollment);
      if(actor!==teacher) await denyInsert(actor,'leave_requests',leave);
    }
  }
  for(const child of children.slice(0,2)) assert.equal((await create('enrollments',{...enrollment,student_id:child.id},parent)).status,'Submitted');
  checks+=2;
  const archived=await create('students',{full_name:run+' Archived Child',parent_email:parent.email,deleted_at:new Date().toISOString()});
  await denyInsert(parent,'enrollments',{...enrollment,student_id:archived.id});
  const {status: _enrollmentStatus,...defaultEnrollment}=enrollment;
  assert.equal((await create('enrollments',defaultEnrollment,parent)).status,'Submitted'); checks++;
  const {status: _leaveStatus,...defaultLeave}=leave;
  assert.equal((await create('leave_requests',defaultLeave,teacher)).status,'En attente'); checks++;
  for(const patch of [{status:'Under Review'},{status:'Validated'},{status:'Rejected'},{status:'Trial'},{status:null},{group_id:group.id},
    {student_id:children[2].id},{student_id:null},{documents_urls:['https://example.invalid/forged']},{created_at:'2000-01-01'},{updated_at:'2000-01-01'}])
    await denyInsert(parent,'enrollments',{...enrollment,...patch});
  for(const patch of [{teacher_id:t2.id},{teacher_id:null},{teacher_name:'forged'},{status:'Approuvé'},{status:'Refusé'},{status:null},
    {remplacant:t2.full_name},{date_fin:'2026-09-01'},{created_at:'2000-01-01'},{updated_at:'2000-01-01'}])
    await denyInsert(teacher,'leave_requests',{...leave,...patch});
  for(const [actor,table,body,id] of [[parent,'enrollments',enrollment,enrollments[0].id],[teacher,'leave_requests',leave,l1.id]]) {
    const before=row(table,id);
    await denyInsert(actor,table,{...body,id},'?on_conflict=id','resolution=merge-duplicates,return=representation');
    assert.equal(row(table,id),before);
    // Ignore-duplicates may succeed as a no-op; it must not change any row.
    const ignored=await request(actor,table,'POST',{...body,id},'?on_conflict=id','resolution=ignore-duplicates,return=representation');
    if(ignored.ok) assert.deepEqual(ignored.data,[]); else assert.ok([401,403].includes(ignored.status));
    assert.equal(row(table,id),before); checks++;
    await denyInsert(actor,table,[body,{...body,...(table==='enrollments'?{student_id:children[2].id}:{teacher_id:t2.id})}]);
  }
  console.log('PASS ownership, multi-child reads, constrained submissions, mutations, upserts and atomic bulk rejection');
  for(const staff of [admin,director]) {
    // Batch 4C permits only registry-backed asset references in persisted
    // enrollment documents. This staff workflow test concerns review/decision
    // authority, so it deliberately uses no attachment rather than a legacy
    // arbitrary path.
    const e=await create('enrollments',{...enrollment,status:'Under Review',documents_urls:[]},staff);
    for(const status of ['Validated','Rejected']) {
      assert.equal(ok(await request(staff,'enrollments','PATCH',{status,group_id:group.id},'?id=eq.'+e.id))[0].status,status); checks++;
    }
    const l=await create('leave_requests',{...leave,status:'Approuvé',remplacant:t2.full_name},staff);
    for(const status of ['Refusé','Approuvé']) {
      assert.equal(ok(await request(staff,'leave_requests','PATCH',{status,remplacant:'Staff replacement'},'?id=eq.'+l.id))[0].status,status); checks++;
    }
    assert.equal(ok(await request(staff,'enrollments','DELETE',undefined,'?id=eq.'+e.id)).length,1);
    assert.equal(ok(await request(staff,'leave_requests','DELETE',undefined,'?id=eq.'+l.id)).length,1); checks+=2;
  }
  // A teacher can still read a decided request, but cannot edit it afterward.
  ok(await request(admin,'leave_requests','PATCH',{status:'Approuvé',remplacant:t2.full_name},'?id=eq.'+l1.id));
  assert.equal(ok(await request(teacher,'leave_requests','GET',undefined,'?id=eq.'+l1.id))[0].status,'Approuvé');
  await denyMutation(teacher,'leave_requests',l1.id,'PATCH',{status:'En attente'});
  console.log(`PASS Batch 3B: ${checks} checks`);
  if(process.argv.includes('--ui')) {
    console.log('SYNTHETIC LOCAL UI FIXTURES '+JSON.stringify({password,users:users.slice(0,6).map(({email,role})=>({email,role})),childName:children[0].full_name,teacherName:t1.full_name}));
    console.log('Press Enter after UI checks to clean up.');
    process.stdin.resume(); await new Promise(resolve=>process.stdin.once('data',resolve)); process.stdin.pause();
  }
} finally {
  const ids=Object.values(records).flat(), userIds=users.map(u=>u.id);
  const quoted=values=>values.map(x=>"'"+x+"'::uuid").join(',');
  let cleanup='begin; lock table public.profiles in access exclusive mode;';
  // Also remove UI-created requests and notifications scoped to these fixtures.
  if(records.students?.length) cleanup+=`delete from public.enrollments where student_id in (${quoted(records.students)});`;
  if(records.teachers?.length) cleanup+=`delete from public.leave_requests where teacher_id in (${quoted(records.teachers)});`;
  if(users.length) cleanup+=`delete from public.notifications where recipient_email in (${users.map(u=>"'"+u.email+"'").join(',')});`;
  for(const table of ['enrollments','leave_requests','students','groups','teachers']) if(records[table]?.length)
    cleanup+=`delete from public.${table} where id in (${quoted(records[table])});`;
  if(users.length) cleanup+=`alter table public.profiles disable trigger role_security_guard;
    delete from auth.users where id in (${quoted(userIds)}); alter table public.profiles enable trigger role_security_guard;
    update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
    delete from public.rate_limits where user_id in (${quoted(userIds)});`;
  const auditConditions=[];
  if(userIds.length) auditConditions.push(`actor_id in (${quoted(userIds)})`);
  if(ids.length) auditConditions.push(`target_id in (${quoted(ids)})`);
  if(auditConditions.length) cleanup+=`delete from public.activity_log where ${auditConditions.join(' or ')};`;
  sql(cleanup+'commit;'); console.log('Synthetic fixtures removed; director guard restored.');
}
