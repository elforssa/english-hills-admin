'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getBrowserClient } from '@/lib/supabase';
import { toast } from 'sonner';
import ReceiptForm from '@/components/receipts/ReceiptForm';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { paymentErrorMessage } from '@/lib/receiptPresentation';
import { clearPendingPayment } from '@/lib/receiptDraftKey.mjs';
import { paymentResultMessage } from '@/lib/financeCorrections.mjs';
import { invalidateAfterFinance, invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';
import { membershipErrorMessage, placeLearnerInGroup } from '@/lib/academic/membershipActions.mjs';

export default function ReceiptNew() {
  const { role } = useAuth();
  const returnPath = role === 'receptionist' ? '/receipts' : '/finance';
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // D3 (EAP): the group is a second command after the payment, on fresh versions of the
  // learner and of the enrollment the payment just changed; a refusal never undoes it.
  const placeAfterPayment = async (client, enrollmentId, groupId) => {
    try {
      const { data: enrollment, error: enrollmentError } = await client.from('enrollments')
        .select('id,updated_at,student_id,group_id').eq('id', enrollmentId).single();
      if (enrollmentError) throw enrollmentError;
      // A replayed payment whose first response was lost may already be placed.
      if (enrollment.group_id === groupId) return { placed: true };
      if (enrollment.group_id) return {};
      const { data: student, error: studentError } = await client.from('students')
        .select('id,updated_at').eq('id', enrollment.student_id).single();
      if (studentError) throw studentError;
      const { error } = await placeLearnerInGroup(client, { student, group: groupId, enrollment });
      if (error) return { placementError: membershipErrorMessage(error) };
      await invalidateAfterLearnerSave(queryClient);
      return { placed: true };
    } catch (readError) {
      return { placementError: membershipErrorMessage(readError) };
    }
  };

  const handleSubmit = async (payload, { groupId = '' } = {}) => {
    setSaving(true);
    const client = getBrowserClient();
    const { data, error } = await client.rpc('create_charge_payment', { p_payload: payload });
    if (error) {
      toast.error(paymentErrorMessage(error));
      setSaving(false);
      return;
    }
    clearPendingPayment();
    // A replay keeps the chosen group: placed now if the lost first response never got to it.
    const placement = groupId && data.enrollment_id
      ? await placeAfterPayment(client, data.enrollment_id, groupId) : {};
    await Promise.all([
      invalidateAfterFinance(queryClient),
    ]);
    const message = paymentResultMessage(data, placement);
    if (placement.placementError) toast.warning(message);
    else toast.success(message);
    router.push(data.receipt_id ? `/receipts/${data.receipt_id}/print` : returnPath);
  };

  return <div className="mx-auto max-w-4xl p-4 lg:p-8">
    <button onClick={() => router.push(returnPath)} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={15} /> Retour aux reçus</button>
    <div className="mb-7"><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Réception</p><h1 className="mt-1 text-2xl font-black tracking-tight">Encaisser un paiement</h1><p className="mt-1 text-sm text-muted-foreground">Apprenant → solde existant ou nouvelle session → paiement → reçu.</p></div>
    <ReceiptForm onSubmit={handleSubmit} onCancel={() => router.push(returnPath)} saving={saving} initialData={{ student_id: searchParams.get('student_id') || '', charge_id: searchParams.get('charge_id') || '' }} />
  </div>;
}
