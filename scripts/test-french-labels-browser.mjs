// RWR-r5 PR B2 (§5.4, « French labels everywhere ») — scan of the staff screens, real UI on
// the local stack: no stored English code is shown where a French label exists. The codes
// come from the label maps themselves (programmes, learner and enrollment statuses, age
// categories, CRM stages, close reasons, origins), so a code added later is scanned too.
// Level names (« Child 1 », « Beginning 1 ») are the levels' own names and are not codes.
// Synthetic fixtures carry every scanned code: a learner enrolled and paid on « Yearly » with
// an English age category, an « Adults » group, prospects on « Summer Camp » and « Adults »
// (one closed « Mauvais numéro », one with an origin). Removed in finally. No external requests.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, sql } from './lib/crm-next-action-local.mjs';
import { removeStaffAndPayments } from './lib/desk-payments-local.mjs';
import { PROGRAMME_LABELS } from '../src/lib/programCatalog.mjs';
import { AGE_CATEGORY_LABELS, DOSSIER_LABELS, ENROLLMENT_LABELS } from '../src/lib/ui/presentation.mjs';
import { STATUS } from '../src/lib/crm/presentation.mjs';
import { CLOSE_REASON_LABELS, ORIGIN_LABELS } from '../src/lib/catalogue.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = process.env.CRM_LOCAL_APP || 'http://localhost:3101', run = 'labels-' + randomUUID();
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const rpc = (id, name, data) => JSON.parse(sql(`${as(id)}select public.crm_${name}(gen_random_uuid(),${q(JSON.stringify(data))}::jsonb);commit;`).split('\n').pop());
const phone = () => '06' + String(randomInt(10_000_000, 99_999_999));
let browser, page, users = [], students = [], group = null, phase = 'setup';
const errors = [], raw = [];

// A code is scanned when its French label differs from it. Origin codes are scanned only
// when they cannot be an ordinary word or a brand name (« instagram » could be a link).
const codes = [...new Set([
  ...Object.entries(PROGRAMME_LABELS), ...Object.entries(DOSSIER_LABELS), ...Object.entries(ENROLLMENT_LABELS),
  ...Object.entries(AGE_CATEGORY_LABELS), ...Object.entries(STATUS), ...Object.entries(CLOSE_REASON_LABELS),
  ...Object.entries(ORIGIN_LABELS).filter(([code]) => code.includes('_'))
].filter(([code, label]) => code !== label).map(([code]) => code))];
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`(?<![\\p{L}\\d_-])(${codes.sort((a, b) => b.length - a.length).map(escape).join('|')})(?![\\p{L}\\d_-])`, 'gu');

async function login(user) {
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

// The visible text of the page (open selects included), once the fixture text is on screen.
async function scan(who, path, ready) {
  phase = `${who} ${path}`;
  await page.goto(app + path);
  await page.waitForLoadState('networkidle');
  if (ready) await ready();
  const text = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const options = [...main.querySelectorAll('select option')].map(o => o.textContent).join('\n');
    const dialogs = [...document.querySelectorAll('[role=dialog]')].map(d => d.innerText).join('\n');
    return `${main.innerText}\n${options}\n${dialogs}`;
  });
  const found = [...text.matchAll(pattern)].map(m => `« ${m[1]} » in « ${text.slice(Math.max(0, m.index - 40), m.index + m[1].length + 40).replace(/\s+/g, ' ')} »`);
  // Every screen is scanned before the suite fails, so one run lists every finding.
  if (found.length) { raw.push(...found.map(f => `${who} ${path}: ${f}`)); console.log(`FAIL ${who} ${path}: ${found.length} raw code(s)`); }
  else console.log(`PASS ${who} ${path}: no raw code (${codes.length} codes scanned)`);
}

try {
  assert.ok(codes.includes('Yearly') && codes.includes('Enrolled') && codes.includes('Young Learners (6-12)') && codes.includes('NOT_QUALIFIED') && codes.includes('wrong_number'), 'the code list is built from the label maps');
  // The pattern finds a code alone, in a sentence and in parentheses, never inside a word.
  const hits = text => [...text.matchAll(pattern)].map(m => m[1]);
  assert.deepEqual(hits('statut Enrolled · Yearly (Summer Camp) NOT_QUALIFIED wrong_number Young Learners (6-12)'), ['Enrolled', 'Yearly', 'Summer Camp', 'NOT_QUALIFIED', 'wrong_number', 'Young Learners (6-12)']);
  assert.deepEqual(hits('Programme annuel · Inscrit · Stage d’été · Non qualifié · OtherYearly · LOSTX'), [], 'French labels and longer words are not codes');
  users = await createStaff(env, run, ['director', 'receptionist']);
  const [director, reception] = users;
  rpc(director.id, 'create_followup_policy', LIVE_POLICY);
  // A learner paid on « Yearly » (enrolled, group to assign), with an English age category.
  const learner = sql(`insert into public.students(full_name,status,session_type,age_category,telephone) values(${q('Élève libellés ' + run.slice(-8))},'Prospect','Yearly','Young Learners (6-12)',${q(phone())}) returning id`).split('\n').pop();
  students.push(learner);
  sql(`${as(director.id)}select public.create_charge_payment(${q(JSON.stringify({ student_id: learner, session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', gross_amount: 3000, discount_amount: 0, payment_amount: 1000, payment_method: 'Espèces', idempotency_key: randomUUID() }))}::jsonb);commit;`);
  const receipt = sql(`select id from public.receipts where student_id=${q(learner)}`);
  assert.equal(sql(`select status from public.students where id=${q(learner)}`), 'Enrolled', 'fixture: an enrolled learner');
  group = randomUUID();
  sql(`insert into public.groups(id,name,session_type,niveau,annee,date_debut,date_fin) values(${q(group)},${q('Groupe libellés ' + run.slice(-8))},'Adults','Beginning 1','2026-2027','2026-09-01','2027-06-30')`);
  // Prospects: « Summer Camp » with an origin, and « Adults » closed « Mauvais numéro ».
  const summer = rpc(reception.id, 'create_prospect', { display_name: 'Contact libellés été', learner_name: 'Apprenant libellés été', phone: phone(), source_label: 'Manuel · Téléphone', session_type: 'Summer Camp', origin_code: 'instagram' }).lead.id;
  const closed = rpc(reception.id, 'create_prospect', { display_name: 'Contact libellés clos', learner_name: 'Apprenant libellés clos', phone: phone(), source_label: 'Manuel · Téléphone', session_type: 'Adults' }).lead.id;
  rpc(reception.id, 'log_exchange', { lead_id: closed, expected_version: Number(sql(`select version from public.crm_leads where id=${q(closed)}`)), channel: 'phone', result: 'wrong_number', next: { close: { reason: 'wrong_number' } } });
  assert.equal(sql(`select status||':'||closure_reason from public.crm_leads where id=${q(closed)}`), 'NOT_QUALIFIED:wrong_number', 'fixture: a prospect closed « Mauvais numéro »');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, bypassCSP: !!process.env.CRM_LOCAL_APP });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(`${phase}: ${e.message}`));
  const see = text => () => page.getByText(text).locator('visible=true').first().waitFor();

  await login(director);
  await scan('director', '/dashboard');
  await scan('director', '/students?status=all_shown', see('Élève libellés'));
  await scan('director', `/students/${learner}`, see('Programme annuel'));
  await scan('director', '/students-directory', see('Élève libellés'));
  await scan('director', '/groups', see('Groupe libellés'));
  await scan('director', `/groups/${group}`, see('Groupe libellés'));
  await scan('director', '/finance');
  await scan('director', '/receipts', see('Élève libellés'));
  await scan('director', `/receipts/${receipt}/print`, see('Programme annuel'));
  await scan('director', '/crm/leads?layout=list', see('Contact libellés été'));
  await scan('director', `/crm/leads?lead=${summer}`, see('Stage d’été'));
  await scan('director', `/crm/leads?lead=${closed}`, see('Mauvais numéro'));
  await scan('director', '/crm/today');
  await scan('director', '/reports');
  await scan('director', '/placement-tests');
  await scan('director', '/online');
  await scan('director', '/attendance');
  await scan('director', '/settings', async () => { await page.getByRole('button', { name: 'Catalogue', exact: true }).click(); await see('Catalogue des programmes')(); });
  await page.context().clearCookies();
  await login(reception);
  await scan('receptionist', '/students?status=all_shown', see('Élève libellés'));
  await scan('receptionist', `/students/${learner}`, see('Programme annuel'));
  await scan('receptionist', '/crm/leads', see('Contact libellés été'));
  await scan('receptionist', `/crm/leads?lead=${closed}`, see('Mauvais numéro'));

  assert.deepEqual(raw, [], 'raw codes on the staff screens');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS French labels on the staff screens: no raw programme, status, age, stage, close-reason or origin code');
} catch (error) {
  console.error(phase, error.message);
  if (page) await page.screenshot({ path: join(tmpdir(), 'hills-french-labels-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  removeStaffAndPayments(users.map(u => u.id), students);
  if (group) sql(`delete from public.groups where id=${q(group)}`);
  console.log('PASS synthetic browser fixtures removed');
}
