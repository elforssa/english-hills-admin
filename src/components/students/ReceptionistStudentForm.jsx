'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { entities, integrations } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import { SESSION_TYPES, getLevelsForSession } from '@/lib/academicPrograms';
import StorageImage from '@/components/StorageImage';
import { ArrowLeft } from 'lucide-react';

const input = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary';
const categories = ['Young Learners (6-12)','Teens (13-17)','Adults (18+)','Corporate'];
const sources = ['Réseaux sociaux (Facebook / Instagram)','Recherche Google','Famille / Ami(e)',
  'Passage devant le centre (walk-in)','Ancien élève / Réinscription'];
const initial = { full_name: '', date_naissance: '', telephone: '', email: '', parent_email: '',
  age_category: '', notes: '', session_type: 'Yearly', niveau_cefr: '', referral_source: '', photo_url: '' };

export default function ReceptionistStudentForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [original, setOriginal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (field, value) => setForm(v => ({ ...v, [field]: value }));
  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    entities.Student.filter({ id }).then(([student]) => {
      if (!active || !student) return;
      setOriginal(student);
      setForm(Object.fromEntries(Object.keys(initial).map(key => [key, student[key] ?? initial[key]])));
    }).catch(err => toast.error(err.message));
    return () => { active = false; };
  }, [id, isEdit]);

  const uploadPhoto = async event => {
    const file = event.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file, purpose: 'student_photo', studentId: id });
      set('photo_url', file_url);
    } catch (err) { toast.error(err.message); }
    finally { setUploading(false); }
  };
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const changes = isEdit ? {
      full_name: form.full_name, date_naissance: form.date_naissance || null, telephone: form.telephone || null,
      age_category: form.age_category || null, notes: form.notes || null, photo_url: form.photo_url || null,
    } : {
      ...form, date_naissance: form.date_naissance || null, telephone: form.telephone || null,
      email: form.email || null, parent_email: form.parent_email || null,
      age_category: form.age_category || null, notes: form.notes || null,
      niveau_cefr: form.niveau_cefr || null, referral_source: form.referral_source || null,
      photo_url: form.photo_url || null,
    };
    const studentId = id || crypto.randomUUID();
    const { error } = await getBrowserClient().rpc('save_receptionist_student', {
      p_student: studentId, p_expected_updated_at: isEdit ? original?.updated_at : null, p_changes: changes,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? 'Apprenant mis à jour' : 'Apprenant créé');
    router.push(`/students/${studentId}`);
  };
  if (isEdit && !original) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  return <div className="p-8 max-w-2xl">
    <button type="button" onClick={() => router.push('/students')} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Retour</button>
    <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Modifier l’apprenant' : 'Ajouter un apprenant'}</h1>
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-6 space-y-5">
      {isEdit && <div className="flex items-center gap-3">
        {form.photo_url && <StorageImage src={form.photo_url} alt="" className="w-12 h-12 object-cover rounded-full" />}
        <label className="text-sm">Photo<input type="file" accept="image/jpeg,image/png" disabled={uploading}
          onChange={uploadPhoto} className="block text-sm" /></label>
      </div>}
      <label className="block text-sm">Nom complet *<input className={input} required minLength={2} maxLength={120}
        value={form.full_name} onChange={e => set('full_name', e.target.value)} /></label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">Date de naissance<input className={input} type="date" value={form.date_naissance}
          onChange={e => set('date_naissance', e.target.value)} /></label>
        <label className="block text-sm">Téléphone<input className={input} value={form.telephone}
          onChange={e => set('telephone', e.target.value)} /></label>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">Email apprenant<input className={input} type="email" readOnly={isEdit}
          value={form.email} onChange={e => set('email', e.target.value)} /></label>
        <label className="block text-sm">Email parent<input className={input} type="email" readOnly={isEdit}
          value={form.parent_email} onChange={e => set('parent_email', e.target.value)} /></label>
      </div>
      <label className="block text-sm">Catégorie d’âge<select className={input} value={form.age_category}
        onChange={e => set('age_category', e.target.value)}><option value="">—</option>
        {categories.map(value => <option key={value}>{value}</option>)}</select></label>
      {isEdit ? <p className="text-sm text-muted-foreground">Session : {form.session_type || '—'} · Niveau : {form.niveau_cefr || '—'}.
        Utilisez les inscriptions et groupes pour modifier l’affectation.</p> : <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">Session<select className={input} value={form.session_type}
          onChange={e => setForm(v => ({ ...v, session_type: e.target.value, niveau_cefr: '' }))}>
          {SESSION_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-sm">Niveau<select className={input} value={form.niveau_cefr}
          onChange={e => set('niveau_cefr', e.target.value)}><option value="">—</option>
          {getLevelsForSession(form.session_type).map(value => <option key={value}>{value}</option>)}</select></label>
      </div>}
      {!isEdit && <label className="block text-sm">Source<select className={input} value={form.referral_source}
        onChange={e => set('referral_source', e.target.value)}><option value="">—</option>
        {sources.map(value => <option key={value}>{value}</option>)}</select></label>}
      <label className="block text-sm">Notes<textarea className={input} maxLength={2000} value={form.notes}
        onChange={e => set('notes', e.target.value)} /></label>
      <div className="flex gap-3"><button disabled={saving || uploading} className="bg-primary text-white px-4 py-2 rounded-md">Enregistrer</button>
        <button type="button" onClick={() => router.back()} className="border px-4 py-2 rounded-md">Annuler</button></div>
    </form>
  </div>;
}
