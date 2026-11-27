// Reads the local database catalog for the receptionist list tests (plan RPW-r2, ADR-018).
// Local only: the container name is the repository's default local stack.
import { execFileSync } from 'node:child_process';
import { CAPABILITIES } from '../../src/lib/roleAccess.mjs';
import { assertLocalStack } from './local-stack.mjs';

export const ROLES = ['director', 'admin', 'receptionist', 'teacher', 'parent', 'student', 'pending'];

export function sql(statement) {
  assertLocalStack({ container: 'supabase_db_hills-admin-next' }); // follow-ups 142 (item 11)
  return execFileSync('docker', ['exec', '-i', 'supabase_db_hills-admin-next',
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }).trim();
}

export function sqlJson(statement) {
  const out = sql(statement);
  return out ? JSON.parse(out) : null;
}

const SQL_ROLES = Object.fromEntries(Object.values(CAPABILITIES).map(c => [c.sql, c.roles]));
const roleList = text => [...text.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);

// Classifies one function by the gate its body opens with. Outcome for the receptionist:
// 'open', 'locked', 'rls' (security invoker: row policies decide) or 'manual' (pinned by md5).
export function classify({ src, definer }) {
  const text = src.replace(/\s+/g, ' ');
  let m;
  if (/operational_security\.require_receptionist\(\)/.test(text)) return { gate: 'receptionist_only', receptionist: 'open' };
  if ((m = text.match(/operational_security\.(?:require|has)_capability\('([a-z_]+)'\)/))) {
    const roles = SQL_ROLES[m[1]];
    return { gate: `capability:${m[1]}`, receptionist: roles?.includes('receptionist') ? 'open' : 'locked' };
  }
  if ((m = text.match(/online_security\.require_role\(array\[([^\]]*)\]/))) {
    const roles = roleList(m[1]).sort();
    return { gate: `roles:${roles.join(',')}`, receptionist: roles.includes('receptionist') ? 'open' : 'locked' };
  }
  if (/crm_security\.require_reader\(true\)/.test(text)) return { gate: 'crm_director', receptionist: 'locked' };
  if (/crm_security\.(?:require_reader\((?:false)?\)|command\()/.test(text)) return { gate: 'crm_reader', receptionist: 'open' };
  if (/portal_security\.require_manager\(\)/.test(text)) return { gate: 'portal_manager', receptionist: 'locked' };
  // RPW-r2 item 7 (135): the family-invitation gate reads capability invite_family.
  if (/portal_security\.require_family_inviter\(\)/.test(text)) {
    return { gate: 'capability:invite_family', receptionist: SQL_ROLES.invite_family?.includes('receptionist') ? 'open' : 'locked' };
  }
  if (/require_finance_staff\(\)/.test(text)) return { gate: 'finance_staff', receptionist: 'locked' };
  if ((m = text.match(/get_my_role\(\)(?:, '?'?\))?\s*(?:is distinct from|<>)\s*'([a-z_]+)'/))) {
    return { gate: `roles:${m[1]}`, receptionist: m[1] === 'receptionist' ? 'open' : 'locked' };
  }
  if ((m = text.match(/get_my_role\(\)(?:, '?'?\))?\s*not in\s*\(([^)]*)\)/))) {
    const roles = roleList(m[1]).sort();
    return { gate: `roles:${roles.join(',')}`, receptionist: roles.includes('receptionist') ? 'open' : 'locked' };
  }
  if (/storage_security\.can_write\(/.test(text)) return { gate: 'storage_purpose', receptionist: 'open' };
  if (!definer) return { gate: 'invoker', receptionist: 'rls' };
  return { gate: 'manual', receptionist: 'manual' };
}

export function executableFunctions() {
  return sqlJson(`select coalesce(json_agg(json_build_object('signature', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
      'src', p.prosrc, 'definer', p.prosecdef, 'md5', md5(p.prosrc)) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')`);
}

// Every policy whose definition names the receptionist role, with its mode and text.
export function receptionistPolicies() {
  return sqlJson(`select coalesce(json_object_agg(schemaname||'.'||tablename||'.'||policyname, json_build_object(
      'cmd', cmd, 'permissive', permissive, 'roles', array_to_string(roles, ','),
      'qual', regexp_replace(coalesce(qual, ''), '\\s+', ' ', 'g'),
      'with_check', regexp_replace(coalesce(with_check, ''), '\\s+', ' ', 'g'))
      order by schemaname, tablename, policyname), '{}')
    from pg_policies
    where coalesce(qual, '') ilike '%receptionist%' or coalesce(with_check, '') ilike '%receptionist%'
      or policyname ilike '%receptionist%'`);
}
