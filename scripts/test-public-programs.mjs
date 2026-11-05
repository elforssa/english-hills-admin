// Public registration retired (plan Enrollment at payment, D4; owner decision 6): the
// anonymous /inscription page offers no programme and no form, only the centre's contact
// details, and /api/public/inscription refuses every request with 410. Staff screens keep
// both online programmes. Dependency-free; run by npm test.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { NextResponse } from 'next/server.js';
import { SESSION_TYPES, ONLINE_SESSION_TYPES, LEVELS_BY_SESSION, isOnlineSessionType } from '../src/lib/programCatalog.mjs';

// Staff screens still offer the online programmes (plan online-learning.md I5, Q3 = A).
assert.deepEqual(ONLINE_SESSION_TYPES, ['Online', 'Online One-to-One']);
assert.ok(ONLINE_SESSION_TYPES.every(s => SESSION_TYPES.includes(s)), 'staff screens offer both online types');
assert.ok(ONLINE_SESSION_TYPES.every(s => LEVELS_BY_SESSION[s].join() === 'A1,A2,B1,B2,C1,C2'), 'Q3 = A: CEFR levels');
assert.equal(isOnlineSessionType('Online'), true);
assert.equal(isOnlineSessionType('One-to-One'), false);

// The public page: static contact details, no programme, no form, no client code.
const page = readFileSync(new URL('../src/app/inscription/page.jsx', import.meta.url), 'utf8');
assert.match(page, /Inscriptions au centre/, 'title');
assert.doesNotMatch(page, /SESSION_TYPES|getLevelsForSession|academicPrograms|programCatalog/, 'no programme list');
assert.doesNotMatch(page, /<form|<input|<select|<textarea|onSubmit|onChange|fetch\(/, 'no form');
assert.doesNotMatch(page, /['"]use client['"]|useState|useEffect|next\/script|turnstile/i, 'no client script, no Turnstile');
assert.doesNotMatch(page, /\/api\/public\/inscription/, 'the page never posts');
assert.match(page, /tel:\+212664239091/, 'phone');
assert.match(page, /const WEBSITE = 'https:\/\/english-hills\.com';/);
assert.match(page, /const WHATSAPP_HREF = 'https:\/\/wa\.me\/212664239091';/, 'a neutral WhatsApp link');
assert.doesNotMatch(page, /contact-camp/, 'never the camp redirect');
assert.match(page, /`\$\{WEBSITE\}\/contact`/, 'the website contact page');
assert.match(page, /Almaz 2, Hills Business Center/, 'address');
assert.match(page, /Horaires/, 'opening hours');
assert.equal(existsSync(new URL('../src/lib/publicInscription.mjs', import.meta.url)), false, 'the public schema is deleted');

// The route refuses before reading anything: no schema, limiter, Turnstile or registration call.
const route = readFileSync(new URL('../src/app/api/public/inscription/route.js', import.meta.url), 'utf8');
const code = route.replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(code, /SESSION_TYPES|publicInscription|InscriptionSchema|readBoundedJson|request\.json|check_anon_rate_limit|turnstile|create_public_registration|getServiceRoleClient|rpc\(/i);
const POST = new Function('NextResponse', code.replace(/^import .*;\n/gm, '').replace('export async function POST', 'async function POST') + '\nreturn POST;')(NextResponse);
for (const body of [JSON.stringify({ full_name: 'Synthetic Learner', session_type: 'Online', consent: true }), '{', 'x'.repeat(64 * 1024)]) {
  const request = new Request('https://admin.english-hills.local/api/public/inscription', {
    method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' } });
  const response = await POST(request);
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: 'Les inscriptions en ligne sont fermées. Contactez le centre.' });
  assert.equal(request.bodyUsed, false, 'the body is never read');
}
console.log('PASS public registration retired: the page offers no programme and no form, the route answers 410; staff keep the online programmes');
