'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ban, ShieldCheck, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { money } from '@/lib/receiptFinance';

export default function ChargeCorrection() {
  const { id } = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const idempotencyKey = useRef(null);
  if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
  const [charge, setCharge] = useState(null);
  const [activePayments, setActivePayments] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sb = getBrowserClient();
    Promise.all([
      sb.from('charge_balances').select('*').eq('id', id).single(),
      sb.from('receipts').select('id,receipt_number,montant_paye').eq('charge_id', id)
        .is('voided_at', null).is('deleted_at', null),
    ]).then(([chargeResult, receiptResult]) => {
      setCharge(chargeResult.data || null);
      setActivePayments(receiptResult.data || []);
    });
  }, [id]);

  const voidCharge = async () => {
    if (reason.trim().length < 3) return toast.error('Indiquez le motif de correction.');
    if (!confirm('Annuler cet engagement ? Il restera visible dans la piste d’audit.')) return;
    setSaving(true);
    const { data, error } = await getBrowserClient().rpc('void_financial_charge', {
      p_charge_id: id,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey.current,
    });
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    toast.success(data.already_voided ? 'Cet engagement était déjà annulé.' : 'Engagement annulé avec sa trace de correction.');
    router.push('/finance');
  };

  if (!charge) return <div className="p-8 text-sm text-muted-foreground">Chargement de l’engagement…</div>;
  return <div className="mx-auto max-w-2xl p-4 lg:p-8">
    <Link href="/finance" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={15} /> Retour aux finances</Link>
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-700"><ShieldCheck size={22} /></span><div><h1 className="text-xl font-black">Correction d’un engagement</h1><p className="mt-1 text-sm text-muted-foreground">L’annulation conserve l’engagement et ajoute un événement financier horodaté.</p></div></div>
      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-muted/50 p-4 text-sm"><div><dt className="text-muted-foreground">Session</dt><dd className="font-bold">{charge.session_type}</dd></div><div><dt className="text-muted-foreground">Service</dt><dd className="font-bold">{charge.service_description}</dd></div><div><dt className="text-muted-foreground">Prix net</dt><dd className="font-bold">{money(charge.net_amount)} MAD</dd></div><div><dt className="text-muted-foreground">Solde actuel</dt><dd className="font-bold">{money(charge.balance)} MAD</dd></div></dl>
      {charge.voided_at ? <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Déjà annulé</b><p>{charge.void_reason}</p></div> : role !== 'director' ? <p className="mt-5 rounded-xl bg-muted p-4 text-sm">Seul un directeur peut annuler un engagement.</p> : activePayments.length > 0 ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Annulez d’abord les paiements actifs</b><p className="mt-1">{activePayments.length} reçu(s) actif(s) sont liés à cet engagement. Corrigez-les individuellement avant d’annuler l’engagement.</p><div className="mt-3 flex flex-wrap gap-2">{activePayments.map((receipt) => <Link key={receipt.id} href={`/receipts/${receipt.id}/edit`} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold">Corriger {receipt.receipt_number}</Link>)}</div></div> : <div className="mt-5"><label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Motif obligatoire</label><textarea className="min-h-24 w-full rounded-xl border p-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex. tarif ou apprenant saisi par erreur…" /><button onClick={voidCharge} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Ban size={16} /> {saving ? 'Annulation…' : 'Annuler cet engagement'}</button></div>}
      {charge.voided_at && <Link href="/receipts/new" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Créer l’engagement corrigé</Link>}
    </div>
  </div>;
}
