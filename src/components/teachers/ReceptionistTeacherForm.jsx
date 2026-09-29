'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getBrowserClient } from '@/lib/supabase';
import { getTeacherOperations } from '@/lib/teacher-directory';
import { ADULT_LEVELS, LEGACY_LEVELS, YEARLY_LEVELS } from '@/lib/academicPrograms';

const levels = [...new Set([...YEARLY_LEVELS, ...ADULT_LEVELS, ...LEGACY_LEVELS])];
const input = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-white';

export default function ReceptionistTeacherForm() {
  const { id } = useParams();
  const router = useRouter();
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState({ full_name: '', telephone: '', certifications: [], niveaux_autorises: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getTeacherOperations({ id }).then(([teacher]) => {
      if (!active) return;
      setOriginal(teacher || null);
      if (teacher) setForm({ full_name: teacher.full_name, telephone: teacher.telephone || '',
        certifications: teacher.certifications || [], niveaux_autorises: teacher.niveaux_autorises || [] });
    }).catch(err => toast.error(err.message));
    return () => { active = false; };
  }, [id]);

  const toggle = (field, value) => setForm(current => ({ ...current,
    [field]: current[field].includes(value) ? current[field].filter(v => v !== value) : [...current[field], value],
  }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const { error } = await getBrowserClient().rpc('save_receptionist_teacher_operations', {
      p_teacher: id, p_expected_updated_at: original.updated_at, p_changes: form,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Enseignant mis à jour');
    router.push(`/teachers/${id}`);
  };

  if (!original) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  return <div className="p-4 lg:p-8 max-w-2xl">
    <h1 className="text-2xl font-bold mb-6">Modifier le profil enseignant</h1>
    <form onSubmit={save} className="bg-card border rounded-lg p-6 space-y-5">
      <label className="block text-sm">Nom complet<input className={input} required value={form.full_name}
        onChange={e => setForm(v => ({ ...v, full_name: e.target.value }))} /></label>
      <label className="block text-sm">Email (lecture seule)<input className={input} readOnly value={original.email || ''} /></label>
      <label className="block text-sm">Téléphone<input className={input} value={form.telephone}
        onChange={e => setForm(v => ({ ...v, telephone: e.target.value }))} /></label>
      <fieldset><legend className="text-sm font-medium mb-2">Certifications</legend>
        <div className="flex flex-wrap gap-2">{['CELTA','DELTA','TKT','Licence','Master','Autre'].map(cert =>
          <button type="button" key={cert} onClick={() => toggle('certifications', cert)}
            className={`px-3 py-1 border rounded text-sm ${form.certifications.includes(cert) ? 'bg-primary text-white' : ''}`}>{cert}</button>)}</div>
      </fieldset>
      <fieldset><legend className="text-sm font-medium mb-2">Niveaux autorisés</legend>
        <div className="flex flex-wrap gap-2">{levels.map(level =>
          <button type="button" key={level} onClick={() => toggle('niveaux_autorises', level)}
            className={`px-3 py-1 border rounded text-sm ${form.niveaux_autorises.includes(level) ? 'bg-primary text-white' : ''}`}>{level}</button>)}</div>
      </fieldset>
      <div className="flex gap-3"><button disabled={saving} className="px-4 py-2 bg-primary text-white rounded-md">Enregistrer</button>
        <button type="button" onClick={() => router.back()} className="px-4 py-2 border rounded-md">Annuler</button></div>
    </form>
  </div>;
}
