'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { entities, auth } from '@/lib/entities';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";
const NIVEAUX = ['A1','A2','B1','B2','C1','C2'];
const CERTS = ['CELTA','DELTA','TKT','Licence','Master','Autre'];

export default function TeacherForm() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '', telephone: '', email: '', contract_type: 'Freelance',
    certifications: [], niveaux_autorises: [], taux_horaire: '', salaire_mensuel: '', notes: '',
  });

  useEffect(() => {
    if (isEdit) entities.Teacher.filter({ id }).then(d => { if (d[0]) setForm({ ...d[0], certifications: d[0].certifications || [], niveaux_autorises: d[0].niveaux_autorises || [] }); });
  }, [id, isEdit]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleArr = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = { ...form, taux_horaire: parseFloat(form.taux_horaire) || null, salaire_mensuel: parseFloat(form.salaire_mensuel) || null };
    try {
      if (isEdit) {
        await entities.Teacher.update(id, data);
        toast.success('Enseignant mis à jour');
      } else {
        await entities.Teacher.create(data);
        toast.success('Enseignant créé');
      }
      qc.invalidateQueries({ queryKey: ['Teacher'] });
      router.push('/teachers');
    } catch {
      // entities.js already toasted — stay on the form for retry.
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <button onClick={() => router.push('/teachers')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"><ArrowLeft size={15} /> Retour</button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? "Modifier l'enseignant" : 'Ajouter un enseignant'}</h1>
      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className={labelClass}>Nom complet *</label><input className={inputClass} value={form.full_name} onChange={e => set('full_name', e.target.value)} required /></div>
          <div><label className={labelClass}>Téléphone</label><input className={inputClass} value={form.telephone || ''} onChange={e => set('telephone', e.target.value)} /></div>
          <div><label className={labelClass}>Email</label><input type="email" className={inputClass} value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div>
            <label className={labelClass}>Type de contrat</label>
            <select className={inputClass} value={form.contract_type} onChange={e => set('contract_type', e.target.value)}>
              <option>Employé</option><option>Freelance</option>
            </select>
          </div>
          {form.contract_type === 'Employé' ? (
            <div><label className={labelClass}>Salaire mensuel (MAD)</label><input type="number" className={inputClass} value={form.salaire_mensuel || ''} onChange={e => set('salaire_mensuel', e.target.value)} /></div>
          ) : (
            <div><label className={labelClass}>Taux horaire (MAD)</label><input type="number" className={inputClass} value={form.taux_horaire || ''} onChange={e => set('taux_horaire', e.target.value)} /></div>
          )}
          <div className="col-span-2">
            <label className={labelClass}>Niveaux autorisés</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {NIVEAUX.map(n => (
                <button key={n} type="button" onClick={() => toggleArr('niveaux_autorises', n)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${form.niveaux_autorises.includes(n) ? 'text-white border-transparent' : 'bg-white text-foreground border-border'}`}
                  style={form.niveaux_autorises.includes(n) ? { backgroundColor: '#1E4D8B' } : {}}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Certifications</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {CERTS.map(c => (
                <button key={c} type="button" onClick={() => toggleArr('certifications', c)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${form.certifications.includes(c) ? 'text-white border-transparent' : 'bg-white text-foreground border-border'}`}
                  style={form.certifications.includes(c) ? { backgroundColor: '#B91C2E' } : {}}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2"><label className={labelClass}>Notes</label><textarea className={`${inputClass} h-20 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#1E4D8B' }}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button type="button" onClick={() => router.push('/teachers')} className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground">Annuler</button>
        </div>
      </form>
    </div>
  );
}
