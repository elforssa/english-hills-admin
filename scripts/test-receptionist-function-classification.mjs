// Receptionist list guard (plan RPW-r2, ADR-018): every public function executable by
// `authenticated` is classified for the receptionist, and every policy naming her is in a
// reviewed manifest. A new, changed or missing entry fails until its fixture is updated in
// the same reviewed change. `--write` regenerates both fixtures (review the diff).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { classify, executableFunctions, receptionistPolicies } from './lib/receptionist-catalog.mjs';

const FUNCTIONS = new URL('./fixtures/receptionist-function-classification.json', import.meta.url);
const POLICIES = new URL('./fixtures/receptionist-policy-manifest.json', import.meta.url);
const write = process.argv.includes('--write');

const live = {};
for (const fn of executableFunctions()) {
  const { gate, receptionist } = classify(fn);
  live[fn.signature] = gate === 'manual' ? { gate, receptionist, md5: fn.md5 } : { gate, receptionist };
}
const policies = receptionistPolicies();

if (write) {
  const previous = (() => { try { return JSON.parse(readFileSync(FUNCTIONS, 'utf8')); } catch { return {}; } })();
  for (const [signature, entry] of Object.entries(live)) {
    // A manual outcome is a reviewed decision: keep it while the body is unchanged.
    if (entry.gate === 'manual' && previous[signature]?.md5 === entry.md5) entry.receptionist = previous[signature].receptionist;
  }
  writeFileSync(FUNCTIONS, JSON.stringify(live, null, 2) + '\n');
  writeFileSync(POLICIES, JSON.stringify(policies, null, 2) + '\n');
  console.log(`wrote ${Object.keys(live).length} functions and ${Object.keys(policies).length} policies`);
  process.exit(0);
}

const fixture = JSON.parse(readFileSync(FUNCTIONS, 'utf8'));
const added = Object.keys(live).filter(k => !(k in fixture));
const removed = Object.keys(fixture).filter(k => !(k in live));
assert.deepEqual(added, [], 'unclassified functions executable by authenticated');
assert.deepEqual(removed, [], 'classified functions that no longer exist');
for (const [signature, entry] of Object.entries(live)) {
  const expected = fixture[signature];
  assert.equal(entry.gate, expected.gate, `${signature}: gate changed`);
  if (entry.gate === 'manual') {
    assert.equal(entry.md5, expected.md5, `${signature}: manually classified body changed`);
    assert.ok(['open', 'locked', 'rls', 'not_staff'].includes(expected.receptionist), `${signature}: manual outcome missing`);
  } else {
    assert.equal(entry.receptionist, expected.receptionist, `${signature}: receptionist outcome changed`);
  }
}
assert.deepEqual(policies, JSON.parse(readFileSync(POLICIES, 'utf8')), 'receptionist policy manifest differs');
console.log(`PASS receptionist function classification (${Object.keys(live).length}) and policy manifest (${Object.keys(policies).length})`);
