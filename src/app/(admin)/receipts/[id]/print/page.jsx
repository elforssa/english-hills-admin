'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { downloadReceiptPDF } from '@/lib/receiptPdf';
import { money, receiptAmounts, receiptStatus } from '@/lib/receiptFinance';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Download, Edit, Printer } from 'lucide-react';

export default function ReceiptPrint() {
  const { id } = useParams(); const router = useRouter(); const { role } = useAuth();
  const [receipt, setReceipt] = useState(null);
  useEffect(() => { getBrowserClient().from('receipts').select('*').eq('id', id).single().then(({ data }) => setReceipt(data)); }, [id]);
  if (!receipt) return <div className="p-8 text-sm text-muted-foreground">Chargement du reçu…</div>;
  const amounts = receiptAmounts(receipt); const status = receiptStatus(receipt);
  return <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0 lg:p-8">
    <div className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden"><button onClick={() => router.push('/receipts')} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={15} /> Tous les reçus</button><div className="flex gap-2">{role === 'director' && <Link href={`/receipts/${id}/edit`} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><Edit size={15} /> Corriger</Link>}<button onClick={() => downloadReceiptPDF(receipt)} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><Download size={15} /> PDF</button><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white"><Printer size={15} /> Imprimer</button></div></div>
    <article className="relative mx-auto max-w-3xl overflow-hidden bg-white shadow-xl print:shadow-none">
      {receipt.voided_at && <div className="absolute right-[-48px] top-8 rotate-45 bg-rose-700 px-16 py-2 text-xs font-black uppercase tracking-[0.2em] text-white">Annulé</div>}
      <header className="border-b-4 border-primary px-8 py-7"><p className="text-2xl font-black tracking-tight text-primary">English Hills</p><p className="text-xs text-slate-500">Language Center · Centre Almaz, Casablanca</p><div className="mt-6 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Reçu de paiement</p><h1 className="mt-1 text-xl font-black">{receipt.receipt_number}</h1></div><div className="text-right"><p className="text-sm font-bold">{receipt.date}</p><p className="text-xs text-slate-500">Émis {receipt.created_at ? new Date(receipt.created_at).toLocaleString('fr-MA') : ''}</p></div></div></header>
      <div className="space-y-7 px-8 py-7">
        <section><Title>Apprenant</Title><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><Data label="Nom" value={receipt.nom_prenom} /><Data label="Téléphone" value={receipt.telephone} /><Data label="Destinataire email" value={receipt.email} /></div></section>
        <section><Title>Service facturé</Title><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Data label="Session" value={receipt.session_type || 'Historique'} /><Data label="Service / période" value={receipt.service_description || 'Reçu historique'} />{receipt.session_type === 'Yearly' && <Data label="Formule" value={receipt.plan_type} />}<Data label="Niveau" value={receipt.niveau || 'À déterminer'} /></div>{receipt.plan_type === 'Premium' && <p className="mt-3 text-xs text-amber-800">Formule achetée : atelier collectif partagé d’une heure le week-end. Ce reçu ne modifie pas l’affectation académique.</p>}</section>
        <section><Title>Paiement</Title><div className="overflow-hidden rounded-xl border"><Row label="Prix brut convenu" value={`${money(amounts.gross)} MAD`} />{amounts.discount > 0 && <Row label="Remise" value={`−${money(amounts.discount)} MAD`} />}<Row label="Prix net" value={`${money(amounts.net)} MAD`} strong /><Row label="Payé avant ce reçu" value={`${money(amounts.paidBefore)} MAD`} /><Row label="Reçu ce jour" value={`${money(amounts.payment)} MAD`} strong /><Row label="Solde après ce reçu" value={`${money(amounts.balance)} MAD`} strong tone={amounts.balance > 0 ? 'due' : 'paid'} /></div><div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-600"><span><b>Mode :</b> {receipt.mode_paiement}</span>{receipt.transaction_reference && <span><b>Référence :</b> {receipt.transaction_reference}</span>}<span><b>Statut :</b> {status}</span></div></section>
        {(receipt.payment_note || receipt.observation) && <section><Title>Note</Title><p className="text-sm text-slate-600">{receipt.payment_note || receipt.observation}</p></section>}
        {receipt.voided_at && <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Paiement annulé</b><p>{receipt.void_reason}</p><p className="mt-1 text-xs">L’original est conservé pour l’audit et ne compte plus dans le solde.</p></section>}
        <div className="grid grid-cols-2 gap-12 pt-8 text-xs uppercase tracking-wide text-slate-400"><div><p>Signature du responsable</p><div className="mt-10 border-b" /></div><div className="text-right"><p>Cachet du centre</p><div className="mt-10 border-b" /></div></div>
      </div>
      <footer className="bg-primary px-8 py-3 text-center text-xs text-white/80">English Hills Language Center · Learn Today, Lead Tomorrow</footer>
    </article>
    <style>{`@media print { body { margin:0; print-color-adjust:exact; -webkit-print-color-adjust:exact } @page { size:A5; margin:0 } }`}</style>
  </div>;
}

function Title({ children }) { return <h2 className="mb-3 border-b pb-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary">{children}</h2>; }
function Data({ label, value }) { return <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value || '—'}</p></div>; }
function Row({ label, value, strong, tone }) { return <div className={`flex justify-between border-b px-4 py-3 text-sm last:border-0 ${tone === 'due' ? 'bg-rose-50 text-rose-800' : tone === 'paid' ? 'bg-emerald-50 text-emerald-800' : ''}`}><span>{label}</span><span className={strong ? 'font-black' : 'font-semibold'}>{value}</span></div>; }
