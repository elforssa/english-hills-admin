// Formule/Premium retirement absence guard (plan premium-retirement.md, Release A).
// Scans every application source file, the receipt PDF/e-mail builders and the
// Edge Functions. Dependency-free; run by `npm test`.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceExtensions = /\.(?:js|jsx|mjs|cjs|ts|tsx|css|json|html)$/;

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : sourceExtensions.test(name) ? [path] : [];
  });
}

const scanned = [...files(join(root, 'src')), ...files(join(root, 'supabase/functions'))];
for (const required of ['src/lib/receiptPdf.js', 'src/lib/receiptPresentation.js', 'supabase/functions/sendReceiptEmail/index.ts']) {
  assert(scanned.includes(join(root, required)), `guard must scan ${required}`);
}

// Each rule is a retired concept. "Formulaire" (a form) is not a formule.
// `Standard` has no remaining legitimate use in these files: every former
// occurrence was a formule option, default, badge, export value or fallback.
// Any future occurrence must be reviewed and added here with its reason.
const rules = [
  ['Premium (any case, including premium_ and /premium-sessions)', /premium/i],
  ['Formule as a word', /\bformules?\b/i],
  ['plan_type / planType', /\bplan_type\b|\bplanType\b/],
  ['Standard as a formule value', /\bStandard\b/],
];
const allowed = new Map([
  // [relative path, [rule label, reason]] — intentionally empty after review.
]);

const violations = [];
for (const path of scanned) {
  const name = relative(root, path);
  readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
    for (const [label, pattern] of rules) {
      if (pattern.test(line) && !(allowed.get(name) || []).includes(label)) violations.push(`${name}:${index + 1}: ${label}: ${line.trim().slice(0, 120)}`);
    }
  });
}
assert.deepEqual(violations, [], `Retired Formule/Premium references remain:\n${violations.join('\n')}`);

// The module itself is gone.
for (const removed of ['src/app/(admin)/premium-sessions', 'src/components/premium']) {
  assert(!existsSync(join(root, removed)), `${removed} must be deleted`);
}

// The removed route is in no allowlist: restricted roles fall back to their home.
const { receptionistCanAccess, loginDestination } = await import('../src/lib/roleAccess.mjs');
const { safeReturnTo } = await import('../src/lib/navigation.mjs');
const retiredRoute = ['', 'premium-sessions'].join('/');
assert.equal(receptionistCanAccess(retiredRoute), false);
assert.equal(loginDestination('receptionist', retiredRoute), '/crm/leads');
assert.notEqual(safeReturnTo(retiredRoute), retiredRoute);

// Notification rows of the retired type (kept until Release B) show the generic label, never raw type text.
const read = path => readFileSync(join(root, path), 'utf8');
assert.match(read('src/app/(admin)/notifications/page.jsx'), /\{TYPE_LABELS\[n\.type\] \|\| TYPE_LABELS\.general\}/);
for (const portal of ['teacher-portal', 'parent-portal', 'student-portal']) {
  const source = read(`src/app/(admin)/${portal}/page.jsx`);
  assert.match(source, /\{NOTIF_TYPE_LABELS\[n\.type\] \|\| NOTIF_TYPE_LABELS\.general\}/, `${portal} notification fallback`);
  assert.doesNotMatch(source, /NOTIF_TYPE_LABELS\[n\.type\] \|\| n\.type/, `${portal} must not print raw type text`);
}

console.log(`PASS Formule/Premium absence guard over ${scanned.length} source files; retired route unreachable for restricted roles`);
