'use client';

import { Component, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

const COPY = {
  lead: { title: 'Fiche prospect', loading: 'Chargement de la fiche…', failed: 'Impossible d’ouvrir la fiche. Vérifiez la connexion et réessayez.' },
  form: { title: 'Ajouter un prospect', loading: 'Chargement du formulaire…', failed: 'Impossible d’ouvrir le formulaire. Vérifiez la connexion et réessayez.' },
};

// Stands in for the overlay while its chunk loads or after it failed: a real modal that
// takes focus and closes on Escape or Fermer. Focus goes back to the page only when the
// overlay itself closes, not when the loaded overlay or the failure view replaces it.
function OverlayShell({ kind, failed = false, onRetry, onClose, closed, onRestoreFocus }) {
  const copy = COPY[kind], retryRef = useRef(null);
  const [Root, Content, Title, Description] = kind === 'lead' ? [Sheet, SheetContent, SheetTitle, SheetDescription] : [Dialog, DialogContent, DialogTitle, DialogDescription];
  return <Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Content aria-busy={!failed} data-overlay-shell={failed ? 'failed' : 'loading'}
      onOpenAutoFocus={event => { if (failed) { event.preventDefault(); retryRef.current?.focus(); } }}
      onCloseAutoFocus={event => { event.preventDefault(); if (closed.current) onRestoreFocus?.(); }}
      className={kind === 'lead' ? 'operational flex w-full max-w-full flex-col gap-3 sm:max-w-[620px] sm:rounded-l-overlay' : 'operational sm:max-w-[640px]'}>
      <Title className="pr-12">{copy.title}</Title>
      {failed
        ? <><Description role="alert">{copy.failed}</Description><div><Button ref={retryRef} onClick={onRetry}>Réessayer</Button></div></>
        : <Description role="status">{copy.loading}</Description>}
    </Content>
  </Root>;
}

// The loaded overlay, or the loading shell until its chunk arrives. One load per mount;
// a load that still fails after its retries is thrown to OverlayBoundary.
function LoadedOverlay({ loader, render, ...shell }) {
  const [state, setState] = useState(() => ({ Component: loader.value?.default }));
  useEffect(() => {
    if (state.Component) return undefined;
    let live = true; // A closed overlay unmounts, so a late chunk never opens it.
    loader.load().then(module => { if (live) setState({ Component: module.default }); }, error => { if (live) setState({ error }); });
    return () => { live = false; };
  }, [loader, state.Component]);
  if (state.error) throw state.error;
  return state.Component ? render(state.Component) : <OverlayShell {...shell} />;
}

// Contains a failed overlay chunk so the page behind stays usable. Any other error
// reaches the page's error boundary exactly as before.
class OverlayBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (error.name !== 'ChunkLoadError') throw error;
    return this.props.fallback(() => this.setState({ error: null }));
  }
}

// `loader` comes from retryingImport; `children` renders the loaded component.
// Réessayer remounts LoadedOverlay, which starts a fresh load.
export default function LazyOverlay({ loader, kind, onClose, onRestoreFocus, children }) {
  const closed = useRef(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { closed.current = false; return () => { closed.current = true; }; }, []);
  const shell = { kind, onClose, closed, onRestoreFocus };
  return <OverlayBoundary fallback={reset => <OverlayShell {...shell} failed onRetry={() => { reset(); setAttempt(n => n + 1); }} />}>
    <LoadedOverlay key={attempt} loader={loader} render={children} {...shell} />
  </OverlayBoundary>;
}
