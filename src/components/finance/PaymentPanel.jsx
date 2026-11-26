'use client';

// One payment panel (RWR-r5 PR C1, plan §6.1), shared by « Encaisser » (ReceiptForm) and
// « Inscrire et encaisser » (CrmEnrollmentDialog): the learner's open balances from
// get_open_balances (oldest first), the amounts, and the in-app duplicate-receipt check.
// Each screen keeps its own payment fields and passes them as children.
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CircleDollarSign, Link2, Plus } from 'lucide-react';
import { DUPLICATE_REASON, balanceLine, duplicateLine, mad, reservedElsewhere } from '@/lib/finance/paymentPanel.mjs';

// currentLeadId: in a prospect's wizard, that prospect's own reservation stays selectable.
// newPressed: whether « Nouvelle … » is the explicit choice (default: nothing else chosen).
export function OpenBalanceChooser({ rows = [], value = '', onChange, newLabel = 'Nouvelle inscription', allowNew = true,
  crmHref = null, actionLabel = 'Encaisser sur cet engagement', title = 'Soldes ouverts', compact = false, currentLeadId = null, newPressed }) {
  if (!rows.length) return null;
  return <fieldset className="space-y-2" aria-label={title}>
    <legend className="mb-1.5 text-xs font-bold text-slate-600">{title}</legend>
    {rows.map((row) => {
      const reserved = crmHref && reservedElsewhere(row, currentLeadId);
      const selected = value === row.id;
      return <div key={row.id} className={`rounded-2xl border p-3 ${selected ? 'border-primary bg-primary/[0.05] ring-2 ring-primary/20' : 'bg-white'}`} data-balance-id={row.id}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-black text-slate-900">{row.service_description}</p>
            <p className="text-xs text-muted-foreground">{balanceLine(row)}{row.enrollment_id ? ` · inscription ${row.enrollment_status || ''}`.trimEnd() : ' · sans inscription'}</p>
            {!compact && <p className="mt-1 text-xs text-slate-600">Prix net {mad(row.net_amount)} · déjà payé {mad(row.paid_amount)}{row.due_date ? ` · échéance ${String(row.due_date).split('-').reverse().join('/')}` : ''}</p>}
            {reserved && <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><CalendarClock size={13} /> Réservé pour un prospect : encaissez depuis sa fiche CRM pour confirmer l’inscription.</p>}
          </div>
          {reserved
            ? <Link href={crmHref(row.reserved_lead_id)} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold text-primary"><Link2 size={14} /> Ouvrir le prospect</Link>
            : <button type="button" aria-pressed={selected} onClick={() => onChange(row.id)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${selected ? 'bg-primary text-white' : 'border text-primary'}`}><CircleDollarSign size={14} /> {actionLabel}</button>}
        </div>
      </div>;
    })}
    {allowNew && <button type="button" aria-pressed={newPressed ?? value === ''} onClick={() => onChange('')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${(newPressed ?? value === '') ? 'bg-slate-900 text-white' : 'border text-slate-700'}`}><Plus size={14} /> {newLabel}</button>}
  </fieldset>;
}

export function AmountSummary({ net, paidBefore, today, balanceAfter }) {
  return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">
    <Amount label="Prix net" value={net} /><Amount label="Déjà payé" value={paidBefore} />
    <Amount label="Payé aujourd’hui" value={today} accent /><Amount label="Solde restant" value={balanceAfter} warning={balanceAfter > 0} />
  </div>;
}

export function ErrorList({ errors = [] }) {
  if (!errors.length) return null;
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
    <p className="font-bold">À corriger avant d’enregistrer :</p>
    <ul className="mt-1 list-disc pl-5">{errors.map(error => <li key={error}>{error}</li>)}</ul>
  </div>;
}

// The in-app duplicate panel (§6.1): number, date, amount and charge of each possible
// duplicate; nothing is saved until « C'est un autre paiement ».
export function DuplicateReceiptPanel({ matches = [], onConfirm, onCancel, busy = false }) {
  if (!matches.length) return null;
  return <div role="alertdialog" aria-label="Reçu peut-être en double" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="flex items-center gap-2 font-black"><AlertTriangle size={16} /> Ce paiement est peut-être déjà enregistré</p>
    <ul className="mt-2 space-y-1">{matches.map(row => <li key={row.id}>
      <span className="font-semibold">{duplicateLine(row)}</span>
      <span className="block text-xs text-amber-800">{DUPLICATE_REASON[row.rule] || ''}</span>
    </li>)}</ul>
    <p className="mt-2 text-xs">Vérifiez le reçu avant d’en créer un deuxième.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={onConfirm} className="rounded-xl bg-amber-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">C’est un autre paiement</button>
      <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-xs font-bold">Annuler</button>
    </div>
  </div>;
}

export default function PaymentPanel({ balances, selectedId, onSelect, newLabel, allowNew, crmHref, summary, errors, duplicates,
  onDuplicateConfirm, onDuplicateCancel, busy, children }) {
  return <div className="space-y-4" data-payment-panel>
    {balances?.length > 0 && <OpenBalanceChooser rows={balances} value={selectedId} onChange={onSelect} newLabel={newLabel} allowNew={allowNew} crmHref={crmHref} />}
    {children}
    {summary && <AmountSummary {...summary} />}
    <ErrorList errors={errors} />
    <DuplicateReceiptPanel matches={duplicates} onConfirm={onDuplicateConfirm} onCancel={onDuplicateCancel} busy={busy} />
  </div>;
}

function Amount({ label, value, accent, warning }) {
  return <div className={`${accent ? 'bg-primary text-white' : warning ? 'bg-rose-50 text-rose-800' : 'bg-white'} p-3 text-center`}>
    <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p><p className="mt-1 text-base font-black">{mad(value)}</p>
  </div>;
}
