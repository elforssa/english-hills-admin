'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { receiptAmounts, money } from '@/lib/receiptFinance';
import { toast } from 'sonner';
import { ArrowLeft, Ban, ShieldCheck } from 'lucide-react';

export default function ReceiptCorrection() {
  const { id } = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const [receipt, setReceipt] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { getBrowserClient().from('receipts').select('*').eq('id', id).single().then(({ data }) => setReceipt(data)); }, [id]);

  const voidReceipt = async () => {
    if (reason.trim().length < 3) return toast.error('Indiquez le motif de correction.');
    if (!confirm('Annuler ce paiement ? Le reçu original restera visible et le solde sera recalculé.')) return;
    setSaving(true);
    const { data, error } = await getBrowserClient().rpc('void_financial_receipt', {
      p_receipt_id: id, p_reason: reason.trim(), p_idempotency_key: crypto.randomUUID(),
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(data.already_voided ? 'Ce reçu était déjà annulé.' : 'Paiement annulé. La trace originale est conservée.');
    router.push(`/receipts/${id}/print`);
  };

  if (!receipt) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  const amounts = receiptAmounts(receipt);
  return <div className="mx-auto max-w-2xl p-4 lg:p-8">
    <Link href={`/receipts/${id}/print`} className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={15} /> Retour au reçu</Link>
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-700"><ShieldCheck size={22} /></span><div><h1 className="text-xl font-black">Correction contrôlée</h1><p className="mt-1 text-sm text-muted-foreground">Un reçu émis est immuable. Une correction annule le paiement avec une trace d’audit, puis permet de saisir un paiement de remplacement.</p></div></div>
      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-muted/50 p-4 text-sm"><div><dt className="text-muted-foreground">Reçu</dt><dd className="font-bold">{receipt.receipt_number}</dd></div><div><dt className="text-muted-foreground">Apprenant</dt><dd className="font-bold">{receipt.nom_prenom}</dd></div><div><dt className="text-muted-foreground">Paiement</dt><dd className="font-bold">{money(amounts.payment)} MAD</dd></div><div><dt className="text-muted-foreground">Service</dt><dd className="font-bold">{receipt.service_description || 'Historique'}</dd></div></dl>
      {receipt.voided_at ? <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Déjà annulé</b><p>{receipt.void_reason}</p></div> : role !== 'director' ? <p className="mt-5 rounded-xl bg-muted p-4 text-sm">Seul un directeur peut annuler ou corriger un paiement émis.</p> : <div className="mt-5"><label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Motif obligatoire</label><textarea className="min-h-24 w-full rounded-xl border p-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex. montant saisi par erreur…" /><button onClick={voidReceipt} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white"><Ban size={16} /> {saving ? 'Annulation…' : 'Annuler ce paiement'}</button></div>}
      {receipt.voided_at && receipt.charge_id && <Link href={`/receipts/new?student_id=${receipt.student_id}&charge_id=${receipt.charge_id}`} className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Saisir le paiement corrigé</Link>}
    </div>
  </div>;
}
