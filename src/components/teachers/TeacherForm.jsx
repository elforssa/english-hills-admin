'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { entities, integrations } from '@/lib/entities';
import { toast } from 'sonner';
import { ArrowLeft, Upload } from 'lucide-react';
import StorageImage from '@/components/StorageImage';
import { ADULT_LEVELS, LEGACY_LEVELS, YEARLY_LEVELS } from '@/lib/academicPrograms';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';
import { getBrowserClient } from '@/lib/supabase';
import { getTeacherOperations } from '@/lib/teacher-directory';
import { isRecordConflict, recordConflictMessage } from '@/lib/conflictErrors.mjs';
import { createLearnerIdentity } from '@/lib/studentCreate.mjs';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { useAuth } from '@/context/AuthContext';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";
const CERTS = ['CELTA','DELTA','TKT','Licence','Master','Autre'];
const LEVEL_SECTIONS = [
  ['Yearly', YEARLY_LEVELS],
  ['Adults', ADULT_LEVELS],
  ['Autres programmes', LEGACY_LEVELS],
];

export default function TeacherForm() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = Boolean(id);
  // RPW-r2 items 18, 18p, 19: one form for every staff role. A role without the pay view
  // (reception) saves through its command: no contract, salary, rate or IBAN, ever.
  const { role } = useAuth();
  const viaCommand = !hasCapability(role, 'canViewTeacherCompensation');
  const [version, setVersion] = useState(null);
  // REL-4: one teacher id from the first send to a confirmed success.
  const [newTeacherId] = useState(() => createLearnerIdentity());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    full_name: '', telephone: '', email: '', contract_type: 'Freelance',
    certifications: [], niveaux_autorises: [], taux_horaire: '', salaire_mensuel: '',
    iban: '', photo_url: '', notes: '',
  });

  const show = (row) => {
    if (!row) return;
    setVersion(row.updated_at ?? null);
    setForm(f => ({ ...f, ...row, certifications: row.certifications || [], niveaux_autorises: row.niveaux_autorises || [] }));
  };
  const loadTeacher = () => (viaCommand ? getTeacherOperations({ id }) : entities.Teacher.filter({ id }))
    .then(d => show(d[0])).catch(err => toast.error(err?.message || 'Enseignant indisponible.'));
  useEffect(() => {
    if (isEdit) loadTeacher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit, viaCommand]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleArr = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));

  const [photoPreview, setPhotoPreview] = useState(null);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file, purpose: 'teacher_photo', teacherId: id || null });
      set('photo_url', file_url);
      setPhotoPreview(URL.createObjectURL(file));
      toast.success('Photo téléversée');
    } catch (err) {
      toast.error(err?.message || "Échec du téléversement de la photo.");
    } finally {
      setUploading(false);
    }
  };

  const saveViaCommand = async () => {
    const changes = {
      full_name: form.full_name, telephone: form.telephone || '', email: form.email || '',
      certifications: form.certifications, niveaux_autorises: form.niveaux_autorises,
      notes: form.notes || '', photo_url: form.photo_url || '',
    };
    const teacherId = id || newTeacherId.current();
    const { error } = await getBrowserClient().rpc('save_receptionist_teacher_operations', {
      p_teacher: teacherId, p_expected_updated_at: isEdit ? version : null, p_changes: changes,
    });
    setSaving(false);
    if (error && isEdit && isRecordConflict(error)) {
      // Changed in the meantime (ADR-009): reload the latest record for review.
      toast.error(recordConflictMessage());
      invalidateAfterLearnerSave(qc);
      await loadTeacher();
      return;
    }
    if (error && !isEdit && /identity conflict/i.test(error.message || '')) {
      newTeacherId.settle('already_created');
      toast.error('Cet enseignant a déjà été créé lors d’un envoi précédent. Ouvrez sa fiche pour le modifier.');
      router.push('/teachers');
      return;
    }
    if (error) {
      const message = String(error.hint || '').startsWith('rpw.') ? error.message
        : error.code === '23505' ? 'Un enseignant utilise déjà cet e-mail.'
        : 'Enregistrement impossible. Réessayez.';
      toast.error(message);
      return;
    }
    if (!isEdit) newTeacherId.settle('created');
    invalidateAfterLearnerSave(qc);
    toast.success(isEdit ? 'Enseignant mis à jour' : 'Enseignant créé');
    router.push(`/teachers/${teacherId}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (viaCommand) { await saveViaCommand(); return; }
    const data = { ...form, taux_horaire: parseFloat(form.taux_horaire) || null, salaire_mensuel: parseFloat(form.salaire_mensuel) || null };
    try {
      if (isEdit) {
        await entities.Teacher.update(id, data);
        toast.success('Enseignant mis à jour');
      } else {
        await entities.Teacher.create(data);
        toast.success('Enseignant créé');
      }
      invalidateAfterLearnerSave(qc);
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
          <div className="col-span-2 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 border border-border">
              {form.photo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <StorageImage src={photoPreview || form.photo_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-xl font-bold text-muted-foreground">{form.full_name?.[0] || '?'}</span>}
            </div>
            <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted cursor-pointer">
              <Upload size={14} /> {uploading ? 'Téléversement…' : 'Photo'}
              <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhoto} disabled={uploading} />
            </label>
          </div>
          <div className="col-span-2"><label htmlFor="teacher_full_name" className={labelClass}>Nom complet *</label><input id="teacher_full_name" className={inputClass} value={form.full_name} onChange={e => set('full_name', e.target.value)} required /></div>
          <div><label htmlFor="teacher_telephone" className={labelClass}>Téléphone</label><input id="teacher_telephone" className={inputClass} value={form.telephone || ''} onChange={e => set('telephone', e.target.value)} /></div>
          <div><label htmlFor="teacher_email" className={labelClass}>Email{viaCommand ? ' *' : ''}</label><input id="teacher_email" type="email" required={viaCommand} className={inputClass} value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
          {viaCommand && <p className="col-span-2 text-xs text-muted-foreground">Le contrat et la rémunération sont complétés par la direction.</p>}
          {!viaCommand && <><div>
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
          <div className="col-span-2"><label className={labelClass}>IBAN (virement salaire)</label><input className={inputClass} value={form.iban || ''} onChange={e => set('iban', e.target.value)} placeholder="MA64 ..." /></div></>}
          <div className="col-span-2">
            <label className={labelClass}>Niveaux autorisés</label>
            <div className="space-y-3 mt-2">
              {LEVEL_SECTIONS.map(([session, levels]) => (
                <div key={session}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{session}</p>
                  <div className="flex gap-2 flex-wrap">
                    {levels.map(n => (
                      <button key={n} type="button" onClick={() => toggleArr('niveaux_autorises', n)}
                        className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${form.niveaux_autorises.includes(n) ? 'bg-primary text-white border-transparent' : 'bg-white text-foreground border-border'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
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
          <div className="col-span-2"><label htmlFor="teacher_notes" className={labelClass}>Notes</label><textarea id="teacher_notes" className={`${inputClass} h-20 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || uploading} className="px-5 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50 bg-primary">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button type="button" onClick={() => router.push('/teachers')} className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground">Annuler</button>
        </div>
      </form>
    </div>
  );
}
