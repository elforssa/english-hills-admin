'use client';

// Client part of /auth/confirm (plan ELW-r3, section 1). Rule L1: no request made
// on load carries the link's token. A visitor without a session causes no Auth
// request at all; a signed-in visitor's browser only makes its usual requests with
// its own session. verifyOtp runs inside the click handler only.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle, Loader2, Lock, LogOut, WifiOff } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';
import {
  classifyVerifyError, destinationFor, isActivated, isSamePassword, MESSAGES, parseLinkParams,
  passwordErrorMessage, routeAfterVerify,
} from '@/lib/authLinks.mjs';

const BUTTON = { invite: 'Activer mon compte', email: 'Se connecter', magiclink: 'Se connecter', recovery: 'Continuer' };
const TITLE = {
  invite: 'Activez votre compte English Hills',
  email: 'Connexion à votre espace English Hills',
  magiclink: 'Connexion à votre espace English Hills',
  recovery: 'Choisir un nouveau mot de passe',
};
const INTRO = {
  invite: 'Appuyez sur le bouton pour activer votre compte.',
  email: 'Appuyez sur le bouton pour vous connecter.',
  magiclink: 'Appuyez sur le bouton pour vous connecter.',
  recovery: 'Appuyez sur le bouton pour continuer.',
};
const PRIMARY = { background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' };
const INPUT = 'w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60';

// Removes the token from the address bar once Supabase has answered.
function clearAddress() {
  window.history.replaceState(null, '', window.location.pathname);
}

function Shell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--brand-deep)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/eh-logo.png" alt="English Hills" className="h-14 w-auto mx-auto mb-4 brightness-0 invert opacity-95" />
          <p className="text-white/70 text-xs tracking-[0.25em] uppercase font-medium">English Hills Language Center</p>
          <p className="text-white/40 text-xs italic mt-1.5">Learn Today, Lead Tomorrow</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-7" data-testid="auth-confirm">{children}</div>
        <p className="text-center text-xs text-white/40 mt-6">
          Almaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca
        </p>
      </div>
    </div>
  );
}

function PrimaryButton({ children, busy, ...props }) {
  return (
    <button
      type="button"
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
      style={PRIMARY}
      {...props}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : null}
      {children}
      {busy ? null : <ArrowRight size={14} />}
    </button>
  );
}

export default function ConfirmClient() {
  const router = useRouter();
  // phase: loading | ready | activated | verifying | used | connection | route-retry
  //        | new-password | saving | redirecting
  const [phase, setPhase] = useState('loading');
  const [type, setType] = useState(null);
  const [account, setAccount] = useState(null); // signed-in, activated visitor: { email, role }
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const linkRef = useRef(null);
  const verifiedRef = useRef(null); // { userId, role } after a successful verification

  // Mount: copy the token into state; decide the first screen without any call
  // that carries it.
  useEffect(() => {
    let cancelled = false;
    const link = parseLinkParams(new URLSearchParams(window.location.search));
    linkRef.current = link;
    if (!link) {
      clearAddress();
      setPhase('used');
      return undefined;
    }
    setType(link.type);
    (async () => {
      const sb = getBrowserClient();
      const { data: { session } } = await sb.auth.getSession();
      if (cancelled) return;
      if (!session?.user) { setPhase('ready'); return; }
      const { data: profile, error: readError } = await sb.from('profiles')
        .select('full_name, role').eq('id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (!readError && isActivated(profile)) {
        setAccount({ email: session.user.email || '', role: profile.role });
        setPhase('activated');
        return;
      }
      setPhase('ready');
    })();
    return () => { cancelled = true; };
  }, []);

  const go = useCallback((path) => {
    setPhase('redirecting');
    router.replace(path);
  }, [router]);

  // After a successful verification: route from the account's own stored data.
  const continueAfterVerify = useCallback(async () => {
    const sb = getBrowserClient();
    const { userId } = verifiedRef.current;
    setPhase('verifying');
    const { data: profile, error: readError } = await sb.from('profiles')
      .select('full_name, role').eq('id', userId).maybeSingle();
    if (readError) { setPhase('route-retry'); return; }
    verifiedRef.current = { userId, role: profile?.role || null };
    const route = routeAfterVerify(linkRef.current.type, profile);
    if (route.step === 'activation') { go('/inscription-compte'); return; }
    if (route.step === 'new-password') { setPhase('new-password'); return; }
    let role = profile?.role || null;
    if (route.applyPendingRole) {
      const { data: applied, error: applyError } = await sb.rpc('apply_pending_role');
      if (!applyError && applied) role = applied;
    }
    go(destinationFor(role));
  }, [go]);

  // The only place the token is sent: an explicit click.
  async function handleVerify() {
    const link = linkRef.current;
    if (!link || phase === 'verifying') return;
    setPhase('verifying');
    const sb = getBrowserClient();
    // Never mix someone else's session in this browser with the link's account.
    const { data: { session } } = await sb.auth.getSession();
    if (session) await sb.auth.signOut({ scope: 'local' });
    let result;
    try {
      result = await sb.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
    } catch (thrown) {
      result = { data: null, error: thrown };
    }
    if (result.error || !result.data?.user) {
      if (classifyVerifyError(result.error) === 'connection') {
        // The token was not used: it stays in the address, so a reload works too.
        setPhase('connection');
        return;
      }
      clearAddress();
      setPhase('used');
      return;
    }
    clearAddress();
    verifiedRef.current = { userId: result.data.user.id, role: null };
    await continueAfterVerify();
  }

  async function handleUseForAnotherAccount() {
    const sb = getBrowserClient();
    await sb.auth.signOut({ scope: 'local' });
    setAccount(null);
    setPhase('ready');
  }

  async function handleNewPassword(event) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setPhase('saving');
    const sb = getBrowserClient();
    const { error: updateError } = await sb.auth.updateUser({ password });
    if (updateError && !isSamePassword(updateError)) {
      setError(passwordErrorMessage(updateError));
      setPhase('new-password');
      return;
    }
    // D5 = A: the account's other devices are signed out.
    const { error: othersError } = await sb.auth.signOut({ scope: 'others' });
    if (othersError) {
      setNotice(MESSAGES.othersStillSignedIn);
      await new Promise((resolve) => { setTimeout(resolve, 2500); });
    }
    let role = verifiedRef.current?.role || null;
    const { data: applied, error: applyError } = await sb.rpc('apply_pending_role');
    if (!applyError && applied) role = applied;
    go(destinationFor(role));
  }

  if (phase === 'loading' || phase === 'redirecting') {
    return (
      <Shell>
        <div className="flex flex-col items-center py-6 text-center">
          <Loader2 size={22} className="animate-spin mb-3" style={{ color: 'var(--brand)' }} />
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        </div>
      </Shell>
    );
  }

  if (phase === 'used') {
    return (
      <Shell>
        <div className="text-center space-y-4" data-state="used">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <AlertCircle size={22} className="text-amber-700" />
          </div>
          <p className="text-sm text-foreground leading-relaxed">{MESSAGES.used}</p>
          <div className="flex flex-col gap-2">
            <Link href="/login" className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition" style={PRIMARY}>
              Se connecter
            </Link>
            <Link href="/login?mode=reset" className="text-xs font-medium hover:underline" style={{ color: 'var(--brand)' }}>
              Mot de passe oublié ?
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'activated' && account) {
    return (
      <Shell>
        <div className="text-center space-y-4" data-state="activated">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle size={22} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground mb-1.5">{MESSAGES.alreadyActivated}</h1>
            <p className="text-sm text-muted-foreground">
              Vous êtes connecté avec <strong className="text-foreground">{account.email}</strong>.
            </p>
          </div>
          <PrimaryButton onClick={() => go(destinationFor(account.role))}>Continuer vers mon espace</PrimaryButton>
          <button
            type="button"
            onClick={handleUseForAnotherAccount}
            className="text-xs font-medium hover:underline inline-flex items-center gap-1.5"
            style={{ color: 'var(--brand)' }}
          >
            <LogOut size={12} />
            Ce lien est pour un autre compte ? Me déconnecter et l&apos;utiliser
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === 'route-retry') {
    return (
      <Shell>
        <div className="text-center space-y-4" data-state="connection">
          <WifiOff size={22} className="mx-auto text-muted-foreground" />
          <p className="text-sm text-foreground">{MESSAGES.connection}</p>
          <PrimaryButton onClick={continueAfterVerify}>Réessayer</PrimaryButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'new-password' || phase === 'saving') {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-foreground mb-1">Nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground mb-6">Choisissez votre nouveau mot de passe.</p>
        <form onSubmit={handleNewPassword} className="space-y-4" data-state="new-password">
          <div>
            <label htmlFor="new-password" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              <input id="new-password" type="password" required autoComplete="new-password" minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)} disabled={phase === 'saving'}
                placeholder="8 caractères minimum" className={INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor="new-password-confirm" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              <input id="new-password-confirm" type="password" required autoComplete="new-password" minLength={8}
                value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={phase === 'saving'} className={INPUT} />
            </div>
          </div>
          {error ? (
            <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</div>
          ) : null}
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          <button type="submit" disabled={phase === 'saving'}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
            style={PRIMARY}>
            {phase === 'saving' ? <Loader2 size={14} className="animate-spin" /> : null}
            Enregistrer le mot de passe
          </button>
        </form>
      </Shell>
    );
  }

  // ready | verifying | connection
  return (
    <Shell>
      <div data-state={phase}>
        <h1 className="text-xl font-bold text-foreground mb-1">{TITLE[type]}</h1>
        <p className="text-sm text-muted-foreground mb-6">{INTRO[type]}</p>
        {phase === 'connection' ? (
          <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-4">
            {MESSAGES.connection}
          </div>
        ) : null}
        <PrimaryButton busy={phase === 'verifying'} onClick={handleVerify}>{BUTTON[type]}</PrimaryButton>
      </div>
    </Shell>
  );
}
