'use client';
import { Button } from '@/components/ui/button';
const messages = { loading: 'Chargement…', refreshing: 'Actualisation…', stale: 'Actualisation impossible. Les dernières informations disponibles sont conservées.', error: 'Impossible de charger ces informations.', unavailable: 'Informations indisponibles.', empty: 'Aucun résultat.', 'filtered-empty': 'Aucun résultat dans ce périmètre.' };
export default function ReadState({ state, children, message, help, onRetry, onReset }) {
  // Keep the content boundary stable during refresh so focused row/action nodes survive.
  if (state === 'ready') return <><div key="content">{children}</div></>;
  const continuing = state === 'refreshing' || state === 'stale';
  return <><div key="notice" role={['error', 'stale'].includes(state) ? 'alert' : 'status'} className="min-w-0 rounded-lg border p-4 text-sm" aria-busy={state === 'loading' || state === 'refreshing'}>
    {state === 'loading' && <div aria-hidden className="mb-3 space-y-2 motion-safe:animate-pulse"><div className="h-4 w-1/2 rounded bg-muted"/><div className="h-4 w-3/4 rounded bg-muted"/></div>}
    <p>{message || messages[state]}</p>{help && <div className="mt-1 text-xs text-muted-foreground">{help}</div>}
    {(onRetry || onReset) && <div className="mt-2 flex flex-wrap gap-2">{onRetry && <Button variant="outline" onClick={onRetry}>Réessayer</Button>}{onReset && <Button variant="ghost" onClick={onReset}>Effacer les filtres</Button>}</div>}
  </div>{continuing && <div key="content" aria-busy={state === 'refreshing'}>{children}</div>}</>;
}
