// RWR-r5 §5.1 / invariant 6 — the JS phone normaliser against the shared fixture.
// test-phone.sql runs the same file through the SQL functions of migration 138.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPhone, formatPhoneFr, isPlaceholder, maskPhone, phoneKey, phoneSearchKey, toE164 } from '../src/lib/phone.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/phone-cases.json', import.meta.url), 'utf8'));
assert(fixture.cases.length >= 20 && fixture.search.length >= 10, 'fixture loaded');

for (const c of fixture.cases) {
  const label = JSON.stringify(c.raw);
  assert.equal(toE164(c.raw), c.e164, `toE164 ${label}`);
  assert.equal(phoneKey(c.raw), c.key, `phoneKey ${label}`);
  assert.equal(isPlaceholder(toE164(c.raw)), c.placeholder, `isPlaceholder ${label}`);
  assert.equal(formatPhoneFr(c.raw), c.format, `formatPhoneFr ${label}`);
  const check = checkPhone(c.raw);
  const kind = check.ok ? (check.e164 ? 'ok' : 'empty') : check.code === 'people.phone_placeholder' ? 'placeholder' : 'invalid';
  assert.equal(kind, c.check, `checkPhone ${label}`);
  if (c.check === 'ok') assert.equal(check.e164, c.e164, `checkPhone value ${label}`);
}
for (const s of fixture.search) {
  const query = phoneSearchKey(s.query), stored = phoneKey(s.stored);
  assert.equal(Boolean(query && stored && stored.includes(query)), s.match, `search ${JSON.stringify(s.query)} in ${JSON.stringify(s.stored)}`);
}
assert.equal(checkPhone('0600000000').error, 'Numéro fictif : laissez vide');
assert.equal(checkPhone('06123').error, 'Numéro invalide');
assert.equal(maskPhone('+212612345678'), '06 •• •• •• 78');
assert.equal(maskPhone(''), '');
assert.equal(toE164(null), null);
assert.equal(phoneKey(undefined), null);
console.log(`PASS phone normaliser: ${fixture.cases.length} cases, ${fixture.search.length} search pairs`);
