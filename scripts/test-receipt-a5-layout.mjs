import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import jsPDFPackage from 'jspdf';
import { buildReceiptPDF } from '../src/lib/receiptPdf.js';
import { buildServiceDescription, RECEIPT_PAPER_FORMAT } from '../src/lib/receiptPresentation.js';
import { SESSION_TYPES } from '../src/lib/academicPrograms.js';

const { jsPDF } = jsPDFPackage;
const logoData = `data:image/png;base64,${(await readFile('public/eh-logo.png')).toString('base64')}`;
await mkdir('output/pdf', { recursive: true });
for (const session of SESSION_TYPES) {
  const receipt = {
    receipt_number: 'EH-TEST-2026-0012', date: '2026-09-15', nom_prenom: 'Apprenant synthétique',
    telephone: '0600000000', email: 'synthetic@example.test', session_type: session,
    // Deliberately stale plan metadata must not add a formula to another course.
    plan_type: 'Premium', school_year_snapshot: '2026/2027', niveau: 'A2',
    service_description: buildServiceDescription({ sessionType: session, planType: 'Premium', schoolYear: '2026/2027', serviceDetail: 'Préparation examen' }),
    gross_amount_snapshot: 3000, discount_amount_snapshot: 100, net_amount_snapshot: 2900,
    paid_before_snapshot: 500, montant_paye: 1000, balance_after_snapshot: 1400,
    mode_paiement: 'Virement', transaction_reference: 'TEST-001', payment_note: 'INTERNAL-NOTE-DO-NOT-PRINT '.repeat(1000), observation: 'PRIVATE-OBSERVATION', void_reason: 'INTERNAL-CANCELLATION',
  };
  const doc = new jsPDF({ unit: 'mm', format: RECEIPT_PAPER_FORMAT });
  const labels = [];
  const originalText = doc.text.bind(doc);
  doc.text = (text, ...args) => { labels.push(...(Array.isArray(text) ? text : [text])); return originalText(text, ...args); };
  buildReceiptPDF(doc, receipt, { logoData });
  assert.equal(doc.getNumberOfPages(), 1, `${session}: routine receipt must fit one A5 page`);
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 148) < 0.1);
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 210) < 0.1);
  assert.ok(labels.includes(session));
  assert.ok(!labels.some(label => /INTERNAL-|PRIVATE-OBSERVATION/.test(label)), 'Internal details must not be printed');
  assert.equal(labels.includes('Formule'), session === 'Yearly');
  assert.equal(labels.some(label => label.includes('Premium')), session === 'Yearly');
  if (session === 'Yearly' || session === 'Adults') doc.save(`output/pdf/receipt-a5-${session.toLowerCase()}-preview.pdf`);
}
console.log('A5 single-page layout and Yearly-only formula checks passed for every session.');
