'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Plus, Search, Download, CheckSquare, Square } from 'lucide-react';
import jsPDF from 'jspdf';
import Pagination from '@/components/ui/pagination';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { PAYMENT_STATUS_COLORS } from '@/lib/statusColors';
import { buildReceiptPDF, loadReceiptLogo } from '@/lib/receiptPdf';
import { money, receiptAmounts, receiptStatus } from '@/lib/receiptFinance';
import { RECEIPT_PAPER_FORMAT, receiptServiceSummary } from '@/lib/receiptPresentation';
import { toast } from 'sonner';
import { listHref, recordHref } from '@/lib/navigation.mjs';

const PAGE_SIZE = 25;

export default function Receipts() {
  const [receipts, setReceipts] = useState([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchInput, setSearchInput] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set()); const [generating, setGenerating] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q') || '';
    setSearchInput(query); setSearch(query);
    setPage(Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1));
    setUrlReady(true);
  }, []);
  const listUrl = listHref('/receipts', { q: search, page });
  useEffect(() => { if (urlReady) window.history.replaceState(window.history.state, '', listUrl); }, [urlReady, listUrl]);
  useEffect(() => {
    if (!urlReady) return;
    const timer = setTimeout(() => { if (searchInput.trim() !== search) { setSearch(searchInput.trim()); setPage(1); } }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, urlReady]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError(false); let query = getBrowserClient().from('receipts').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
    if (search) query = query.or(`nom_prenom.ilike.%${search.replace(/[,%()]/g, ' ')}%,receipt_number.ilike.%${search.replace(/[,%()]/g, ' ')}%`);
    const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error || count === null) { setLoadError(true); setLoading(false); return; }
    setReceipts(data || []); setTotal(count); setLoading(false);
  }, [page, search]);
  useEffect(() => { if (urlReady) load(); }, [load, urlReady]);
  const pageIds = receipts.map((receipt) => receipt.id); const allChecked = receipts.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id) => setSelected((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelected((old) => { const next = new Set(old); pageIds.forEach((id) => allChecked ? next.delete(id) : next.add(id)); return next; });
  const downloadSelected = async () => {
    setGenerating(true);
    try {
      const ids = [...selected];
      const rows = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await getBrowserClient().from('receipts').select('*').in('id', ids.slice(offset, offset + 100));
        if (error || !data || data.length !== Math.min(100, ids.length - offset)) throw new Error('Incomplete receipt selection');
        rows.push(...data);
      }
      if (rows.length !== ids.length) throw new Error('Incomplete receipt selection');
      rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)));
      const logoData = await loadReceiptLogo();
      const doc = new jsPDF({ unit: 'mm', format: RECEIPT_PAPER_FORMAT });
      rows.forEach((receipt, index) => { if (index) doc.addPage(RECEIPT_PAPER_FORMAT, 'portrait'); buildReceiptPDF(doc, receipt, { logoData }); });
      doc.save(`recus-english-hills-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      toast.error('Impossible de générer tous les reçus sélectionnés. Réessayez.');
    } finally {
      setGenerating(false);
    }
  };
  return <div className="mx-auto max-w-7xl p-4 lg:p-8">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Réception · Finance</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Reçus de paiement</h1><p className="mt-1 text-sm text-muted-foreground">{total} reçu{total > 1 ? 's' : ''} émis</p></div><Button asChild><Link href="/receipts/new"><Plus size={15} /> Encaisser</Link></Button></header>
    <div className="mb-5 flex flex-wrap items-center gap-3"><div className="relative max-w-sm flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input aria-label="Rechercher les reçus" className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm" placeholder="Nom ou numéro de reçu…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div>{selected.size > 0 && <button onClick={downloadSelected} disabled={generating} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Download size={15} />{generating ? 'Génération…' : `PDF (${selected.size})`}</button>}</div>
    <div className="overflow-hidden rounded-xl border bg-card">{loading ? <SkeletonTable rows={10} cols={8} /> : loadError ? <div role="alert" className="p-8 text-center text-sm"><p>Impossible de charger les reçus.</p><Button variant="outline" className="mt-3" onClick={load}>Réessayer</Button></div> : receipts.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Aucun reçu.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted text-xs text-muted-foreground"><th className="w-8 px-4 py-3"><button aria-label="Sélectionner tous les reçus de cette page" aria-pressed={allChecked} onClick={toggleAll} className="rounded p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{allChecked ? <CheckSquare size={16} /> : <Square size={16} />}</button></th>{['Reçu','Apprenant','Session / service','Date','Prix net','Ce paiement','Solde après ce reçu','Statut'].map((heading) => <th key={heading} className="px-4 py-3 text-left">{heading}</th>)}</tr></thead><tbody className="divide-y">{receipts.map((receipt) => {
      const amounts = receiptAmounts(receipt); const status = receiptStatus(receipt); const checked = selected.has(receipt.id);
      return <tr key={receipt.id} className={checked ? 'bg-blue-50/50' : 'hover:bg-muted/30'}><td className="px-4 py-3"><button aria-label={`Sélectionner le reçu ${receipt.receipt_number}`} aria-pressed={checked} onClick={() => toggle(receipt.id)} className="rounded p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{checked ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}</button></td><td className="px-4 py-3 font-bold"><Link href={recordHref(`/receipts/${receipt.id}/print`, listUrl)} className="inline-flex min-h-10 items-center rounded text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{receipt.receipt_number || `#${receipt.id.slice(-8).toUpperCase()}`}</Link>{receipt.legacy && <span className="block text-[10px] text-muted-foreground">HISTORIQUE</span>}</td><td className="px-4 py-3">{receipt.student_id ? <Link href={recordHref(`/students/${receipt.student_id}`, listUrl)} className="inline-flex min-h-10 items-center rounded font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{receipt.nom_prenom}</Link> : <b>{receipt.nom_prenom}</b>}{receipt.session_type === 'Yearly' && receipt.plan_type === 'Premium' && <span className="ml-2 text-[10px] font-black text-amber-700">PREMIUM</span>}</td><td className="px-4 py-3"><span className="block font-semibold">{receiptServiceSummary(receipt)}</span><span className="block max-w-48 truncate text-xs text-muted-foreground">{receipt.service_description || 'Reçu historique'}</span></td><td className="px-4 py-3 text-muted-foreground">{receipt.date}</td><td className="px-4 py-3">{money(amounts.net)} MAD</td><td className="px-4 py-3 font-bold text-emerald-700">{money(amounts.payment)} MAD</td><td className="px-4 py-3 font-bold">{money(amounts.balance)} MAD</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${receipt.voided_at ? 'bg-rose-100 text-rose-700' : PAYMENT_STATUS_COLORS[status] || 'bg-slate-100'}`}>{status}</span></td></tr>;
    })}</tbody></table></div>}<Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} /></div>
  </div>;
}
