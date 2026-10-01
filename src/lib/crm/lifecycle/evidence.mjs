import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact = (answers, key, accepted) => {
  const matches = answers.filter(answer => answer?.key === key);
  if (matches.length !== 1) return { ok: false, ambiguous: matches.length > 1 };
  return { ok: accepted.some(value => JSON.stringify(value) === JSON.stringify(matches[0].value)), ambiguous: false };
};

export function evaluateLifecycleEvidence(candidate) {
  const answers = Array.isArray(candidate?.answers) ? [...candidate.answers].sort((a, b) =>
    String(a?.key || '').localeCompare(String(b?.key || '')) || JSON.stringify(a).localeCompare(JSON.stringify(b))) : [];
  const configured = candidate.adult_field_key || candidate.sharing_field_key || candidate.notice_field_key;
  if (!configured) return { eligible: false, reason: 'adult_missing', evidence_state: 'missing', digest: digest([]) };
  const adult = exact(answers, candidate.adult_field_key, candidate.adult_accepted_values || []);
  if (candidate.adult_field_key && !adult.ok) return { eligible: false, reason: adult.ambiguous ? 'adult_ambiguous' : 'adult_missing', digest: digest(answers) };
  const sharing = exact(answers, candidate.sharing_field_key, candidate.sharing_accepted_values || []);
  if (candidate.sharing_field_key && !sharing.ok) return { eligible: false, reason: sharing.ambiguous ? 'sharing_ambiguous' : 'sharing_missing', digest: digest(answers) };
  if (candidate.notice_field_key) {
    const notice = exact(answers, candidate.notice_field_key, candidate.notice_accepted_values || []);
    if (!notice.ok) return { eligible: false, reason: 'notice_mismatch', digest: digest(answers) };
  }
  return { eligible: true, reason: 'eligible', digest: digest(answers) };
}

export async function processLifecycleEvidence({ rpc, limit = 25, requirement = 'required' }) {
  const candidates = await rpc('crm_claim_lifecycle_evidence', { p_limit: limit, ...(requirement === 'advisory' ? { p_requirement: 'advisory' } : {}) });
  let granted = 0;
  let denied = 0;
  for (const candidate of candidates) {
    const decision = evaluateLifecycleEvidence(candidate);
    const result = await rpc('crm_record_lifecycle_evidence_check', {
      p_submission: candidate.submission_id,
      p_policy: candidate.policy_id,
      p_eligible: decision.eligible,
      p_reason: decision.reason,
      p_digest: decision.digest,
    });
    if (result?.eligible) granted += 1;
    else denied += 1;
  }
  return { evaluated: candidates.length, granted, denied };
}
