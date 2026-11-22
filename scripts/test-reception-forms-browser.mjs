// RWR-r5 PR A1 — reception forms (plan §4.9 T7 and invariant 15), real UI on the local stack.
// T7: « Pas de réponse » is disabled in flight; a double tap sends one request with one key and
// leaves one attempt; a retry after a timeout resends the same key and payload; a retry after a
// committed but lost response replays the first result; a stale version is refused with
// « Ce prospect a été modifié, rechargez ».
// Invariant 15: a refused action is refused before the form (3-hour gap shown on open, hours not
// offered by the slot picker), or the form keeps the input (stale version, network error).
// Synthetic staff and prospects only, removed in finally. No external requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, removeStaff, sql } from './lib/crm-next-action-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = 'http://localhost:3101', run = 'forms-' + randomUUID();
const STALE = 'Ce prospect a été modifié, rechargez.';
const UNCERTAIN = 'Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.';
let browser, page, users = [], phase = 'setup';
const errors = [];
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const rpc = (id, name, data) => JSON.parse(sql(`${as(id)}select public.crm_${name}(gen_random_uuid(),${q(JSON.stringify(data))}::jsonb);commit;`).split('\n').pop());
const intake = (id, name) => rpc(id, 'create_manual_lead', { display_name: name, learner_name: 'Apprenant synthétique', phone: '0612345678', source_label: 'Manuel · Téléphone' }).lead.id;
const version = lead => Number(sql(`select version from public.crm_leads where id=${q(lead)}`));
const attempts = lead => Number(sql(`select count(*) from public.crm_activities where lead_id=${q(lead)} and event_type like 'call\\_%' escape '\\'`));
const openActions = lead => Number(sql(`select count(*) from public.crm_tasks where lead_id=${q(lead)} and status='open'`));
const dialog = () => page.getByRole('dialog').last();
const drawer = () => page.getByRole('dialog').first();
const panel = () => drawer().getByTestId('next-action-panel');
// A Tuesday two weeks ahead on the centre clock (UTC+0); LIVE_POLICY calls 10:00–12:30 and 15:20–20:00.
const day = (() => { const d = new Date(Date.now() + 14 * 86400000); while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

async function login(user) {
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}
async function open(lead) { await page.goto(`${app}/crm/leads?lead=${lead}`); await panel().waitFor(); await page.waitForLoadState('networkidle'); }
const logRequests = () => { const seen = []; page.on('request', r => { if (r.url().endsWith('/rpc/crm_log_exchange')) seen.push(r.postDataJSON()); }); return seen; };

try {
  assert.equal(sql('select count(*) from public.crm_followup_policies'), '0', 'clean local policy baseline');
  users = await createStaff(env, run, ['director', 'receptionist']);
  const [director, reception] = users;
  rpc(director.id, 'create_followup_policy', LIVE_POLICY);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(`${phase}: ${e.message}`));
  const requests = logRequests();
  await login(reception);

  // T7 a — in flight: the button is disabled and a second tap sends nothing.
  phase = 'T7 double tap';
  const tapLead = intake(reception.id, 'Forms double tap');
  await open(tapLead); requests.length = 0;
  let release; const held = new Promise(resolve => { release = resolve; });
  await page.route('**/rest/v1/rpc/crm_log_exchange', async route => { await held; await route.continue(); });
  const tap = panel().getByRole('button', { name: 'Pas de réponse', exact: true });
  await tap.click();
  await panel().getByRole('button', { name: 'Enregistrement…', exact: true }).waitFor();
  assert(await panel().getByRole('button', { name: 'Enregistrement…', exact: true }).isDisabled(), 'the one-tap button is disabled while its request is in flight');
  await panel().getByRole('button', { name: 'Enregistrement…', exact: true }).dispatchEvent('click');
  release(); await page.locator('[data-sonner-toast]').filter({ hasText: 'Pas de réponse enregistré' }).first().waitFor();
  await page.unroute('**/rest/v1/rpc/crm_log_exchange');
  assert.equal(requests.length, 1, 'a double tap sends one request');
  assert.equal(attempts(tapLead), 1, 'one attempt row');
  assert.equal(openActions(tapLead), 1, 'one next action');
  console.log('PASS T7 double tap: disabled in flight, one request, one key, one attempt');

  // T7 b — a timeout, then the retry: same key, same payload; one attempt.
  phase = 'T7 timeout retry';
  const retryLead = intake(reception.id, 'Forms timeout');
  await open(retryLead); requests.length = 0;
  await page.route('**/rest/v1/rpc/crm_log_exchange', route => route.abort('timedout'), { times: 1 });
  await panel().getByRole('button', { name: 'Pas de réponse', exact: true }).click();
  await panel().getByRole('alert').filter({ hasText: UNCERTAIN }).waitFor();
  assert.equal(attempts(retryLead), 0, 'the timed-out request never reached the server');
  await panel().getByRole('button', { name: 'Pas de réponse', exact: true }).click();
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Pas de réponse enregistré' }).first().waitFor();
  assert.equal(requests.length, 2, 'one retry');
  assert.equal(requests[1].p_request_key, requests[0].p_request_key, 'the retry resends the first key');
  assert.deepEqual(requests[1].p_data, requests[0].p_data, 'the retry resends the first payload');
  assert.equal(attempts(retryLead), 1, 'one attempt row');
  console.log('PASS T7 timeout: the retry resends the same key and payload; one attempt');

  // T7 c — committed, response lost: the retry replays the first result.
  phase = 'T7 lost response';
  const lostLead = intake(reception.id, 'Forms lost response');
  await open(lostLead); requests.length = 0;
  await page.route('**/rest/v1/rpc/crm_log_exchange', async route => { await route.fetch(); await route.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' }); }, { times: 1 });
  await panel().getByRole('button', { name: 'Pas de réponse', exact: true }).click();
  await panel().getByRole('alert').filter({ hasText: UNCERTAIN }).waitFor();
  assert.equal(attempts(lostLead), 1, 'the first request committed');
  await panel().getByRole('button', { name: 'Pas de réponse', exact: true }).click();
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Pas de réponse enregistré' }).first().waitFor();
  assert.equal(requests[1].p_request_key, requests[0].p_request_key, 'same key after the lost response');
  assert.equal(attempts(lostLead), 1, 'the replay records no second attempt');
  assert.equal(sql(`select count(*) from public.crm_command_requests where request_key=${q(requests[0].p_request_key)}`), '1', 'one stored request, replayed');
  console.log('PASS T7 lost response: the retry replays the committed result; one attempt');

  // T7 d — stale version: refused, nothing written, « Ce prospect a été modifié, rechargez ».
  phase = 'T7 stale';
  const staleLead = intake(reception.id, 'Forms stale tap');
  await open(staleLead);
  sql(`update public.crm_leads set version=version+1 where id=${q(staleLead)}`);
  await panel().getByRole('button', { name: 'Pas de réponse', exact: true }).click();
  await page.getByText(STALE, { exact: true }).first().waitFor();
  assert.equal(attempts(staleLead), 0, 'a stale tap writes nothing');
  console.log('PASS T7 stale: refused like any action, with the reload message');

  // Invariant 15 — the 3-hour gap is shown when the form opens, before anything is filled.
  phase = 'I15 gap';
  await open(tapLead);
  const gapText = panel().getByText(/^Appel · Prochain essai possible à [0-9]{2}:[0-9]{2}$/);
  await gapText.waitFor();
  await panel().getByRole('button', { name: 'Pas de réponse', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Noter un échange' }).waitFor();
  await dialog().getByText(/^Prochain essai possible à [0-9]{2}:[0-9]{2}$/).waitFor();
  await dialog().getByLabel('Tentative réelle (hors délai)').waitFor();
  assert.equal(await dialog().getByLabel('Pas de réponse', { exact: true }).isChecked(), true, 'the tapped result is kept in the form');
  await dialog().getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[role=dialog]').length === 1);
  assert.equal(attempts(tapLead), 1, 'inside the gap, a tap opens the form instead of saving');
  console.log('PASS invariant 15 gap: « Prochain essai possible à … » on the panel and in the form before filling; no silent save');

  // Invariant 15 — hours: the slot picker offers only times inside the calling hours.
  phase = 'I15 hours';
  const hoursLead = intake(reception.id, 'Forms hours');
  await open(hoursLead);
  await panel().getByRole('button', { name: 'Changer', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Changer la prochaine action' }).waitFor();
  await dialog().getByLabel('Rappel convenu', { exact: true }).check();
  await dialog().getByLabel('Date', { exact: true }).fill(day);
  const time = dialog().getByLabel('Heure', { exact: true });
  await page.waitForFunction(el => !el.disabled && el.options.length > 1, await time.elementHandle());
  const offered = (await time.locator('option').evaluateAll(os => os.map(o => o.value))).filter(Boolean);
  const inside = t => (t >= '10:00' && t < '12:30') || (t >= '15:20' && t < '20:00');
  assert(offered.length > 0 && offered.every(inside), `only calling-hour slots offered on ${day}: ${offered.join(' ')}`);
  assert(!offered.some(t => t >= '12:30' && t < '15:20'), 'the lunch break is not offered');
  console.log(`PASS invariant 15 hours: ${offered.length} slots, all inside the calling hours, lunch not offered`);

  // Invariant 15 — stale version in a form: the draft stays; save re-enabled after « Recharger ».
  phase = 'I15 stale form';
  await time.selectOption('16:05');
  sql(`update public.crm_leads set version=version+1 where id=${q(hoursLead)}`);
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await dialog().getByText(STALE, { exact: true }).waitFor();
  assert.equal(await dialog().getByLabel('Rappel convenu', { exact: true }).isChecked(), true, 'the chosen kind is kept');
  assert.equal(await time.inputValue(), '16:05', 'the chosen time is kept');
  assert(await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), 'save stays disabled until reload');
  await dialog().getByRole('button', { name: 'Recharger', exact: true }).click();
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog]')].at(-1)?.querySelector('button[type=submit]'); return b && !b.disabled; });
  assert.equal(await time.inputValue(), '16:05', 'the draft survives the reload');
  console.log('PASS invariant 15 stale form: draft kept, save re-enabled only after Recharger');

  // Invariant 15 — network error in a form: input kept; the retry saves once with the same key.
  phase = 'I15 network';
  const changes = []; page.on('request', r => { if (r.url().endsWith('/rpc/crm_change_next_action')) changes.push(r.postDataJSON()); });
  await page.route('**/rest/v1/rpc/crm_change_next_action', route => route.abort('failed'), { times: 1 });
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await dialog().getByRole('alert').filter({ hasText: UNCERTAIN }).waitFor();
  assert.equal(await time.inputValue(), '16:05', 'the input survives the network error');
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Prochaine action enregistrée' }).first().waitFor();
  assert.equal(changes.length, 2);
  assert.equal(changes[1].p_request_key, changes[0].p_request_key, 'same key after a network error');
  assert.equal(openActions(hoursLead), 1, 'one next action');
  assert.equal(sql(`select to_char(due_at at time zone public.centre_utc_offset(),'HH24:MI') from public.crm_tasks where lead_id=${q(hoursLead)} and status='open'`), '16:05', 'the agreed time is stored as chosen');
  console.log('PASS invariant 15 network: input kept, one save with the same key');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS reception forms: T7 one-tap discipline and invariant 15 (gap, hours, stale, network)');
} catch (error) {
  console.error(phase, error.message);
  throw error;
} finally {
  if (browser) await browser.close();
  removeStaff(users.map(u => u.id));
  console.log('PASS synthetic browser fixtures removed');
}
