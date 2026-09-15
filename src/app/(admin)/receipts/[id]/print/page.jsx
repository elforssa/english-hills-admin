'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { downloadReceiptPDF } from '@/lib/receiptPdf';
import { money, receiptAmounts, receiptStatus } from '@/lib/receiptFinance';
import { receiptSchoolYear } from '@/lib/receiptPresentation';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, Download, Edit, Mail, Printer } from 'lucide-react';

export default function ReceiptPrint() {
  const { id } = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const [receipt, setReceipt] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryingEmail, setRetryingEmail] = useState(false);
  useEffect(() => {
    getBrowserClient().from('receipts').select('*').eq('id', id).single().then(({ data, error }) => {
      setReceipt(data || null); setLoadError(error?.message || '');
    });
  }, [id]);
  const retryEmail = async () => {
    setRetryingEmail(true);
    try {
      const sb = getBrowserClient();
      const { data, error } = await sb.rpc('retry_receipt_email', { p_receipt_id: id });
      if (error) toast.error(error.message);
      else if (data.queued) toast.success('Nouvelle tentative d’envoi mise en file.');
      else toast.error(data.configuration_error ? 'Le service email n’est pas configuré.' : 'Ce reçu ne peut pas être envoyé.');
      const refreshed = await sb.from('receipts').select('*').eq('id', id).single();
      if (refreshed.data) setReceipt(refreshed.data);
    } catch {
      toast.error('Impossible de relancer l’envoi pour le moment.');
    } finally { setRetryingEmail(false); }
  };
  if (loadError) return <div className="p-8 text-sm text-rose-700">Impossible de charger ce reçu : {loadError}</div>;
  if (!receipt) return <div className="p-8 text-sm text-muted-foreground">Chargement du reçu…</div>;
  const amounts = receiptAmounts(receipt);
  const status = receiptStatus(receipt);
  const schoolYear = receiptSchoolYear(receipt);
  const lastEmailAttempt = receipt.email_last_attempted_at ? new Date(receipt.email_last_attempted_at).getTime() : 0;
  const emailRetryable = receipt.email_delivery_status === 'failed'
    || (receipt.email_delivery_status === 'queued' && lastEmailAttempt > 0 && Date.now() - lastEmailAttempt >= 15 * 60 * 1000);

  return <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0 lg:p-8">
    <div className="mx-auto mb-5 flex max-w-[148mm] flex-wrap items-center justify-between gap-3 print:hidden">
      <button onClick={() => router.push('/receipts')} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={15} /> Tous les reçus</button>
      <div className="flex flex-wrap gap-2">
        {role === 'director' && !receipt.voided_at && <Link href={`/receipts/${id}/edit`} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><Edit size={15} /> Corriger le paiement</Link>}
        {role === 'director' && receipt.charge_id && <Link href={`/finance/charges/${receipt.charge_id}/edit`} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><Edit size={15} /> Corriger l’engagement</Link>}
        {['admin','director'].includes(role) && emailRetryable && !receipt.voided_at && <button onClick={retryEmail} disabled={retryingEmail} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"><Mail size={15} /> {retryingEmail ? 'Nouvel envoi…' : 'Réessayer l’email'}</button>}
        <button onClick={() => downloadReceiptPDF(receipt)} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><Download size={15} /> PDF A5</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white"><Printer size={15} /> Imprimer</button>
      </div>
    </div>

    <article className="receipt-sheet relative mx-auto flex min-h-[210mm] w-full max-w-[148mm] flex-col overflow-hidden bg-white text-slate-800 shadow-2xl print:shadow-none">
      <div className="flex h-2 shrink-0"><div className="w-[72%] bg-[#1E4D8B]" /><div className="flex-1 bg-[#B91C2E]" /></div>
      {receipt.voided_at && <div className="absolute right-[-42px] top-9 z-10 rotate-45 bg-[#B91C2E] px-14 py-2 text-xs font-black uppercase tracking-[0.22em] text-white shadow">Annulé</div>}
      <header className="shrink-0 px-7 pb-5 pt-6 sm:px-9">
        <div className="flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4"><Image src="/eh-logo.png" alt="English Hills" width={677} height={369} priority className="h-16 w-auto object-contain" /><p className="text-[10px] leading-relaxed text-slate-500">Language Center<br />Centre Almaz, Casablanca</p></div>
          <p className="pt-1 text-right text-[9px] font-black uppercase tracking-[0.16em] text-[#B91C2E]">Learn Today<br />Lead Tomorrow</p>
        </div>
        <div className="mt-5 h-px bg-[#1E4D8B]" />
        <div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Reçu de paiement</p><h1 className="mt-1 text-xl font-black text-slate-900">{receipt.receipt_number}</h1></div><div className="text-right"><p className="text-[10px] uppercase tracking-wide text-slate-400">Date du paiement</p><p className="text-sm font-black">{receipt.date}</p><p className="mt-1 text-[10px] font-semibold text-[#1E4D8B]">{status}</p></div></div>
      </header>

      <div className="flex-1 space-y-5 px-7 pb-6 sm:px-9">
        {receipt.voided_at && <div className="break-inside-avoid rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-[#B91C2E]"><b>Ce reçu est annulé.</b>{receipt.void_reason && <p className="mt-1 break-words">Motif : {receipt.void_reason}</p>}</div>}
        <ReceiptSection title="Apprenant"><div className="grid grid-cols-2 gap-x-5 gap-y-3"><Data label="Nom" value={receipt.nom_prenom} wide /><Data label="Téléphone" value={receipt.telephone} /><Data label="Email" value={receipt.email} /></div></ReceiptSection>
        <ReceiptSection title="Session"><div className="grid grid-cols-2 gap-x-5 gap-y-3"><Data label="Session" value={receipt.session_type || (receipt.legacy ? 'Historique' : '')} /><Data label="Année scolaire" value={schoolYear} />{receipt.session_type === 'Yearly' && <Data label="Formule" value={receipt.plan_type} />}<Data label="Niveau" value={receipt.niveau} /><Data label="Service" value={receipt.service_description || (receipt.legacy ? 'Reçu historique' : '')} wide /></div></ReceiptSection>
        <ReceiptSection title="Paiement"><div className="overflow-hidden rounded-xl border border-slate-200"><Row label="Prix brut convenu" value={`${money(amounts.gross)} MAD`} />{amounts.discount > 0 && <Row label="Remise" value={`−${money(amounts.discount)} MAD`} />}<Row label="Prix net" value={`${money(amounts.net)} MAD`} strong /><Row label="Payé avant ce reçu" value={`${money(amounts.paidBefore)} MAD`} /><Row label="Montant payé aujourd’hui" value={`${money(amounts.payment)} MAD`} emphasis="paid" /><Row label="Solde restant" value={`${money(amounts.balance)} MAD`} emphasis={amounts.balance > 0 ? 'due' : 'settled'} /></div><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">{receipt.mode_paiement && <span><b>Mode :</b> {receipt.mode_paiement}</span>}{receipt.transaction_reference && <span className="break-all"><b>Référence :</b> {receipt.transaction_reference}</span>}</div></ReceiptSection>
        {(receipt.payment_note || receipt.observation) && <ReceiptSection title="Note"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{receipt.payment_note || receipt.observation}</p></ReceiptSection>}
        <div className="grid break-inside-avoid grid-cols-2 gap-10 pt-5 text-[9px] font-bold uppercase tracking-wide text-slate-400"><div><p>Signature du responsable</p><div className="mt-12 border-b border-slate-300" /></div><div className="text-right"><p>Cachet du centre</p><div className="mt-12 border-b border-slate-300" /></div></div>
      </div>
      <footer className="mt-auto flex h-10 shrink-0 items-center bg-[#1E4D8B] px-7 text-[9px] text-white sm:px-9"><span>English Hills Language Center · Learn Today, Lead Tomorrow</span><span className="ml-auto h-full w-12 translate-x-9 bg-[#B91C2E]" /></footer>
    </article>
    <style>{`@media print { html, body { margin:0 !important; padding:0 !important; background:white !important; print-color-adjust:exact; -webkit-print-color-adjust:exact } .receipt-sheet { width:148mm !important; min-height:210mm !important; max-width:none !important; box-shadow:none !important; } @page { size:A5 portrait; margin:0 } }`}</style>
  </div>;
}

function ReceiptSection({ title, children }) { return <section className="break-inside-avoid"><h2 className="mb-3 border-b border-slate-200 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#1E4D8B]">{title}</h2>{children}</section>; }
function Data({ label, value, wide }) { if (!value) return null; return <div className={wide ? 'col-span-2' : ''}><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p></div>; }
function Row({ label, value, strong, emphasis }) { const tone = emphasis === 'paid' ? 'bg-blue-50 text-[#1E4D8B]' : emphasis === 'due' ? 'bg-rose-50 text-[#B91C2E]' : emphasis === 'settled' ? 'bg-emerald-50 text-emerald-800' : ''; return <div className={`flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-2.5 text-sm last:border-0 ${tone}`}><span className={emphasis ? 'font-bold' : ''}>{label}</span><span className={strong || emphasis ? 'font-black' : 'font-semibold'}>{value}</span></div>; }
