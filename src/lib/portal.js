// =============================================================================
// portal — wrappers for the portal readiness functions (plan PRF-r2, ADR-011).
//
// Teachers, parents and students no longer read learner, enrollment, receipt,
// charge, placement, attendance or certificate rows directly: these RPCs return
// fixed projections. Family access comes from staff-approved links, and portal
// messages go to opaque recipient keys, never to addresses.
// =============================================================================

'use client';

import { getBrowserClient } from './supabase';
import { isRecordConflict, recordConflictMessage } from './conflictErrors.mjs';

async function rpc(name, args) {
  const { data, error } = await getBrowserClient().rpc(name, args);
  if (error) throw error;
  return data;
}

// French text for a portal refusal: the server message is already French for
// closed portal.* hints; a conflict gets the shared reload guidance.
export function portalErrorMessage(error, fallback = 'Action impossible. Réessayez.') {
  if (isRecordConflict(error) && !String(error?.hint || '').startsWith('portal.')) return recordConflictMessage();
  if (String(error?.hint || '').startsWith('portal.') && error?.message) return error.message;
  return fallback;
}

// ── Teacher class list ──────────────────────────────────────────────────────
export async function getTeacherRoster(groupId = null) {
  return (await rpc('portal_teacher_roster', { p_group_id: groupId })) || [];
}

// Roster rows shaped as learner and membership rows, so the shared membership
// helpers (groupMemberIds, studentGroupIds) work unchanged on teacher pages.
export function rosterToAcademicRows(rows) {
  const students = new Map();
  const enrollments = [];
  for (const row of rows || []) {
    if (!students.has(row.student_id)) {
      students.set(row.student_id, {
        id: row.student_id, full_name: row.full_name, photo_url: row.photo_url,
        niveau_cefr: row.niveau_cefr, age_category: row.age_category,
        session_type: row.session_type, status: row.status,
      });
    }
    enrollments.push({ student_id: row.student_id, group_id: row.group_id, status: row.enrollment_status });
  }
  return { students: [...students.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')), enrollments };
}

export async function loadTeacherAcademicRows() {
  return rosterToAcademicRows(await getTeacherRoster());
}

// ── Family portal ──────────────────────────────────────────────────────────
export async function getMyLearners() {
  return ((await rpc('portal_my_learners')) || []).map(row => ({ ...row, id: row.student_id }));
}

export async function getLearnerRecord(studentId) {
  return rpc('portal_learner_record', { p_student_id: studentId });
}

export async function requestReenrollment(studentId) {
  return rpc('portal_request_reenrollment', { p_student_id: studentId });
}

// ── Portal messaging ───────────────────────────────────────────────────────
export async function getMessageRecipients() {
  return (await rpc('portal_message_recipients')) || [];
}

export async function getMyMessages(box, before = null) {
  return (await rpc('portal_my_messages', { p_box: box, p_before: before })) || [];
}

export async function sendPortalMessage({ recipientKey = null, subject, body, replyToId = null, studentId = null }) {
  return (await rpc('portal_send_message', {
    p_recipient_key: recipientKey, p_subject: subject, p_body: body,
    p_reply_to_id: replyToId, p_student_id: studentId,
  })) || [];
}

// ── Staff: family links and invitations ───────────────────────────────────
export async function previewFamilyInvitation(email, role) {
  return rpc('preview_family_invitation', { p_email: email, p_role: role });
}

export async function listFamilyLinks(studentId) {
  return (await rpc('list_family_links', { p_student_id: studentId })) || [];
}

export async function revokeFamilyLink(linkId, reason) {
  return rpc('revoke_family_link', { p_link_id: linkId, p_reason: reason });
}

// D8: a notice about a learner goes to the linked accounts — the parents of a
// child, the learner's own account for an adult or teen — one row per account.
// Without a linked account it goes to the dossier address as e-mail only; that
// row has no recipient account and never appears in a portal.
export async function learnerNoticeTargets(student) {
  const child = student?.age_category === 'Young Learners (6-12)';
  const links = (await listFamilyLinks(student.id))
    .filter(link => link.status === 'active' && link.relation === (child ? 'parent' : 'self'));
  if (links.length > 0) {
    return { emailOnly: false, targets: links.map(link => ({ email: link.account_email, name: link.account_name || student.full_name })) };
  }
  const email = child ? student.parent_email : student.email;
  return { emailOnly: true, targets: email ? [{ email, name: child ? `Parent de ${student.full_name}` : student.full_name }] : [] };
}
