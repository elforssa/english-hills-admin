// RWR-r5 PRs A1 and B1 — reception day scripts (plan §8), real UI on the local stack.
// Each script counts clicks and typed fields through one helper and fails above its target.
// Numbering: the plan's §8 table rows 0–11 (0 unanswered call … 11 two staff).
// A1 owns 1, 3, 6, 7, 8, 10, 11; script 0 (the T7 one-tap) is run as well. C1 (payments, §6.1)
// owns 2 (walk-in who pays now, one flow) and 9 (partial payment, then the balance). B1 (people,
// §5.1–5.3) owns 4 and 5, brings 3 to its ≤ 6 target (« C'est la même personne ») and 8 to
// « corrected in 3 ». Script 8's close variant stays at the A1 count the owner accepted on
// 2026-11-22 (plan, implementation record): 4, its close-in-2 target in B2 (close reasons, §5.4).
// The suite fails above that ceiling and logs « ACCEPTED A1 COUNT » with the later target so the
// gap stays visible.
// Invariant 9 (same next action on card, Tâches row, drawer and calendar) is checked in script 1.
// Synthetic staff, prospects, learners and payments only, removed in finally. No external requests.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, slotAt, sql } from './lib/crm-next-action-local.mjs';
import { openDaySql, openSlotSql } from './lib/centre-days.mjs';
import { removeStaffAndPayments } from './lib/desk-payments-local.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = 'http://localhost:3101', run = 'day-' + randomUUID();
const STALE = 'Ce prospect a été modifié, rechargez.';
let browser, page, users = [], learners = [], phase = 'setup', family = null;
const errors = [], gaps = [];
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const rpc = (id, name, data) => JSON.parse(sql(`${as(id)}select public.crm_${name}(gen_random_uuid(),${q(JSON.stringify(data))}::jsonb);commit;`).split('\n').pop());
const intake = (id, name, extra = {}) => rpc(id, 'create_manual_lead', { display_name: name, learner_name: 'Apprenant synthétique', source_label: 'Manuel · Téléphone', ...extra }).lead.id;
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
      if (n > target) { gaps.push(`${name}: ${n} > ${target} — ${reason}`); console.log(`ACCEPTED A1 COUNT ${name}: ${n} actions (later target ≤ ${target}; ${reason}) from ${from}: ${steps.join(' → ')}`); }
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

  // 2 — Walk-in who pays now (C1, ≤ 12, one flow): the prospect form with « Inscrire maintenant » goes on to
  // « Inscrire et encaisser », and step 1 is one click when no learner matches (§6.1).
  phase = 'script 2';
  await page.goto(`${app}/crm/leads`);
  const learner2 = `Apprenant jour 2 ${run.slice(-8)}`;
  const s2 = script('2 walk-in who pays now', 12, 'the prospect list');
  await s2.click(page.getByRole('button', { name: 'Ajouter un prospect', exact: true }), 'Ajouter un prospect');
  await s2.fill(dialog().getByLabel('Nom du contact', { exact: true }), 'Jour 2 paie maintenant', 'contact');
  await s2.fill(dialog().getByLabel('Téléphone', { exact: true }), phone(), 'phone');
  await s2.fill(dialog().getByLabel('Nom de l’apprenant', { exact: true }), learner2, 'learner');
  await s2.select(dialog().getByLabel('Origine', { exact: true }), 'Visite au centre', 'Origine : Visite au centre');
  await s2.check(dialog().getByLabel('Inscrire maintenant', { exact: true }), 'Inscrire maintenant');
  await s2.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prospect créé');
  await dialog().getByText('1 / 3 · Apprenant', { exact: true }).waitFor();
  const create = dialog().getByRole('button', { name: 'Créer un nouvel apprenant', exact: true });
  await page.waitForFunction(el => !el.disabled, await create.elementHandle());
  await s2.click(create, 'Créer un nouvel apprenant');
  await dialog().getByText('2 / 3 · Inscription', { exact: true }).waitFor();
  await s2.click(dialog().getByRole('button', { name: 'Continuer', exact: true }), 'Continuer');
  await dialog().getByText('3 / 3 · Paiement', { exact: true }).waitFor();
  await s2.fill(dialog().getByLabel('Prix brut convenu', { exact: true }), '3000', 'prix');
  await s2.fill(dialog().getByLabel('Montant payé aujourd’hui', { exact: true }), '1000', 'montant');
  await s2.click(dialog().getByRole('button', { name: 'Inscrire et encaisser', exact: true }), 'Inscrire et encaisser');
  await dialog().getByText(/^Inscription confirmée · reçu \S+$/).waitFor();
  s2.done();
  const paidNow = await page.evaluate(() => new URL(location.href).searchParams.get('lead'));
  assert.equal(status(paidNow), 'CONVERTED', 'ADR-015: the payment confirms the enrollment and converts the prospect');
  const paidLearner = sql(`select student_id from public.crm_leads where id=${q(paidNow)}`);
  learners.push(paidLearner);
  assert.equal(sql(`select count(*) from public.receipts where student_id=${q(paidLearner)} and voided_at is null`), '1', 'one receipt');
  assert.equal(Number(sql(`select balance from public.charge_balances where student_id=${q(paidLearner)}`)), 2000, 'open balance = price − payments (invariant 12)');
  assert.equal(openRows(paidNow).length, 0, 'a converted prospect has no next action');

  // 3 — Walk-in « reviendra après la paie »: no date unless chosen (target ≤ 6).
  phase = 'script 3';
  await page.goto(`${app}/crm/leads`);
  const s3 = script('3 walk-in « reviendra après la paie »', 6, 'the prospect list');
  await s3.click(page.getByRole('button', { name: 'Ajouter un prospect', exact: true }), 'Ajouter un prospect');
  await s3.fill(dialog().getByLabel('Nom du contact', { exact: true }), 'Jour 3 visite', 'contact');
  await s3.fill(dialog().getByLabel('Téléphone', { exact: true }), phone(), 'phone');
  // B1 (§5.3): « C'est la même personne » is ticked while the learner field is empty.
  assert.equal(await dialog().getByLabel('C’est la même personne', { exact: true }).isChecked(), true, '« C’est la même personne » ticked by default');
  await s3.select(dialog().getByLabel('Origine', { exact: true }), 'Visite au centre', 'Origine : Visite au centre');
  await s3.check(dialog().getByLabel('En attente du prospect', { exact: true }), 'En attente du prospect');
  assert.equal(await dialog().getByLabel('Relancer le', { exact: true }).inputValue(), '', 'no date is forced');
  await s3.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prospect créé'); await panel().waitFor();
  s3.done();
  const walkIn = await page.evaluate(() => new URL(location.href).searchParams.get('lead'));
  assert.equal(sql(`select l.learner_name=c.display_name and c.contact_kind='adult_learner' from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=${q(walkIn)}`), 't', 'the learner is the contact (adult learner)');
  assert.equal(status(walkIn), 'ENGAGED', 'a walk-in is a conversation: ENGAGED');
  assert.deepEqual(openRows(walkIn).map(r => r.type), ['awaiting_prospect'], 'one action: « En attente »');
  assert.equal(sql(`select count(*) from public.crm_tasks where lead_id=${q(walkIn)} and task_type='first_contact'`), '0', 'a walk-in never schedules « Premier contact »');
  assert.equal(sql(`select count(*) from public.crm_activities where lead_id=${q(walkIn)} and event_type='conversation_recorded' and channel='in_person'`), '1', 'the conversation is logged');

  // 4 — Mother with two children (B1, ≤ 10): one contact, two learners, one Tâches row.
  phase = 'script 4';
  await page.goto(`${app}/crm/leads`);
  const s4 = script('4 mother with two children', 10, 'the prospect list');
  await s4.click(page.getByRole('button', { name: 'Ajouter un prospect', exact: true }), 'Ajouter un prospect');
  await s4.fill(dialog().getByLabel('Nom du contact', { exact: true }), 'Jour 4 maman', 'contact');
  await s4.fill(dialog().getByLabel('Téléphone', { exact: true }), phone(), 'phone');
  await s4.fill(dialog().getByLabel('Nom de l’apprenant', { exact: true }), 'Jour 4 aînée', 'learner 1');
  assert.equal(await dialog().getByLabel('C’est la même personne', { exact: true }).isChecked(), false, 'typing a learner unticks « C’est la même personne »');
  await s4.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prospect créé'); await panel().waitFor();
  const elder = await page.evaluate(() => new URL(location.href).searchParams.get('lead'));
  await s4.click(drawer().getByRole('button', { name: 'Ajouter un enfant', exact: true }), 'Ajouter un enfant');
  await dialog().getByRole('heading', { name: 'Ajouter un enfant' }).waitFor();
  await s4.fill(dialog().getByLabel('Nom de l’apprenant', { exact: true }), 'Jour 4 cadet', 'learner 2');
  await s4.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Prospect créé');
  await page.waitForFunction(id => new URL(location.href).searchParams.get('lead') !== id, elder);
  await panel().waitFor();
  s4.done();
  const younger = await page.evaluate(() => new URL(location.href).searchParams.get('lead'));
  assert.equal(sql(`select count(distinct contact_id)||'/'||count(*) from public.crm_leads where id in (${q(elder)},${q(younger)})`), '1/2', 'one contact, two learners');
  assert.equal(sql(`select count(*) from public.person_match_decisions where id_a in (${q(elder)},${q(younger)}) or id_b in (${q(elder)},${q(younger)})`), '0', 'no duplicate flagged between siblings');
  await drawer().getByRole('button', { name: 'Jour 4 aînée', exact: true }).waitFor();
  const shown = JSON.parse(sql(`${as(reception.id)}select (select jsonb_agg(r) from unnest(array['overdue','today','tomorrow','upcoming','awaiting']) b,
    jsonb_array_elements(public.crm_get_work_queue(p_bucket=>b,p_assignee_mode=>'all',p_limit=>50)->'rows') r where (r->>'lead_id')::uuid in (${q(elder)},${q(younger)}));commit;`).split('\n').pop());
  assert.equal(shown.length, 1, 'one Tâches row for the family');
  await tasks(bucketOf(shown[0].next_action), shown[0].lead_id);
  assert.equal(await page.locator(`[data-testid=work-row][data-lead-id="${shown[0].lead_id === elder ? younger : elder}"]`).count(), 0, 'the sibling has no row of its own');
  await row(shown[0].lead_id).getByTestId('work-row-family').getByText(shown[0].lead_id === elder ? 'Jour 4 cadet' : 'Jour 4 aînée', { exact: false }).waitFor();
  console.log('PASS day script 4: one contact, two learners, one Tâches row listing the other learner');

  // 5 — Current family calling about something else (B1, ≤ 3): global search by phone in another
  // format opens the student's file; no prospect is created.
  phase = 'script 5';
  const known = randomUUID(), knownPhone = phone();
  family = known;
  sql(`insert into public.students(id,full_name,telephone,status,session_type) values(${q(known)},'Jour 5 apprenant inscrit',${q(knownPhone)},'Prospect','Yearly')`);
  const leadsBefore = sql('select count(*) from public.crm_leads');
  await page.goto(`${app}/crm/today`);
  const s5 = script('5 current family calling', 3, 'any page');
  await s5.click(page.getByRole('button', { name: 'Rechercher une personne', exact: true }).first(), 'Rechercher une personne');
  // The number as the caller gives it: +212, spaces, no leading 0.
  await s5.fill(dialog().getByLabel('Nom, téléphone ou e-mail', { exact: true }), '+212 ' + knownPhone.slice(1).replace(/(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5'), 'phone, other format');
  await s5.click(dialog().locator(`[data-testid=people-result][data-kind=student][data-id="${known}"]`), 'open the student');
  await page.waitForURL(url => url.pathname === `/students/${known}`);
  await page.getByRole('heading', { name: 'Jour 5 apprenant inscrit' }).waitFor();
  s5.done();
  assert.equal(sql('select count(*) from public.crm_leads'), leadsBefore, 'no prospect created');

  // 6 — No-show: « Absent » on the Tâches row, then « Confirmer le rappel » (target 2: « Pas venu » →
  // the proposed reminder; review Important 5: the first tap alone writes nothing).
  phase = 'script 6';
  const noShow = intake(reception.id, 'Jour 6 absent');
  rpc(reception.id, 'log_exchange', { lead_id: noShow, expected_version: version(noShow), channel: 'phone', result: 'spoke', next: { task_type: 'center_visit', due_at: slotAt('opening', 3, '11:00'), with_test: true } });
  sql(`update public.crm_tasks set due_at=now()-interval '20 minutes' where lead_id=${q(noShow)} and status='open'`);
  await tasks('overdue', noShow);
  const s6 = script('6 no-show', 2, 'the Tâches row');
  await s6.click(row(noShow).getByRole('button', { name: 'Absent', exact: true }), 'Absent');
  const reminder = row(noShow).getByRole('group', { name: 'Absent : rappel proposé' });
  await reminder.waitFor();
  assert.deepEqual(openRows(noShow).map(r => r.type), ['center_visit'], '« Absent » alone writes nothing');
  await s6.click(reminder.getByRole('button', { name: 'Confirmer le rappel', exact: true }), 'Confirmer le rappel');
  await toast('Résultat du rendez-vous enregistré');
  s6.done();
  assert.deepEqual(openRows(noShow).map(r => [r.type, r.kind]), [['callback', 'reminder']], 'the proposed reminder is the one next action');
  assert.equal(sql(`select status from public.placement_tests where crm_lead_id=${q(noShow)}`), 'Absent', 'the test is marked absent');

  // 7 — Callback rescheduled twice, then cancelled: ≤ 9, never a second action.
  phase = 'script 7';
  const callback = intake(reception.id, 'Jour 7 rappel');
  // Exactly 16:00 on a day with calling hours at 16:00: slotAt('calling', 2, …) clamps Friday + 2 (Sunday) to Monday 15:00.
  rpc(reception.id, 'log_exchange', { lead_id: callback, expected_version: version(callback), channel: 'phone', result: 'spoke', next: { task_type: 'callback', schedule_kind: 'appointment', due_at: sql(`select to_json(${openSlotSql(2, '16:00', 'calling')})#>>'{}'`) } });
  const agreed = detail(reception.id, callback).next_action;
  await tasks(bucketOf(agreed), callback);
  const s7 = script('7 callback rescheduled twice, then cancelled', 9, 'the Tâches row');
  // Moved by whole weeks: the same weekday keeps the agreed 16:00 slot open.
  const later = days => sql(`select (${q(agreed.local_date)}::date+${days})::text`);
  for (const [i, opener] of [[0, () => row(callback).getByRole('button', { name: 'Changer', exact: true })], [1, () => panel().getByRole('button', { name: 'Changer', exact: true })]]) {
    await s7.click(opener(), 'Changer');
    await dialog().getByRole('heading', { name: 'Changer la prochaine action' }).waitFor();
    assert.equal(await dialog().getByLabel('Rappel convenu', { exact: true }).isChecked(), true, '« Changer » opens on the agreed callback');
    // The hours are loaded and the agreed time is shown before the date changes.
    await page.waitForFunction(el => !el.disabled && el.options.length > 1 && el.value === '16:00', await dialog().getByLabel('Heure', { exact: true }).elementHandle());
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

  // 8 — Wrong number, corrected (B1, 3): « Mauvais numéro » → the right number → Enregistrer.
  phase = 'script 8 corrected';
  const fixedLead = intake(reception.id, 'Jour 8 numéro corrigé', { phone: phone() });
  await openDrawer(fixedLead);
  const rightNumber = phone();
  const s8c = script('8 wrong number (corrected)', 3, 'the open drawer');
  await s8c.click(panel().getByRole('button', { name: 'Mauvais numéro', exact: true }), 'Mauvais numéro');
  await dialog().getByRole('heading', { name: 'Noter un échange' }).waitFor();
  await s8c.fill(dialog().getByLabel('Numéro corrigé', { exact: true }), rightNumber.replace(/(\d{2})(?=\d)/g, '$1 '), 'numéro corrigé');
  await s8c.click(dialog().getByRole('button', { name: 'Enregistrer', exact: true }), 'Enregistrer');
  await toast('Numéro corrigé'); await closed('Noter un échange');
  s8c.done();
  assert.equal(sql(`select c.phone_e164 from public.crm_contacts c join public.crm_leads l on l.contact_id=c.id where l.id=${q(fixedLead)}`), '+212' + rightNumber.slice(1), 'the contact’s number is corrected (E.164)');
  assert.deepEqual(openRows(fixedLead).map(r => r.type), ['contact_attempt'], 'calling starts again on the new number: one action');
  assert.equal(sql(`select count(*) from public.crm_activities where lead_id=${q(fixedLead)} and is_primary and details->>'summary' like 'Mauvais numéro · numéro corrigé%'`), '1', 'one history entry');

  // 8 — Wrong number, closed (A1 ceiling 4; close in 2 is B2).
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
  s8.done(4, 'accepted for A1; close in 2 in B2 with the close-reason list (§5.4)');
  assert.equal(status(wrong), 'NOT_QUALIFIED', 'closed as not qualified');
  assert.equal(openRows(wrong).length, 0, 'a closed prospect has no next action');

  // 9 — Partial payment, then the balance (C1, ≤ 4): « Encaisser » opens on the oldest open balance.
  // The first payment was taken earlier by the director, so no duplicate warning applies (§6.1 rule).
  phase = 'script 9';
  const learner9 = sql(`insert into public.students(full_name,status,session_type) values(${q('Jour 9 solde ' + run.slice(-8))},'Prospect','Yearly') returning id`).split('\n').pop();
  learners.push(learner9);
  sql(`${as(director.id)}select public.create_charge_payment(${q(JSON.stringify({ student_id: learner9, session_type: 'Yearly', school_year: '2026/2027', level: 'Child 2', gross_amount: 3000, discount_amount: 0, payment_amount: 1000, payment_method: 'Espèces', idempotency_key: randomUUID() }))}::jsonb);commit;`);
  const charge9 = sql(`select id from public.charges where student_id=${q(learner9)}`);
  await page.goto(`${app}/students/${learner9}`); await page.waitForLoadState('networkidle');
  const s9 = script('9 partial payment, then the balance', 4, 'the learner file');
  await s9.click(page.getByRole('link', { name: 'Inscrire et encaisser', exact: true }), '« Inscrire et encaisser » (Encaisser)');
  await page.locator(`[data-balance-id="${charge9}"] button[aria-pressed=true]`).waitFor();
  assert.equal(await page.getByText('Session *', { exact: true }).count(), 0, 'opens on the balance: no new-charge terms');
  await s9.fill(page.locator('label').filter({ hasText: 'Montant payé aujourd’hui *' }).locator('input'), '2000', 'montant');
  await s9.click(page.getByRole('button', { name: 'Enregistrer et générer le reçu', exact: true }), 'Enregistrer et générer le reçu');
  await page.waitForURL(url => /\/receipts\/[0-9a-f-]{36}\/print$/.test(url.pathname));
  s9.done();
  assert.equal(Number(sql(`select balance from public.charge_balances where id=${q(charge9)}`)), 0, 'the balance is collected on the same charge');
  assert.equal(sql(`select count(*) from public.charges where student_id=${q(learner9)}`), '1', 'no second charge');
  assert.equal(sql(`select count(*) from public.receipts where charge_id=${q(charge9)} and voided_at is null`), '2', 'two receipts, one charge');

  // 10 — Closed, then reopened: 3 + 3, and booking a test works afterwards — through « Noter un échange »:
  // the reopened prospect is not qualified, so « Changer » offers no appointment (review B1, OD-11).
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
  await dialog().getByTestId('book-through-exchange').waitFor();
  assert.equal(await dialog().getByLabel('Rendez-vous au centre', { exact: true }).count(), 0, '« Changer » offers no appointment before the exchange');
  await dialog().getByRole('button', { name: 'Garder l’action actuelle', exact: true }).click();
  await page.getByRole('heading', { name: 'Changer la prochaine action' }).waitFor({ state: 'detached' });
  await panel().getByRole('button', { name: 'Noter un échange', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Noter un échange' }).waitFor();
  await dialog().getByLabel('On a parlé', { exact: true }).check();
  await dialog().getByLabel('Rendez-vous au centre', { exact: true }).check();
  // The first centre date from tomorrow with opening hours (a fixed today + 5 is the closed Sunday on a Tuesday).
  await dialog().getByLabel('Date', { exact: true }).fill(sql(`select ${openDaySql(1)}`));
  const reTime = dialog().getByLabel('Heure', { exact: true });
  await page.waitForFunction(el => !el.disabled && el.options.length > 1, await reTime.elementHandle());
  await reTime.selectOption((await reTime.locator('option').evaluateAll(os => os.map(o => o.value))).filter(Boolean)[0]);
  await dialog().getByLabel('Avec test de niveau', { exact: true }).check();
  await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await toast('Échange enregistré'); await closed('Noter un échange');
  assert.equal(sql(`select count(*) from public.placement_tests where crm_lead_id=${q(closing)} and status='Planifié'`), '1', 'booking a test works after reopening');
  assert.equal(status(closing), 'QUALIFIED', 'the exchange qualifies');
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
  console.log(`PASS reception day scripts 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11${gaps.length ? ` — accepted A1 counts (owner, 2026-11-22): ${gaps.join('; ')}` : ''}`);
} catch (error) {
  console.error(phase, error.message);
  if (page) {
    console.error('top dialog:', (await page.getByRole('dialog').last().innerText().catch(() => '')).slice(0, 1500));
    await page.screenshot({ path: join(tmpdir(), 'hills-day-scripts-failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  removeStaffAndPayments(users.map(u => u.id), learners);
  if (family) sql(`delete from public.students where id=${q(family)}`);
  console.log('PASS synthetic browser fixtures removed');
}
