import { readFileSync } from 'node:fs';

const PAYMENT_MODES = new Map([
  ['cash', 'Espèces'], ['espece', 'Espèces'], ['especes', 'Espèces'],
  ['card', 'Carte bancaire'], ['carte', 'Carte bancaire'],
  ['cheque', 'Chèque'], ['virement', 'Virement'],
]);

export function normalizeText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('212')) return digits;
  if (digits.length === 9) return `212${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `212${digits.slice(1)}`;
  return digits;
}

export function parseCsv(text) {
  const records = [];
  let field = '', row = [], quoted = false;
  text = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field.trim()); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) records.push(row);
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
    } else field += ch;
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(Boolean)) records.push(row); }
  if (!records.length) return [];
  const headers = records.shift();
  return records.map((values, index) => Object.fromEntries([
    ...headers.map((header, column) => [header, values[column] || '']),
    ['_source_row', index + 2],
  ]));
}

function moneyToCents(value, field, sourceRow, issues) {
  if (String(value || '').trim() === '') return 0;
  const amount = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) {
    issues.push({ type: 'invalid_money', field, sourceRow, value });
    return 0;
  }
  return Math.round(amount * 100);
}

export function splitCents(totalCents, count) {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function parseDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function titleWords(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
    .replace(/(^|[ '\-])\p{L}/gu, char => char.toLocaleUpperCase('fr'));
}

function ageCategory(age) {
  if (!Number.isInteger(age) || age < 0) return null;
  if (age <= 12) return 'Young Learners (6-12)';
  if (age <= 17) return 'Teens (13-17)';
  return 'Adults (18+)';
}

function familyKey(row) { return normalizeText(row['Parent Name']).replace(/\s/g, ''); }

export function prepareSources(sources) {
  const issues = [];
  const children = [];
  for (const source of sources) {
    const rows = parseCsv(source.text);
    const families = new Map();
    for (const row of rows) {
      const key = familyKey(row);
      if (!key || !normalizeText(row['Student Name'])) {
        issues.push({ type: 'missing_identity', source: source.key, sourceRow: row._source_row });
        continue;
      }
      if (!families.has(key)) families.set(key, []);
      families.get(key).push(row);
    }

    for (const [key, familyRows] of families) {
      const paymentRows = familyRows.filter(row => String(row.PAYE || '').trim() !== '');
      if (paymentRows.length !== 1) {
        issues.push({ type: 'family_payment_row_count', source: source.key, familyKey: key, count: paymentRows.length });
      }
      const paymentRow = paymentRows[0] || {};
      const paid = moneyToCents(paymentRow.PAYE, 'PAYE', paymentRow._source_row, issues);
      const remaining = moneyToCents(paymentRow.RESTE, 'RESTE', paymentRow._source_row, issues);
      const discount = moneyToCents(paymentRow.REMISE, 'REMISE', paymentRow._source_row, issues);
      const paidParts = splitCents(paid, familyRows.length);
      const remainingParts = splitCents(remaining, familyRows.length);
      const discountParts = splitCents(discount, familyRows.length);
      const rawMode = normalizeText(paymentRow.MODE).replace(/\s/g, '');
      const mode = PAYMENT_MODES.get(rawMode) || null;
      if (paid > 0 && !mode) issues.push({ type: 'missing_payment_mode', source: source.key, sourceRow: paymentRow._source_row });
      const date = parseDate(paymentRow.DATE);
      if (paid > 0 && !date) issues.push({ type: 'invalid_payment_date', source: source.key, sourceRow: paymentRow._source_row });

      familyRows.forEach((row, index) => {
        const studentName = titleWords(row['Student Name']);
        const parentName = titleWords(row['Parent Name']);
        const age = Number.parseInt(row['Student Age'], 10);
        const phone = normalizePhone(row.PHONE || paymentRow.PHONE);
        const level = String(row.LEVEL || '').trim().toUpperCase();
        const noteParts = [`Parent/family: ${parentName}`, `Source: ${source.label}, row ${row._source_row}`];
        if (level) noteParts.push(`Original level: ${level}`);
        if (row.NOTES) noteParts.push(`Source note: ${row.NOTES}`);
        const paidCents = paidParts[index];
        const remainingCents = remainingParts[index];
        const discountCents = discountParts[index];
        children.push({
          source: source.key, sourceLabel: source.label, sourceRow: row._source_row,
          familyKey: key, studentName, parentName,
          fullName: `${studentName} ${parentName}`.replace(/\s+/g, ' ').trim(),
          phone, age: Number.isInteger(age) ? age : null, ageCategory: ageCategory(age),
          sessionType: source.sessionType, originalLevel: level || null,
          notes: noteParts.join(' | '),
          payment: paidCents > 0 ? {
            marker: `payment-tracking-2026:${source.key}:row-${row._source_row}`,
            paidCents, remainingCents, discountCents, mode, date,
          } : null,
        });
      });
    }
  }
  return { children, issues };
}

function candidateKeys(child) {
  return new Set([
    normalizeText(child.studentName), normalizeText(child.fullName),
    normalizeText(`${child.parentName} ${child.studentName}`),
  ]);
}

export function reconcile(prepared, existingStudents, existingReceipts = []) {
  const activeStudents = existingStudents.filter(student => !student.deleted_at);
  const receiptText = existingReceipts.map(receipt => String(receipt.observation || ''));
  const matches = [], newStudents = [], ambiguous = [];
  const annualMatchedIds = new Set();

  for (const child of prepared.children) {
    const keys = candidateKeys(child);
    const nameMatches = activeStudents.filter(student => keys.has(normalizeText(student.full_name)));
    const phoneMatches = child.phone
      ? activeStudents.filter(student => normalizePhone(student.telephone) === child.phone)
      : [];
    const combined = [...new Map([...nameMatches, ...phoneMatches].map(student => [student.id, student])).values()];
    let candidates = nameMatches;
    if (nameMatches.length === 1) candidates = nameMatches;
    else if (combined.length === 1 && nameMatches.length > 0) candidates = combined;
    else if (phoneMatches.length === 1 && nameMatches.length === 0 &&
      normalizeText(phoneMatches[0].full_name).includes(normalizeText(child.studentName))) candidates = phoneMatches;

    if (candidates.length === 1) {
      const student = candidates[0];
      matches.push({ child, student, receiptExists: child.payment ? receiptText.some(text => text.includes(child.payment.marker)) : false });
      if (child.source === 'annual') annualMatchedIds.add(student.id);
    } else if (candidates.length === 0) newStudents.push({ child });
    else ambiguous.push({ child, candidates: candidates.map(student => ({ id: student.id, full_name: student.full_name })) });
  }

  const moveToOther = activeStudents.filter(student => student.session_type === 'Yearly' && !annualMatchedIds.has(student.id));
  return { matches, newStudents, ambiguous, moveToOther, sourceIssues: prepared.issues };
}

export function receiptPayload(child, studentId) {
  if (!child.payment) return null;
  const { paidCents, remainingCents, discountCents, mode, date, marker } = child.payment;
  const totalCents = paidCents + remainingCents + discountCents;
  const discountPercent = totalCents ? Math.round((discountCents / totalCents) * 10000) / 100 : 0;
  return {
    student_id: studentId, date, nom_prenom: child.fullName, telephone: child.phone || null,
    categorie: child.ageCategory === 'Teens (13-17)' ? 'Ados' : child.ageCategory === 'Adults (18+)' ? 'Adultes' : 'Enfants',
    niveau: 'CECRL', type_cours: child.sessionType === 'Mise à niveau' ? 'Intensif' : 'Standard',
    session_type: child.sessionType, montant_total: totalCents / 100,
    remise: discountPercent, montant_paye: paidCents / 100,
    mode_paiement: mode, statut_paiement: remainingCents === 0 ? 'Soldé' : 'Acompte versé',
    observation: `${marker} | Family payment split across children | ${child.notes}`,
  };
}

export function studentPayload(child) {
  return {
    full_name: child.fullName, telephone: child.phone || null, age_category: child.ageCategory,
    session_type: child.sessionType, status: 'Enrolled', notes: child.notes,
  };
}

export function loadSource(path, key, label, sessionType) {
  return { key, label, sessionType, text: readFileSync(path, 'utf8') };
}
