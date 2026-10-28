// Batch G (plan SCG-r1, D1 = A, D2 = A): generates the policy rewrite of
// migration 124 from the live catalog of a database at the migration before it.
//   node scripts/generate-rls-role-evaluation.mjs            forward block (stdout)
//   node scripts/generate-rls-role-evaluation.mjs --restore  original block (stdout)
//   node scripts/generate-rls-role-evaluation.mjs --check    both committed blocks equal the output
// Rule A wraps every zero-argument role helper as an InitPlan, evaluated once per
// statement. Rule B prefixes a bare per-row teacher helper with the wrapped role
// test. Nothing else changes: name, table, command, roles and kind are untouched.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const MIGRATION = 'supabase/migrations/124_speed_as_the_centre_grows.sql';
export const RESTORE = 'scripts/rollback/124_speed_as_the_centre_grows_restore.sql';
export const BEGIN = '-- BEGIN GENERATED POLICIES (scripts/generate-rls-role-evaluation.mjs)';
export const END = '-- END GENERATED POLICIES';

const HELPERS = /\b(get_my_role|get_my_teacher_id|get_my_email)\(\)/g;
const UID = /\bauth\.uid\(\)/g;
const BARE_TEACHER = /^teacher_can_access_student_group\([^()]*\)$/;
// Unwrapped here; Rule A then wraps it like every other call.
export const GUARD = "(get_my_role() = 'teacher'::text)";

export function rewrite(expression) {
  if (expression == null) return null;
  assert(!/\(\s*SELECT\s+(get_my_role|get_my_teacher_id|get_my_email|auth\.uid)\(\)/i.test(expression),
    'a policy is already wrapped; regenerate only from the pre-migration catalog');
  assert(!/\.(get_my_role|get_my_teacher_id|get_my_email)\(\)/.test(expression), 'unexpected qualified helper');
  const guarded = BARE_TEACHER.test(expression) ? `(${GUARD} AND ${expression})` : expression;
  return guarded.replace(HELPERS, '( SELECT $1() AS $1)').replace(UID, '( SELECT auth.uid() AS uid)');
}

// Inverse used by the upgrade test: the rewritten text normalises to the original.
export function normalise(expression) {
  if (expression == null) return null;
  let text = expression.replace(/\( SELECT (get_my_role|get_my_teacher_id|get_my_email)\(\) AS \1\)/g, '$1()')
    .replace(/\( SELECT auth\.uid\(\) AS uid\)/g, 'auth.uid()');
  const guard = "((get_my_role() = 'teacher'::text) AND ";
  if (text.startsWith(guard) && text.endsWith(')') && BARE_TEACHER.test(text.slice(guard.length, -1))) {
    text = text.slice(guard.length, -1);
  }
  return text;
}

const ident = name => `"${name.replaceAll('"', '""')}"`;
const comment = text => text.split('\n').map(line => `--   ${line}`).join('\n');

function statement(policy, using, check) {
  return `alter policy ${ident(policy.policyname)} on public.${ident(policy.tablename)}`
    + (using == null ? '' : `\n  using (${using})`) + (check == null ? '' : `\n  with check (${check})`) + ';';
}

export function readPolicies(port = process.env.SCG_PORT || '54322') {
  // The same search_path as the migration, so deparsed names resolve identically.
  const out = execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `set search_path = public;
select coalesce(jsonb_agg(jsonb_build_object('tablename', tablename, 'policyname', policyname, 'qual', qual, 'with_check', with_check)
  order by tablename, policyname), '[]') from pg_policies where schemaname = 'public';`,
    encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024,
  }).trim().split('\n').pop();
  return JSON.parse(out);
}

export function generate(policies) {
  const forward = [];
  const restore = [];
  for (const policy of policies) {
    const using = rewrite(policy.qual);
    const check = rewrite(policy.with_check);
    if (using === policy.qual && check === policy.with_check) continue;
    const was = [policy.qual != null && `using: ${policy.qual}`, policy.with_check != null && `with check: ${policy.with_check}`].filter(Boolean).join('\n');
    forward.push(`-- was\n${comment(was)}\n${statement(policy, using, check)}`);
    restore.push(statement(policy, policy.qual, policy.with_check));
  }
  return { count: forward.length, forward: `${BEGIN}\n${forward.join('\n\n')}\n${END}`, restore: `${BEGIN}\n${restore.join('\n\n')}\n${END}` };
}

export function committedBlock(path) {
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  assert(start >= 0 && end > start, `${path} has no generated block`);
  return text.slice(start, end + END.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = generate(readPolicies());
  if (process.argv.includes('--check')) {
    assert.equal(committedBlock(MIGRATION), result.forward, `${MIGRATION}: generated block differs; regenerate from the pre-migration catalog`);
    assert.equal(committedBlock(RESTORE), result.restore, `${RESTORE}: generated block differs`);
    console.log(`generated policy blocks match (${result.count} policies)`);
  } else {
    process.stdout.write(`${process.argv.includes('--restore') ? result.restore : result.forward}\n`);
  }
}
