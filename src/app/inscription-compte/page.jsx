// =============================================================================
// /inscription-compte — public account-activation page
//
// New-format links (plan ELW-r3) are verified on /auth/confirm by a click, which
// then sends a never-activated account here with a session. A `token_hash` in
// this page's address is never verified here: it is forwarded to /auth/confirm
// with no Auth call. The fragment (#access_token) and ?code= branches stay for
// invitations sent with the old template and for rollback; those tokens were
// already verified by Supabase.
//
// Whether the form is shown is decided by the activation mark (a completed
// profiles.full_name), never by the role: the AuthContext sweep may already have
// applied the invited role. Submit order (review B7): the password, then the
// name (the mark, the form's last write), then apply_pending_role() and the read
// of the stored role.
// =============================================================================

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle, Loader2, Lock, Mail, User as UserIcon } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';

import { ROLE_HOME as PORTAL_FOR_ROLE } from '@/lib/roleAccess.mjs';
import { destinationFor, isActivated, isSamePassword, MESSAGES, passwordErrorMessage } from '@/lib/authLinks.mjs';

function InscriptionCompteInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // phase: 'exchanging' | 'form' | 'submitting' | 'done' | 'used' | 'activated'
  const [phase, setPhase]       = useState('exchanging');
  const [email, setEmail]       = useState('');
  const [prenom, setPrenom]     = useState('');
  const [nom, setNom]           = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [storedRole, setStoredRole] = useState(null);

  // ── Install an old-format session on mount; never verify a token_hash ────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tokenHash = searchParams.get('token_hash');
      if (tokenHash !== null) {
        // Plan ELW-r3 section 2: forward to the click-to-verify page, client-side,
        // with no Auth call (an old bookmark or a template mistake cannot bring
        // back verification on load).
        const forward = new URLSearchParams();
        forward.set('token_hash', tokenHash);
        forward.set('type', searchParams.get('type') || 'invite');
        window.location.replace(`/auth/confirm?${forward.toString()}`);
        return;
      }

      const sb = getBrowserClient();
      const code = searchParams.get('code');

      // Hash-based implicit flow: Supabase's default {{ .ConfirmationURL }}
      // template appends #access_token=…&refresh_token=… to the URL.
      // searchParams can't read hash fragments, so we parse window.location.hash.
      let hashAccessToken   = null;
      let hashRefreshToken  = null;
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        hashAccessToken  = hashParams.get('access_token');
        hashRefreshToken = hashParams.get('refresh_token');
      }

      // Drop any pre-existing local session before installing the invitee's —
      // commonly the inviter's session in the same browser. Without this,
      // the singleton client can keep returning the inviter's user object
      // even after the new session is installed.
      if (code || hashAccessToken) {
        await sb.auth.signOut({ scope: 'local' });
      }

      if (hashAccessToken) {
        // Hash-based implicit flow (default Supabase email template).
        // Install the invitee's tokens directly — no cookie exchange needed.
        const { error } = await sb.auth.setSession({
          access_token:  hashAccessToken,
          refresh_token: hashRefreshToken || '',
        });
        if (cancelled) return;
        // Clean up the hash so tokens aren't exposed in browser history.
        window.history.replaceState(null, '', window.location.pathname);
        if (error) {
          setPhase('used');
          return;
        }
      } else if (code) {
        // Fallback: classic /verify → ?code= redirect from the default
        // Supabase email template. Works only in the browser that asked.
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        window.history.replaceState(null, '', window.location.pathname);
        if (error) {
          setPhase('used');
          return;
        }
      }

      // The session now belongs to the invitee (or, after a reload or a click on
      // /auth/confirm, it is already in cookies).
      const { data: { user } } = await sb.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setPhase('used');
        return;
      }

      // The activation mark decides, not the role (plan ELW-r3, review B1).
      const { data: profile, error: readError } = await sb
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setEmail(user.email || '');
      if (!readError && isActivated(profile)) {
        setStoredRole(profile.role || null);
        setPhase('activated');
        return;
      }

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

    // (1) The password. Supabase refuses a password equal to the current one
    // (same_password): it is already set, so the form continues.
    const { error: updateError } = await sb.auth.updateUser({ password });
    if (updateError && !isSamePassword(updateError)) {
      setErrorMsg(passwordErrorMessage(updateError));
      setPhase('form');
      return;
    }

    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError || !user) {
      setErrorMsg(userError ? passwordErrorMessage(userError) : MESSAGES.sessionExpired);
      setPhase('form');
      return;
    }

    // (2) The name: the activation mark, the form's last write. Never present
    // without a password.
    const { data: written, error: profileError } = await sb
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id)
      .select('id');
    if (profileError || !written?.length) {
      setErrorMsg(MESSAGES.nameFailed);
      setPhase('form');
      return;
    }

    // (3) Apply the role queued by the inviter (the AuthContext sweep may already
    // have done it), then read the stored role. Neither writes for the form.
    let appliedRole = null;
    const { data: rpcRole, error: roleError } = await sb.rpc('apply_pending_role');
    if (roleError) {
      setErrorMsg("Le rôle du compte n'a pas pu être activé. Veuillez réessayer.");
      setPhase('form');
      return;
    }
    appliedRole = rpcRole || null;

    if (!appliedRole) {
      const { data: profile, error: readError } = await sb
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (readError) {
        setErrorMsg("Le rôle du compte n'a pas pu être vérifié. Veuillez réessayer.");
        setPhase('form');
        return;
      }
      appliedRole = profile?.role || null;
    }

    if (!PORTAL_FOR_ROLE[appliedRole]) {
      // The password is kept; the next password sign-in applies a new invitation.
      setErrorMsg(MESSAGES.invitationInvalid);
      setPhase('form');
      return;
    }

    setPhase('done');
    const target = PORTAL_FOR_ROLE[appliedRole] || '/unauthorized';
    setTimeout(() => router.replace(target), 1200);
  }

  // ── Render ───────────────────────────────────────────────────────────────
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
          {phase === 'exchanging' && (
            <div className="flex flex-col items-center py-6 text-center">
              <Loader2 size={22} className="animate-spin mb-3" style={{ color: 'var(--brand)' }} />
              <p className="text-sm text-muted-foreground">Chargement…</p>
            </div>
          )}

          {phase === 'used' && (
            <div className="text-center space-y-4" data-state="used">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                <AlertCircle size={22} className="text-amber-700" />
              </div>
              <p className="text-sm text-foreground leading-relaxed">{MESSAGES.used}</p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition bg-primary"
                >
                  Se connecter
                </Link>
                <Link href="/login?mode=reset" className="text-xs font-medium hover:underline" style={{ color: 'var(--brand)' }}>
                  Mot de passe oublié ?
                </Link>
              </div>
            </div>
          )}

          {phase === 'activated' && (
            <div className="text-center space-y-4" data-state="activated">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground mb-1.5">{MESSAGES.alreadyActivated}</h1>
                <p className="text-sm text-muted-foreground">
                  Vous êtes connecté avec <strong className="text-foreground">{email}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.replace(destinationFor(storedRole))}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg transition-all shadow-sm hover:shadow-md"
                style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
              >
                Continuer vers mon espace
                <ArrowRight size={14} />
              </button>
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
              <Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--brand)' }} />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
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
          Almaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca
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
