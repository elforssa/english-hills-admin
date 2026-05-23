'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { entities } from '@/lib/entities';
import ReceiptForm from '@/components/receipts/ReceiptForm';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function ReceiptEdit() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    entities.Receipt.filter({ id }).then((data) => {
      setReceipt(data[0] || null);
      setLoading(false);
    });
  }, [id]);

  const handleSubmit = async (formData) => {
    setSaving(true);
    try {
      await entities.Receipt.update(id, formData);
      toast.success('Reçu mis à jour');
      router.push(`/receipts/${id}/print`);
    } catch (err) {
      toast.error('Erreur lors de la mise à jour : ' + (err.message || 'Veuillez réessayer.'));
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement...</div>;
  if (!receipt) return <div className="p-8 text-center text-muted-foreground">Reçu introuvable.</div>;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push(`/receipts/${id}/print`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} /> Retour
        </button>
        <h1 className="text-2xl font-bold">Modifier le reçu</h1>
      </div>
      <ReceiptForm
        initialData={receipt}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/receipts/${id}/print`)}
        saving={saving}
      />
    </div>
  );
}
