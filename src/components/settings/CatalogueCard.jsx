'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { crmRpc, useCrmRefresh } from '@/lib/crm/queries';
import { useCatalogue } from '@/lib/useCatalogue';
import { actionErrorMessage } from '@/lib/crm/presentation.mjs';
import { DEFAULT_SCHOOL_YEAR, SCHOOL_YEAR_OPTIONS } from '@/lib/receiptPresentation';

const control = 'min-h-9 rounded-md border border-border bg-white px-2 text-sm';
const mad = value => `${Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;

// « Catalogue » (director only, RWR-r5 §5.4). Owner decision (2026-11-26, replacing
// OD-16): B2 ships with no programme prices. A price is optional; while it is empty,
// staff type the amount by hand. Once filled here it pre-fills both payment screens
// (still editable). Each change is a new row, so no release is needed.
export default function CatalogueCard() {
  const catalogue = useCatalogue();
  const refresh = useCrmRefresh();
  const [year, setYear] = useState(DEFAULT_SCHOOL_YEAR);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const lock = useRef(false);

  if (catalogue.isPending) return <p className="text-sm text-muted-foreground">Chargement du catalogue…</p>;
  if (catalogue.isError || !catalogue.data) return <p role="alert" className="text-sm text-red-800">Catalogue indisponible. Rechargez la page.</p>;

  async function run(key, call, success) {
    if (lock.current) return;
    lock.current = true; setBusy(key); setError(null);
    try {
      await call();
      await refresh();
      toast.success(success);
      setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
    } catch (err) { setError({ key, message: actionErrorMessage(err) }); } finally { lock.current = false; setBusy(null); }
  }

  const savePrice = (programme, current, amount) => run(programme.code, () => {
    const text = String(amount ?? '').trim().replace(',', '.');
    if (text !== '' && !/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Saisissez un prix positif (deux décimales au plus).');
    return crmRpc('catalogue_set_price', {
      p_programme: programme.code, p_school_year: year, p_amount: text === '' ? null : Number(text),
      p_label: null, p_expected_price_id: current?.id ?? null,
    });
  }, String(amount ?? '').trim() === '' ? `Prix retiré : ${programme.label}` : `Prix enregistré : ${programme.label}`);

  const toggleSelectable = programme => run(`sel:${programme.code}`, () => crmRpc('catalogue_save_programme', {
    p_code: programme.code, p_expected_version: programme.version, p_changes: { crm_selectable: !programme.crm_selectable },
  }), programme.crm_selectable ? `${programme.label} n’est plus proposé aux prospects` : `${programme.label} est proposé aux prospects`);

  return <div className="max-w-3xl space-y-5 rounded-xl border border-border bg-card p-6" data-testid="catalogue-card">
    <div className="flex items-center gap-3"><BookOpen size={18} style={{ color: 'var(--brand)' }} /><h2 className="font-semibold">Catalogue des programmes</h2></div>
    <p className="text-sm text-muted-foreground">Le prix est facultatif. Sans prix, l’équipe saisit le montant à la main ; avec un prix, il est proposé dans « Encaisser » et « Inscrire et encaisser » (toujours modifiable). Les reçus déjà émis ne changent pas.</p>
    <label className="flex items-center gap-2 text-sm font-medium">Année scolaire
      <select aria-label="Année scolaire du catalogue" className={control} value={year} onChange={e => { setYear(e.target.value); setDrafts({}); setError(null); }}>
        {SCHOOL_YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
    <div className="divide-y divide-slate-100">
      {catalogue.data.programmes.filter(p => p.active).map(programme => {
        const current = programme.prices?.find(p => p.school_year === year) || null;
        const draft = drafts[programme.code];
        const value = draft ?? (current?.amount != null ? String(current.amount) : '');
        const changed = draft !== undefined && draft.trim() !== (current?.amount != null ? String(current.amount) : '');
        return <div key={programme.code} className="flex flex-wrap items-center gap-3 py-3" data-testid={`catalogue-${programme.code}`}>
          <div className="min-w-48 flex-1">
            <p className="font-medium">{programme.label}</p>
            <p className="text-xs text-muted-foreground">{current?.amount != null ? `Prix ${year} : ${mad(current.amount)}` : `Sans prix pour ${year} : saisie à la main`}</p>
          </div>
          {programme.enrollable && <>
            <input aria-label={`Prix ${programme.label} ${year}`} inputMode="decimal" placeholder="Montant (MAD)" className={`${control} w-36`} value={value}
              onChange={e => setDrafts(d => ({ ...d, [programme.code]: e.target.value }))} disabled={busy !== null} />
            <Button type="button" size="sm" disabled={!changed || busy !== null} onClick={() => savePrice(programme, current, value)}>{busy === programme.code ? 'Enregistrement…' : 'Enregistrer'}</Button>
            {current?.amount != null && <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => savePrice(programme, current, '')}>Retirer le prix</Button>}
          </>}
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={programme.crm_selectable} disabled={busy !== null} onChange={() => toggleSelectable(programme)} />
            Proposé aux prospects
          </label>
          {error && (error.key === programme.code || error.key === `sel:${programme.code}`) && <p role="alert" className="basis-full text-sm text-red-800">{error.message}</p>}
        </div>;
      })}
    </div>
  </div>;
}
