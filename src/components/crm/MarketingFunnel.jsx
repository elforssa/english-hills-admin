'use client';
import { ChevronRight } from 'lucide-react';
import { funnelStages, overallRate } from '@/lib/crm/funnel.mjs';

const number = (v) => v == null ? '—' : new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 }).format(v);
const percent = (v) => v == null ? '—' : new Intl.NumberFormat('fr-MA', { style: 'percent', maximumFractionDigits: 1 }).format(v);

export default function MarketingFunnel({ summary }) {
  const stages = funnelStages(summary);
  return <section className="rounded-lg border border-slate-200 bg-white p-4" data-testid="marketing-funnel" aria-label="Entonnoir">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-semibold text-slate-900">Entonnoir</h2>
      <p className="text-xs text-slate-500">Prospects → inscrits : <strong className="tabular-nums text-slate-900" data-testid="funnel-overall">{percent(overallRate(summary))}</strong></p>
    </div>
    <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stages.map((stage, index) => <li key={stage.key} className="relative rounded-md border border-slate-100 bg-slate-50 px-3 py-2" data-testid={`funnel-${stage.key}`}>
        {index > 0 && <ChevronRight aria-hidden="true" className="absolute -left-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-300 lg:block" />}
        <p className="text-xs text-slate-500">{stage.label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{number(stage.count)}</p>
        {index > 0 && <p className="text-[11px] text-slate-500"><span className="tabular-nums" data-testid={`funnel-rate-${stage.key}`}>{percent(stage.rate)}</span> de l’étape précédente</p>}
        {stage.key === 'contacted' && <p className="text-[11px] text-slate-500">dont joints : <span className="tabular-nums">{number(summary?.reached)}</span></p>}
        {stage.key === 'converted' && <p className="text-[11px] text-slate-500">dont payés : <span className="tabular-nums" data-testid="funnel-converted-paid">{number(summary?.converted_paid)}</span></p>}
      </li>)}
    </ol>
    <p className="mt-2 text-[11px] leading-4 text-slate-500">Chaque étape compte un prospect une seule fois, quels que soient les événements répétés. Contactés : tentative d’appel, conversation ou message WhatsApp ; joints : conversation enregistrée. Un prospect peut être qualifié sans contact préalable. « — » : étape précédente vide.</p>
  </section>;
}
