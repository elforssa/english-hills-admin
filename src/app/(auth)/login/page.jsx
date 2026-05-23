// =============================================================================
// /login — primary sign-in page.
//
// Default: email + password. Falls back to a magic-link flow (Supabase OTP)
// for users who have forgotten or never set a password.
//
// After a successful password sign-in we apply any queued pending_role and
// route the user to their role's dashboard. Magic-link recipients land back
// on /login/callback, which performs the same role-based redirect.
// =============================================================================

'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { ArrowRight, CheckCircle, KeyRound, Loader2, Lock, Mail } from 'lucide-react';

const PORTAL_FOR_ROLE = {
  director: '/dashboard',
  admin:    '/dashboard',
  teacher:  '/teacher-portal',
  parent:   '/parent-portal',
  student:  '/student-portal',
};

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

  // mode: 'password' (default) | 'magic'
  const [mode, setMode] = useState('password');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // password mode: idle | signing-in | error
  // magic mode:    idle | sending | sent | error
  const [status, setStatus] = useState('idle');
  const [error,  setError]  = useState(null);

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

    const target = returnTo || PORTAL_FOR_ROLE[appliedRole] || '/unauthorized';
    router.replace(target);
  }

  // ── Magic-link request ───────────────────────────────────────────────────
  async function handleMagicSubmit(event) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setStatus('sending');
    setError(null);

    const sb = getBrowserClient();
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    const { error: otpError } = await sb.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/login/callback${next}`,
      },
    });

    if (otpError) {
      setError(frenchifyAuthError(otpError.message));
      setStatus('error');
      return;
    }
    setStatus('sent');
  }

  function switchTo(nextMode) {
    setMode(nextMode);
    setStatus('idle');
    setError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#1E3A6E' }}>
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
          {mode === 'magic' && status === 'sent' ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground mb-1.5">
                  Lien de connexion envoyé
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Un lien de connexion vient d&apos;être envoyé à <strong className="text-foreground">{email}</strong>.
                  <br />
                  Cliquez sur le lien dans votre boîte mail pour vous connecter. Le lien expire dans 1 heure.
                </p>
              </div>
              <button
                onClick={() => { setEmail(''); switchTo('password'); }}
                className="text-xs font-medium hover:underline"
                style={{ color: '#1E4D8B' }}
              >
                Retour à la connexion par mot de passe
              </button>
            </div>
          ) : mode === 'password' ? (
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
                    onClick={() => switchTo('magic')}
                    className="text-xs font-medium hover:underline"
                    style={{ color: '#1E4D8B' }}
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
                  onClick={() => switchTo('magic')}
                  className="text-xs font-medium hover:underline inline-flex items-center gap-1.5"
                  style={{ color: '#1E4D8B' }}
                >
                  <KeyRound size={12} />
                  Connexion par lien magique
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">
                Connexion par lien magique
              </h1>
              <p className="text-sm text-muted-foreground mb-6">
                Vous recevrez un lien de connexion sécurisé par email. Utile si vous avez oublié votre mot de passe.
              </p>

              <form onSubmit={handleMagicSubmit} className="space-y-4">
                <div>
                  <label htmlFor="magic-email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      id="magic-email"
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

                {error && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending' || !email}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
                  style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Envoi en cours…
                    </>
                  ) : (
                    <>
                      Recevoir un lien de connexion
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-border text-center">
                <button
                  type="button"
                  onClick={() => switchTo('password')}
                  className="text-xs font-medium hover:underline"
                  style={{ color: '#1E4D8B' }}
                >
                  Retour à la connexion par mot de passe
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          Bouskoura / Sidi Maarouf, Casablanca
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
