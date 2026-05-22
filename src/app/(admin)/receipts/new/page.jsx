'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { entities, auth } from '@/lib/entities';
import { toast } from 'sonner';
import ReceiptForm from '@/components/receipts/ReceiptForm';
import { ArrowLeft } from 'lucide-react';

export default function ReceiptNew() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);

  const prefill = {
    student_id: searchParams.get('student_id') || '',
    nom_prenom: searchParams.get('student_name') || '',
  };

  const handleSubmit = async (data) => {
    setSaving(true);
    try {
      const receipt = await entities.Receipt.create(data);
      toast.success('Reçu enregistré avec succès');
      router.push(`/receipts/${receipt.id}/print`);
    } catch {
      // entities.js already toasted — stay on the form so the user can retry.
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button onClick={() => router.push('/finance')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft size={15} /> Retour
      </button>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-foreground">Nouveau reçu de paiement</h1>
        <p className="text-muted-foreground text-sm mt-1">Remplissez les informations pour générer un reçu imprimable.</p>
      </div>
      <ReceiptForm onSubmit={handleSubmit} onCancel={() => router.push('/finance')} saving={saving} initialData={prefill} />
    </div>
  );
}
