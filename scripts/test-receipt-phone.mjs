// RWR-r5 PR B1 (§5.1): since migration 139 a learner's phone is stored in E.164 and a new
// receipt copies it. Every receipt, list and screen shows the French national form; only a
// link (tel:, wa.me) uses E.164. Synthetic, invented numbers only.
//   node scripts/test-receipt-phone.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import jsPDFPackage from 'jspdf';
import { buildReceiptPDF } from '../src/lib/receiptPdf.js';
import { RECEIPT_PAPER_FORMAT, receiptPhone } from '../src/lib/receiptPresentation.js';
import { formatPhoneFr, telHref } from '../src/lib/phone.mjs';

const { jsPDF } = jsPDFPackage;

// 1. The printed receipt (PDF and print share buildReceiptPDF).
const cases = [
  ['+212612345678', '06 12 34 56 78'],   // a receipt issued after 139
  ['0612345678', '06 12 34 56 78'],      // an older receipt, typed national form
  ['06 12 34 56 78', '06 12 34 56 78'],
  ['00212612345678', '06 12 34 56 78'],
  ['+33612345678', '+33612345678'],      // a foreign number keeps its international form
  ['appeler la mère', 'appeler la mère'] // an old unreadable value is printed as it was typed
];
for (const [stored, shown] of cases) {
  assert.equal(receiptPhone({ telephone: stored }), shown, `receiptPhone(${stored})`);
  const doc = new jsPDF({ unit: 'mm', format: RECEIPT_PAPER_FORMAT });
  const labels = [];
  const text = doc.text.bind(doc);
  doc.text = (value, ...args) => { labels.push(...(Array.isArray(value) ? value : [value])); return text(value, ...args); };
  buildReceiptPDF(doc, {
    receipt_number: 'EH-TEST-2026-0099', date: '2026-11-25', nom_prenom: 'Apprenant synthétique', telephone: stored,
    email: 'synthetic@example.test', session_type: 'Yearly', school_year_snapshot: '2026/2027', service_description: 'Yearly · 2026/2027',
    gross_amount_snapshot: 3000, discount_amount_snapshot: 0, net_amount_snapshot: 3000, paid_before_snapshot: 0,
    montant_paye: 1000, balance_after_snapshot: 2000, mode_paiement: 'Espèces'
  }, {});
  assert(labels.includes(shown), `receipt PDF prints « ${shown} » for a stored « ${stored} »`);
  if (stored.startsWith('+212') || stored.startsWith('00212')) assert(!labels.some(l => String(l).includes('212')), `no « +212 » on the printed receipt (${stored})`);
}
assert.equal(receiptPhone({ telephone: null }), '');
assert.equal(receiptPhone(null), '');
console.log(`PASS receipt PDF/print: ${cases.length} stored forms print the national form (foreign and unreadable values unchanged)`);

// 2. Links keep E.164; an unreadable value gives no link.
assert.equal(telHref('06 12 34 56 78'), 'tel:+212612345678');
assert.equal(telHref('+212612345678'), 'tel:+212612345678');
assert.equal(telHref('appeler la mère'), null);
assert.equal(formatPhoneFr('+212698765432'), '06 98 76 54 32');

// 3. The finance receipt list shows receiptPhone and links with telHref.
const finance = await readFile(new URL('../src/app/(admin)/finance/page.jsx', import.meta.url), 'utf8');
assert.match(finance, /\{receiptPhone\(r\)\}/, 'finance list shows the national form');
assert.match(finance, /href=\{telHref\(r\.telephone\)\}/, 'finance tel: link uses E.164');
assert.doesNotMatch(finance, /\{r\.telephone\}|tel:\$\{r\.telephone\}/, 'finance never renders the stored value raw');
// « Mettre à jour les contacts » with the stored phone unchanged (review of #217): no phone
// check, and the stored value goes back as it is, so an old malformed number never refuses
// an e-mail change (the trigger checks only a telephone that changes).
const receiptForm = await readFile(new URL('../src/components/receipts/ReceiptForm.jsx', import.meta.url), 'utf8');
assert.match(receiptForm, /form\.phone\.trim\(\) === formatPhoneFr\(storedPhone\.current\)/, 'unchanged = the displayed stored phone');
assert.match(receiptForm, /form\.update_contacts && !unchangedPhone\)\) \{\s*const phone = checkPhone/, 'no phone check when unchanged');
assert.match(receiptForm, /\.\.\.\(unchangedPhone \? \{ phone: storedPhone\.current \} : \{\}\)/, 'the stored phone is sent back as is');
assert.equal(formatPhoneFr('appeler la mère'), 'appeler la mère', 'a malformed stored phone is displayed as typed, so it compares unchanged');
const pdf = await readFile(new URL('../src/lib/receiptPdf.js', import.meta.url), 'utf8');
assert.doesNotMatch(pdf, /receipt\.telephone/, 'the receipt PDF reads the phone through receiptPhone');

// 4. No screen renders a stored phone raw: every `{x.telephone}` / `{x.phone}` text node goes
// through formatPhoneFr (inputs and hrefs are attributes, not text nodes).
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(jsx|js|mjs)$/.test(entry.name)) files.push(path);
  }
}
await walk(new URL('../src', import.meta.url).pathname);
const raw = /(?<![=(]\s*)\{\s*[A-Za-z_][\w.?]*\.(?:telephone|phone|phone_e164|whatsapp_e164|whatsapp_own)\s*(?:\}|\|\||\?\?)|(?<!formatPhoneFr\()`\+\$\{links\.whatsapp/;
const offenders = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  source.split('\n').forEach((line, i) => { if (raw.test(line.replace(/(?:value|href|defaultValue)=\{`[^`]*(?:`[^`]*`[^`]*)*`\}/g, '').replace(/(?:value|href|defaultValue)=\{[^}]*\}/g, ''))) offenders.push(`${file.split('/src/')[1]}:${i + 1}`); });
}
assert.deepEqual(offenders, [], 'stored phones rendered without formatPhoneFr');
console.log(`PASS no raw stored phone in ${files.length} source files; links use E.164 (tel:, wa.me)`);
