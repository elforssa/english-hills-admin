// Display labels for online lessons: first given-name token plus the initial of the
// last token, never more (plan OL-r4 D5). This mirrors online_security.base_label in
// migration 117; scripts/test-online-learning.sql asserts the same cases in SQL.
const RUN = /[ \t\n\r\f\v]+/g;

export function baseLabel(fullName) {
  const parts = String(fullName ?? '').replace(RUN, ' ').replace(/^ +| +$/g, '').split(' ');
  if (!parts[0]) return 'Participant';
  const first = Array.from(parts[0]).slice(0, 30);
  const head = first[0].toUpperCase() + first.slice(1).join('');
  if (parts.length === 1) return head;
  return `${head} ${Array.from(parts[parts.length - 1])[0].toUpperCase()}.`;
}

// Equal labels inside one course get " 2", " 3"… in learner-id order.
export function courseLabels(members) {
  const byLabel = new Map();
  for (const member of [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const label = baseLabel(member.fullName);
    byLabel.set(label, [...(byLabel.get(label) || []), member.id]);
  }
  const result = new Map();
  for (const [label, ids] of byLabel) ids.forEach((id, index) => result.set(id, index ? `${label} ${index + 1}` : label));
  return result;
}

// The last guard before the provider: printable text only, bounded length.
export function providerDisplayName(label) {
  const text = String(label ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(RUN, ' ').trim();
  return Array.from(text).slice(0, 40).join('') || 'Participant';
}
