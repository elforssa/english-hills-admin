import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
// LIR-r1 P1-B/P1-D in the browser: the director publishes, retires (including a
// partial stop finished later) and retries through the real RPCs, with the exact
// payloads; the ratio guard; admin and receptionist never reach the panel.
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
assert(branch.startsWith('codex/') || branch.startsWith('claude/') || (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'pull_request'));
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').flatMap(l => { const m = l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/); return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : []; }));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const sql = s => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: s, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } }).trim();
const app = 'http://localhost:3101';
const users = [], password = randomBytes(20).toString('hex'), connection = randomUUID();
const page_id = '97001', formX = '97002', formY = '97003', formNew = '97005', secretRef = 'CRM_META_PAGE_TOKEN_LIRBROWSER';
const day = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date(Date.now() + offset * 86400000));
const attributionDay = day(-5);
const iso = offsetDays => new Date(Date.now() + offsetDays * 86400000).toISOString();
const jobs = { blocked: randomUUID(), dead: randomUUID() };
let browser;
assert.equal(sql(`select count(*) from crm_integration_connections where provider='meta' and settings #>> '{meta_reconciliation,enabled}'='true'`), '0', 'no other polled Meta connection');
try {
  for (const role of ['director', 'admin', 'receptionist']) {
    const email = `lir-browser-${randomUUID()}@example.invalid`;
    const response = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
    assert.equal(response.status, 200); const user = await response.json(); users.push({ ...user, email, role }); sql(`update profiles set role='${role}' where id='${user.id}'`);
  }
  const director = users[0].id;
  // Polled Meta connection (webhook off), attribution started five days ago, Insights
  // enabled with no completed sync (stale spend). Two forms with two unretired versions.
  sql(`begin;
  insert into crm_integration_connections(id,provider,connection_key,page_id,account_id,api_version,access_token_secret_ref,settings,insights_settings,created_by,updated_by)
  values('${connection}','meta','aa-lir-intake','${page_id}','97099','v26.0','${secretRef}',
   jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',true,'started_at','${iso(-60)}','lookback_minutes',1440),'attribution_enrichment',jsonb_build_object('enabled',true,'started_at','${attributionDay}T12:00:00Z')),
   '{"mode":"mock","enabled":true,"account_id":"97099","currency":"MAD","timezone":"Africa/Casablanca","api_version":"v26.0","secret_ref":"CRM_META_INSIGHTS_TOKEN_FIXTURE","refresh_days":28,"refresh_interval_hours":6}','${director}','${director}');
  insert into crm_form_mappings(connection_id,form_key,version,form_name,field_map,question_labels,option_labels,default_session_type,default_program_interest_text,learner_policy,effective_from,created_by)
  values('${connection}','${formX}',1,'Rentrée X','{"contact_name":"full_name","phone":"phone_number"}','{"travel":"Distance"}','{"travel":{"yes":"Oui"}}','Yearly','Annuel','optional','${iso(-40)}','${director}'),
   ('${connection}','${formX}',2,'Rentrée X','{"contact_name":"full_name","phone":"phone_number"}','{"travel":"Distance"}','{"travel":{"yes":"Oui"}}','Yearly','Annuel','optional','${iso(-5)}','${director}'),
   ('${connection}','${formY}',1,'Été Y','{"contact_name":"full_name"}','{}','{}','Summer Camp',null,'required','${iso(-40)}','${director}'),
   ('${connection}','${formY}',2,'Été Y','{"contact_name":"full_name"}','{}','{}','Summer Camp',null,'required','${iso(-5)}','${director}');
  insert into crm_ingestion_jobs(id,connection_id,external_key,event_kind,payload,payload_hash,status,attempt_count,last_error_code,reconciliation_started_at)
  values('${jobs.blocked}','${connection}','${page_id}:97101','leadgen','{"page_id":"${page_id}","leadgen_id":"97101","form_id":"97004","created_time":1700000000}',repeat('a',64),'blocked',1,'missing_mapping','${iso(-60)}'),
   ('${jobs.dead}','${connection}','${page_id}:97102','leadgen','{"page_id":"${page_id}","leadgen_id":"97102","form_id":"${formX}","created_time":1700000000}',repeat('b',64),'dead',8,'attempts_exhausted','${iso(-60)}');
  commit;`);
  const mappingIds = form => sql(`select string_agg(id::text,',' order by version) from crm_form_mappings where form_key='${form}' and connection_id='${connection}'`).split(',');
  browser = await chromium.launch({ headless: true });
  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await context.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await context.newPage(); page.setDefaultTimeout(60000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const calls = []; page.on('request', r => { const m = r.url().match(/\/rest\/v1\/rpc\/(crm_[a-z_]+)/); if (m && r.method() === 'POST') calls.push({ name: m[1], body: JSON.parse(r.postData() || '{}') }); });
    await page.goto(`${app}/login`); await page.waitForFunction(() => Object.keys(document.querySelector('#email') || {}).some(k => k.startsWith('__reactProps'))); await page.getByLabel('Adresse email', { exact: true }).fill(user.email); await page.getByLabel('Mot de passe', { exact: true }).fill(password); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await page.waitForURL(u => !u.pathname.startsWith('/login'));
    await page.goto(`${app}/crm/analytics`);
    if (user.role !== 'director') {
      await page.waitForURL(u => u.pathname === (user.role === 'admin' ? '/dashboard' : '/crm/leads'));
      await expect(page.getByTestId('lead-intake-panel')).toHaveCount(0);
      assert(!calls.some(c => c.name === 'crm_get_meta_diagnostics' || c.name.includes('form_mapping') || c.name === 'crm_retry_meta_job'), `${user.role} made no intake call`);
      await context.close(); continue;
    }
    // Status line: polling with the 24 h window, 2 jobs to handle, stale spend.
    const status = page.getByTestId('lead-intake-status');
    await expect(status).toContainText('Import des leads Meta : activé · fenêtre 24 h');
    await expect(page.getByTestId('lead-intake-pending')).toHaveText('Leads à traiter : 2');
    await expect(page.getByTestId('lead-intake-spend')).toHaveText('Dépenses Meta : aucune synchronisation complète');
    await expect(page.getByTestId('lead-intake-spend')).toHaveClass(/text-red-700/);
    await expect(status).toContainText('l’e-mail d’échec GitHub le signale');
    assert(calls.some(c => c.name === 'crm_get_meta_diagnostics' && c.body.p_limit === 100 && c.body.p_offset === 0));
    await page.getByRole('button', { name: 'Réception des leads', exact: true }).click();
    const panel = page.getByTestId('lead-intake-panel');
    const row = form => page.getByTestId(`intake-form-${form}`);
    await expect(row(formX).getByTestId('intake-form-status')).toHaveText('Actif');
    await expect(row(formX)).toContainText('v2');
    await expect(panel.getByTestId('intake-checklist')).toContainText('Avant chaque campagne');
    for (const hidden of [page_id, '97099', secretRef, 'CRM_META_INSIGHTS_TOKEN_FIXTURE', 'full_name']) assert(!(await panel.innerText()).includes(hidden), `panel hides ${hidden}`);

    // Publish a new form, copying the answers of form X; first version back-dated 30 days.
    await panel.getByRole('button', { name: 'Publier un formulaire Meta' }).click();
    const dialog = page.getByTestId('intake-publish-dialog');
    await dialog.getByLabel('Identifiant du formulaire Meta').fill(formNew);
    await dialog.getByLabel('Nom du formulaire').fill('Campagne LIR');
    await dialog.getByLabel('Copier les réponses depuis').selectOption({ label: 'Rentrée X · v2' });
    await dialog.getByLabel('Type de session').selectOption('Adults');
    await expect(dialog.getByLabel('Champ phone')).toHaveValue('phone_number');
    await expect(dialog.getByTestId('intake-effective-zone')).toContainText('heure de ce navigateur');
    await dialog.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByTestId('intake-publish-summary')).toContainText(`${formNew} · v1`);
    await expect(page.getByTestId('intake-publish-summary')).toContainText('Date d’effet (heure de Casablanca)');
    const before = Date.now();
    await dialog.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(page.getByText('Formulaire publié', { exact: true }).first()).toBeVisible();
    const publish = calls.filter(c => c.name === 'crm_publish_meta_form_mapping');
    assert.equal(publish.length, 1);
    const { effective_from, ...rest } = publish[0].body.p_data;
    assert.deepEqual(Object.keys(publish[0].body).sort(), ['p_connection', 'p_data']);
    assert.equal(publish[0].body.p_connection, connection);
    assert.deepEqual(rest, { form_key: formNew, form_name: 'Campagne LIR', field_map: { contact_name: 'full_name', phone: 'phone_number' },
      question_labels: { travel: 'Distance' }, option_labels: { travel: { yes: 'Oui' } }, learner_policy: 'optional', default_session_type: 'Adults', default_program_interest_text: 'Annuel' });
    assert(Math.abs(Date.parse(effective_from) - (before - 30 * 86400000)) < 5 * 60000, effective_from);
    await expect(row(formNew).getByTestId('intake-form-status')).toHaveText('Actif');
    assert.equal(sql(`select version||':'||default_session_type from crm_form_mappings where form_key='${formNew}'`), '1:Adults');

    // Arrêter l'import retires both unretired versions of form X, oldest first.
    const idsX = mappingIds(formX);
    await row(formX).getByRole('button', { name: 'Arrêter l’import' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Les nouveaux leads de ce formulaire ne seront plus importés. Action définitive : pour reprendre, publiez une nouvelle version.');
    await expect(page.getByRole('alertdialog')).toContainText('2 versions encore actives seront retirées.');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Arrêter l’import' }).click();
    await expect(row(formX).getByTestId('intake-form-status')).toHaveText('Arrêté');
    assert.deepEqual(calls.filter(c => c.name === 'crm_retire_meta_form_mapping').map(c => c.body), idsX.map(p_mapping => ({ p_mapping })));
    assert.equal(sql(`select count(*) from crm_form_mappings where form_key='${formX}' and retired_at is null`), '0');

    // A PT409 record conflict on the second call stops the loop: Partiellement arrêté, then finished.
    const idsY = mappingIds(formY);
    let failNext = true;
    await page.route('**/rest/v1/rpc/crm_retire_meta_form_mapping', async route => {
      if (route.request().postDataJSON().p_mapping === idsY[1] && failNext) { failNext = false; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'PT409', message: 'Refresh', details: null, hint: null }) }); }
      return route.continue();
    });
    await row(formY).getByRole('button', { name: 'Arrêter l’import' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Arrêter l’import' }).click();
    await expect(page.getByText('Arrêt incomplet. Actualisez puis réessayez', { exact: true }).first()).toBeVisible();
    await expect(row(formY).getByTestId('intake-form-status')).toHaveText('Partiellement arrêté');
    await expect(row(formY)).toContainText('encore importé');
    await row(formY).getByRole('button', { name: 'Terminer l’arrêt' }).click();
    await expect(page.getByRole('alertdialog')).not.toContainText('versions encore actives');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Arrêter l’import' }).click();
    await expect(row(formY).getByTestId('intake-form-status')).toHaveText('Arrêté');
    assert.deepEqual(calls.filter(c => c.name === 'crm_retire_meta_form_mapping').slice(2).map(c => c.body.p_mapping), [idsY[0], idsY[1], idsY[1]]);
    await page.unroute('**/rest/v1/rpc/crm_retire_meta_form_mapping');

    // Leads à traiter: retry the blocked job; the dead job has no retry and says why.
    const blockedRow = panel.getByTestId('intake-job').filter({ hasText: 'Formulaire sans correspondance publiée' });
    await expect(blockedRow).toContainText('Publiez le formulaire avec une date d’effet antérieure au lead, puis réessayez.');
    await expect(blockedRow).toContainText('Formulaire Meta');
    const deadRow = panel.getByTestId('intake-job').filter({ hasText: 'Tentatives épuisées' });
    await expect(deadRow).toContainText('Non réessayable');
    await expect(deadRow.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await blockedRow.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('Nouvelle tentative demandée', { exact: true }).first()).toBeVisible();
    assert.deepEqual(calls.filter(c => c.name === 'crm_retry_meta_job').map(c => c.body), [{ p_job: jobs.blocked }]);
    assert.equal(sql(`select status from crm_ingestion_jobs where id='${jobs.blocked}'`), 'pending');
    await expect(page.getByTestId('lead-intake-pending')).toHaveText('Leads à traiter : 1');
    await page.screenshot({ path: join(tmpdir(), 'hills-lir-intake-panel.png'), fullPage: true });

    // P1-D: a range starting before the attribution day hides CPL, CPQL and CAC.
    await page.getByLabel('Compte publicitaire').selectOption({ label: 'aa-lir-intake · MAD' });
    await page.getByLabel('Acquisitions du', { exact: true }).fill(day(-10));
    await page.getByLabel('Acquisitions au', { exact: true }).fill(day(0));
    const hidden = page.getByTestId('ratios-hidden');
    await expect(hidden).toContainText('Ratios masqués : la période commence avant le début de l’attribution des campagnes');
    await expect(page.locator('div.grid > div', { hasText: 'CAC Meta attribué' })).toContainText('—');
    await hidden.getByRole('button', { name: /^Commencer au / }).click();
    await expect(page.getByLabel('Acquisitions du', { exact: true })).toHaveValue(attributionDay);
    await expect(hidden).toHaveCount(0);
    await page.route('**/rest/v1/rpc/crm_get_marketing_cohort**', async route => { const response = await route.fetch(); const real = await response.json();
      await route.fulfill({ response, json: { ...real, total: 1, rows: [{ bucket: 'pending:meta_instant_form', object_key: null, attribution_kind: 'unattributed', channel: 'meta_instant_form', name: 'Meta · attribution en attente', leads: 2, spend: null, cpl: 4, cpql: null, cac: null }] } }); });
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
    await expect(page.getByTestId('ratios-partial')).toHaveText('partiel : 2 prospects Meta sans attribution');
    await expect(page.locator('tbody tr', { hasText: 'Meta · attribution en attente' })).toContainText('4 MAD', { useInnerText: true });
    await page.unroute('**/rest/v1/rpc/crm_get_marketing_cohort**');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS director intake panel: status line, publish with the exact allowed payload and −30-day default, retire every version, PT409 partial stop finished later, retry/dead rows, ratio guard and partial note; admin/receptionist never reach it');
} finally {
  await browser?.close();
  // Published mappings are immutable by trigger; this local cleanup bypasses triggers for synthetic rows only.
  sql(`begin;set local session_replication_role=replica;
  delete from crm_ingestion_jobs where connection_id='${connection}';delete from crm_meta_reconciliation_state where connection_id='${connection}';
  delete from crm_form_mappings where connection_id='${connection}';delete from crm_integration_connections where id='${connection}';commit;`);
}
