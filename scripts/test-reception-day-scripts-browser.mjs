// RWR-r5 PR A1 — reception day scripts (plan §8), real UI on the local stack.
// Each script counts clicks and typed fields through one helper and fails above its target.
// Numbering: the plan's table, counted from 0 (0 unanswered call … 11 two staff); it is the only
// numbering under which B1's « 4, 5 » are the people scripts and C1's « 2, 9 » the payment scripts.
// A1 owns 1, 3, 6, 7, 8, 10, 11; script 0 (the T7 one-tap) is run as well.
// Scripts 3 and 8 are held at their measured A1 count: their targets need pieces the plan places
// later (§5.3 « C'est la même personne », §5.4 the « Mauvais numéro » close reason). The suite logs
// « TARGET NOT MET » for them so the gap stays visible; the PR description records the decision.
// Invariant 9 (same next action on card, Tâches row, drawer and calendar) is checked in script 1.
// Synthetic staff and prospects only, removed in finally. No external requests.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, removeStaff, slotAt, sql } from './lib/crm-next-action-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = 'http://localhost:3101', run = 'day-' + randomUUID();
const STALE = 'Ce prospect a été modifié, rechargez.';
let browser, page, users = [], phase = 'setup';
const errors = [], gaps = [];
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const rpc = (id, name, data) => JSON.parse(sql(`${as(id)}select public.crm_${name}(gen_random_uuid(),${q(JSON.stringify(data))}::jsonb);commit;`).split('\n').pop());
const intake = (id, name) => rpc(id, 'create_manual_lead', { display_name: name, learner_name: 'Apprenant synthétique', source_label: 'Manuel · Téléphone' }).lead.id;
const version = lead => Number(sql(`select version from public.crm_leads where id=${q(lead)}`));
const detail = (id, lead) => JSON.parse(sql(`${as(id)}select public.crm_get_workspace_detail(${q(lead)});commit;`).split('\n').pop());
const openRows = lead => JSON.parse(sql(`select coalesce(json_agg(json_build_object('type',task_type,'kind',schedule_kind,'due',due_at)),'[]') from public.crm_tasks where lead_id=${q(lead)} and status='open'`));
const status = lead => sql(`select status from public.crm_leads where id=${q(lead)}`);
// A phone generated per run: no phone-like literal in the repository.
const phone = () => '06' + String(randomInt(10_000_000, 99_999_999));
const dialog = () => page.getByRole('dialog').last();
const drawer = () => page.getByRole('dialog').first();
const panel = () => drawer().getByTestId('next-action-panel');
const toast = text => page.locator('[data-sonner-toast]').filter({ hasText: text }).first().waitFor();
const row = lead => page.locator(`[data-testid=work-row][data-lead-id="${lead}"]`);
// A save is done when its dialog has closed (an earlier toast may still be on screen).
const closed = async heading => { await page.getByRole('heading', { name: heading }).waitFor({ state: 'detached' }); await page.waitForLoadState('networkidle'); };

// One counter per script: every click, choice and typed field is one action.
function script(name, target, from) {
  let n = 0; const steps = [];
  const step = async (label, fn) => { n += 1; steps.push(label); await fn(); };
  return {
    click: (locator, label) => step(label, () => locator.click()),
    fill: (locator, value, label) => step(label, () => locator.fill(value)),
    select: (locator, value, label) => step(label, () => locator.selectOption(value)),
    check: (locator, label) => step(label, () => locator.check()),
    done(ceiling = target, reason = '') {
      assert(n <= ceiling, `${name}: ${n} actions, ceiling ${ceiling} (${steps.join(' → ')})`);
      if (n > target) { gaps.push(`${name}: ${n} > ${target} — ${reason}`); console.log(`TARGET NOT MET ${name}: ${n} actions (target ≤ ${target}; ${reason}) from ${from}: ${steps.join(' → ')}`); }
      else console.log(`PASS day script ${name}: ${n} actions (target ≤ ${target}) from ${from}: ${steps.join(' → ')}`);
    }
  };
}

async function login(user) {
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}
async function openDrawer(lead) { await page.goto(`${app}/crm/leads?lead=${lead}`); await panel().waitFor(); await page.waitForLoadState('networkidle'); }
async function tasks(bucket, lead) { await page.goto(`${app}/crm/today?bucket=${bucket}`); await row(lead).waitFor(); await page.waitForLoadState('networkidle'); }
const centreToday = () => sql('select (now() at time zone public.centre_utc_offset())::date');
const bucketOf = action => action.task_type === 'awaiting_prospect' ? 'awaiting' : action.overdue ? 'overdue'
  : action.local_date === centreToday() ? 'today' : action.local_date === sql(`select (now() at time zone public.centre_utc_offset())::date+1`) ? 'tomorrow' : 'upcoming';

try {
  assert.equal(sql('select count(*) from public.crm_followup_policies'), '0', 'clean local policy baseline');
  users = await createStaff(env, run, ['director', 'receptionist', 'receptionist']);
  const [director, reception, colleague] = users;
  rpc(director.id, 'create_followup_policy', LIVE_POLICY);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(`${phase}: ${e.message}`));
  await login(reception);

  // 0 — Unanswered call: from the list, open → « Pas de réponse » (≤ 2); from Tâches, 1.
  phase = 'script 0';
  const listLead = intake(reception.id, 'Jour 0 liste'), rowLead = intake(reception.id, 'Jour 0 tâches');
  sql(`update public.crm_tasks set due_at=now()-interval '1 minute' where lead_id in (${q(listLead)},${q(rowLead)}) and status='open'`);
  await page.goto(`${app}/crm/leads`); await page.locator(`[data-testid=opportunity-card][data-lead-id="${listLead}"]`).waitFor();
  const s0 = script('0 unanswered call (list)', 2, 'the prospect list');
  await s0.click(page.locator(`[data-testid=opportunity-card][data-lead-id="${listLead}"] button`).first(), 'open');
  await panel().waitFor();
  await s0.click(panel().getByRole('button', { name: 'Pas de réponse', exact: true }), 'Pas de réponse');
  await toast('Pas de réponse enregistré');
  s0.done();
  await tasks('overdue', rowLead);
  const s0b = script('0 unanswered call (Tâches)', 1, 'the Tâches row');
  await s0b.click(row(rowLead).getByRole('button', { name: 'Pas de réponse', exact: true }), 'Pas de réponse');
  await toast('Pas de réponse enregistré');
  s0b.done();
  for (const lead of [listLead, rowLead]) assert.equal(sql(`select count(*) from public.crm_activities where lead_id=${q(lead)} and event_type='call_no_answer'`), '1', 'one attempt each');

  // 1 — Inbound call wanting a test: ≤ 8 in one form; the new prospect opens in the drawer.
  phase = 'script 1';
  await page.goto(`${app}/crm/leads`);
  const s1 = script('1 inbound call wanting a test', 8, 'the prospect list');
  await s1.click(page.getByRole('button', { name: 'Ajouter un prospect', exact: true }), 'Ajouter un prospect');
  await s1.fill(dialog().getByLabel('Nom du contact', { exact: true }), 'Jour 1 appel entrant', 'contact');
  await s1.fill(dialog().getByLabel('Téléphone', { exact: true }), phone(), 'phone');
  await s1.fill(dialog().getByLabel('Nom de l’apprenant', { exact: true }), 'Apprenant synthétique', 'learner');
  await s1.check(dialog().getByLabel('Rendez-vous au centre', { exact: true }), 'Rendez-vous au centre');
  await s1.check(dialog().getByLabel('Avec test de niveau', { exact: true }), 'avec test');
  const visitTime = dialog().getByLabel('Heure', { exact: true });
  await page.waitForFunction(el => !el.disabled && el.options.length > 1, await visitTime.elementHandle());
  assert.notEqual(await dialog().getByLabel('Date', { exact: true }).inputValue(), '', 'the first day with a free slot is proposed');
  const firstSlot = (await visitTime.locator('option').evaluateAll(os => os.map(o => o.value))).filter(Boolean).at(-1);
  await s1.select(visitTime, firstSlot, 'time');
  await s1.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prospect créé');
  await panel().waitFor();
  s1.done();
  const inbound = await page.evaluate(() => new URL(location.href).searchParams.get('lead'));
  assert(inbound, 'the new prospect opens directly in the drawer (no success pop-up)');
  assert.equal(status(inbound), 'QUALIFIED', 'OD-11: an appointment with a test qualifies');
  assert.deepEqual(openRows(inbound).map(r => r.type), ['center_visit'], 'one next action: the appointment');
  assert.equal(sql(`select count(*) from public.crm_tasks where lead_id=${q(inbound)} and task_type='first_contact'`), '0', '« Premier contact » never scheduled');
  assert.equal(sql(`select p.status from public.placement_tests p join public.crm_tasks t on t.placement_test_id=p.id where t.lead_id=${q(inbound)} and t.status='open'`), 'Planifié', 'the test is booked');
  // Invariant 9: the same action on the drawer, the card, the Tâches row and the calendar.
  const action = detail(reception.id, inbound).next_action;
  await panel().getByTestId('next-action-label').filter({ hasText: action.label }).waitFor();
  await page.goto(`${app}/crm/leads`);
  await page.locator(`[data-testid=opportunity-card][data-lead-id="${inbound}"]`).getByText(action.label, { exact: false }).waitFor();
  await tasks(bucketOf(action), inbound);
  await row(inbound).getByText(action.label, { exact: false }).first().waitFor();
  await page.goto(`${app}/placement-tests?view=calendar&date=${action.local_date}&kind=center_visit`);
  await page.locator(`[data-event-key="center_visit:${action.id}"]`).getByText(action.local_time.slice(0, 5), { exact: false }).waitFor();
  console.log(`PASS invariant 9: « ${action.label} » on the drawer, the card, the Tâches row and the calendar`);

  // 3 — Walk-in « reviendra après la paie »: no date unless chosen (target ≤ 6).
  phase = 'script 3';
  await page.goto(`${app}/crm/leads`);
  const s3 = script('3 walk-in « reviendra après la paie »', 6, 'the prospect list');
  await s3.click(page.getByRole('button', { name: 'Ajouter un prospect', exact: true }), 'Ajouter un prospect');
  await s3.fill(dialog().getByLabel('Nom du contact', { exact: true }), 'Jour 3 visite', 'contact');
  await s3.fill(dialog().getByLabel('Téléphone', { exact: true }), phone(), 'phone');
  await s3.fill(dialog().getByLabel('Nom de l’apprenant', { exact: true }), 'Apprenant synthétique', 'learner');
  await s3.select(dialog().getByLabel('Origine', { exact: true }), 'Visite au centre', 'Origine : Visite au centre');
  await s3.check(dialog().getByLabel('En attente du prospect', { exact: true }), 'En attente du prospect');
  assert.equal(await dialog().getByLabel('Relancer le', { exact: true }).inputValue(), '', 'no date is forced');
  await s3.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prospect créé'); await panel().waitFor();
  // Seven with the phone: the learner name is a separate field until B1's « C'est la même personne » (§5.3).
  s3.done(7, 'the learner field stays until B1 « C’est la même personne » (§5.3)');
  const walkIn = await page.evaluate(() => new URL(location.href).searchParams.get('lead'));
  assert.equal(status(walkIn), 'ENGAGED', 'a walk-in is a conversation: ENGAGED');
  assert.deepEqual(openRows(walkIn).map(r => r.type), ['awaiting_prospect'], 'one action: « En attente »');
  assert.equal(sql(`select count(*) from public.crm_tasks where lead_id=${q(walkIn)} and task_type='first_contact'`), '0', 'a walk-in never schedules « Premier contact »');
  assert.equal(sql(`select count(*) from public.crm_activities where lead_id=${q(walkIn)} and event_type='conversation_recorded' and channel='in_person'`), '1', 'the conversation is logged');

  // 6 — No-show: « Absent » on the Tâches row (target 2: « Pas venu » → the proposed reminder).
  phase = 'script 6';
  const noShow = intake(reception.id, 'Jour 6 absent');
  rpc(reception.id, 'log_exchange', { lead_id: noShow, expected_version: version(noShow), channel: 'phone', result: 'spoke', next: { task_type: 'center_visit', due_at: slotAt('opening', 3, '11:00'), with_test: true } });
  sql(`update public.crm_tasks set due_at=now()-interval '20 minutes' where lead_id=${q(noShow)} and status='open'`);
  await tasks('overdue', noShow);
  const s6 = script('6 no-show', 2, 'the Tâches row');
  await s6.click(row(noShow).getByRole('button', { name: 'Absent', exact: true }), 'Absent');
  await toast('Résultat du rendez-vous enregistré');
  s6.done();
  assert.deepEqual(openRows(noShow).map(r => [r.type, r.kind]), [['callback', 'reminder']], 'the proposed reminder is the one next action');
  assert.equal(sql(`select status from public.placement_tests where crm_lead_id=${q(noShow)}`), 'Absent', 'the test is marked absent');

  // 7 — Callback rescheduled twice, then cancelled: ≤ 9, never a second action.
  phase = 'script 7';
  const callback = intake(reception.id, 'Jour 7 rappel');
  rpc(reception.id, 'log_exchange', { lead_id: callback, expected_version: version(callback), channel: 'phone', result: 'spoke', next: { task_type: 'callback', schedule_kind: 'appointment', due_at: slotAt('calling', 2, '16:00') } });
  const agreed = detail(reception.id, callback).next_action;
  await tasks(bucketOf(agreed), callback);
  const s7 = script('7 callback rescheduled twice, then cancelled', 9, 'the Tâches row');
  // Moved by whole weeks: the same weekday keeps the agreed 16:00 slot open.
  const later = days => sql(`select (${q(agreed.local_date)}::date+${days})::text`);
  for (const [i, opener] of [[0, () => row(callback).getByRole('button', { name: 'Changer', exact: true })], [1, () => panel().getByRole('button', { name: 'Changer', exact: true })]]) {
    await s7.click(opener(), 'Changer');
    await dialog().getByRole('heading', { name: 'Changer la prochaine action' }).waitFor();
    assert.equal(await dialog().getByLabel('Rappel convenu', { exact: true }).isChecked(), true, '« Changer » opens on the agreed callback');
    await s7.fill(dialog().getByLabel('Date', { exact: true }), later(7 * (i + 1)), 'new date (time kept)');
    await s7.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
    await toast('Prochaine action enregistrée'); await closed('Changer la prochaine action');
    assert.equal(openRows(callback).length, 1, `reschedule ${i + 1}: one action`);
  }
  await s7.click(panel().getByRole('button', { name: 'Changer', exact: true }), 'Changer');
  await s7.check(dialog().getByLabel('En attente du prospect', { exact: true }), 'En attente du prospect');
  await s7.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prochaine action enregistrée'); await closed('Changer la prochaine action');
  s7.done();
  assert.deepEqual(openRows(callback).map(r => r.type), ['awaiting_prospect'], 'never a second action; the callback is cancelled');
  assert.equal(sql(`select to_char(due_at at time zone public.centre_utc_offset(),'HH24:MI') from public.crm_tasks where lead_id=${q(callback)} and task_type='callback' order by created_at desc limit 1`), '16:00', 'the agreed time is kept across date changes');

  // 8 — Wrong number, closed (target 2; 3 with a corrected number is B1).
  phase = 'script 8';
  const wrong = intake(reception.id, 'Jour 8 mauvais numéro');
  await openDrawer(wrong);
  const s8 = script('8 wrong number (close)', 2, 'the open drawer');
  await s8.click(panel().getByRole('button', { name: 'Mauvais numéro', exact: true }), 'Mauvais numéro');
  await dialog().getByRole('heading', { name: 'Noter un échange' }).waitFor();
  await s8.check(dialog().getByLabel('Pas pour nous', { exact: true }), 'Pas pour nous');
  await s8.select(dialog().getByLabel('Motif', { exact: true }), 'invalid_spam', 'Motif');
  await s8.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prospect clôturé'); await closed('Noter un échange');
  s8.done(4, 'a one-step close needs the « Mauvais numéro » close reason (§4.8, §5.4)');
  assert.equal(status(wrong), 'NOT_QUALIFIED', 'closed as not qualified');
  assert.equal(openRows(wrong).length, 0, 'a closed prospect has no next action');

  // 10 — Closed, then reopened: 3 + 3, and booking a test works afterwards.
  phase = 'script 10';
  const closing = intake(reception.id, 'Jour 10 rouvert');
  rpc(reception.id, 'log_exchange', { lead_id: closing, expected_version: version(closing), channel: 'phone', result: 'spoke', next: { task_type: 'center_visit', due_at: slotAt('opening', 4, '11:00'), with_test: true } });
  await openDrawer(closing);
  const s10 = script('10 close', 3, 'the open drawer');
  await s10.click(drawer().getByRole('button', { name: 'Autres actions', exact: true }), 'Autres actions');
  await s10.click(page.getByRole('menuitem', { name: 'Clôturer comme perdu', exact: true }), 'Clôturer comme perdu');
  await s10.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Enregistré'); await closed('Clôturer comme perdu');
  s10.done();
  assert.equal(status(closing), 'LOST');
  assert.equal(sql(`select count(*) from public.placement_tests where crm_lead_id=${q(closing)} and status='Planifié'`), '0', 'no planned test left behind');
  await drawer().getByRole('button', { name: 'Rouvrir le prospect', exact: true }).waitFor();
  const s10b = script('10 reopen', 3, 'the open drawer');
  await s10b.click(drawer().getByRole('button', { name: 'Rouvrir le prospect', exact: true }), 'Rouvrir le prospect');
  await s10b.fill(dialog().getByLabel('Motif', { exact: true }), 'Le contact revient', 'Motif');
  await s10b.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await closed('Rouvrir le prospect'); await toast('Enregistré');
  s10b.done();
  assert.equal(openRows(closing).length, 1, 'reopened with one next action');
  await page.waitForLoadState('networkidle');
  await panel().getByRole('button', { name: 'Changer', exact: true }).click();
  await dialog().getByLabel('Rendez-vous au centre', { exact: true }).check();
  await dialog().getByLabel('Date', { exact: true }).fill(sql(`select (((now() at time zone public.centre_utc_offset())::date+5)::text)`));
  const reTime = dialog().getByLabel('Heure', { exact: true });
  await page.waitForFunction(el => !el.disabled && el.options.length > 1, await reTime.elementHandle());
  await reTime.selectOption((await reTime.locator('option').evaluateAll(os => os.map(o => o.value))).filter(Boolean)[0]);
  await dialog().getByLabel('Avec test de niveau', { exact: true }).check();
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await toast('Prochaine action enregistrée'); await closed('Changer la prochaine action');
  assert.equal(sql(`select count(*) from public.placement_tests where crm_lead_id=${q(closing)} and status='Planifié'`), '1', 'booking a test works after reopening');
  console.log('PASS day script 10: booking a test works after reopening');

  // 11 — Two staff on the same list: B's stale save is refused and reloads; default views split.
  phase = 'script 11';
  const shared = intake(reception.id, 'Jour 11 partagé');
  const theirs = intake(colleague.id, 'Jour 11 collègue');
  sql(`update public.crm_tasks set due_at=now()-interval '1 minute' where lead_id in (${q(shared)},${q(theirs)}) and status='open'`);
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await contextB.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  const pageA = page;
  page = await contextB.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(`${phase} B: ${e.message}`));
  await login(colleague);
  await page.goto(`${app}/crm/today?bucket=overdue`); await row(theirs).waitFor();
  assert.equal(await row(shared).count(), 0, 'B’s default view (« Moi + non attribué ») leaves A’s prospect to A');
  await page.goto(`${app}/crm/today?bucket=overdue&assignee=all`); await row(shared).waitFor();
  await page.goto(`${app}/crm/leads?lead=${shared}`); await panel().waitFor(); await page.waitForLoadState('networkidle');
  const pageB = page; page = pageA;
  await tasks('overdue', shared);
  assert.equal(await row(theirs).count(), 0, 'A’s default view leaves B’s prospect to B');
  await row(shared).getByRole('button', { name: 'Pas de réponse', exact: true }).click();
  await toast('Pas de réponse enregistré');
  page = pageB;
  await panel().getByRole('button', { name: 'Changer', exact: true }).click();
  await dialog().getByLabel('En attente du prospect', { exact: true }).check();
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await dialog().getByText(STALE, { exact: true }).waitFor();
  assert.equal(sql(`select count(*) from public.crm_tasks where lead_id=${q(shared)} and task_type='awaiting_prospect'`), '0', 'B’s stale save wrote nothing');
  await dialog().getByRole('button', { name: 'Recharger', exact: true }).click();
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog]')].at(-1)?.querySelector('button[type=submit]'); return b && !b.disabled; });
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await toast('Prochaine action enregistrée'); await closed('Changer la prochaine action');
  assert.deepEqual(openRows(shared).map(r => r.type), ['awaiting_prospect'], 'after the reload, B’s save applies; one action');
  page = pageA; await contextB.close();
  console.log('PASS day script 11: B refused with « rechargez », reloads and saves once; default views split the work');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log(`PASS reception day scripts 0, 1, 3, 6, 7, 8, 10, 11${gaps.length ? ` — targets not met in A1: ${gaps.join('; ')}` : ''}`);
} catch (error) {
  console.error(phase, error.message);
  if (page) {
    console.error('top dialog:', (await page.getByRole('dialog').last().innerText().catch(() => '')).slice(0, 1500));
    await page.screenshot({ path: join(tmpdir(), 'hills-day-scripts-failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  removeStaff(users.map(u => u.id));
  console.log('PASS synthetic browser fixtures removed');
}
