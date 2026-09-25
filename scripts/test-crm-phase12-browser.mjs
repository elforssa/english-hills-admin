// Focused keyboard/empty-state smoke; synthetic Auth only, no CRM fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
assert(readFileSync('.git/HEAD', 'utf8').startsWith('ref: refs/heads/codex/'));
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const sql = s => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: s, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } });
const users = [], password = randomBytes(24).toString('hex');
let browser;
try {
  assert.equal(sql('select count(*) from crm_leads').trim(), '0');
  browser = await chromium.launch({ headless: true });
  for (const role of ['receptionist', 'director']) {
    const email = `phase12-a11y-${randomUUID()}@example.invalid`;
    const response = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
    assert.equal(response.status, 200);
    const user = await response.json(); users.push(user);
    sql(`update profiles set role='${role}' where id='${user.id}'`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.goto('http://localhost:3101/login');
    await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps')));
    await page.getByLabel('Adresse email', { exact: true }).fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL(u => !u.pathname.startsWith('/login'));
    if (role === 'receptionist') {
      await page.goto('http://localhost:3101/crm/today');
      const add = page.getByRole('button', { name: 'Ajouter un prospect', exact: true });
      await add.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Nom du contact', { exact: true })).toBeVisible();
      await expect(dialog.getByLabel('Téléphone', { exact: true })).toBeVisible();
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press('Tab');
        assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'dialog traps keyboard focus');
      }
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
      await expect(add).toBeFocused();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(add).toBeVisible(); const b = await add.boundingBox();
      assert(b.width >= 32 && b.height >= 32, 'primary mobile action has usable target');
      await page.screenshot({ path: '/private/tmp/hills-phase12-receptionist-empty-mobile.png', fullPage: true });
    } else {
      await page.goto('http://localhost:3101/crm/analytics');
      await expect(page.getByTestId('marketing-analytics')).toBeVisible();
      const date = page.getByLabel('Acquisitions du', { exact: true });
      await date.focus(); await expect(date).toBeFocused(); await page.keyboard.press('Tab');
      assert(await page.evaluate(() => document.activeElement !== document.body), 'analytics keyboard focus remains visible on a control');
      await page.getByLabel('Regrouper par').selectOption('source');
      await expect(page.getByText('Aucune acquisition ni dépense pour cette sélection.', { exact: true })).toBeVisible();
      await date.fill('2020-01-01');
      await expect(page.getByTestId('marketing-analytics').getByRole('alert')).toContainText('366 jours');
      await date.fill(new Date().toISOString().slice(0, 7) + '-01');
      await expect(page.getByText('Aucune acquisition ni dépense pour cette sélection.', { exact: true })).toBeVisible();
      await page.screenshot({ path: '/private/tmp/hills-phase12-analytics-empty-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByLabel('Regrouper par')).toBeVisible();
      await page.screenshot({ path: '/private/tmp/hills-phase12-analytics-empty-mobile.png', fullPage: true });
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await context.close();
  }
  console.log('PASS Phase12 keyboard activation, modal labels/focus trap/Escape restoration, mobile action target and analytics empty desktop/mobile');
} finally {
  await browser?.close();
  for (const u of users) sql(`delete from auth.users where id='${u.id}';delete from activity_log where actor_id='${u.id}' or target_id='${u.id}';`);
}
