// =============================================================================
// /login — primary sign-in page.
//
// Three modes (plan ELW-r3, section 3): `password` (default), `link`
// (« Recevoir un lien de connexion », Supabase OTP, never creates an account)
// and `reset` (« Mot de passe oublié ? », a new-password e-mail). `?mode=` and
// `?error=` are closed lists; nothing from the address is rendered.
//
// Both request forms answer the same sentence for every answer Supabase gives,
// so the page never reveals whether an address has an account. The redirect
// values are kept exactly so a template rollback restores today's behaviour.
//
// After a successful password sign-in we apply any queued pending_role and
// route the user to their role's dashboard. Old-format links land back on
// /login/callback, which performs the same role-based redirect.
// =============================================================================

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { ArrowRight, CheckCircle, KeyRound, Loader2, Lock, Mail } from 'lucide-react';

import { loginDestination } from '@/lib/roleAccess.mjs';
import {
  parseLoginError, parseLoginMode, REQUEST_COOLDOWN_SECONDS, requestMessage, requestOutcome,
} from '@/lib/authLinks.mjs';

function safeReturnTo(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

function frenchifyAuthError(message) {
  if (!message) return 'Une erreur est survenue.';
  if (/invalid login credentials/i.test(message)) {
    return 'Email ou mot de passe incorrect.';
  }
  if (/email not confirmed/i.test(message)) {
    return "Votre adresse email n'est pas encore confirmée.";
  }
  if (/rate.?limit/i.test(message)) {
    return 'Trop de tentatives. Veuillez réessayer dans quelques minutes.';
  }
  return message;
}

function LoginInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const returnTo     = safeReturnTo(searchParams.get('returnTo'));

  const linkError    = parseLoginError(searchParams.get('error'));

  // mode: 'password' (default) | 'link' | 'reset'
  const [mode, setMode] = useState(() => linkError?.mode || parseLoginMode(searchParams.get('mode')) || 'password');
  // A failed old-format link (closed map, never echoed).
  const [linkNotice, setLinkNotice] = useState(linkError?.message || null);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // password mode:      idle | signing-in | error
  // link / reset modes: idle | sending | sent | connection
  const [status, setStatus] = useState('idle');
  const [error,  setError]  = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ── Password sign-in ─────────────────────────────────────────────────────
  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;

    setStatus('signing-in');
    setError(null);

    const sb = getBrowserClient();
    const { error: signInError } = await sb.auth.signInWithPassword({
      email:    trimmedEmail,
      password,
    });

    if (signInError) {
      setError(frenchifyAuthError(signInError.message));
      setStatus('error');
      return;
    }

    // Apply any queued pending_role (rare on password sign-in, but safe).
    let appliedRole = null;
    try {
      const { data } = await sb.rpc('apply_pending_role');
      appliedRole = data || null;
    } catch { /* fall through */ }

    if (!appliedRole) {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: profile } = await sb
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        appliedRole = profile?.role || null;
      }
    }

    const target = loginDestination(appliedRole, returnTo);
    router.replace(target);
  }

  // ── Sign-in link or new-password request ─────────────────────────────────
  async function handleRequestSubmit(event) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || cooldown > 0) return;

    setStatus('sending');
    setError(null);
    setLinkNotice(null);

    const sb = getBrowserClient();
    let requestError = null;
    try {
      if (mode === 'reset') {
        const { error: resetError } = await sb.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/login/callback`,
        });
        requestError = resetError;
      } else {
        const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
        const { error: otpError } = await sb.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/login/callback${next}`,
            // Accounts come only from invitations (plan PRF-r2 D11): an unknown
            // address gets no account from this form.
            shouldCreateUser: false,
          },
        });
        requestError = otpError;
      }
    } catch (thrown) {
      requestError = thrown;
    }

    // Same sentence for every answer, 429 included (plan ELW-r3, review B5); only a
    // request that got no answer at all shows the connection message.
    setError(requestMessage(requestError));
    const outcome = requestOutcome(requestError);
    setStatus(outcome);
    if (outcome === 'sent') setCooldown(REQUEST_COOLDOWN_SECONDS);
  }

  function switchTo(nextMode) {
    setMode(nextMode);
    setStatus('idle');
    setError(null);
    setLinkNotice(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--brand-deep)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/eh-logo.png"
            alt="English Hills"
            className="h-14 w-auto mx-auto mb-4 brightness-0 invert opacity-95"
          />
          <p className="text-white/70 text-xs tracking-[0.25em] uppercase font-medium">
            English Hills Language Center
          </p>
          <p className="text-white/40 text-xs italic mt-1.5">
            Learn Today, Lead Tomorrow
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          {mode === 'password' ? (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">Connexion</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Connectez-vous avec votre adresse email et votre mot de passe.
              </p>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@example.com"
                      disabled={status === 'signing-in'}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={status === 'signing-in'}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {error}
                  </div>
                )}

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => switchTo('reset')}
                    className="text-xs font-medium hover:underline"
                    style={{ color: 'var(--brand)' }}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={status === 'signing-in' || !email || !password}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
                  style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
                >
                  {status === 'signing-in' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Connexion…
                    </>
                  ) : (
                    <>
                      Se connecter
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-border text-center">
                <button
                  type="button"
                  onClick={() => switchTo('link')}
                  className="text-xs font-medium hover:underline inline-flex items-center gap-1.5"
                  style={{ color: 'var(--brand)' }}
                >
                  <KeyRound size={12} />
                  Recevoir un lien de connexion
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">
                {mode === 'reset' ? 'Mot de passe oublié ?' : 'Recevoir un lien de connexion'}
              </h1>
              <p className="text-sm text-muted-foreground mb-6">
                {mode === 'reset'
                  ? 'Saisissez votre adresse email : vous recevrez un lien pour choisir un nouveau mot de passe.'
                  : 'Saisissez votre adresse email : vous recevrez un lien de connexion sécurisé.'}
              </p>

              {linkNotice && (
                <div role="alert" data-testid="login-link-error" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4">
                  {linkNotice}
                </div>
              )}

              <form onSubmit={handleRequestSubmit} className="space-y-4" data-mode={mode}>
                <div>
                  <label htmlFor="request-email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      id="request-email"
                      type="email"
                      required
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@example.com"
                      disabled={status === 'sending'}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
                    />
                  </div>
                </div>

                {status === 'sent' && error && (
                  <div role="status" data-testid="request-answer" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex gap-2">
                    <CheckCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                {status === 'connection' && error && (
                  <div role="alert" data-testid="request-answer" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending' || !email || cooldown > 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
                  style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Envoi en cours…
                    </>
                  ) : cooldown > 0 ? (
                    <>Nouvel envoi possible dans {cooldown} s</>
                  ) : (
                    <>
                      {mode === 'reset' ? 'Recevoir le lien' : 'Recevoir un lien de connexion'}
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => switchTo(mode === 'reset' ? 'link' : 'reset')}
                  className="text-xs font-medium hover:underline"
                  style={{ color: 'var(--brand)' }}
                >
                  {mode === 'reset' ? 'Recevoir plutôt un lien de connexion' : 'Mot de passe oublié ?'}
                </button>
              </div>

              <div className="mt-5 pt-4 border-t border-border text-center">
                <button
                  type="button"
                  onClick={() => switchTo('password')}
                  className="text-xs font-medium hover:underline"
                  style={{ color: 'var(--brand)' }}
                >
                  Retour à la connexion par mot de passe
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          Almaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
