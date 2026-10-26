'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import ReadState from '@/components/operational/ReadState';
import { getBrowserClient } from '@/lib/supabase';
import { localBusinessDate, money } from '@/lib/receiptFinance';
import { addDays, discountReasonLabel } from '@/lib/financeCorrections.mjs';
import { recordHref } from '@/lib/navigation.mjs';

const PERIODS = [30, 90, 365];
const ROLE_LABELS = { director: 'Direction', admin: 'Administration', receptionist: 'Accueil' };

// Director-only review list (plan PCR-r2 P1.6), read from get_finance_review_queue.
export default function FinanceReviewQueue() {
  const [days, setDays] = useState(30);
  const [read, setRead] = useState({ state: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setRead((previous) => ({ ...previous, state: previous.data ? 'refreshing' : 'loading' }));
    getBrowserClient().rpc('get_finance_review_queue', { p_since: addDays(localBusinessDate(), -days) }).then(({ data, error }) => {
      if (!active) return;
      setRead(error || !data ? { state: 'error' } : { state: 'ready', data });
    });
    return () => { active = false; };
  }, [days, reload]);

  const data = read.data;
  return <section className="mb-6 rounded-lg border border-border bg-card" aria-labelledby="finance-review-title">
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div>
        <h2 id="finance-review-title" className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} className="text-amber-600" /> Contrôles</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Réservé à la direction. La première liste est toujours à jour ; les autres couvrent la période choisie.</p>
      </div>
      <label className="flex items-center gap-2 text-xs font-medium">Période
        <select className="rounded-md border border-border bg-white px-2 py-1.5 text-xs" value={days} onChange={(event) => setDays(Number(event.target.value))}>
          {PERIODS.map((value) => <option key={value} value={value}>{value} jours</option>)}
        </select>
      </label>
    </div>
    <div className="p-4 lg:p-6">
      <ReadState state={read.state} onRetry={read.state === 'error' ? () => setReload((value) => value + 1) : undefined}>
        {data && <div className="space-y-5">
          <ReviewList title="Inscriptions confirmées sans paiement actif" empty="Aucune inscription confirmée sans paiement actif." rows={data.unpaid_confirmed}
            render={(row) => <>
              <Link href={recordHref(`/students/${row.student_id}`, '/finance')} className="font-semibold text-primary hover:underline">{row.learner_name}</Link>
              <span className="text-xs text-muted-foreground"> · {row.session_type || 'Programme non renseigné'} · {row.school_year || 'Année non renseignée'} · {row.enrollment_status}{row.learner_archived ? ' · dossier archivé' : ''}{row.lead_status ? ` · CRM ${row.lead_status}${row.lead_review_required ? ' (à vérifier)' : ''}` : ''}</span>
            </>} />
          <ReviewList title="Remises accordées" empty="Aucune remise sur la période." rows={data.discounts}
            render={(row) => <>
              <Link href={recordHref(`/students/${row.student_id}`, '/finance')} className="font-semibold text-primary hover:underline">{row.learner_name}</Link>
              <span className="text-xs text-muted-foreground"> · {row.created_on} · {money(row.discount_amount)} MAD sur {money(row.gross_amount)} MAD{row.discount_percent != null ? ` (${row.discount_percent} %)` : ''} · {discountReasonLabel(row.reason_code, row.reason) || 'Sans motif (avant contrôle)'} · {ROLE_LABELS[row.author_role] || 'Auteur inconnu'}{row.voided ? ' · annulé' : ''}</span>
            </>} />
          <ReviewList title="Paiements antidatés" empty="Aucun paiement antidaté sur la période." rows={data.backdated}
            render={(row) => <>
              <Link href={recordHref(`/receipts/${row.receipt_id}/print`, '/finance')} className="font-semibold text-primary hover:underline">{row.receipt_number || 'Reçu historique'}</Link>
              <span className="text-xs text-muted-foreground"> · {row.learner_name} · daté du {row.payment_date}, émis le {row.issued_on} ({row.days_back} j) · {money(row.amount)} MAD · {ROLE_LABELS[row.author_role] || 'Auteur inconnu'}{row.voided ? ' · annulé' : ''}</span>
            </>} />
          <ReviewList title="Acomptes de l’accueil en attente de confirmation" empty="Aucune inscription en attente après un acompte de l’accueil." rows={data.pending_confirmation}
            render={(row) => <>
              <Link href={recordHref(`/students/${row.student_id}`, '/finance')} className="font-semibold text-primary hover:underline">{row.learner_name}</Link>
              <span className="text-xs text-muted-foreground"> · {row.session_type} · {row.school_year || 'Année non renseignée'} · {row.enrollment_status} · payé {money(row.paid)} MAD sur {money(row.net)} MAD · dernier paiement {row.last_payment_date}</span>
            </>} />
        </div>}
      </ReadState>
    </div>
  </section>;
}

function ReviewList({ title, empty, rows = [], render }) {
  return <div>
    <h3 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">· {rows.length}{rows.length >= 200 ? '+' : ''}</span></h3>
    {rows.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      : <ul className="mt-2 divide-y divide-border rounded-md border border-border">{rows.map((row, index) => <li key={row.enrollment_id || row.charge_id || row.receipt_id || index} className="px-3 py-2 text-sm">{render(row)}</li>)}</ul>}
  </div>;
}
