// Shared local-stack helpers for the RWR-r5 next-action suites (no HTTP, synthetic data).
import { spawn, spawnSync } from 'node:child_process';

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
