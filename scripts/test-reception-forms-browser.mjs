// RWR-r5 PR A1 — reception forms (plan §4.9 T7 and invariant 15), real UI on the local stack.
// T7: « Pas de réponse » is disabled in flight; a double tap sends one request with one key and
// leaves one attempt; a retry after a timeout resends the same key and payload; a retry after a
// committed but lost response replays the first result; a stale version is refused with
// « Ce prospect a été modifié, rechargez ».
// Invariant 15: a refused action is refused before the form (3-hour gap shown on open, hours not
// offered by the slot picker), or the form keeps the input (stale version, network error).
// PR #208 review fixes (plan §4.5, §4.8, §4.9): the older close / assign / reopen / « injoignable »
// dialogs refuse a stale save and never adopt the newer version (Important 1); a walk-in has no
// « Pas encore parlé » (Important 2); « Changer » offers no appointment to an unqualified prospect
// (B1); « Venu · pas intéressé » asks the reason (Important 5); the « Hors des nouveaux horaires »
// list on Tâches (Important 3).
// Synthetic staff and prospects only, removed in finally. No external requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, removeStaff, slotAt, sql } from './lib/crm-next-action-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = 'http://localhost:3101', run = 'forms-' + randomUUID();
const STALE = 'Ce prospect a été modifié, rechargez.';
const UNCERTAIN = 'Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.';
let browser, page, users = [], phase = 'setup';
const errors = [];
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
// 142 (deviation 3): crm_create_manual_lead has no API role; the fixture create runs trusted.
const rpc = (id, name, data) => JSON.parse(sql(`${name === 'create_manual_lead' ? as(id).replace('set local role authenticated;', '') : as(id)}select public.crm_${name}(gen_random_uuid(),${q(JSON.stringify(data))}::jsonb);commit;`).split('\n').pop());
const intake = (id, name) => rpc(id, 'create_manual_lead', { display_name: name, learner_name: 'Apprenant synthétique', phone: '0612345678', source_label: 'Manuel · Téléphone' }).lead.id;
const version = lead => Number(sql(`select version from public.crm_leads where id=${q(lead)}`));
const status = lead => sql(`select status from public.crm_leads where id=${q(lead)}`);
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

  // Review Important 1 (§4.9): the older dialogs never adopt a newer version. A stale save is
  // refused with « rechargez » and writes nothing; save stays disabled until « Recharger », which
  // shows the reloaded state; then the save applies once.
  phase = 'old dialogs stale';
  const leadState = lead => sql(`select concat_ws(':',status,closure_reason,owner_id) from public.crm_leads where id=${q(lead)}`);
  async function staleOld(lead, heading, opener, fill = async () => {}) {
    phase = `old dialogs stale · ${heading}`;
    if (status(lead) === 'LOST') { await page.goto(`${app}/crm/leads?lead=${lead}`); await drawer().getByRole('button', { name: 'Rouvrir le prospect', exact: true }).waitFor(); await page.waitForLoadState('networkidle'); }
    else await open(lead);
    await opener();
    await dialog().getByRole('heading', { name: heading, exact: true }).waitFor();
    await page.waitForLoadState('networkidle'); await fill();
    const before = leadState(lead);
    sql(`update public.crm_leads set version=version+1 where id=${q(lead)}`);
    await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await dialog().getByText(STALE, { exact: true }).waitFor();
    assert.equal(leadState(lead), before, `${heading}: the stale save wrote nothing`);
    assert(await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), `${heading}: save disabled until reload`);
    await dialog().getByRole('button', { name: 'Recharger', exact: true }).click();
    await dialog().getByTestId('reloaded-state').waitFor();
    await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'detached' });
    await page.waitForLoadState('networkidle');
  }
  const menu = name => async () => { await drawer().getByRole('button', { name: 'Autres actions', exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
  const staleLostLead = intake(reception.id, 'Forms stale close');
  // B2 (§5.4): one « Clôturer le prospect » form; the reason is chosen, the status derived from it.
  await staleOld(staleLostLead, 'Clôturer le prospect', menu('Clôturer le prospect'), async () => {
    await dialog().getByLabel('Motif', { exact: true }).selectOption('not_interested');
    await dialog().getByLabel('Pourquoi ?', { exact: true }).selectOption('price');
  });
  assert.equal(sql(`select status||':'||closure_reason from public.crm_leads where id=${q(staleLostLead)}`), 'LOST:price', 'close applies after the reload, with « Pourquoi ? » as the reason');
  const assignLead = intake(reception.id, 'Forms stale assign');
  await staleOld(assignLead, 'Attribuer un responsable', menu('Attribuer un responsable'), () => dialog().getByLabel('Responsable du prospect', { exact: true }).selectOption(director.id));
  assert.equal(sql(`select owner_id from public.crm_leads where id=${q(assignLead)}`), director.id, 'the assignment applies after the reload');
  const reopenLead = intake(reception.id, 'Forms stale reopen');
  rpc(reception.id, 'close_prospect', { lead_id: reopenLead, expected_version: version(reopenLead), status: 'LOST', reason: 'price' });
  await staleOld(reopenLead, 'Rouvrir le prospect', () => drawer().getByRole('button', { name: 'Rouvrir le prospect', exact: true }).click(), async () => {
    // Re-review of #208 (owner decision 3): reopening offers no appointment; it is booked through the exchange.
    const options = await dialog().locator('select option').allTextContents();
    assert.ok(options.includes('Rappel'), 'reopen action choices shown');
    assert.ok(!options.includes('Rendez-vous au centre'), 'reopen offers no « Rendez-vous au centre »');
    await dialog().getByLabel('Motif', { exact: true }).fill('Le contact revient');
  });
  assert.notEqual(sql(`select status from public.crm_leads where id=${q(reopenLead)}`), 'LOST', 'the reopening applies after the reload');
  const deadLead = intake(reception.id, 'Forms stale injoignable');
  sql(`update public.crm_leads set created_at=now()-interval '20 days',outreach_anchor_date=(now() at time zone public.centre_utc_offset())::date-20 where id=${q(deadLead)}`);
  for (let i = 1; i <= 5; i += 1) rpc(reception.id, 'log_exchange', { lead_id: deadLead, expected_version: version(deadLead), channel: 'phone', result: 'no_answer', occurred_at: sql(`select to_json(now()-interval '${12 - 2 * i} days')#>>'{}'`) });
  await staleOld(deadLead, 'Clôturer : injoignable', () => panel().getByRole('button', { name: 'Clôturer : injoignable', exact: true }).click());
  assert.equal(sql(`select status||':'||closure_reason from public.crm_leads where id=${q(deadLead)}`), 'LOST:unreachable', '« injoignable » applies after the reload');
  console.log('PASS review I1: close, assign, reopen and injoignable refuse a stale save, write nothing, and save once after « Recharger »');

  // Review Important 2 (§4.8 observation 5): a walk-in always records the first exchange.
  phase = 'walk-in';
  await page.goto(`${app}/crm/leads`);
  await page.getByRole('button', { name: 'Ajouter un prospect', exact: true }).click();
  await dialog().getByLabel('Nom du contact', { exact: true }).fill('Forms visite sans échange');
  await dialog().getByLabel('Téléphone', { exact: true }).fill('0612345678');
  await dialog().getByLabel('Nom de l’apprenant', { exact: true }).fill('Apprenant synthétique');
  const first = 'Pas encore parlé · Premier contact';
  await dialog().getByLabel('Canal', { exact: true }).selectOption('Téléphone');
  await dialog().getByLabel(first, { exact: true }).waitFor();
  await dialog().getByLabel('Canal', { exact: true }).selectOption('Visite au centre');
  assert.equal(await dialog().getByLabel(first, { exact: true }).count(), 0, 'a walk-in offers no « Pas encore parlé »');
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await dialog().getByRole('alert').filter({ hasText: 'Choisissez la prochaine action.' }).waitFor();
  assert.equal(sql(`select count(*) from public.crm_contacts where display_name='Forms visite sans échange'`), '0', 'nothing created without the exchange');
  await dialog().getByRole('button', { name: 'Annuler', exact: true }).click();
  console.log('PASS review I2: a walk-in has no « Pas encore parlé » and cannot be saved without what was agreed');

  // Review B1 (OD-11, §4.8): « Changer » never books an appointment for a prospect not yet qualified.
  phase = 'changer unqualified';
  const newLead = intake(reception.id, 'Forms rendez-vous non qualifié');
  await open(newLead);
  await panel().getByRole('button', { name: 'Changer', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Changer la prochaine action' }).waitFor();
  await dialog().getByTestId('book-through-exchange').waitFor();
  assert.equal(await dialog().getByLabel('Rendez-vous au centre', { exact: true }).count(), 0, 'no appointment offered before qualification');
  await dialog().getByRole('button', { name: 'Garder l’action actuelle', exact: true }).click();
  await page.getByRole('heading', { name: 'Changer la prochaine action' }).waitFor({ state: 'detached' });
  console.log('PASS review B1: « Changer » offers no appointment to an unqualified prospect and points to « Noter un échange »');

  // Review Important 5 (§4.8): « Venu · pas intéressé » asks the reason before closing.
  phase = 'came not interested';
  const visitLead = intake(reception.id, 'Forms venu pas intéressé');
  rpc(reception.id, 'log_exchange', { lead_id: visitLead, expected_version: version(visitLead), channel: 'phone', result: 'spoke', next: { task_type: 'center_visit', due_at: slotAt('opening', 2, '11:00') } });
  sql(`update public.crm_tasks set due_at=now()-interval '20 minutes' where lead_id=${q(visitLead)} and status='open'`);
  await open(visitLead);
  await drawer().getByTestId('appointment-outcome').getByRole('button', { name: 'Venu · pas intéressé', exact: true }).click();
  const reasonForm = page.getByRole('form', { name: 'Venu, pas intéressé : motif' });
  await reasonForm.waitFor();
  assert.equal(status(visitLead), 'QUALIFIED', 'one tap writes nothing');
  assert(await reasonForm.getByRole('button', { name: 'Clôturer', exact: true }).isDisabled(), 'the reason is required');
  await reasonForm.getByLabel('Motif', { exact: true }).selectOption('price');
  await reasonForm.getByRole('button', { name: 'Clôturer', exact: true }).click();
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Rendez-vous noté · prospect clôturé' }).first().waitFor();
  assert.equal(sql(`select status||':'||closure_reason from public.crm_leads where id=${q(visitLead)}`), 'LOST:price', 'closed with the chosen reason');
  console.log('PASS review I5: « Venu · pas intéressé » asks the reason, then closes with it');

  // Review Important 3 (§4.5): agreed times outside newly published hours are listed on Tâches,
  // kept as they are, with « Changer ». Last: it publishes new hours.
  phase = 'outside hours';
  const keptLead = intake(reception.id, 'Forms hors horaires');
  rpc(reception.id, 'log_exchange', { lead_id: keptLead, expected_version: version(keptLead), channel: 'phone', result: 'spoke', next: { task_type: 'center_visit', due_at: slotAt('opening', 3, '17:00') } });
  const keptAt = sql(`select due_at from public.crm_tasks where lead_id=${q(keptLead)} and status='open'`);
  await page.goto(`${app}/crm/today?bucket=upcoming`); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator(`[data-testid=outside-hours-row][data-lead-id="${keptLead}"]`).count(), 0, 'not listed under the hours it was booked in');
  const morning = Object.fromEntries(Object.entries(LIVE_POLICY.opening_hours).map(([d, h]) => [d, h.length ? [['09:30', '12:00']] : []]));
  rpc(director.id, 'create_followup_policy', { ...LIVE_POLICY, opening_hours: morning });
  await page.goto(`${app}/crm/today?bucket=upcoming`);
  const listed = page.locator(`[data-testid=outside-hours-row][data-lead-id="${keptLead}"]`);
  await listed.waitFor();
  await page.getByTestId('outside-hours').getByRole('heading', { name: /^Hors des nouveaux horaires \(\d+\)$/ }).waitFor();
  assert.equal(sql(`select due_at from public.crm_tasks where lead_id=${q(keptLead)} and status='open'`), keptAt, 'the agreed time is kept, never moved');
  // Follow-ups 142 (owner item 4): the server label already carries the date, so the row shows it once.
  const rowText = await listed.locator('button').first().innerText();
  assert.equal((rowText.match(/\b\d{2}\/\d{2}\b/g) || []).length, 1, `the date is shown once: ${rowText}`);
  await listed.getByRole('button', { name: 'Changer', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Changer la prochaine action' }).waitFor();
  console.log('PASS review I3: « Hors des nouveaux horaires » lists the kept appointment with « Changer »; its time is unchanged');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS reception forms: T7 one-tap discipline, invariant 15 (gap, hours, stale, network) and the #208 review fixes');
} catch (error) {
  console.error(phase, error.message);
  throw error;
} finally {
  if (browser) await browser.close();
  removeStaff(users.map(u => u.id));
  console.log('PASS synthetic browser fixtures removed');
}
