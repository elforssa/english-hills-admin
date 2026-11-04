// EAP (plan enrollment-at-payment, migration 127): absence guard. The pre-enrollment
// (« Pré-inscription »), the enrollment trial (« Essai »), the 10 % deposit rule
// (« 10 % », « Acompte inférieur ») and every writer of a retired enrollment status
// (Submitted, Under Review, Trial, Rejected) are gone from src/. What remains is a
// closed allowlist: read-only label and colour maps, read filters that keep old rows
// visible, history texts and unrelated meanings of a word. Each entry names its file,
// the line it accepts and why. A new occurrence fails; an entry that no longer
// matches anything fails too, so the list never outlives the code.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? files(`${dir}/${e.name}`) : /\.(m?js|jsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []);

// What the guard looks for. A retired status counts only as a quoted literal; the
// texts count wherever they appear (code, comments, UI text).
const RULES = [
  { name: 'retired status', pattern: /['"`](Submitted|Under Review|Trial|Rejected)['"`]|\b(Submitted|Trial|Rejected|'Under Review'):\s/ },
  { name: 'Pré-inscription', pattern: /pr[ée][- ]?inscri/i },
  { name: 'Essai', pattern: /\bEssais?\b/ },
  { name: '10 %', pattern: /(^|[^\w.[-])10(\s|&nbsp;|\\u00a0|\u00a0)?%/ },
  { name: 'Acompte inférieur', pattern: /acomptes? inférieur/i },
];

// file → [[rule name, line pattern, reason], …]
const ALLOW = {
  'src/lib/statusColors.js': [
    ['retired status', /^\s*'?(Submitted|Under Review|Rejected|Trial)'?:/, 'read-only colour maps (enrollment and learner file): old rows keep their badge'],
  ],
  'src/lib/ui/presentation.mjs': [
    ['retired status', /export const (DOSSIER_LABELS|ENROLLMENT_LABELS) = /, 'read-only French label maps for old rows'],
    ['Essai', /export const (DOSSIER_LABELS|ENROLLMENT_LABELS) = |^\/\/ EAP: « Essai \(dossier\) » stays readable/, 'read-only French labels: « Essai » and « Essai (dossier) » on old rows'],
  ],
  'src/lib/financeCorrections.mjs': [
    ['retired status', /RETIRED_ENROLLMENT_STATUSES = /, 'the list the receipt form uses to hide retired rows (a read filter)'],
    ['Pré-inscription', /^\s*\/\/ The receipt form's enrollment candidates: a retired/, 'comment on that read filter'],
  ],
  'src/app/(admin)/assessments/page.jsx': [
    ['retired status', /filterAll\(\{ status: \['Validated', 'Trial'\] \}/, 'read: members of a group, old Trial rows included (plan: unchanged)'],
  ],
  'src/app/(admin)/teacher-portal/page.jsx': [
    ['retired status', /filterAll\(\{ status: \['Validated', 'Trial'\] \}/, 'read: members of a group, old Trial rows included (plan: unchanged)'],
  ],
  'src/app/(admin)/students/import/page.jsx': [
    ['retired status', /STATUSES = \[|'Trial'/, 'CSV import of old files: Trial rows are coerced to Prospect (plan D6, kept)'],
  ],
  // The learner-file status Trial (« Essai (dossier) ») stays readable on old files and
  // counts as active until the archive step resyncs them (plan D6, D7).
  'src/app/(admin)/dashboard/page.jsx': [['Essai', /^\s*\/\/ "Apprenants actifs": Inscrit and Essai/, 'comment: old Trial files still count as active']],
  'src/app/(admin)/dismissal/page.jsx': [['Essai', /^\s*\/\/ .*Inscrit or Essai\.$/, 'comment: old Trial files still count as active']],
  'src/components/reports/AcademicOperationsReport.jsx': [['Essai', /^\s*\/\/ Active learners: Inscrit and Essai/, 'comment: old Trial files still count as active']],
  'src/lib/enrollmentWorkflow.mjs': [
    ['Essai', /^\s*\/\/ /, 'comments on old Trial files (D3-A, AFU H4)'],
    ['retired status', /MEMBERSHIP_STATUSES = \['Validated', 'Trial'\]|ACTIVE_STUDENT_STATUSES = \['Enrolled', 'Trial'\]/, 'read: old Trial rows stay members until the archive step'],
    ['retired status', /!\['Ended', 'Rejected'\]\.includes/, 'read filter: closed rows are not open'],
  ],
  'src/app/(admin)/students-directory/page.jsx': [['retired status', /^\s*Trial: \{ bg:/, 'read-only colour of the old learner-file status']],
  // Read filters that leave closed (Rejected, Ended) rows out.
  'src/app/(admin)/groups/[id]/page.jsx': [['retired status', /!\['Rejected', 'Ended'\]\.includes\(e\.status\)/, 'read filter: closed rows are not members']],
  'src/components/receipts/ReceiptForm.jsx': [['retired status', /!\['Rejected', 'Ended'\]\.includes\(row\.status\)/, 'read filter: a closed CRM row is not a live enrollment']],
  'src/lib/receiptGroupChoices.mjs': [['retired status', /\.neq\('status', 'Rejected'\)/, 'read: seat count excludes refused rows, as the server does']],
  // Refusal texts that name what was retired.
  'src/lib/academic/membershipActions.mjs': [['Pré-inscription', /^\s*(status_retired|archived_not_reopenable): '/, 'French refusal text of eap.status_retired / eap.archived_not_reopenable']],
  // The guide names the retired statuses once, as history (plan D6: « described as historical »).
  'src/app/(admin)/helpdesk/GuideContent.jsx': [
    ['Essai', /^<p>Anciens statuts retirés, encore visibles sur d’anciennes fiches/, 'status reference: the retired statuses, historical'],
    ['Essai', /^<td>Essai \(ancien statut retiré\)<\/td>$/, 'glossary: Trial, historical'],
  ],
  // CRM: read-only labels of old rows and the historical lead-panel row.
  'src/lib/crm/enrollment.mjs': [
    ['retired status', /^\s*(Submitted|'Under Review'|Trial|Rejected): '/, 'read-only label map: old rows keep their French label'],
    ['Pré-inscription', /^\s*Submitted: 'Pré-inscription créée/, 'read-only label of an old Submitted row'],
    ['Essai', /^\s*Trial: 'Essai en cours'/, 'read-only label of an old Trial row'],
    ['retired status', /CLOSED_ENROLLMENT_STATUSES = \['Rejected', 'Ended'\]/, 'read filter: closed rows'],
  ],
  'src/lib/crm/enrollmentActions.mjs': [
    ['retired status', /const PRE_CONFIRMATION = \['Submitted', 'Under Review', 'Trial'\]/, 'read: an old pre-confirmation row shows the historical row 3'],
    ['Pré-inscription', /ARCHIVED_PRE_ENROLLMENT_NOTE = 'Ancienne pré-inscription archivée|^\s*\/\/ rows 3–5 \(a pre-inscription or essai/, 'history note of row 3 and its comment'],
    ['retired status', /if \(enrollment\.status === 'Rejected'\) return \{ row: 6/, 'read: an old Rejected row (row 6)'],
  ],
  // Unrelated meanings.
  'src/components/crm/LifecycleOperations.jsx': [['Essai', /'Essais'/, 'Meta lifecycle deliveries: « Essais » counts delivery attempts']],
  'src/app/(admin)/online/[id]/page.jsx': [
    ['Essai', /kind === 'trial' \? 'Essai'|<option value="trial">Essai/, 'online classes: a trial guest invitation, not an enrollment'],
  ],
};

const hits = [];
const used = new Set();
for (const file of files('src')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (!rule.pattern.test(line)) continue;
      const entry = (ALLOW[file] || []).find(([name, pattern]) => name === rule.name && pattern.test(line));
      if (entry) { used.add(entry); continue; }
      hits.push(`${file}:${index + 1} [${rule.name}] ${line.trim().slice(0, 140)}`);
    }
  });
}
assert.deepEqual(hits, [], `retired pre-enrollment, trial or 10 % text or writer found in src/:\n${hits.join('\n')}`);
const stale = Object.entries(ALLOW).flatMap(([file, entries]) => entries.filter(entry => !used.has(entry))
  .map(([name, pattern]) => `${file} [${name}] ${pattern}`));
assert.deepEqual(stale, [], `allowlist entries that match nothing (remove them):\n${stale.join('\n')}`);

// The retired screens and helpers are gone.
for (const path of ['src/app/(admin)/enrollments', 'src/lib/publicInscription.mjs']) assert.ok(!existsSync(path), `${path} must be deleted`);
const route = readFileSync('src/app/api/public/inscription/route.js', 'utf8');
assert.match(route, /410/, 'the public registration route answers 410 Gone');
assert.doesNotMatch(route, /create_public_registration/, 'the public route no longer calls the retired function');
const actions = readFileSync('src/lib/academic/membershipActions.mjs', 'utf8');
assert.doesNotMatch(actions, /export (async )?function createEnrollment\b|'create_enrollment'/, 'createEnrollment is deleted');
assert.doesNotMatch(actions, /ENROLLMENT_EDIT_FIELDS = \[[^\]]*'status'/, 'the enrollment status is never edited');
for (const file of files('src')) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /rpc\(\s*'crm_start_enrollment'/, `${file}: the CRM enrolls through crm_enroll_and_collect`);
  assert.doesNotMatch(text, /rpc\(\s*'(create_enrollment|create_public_registration|portal_request_reenrollment)'/, `${file}: retired command called`);
  assert.doesNotMatch(text, /\binitial_status\b/, `${file}: the client never chooses the initial status`);
  assert.doesNotMatch(text, /enrollment_confirmation_pending|pending_confirmation/, `${file}: the 10 % pending confirmation is gone`);
  assert.doesNotMatch(text, /href=["'{`]+\/enrollments\b|'\/enrollments'/, `${file}: /enrollments is gone`);
}
console.log(`PASS enrollment at payment absence guard (${Object.values(ALLOW).flat().length} allowlisted read-only uses)`);
