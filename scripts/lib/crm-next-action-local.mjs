// Shared local-stack helpers for the RWR-r5 next-action suites (synthetic data only; local URLs only).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export const PORT = process.env.CRM_LOCAL_DB_PORT || '54322';
const ARGS = ['-X', '-qAt', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const ENV = { ...process.env, PGPASSWORD: 'postgres' };

export function sql(input) {
  const r = spawnSync('psql', ARGS, { input, encoding: 'utf8', env: ENV, maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw Object.assign(new Error(r.stderr || 'psql failed'), { stdout: r.stdout, stderr: r.stderr });
  return r.stdout.trim();
}

export function sqlAsync(input) {
  return new Promise(resolve => {
    const p = spawn('psql', ARGS, { env: ENV });
    let stdout = ''; let stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', status => resolve({ status, stdout: stdout.trim(), stderr }));
    p.stdin.end(input);
  });
}

export const q = value => `'${String(value).replaceAll("'", "''")}'`;
export const actor = id => `select set_config('request.jwt.claim.sub',${q(id)},true);`;

// Staff ids with a per-suite prefix; profiles get their roles from the trigger-made rows.
export function staffSetup(prefix) {
  const ids = [1, 2, 3].map(i => `${prefix}-0000-0000-0000-${String(i).padStart(12, '0')}`);
  sql(`insert into auth.users(id,email,aud,role,created_at,updated_at) values
   ${ids.map((id, i) => `(${q(id)},${q(`${prefix}-${i}@example.invalid`)},'authenticated','authenticated',now(),now())`).join(',')}
   on conflict (id) do nothing;
   update public.profiles set role=(array['director','admin','receptionist'])[right(id::text,1)::integer],full_name='Local staff '||right(id::text,1) where id::text like ${q(`${prefix}-%`)};`);
  return { director: ids[0], admin: ids[1], receptionist: ids[2] };
}

export const LIVE_POLICY = {
  weekly_hours: { 1: [['15:00', '20:00']], 2: [['10:00', '12:30'], ['15:20', '20:00']], 3: [['10:00', '12:30'], ['15:20', '20:00']], 4: [['10:00', '12:30'], ['15:20', '20:00']], 5: [['10:00', '12:30'], ['15:20', '20:00']], 6: [['10:00', '12:30'], ['15:20', '20:00']], 7: [] },
  opening_hours: { 1: [['14:00', '20:00']], 2: [['09:30', '20:00']], 3: [['09:30', '20:00']], 4: [['09:30', '20:00']], 5: [['09:30', '20:00']], 6: [['09:30', '20:00']], 7: [] },
  attempt_offsets: [0, 0, 1, 3, 5],
};

export function createLead(receptionist, label) {
  return sql(`begin;${actor(receptionist)}
   select public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name',${q(label)},'learner_name','Synthetic learner',
    'email','local-'||gen_random_uuid()||'@example.invalid','source_label','Manual'))->'lead'->>'id';commit;`).split('\n').pop();
}

// ---------------------------------------------------------------------------
// HTTP and browser suites: real GoTrue users on the local stack, removed by removeStaff().
// ---------------------------------------------------------------------------
export function localEnv() {
  const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').flatMap(line => {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
  }));
  // Local stack only: never a hosted project.
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('local Supabase URL required');
  return env;
}

// Creates confirmed users with the given roles and synthetic names; returns {id,email,role,password}.
export async function createStaff(env, run, roles) {
  const users = [];
  for (const [i, role] of roles.entries()) {
    const email = `${run}-${role}-${i}@example.invalid`, password = randomBytes(24).toString('base64url');
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, { method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }) });
    if (response.status !== 200) throw new Error(`user creation ${response.status}`);
    const user = await response.json();
    users.push({ id: user.id, email, role, password });
    sql(`update public.profiles set role=${q(role)},full_name=${q(`Accueil synthétique ${i + 1}`)} where id=${q(user.id)}`);
  }
  return users;
}

export async function signIn(env, user) {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST',
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }) });
  if (response.status !== 200) throw new Error(`sign-in ${response.status}`);
  return (await response.json()).access_token;
}

// Removes everything the synthetic staff created, then the staff themselves.
export function removeStaff(ids) {
  if (!ids.length) return;
  const list = ids.map(q).join(','), mine = `select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${list}))`;
  sql(`begin;
 lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
 alter table public.crm_activities disable trigger crm_activities_immutable;alter table public.crm_submissions disable trigger crm_submission_immutable;alter table public.crm_command_requests disable trigger crm_requests_immutable;alter table public.crm_followup_policies disable trigger crm_policy_immutable;alter table public.placement_tests disable trigger crm_placement_integrity;
 with t as(delete from public.crm_tasks where lead_id in(${mine}) returning id),a as(delete from public.crm_activities where lead_id in(${mine}) returning id) select count(*) from t;
 delete from public.placement_tests where crm_lead_id in(${mine});
 with a as(delete from public.crm_activities where actor_id in(${list}) returning id),s as(delete from public.crm_submissions where resolved_by in(${list}) returning id),l as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by in(${list})) returning id) select count(*) from l;
 delete from public.crm_contacts where created_by in(${list});delete from public.crm_command_requests where actor_scope in(${list});delete from public.crm_followup_policies where created_by in(${list});
 alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;alter table public.placement_tests enable trigger crm_placement_integrity;
 alter table public.profiles disable trigger role_security_guard;delete from auth.users where id in(${list});update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table public.profiles enable trigger role_security_guard;
 delete from public.activity_log where actor_id in(${list}) or target_id in(${list});delete from public.rate_limits where user_id in(${list});commit;`);
}

// A time inside the current policy's window ('calling' or 'opening'), `days` ahead on the centre clock.
export function slotAt(kind, days, hhmm = '16:00') {
  return sql(`select to_json(crm_security.window_at(crm_security.current_policy_id(),${q(kind)},
   (((now() at time zone public.centre_utc_offset())::date+${Number(days)})::timestamp+${q(hhmm)}::time) at time zone public.centre_utc_offset()))#>>'{}'`);
}
