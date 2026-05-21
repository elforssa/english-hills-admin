'use client';

import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { ArrowRight, CheckCircle, Loader2, Mail } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail]   = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError]   = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus('sending');
    setError(null);

    try {
      const sb = getBrowserClient();
      const { error: signInError } = await sb.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/login/callback`,
        },
      });

      if (signInError) {
        setError(signInError.message);
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch (err) {
      setError(err?.message || 'Une erreur est survenue.');
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setError(null);
    setEmail('');
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#1E3A6E' }}
    >
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
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

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          {status === 'sent' ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground mb-1.5">
                  Lien de connexion envoyé
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Un email contenant votre lien de connexion vient d&apos;être envoyé à <strong className="text-foreground">{email}</strong>.
                  <br />
                  Cliquez sur le lien dans votre boîte mail pour accéder à la plateforme. Le lien expire dans 1 heure.
                </p>
              </div>
              <button
                onClick={reset}
                className="text-xs font-medium hover:underline"
                style={{ color: '#1E4D8B' }}
              >
                Utiliser une autre adresse
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">Connexion</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Saisissez votre adresse email — nous vous enverrons un lien de connexion sécurisé.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
                  >
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60"
                    />
                    <input
                      id="email"
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
                      Recevoir le lien de connexion
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <p className="text-[11px] text-muted-foreground text-center mt-5 leading-relaxed">
                Pas besoin de mot de passe. Le lien que vous recevrez vous connectera directement.
              </p>
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
