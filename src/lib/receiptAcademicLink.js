'use client';

import { entities } from '@/lib/entities';

const REUSABLE_STATUSES = ['Validated', 'Trial', 'Submitted', 'Under Review'];

// Completes the desk workflow after the receipt itself is safely stored.
// If the follow-up fails, the receipt remains group-linked and can be repaired
// from its edit page without losing the payment record.
export async function completeReceiptAcademicLink(receiptId, receiptData) {
  if (!receiptId || !receiptData.student_id || !receiptData.group_id) return null;

  let enrollment = null;
  if (receiptData.enrollment_id) {
    [enrollment] = await entities.Enrollment.filter({ id: receiptData.enrollment_id });
  }

  if (!enrollment) {
    const matches = await entities.Enrollment.filter({
      student_id: receiptData.student_id,
      group_id: receiptData.group_id,
    }, '-created_date');
    enrollment = matches.find((item) => REUSABLE_STATUSES.includes(item.status)) || null;
  }

  if (!enrollment) {
    enrollment = await entities.Enrollment.create({
      student_id: receiptData.student_id,
      group_id: receiptData.group_id,
      status: 'Validated',
      date_inscription: receiptData.date || new Date().toISOString().slice(0, 10),
      notes: 'Créée automatiquement depuis un reçu de paiement.',
    });
  } else if (['Submitted', 'Under Review'].includes(enrollment.status)) {
    enrollment = await entities.Enrollment.update(enrollment.id, { status: 'Validated' });
  }

  await entities.Receipt.update(receiptId, {
    group_id: receiptData.group_id,
    enrollment_id: enrollment.id,
  });

  await entities.Student.update(receiptData.student_id, {
    groupe_id: receiptData.group_id,
    ...(receiptData.session_type ? { session_type: receiptData.session_type } : {}),
    ...(receiptData.niveau ? { niveau_cefr: receiptData.niveau } : {}),
  });

  return enrollment;
}
