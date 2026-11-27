// E-mail links that work (plan ELW-r3, ADR-017): local stack with the four custom
// templates, the built app on localhost:3101 and the local mail catcher (Mailpit,
// port 54324). Synthetic addresses only; removes only this run's fixtures.
//   npm run build && npm run start -- --hostname 127.0.0.1 --port 3101
//   npm run test:email-links-local
//
// How it runs anywhere (review B8): the e-mail's printed link uses {{ .SiteURL }}
// (127.0.0.1:3000), so the suite asserts its form, takes token_hash and type from it
// and opens /auth/confirm on its own application origin. Old-format links are
// synthesised from the same token, as the default template would have printed them:
// <API>/auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<app>/…
// Template identity: Supabase renders templates with Go's html/template, which drops
// HTML comments, so the marker comments never reach the inbox; each template is
// identified by its subject and a sentence only it contains.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { assertLocalFeatureBranch } from './lib/assert-local-feature-branch.mjs';
import { MESSAGES } from '../src/lib/authLinks.mjs';
import { assertLocalStack } from './lib/local-stack.mjs';
assertLocalStack({ apiUrl: 'http://127.0.0.1:54321', container: 'supabase_db_hills-admin-next' }); // follow-ups 142 (item 11): this checkout's stack only, before any statement

const root = new URL('../', import.meta.url);
const branch = assertLocalFeatureBranch(root);
const env = Object.fromEntries(readFileSync(new URL('.env.local', root), 'utf8').split('\n').flatMap((line) => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
}));
const base = 'http://127.0.0.1:54321', container = 'supabase_db_hills-admin-next';
// `localhost`, as the other browser suites: Next's route handlers and middleware name the
// host `localhost` in their redirects, and the session cookies must follow.
const app = 'http://localhost:3101', mailpit = 'http://127.0.0.1:54324', siteUrl = 'http://127.0.0.1:3000';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, 'local Supabase only');
setTimeout(() => { console.error('FAIL e-mail links suite stalled'); process.exit(1); }, 15 * 60_000).unref();

const sql = (input) => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input, encoding: 'utf8', timeout: 120_000 }).trim();
const run = 'elw-' + randomUUID().slice(0, 8);
const password = 'Elw-' + randomBytes(12).toString('base64url');
const service = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
const userIds = [], studentIds = [];
let checks = 0, browser, adminCookie, adminId;
const step = (label) => console.log(`PASS ${label}`);
const emailOf = (key) => `${run}-${key}@example.test`;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Supabase allows one e-mail per address per max_frequency (1 s locally, supabase/config.toml);
// the suite spaces its own requests for one address unless it tests that limit (item 8).
const lastSent = new Map();
async function spaced(email) {
  const elapsed = Date.now() - (lastSent.get(email) || 0);
  if (elapsed < 1600) await wait(1600 - elapsed);
  lastSent.set(email, Date.now());
}

// Template identity: subject and a sentence only that template contains.
const TEMPLATES = {
  invite: { subject: "Votre invitation à l'espace English Hills", sentence: 'vous invite à activer votre compte', type: 'invite' },
  magic_link: { subject: "Votre lien d'accès à l'espace English Hills", sentence: 'votre compte reste protégé', type: 'email' },
  confirmation: { subject: "Votre lien d'accès à l'espace English Hills", sentence: "terminer l'activation de votre compte", type: 'email' },
  recovery: { subject: 'Choisir un nouveau mot de passe English Hills', sentence: 'Vous avez demandé à choisir un nouveau mot de passe', type: 'recovery' },
};

// ── Fixtures ────────────────────────────────────────────────────────────────
async function authAdmin(method, path, body) {
  const r = await fetch(base + '/auth/v1/admin' + path, { method, headers: service, body: body && JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  assert.ok(r.ok, `${method} ${path}: ${r.status} ${JSON.stringify(json)}`);
  return json;
}
async function createUser(key, { role = 'pending', fullName = '', withPassword = true } = {}) {
  const user = await authAdmin('POST', '/users', { email: emailOf(key), email_confirm: true, ...(withPassword ? { password } : {}) });
  userIds.push(user.id);
  sql(`update public.profiles set role='${role}', full_name='${fullName.replace(/'/g, "''")}' where id='${user.id}'`);
  return { id: user.id, email: emailOf(key), key };
}
const profile = (id) => {
  const [role, fullName] = sql(`select role || '|' || coalesce(full_name, '') from public.profiles where id='${id}'`).split('|');
  return { role, fullName };
};
const authRow = (email) => {
  const row = sql(`select id || '|' || coalesce(confirmation_token, '') || '|' || (email_confirmed_at is not null) from auth.users where email='${email}'`);
  if (!row) return null;
  const [id, confirmationToken, confirmed] = row.split('|');
  return { id, confirmationToken, confirmed: confirmed === 'true' };
};
async function staffCookie(email) {
  const jar = new Map();
  const client = createServerClient(base, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.equal(error, null, 'staff sign-in');
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}
// The real invitation route, as an admin inviting a parent for one seeded learner.
async function inviteParent(email) {
  const studentId = randomUUID();
  studentIds.push(studentId);
  sql(`insert into public.students(id, full_name, parent_email, status, age_category, session_type)
    values ('${studentId}', 'Learner ${run} ${studentIds.length}', '${email}', 'Prospect', 'Young Learners (6-12)', 'Yearly')`);
  return reinvite(email, studentId);
}
async function reinvite(email, studentId) {
  await spaced(email);
  sql(`delete from public.rate_limits where user_id='${adminId}'`);
  const r = await fetch(app + '/api/admin/invite', { method: 'POST', redirect: 'manual',
    headers: { Cookie: adminCookie, Origin: app, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role: 'parent', studentIds: [studentId] }) });
  const json = await r.json();
  assert.equal(r.status, 200, `invite ${email}: ${JSON.stringify(json)}`);
  assert.ok(!('queueId' in json), 'the route never answers a queue id');
  const row = authRow(email);
  if (row && !userIds.includes(row.id)) userIds.push(row.id);
  return { ...json, studentId, userId: row?.id };
}
// A confirmed account with no password and no name, still pending with its queue row:
// what an invitation used up by a link preview leaves behind (the R4 diagnosis).
async function stranded(key) {
  const email = emailOf(key);
  const invited = await inviteParent(email);
  const mail = await takeMail(email, 'invite');
  // A link preview opening the old-format link: one GET uses the invitation up.
  const preview = await fetch(oldFormat(mail.tokenHash, 'invite', '/inscription-compte'), { redirect: 'manual', headers: { 'User-Agent': 'WhatsApp/2.24.21.80 A' } });
  const landed = (preview.headers.get('location') || '').replace(/(access_token|refresh_token)=[^&]+/g, '$1=…');
  assert.equal(preview.status, 303); await preview.arrayBuffer();
  assert.equal(authRow(email).confirmed, true, `the preview used the invitation up: ${landed}`);
  assert.equal(profile(invited.userId).role, 'pending');
  return { id: invited.userId, email, key, studentId: invited.studentId };
}

// ── Mail catcher ────────────────────────────────────────────────────────────
const seenMail = new Set();
async function mailFor(email) {
  const r = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  assert.ok(r.ok, 'Mailpit search (is the local mail catcher on 54324?)');
  return (await r.json()).messages || [];
}
// Waits for the next unseen e-mail to the address; asserts which template it is.
async function takeMail(email, expected, { timeout = 15_000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const fresh = (await mailFor(email)).filter((m) => !seenMail.has(m.ID));
    if (fresh.length) {
      assert.equal(fresh.length, 1, `exactly one new e-mail to ${email}`);
      seenMail.add(fresh[0].ID);
      const message = await (await fetch(`${mailpit}/api/v1/message/${fresh[0].ID}`)).json();
      const html = message.HTML.replace(/&amp;/g, '&');
      const identity = Object.entries(TEMPLATES).filter(([, t]) => message.Subject === t.subject && html.includes(t.sentence)).map(([n]) => n);
      assert.equal(identity.length, 1, `one template matches: ${message.Subject}`);
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(links.length, 1, 'one link per e-mail');
      const printed = links[0].match(/^http:\/\/127\.0\.0\.1:3000\/auth\/confirm\?token_hash=([A-Za-z0-9_-]+)&type=([a-z]+)$/);
      assert.ok(printed, `printed link has the form <SiteURL>/auth/confirm?token_hash=…&type=…: ${links[0].replace(/token_hash=[^&]+/, 'token_hash=…')}`);
      assert.ok(links[0].startsWith(siteUrl));
      assert.doesNotMatch(html, /\/auth\/v1\/verify|ConfirmationURL/);
      const mail = { template: identity[0], tokenHash: printed[1], type: printed[2] };
      assert.equal(mail.type, TEMPLATES[mail.template].type, 'type matches the template');
      if (expected) assert.equal(mail.template, expected, `template for ${email}`);
      checks += 4;
      return mail;
    }
    await wait(250);
  }
  if (expected === null) return null;
  throw new Error(`No e-mail to ${email} within ${timeout} ms`);
}
async function assertNoMail(email, ms = 4000) {
  await wait(ms);
  assert.deepEqual((await mailFor(email)).filter((m) => !seenMail.has(m.ID)), [], `no e-mail to ${email}`); checks++;
}
const confirmUrl = (mail) => `${app}/auth/confirm?token_hash=${mail.tokenHash}&type=${mail.type}`;
const oldFormat = (tokenHash, type, path) => `${base}/auth/v1/verify?token=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(app + path)}`;

// ── Browser ─────────────────────────────────────────────────────────────────
async function newPage({ token } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.route('**/*', (route) => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const log = { verify: [], leaks: [], auth: [] };
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/auth/v1/verify')) log.verify.push(url);
    if (url.startsWith(base + '/auth/v1/')) log.auth.push(new URL(url).pathname);
    if (token && request.resourceType() !== 'document' && (url.includes(token) || (request.postData() || '').includes(token))) {
      log.leaks.push({ url, clicked: Boolean(page.__clicked) });
    }
  });
  return { context, page, log };
}
const text = async (page) => page.locator('body').innerText();
async function assertNoAuthText(page) {
  const body = await text(page);
  assert.doesNotMatch(body, /invalid|has expired|otp_|token|Email link|New password should|weak|rate limit|error/i, 'no Auth error text');
  checks++;
}
async function fillActivation(page, { first = 'Amal', last = run, pass = password } = {}) {
  await page.getByLabel('Prénom').fill(first);
  await page.getByLabel('Nom', { exact: true }).fill(last);
  await page.getByLabel('Mot de passe', { exact: true }).fill(pass);
  await page.getByLabel('Confirmer le mot de passe').fill(pass);
  await page.getByRole('button', { name: 'Activer mon compte' }).click();
}
async function clickLinkButton(page, name) {
  page.__clicked = true;
  await page.getByRole('button', { name, exact: true }).click();
}
async function passwordLogin(page, email, pass = password) {
  await page.goto(app + '/login');
  await page.getByLabel('Adresse email', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(app + '/parent-portal');
}
async function request(page, mode, email) {
  await page.goto(`${app}/login?mode=${mode}`);
  await page.locator('#request-email').fill(email);
  await spaced(email);
  const answered = page.waitForResponse((r) => r.url().startsWith(base + (mode === 'reset' ? '/auth/v1/recover' : '/auth/v1/otp')));
  await page.locator(`form[data-mode="${mode}"] button[type="submit"]`).click();
  const response = await answered;
  const answer = page.getByTestId('request-answer');
  await answer.waitFor();
  return { status: response.status(), text: (await answer.innerText()).trim() };
}
const signInWith = async (email, pass) => (await createClient(base, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email, password: pass })).error;
async function waitRole(id, role, label = '') {
  for (let i = 0; i < 60; i++) { if (profile(id).role === role) return; await wait(250); }
  throw new Error(`${label}: role of ${id} never became ${role}`);
}
// Development aid: EMAIL_LINKS_ONLY=7,8 runs only those items (CI runs all of them).
const only = (process.env.EMAIL_LINKS_ONLY || '').split(',').filter(Boolean).map(Number);
const runs = (item) => !only.length || only.includes(item);
const used = {}; // links already used by items 1–3, reopened by item 4
async function activationForm(page) {
  await page.waitForURL(app + '/inscription-compte');
  await page.getByLabel('Prénom').waitFor();
}

try {
  const mailInfo = await fetch(`${mailpit}/api/v1/info`);
  assert.ok(mailInfo.ok, 'Mailpit API reachable');
  browser = await chromium.launch({ headless: true });
  const admin = await createUser('admin', { role: 'admin', fullName: `Admin ${run}` });
  adminId = admin.id;
  adminCookie = await staffCookie(admin.email);
  console.log(`e-mail links local suite on branch ${branch}, run ${run}`);

  // ── 1. Invitation and previews ────────────────────────────────────────────
  if (runs(1)) {
    const email = emailOf('invitee1');
    const invited = await inviteParent(email);
    assert.equal(invited.needsDelivery, true);
    const mail = await takeMail(email, 'invite');
    const before = authRow(email);
    assert.equal(before.confirmationToken, mail.tokenHash, 'the e-mail carries the stored token');
    assert.equal(before.confirmed, false);
    // Two previews: a plain GET and WhatsApp's link-preview user agent.
    for (const ua of [undefined, 'WhatsApp/2.24.21.80 A']) {
      const r = await fetch(confirmUrl(mail), { headers: ua ? { 'User-Agent': ua } : {} });
      assert.equal(r.status, 200); assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
      const html = await r.text();
      assert.ok(!html.includes(mail.tokenHash), 'the server never renders the token'); checks += 3;
    }
    // A headless browser with JavaScript loads the page and waits; nobody clicks.
    const { context, page, log } = await newPage({ token: mail.tokenHash });
    await page.goto(confirmUrl(mail));
    await page.getByRole('button', { name: 'Activer mon compte' }).waitFor();
    await page.waitForLoadState('networkidle'); await wait(1500);
    assert.deepEqual(log.verify, [], 'no request to /auth/v1/verify before the click');
    assert.deepEqual(log.leaks, [], 'no request carries the token before the click');
    assert.deepEqual(log.auth, [], 'a visitor without a session causes no Auth request');
    const after = authRow(email);
    assert.equal(after.confirmationToken, mail.tokenHash, 'the token is unchanged after the previews');
    assert.equal(after.confirmed, false, 'still unconfirmed after the previews');
    checks += 5;
    // The person taps: the link still works.
    await clickLinkButton(page, 'Activer mon compte');
    await activationForm(page);
    assert.equal(await page.locator('#email').inputValue(), email);
    assert.ok(!page.url().includes('token_hash'));
    await fillActivation(page);
    await page.waitForURL(app + '/parent-portal');
    assert.deepEqual(profile(invited.userId), { role: 'parent', fullName: `Amal ${run}` });
    assert.equal(log.verify.length, 1, 'exactly one verification, after the click');
    assert.ok(log.leaks.every((l) => l.clicked), 'the token is only sent after the click');
    assert.equal(await signInWith(email, password), null);
    checks += 5;
    await context.close();
    used.invite = mail;
    step('1 invitation: two previews and a JavaScript load without a click leave the token unused; the tap then activates the account');
  }

  // A fully activated parent for items 2, 3, 4, 5 and 8.
  const active = await createUser('active', { role: 'parent', fullName: `Parent ${run}` });

  // ── 2. Sign-in link opened in a second browser ────────────────────────────
  if (runs(2)) {
    const a = await newPage();
    const asked = await request(a.page, 'link', active.email);
    assert.equal(asked.text, MESSAGES.requestSent);
    const mail = await takeMail(active.email, 'magic_link');
    const b = await newPage({ token: mail.tokenHash });
    await b.page.goto(confirmUrl(mail));
    await clickLinkButton(b.page, 'Se connecter');
    await b.page.waitForURL(app + '/parent-portal');
    assert.equal(b.log.verify.length, 1); checks += 2;
    await a.context.close(); await b.context.close();
    used.email = mail;
    step('2 sign-in link requested in browser A works in a fresh browser B');
  }

  // ── 3. Recovery end to end, other devices signed out (D5) ─────────────────
  if (runs(3)) {
    const other = await newPage();
    await passwordLogin(other.page, active.email);
    const a = await newPage();
    const asked = await request(a.page, 'reset', active.email);
    assert.equal(asked.text, MESSAGES.requestSent);
    const mail = await takeMail(active.email, 'recovery');
    const b = await newPage({ token: mail.tokenHash });
    await b.page.goto(confirmUrl(mail));
    await clickLinkButton(b.page, 'Continuer');
    await b.page.getByRole('heading', { name: 'Nouveau mot de passe' }).waitFor();
    const newPassword = password + '-2';
    await b.page.locator('#new-password').fill(newPassword);
    await b.page.locator('#new-password-confirm').fill(newPassword);
    await b.page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
    await b.page.waitForURL(app + '/parent-portal');
    assert.ok(await signInWith(active.email, password), 'the old password is refused');
    assert.equal(await signInWith(active.email, newPassword), null, 'the new password is accepted');
    // The other device: its refresh token was revoked; once its access token has
    // expired it cannot renew and is sent to /login.
    const cookies = await other.context.cookies(app);
    const authCookies = cookies.filter((c) => /auth-token(\.\d+)?$/.test(c.name)).sort((x, y) => x.name.localeCompare(y.name));
    assert.ok(authCookies.length, 'the other device has a session cookie');
    const raw = authCookies.map((c) => c.value).join('');
    const stored = JSON.parse(Buffer.from(raw.replace(/^base64-/, ''), 'base64url').toString('utf8'));
    const refresh = await fetch(base + '/auth/v1/token?grant_type=refresh_token', { method: 'POST',
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: stored.refresh_token }) });
    assert.equal(refresh.status, 400, 'the other device can no longer refresh its session');
    await refresh.arrayBuffer();
    const expired = { ...stored, expires_at: Math.floor(Date.now() / 1000) - 60 };
    await other.context.clearCookies();
    await other.context.addCookies([{ name: authCookies[0].name.replace(/\.\d+$/, ''), value: 'base64-' + Buffer.from(JSON.stringify(expired)).toString('base64url'),
      url: app }]);
    await other.page.goto(app + '/parent-portal');
    await other.page.waitForURL((url) => url.pathname === '/login');
    checks += 5;
    for (const p of [other, a, b]) await p.context.close();
    used.recovery = mail;
    active.password = newPassword;
    step('3 recovery: new-password form in a fresh browser; old password refused, new accepted; the other device cannot refresh and lands on /login');
  }

  // ── 4. Reopened links → used-or-expired screen ────────────────────────────
  if (runs(4)) {
    // The older spelling `magiclink` is accepted too: a fresh sign-in link opened with it.
    const a = await newPage();
    await request(a.page, 'link', active.email);
    const fresh = await takeMail(active.email, 'magic_link');
    await a.page.goto(`${app}/auth/confirm?token_hash=${fresh.tokenHash}&type=magiclink`);
    await clickLinkButton(a.page, 'Se connecter');
    await a.page.waitForURL(app + '/parent-portal');
    await a.context.close();
    used.magiclink = { ...fresh, type: 'magiclink' };
    for (const [type, mail] of Object.entries(used)) {
      const { context, page } = await newPage();
      await page.goto(confirmUrl(mail));
      await clickLinkButton(page, { invite: 'Activer mon compte', recovery: 'Continuer' }[type] || 'Se connecter');
      await page.locator('[data-state="used"]').waitFor();
      assert.equal((await page.locator('[data-state="used"] p').innerText()).trim(), MESSAGES.used, type);
      await page.getByRole('link', { name: 'Se connecter' }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Mot de passe oublié ?' }).getAttribute('href'), '/login?mode=reset');
      assert.ok(!page.url().includes('token_hash'), 'the address is cleaned once Supabase answered');
      await assertNoAuthText(page);
      checks += 3;
      await context.close();
    }
    // A malformed link shows the same screen without any call.
    const { context, page, log } = await newPage();
    await page.goto(`${app}/auth/confirm?token_hash=../x&type=invite`);
    await page.locator('[data-state="used"]').waitFor();
    assert.deepEqual(log.auth, []); checks++;
    await context.close();
    step('4 reopened invite, email, recovery and magiclink links all show the neutral used-or-expired screen; no Auth text');
  }

  // ── 5. Signed-in activated user opens someone else's invitation (D3) ───────
  if (runs(5)) {
    const signedIn = await newPage();
    await passwordLogin(signedIn.page, active.email, active.password);
    const email = emailOf('invitee5');
    const invited = await inviteParent(email);
    const mail = await takeMail(email, 'invite');
    const leaks = [];
    signedIn.page.on('request', (r) => { if (r.url().includes(mail.tokenHash) && r.resourceType() !== 'document') leaks.push(r.url()); });
    await signedIn.page.goto(confirmUrl(mail));
    await signedIn.page.locator('[data-state="activated"]').waitFor();
    const body = await text(signedIn.page);
    assert.match(body, /Votre compte est déjà activé\./); assert.ok(body.includes(active.email));
    await signedIn.page.getByRole('button', { name: 'Continuer vers mon espace' }).waitFor();
    await signedIn.page.waitForLoadState('networkidle');
    assert.deepEqual(leaks, []); assert.equal(authRow(email).confirmationToken, mail.tokenHash, 'the invitation is still usable');
    await signedIn.page.getByRole('button', { name: /Ce lien est pour un autre compte/ }).click();
    await clickLinkButton(signedIn.page, 'Activer mon compte');
    await activationForm(signedIn.page);
    assert.equal(await signedIn.page.locator('#email').inputValue(), email, 'the form belongs to the invitee');
    await fillActivation(signedIn.page, { first: 'Invitee' });
    await signedIn.page.waitForURL(app + '/parent-portal');
    assert.equal(profile(invited.userId).role, 'parent');
    assert.equal(profile(active.id).fullName, `Parent ${run}`, 'the signed-in account is untouched');
    checks += 6;
    await signedIn.context.close();
    step('5 signed-in activated user sees « Votre compte est déjà activé »; the invitation stays usable; the second action activates the invitee');
  }

  // ── 6. Never-activated account (D1) ───────────────────────────────────────
  if (runs(6)) {
    for (const [key, mode, template, button] of [['never6a', 'reset', 'recovery', 'Continuer'], ['never6b', 'link', 'magic_link', 'Se connecter']]) {
      const account = await stranded(key);
      const { context, page } = await newPage();
      assert.equal((await request(page, mode, account.email)).text, MESSAGES.requestSent);
      const mail = await takeMail(account.email, template);
      await page.goto(confirmUrl(mail));
      await clickLinkButton(page, button);
      await activationForm(page);
      await fillActivation(page);
      await page.waitForURL(app + '/parent-portal');
      assert.deepEqual(profile(account.id), { role: 'parent', fullName: `Amal ${run}` });
      checks++;
      await context.close();
    }
    // Expired queue: the form says the invitation is no longer valid; the account stays pending.
    const account = await stranded('never6c');
    sql(`update public.pending_roles set expires_at = now() - interval '1 second' where email='${account.email}'`);
    const { context, page } = await newPage();
    await request(page, 'link', account.email);
    const mail = await takeMail(account.email, 'magic_link');
    await page.goto(confirmUrl(mail));
    await clickLinkButton(page, 'Se connecter');
    await activationForm(page);
    await fillActivation(page);
    await page.getByText(MESSAGES.invitationInvalid).waitFor();
    assert.equal(profile(account.id).role, 'pending');
    assert.equal(await signInWith(account.email, password), null, 'the password is kept');
    await page.goto(app + '/dashboard');
    // The middleware's redirect names the host `localhost`; only the path matters here.
    await page.waitForURL((url) => url.pathname === '/unauthorized');
    checks += 3;
    await context.close();
    step('6 never-activated account: recovery and sign-in link lead to the activation form and the role; an expired queue shows the "no longer valid" message, stays pending, /unauthorized elsewhere');
  }

  // ── 7. Reload during the activation form (B1) ─────────────────────────────
  if (runs(7)) {
    // (a) After a new-format invitation.
    const emailA = emailOf('reload7a');
    const a = await inviteParent(emailA);
    const mailA = await takeMail(emailA, 'invite');
    // (b) After a recovery for a never-activated account.
    const b = await stranded('reload7b');
    // (c) After an old-format fragment invitation.
    const emailC = emailOf('reload7c');
    const c = await inviteParent(emailC);
    const mailC = await takeMail(emailC, 'invite');
    for (const [label, userId, open] of [
      ['invitation', a.userId, async (page) => { await page.goto(confirmUrl(mailA)); await clickLinkButton(page, 'Activer mon compte'); }],
      ['recovery', b.id, async (page) => {
        await request(page, 'reset', b.email);
        const mail = await takeMail(b.email, 'recovery');
        await page.goto(confirmUrl(mail)); await clickLinkButton(page, 'Continuer');
      }],
      ['old-format fragment invitation', c.userId, async (page) => { await page.goto(oldFormat(mailC.tokenHash, 'invite', '/inscription-compte')); }],
    ]) {
      const { context, page } = await newPage();
      await open(page);
      await activationForm(page);
      // A full load runs the AuthContext sweep, which applies the invited role (after a
      // recovery verification it fires only then: the event is PASSWORD_RECOVERY).
      await page.reload();
      await activationForm(page);
      await waitRole(userId, 'parent', label);
      await page.reload();
      await activationForm(page);
      assert.equal(profile(userId).fullName, '', `${label}: no mark yet, the form is shown again`);
      await fillActivation(page);
      await page.waitForURL(app + '/parent-portal');
      checks += 2;
      await context.close();
    }
    step('7 reload during the form (invitation, recovery of a never-activated account, old fragment invitation): the form is shown again although the role is already active');
  }

  // ── 8. Request forms: the same sentence for every address (B5) ────────────
  if (runs(8)) {
    const neverActivated = await stranded('never8');
    const invitedEmail = emailOf('invited8');
    await inviteParent(invitedEmail);
    await takeMail(invitedEmail, 'invite');
    const unknown = emailOf('unknown8');
    const statuses = {};
    for (const mode of ['link', 'reset']) {
      for (const [label, email] of [['known', active.email], ['unknown', unknown], ['never-activated', neverActivated.email], ['invited-unconfirmed', invitedEmail]]) {
        const { context, page } = await newPage();
        const answer = await request(page, mode, email);
        statuses[`${mode} ${label}`] = answer.status;
        assert.equal(answer.text, MESSAGES.requestSent, `${mode} ${label}`);
        await assertNoAuthText(page);
        await context.close();
        checks++;
      }
      // A second request for the same address inside the local per-address limit: the
      // suite's client sends the first one, the form the second one at once (N3).
      const { context, page } = await newPage();
      await page.goto(`${app}/login?mode=${mode}`);
      await page.locator('#request-email').fill(active.email);
      await spaced(active.email);
      const answered = page.waitForResponse((r) => r.url().startsWith(base + (mode === 'reset' ? '/auth/v1/recover' : '/auth/v1/otp')));
      const first = await fetch(base + (mode === 'reset' ? '/auth/v1/recover' : '/auth/v1/otp'), { method: 'POST',
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'reset' ? { email: active.email } : { email: active.email, create_user: false }) });
      await page.locator(`form[data-mode="${mode}"] button[type="submit"]`).click();
      const second = await answered;
      assert.equal(first.status, 200);
      assert.equal(second.status(), 429, `${mode}: the form's request was rate-limited`);
      statuses[`${mode} second request (rate-limited)`] = second.status();
      const answer = page.getByTestId('request-answer'); await answer.waitFor();
      assert.equal((await answer.innerText()).trim(), MESSAGES.requestSent, `${mode} rate-limited`);
      assert.ok(await page.locator(`form[data-mode="${mode}"] button[type="submit"]`).isDisabled(), 'cooldown after every answer');
      await assertNoAuthText(page);
      await context.close();
      checks += 4;
    }
    assert.equal(authRow(unknown), null, 'no account was created for the unknown address');
    // Drain the e-mails these requests produced so later items see only their own.
    await wait(1500);
    for (const email of [active.email, neverActivated.email, invitedEmail]) for (const m of await mailFor(email)) seenMail.add(m.ID);
    assert.deepEqual(await mailFor(unknown), [], 'nothing is sent to an unknown address');
    console.log('  Auth answers behind the identical sentence: ' + JSON.stringify(statuses));
    checks += 2;
    step('8 request forms: known, unknown, never-activated, invited-unconfirmed and rate-limited (429) addresses all end on the same sentence; no account created');
  }

  // ── 9. Invited, unconfirmed address requests a link (B3), shared configuration ─
  if (runs(9)) {
    for (const [key, mode, button] of [['unconfirmed9a', 'link', 'Se connecter'], ['unconfirmed9b', 'reset', 'Continuer']]) {
      const email = emailOf(key);
      const invited = await inviteParent(email);
      await takeMail(email, 'invite');
      const { context, page } = await newPage();
      await request(page, mode, email);
      const mail = await takeMail(email, null);
      if (!mail) {
        console.log(`  9 ${mode}: no e-mail arrived for an invited, unconfirmed address`);
      } else {
        console.log(`  9 ${mode}: template ${mail.template}, type=${mail.type}`);
        await page.goto(confirmUrl(mail));
        await clickLinkButton(page, button);
        await activationForm(page);
        await fillActivation(page);
        await page.waitForURL(app + '/parent-portal');
        assert.equal(profile(invited.userId).role, 'parent');
        checks += 2;
      }
      await context.close();
    }
    step('9 invited, unconfirmed address (e-mail confirmations off): the e-mail that arrives is an /auth/confirm link and leads to the activation form');
  }

  // ── 10. Old-format links ──────────────────────────────────────────────────
  if (runs(10)) {
    const email = emailOf('old10');
    const invited = await inviteParent(email);
    const mail = await takeMail(email, 'invite');
    const fragment = await newPage();
    await fragment.page.goto(oldFormat(mail.tokenHash, 'invite', '/inscription-compte'));
    await activationForm(fragment.page);
    assert.ok(!fragment.page.url().includes('access_token'), 'the fragment is cleaned');
    await fillActivation(fragment.page);
    await fragment.page.waitForURL(app + '/parent-portal');
    assert.equal(profile(invited.userId).role, 'parent');
    await fragment.context.close();
    // Same-browser sign-in link through the code exchange.
    const same = await newPage();
    await request(same.page, 'link', active.email);
    const signIn = await takeMail(active.email, 'magic_link');
    await same.page.goto(oldFormat(signIn.tokenHash, 'magiclink', '/login/callback'));
    await same.page.waitForURL(app + '/parent-portal');
    await same.context.close();
    // Cross-browser: the code cannot be exchanged; /login explains it in French.
    const asking = await newPage();
    await request(asking.page, 'link', active.email);
    const crossLink = await takeMail(active.email, 'magic_link');
    const other = await newPage();
    await other.page.goto(oldFormat(crossLink.tokenHash, 'magiclink', '/login/callback'));
    await other.page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('error') === 'callback_failed');
    assert.equal((await other.page.getByTestId('login-link-error').innerText()).trim(), MESSAGES.callbackFailed);
    assert.equal(await other.page.locator('form[data-mode="link"]').count(), 1, 'the page opens in link mode');
    await assertNoAuthText(other.page);
    checks += 4;
    await asking.context.close(); await other.context.close();
    step('10 old-format links: fragment invitation and same-browser code still work; a cross-browser code shows the French message on /login');
  }

  // ── 11. Re-invitation (D2) with the custom templates ──────────────────────
  if (runs(11)) {
    const account = await stranded('reinvite11');
    const again = await reinvite(account.email, account.studentId);
    assert.equal(again.needsDelivery, false);
    const mail = await takeMail(account.email, 'magic_link');
    await assertNoMail(account.email, 1500);
    const { context, page } = await newPage();
    await page.goto(confirmUrl(mail));
    await clickLinkButton(page, 'Se connecter');
    await activationForm(page);
    await fillActivation(page);
    await page.waitForURL(app + '/parent-portal');
    assert.equal(profile(account.id).role, 'parent');
    await context.close();
    // An active account (a second learner for the same parent): no e-mail.
    const activeAgain = await inviteParent(account.email);
    assert.equal(activeAgain.needsDelivery, false);
    await assertNoMail(account.email);
    checks += 3;
    step('11 re-inviting a confirmed, never-activated account sends one e-mail that reaches the activation form; an active account gets none');
  }

  // ── 12. Re-invitation (D2), old format ────────────────────────────────────
  if (runs(12)) {
    const account = await stranded('reinvite12');
    await reinvite(account.email, account.studentId);
    const mail = await takeMail(account.email, 'magic_link');
    const { context, page } = await newPage();
    await page.goto(oldFormat(mail.tokenHash, 'magiclink', '/inscription-compte'));
    await activationForm(page);
    await fillActivation(page);
    await page.waitForURL(app + '/parent-portal');
    assert.equal(profile(account.id).role, 'parent');
    checks++;
    await context.close();
    step('12 re-invitation e-mail as an old-format link (redirect /inscription-compte) reaches the activation form');
  }

  // ── 13. /inscription-compte?token_hash=… forwards without any Auth call ───
  if (runs(13)) {
    const email = emailOf('forward13');
    await inviteParent(email);
    const mail = await takeMail(email, 'invite');
    const { context, page, log } = await newPage({ token: mail.tokenHash });
    await page.goto(`${app}/inscription-compte?token_hash=${mail.tokenHash}&type=invite`);
    await page.waitForURL((url) => url.pathname === '/auth/confirm');
    await page.getByRole('button', { name: 'Activer mon compte' }).waitFor();
    await page.waitForLoadState('networkidle'); await wait(1000);
    assert.equal(new URL(page.url()).searchParams.get('token_hash'), mail.tokenHash);
    assert.deepEqual(log.auth, [], 'no Auth call'); assert.deepEqual(log.leaks, []);
    assert.equal(authRow(email).confirmationToken, mail.tokenHash);
    checks += 4;
    await context.close();
    step('13 /inscription-compte?token_hash=… forwards to /auth/confirm with no Auth call; the token stays unused');
  }

  // ── 14. Connection error on the click ─────────────────────────────────────
  if (runs(14)) {
    const email = emailOf('offline14');
    const invited = await inviteParent(email);
    const mail = await takeMail(email, 'invite');
    const { context, page } = await newPage();
    let blocked = 0;
    await context.route('**/auth/v1/verify*', (route) => { blocked++; return route.abort('internetdisconnected'); });
    await page.goto(confirmUrl(mail));
    await clickLinkButton(page, 'Activer mon compte');
    await page.locator('[data-state="connection"]').waitFor();
    assert.ok((await text(page)).includes(MESSAGES.connection));
    assert.equal(new URL(page.url()).searchParams.get('token_hash'), mail.tokenHash, 'the token stays in the address');
    assert.equal(blocked, 1);
    await context.unroute('**/auth/v1/verify*');
    await page.reload();
    await clickLinkButton(page, 'Activer mon compte');
    await activationForm(page);
    await fillActivation(page);
    await page.waitForURL(app + '/parent-portal');
    assert.equal(profile(invited.userId).role, 'parent');
    checks += 4;
    await context.close();
    step('14 connection error on the click: French message, token kept; a reload and a second click succeed');
  }

  // ── 15. Active account, blank name, existing password (B7) ────────────────
  if (runs(15)) {
    const account = await createUser('blank15', { role: 'parent', fullName: '' });
    const { context, page } = await newPage();
    await request(page, 'link', account.email);
    const mail = await takeMail(account.email, 'magic_link');
    await page.goto(confirmUrl(mail));
    await clickLinkButton(page, 'Se connecter');
    await activationForm(page);
    const sawSamePassword = page.waitForResponse((r) => r.url().startsWith(base + '/auth/v1/user') && r.request().method() === 'PUT');
    await fillActivation(page, { first: 'Blank' }); // the current password, re-entered
    const updated = await sawSamePassword;
    assert.equal(updated.status(), 422, 'Supabase answered same_password');
    await page.waitForURL(app + '/parent-portal');
    assert.deepEqual(profile(account.id), { role: 'parent', fullName: `Blank ${run}` });
    checks += 2;
    await context.close();
    step('15 active account with a blank name: the current password re-entered (same_password) still saves the name and reaches the destination');
  }

  // ── 16. The name write fails once after the password succeeded (B7) ───────
  if (runs(16)) {
    const account = await stranded('namefail16');
    const { context, page } = await newPage();
    await request(page, 'reset', account.email);
    const mail = await takeMail(account.email, 'recovery');
    await page.goto(confirmUrl(mail));
    await clickLinkButton(page, 'Continuer');
    await activationForm(page);
    let blocked = 0;
    await context.route('**/rest/v1/profiles*', (route) => (route.request().method() === 'PATCH' && blocked++ === 0 ? route.abort('failed') : route.continue()));
    await fillActivation(page);
    await page.getByText(MESSAGES.nameFailed).waitFor();
    await page.getByLabel('Prénom').waitFor();
    assert.equal(profile(account.id).fullName, '', 'no mark without the name write');
    assert.equal(await signInWith(account.email, password), null, 'the password was set');
    await assertNoAuthText(page);
    await page.getByRole('button', { name: 'Activer mon compte' }).click(); // same password, retried
    await page.waitForURL(app + '/parent-portal');
    assert.deepEqual(profile(account.id), { role: 'parent', fullName: `Amal ${run}` });
    checks += 3;
    await context.close();
    step('16 failed name write: French message, form kept; the retry with the same password saves the name and reaches the destination');
  }
  console.log(`PASS e-mail links local suite (${checks} checks)`);
} finally {
  if (browser) await browser.close();
  const users = userIds.map((id) => `'${id}'::uuid`).join(',');
  const students = studentIds.map((id) => `'${id}'::uuid`).join(',');
  let cleanup = 'begin;';
  if (students) cleanup += `delete from public.family_links where student_id in (${students});`;
  if (users) cleanup += `delete from public.family_links where profile_id in (${users});`;
  cleanup += `delete from public.pending_roles where email like '${run}-%';`;
  if (users) cleanup += `delete from public.pending_roles where invited_by in (${users}) or target_user_id in (${users});`;
  if (students) cleanup += `delete from public.students where id in (${students});`;
  if (users) {
    cleanup += `alter table public.profiles disable trigger role_security_guard; delete from auth.users where id in (${users});
      alter table public.profiles enable trigger role_security_guard;
      update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
      delete from public.rate_limits where user_id in (${users});
      delete from public.activity_log where actor_id in (${users}) or target_id in (${users});`;
  }
  if (students) cleanup += `delete from public.activity_log where target_id in (${students});`;
  cleanup += `delete from auth.users where email like '${run}-%';`;
  sql(cleanup + 'commit;');
  console.log('Synthetic e-mail link fixtures removed.');
}
