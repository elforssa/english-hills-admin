'use client';

import { useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { CheckCircle, Upload, ArrowLeft } from 'lucide-react';

const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

export default function PublicEnrollment() {
  const [form, setForm] = useState({
    full_name: '', date_naissance: '', telephone: '', email: '',
    age_category: '', niveau_cefr: '', notes: '',
  });
  const [docUrls, setDocUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setDocUrls(prev => [...prev, ...urls]);
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form._hp) return;
    setSubmitting(true);
    const student = await entities.Student.create({
      full_name: form.full_name,
      date_naissance: form.date_naissance,
      telephone: form.telephone,
      email: form.email,
      age_category: form.age_category,
      niveau_cefr: form.niveau_cefr || undefined,
      notes: form.notes,
      status: 'Prospect',
    });
    await entities.Enrollment.create({
      student_id: student.id,
      status: 'Submitted',
      date_inscription: new Date().toISOString().split('T')[0],
      documents_urls: docUrls,
      notes: form.notes,
    });
    setDone(true);
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
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: '#f0f4fa' }}>
      <div className="max-w-xl mx-auto">
        <div className="mb-4">
          <a href="https://english-hills.com" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} /> Retour au site English Hills
          </a>
        </div>

        <div className="text-center mb-8">
          <img src="/eh-logo.png" alt="English Hills" className="h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: '#1E4D8B' }}>Pré-inscription</h1>
          <p className="text-gray-500 text-sm mt-1">English Hills Language Center · Bouskoura / Sidi Maarouf, Casablanca</p>
          <p className="text-xs text-gray-400 mt-1 italic">&quot;Learn Today, Lead Tomorrow&quot;</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
          <div>
            <label className={labelClass}>Nom complet *</label>
            <input className={inputClass} value={form.full_name} onChange={e => set('full_name', e.target.value)} required placeholder="Ex: Fatima Zahra Bennani" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date de naissance</label>
              <input type="date" className={inputClass} value={form.date_naissance} onChange={e => set('date_naissance', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Catégorie *</label>
              <select className={inputClass} value={form.age_category} onChange={e => set('age_category', e.target.value)} required>
                <option value="">— Choisir —</option>
                <option>Young Learners (6-12)</option>
                <option>Teens (13-17)</option>
                <option>Adults (18+)</option>
                <option>Corporate</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Téléphone *</label>
              <input className={inputClass} value={form.telephone} onChange={e => set('telephone', e.target.value)} required placeholder="+212 6XX-XXXXXX" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} placeholder="votre@email.com" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Niveau estimé (si connu)</label>
            <select className={inputClass} value={form.niveau_cefr} onChange={e => set('niveau_cefr', e.target.value)}>
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
            <label className={labelClass}>Message / Précisions (optionnel)</label>
            <textarea className={`${inputClass} h-20 resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Horaires préférés, objectifs, questions..." />
          </div>

          <button type="submit" disabled={submitting || uploading} className="w-full py-3 text-sm font-bold text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all" style={{ backgroundColor: '#1E4D8B' }}>
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
  );
}
