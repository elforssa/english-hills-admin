// Local-only end-to-end test. Creates and removes its own synthetic fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
assertLocalFeatureBranch(new URL('../', import.meta.url));
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `delete-ui-${randomUUID()}@example.test`;
const password = randomBytes(24).toString('base64url');
const studentId = randomUUID();
const sql = statement => execFileSync('psql', ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' });
let userId, browser;
try {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  sql(`update public.profiles set role='director' where id='${userId}'; insert into public.students(id,full_name,status) values('${studentId}','Synthetic deletion browser','Prospect');`);
  const fixture = JSON.parse(sql(`begin; alter table public.receipts disable trigger on_receipt_created;
    select set_config('request.jwt.claim.sub','${userId}',true); set local role authenticated;
    select public.create_charge_payment(jsonb_build_object('student_id','${studentId}','session_type','Other','service_detail','Synthetic UI correction','school_year','2026/2027','gross_amount',100,'payment_amount',40,'payment_date',current_date,'payment_method','Espèces','idempotency_key','${randomUUID()}'));
    reset role; alter table public.receipts enable trigger on_receipt_created; commit;`).trim().split('\n').at(-1));
  // Reproduce an already cancelled receipt with its full charge still due.
  sql(`begin; select set_config('request.jwt.claim.sub','${userId}',true); set local role authenticated; select public.void_financial_receipt('${fixture.receipt_id}','Synthetic original cancellation','${randomUUID()}'); commit;`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.setDefaultTimeout(30000);
  await page.goto('http://localhost:3017/login');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Connexion par lien magique', exact: true }).click();
  await page.getByRole('button', { name: 'Retour à la connexion par mot de passe', exact: true }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  await page.goto(`http://localhost:3017/receipts/${fixture.receipt_id}/print`);
  await page.getByRole('link', { name: 'Supprimer le reçu', exact: true }).click();
  await expect(page.getByText('Le paiement est déjà annulé', { exact: false })).toBeVisible();
  await expect(page.getByText('0 MAD', { exact: true })).toBeVisible();
  await expect(page.getByText('100 MAD', { exact: true })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Supprimer le reçu et annuler le montant dû', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Motif de suppression').fill('Synthetic browser mistaken entry');
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: '/tmp/receipt-deletion-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile screen must not overflow');
  await page.screenshot({ path: '/tmp/receipt-deletion-mobile.png', fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await submit.click();
  await page.waitForURL(`**/students/${studentId}`);
  await expect(page.getByText('Aucun engagement actif enregistré.', { exact: true })).toBeVisible();
  assert.equal(sql(`select count(*) from public.charges where id='${fixture.charge_id}' and voided_at is not null`).trim(), '1');
  await page.goto('http://localhost:3017/receipts/deletions');
  await expect(page.getByText('Synthetic browser mistaken entry', { exact: true })).toBeVisible();
  await expect(page.getByText(`Identifiant du directeur : ${userId}`, { exact: true })).toBeVisible();
  console.log('Receipt deletion browser tests passed (cancelled receipt repair, totals preview, audit, mobile).');
} finally {
  await browser?.close();
  if (userId) {
    sql(`delete from public.financial_events where actor_id='${userId}'; delete from public.financial_requests where actor_id='${userId}'; delete from public.receipts where student_id='${studentId}'; delete from public.charges where student_id='${studentId}'; delete from public.enrollments where student_id='${studentId}'; delete from public.students where id='${studentId}';`);
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}
