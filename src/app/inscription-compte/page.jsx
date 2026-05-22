// =============================================================================
// /inscription-compte — public account-activation page
//
// Reached via the link in Supabase's invite email. The invite token is
// exchanged for a session on mount (so we can show the invitee their email
// and detect expired/invalid links immediately). On submit, the user sets
// their password + full name; we then call apply_pending_role() to bump
// their profile from 'pending' to the role queued by /api/admin/invite,
// and redirect to the role-appropriate dashboard.
// =============================================================================

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle, Loader2, Lock, Mail, User as UserIcon } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';

const PORTAL_FOR_ROLE = {
  director: '/dashboard',
  admin:    '/dashboard',
  teacher:  '/teacher-portal',
  parent:   '/parent-portal',
  student:  '/student-portal',
};

function InscriptionCompteInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // phase: 'exchanging' | 'form' | 'submitting' | 'done' | 'expired'
  const [phase, setPhase]       = useState('exchanging');
  const [email, setEmail]       = useState('');
  const [prenom, setPrenom]     = useState('');
  const [nom, setNom]           = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  // ── Exchange the invite code on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getBrowserClient();
      const code = searchParams.get('code');

      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setPhase('expired');
          return;
        }
      }

      // Either the code-exchange succeeded or the older hash-token flow
      // already populated the session via detectSessionInUrl. Either way,
      // we need a user now to proceed.
      const { data: { user } } = await sb.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setPhase('expired');
        return;
      }

      setEmail(user.email || '');

      // Best-effort name prefill if Supabase already has user_metadata.
      const existingFullName = user.user_metadata?.full_name || '';
      if (existingFullName) {
        const [first, ...rest] = existingFullName.split(' ');
        setPrenom(first || '');
        setNom(rest.join(' '));
      }
      setPhase('form');
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg(null);

    if (!prenom.trim() || !nom.trim()) {
      setErrorMsg('Veuillez saisir votre prénom et votre nom.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setPhase('submitting');
    const sb = getBrowserClient();
    const fullName = `${prenom.trim()} ${nom.trim()}`;

    const { error: updateError } = await sb.auth.updateUser({
      password,
      data: { full_name: fullName },
    });
    if (updateError) {
      setErrorMsg(updateError.message || "Échec de l'activation. Veuillez réessayer.");
      setPhase('form');
      return;
    }

    // Mirror full_name onto the profiles row so the rest of the app picks
    // it up without a round-trip via user_metadata.
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await sb.from('profiles').update({ full_name: fullName }).eq('id', user.id);
    }

    // Apply the role queued by the inviter. The RPC returns the applied
    // role (or null if none was queued — shouldn't happen for an invitee).
    let appliedRole = null;
    const { data: rpcRole } = await sb.rpc('apply_pending_role');
    appliedRole = rpcRole || null;

    if (!appliedRole && user) {
      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      appliedRole = profile?.role || null;
    }

    setPhase('done');
    const target = PORTAL_FOR_ROLE[appliedRole] || '/unauthorized';
    setTimeout(() => router.replace(target), 1200);
  }

  // ── Render ───────────────────────────────────────────────────────────────
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
          {phase === 'exchanging' && (
            <div className="flex flex-col items-center py-6 text-center">
              <Loader2 size={22} className="animate-spin mb-3" style={{ color: '#1E4D8B' }} />
              <p className="text-sm text-muted-foreground">Vérification du lien d&apos;invitation…</p>
            </div>
          )}

          {phase === 'expired' && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <AlertCircle size={22} className="text-red-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground mb-1.5">
                  Lien d&apos;invitation expiré
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Ce lien d&apos;invitation a expiré. Veuillez contacter l&apos;administration.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition"
                style={{ backgroundColor: '#1E4D8B' }}
              >
                Retour à la connexion
              </Link>
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground mb-1.5">
                  Bienvenue&nbsp;!
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Redirection en cours…
                </p>
              </div>
              <Loader2 size={18} className="animate-spin mx-auto" style={{ color: '#1E4D8B' }} />
            </div>
          )}

          {(phase === 'form' || phase === 'submitting') && (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">
                Créez votre compte English Hills
              </h1>
              <p className="text-sm text-muted-foreground mb-6">
                Définissez votre mot de passe pour activer votre accès.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      id="email"
                      type="email"
                      readOnly
                      value={email}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-muted text-muted-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="prenom" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Prénom
                    </label>
                    <div className="relative">
                      <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                      <input
                        id="prenom"
                        type="text"
                        required
                        autoComplete="given-name"
                        value={prenom}
                        onChange={(e) => setPrenom(e.target.value)}
                        disabled={phase === 'submitting'}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="nom" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Nom
                    </label>
                    <input
                      id="nom"
                      type="text"
                      required
                      autoComplete="family-name"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      disabled={phase === 'submitting'}
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
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
                      autoComplete="new-password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={phase === 'submitting'}
                      placeholder="8 caractères minimum"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      id="confirm"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={8}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      disabled={phase === 'submitting'}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={phase === 'submitting'}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
                  style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
                >
                  {phase === 'submitting' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Activation en cours…
                    </>
                  ) : (
                    <>
                      Activer mon compte
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>
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

export default function InscriptionComptePage() {
  return (
    <Suspense fallback={null}>
      <InscriptionCompteInner />
    </Suspense>
  );
}
