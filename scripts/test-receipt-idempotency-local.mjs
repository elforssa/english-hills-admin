// LOCAL synthetic acceptance of invariant 13 (RWR-r5 PR C1, plan §6.1, §7): no receipt
// created twice by a double click, a retry or two tabs, over real HTTP (PostgREST), and no
// second charge when two staff members act on the same learner at once. Covers « Encaisser »
// (create_charge_payment), « Inscrire et encaisser » (crm_enroll_and_collect, with and
// without « Encaisser sur cet engagement »), « Réserver sans paiement »
// (crm_reserve_without_payment) and the director's void (void_financial_receipt), and the 138
// payment guards (no receipt on a commitment reserved for an open prospect outside its card,
// no second charge from « Encaisser ») with two staff members at once.
// Synthetic rows only; run on a database at the current migrations (138 or later). Never
// reads .env.local or accepts a URL from the environment. Booking and due dates come from
// scripts/lib/centre-days.mjs (weekday-independent).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { openDaySql, openSlotSql } from './lib/centre-days.mjs';
import { removeStaffAndPayments } from './lib/desk-payments-local.mjs';

assertLocalFeatureBranch();
const processEnv = { ...process.env, PGPASSWORD: 'postgres', SUPABASE_TELEMETRY_DISABLED: '1', DISABLE_EXTERNAL_EMAIL: 'true' };
const pgArgs = ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = s => execFileSync('psql', pgArgs, { input: s, encoding: 'utf8', env: processEnv, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const cli = args => execFileSync('supabase', args, { encoding: 'utf8', env: processEnv, timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const status = JSON.parse(cli(['status', '-o', 'json']));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
const latest = Math.max(...readdirSync('supabase/migrations').map(name => Number(/^(\d+)_/.exec(name)?.[1] ?? 0)));
assert(latest >= 138);
assert.equal(sql('select max(version::integer) from supabase_migrations.schema_migrations'), String(latest), 'run on a database at the current migrations');

const options = { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } };
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const tag = randomBytes(3).toString('hex');
// The synthetic staff and everything they created (policy, prospects, learners, payments) are
// removed on exit, pass or fail, so the next suite starts from a clean baseline.
const created = [], fixtures = [];
process.on('exit', () => {
  if (!created.length) return;
  removeStaffAndPayments(created.splice(0), fixtures);
  console.log('Synthetic staff, prospects, learners and payments removed.');
});
async function staff(role) {
  const email = `rid-${role}-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('hex');
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'director' } });
  assert.ifError(error);
  created.push(data.user.id);
  sql(`update public.profiles set role=${q(role)} where id=${q(data.user.id)}`);
  const client = createClient(status.API_URL, status.ANON_KEY, options);
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: data.user.id, client };
}
const director = await staff('director'), reception = await staff('receptionist'), reception2 = await staff('receptionist'), admin = await staff('admin');
const as = who => `set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub=${q(who.id)};`;
// The centre's hours (Sunday closed), so the dates below are real open days.
sql(`${as(director)} select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","13:00"]],"7":[]}}');`);
const today = sql('select public.business_date()::text');
const dueDate = sql(`select ${openDaySql(3)}`);
let phone = 72600000 + Math.floor(Math.random() * 90000);

// A qualified prospect with an open enrolment action, through the real commands.
function qualifiedLead(n) {
  phone += 1;
  return sql(`${as(reception)}
create temp table l as select (crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name','RID contact ${tag} ${n}',
  'learner_name','RID child ${tag} ${n}','phone','06${phone}','source_label','Phone'))->'lead'->>'id')::uuid id;
select crm_log_exchange(gen_random_uuid(), jsonb_build_object('lead_id',(select id from l),'expected_version',(select version from crm_leads where id=(select id from l)),
  'channel','phone','result','spoke','note','RID','next',jsonb_build_object('enrol',jsonb_build_object('due_at',${openSlotSql(1, '10:00', 'calling')}))));
select id from l;`).split('\n').pop();
}
const version = lead => Number(sql(`select version from crm_leads where id=${q(lead)}`));
const token = (lead, name, birth) => sql(`select crm_security.candidate_token(${q(lead)}, ${q(name)}, ${q(birth)})`);
const newStudent = name => { const id = sql(`insert into students(full_name,status,session_type) values (${q(name)},'Prospect','Yearly') returning id`).split('\n').pop(); fixtures.push(id); return id; };
const count = s => Number(sql(s));
const rpc = (who, name, args) => who.client.rpc(name, args);
const both = (a, b) => Promise.all([a(), b()]);
const OK_CONFLICT = new Set(['PT409', '22023', 'P0001', '23505']);
const pay = (student, extra = {}) => ({ student_id: student, payment_amount: 500, payment_method: 'Espèces', payment_date: today, ...extra });
let checks = 0;
const check = (cond, label) => { assert(cond, label); checks += 1; console.log(`ok - ${label}`); };

// ── 1. « Encaisser »: double click with one key (one form opening) ───────────
{
  const s = newStudent(`RID desk ${tag}`);
  const key = randomUUID();
  const args = { p_payload: pay(s, { session_type: 'Adults', school_year: '2026/2027', level: 'Intermediate 2', gross_amount: 2000, idempotency_key: key }) };
  const [a, b] = await both(() => rpc(reception, 'create_charge_payment', args), () => rpc(reception, 'create_charge_payment', args));
  const okRes = [a, b].filter(r => !r.error);
  check(okRes.length >= 1 && [a, b].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'double click: at most a clean conflict');
  check(new Set(okRes.map(r => r.data.receipt_id)).size === 1, 'double click: both answers name the same receipt');
  check(count(`select count(*) from receipts where student_id=${q(s)}`) === 1, 'double click: one receipt');
  check(count(`select count(*) from charges where student_id=${q(s)}`) === 1, 'double click: one charge');
  // Retry after a lost answer: the same key replays.
  const retry = await rpc(reception, 'create_charge_payment', args);
  assert.ifError(retry.error);
  check(retry.data.replayed === true && retry.data.receipt_id === okRes[0].data.receipt_id, 'retry: replayed, same receipt');
  const changed = await rpc(reception, 'create_charge_payment', { p_payload: { ...args.p_payload, payment_amount: 600 } });
  check(changed.error && /Idempotency key conflict/.test(changed.error.message), 'same key, other amount: refused');
  check(count(`select count(*) from receipts where student_id=${q(s)}`) === 1, 'retry: still one receipt');

  // Two tabs (two openings, two keys): the second sees the first before saving (§6.1 rule).
  const charge = okRes[0].data.charge_id;
  const dup = await rpc(reception, 'find_duplicate_receipts', { p_student: s, p_charge: charge, p_amount: 500, p_date: today });
  assert.ifError(dup.error);
  check(dup.data.some(r => r.id === okRes[0].data.receipt_id && r.rule === 'same_charge'), 'two tabs: same charge, amount and day flagged');
  const other = await rpc(reception2, 'find_duplicate_receipts', { p_student: s, p_charge: null, p_amount: 1, p_date: today });
  check(other.data.length === 0, 'two tabs: rule b is per staff member');
  const mine = await rpc(reception, 'find_duplicate_receipts', { p_student: s, p_charge: null, p_amount: 1, p_date: today });
  check(mine.data.some(r => r.rule === 'recent_by_you'), 'two tabs: my receipt within 2 minutes flagged');

  // Two staff members pay the whole balance at once: never more than the balance.
  const [x, y] = await both(
    () => rpc(reception, 'create_charge_payment', { p_payload: pay(s, { charge_id: charge, payment_amount: 1500, idempotency_key: randomUUID() }) }),
    () => rpc(reception2, 'create_charge_payment', { p_payload: pay(s, { charge_id: charge, payment_amount: 1500, idempotency_key: randomUUID() }) }));
  check([x, y].filter(r => !r.error).length === 1, 'two staff, full balance: one payment wins');
  check(Number(sql(`select balance from charge_balances where id=${q(charge)}`)) === 0, 'two staff: balance 0, never negative');

  // Void double click with one key (director): one void.
  const vkey = randomUUID();
  const vargs = { p_receipt_id: okRes[0].data.receipt_id, p_reason: 'Erreur de saisie RID', p_idempotency_key: vkey };
  const [v1, v2] = await both(() => rpc(director, 'void_financial_receipt', vargs), () => rpc(director, 'void_financial_receipt', vargs));
  check([v1, v2].some(r => !r.error) && [v1, v2].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'void double click: clean');
  check(count(`select count(*) from financial_events where receipt_id=${q(okRes[0].data.receipt_id)} and event_type='payment_voided'`) === 1, 'void double click: one void event');
  const vr = await rpc(reception, 'void_financial_receipt', { ...vargs, p_idempotency_key: randomUUID() });
  check(vr.error?.code === '42501', 'void stays director-only (OD-7 = A)');
}

// ── 2. « Inscrire et encaisser »: double click, then two staff ──────────────
{
  const lead = qualifiedLead(1);
  const name = `RID child ${tag} 1`;
  const key = randomUUID();
  const body = { enrollment: { lead_id: lead, expected_version: version(lead), student_choice: 'new', learner_name: name, birth_date: '2015-03-04',
    session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', candidate_review: token(lead, name, '2015-03-04'), confirm_new: true },
    payment: { gross_amount: 3000, payment_amount: 800, payment_method: 'Espèces', payment_date: today } };
  const [a, b] = await both(() => rpc(reception, 'crm_enroll_and_collect', { p_request_key: key, p_data: body }),
    () => rpc(reception, 'crm_enroll_and_collect', { p_request_key: key, p_data: body }));
  const okRes = [a, b].filter(r => !r.error);
  check(okRes.length >= 1 && [a, b].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'wizard double submit: at most a clean conflict');
  const student = sql(`select student_id from crm_leads where id=${q(lead)}`);
  check(count(`select count(*) from receipts where student_id=${q(student)}`) === 1, 'wizard double submit: one receipt');
  check(count(`select count(*) from enrollments where student_id=${q(student)}`) === 1, 'wizard double submit: one enrollment');
  const again = await rpc(reception, 'crm_enroll_and_collect', { p_request_key: key, p_data: body });
  assert.ifError(again.error);
  check(again.data.replayed_payment === true && again.data.receipt_id === okRes[0].data.receipt_id, 'wizard retry: replayed');
}

// ── 3. « Réserver sans paiement »: double click; two staff; then collect ─────
{
  const lead = qualifiedLead(2);
  const name = `RID child ${tag} 2`;
  const key = randomUUID();
  const body = { lead_id: lead, expected_version: version(lead), student_choice: 'new', learner_name: name, birth_date: '2015-03-04',
    candidate_review: token(lead, name, '2015-03-04'), confirm_new: true, session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2',
    gross_amount: 3000, discount_amount: 0, due_date: dueDate };
  const [a, b] = await both(() => rpc(reception, 'crm_reserve_without_payment', { p_request_key: key, p_data: body }),
    () => rpc(reception, 'crm_reserve_without_payment', { p_request_key: key, p_data: body }));
  const okRes = [a, b].filter(r => !r.error);
  check(okRes.length >= 1 && [a, b].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'reservation double click: at most a clean conflict');
  const student = sql(`select student_id from crm_leads where id=${q(lead)}`);
  check(count(`select count(*) from charges where student_id=${q(student)}`) === 1, 'reservation double click: one charge');
  check(count(`select count(*) from crm_charge_reservations where lead_id=${q(lead)}`) === 1, 'reservation double click: one reservation');
  check(count(`select count(*) from crm_tasks where lead_id=${q(lead)} and status='open'`) === 1, 'reservation: one open action');
  check(sql(`select instructions from crm_tasks where lead_id=${q(lead)} and status='open'`) === 'Encaisser l’acompte', 'reservation: « Encaisser l’acompte »');
  check(count(`select count(*) from receipts where student_id=${q(student)}`) === 0 && count(`select count(*) from enrollments where student_id=${q(student)}`) === 0,
    'reservation: no receipt, no enrollment');
  const charge = okRes[0].data.charge.id;

  // Two staff members at once on the reserved learner: one collects on the commitment, the
  // other tries a new tuition charge. Never two charges.
  const enrol = extra => ({ enrollment: { lead_id: lead, expected_version: version(lead), student_choice: 'existing', student_id: student,
    session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2' }, payment: { payment_amount: 1000, payment_method: 'Espèces', payment_date: today, ...extra } });
  const [x, y] = await both(
    () => rpc(reception, 'crm_enroll_and_collect', { p_request_key: randomUUID(), p_data: enrol({ charge_id: charge }) }),
    () => rpc(reception2, 'crm_enroll_and_collect', { p_request_key: randomUUID(), p_data: enrol({ gross_amount: 3000 }) }));
  check([x, y].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'two staff on a reserved learner: clean answers');
  check(count(`select count(*) from charges where student_id=${q(student)} and voided_at is null`) === 1, 'two staff on a reserved learner: one charge');
  if (x.error) {
    const z = await rpc(reception, 'crm_enroll_and_collect', { p_request_key: randomUUID(), p_data: enrol({ charge_id: charge }) });
    assert.ifError(z.error);
  }
  check(Number(sql(`select balance from charge_balances where id=${q(charge)}`)) === 2000, 'collected on the commitment: balance 2000');
  check(sql(`select status from crm_leads where id=${q(lead)}`) === 'CONVERTED', 'prospect converted at payment');
  check(count(`select count(*) from receipts where student_id=${q(student)} and voided_at is null`) === 1, 'one receipt');

  // Reservation and a desk payment for the same existing learner at once: never two charges.
  const lead3 = qualifiedLead(3);
  const s3 = newStudent(`RID existing ${tag}`);
  const [r1, r2] = await both(
    () => rpc(reception, 'crm_reserve_without_payment', { p_request_key: randomUUID(), p_data: { lead_id: lead3, expected_version: version(lead3),
      student_choice: 'existing', student_id: s3, session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', gross_amount: 3000, due_date: dueDate } }),
    () => rpc(reception2, 'crm_reserve_without_payment', { p_request_key: randomUUID(), p_data: { lead_id: lead3, expected_version: version(lead3),
      student_choice: 'existing', student_id: s3, session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', gross_amount: 3000, due_date: dueDate } }));
  check([r1, r2].filter(r => !r.error).length === 1 && [r1, r2].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'two staff reserve at once: one wins');
  check(count(`select count(*) from charges where student_id=${q(s3)}`) === 1, 'two staff reserve at once: one charge');
}

// ── 4. The 138 payment guards with two staff members at once ────────────────
{
  // Two « Encaisser » openings create a tuition charge for the same learner, programme and
  // year at once (a commitment and a payment): one charge, the other refused.
  const s = newStudent(`RID guard ${tag}`);
  const terms = { session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', gross_amount: 3000 };
  const [a, b] = await both(
    () => rpc(reception, 'create_charge_payment', { p_payload: pay(s, { ...terms, payment_amount: 0, due_date: dueDate, idempotency_key: randomUUID() }) }),
    () => rpc(reception2, 'create_charge_payment', { p_payload: pay(s, { ...terms, payment_amount: 0, due_date: dueDate, idempotency_key: randomUUID() }) }));
  check([a, b].filter(r => !r.error).length === 1 && [a, b].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'two staff, two commitments at once: one wins');
  check([a, b].some(r => r.error?.hint === 'eap.unlinked_commitment_exists' || r.error?.code === 'PT409'), 'two staff: the other is refused (no second charge)');
  check(count(`select count(*) from charges where student_id=${q(s)}`) === 1, 'two staff, two commitments at once: one charge');
  const later = await rpc(admin, 'create_charge_payment', { p_payload: pay(s, { ...terms, idempotency_key: randomUUID() }) });
  check(later.error?.hint === 'eap.unlinked_commitment_exists', 'Encaisser: no paid second charge next to the commitment');

  // A commitment reserved for a prospect: one staff member collects it from the prospect's
  // card while another tries « Encaisser » on it. Every receipt on it belongs to the
  // prospect's own enrollment; the screen is refused while the prospect is open.
  const lead = qualifiedLead(4);
  const name = `RID child ${tag} 4`;
  const reserved = await rpc(reception, 'crm_reserve_without_payment', { p_request_key: randomUUID(), p_data: { lead_id: lead, expected_version: version(lead),
    student_choice: 'new', learner_name: name, birth_date: '2015-03-04', candidate_review: token(lead, name, '2015-03-04'), confirm_new: true,
    session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', gross_amount: 3000, due_date: dueDate } });
  assert.ifError(reserved.error);
  const charge = reserved.data.charge.id, student = reserved.data.student.id;
  const direct = await rpc(director, 'create_charge_payment', { p_payload: pay(student, { charge_id: charge, idempotency_key: randomUUID() }) });
  check(direct.error?.hint === 'eap.reservation_collect_on_prospect', 'Encaisser on a reserved commitment: refused, even for the director');
  const [x, y] = await both(
    () => rpc(reception, 'crm_enroll_and_collect', { p_request_key: randomUUID(), p_data: { enrollment: { lead_id: lead, expected_version: version(lead),
      student_choice: 'existing', student_id: student, session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2' },
      payment: { charge_id: charge, payment_amount: 1000, payment_method: 'Espèces', payment_date: today } } }),
    () => rpc(reception2, 'create_charge_payment', { p_payload: pay(student, { charge_id: charge, idempotency_key: randomUUID() }) }));
  check([x, y].every(r => !r.error || OK_CONFLICT.has(r.error.code)), 'collect and Encaisser at once: clean answers');
  check(sql(`select status from crm_leads where id=${q(lead)}`) === 'CONVERTED' || Boolean(x.error), 'collected from the card: prospect converted');
  check(count(`select count(*) from receipts r where r.charge_id=${q(charge)} and r.voided_at is null
    and r.enrollment_id is distinct from (select enrollment_id from crm_leads where id=${q(lead)})`) === 0, 'every receipt on the reserved commitment is the prospect’s enrollment');
  check(count(`select count(*) from charges where student_id=${q(student)} and voided_at is null`) === 1, 'reserved learner: one charge');
}

// Invariant 13 over the run: no receipt shares an idempotency key, no request two receipts.
check(count(`select count(*) from (select idempotency_key from receipts where idempotency_key is not null group by 1 having count(*)>1) d`) === 0, 'no duplicate receipt key');
console.log(`Receipt idempotency (invariant 13): ${checks} checks passed.`);
