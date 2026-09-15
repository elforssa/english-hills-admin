import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import jsPDFPackage from 'jspdf';
import { buildReceiptPDF } from '../src/lib/receiptPdf.js';

const { jsPDF } = jsPDFPackage;
const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'output/pdf');
await mkdir(outputDir, { recursive: true });
const logo = await readFile(resolve(root, 'public/eh-logo.png'));
const logoData = `data:image/png;base64,${logo.toString('base64')}`;
const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });

const receipt = {
  receipt_number: 'EH-TEST-2026-0001',
  date: '2026-09-15',
  nom_prenom: 'Aya El Mansouri-Benabdeljalil - Vérification de nom très long',
  telephone: '06 12 34 56 78',
  email: 'famille.test+recu-long@example.test',
  session_type: 'Yearly',
  school_year_snapshot: '2026/2027',
  plan_type: 'Premium',
  niveau: 'Upper-Intermediate B2',
  service_description: 'Yearly · Premium · 2026/2027',
  gross_amount_snapshot: 4321.55,
  discount_amount_snapshot: 321.45,
  net_amount_snapshot: 4000.10,
  paid_before_snapshot: 1234.55,
  montant_paye: 1000.25,
  balance_after_snapshot: 1765.30,
  mode_paiement: 'Virement',
  transaction_reference: 'VIR-TEST-REFERENCE-TRES-LONGUE-2026-09-15-0000000001',
  payment_note: 'Note synthétique longue pour vérifier les accents, le retour à la ligne, les limites de page et la lisibilité. Aucun renseignement réel n’est utilisé. '.repeat(8),
  voided_at: '2026-09-15T12:00:00Z',
  void_reason: 'Annulation synthétique pour contrôler la conservation des montants historiques et la visibilité de la mention ANNULÉ.',
  statut_paiement: 'Acompte versé',
};
buildReceiptPDF(doc, receipt, { logoData });
assert.equal(doc.getNumberOfPages(), 1, 'Even long internal notes and cancellation reasons must never add a client page');

const outputPath = resolve(outputDir, 'receipt-a5-synthetic-qa.pdf');
doc.save(outputPath);
console.log(outputPath);
