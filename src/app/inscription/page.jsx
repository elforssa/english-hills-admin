'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import Image from 'next/image';
import { integrations } from '@/lib/entities';
import { CheckCircle, Upload, ArrowLeft } from 'lucide-react';

const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

// Public Turnstile site key — safe in the browser. The matching secret is
// only used server-side in /api/public/inscription.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function PublicEnrollment() {
  const [form, setForm] = useState({
    full_name: '', date_naissance: '', telephone: '', email: '', parent_email: '',
    age_category: '', niveau_cefr: '', notes: '', consent: false,
  });
  const [docUrls, setDocUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetId = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Render the Turnstile widget once the script + DOM are ready.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.turnstile || !turnstileContainerRef.current) return;
      if (turnstileWidgetId.current) return;
      turnstileWidgetId.current = window.turnstile.render(
        turnstileContainerRef.current,
        {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => setTurnstileToken(token),
          'error-callback': () => setTurnstileToken(''),
          'expired-callback': () => setTurnstileToken(''),
          theme: 'light',
          language: 'fr',
        },
      );
    };
    if (window.turnstile) render();
    else {
      const interval = setInterval(() => {
        if (window.turnstile) { clearInterval(interval); render(); }
      }, 200);
      return () => { cancelled = true; clearInterval(interval); };
    }
    return () => { cancelled = true; };
  }, []);

  const handleFile = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const { file_url } = await integrations.Core.UploadFile({ file });
        urls.push(file_url);
      }
      setDocUrls(prev => [...prev, ...urls]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[inscription] upload failed:', err);
      // integrations.UploadFile already toasted.
    } finally {
      setUploading(false);
    }
  };

  const isYoungLearner = form.age_category === 'Young Learners (6-12)';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form._hp) return;

    // Client-side check matches the server: at least one email is required.
    if (!form.email && !form.parent_email) {
      alert('Veuillez fournir au moins un email (apprenant ou parent).');
      return;
    }
    if (!form.consent) {
      alert('Veuillez accepter la politique de confidentialité pour soumettre votre demande.');
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      alert('Veuillez compléter la vérification anti-robot.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:      form.full_name,
          date_naissance: form.date_naissance || undefined,
          telephone:      form.telephone,
          email:          form.email          || undefined,
          parent_email:   form.parent_email   || undefined,
          age_category:   form.age_category   || undefined,
          niveau_cefr:    form.niveau_cefr    || undefined,
          notes:          form.notes          || undefined,
          documents_urls: docUrls.length > 0 ? docUrls : undefined,
          consent:        form.consent,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      if (res.status === 429) {
        alert('Trop de soumissions depuis votre connexion. Veuillez réessayer dans une heure.');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Une erreur est survenue. Veuillez réessayer.');
        // Reset the Turnstile widget so the user can retry.
        if (window.turnstile && turnstileWidgetId.current) {
          window.turnstile.reset(turnstileWidgetId.current);
          setTurnstileToken('');
        }
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      alert('Erreur réseau. Vérifiez votre connexion et réessayez.');
      setSubmitting(false);
    }
  };

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#f0f4fa' }}>
      <div className="bg-white rounded-2xl p-10 text-center max-w-md shadow-xl">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#1E4D8B15' }}>
          <CheckCircle size={32} style={{ color: '#1E4D8B' }} />
        </div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#1E4D8B' }}>Demande reçue !</h2>
        <p className="text-gray-600 text-sm">Votre demande de pré-inscription a été soumise. Notre équipe vous contactera dans les 48h pour confirmer votre inscription.</p>
        <p className="text-xs text-gray-400 mt-4">English Hills Language Center · Bouskoura / Sidi Maarouf, Casablanca</p>
      </div>
    </div>
  );

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          async
          defer
          strategy="afterInteractive"
        />
      )}
      <div className="min-h-screen py-10 px-4" style={{ backgroundColor: '#f0f4fa' }}>
        <div className="max-w-xl mx-auto">
          <div className="mb-4">
            <a href="https://english-hills.com" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft size={14} /> Retour au site English Hills
            </a>
          </div>

          <div className="text-center mb-8">
            <Image src="/eh-logo.png" alt="English Hills" width={140} height={56} priority className="h-14 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-bold" style={{ color: '#1E4D8B' }}>Pré-inscription</h1>
            <p className="text-gray-500 text-sm mt-1">English Hills Language Center · Bouskoura / Sidi Maarouf, Casablanca</p>
            <p className="text-xs text-gray-400 mt-1 italic">&quot;Learn Today, Lead Tomorrow&quot;</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
            <div>
              <label htmlFor="full_name" className={labelClass}>Nom complet *</label>
              <input id="full_name" className={inputClass} value={form.full_name} onChange={e => set('full_name', e.target.value)} required placeholder="Ex: Fatima Zahra Bennani" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="date_naissance" className={labelClass}>Date de naissance</label>
                <input id="date_naissance" type="date" className={inputClass} value={form.date_naissance} onChange={e => set('date_naissance', e.target.value)} />
              </div>
              <div>
                <label htmlFor="age_category" className={labelClass}>Catégorie *</label>
                <select id="age_category" className={inputClass} value={form.age_category} onChange={e => set('age_category', e.target.value)} required>
                  <option value="">— Choisir —</option>
                  <option>Young Learners (6-12)</option>
                  <option>Teens (13-17)</option>
                  <option>Adults (18+)</option>
                  <option>Corporate</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="telephone" className={labelClass}>Téléphone *</label>
                <input id="telephone" className={inputClass} value={form.telephone} onChange={e => set('telephone', e.target.value)} required placeholder="+212 6XX-XXXXXX" />
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>
                  Email {!isYoungLearner && <span className="text-red-500">*</span>}
                </label>
                <input
                  id="email"
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="votre@email.com"
                  required={!isYoungLearner && !form.parent_email}
                />
              </div>
            </div>

            <div>
              <label htmlFor="parent_email" className={labelClass}>
                Email parent / tuteur {isYoungLearner && <span className="text-red-500">*</span>}
              </label>
              <input
                id="parent_email"
                type="email"
                className={inputClass}
                value={form.parent_email}
                onChange={e => set('parent_email', e.target.value)}
                placeholder={isYoungLearner ? "Obligatoire pour les jeunes apprenants" : "Optionnel — pour l'accès au portail parent"}
                required={isYoungLearner && !form.email}
              />
            </div>

            <div>
              <label htmlFor="niveau_cefr" className={labelClass}>Niveau estimé (si connu)</label>
              <select id="niveau_cefr" className={inputClass} value={form.niveau_cefr} onChange={e => set('niveau_cefr', e.target.value)}>
                <option value="">— Je ne sais pas / à évaluer —</option>
                {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Documents (optionnel)</label>
              <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center">
                <input type="file" multiple onChange={handleFile} className="hidden" id="doc-upload" accept=".pdf,.jpg,.jpeg,.png" />
                <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-500">Cliquer pour uploader des documents</span>
                  <span className="text-xs text-gray-400">PDF, JPG, PNG acceptés</span>
                </label>
                {uploading && <p className="text-xs text-blue-600 mt-2">Upload en cours...</p>}
                {docUrls.length > 0 && <p className="text-xs text-green-600 mt-2">✓ {docUrls.length} document(s) joint(s)</p>}
              </div>
            </div>

            <div>
              <label htmlFor="notes" className={labelClass}>Message / Précisions (optionnel)</label>
              <textarea id="notes" className={`${inputClass} h-20 resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Horaires préférés, objectifs, questions..." />
            </div>

            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <div ref={turnstileContainerRef} />
              </div>
            )}

            <div className="flex items-start gap-2">
              <input
                id="consent"
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-blue-500"
                checked={form.consent}
                onChange={e => set('consent', e.target.checked)}
                required
              />
              <label htmlFor="consent" className="text-xs text-gray-600 leading-relaxed">
                J&apos;accepte que mes données personnelles soient traitées par English Hills Language Center pour le traitement de cette demande de pré-inscription, conformément à la{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:opacity-80">
                  politique de confidentialité
                </a>
                {' '}et à la loi 09-08 relative à la protection des données personnelles (CNDP).
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || uploading || !form.consent || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
              className="w-full py-3 text-sm font-bold text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all bg-primary"
            >
              {submitting ? 'Envoi en cours...' : 'Soumettre ma demande'}
            </button>

            <input
              type="text"
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              value={form._hp || ''}
              onChange={e => set('_hp', e.target.value)}
            />
            <p className="text-xs text-gray-400 text-center">Vos données sont confidentielles et ne seront utilisées que pour votre inscription.</p>
          </form>
        </div>
      </div>
    </>
  );
}
