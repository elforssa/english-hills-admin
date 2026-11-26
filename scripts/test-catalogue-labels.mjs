// RWR-r5 PR B2 (§5.4, migration 140): the JavaScript catalogues equal the seed of
// migration 140 (programmes and their levels, origins, close reasons), the receipt e-mail
// carries the same programme labels, and the close menus cover every reason offered.
//   node scripts/test-catalogue-labels.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS_BY_SESSION, PROGRAMMES, PROGRAMME_LABELS, SESSION_TYPES, programmeName, serviceLine } from '../src/lib/programCatalog.mjs';
import { CLOSE_MENU, CLOSE_REASONS, NOT_INTERESTED_WHY, ORIGINS, REFERRAL_ORIGINS, closeChoice, studentOriginCode } from '../src/lib/catalogue.mjs';
import * as emailLabels from '../supabase/functions/sendReceiptEmail/programmeLabels.mjs';

const migration = readFileSync(new URL('../supabase/migrations/140_catalogues.sql', import.meta.url), 'utf8');
// The rows of `insert into public.<table>(…) values (…), (…) on conflict`, as arrays of literals.
function seed(table) {
  const block = migration.match(new RegExp(`insert into public\\.${table}\\(([^)]*)\\) values\\n([\\s\\S]*?)\\non conflict`));
  assert.ok(block, `seed of ${table}`);
  const columns = block[1].split(',').map(c => c.trim());
  // One tuple: quoted literals may hold parentheses (« Meta (formulaire) »).
  return [...block[2].matchAll(/\(((?:'(?:[^']|'')*'|[^'()])*)\)/g)].map(m => {
    const values = [...m[1].matchAll(/'((?:[^']|'')*)'|(true|false|\d+)/g)].map(v => v[1] !== undefined ? v[1].replace(/''/g, "'") : v[2] === 'true' ? true : v[2] === 'false' ? false : Number(v[2]));
    return Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  });
}

// Programmes: same codes, order, labels, audience and flags as the seed.
const programmes = seed('programmes');
assert.deepEqual(PROGRAMMES.map(p => [p.code, p.label, p.audience, p.crmSelectable, p.enrollable]),
  programmes.map(p => [p.code, p.label_fr, p.audience, p.crm_selectable, p.enrollable]), 'programmes: JS = seed');
assert.deepEqual([...SESSION_TYPES].sort(), programmes.map(p => p.code).sort(), 'every programme is a session type');
assert.equal(programmeName('Summer Camp'), 'Stage d’été');
assert.equal(programmeName('Legacy'), 'Ancien solde');
assert.equal(programmeName('Texte libre'), 'Texte libre', 'an unknown value is shown as stored');
assert.equal(serviceLine('Yearly · 2026/2027'), 'Programme annuel · 2026/2027');
assert.equal(serviceLine('Autre · Examen · 2026/2027'), 'Autre · Examen · 2026/2027');

// Levels: the seed's three lists are the pickers' lists.
const levelBlock = migration.match(/insert into public\.programme_levels[\s\S]*?on conflict/)[0];
const arrays = [...levelBlock.matchAll(/array\[([^\]]*)\]/g)].map(m => [...m[1].matchAll(/'([^']*)'/g)].map(v => v[1]));
assert.equal(arrays.length, 3);
for (const code of programmes.map(p => p.code)) {
  const expected = code === 'Yearly' ? arrays[0] : code === 'Adults' ? arrays[1] : arrays[2];
  assert.deepEqual(LEVELS_BY_SESSION[code], expected, `levels of ${code}: JS = seed`);
}

// Origins.
assert.deepEqual(ORIGINS.map(o => [o.code, o.label, o.channel, o.requiresReferrer, o.selectable]),
  seed('acquisition_sources').map(o => [o.code, o.label_fr, o.channel, o.requires_referrer, o.selectable]), 'origins: JS = seed');
// The five old learner answers map as crm_security.referral_origin does.
const referral = migration.match(/create or replace function crm_security\.referral_origin[\s\S]*?\$\$;/)[0];
for (const [answer, code] of Object.entries(REFERRAL_ORIGINS)) {
  assert.ok(referral.includes(`when '${answer.replace(/'/g, "''")}' then '${code}'`), `referral_origin maps « ${answer} »`);
}
assert.equal(studentOriginCode({ origin_code: 'instagram', referral_source: 'Recherche Google' }), 'instagram', 'the origin wins');
assert.equal(studentOriginCode({ referral_source: 'Recherche Google' }), 'google', 'the old answer until D4');

// Close reasons and the derived status.
assert.deepEqual(CLOSE_REASONS.map(r => [r.code, r.label, r.status, r.selectable, r.requiresNote, r.requiresFailedCalls]),
  seed('crm_close_reasons').map(r => [r.code, r.label_fr, r.status, r.selectable, r.requires_note, r.requires_failed_calls]), 'close reasons: JS = seed');
assert.equal(CLOSE_REASONS.find(r => r.code === 'wrong_number').status, 'NOT_QUALIFIED');
assert.equal(CLOSE_REASONS.find(r => r.code === 'duplicate').status, 'LOST');
const offered = CLOSE_REASONS.filter(r => r.selectable).map(r => r.code).sort();
assert.deepEqual([...new Set([...CLOSE_MENU, ...NOT_INTERESTED_WHY])].sort(), offered, 'the « Motif » menu and « Pourquoi ? » cover every offered reason');
assert.equal(CLOSE_MENU[0], 'not_interested');
assert.deepEqual(closeChoice({ reason: 'wrong_number' }), { reason: 'wrong_number' });
assert.deepEqual(closeChoice({ reason: 'not_interested', why: 'price' }), { reason: 'price' });
assert.deepEqual(closeChoice({ reason: 'not_interested', why: 'not_interested', closeNote: ' Trop loin ' }), { reason: 'not_interested', note: 'Trop loin' });
assert.throws(() => closeChoice({ reason: 'not_interested', why: 'not_interested' }), /Précisez/);
assert.throws(() => closeChoice({ reason: 'other' }), /Précisez/);
assert.throws(() => closeChoice({}), /^Error: Choisissez le motif/);

// The receipt e-mail (deployed on its own) carries the same labels.
assert.deepEqual(emailLabels.PROGRAMME_LABELS, PROGRAMME_LABELS, 'sendReceiptEmail labels = programCatalog');
assert.equal(emailLabels.serviceLine('Adults · 2026/2027'), 'Adultes · 2026/2027');

console.log('PASS catalogue labels: programmes, levels, origins and close reasons equal the 140 seed; e-mail labels equal');
