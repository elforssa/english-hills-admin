'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { money } from '@/lib/receiptFinance';

export default function ReceiptDeletions() {
  const { role } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (role !== 'director') return;
    let active = true;
    setLoading(true); setError(false);
    getBrowserClient().from('financial_events').select('*', { count: 'exact' })
      .eq('event_type', 'payment_voided').contains('metadata', { action: 'delete_mistaken_receipt' })
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(page * 25, page * 25 + 24).then(({ data, count, error: queryError }) => {
        if (!active) return;
        setRows(data || []); setTotal(count || 0); setError(Boolean(queryError)); setLoading(false);
      }).catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [page, role]);
  if (role !== 'director') return <p className="p-8 text-sm">Historique réservé au directeur.</p>;
  return <div className="mx-auto max-w-4xl space-y-5 p-4 lg:p-8">
    <Link href="/receipts" className="inline-flex min-h-10 items-center text-sm text-primary">← Reçus</Link>
    <div><h1 className="text-xl font-bold">Historique des suppressions</h1><p className="mt-2 text-sm text-muted-foreground">Ces reçus sont exclus des encaissements. Leurs montants dus associés sont annulés.</p></div>
    {loading ? <p role="status">Chargement…</p> : error ? <p role="alert">Impossible de charger l’historique. Rechargez la page.</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucune suppression enregistrée.</p> : rows.map((event) => <article key={event.id} className="space-y-2 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><b>{event.metadata.receipt_number || event.receipt_id}</b><time>{new Date(event.created_at).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}</time></div>
      <p className="whitespace-pre-wrap break-words">{event.metadata.reason}</p>
      <p>Montant du reçu : {money(event.metadata.amount)} MAD · Retiré des encaissements : {money(event.metadata.removed_from_collected)} MAD</p>
      <p className="break-all text-xs text-muted-foreground">Identifiant du directeur : {event.actor_id}</p>
    </article>)}
    <div className="flex items-center gap-4 text-sm"><button disabled={loading || page === 0} onClick={() => setPage(page - 1)} className="min-h-10 rounded border px-3 disabled:opacity-40">Précédent</button><span>Page {page + 1}</span><button disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(page + 1)} className="min-h-10 rounded border px-3 disabled:opacity-40">Suivant</button></div>
  </div>;
}
