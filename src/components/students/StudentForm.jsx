'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { entities, auth } from '@/lib/entities';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

export default function StudentForm() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '', date_naissance: '', telephone: '', email: '', parent_email: '',
    niveau_cefr: 'A1', age_category: 'Adults (18+)', status: 'Prospect', notes: '',
  });

  useEffect(() => {
    if (isEdit) {
      entities.Student.filter({ id }).then(d => {
        if (d[0]) setForm(d[0]);
      });
    }
  }, [id, isEdit]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await entities.Student.update(id, form);
        toast.success('Apprenant mis à jour');
      } else {
        await entities.Student.create(form);
        toast.success('Apprenant créé');
      }
      qc.invalidateQueries({ queryKey: ['Student'] });
      router.push('/students');
    } catch {
      // entities.js already toasted — stay on the form for retry.
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <button onClick={() => router.push('/students')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft size={15} /> Retour
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? "Modifier l'apprenant" : 'Ajouter un apprenant'}</h1>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Nom complet *</label>
            <input className={inputClass} value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Date de naissance</label>
            <input type="date" className={inputClass} value={form.date_naissance || ''} onChange={e => set('date_naissance', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Téléphone</label>
            <input className={inputClass} value={form.telephone || ''} onChange={e => set('telephone', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Email (apprenant)</label>
            <input type="email" className={inputClass} value={form.email || ''} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Email parent / tuteur</label>
            <input type="email" className={inputClass} value={form.parent_email || ''} onChange={e => set('parent_email', e.target.value)} placeholder="Pour accès portail parent" />
          </div>
          <div>
            <label className={labelClass}>Catégorie d&apos;âge</label>
            <select className={inputClass} value={form.age_category || ''} onChange={e => set('age_category', e.target.value)}>
              {['Young Learners (6-12)','Teens (13-17)','Adults (18+)','Corporate'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Niveau CECRL</label>
            <select className={inputClass} value={form.niveau_cefr || ''} onChange={e => set('niveau_cefr', e.target.value)}>
              {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Statut</label>
            <select className={inputClass} value={form.status || ''} onChange={e => set('status', e.target.value)}>
              {['Prospect','Enrolled','Trial','Inactive','Alumni'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea className={`${inputClass} h-20 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#1E4D8B' }}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button type="button" onClick={() => router.push('/students')} className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground">Annuler</button>
        </div>
      </form>
    </div>
  );
}
