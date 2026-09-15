'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getBrowserClient } from '@/lib/supabase';
import { toast } from 'sonner';
import ReceiptForm from '@/components/receipts/ReceiptForm';
import { ArrowLeft } from 'lucide-react';

export default function ReceiptNew() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (payload) => {
    setSaving(true);
    const { data, error } = await getBrowserClient().rpc('create_charge_payment', { p_payload: payload });
    if (error) {
      const idempotencyConflict = error.message?.includes('Idempotency key conflict');
      toast.error(idempotencyConflict
        ? 'Cette tentative ne correspond plus à la demande déjà enregistrée. Rechargez la page avant toute nouvelle saisie afin d’éviter un double paiement.'
        : (error.message || 'Impossible d’enregistrer le paiement.'));
      setSaving(false);
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['Receipt'] }),
      queryClient.invalidateQueries({ queryKey: ['Student'] }),
      queryClient.invalidateQueries({ queryKey: ['Charge'] }),
    ]);
    if (!data.receipt_id) {
      toast.success('Solde à payer enregistré. Aucun reçu émis.');
      router.push('/finance');
      return;
    }
    toast.success(data.replayed ? 'Paiement déjà enregistré — reçu existant affiché.' : 'Paiement enregistré et reçu émis.');
    router.push(`/receipts/${data.receipt_id}/print`);
  };

  return <div className="mx-auto max-w-4xl p-4 lg:p-8">
    <button onClick={() => router.push('/finance')} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={15} /> Retour aux finances</button>
    <div className="mb-7"><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Réception</p><h1 className="mt-1 text-2xl font-black tracking-tight">Encaisser un paiement</h1><p className="mt-1 text-sm text-muted-foreground">Apprenant → service ou solde → paiement → reçu imprimable.</p></div>
    <ReceiptForm onSubmit={handleSubmit} onCancel={() => router.push('/finance')} saving={saving} initialData={{ student_id: searchParams.get('student_id') || '', charge_id: searchParams.get('charge_id') || '' }} />
  </div>;
}
