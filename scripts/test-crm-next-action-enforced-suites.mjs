// Commit-time check of the CRM and finance suites under migration 137 (plan RWR-r5, PR A2).
// The suites roll back at their end, so the deferred presence and placement triggers of
// 137 would never fire in them. This runner pipes each suite to psql with
// `set constraints all immediate;` inserted just before its final `rollback;`, which
// fires every pending deferred check exactly as COMMIT would, and requires the suite to
// finish without an error. Intake resubmission, ownership changes, appointments,
// test results, enrolment, payment, conversion, merges and the Meta lifecycle are all
// covered by these suites; none of their assertions is changed here.
// Run on a database at migration 137 or later: node scripts/test-crm-next-action-enforced-suites.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.CRM_SUITES_PORT || '54322';
const suites = [
  'test-crm-next-action', 'test-crm-rcc-a1', 'test-crm-rcc-a2', 'test-crm-phase5', 'test-student-placement',
  'test-crm-phase6', 'test-crm-phase7', 'test-enrollment-at-payment', 'test-course-dates-close', 'test-crm-phase8',
  'test-crm-phase9', 'test-crm-lead-ad-source', 'test-crm-dgi-b', 'test-crm-dgi-b2', 'test-crm-phase10',
  'test-crm-batch2', 'test-crm-meta-funnel-r4', 'test-crm-r4-advisory', 'test-crm-phase11', 'test-crm-phase12-e2e',
];
const psql = input => spawnSync('psql', ['-X', '-q', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input, encoding: 'utf8', cwd: 'scripts', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024 });

const ledger = psql('\\pset tuples_only on\nselect max(version) from supabase_migrations.schema_migrations;').stdout.trim();
assert.ok(Number(ledger) >= 137, `run on a database at migration 137 or later (found ${ledger})`);

let failed = 0;
for (const name of suites) {
  const text = readFileSync(`scripts/${name}.sql`, 'utf8');
  const ends = [...text.matchAll(/^\s*rollback\s*;\s*$/gim)];
  assert.equal(ends.length, 1, `${name}: exactly one final rollback`);
  const at = ends[0].index;
  const run = psql(`${text.slice(0, at)}\nset constraints all immediate;\n${text.slice(at)}`);
  const pass = run.status === 0 && !/ERROR:/.test(run.stderr);
  if (!pass) {
    failed += 1;
    console.error(`FAIL ${name} at commit time\n${run.stderr.split('\n').filter(l => /ERROR|HINT|DETAIL|CONTEXT/.test(l)).slice(0, 8).join('\n')}`);
  } else console.log(`ok ${name}`);
}
assert.equal(failed, 0, `${failed} suite(s) refused at commit time`);
console.log(`PASS commit-time one-next-action and placement checks over ${suites.length} CRM and finance suites`);
