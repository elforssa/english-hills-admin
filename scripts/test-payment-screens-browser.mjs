// RWR-r5 PR C1 (plan §6.1, invariant 12) — the payment panel in both screens, real UI on the
// local stack: « Encaisser » (/receipts/new) and « Inscrire et encaisser » (CRM wizard).
//   1. Invariant 12: the same learner shows the same open balances (get_open_balances, oldest
//      first) in both screens, before and after a payment in each; « Encaisser » opens on the
//      oldest balance; the wizard offers « Encaisser sur cet engagement » and creates no second
//      charge; the wizard runs the duplicate check (rule « recent_by_you »).
//   2. The in-app duplicate panel on « Encaisser » (rule « same_charge »): « Annuler » saves
//      nothing, « C'est un autre paiement » saves once; another amount is not flagged.
//   3. OD-2 = A: « Réserver sans paiement » from the wizard (no receipt, no enrollment, no
//      conversion, next action « Encaisser l'acompte »); « Encaisser » sends that charge back
//      to the prospect; the wizard then collects it on the same charge and converts.
//      PR #216 review (B2): in another prospect's wizard for the same learner that
//      reservation shows « Ouvrir le prospect », is never selected and nothing sends a new
//      session without the « Nouvelle session » click; after a reservation_collect_on_prospect
//      refusal (a stale balance read) the screen lands on no choice, never on « Nouvelle session ».
//   4. The receipts list « Avec solde » filter.
// Synthetic staff, prospects, learners and payments only, removed in finally. Dates from
// scripts/lib/centre-days.mjs. No external requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { LIVE_POLICY, createStaff, localEnv, q, sql } from './lib/crm-next-action-local.mjs';
import { openDaySql, openSlotSql } from './lib/centre-days.mjs';
import { removeStaffAndPayments } from './lib/desk-payments-local.mjs';
import { enrollmentSchoolYear } from '../src/lib/crm/enrollment.mjs';
import { EAP_REASON_TEXT } from '../src/lib/academic/membershipActions.mjs';
import { COMMITMENT_CHOICE } from '../src/lib/finance/paymentPanel.mjs';

assertLocalFeatureBranch();
const env = localEnv(), app = 'http://localhost:3101', run = 'pay-' + randomUUID().slice(0, 8), YEAR = enrollmentSchoolYear();
let browser, page, users = [], learners = [], phase = 'setup';
const errors = [];
const as = id => `begin;select set_config('request.jwt.claim.sub',${q(id)},true);set local role authenticated;`;
const rpc = (id, name, data) => JSON.parse(sql(`${as(id)}select public.crm_${name}(gen_random_uuid(),${q(JSON.stringify(data))}::jsonb);commit;`).split('\n').pop());
const deskPay = (id, data) => JSON.parse(sql(`${as(id)}select public.create_charge_payment(${q(JSON.stringify({ discount_amount: 0, payment_method: 'Espèces', idempotency_key: randomUUID(), ...data }))}::jsonb);commit;`).split('\n').pop());
const version = lead => Number(sql(`select version from public.crm_leads where id=${q(lead)}`));
const status = lead => sql(`select status from public.crm_leads where id=${q(lead)}`);
const count = query => Number(sql(query));
const learner = name => { const id = sql(`insert into public.students(full_name,status,session_type) values(${q(name)},'Prospect','Yearly') returning id`).split('\n').pop(); learners.push(id); return id; };
const dueDate = () => sql(`select ${openDaySql(3)}`);
// get_open_balances read as the director: { charge id → balance } (the server's truth).
const serverBalances = (director, student) => Object.fromEntries(JSON.parse(sql(`${as(director)}select public.get_open_balances(${q(student)});commit;`).split('\n').pop()).rows.map(r => [r.id, Number(r.balance)]));
const dialog = () => page.getByRole('dialog').last();
const footer = () => dialog().locator('[data-dialog-footer]');
const field = label => page.locator('label').filter({ hasText: label }).locator('input, select').first();
const toast = text => page.locator('[data-sonner-toast]').filter({ hasText: text }).first().waitFor();
// Whole MAD amounts in either locale grouping: keep the digits of « reste … MAD ».
const shownBalance = text => Number((/reste ([^M]+) MAD/.exec(text)?.[1] || '').replace(/\D/g, ''));
async function balancesOnScreen(scope = page) {
  const rows = scope.locator('[data-balance-id]');
  await rows.first().waitFor();
  return Object.fromEntries(await rows.evaluateAll(els => els.map(el => [el.dataset.balanceId, el.innerText]))
    .then(list => list.map(([id, text]) => [id, shownBalance(text)])));
}

async function login(user) {
  await page.goto(app + '/login');
  await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
  await page.getByLabel('Adresse email', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}
async function encaisser(student) {
  await page.goto(`${app}/receipts/new?student_id=${student}`);
  await page.getByText('Apprenant sélectionné', { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
}
async function payAtDesk(amount) {
  await field('Montant payé aujourd’hui *').fill(String(amount));
  await page.getByRole('button', { name: 'Enregistrer et générer le reçu', exact: true }).click();
}
const printed = () => page.waitForURL(url => /\/receipts\/[0-9a-f-]{36}\/print$/.test(url.pathname));
async function openWizard(lead) {
  await page.goto(`${app}/crm/leads?lead=${lead}`);
  await page.getByRole('button', { name: 'Inscrire et encaisser', exact: true }).click();
  await dialog().getByText('1 / 3 · Apprenant', { exact: true }).waitFor();
}
function qualified(staff, contact, learnerName) {
  const lead = rpc(staff, 'create_prospect', { display_name: contact, learner_name: learnerName, source_label: 'Manuel · Téléphone' }).lead.id;
  rpc(staff, 'log_exchange', { lead_id: lead, expected_version: version(lead), channel: 'phone', result: 'spoke',
    next: { enrol: { due_at: sql(`select to_json(${openSlotSql(1, '16:00', 'calling')})#>>'{}'`) } } });
  assert.equal(status(lead), 'QUALIFIED');
  return lead;
}

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
  await login(reception);

  // 1 — Invariant 12 across both screens, « Encaisser sur cet engagement », the wizard's duplicate check.
  phase = 'invariant 12';
  const nameA = `Paiement A ${run}`, studentA = learner(nameA);
  const chargeX = deskPay(director.id, { student_id: studentA, session_type: 'Yearly', school_year: YEAR, level: 'Child 2', gross_amount: 3000, payment_amount: 1000 }).charge_id
    || sql(`select id from public.charges where student_id=${q(studentA)} and session_type='Yearly'`);
  deskPay(director.id, { student_id: studentA, session_type: 'Mise à niveau', school_year: YEAR, level: 'B1', gross_amount: 1800, payment_amount: 0, due_date: dueDate() });
  const chargeY = sql(`select id from public.charges where student_id=${q(studentA)} and session_type='Mise à niveau'`);
  assert.equal(sql(`select enrollment_id is null from public.charges where id=${q(chargeY)}`), 't', 'Y is an unlinked commitment');
  assert.deepEqual(serverBalances(director.id, studentA), { [chargeX]: 2000, [chargeY]: 1800 });

  await encaisser(studentA);
  assert.deepEqual(await balancesOnScreen(), serverBalances(director.id, studentA), '« Encaisser » shows get_open_balances');
  assert.deepEqual(await page.locator('[data-balance-id]').evaluateAll(els => els.map(el => el.dataset.balanceId)), [chargeX, chargeY], 'oldest first');
  await page.locator(`[data-balance-id="${chargeX}"] button[aria-pressed=true]`).waitFor();
  assert.equal(await page.getByText('Session *', { exact: true }).count(), 0, '« Encaisser » opens on the oldest open balance');
  await payAtDesk(500); await printed();
  assert.equal(count(`select count(*) from public.charges where student_id=${q(studentA)}`), 2, 'paid on X: no new charge');

  const leadA = qualified(reception.id, `Contact A ${run}`, nameA);
  await openWizard(leadA);
  await dialog().getByText(nameA, { exact: true }).locator('..').getByRole('button', { name: 'Utiliser cet apprenant', exact: true }).click();
  await dialog().getByRole('button', { name: 'Continuer', exact: true }).click();
  await dialog().getByText('2 / 3 · Inscription', { exact: true }).waitFor();
  await dialog().getByLabel('Programme', { exact: true }).selectOption('Mise à niveau');
  await dialog().getByLabel('Année scolaire', { exact: true }).fill(YEAR);
  await dialog().getByRole('button', { name: 'Continuer', exact: true }).click();
  await dialog().getByText('3 / 3 · Paiement', { exact: true }).waitFor();
  const wizardRows = await balancesOnScreen(dialog());
  assert.deepEqual(wizardRows, { [chargeY]: serverBalances(director.id, studentA)[chargeY] }, 'the wizard shows the same balance for the commitment');
  await dialog().locator(`[data-balance-id="${chargeY}"] button[aria-pressed=true]`).filter({ hasText: 'Encaisser sur cet engagement' }).waitFor();
  assert.equal(await dialog().getByLabel('Prix brut convenu', { exact: true }).count(), 0, 'on the commitment: no new price');
  assert.equal(await dialog().getByRole('button', { name: 'Réserver sans paiement' }).count(), 0, 'no reservation next to a commitment');
  await dialog().getByLabel('Montant payé aujourd’hui', { exact: true }).fill('500');
  await footer().getByRole('button', { name: 'Inscrire et encaisser', exact: true }).click();
  const wizardDup = dialog().getByRole('alertdialog', { name: 'Reçu peut-être en double' });
  await wizardDup.getByText('Vous avez enregistré un reçu pour cet apprenant il y a moins de 2 minutes.', { exact: true }).waitFor();
  assert.equal(count(`select count(*) from public.receipts where charge_id=${q(chargeY)}`), 0, 'nothing saved while the duplicate panel is open');
  await wizardDup.getByRole('button', { name: 'C’est un autre paiement', exact: true }).click();
  await dialog().getByText(/^Inscription confirmée · reçu \S+$/).waitFor();
  assert.equal(status(leadA), 'CONVERTED', 'collected on the commitment: converted (ADR-015)');
  assert.equal(count(`select count(*) from public.charges where student_id=${q(studentA)}`), 2, 'no second charge (NF-4)');
  assert.equal(sql(`select enrollment_id is not null from public.charges where id=${q(chargeY)}`), 't', 'the commitment is linked to the enrollment');
  await dialog().getByRole('button', { name: 'Terminé', exact: true }).click();
  await encaisser(studentA);
  assert.deepEqual(await balancesOnScreen(), { [chargeX]: 1500, [chargeY]: 1300 }, 'both payments show on « Encaisser »');
  assert.deepEqual(await balancesOnScreen(), serverBalances(director.id, studentA));
  console.log('PASS invariant 12: same open balances on « Encaisser » and « Inscrire et encaisser », oldest first, no second charge');

  // 2 — The in-app duplicate panel on « Encaisser » (same learner, amount, day and charge).
  phase = 'duplicate panel';
  const studentB = learner(`Solde ${run} ouvert`);
  deskPay(director.id, { student_id: studentB, session_type: 'Yearly', school_year: YEAR, level: 'Child 3', gross_amount: 3000, payment_amount: 1000 });
  const chargeB = sql(`select id from public.charges where student_id=${q(studentB)}`);
  const firstB = sql(`select receipt_number from public.receipts where charge_id=${q(chargeB)}`);
  await encaisser(studentB);
  await field('Montant payé aujourd’hui *').fill('1000');
  await page.getByRole('button', { name: 'Enregistrer et générer le reçu', exact: true }).click();
  const deskDup = page.getByRole('alertdialog', { name: 'Reçu peut-être en double' });
  await deskDup.getByText(`Reçu N° ${firstB}`, { exact: false }).waitFor();
  await deskDup.getByText('Même apprenant, même montant, même jour et même engagement.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Enregistrer et générer le reçu', exact: true }).isDisabled(), true, 'save locked while the panel is open');
  await deskDup.getByRole('button', { name: 'Annuler', exact: true }).click();
  await deskDup.waitFor({ state: 'detached' });
  assert.equal(count(`select count(*) from public.receipts where charge_id=${q(chargeB)}`), 1, '« Annuler » saved nothing');
  await field('Montant payé aujourd’hui *').fill('400');
  await page.getByRole('button', { name: 'Enregistrer et générer le reçu', exact: true }).click();
  await printed();
  assert.equal(count(`select count(*) from public.receipts where charge_id=${q(chargeB)}`), 2, 'another amount by another staff member is not flagged');
  await encaisser(studentB);
  await field('Montant payé aujourd’hui *').fill('1000');
  await page.getByRole('button', { name: 'Enregistrer et générer le reçu', exact: true }).click();
  await deskDup.getByText(`Reçu N° ${firstB}`, { exact: false }).waitFor();
  await deskDup.getByRole('button', { name: 'C’est un autre paiement', exact: true }).click();
  await printed();
  assert.equal(count(`select count(*) from public.receipts where charge_id=${q(chargeB)}`), 3, '« C’est un autre paiement » saves once');
  assert.equal(count(`select balance from public.charge_balances where id=${q(chargeB)}`), 600);
  console.log('PASS duplicate panel: shown with the existing receipt, « Annuler » saves nothing, confirm saves once');

  // 3 — OD-2 = A: « Réserver sans paiement » from the wizard, then collected from the prospect.
  phase = 'reservation';
  const nameR = `Réservé ${run}`, leadR = qualified(reception.id, `Contact R ${run}`, nameR), due = dueDate();
  await openWizard(leadR);
  const create = dialog().getByRole('button', { name: 'Créer un nouvel apprenant', exact: true });
  await page.waitForFunction(el => !el.disabled, await create.elementHandle());
  await create.click();
  await dialog().getByText('2 / 3 · Inscription', { exact: true }).waitFor();
  await dialog().getByLabel('Année scolaire', { exact: true }).fill(YEAR);
  await dialog().getByRole('button', { name: 'Continuer', exact: true }).click();
  await dialog().getByText('3 / 3 · Paiement', { exact: true }).waitFor();
  await dialog().getByRole('group', { name: 'Paiement' }).getByRole('button', { name: 'Réserver sans paiement', exact: true }).click();
  assert.equal(await dialog().getByLabel('Montant payé aujourd’hui', { exact: true }).count(), 0, 'a reservation takes no payment');
  await dialog().getByLabel('Prix brut convenu', { exact: true }).fill('3000');
  await dialog().getByLabel('Échéance de l’acompte', { exact: true }).fill(due);
  await footer().getByRole('button', { name: 'Réserver sans paiement', exact: true }).click();
  await dialog().getByText('Prochaine action : Encaisser l’acompte.', { exact: true }).waitFor();
  const studentR = sql(`select student_id from public.crm_leads where id=${q(leadR)}`);
  learners.push(studentR);
  const chargeR = sql(`select charge_id from public.crm_charge_reservations where lead_id=${q(leadR)}`);
  assert.equal(status(leadR), 'QUALIFIED', 'no conversion without payment (ADR-015)');
  assert.equal(sql(`select enrollment_id is null and due_date=${q(due)}::date from public.charges where id=${q(chargeR)}`), 't', 'a charge with its due date, no enrollment');
  assert.equal(count(`select count(*) from public.receipts where student_id=${q(studentR)}`), 0, 'no receipt');
  assert.equal(count(`select count(*) from public.enrollments where student_id=${q(studentR)}`), 0, 'no enrollment, no seat');
  assert.equal(sql(`select string_agg(task_type||':'||coalesce(instructions,''),',') from public.crm_tasks where lead_id=${q(leadR)} and status='open'`), 'enrollment_followup:Encaisser l’acompte', 'one next action: « Encaisser l’acompte »');
  await dialog().getByRole('button', { name: 'Terminé', exact: true }).click();
  await page.getByTestId('next-action-panel').getByTestId('next-action-label').filter({ hasText: 'Encaisser l’acompte' }).waitFor();
  // Invariant 9: the Opportunités list row shows the same server label as the card and drawer.
  await page.goto(`${app}/crm/leads?layout=list&q=${encodeURIComponent(`Contact R ${run}`)}`);
  const listRow = page.getByTestId('opportunity-row').filter({ hasText: `Contact R ${run}` });
  await listRow.getByText(/^Encaisser l’acompte /).waitFor();
  assert.equal(await listRow.getByText('Finaliser l’inscription', { exact: false }).count(), 0, 'the list row never shows « Finaliser l’inscription » for it');

  await encaisser(studentR);
  const reservedRow = page.locator(`[data-balance-id="${chargeR}"]`);
  await reservedRow.getByText('Réservé pour un prospect', { exact: false }).waitFor();
  assert.equal(await reservedRow.getByRole('link', { name: 'Ouvrir le prospect' }).getAttribute('href'), `/crm/leads?lead=${leadR}`, 'collected from the prospect’s card');
  assert.equal(await reservedRow.getByRole('button').count(), 0, '« Encaisser » cannot collect a reserved charge');
  await page.getByRole('button', { name: 'Nouvelle inscription', exact: true, pressed: true }).waitFor();

  // B2 — another open prospect of the same learner: the reservation is not this prospect's.
  phase = 'reservation of another prospect';
  const leadR2 = qualified(reception.id, `Contact R2 ${run}`, nameR);
  const toPayment = async () => {
    await openWizard(leadR2);
    await dialog().getByText(nameR, { exact: true }).locator('..').getByRole('button', { name: 'Utiliser cet apprenant', exact: true }).click();
    await dialog().getByRole('button', { name: 'Continuer', exact: true }).click();
    await dialog().getByText('2 / 3 · Inscription', { exact: true }).waitFor();
    await dialog().getByLabel('Année scolaire', { exact: true }).fill(YEAR);
    await dialog().getByRole('button', { name: 'Continuer', exact: true }).click();
    await dialog().getByText('3 / 3 · Paiement', { exact: true }).waitFor();
  };
  const otherRow = () => dialog().locator(`[data-balance-id="${chargeR}"]`);
  const newSession = () => dialog().getByRole('button', { name: 'Nouvelle session', exact: true });
  const nothingChosen = async label => {
    await otherRow().getByRole('link', { name: 'Ouvrir le prospect' }).waitFor();
    assert.equal(await otherRow().getByRole('link', { name: 'Ouvrir le prospect' }).getAttribute('href'), `/crm/leads?lead=${leadR}`, `${label}: links to its prospect`);
    assert.equal(await otherRow().getByRole('button').count(), 0, `${label}: not selectable`);
    assert.equal(await newSession().getAttribute('aria-pressed'), 'false', `${label}: « Nouvelle session » is not chosen`);
    assert.equal(await dialog().locator('[data-balance-id] button[aria-pressed=true]').count(), 0, `${label}: no commitment chosen`);
    await dialog().getByRole('note').filter({ hasText: COMMITMENT_CHOICE }).first().waitFor();
    assert.equal(await dialog().getByLabel('Prix brut convenu', { exact: true }).count(), 0, `${label}: no new price until « Nouvelle session »`);
  };
  await toPayment();
  await nothingChosen('wizard of another prospect');
  await footer().getByRole('button', { name: 'Inscrire et encaisser', exact: true }).click();
  await dialog().getByRole('alert').filter({ hasText: COMMITMENT_CHOICE }).first().waitFor();
  assert.equal(count(`select count(*) from public.enrollments where student_id=${q(studentR)}`), 0, 'nothing sent without a choice');
  await page.keyboard.press('Escape');
  await page.getByText('3 / 3 · Paiement', { exact: true }).waitFor({ state: 'detached' });

  // A stale balance read (the reservation not yet seen) selects it; the server refuses with
  // reservation_collect_on_prospect, and the re-read lands on no choice.
  let stale = true;
  await page.route('**/rest/v1/rpc/get_open_balances', async route => {
    if (!stale) return route.continue();
    const response = await route.fetch(), json = await response.json();
    await route.fulfill({ response, json: { ...json, rows: json.rows.map(row => ({ ...row, reserved_lead_id: null })) } });
  });
  await toPayment();
  await otherRow().locator('button[aria-pressed=true]').filter({ hasText: 'Encaisser sur cet engagement' }).waitFor();
  await dialog().getByLabel('Montant payé aujourd’hui', { exact: true }).fill('500');
  stale = false;
  await footer().getByRole('button', { name: 'Inscrire et encaisser', exact: true }).click();
  await dialog().getByText(EAP_REASON_TEXT.reservation_collect_on_prospect, { exact: false }).first().waitFor();
  await nothingChosen('after the refusal');
  assert.equal(count(`select count(*) from public.receipts where student_id=${q(studentR)}`), 0, 'the refusal wrote no receipt');
  assert.equal(count(`select count(*) from public.enrollments where student_id=${q(studentR)}`), 0, 'nor an enrollment');
  assert.equal(status(leadR2), 'QUALIFIED'); assert.equal(status(leadR), 'QUALIFIED');
  await newSession().click();
  await dialog().getByLabel('Prix brut convenu', { exact: true }).waitFor();
  assert.equal(await newSession().getAttribute('aria-pressed'), 'true', '« Nouvelle session » only on its click');
  await page.unroute('**/rest/v1/rpc/get_open_balances');
  await page.keyboard.press('Escape');
  await page.getByText('3 / 3 · Paiement', { exact: true }).waitFor({ state: 'detached' });
  console.log('PASS B2: another prospect’s reservation is « Ouvrir le prospect », never selected; after a refusal no choice is made');

  phase = 'reservation';
  await openWizard(leadR);
  await dialog().getByText(/^Apprenant rattaché à ce prospect/).waitFor();
  await dialog().getByRole('button', { name: 'Continuer', exact: true }).click();
  await dialog().getByText('2 / 3 · Inscription', { exact: true }).waitFor();
  await dialog().getByLabel('Année scolaire', { exact: true }).fill(YEAR);
  await dialog().getByRole('button', { name: 'Continuer', exact: true }).click();
  await dialog().locator(`[data-balance-id="${chargeR}"] button[aria-pressed=true]`).waitFor();
  await dialog().getByLabel('Montant payé aujourd’hui', { exact: true }).fill('1000');
  await footer().getByRole('button', { name: 'Inscrire et encaisser', exact: true }).click();
  await dialog().getByText(/^Inscription confirmée · reçu \S+$/).waitFor();
  assert.equal(status(leadR), 'CONVERTED', 'the deposit converts the prospect');
  assert.equal(count(`select count(*) from public.charges where student_id=${q(studentR)}`), 1, 'collected on the reserved charge');
  assert.equal(count(`select balance from public.charge_balances where id=${q(chargeR)}`), 2000);
  assert.equal(count(`select count(*) from public.crm_tasks where lead_id=${q(leadR)} and status='open'`), 0, 'no open action after conversion');
  console.log('PASS OD-2 = A: reserved without payment, sent back to the prospect, collected on the same charge');

  // 4 — « Avec solde » on the receipts list.
  phase = 'avec solde';
  const studentD = learner(`Solde ${run} réglé`);
  deskPay(director.id, { student_id: studentD, session_type: 'Yearly', school_year: YEAR, level: 'Child 4', gross_amount: 2000, payment_amount: 2000 });
  await page.goto(`${app}/receipts?q=${encodeURIComponent(`Solde ${run}`)}`);
  const rows = name => page.getByRole('row').filter({ hasText: name });
  await rows(`Solde ${run} réglé`).first().waitFor();
  await rows(`Solde ${run} ouvert`).nth(2).waitFor();
  assert.equal(await rows(`Solde ${run} ouvert`).count(), 3);
  await page.getByRole('button', { name: 'Avec solde', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('solde') === '1');
  await rows(`Solde ${run} réglé`).first().waitFor({ state: 'detached' });
  // The filtered list reloads (briefly empty on a slow runner): wait for its rows, then count.
  await rows(`Solde ${run} ouvert`).nth(2).waitFor();
  assert.equal(await rows(`Solde ${run} ouvert`).count(), 3, 'receipts of a charge with a balance stay');
  assert.equal(await rows(`Solde ${run} réglé`).count(), 0, 'the settled learner’s receipts are filtered out');
  await page.getByText(/Reste aujourd’hui : /).first().waitFor();
  console.log('PASS « Avec solde »: only receipts whose charge still has a balance');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS payment screens (RWR-r5 C1): invariant 12, duplicate panel, OD-2 reservation, « Avec solde »');
} catch (error) {
  console.error(phase, error.message);
  if (page) {
    console.error('top dialog:', (await page.getByRole('dialog').last().innerText().catch(() => '')).slice(0, 1500));
    await page.screenshot({ path: join(tmpdir(), 'hills-payment-screens-failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  removeStaffAndPayments(users.map(u => u.id), learners);
  console.log('PASS synthetic browser fixtures removed');
}
