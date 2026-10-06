'use client';
import { Button } from '@/components/ui/button';
export default function FilterBar({ search, children, more, activeCount = 0, summary, onReset }) {
  return <section aria-label="Filtres" className="min-w-0 space-y-2">
    <div className="flex min-w-0 flex-wrap items-end gap-2">{search}{children}
      {more && <details className="min-w-0 basis-full"><summary className="inline-flex cursor-pointer items-center rounded-md border bg-card px-3 py-2 text-sm font-medium">Plus de filtres{activeCount > 0 ? ` · ${activeCount}` : ''}</summary><div className="mt-2 flex min-w-0 flex-wrap items-end gap-2">{more}</div></details>}
    </div>
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"><span aria-live="polite">{summary || (activeCount ? `${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}` : 'Aucun filtre supplémentaire')}</span>
      {onReset && <Button variant="ghost" className="text-xs" onClick={onReset}>Effacer les filtres</Button>}
    </div>
  </section>;
}
