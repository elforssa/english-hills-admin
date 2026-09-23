'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { money } from '@/lib/receiptFinance';

export default function DeleteMistakenReceipt() {
  const { id } = useParams();
  const { role } = useAuth();
  const router = useRouter();
  const cache = useQueryClient();
  const requestKey = useRef(null);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (role !== 'director') return;
    let active = true;
    async function load() {
      try {
        const sb = getBrowserClient();
        const receiptResult = await sb.from('receipts').select('*').eq('id', id).single();
        if (receiptResult.error) throw receiptResult.error;
        const receipt = receiptResult.data;
        let charge = null;
        let otherPayments = 0;
        if (receipt.charge_id) {
          const [chargeResult, paymentsResult] = await Promise.all([
            sb.from('charge_balances').select('*').eq('id', receipt.charge_id).single(),
            sb.from('receipts').select('id', { count: 'exact', head: true }).eq('charge_id', receipt.charge_id)
              .neq('id', id).is('voided_at', null).is('deleted_at', null),
          ]);
          if (chargeResult.error || paymentsResult.error || paymentsResult.count === null) throw new Error('Chargement incomplet');
          charge = chargeResult.data;
          otherPayments = paymentsResult.count;
        }
        if (active) setRecord({ receipt, charge, otherPayments });
      } catch { if (active) setError('Impossible de vérifier ce reçu. Rechargez la page avant de réessayer.'); }
    }
    load();
    return () => { active = false; };
  }, [id, role]);

  async function remove() {
    if (saving || !record || record.otherPayments || reason.trim().length < 3) return;
    if (!window.confirm(`Supprimer le reçu ${record.receipt.receipt_number} créé par erreur et annuler son montant dû ? Cette action ne rembourse pas d’argent.`)) return;
    setSaving(true);
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const { error: deletionError } = await getBrowserClient().rpc('delete_mistaken_receipt', {
        p_receipt_id: id, p_reason: reason.trim(), p_idempotency_key: requestKey.current,
      });
      if (deletionError) throw deletionError;
      await cache.invalidateQueries();
      toast.success('Reçu supprimé. Le paiement et le montant dû associé sont exclus des totaux.');
      router.push(record.receipt.student_id ? `/students/${record.receipt.student_id}` : '/receipts');
      router.refresh();
    } catch (failure) {
      toast.error(failure.message || 'Suppression non confirmée. Réessayez avec le même formulaire.');
    } finally { setSaving(false); }
  }

  if (role !== 'director') return <p className="p-8 text-sm text-muted-foreground">Suppression réservée au directeur.</p>;
  return <div className="mx-auto max-w-2xl space-y-5 p-4 lg:p-8">
    <Link href={`/receipts/${id}/print`} className="inline-flex min-h-10 items-center text-sm text-primary hover:underline">← Retour au reçu</Link>
    <section className="space-y-5 rounded-xl border bg-card p-6">
      <div><h1 className="text-xl font-bold">Supprimer un reçu créé par erreur</h1><p className="mt-2 text-sm text-muted-foreground">Le reçu et son montant dû seront retirés des comptes actifs. Cette action ne rembourse pas d’argent et ne modifie pas l’inscription.</p></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : !record ? <p role="status">Vérification du reçu…</p> : <>
        <div><p className="font-semibold">{record.receipt.receipt_number} · {record.receipt.nom_prenom}</p><p className="text-sm text-muted-foreground">{record.charge?.service_description || record.receipt.service_description || 'Reçu historique'}</p></div>
        {record.otherPayments > 0 ? <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p>Cet engagement comporte {record.otherPayments} autre(s) paiement(s) actif(s). La suppression est bloquée pour les préserver.</p><Link href={`/receipts/${id}/edit`} className="inline-flex min-h-10 items-center font-semibold text-primary underline">Corriger uniquement le paiement</Link></div> : <>
          <dl className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
            <div className="flex justify-between gap-3"><dt>À retirer des encaissements</dt><dd className="font-semibold">{money(record.receipt.voided_at ? 0 : record.receipt.montant_paye)} MAD</dd></div>
            <div className="flex justify-between gap-3"><dt>À retirer du solde restant</dt><dd className="font-semibold">{money(record.charge?.voided_at ? 0 : record.charge?.balance)} MAD</dd></div>
          </dl>
          {record.receipt.voided_at && <p className="text-sm">Le paiement est déjà annulé : il ne sera pas déduit une deuxième fois. Le montant dû associé sera annulé.</p>}
          <p className="text-sm text-muted-foreground">Les autres engagements et paiements sont conservés. Le directeur pourra consulter le numéro du reçu, la date, l’auteur et le motif dans l’historique des suppressions.</p>
          <div><label htmlFor="deletion-reason" className="mb-2 block text-sm font-semibold">Motif de suppression</label><textarea id="deletion-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} className="min-h-24 w-full rounded-lg border bg-background p-3 text-sm" placeholder="Ex. reçu créé par erreur, remplacé par le reçu correct…" /></div>
          <button onClick={remove} disabled={saving || reason.trim().length < 3} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"><Trash2 size={16} />{saving ? 'Suppression…' : 'Supprimer le reçu et annuler le montant dû'}</button>
        </>}
      </>}
    </section>
  </div>;
}
