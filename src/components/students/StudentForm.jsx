'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { entities, integrations } from '@/lib/entities';
import { toast } from 'sonner';
import { ArrowLeft, Upload, Crown, CalendarDays } from 'lucide-react';
import StorageImage from '@/components/StorageImage';
import {
  ALL_LEVELS,
  SESSION_TYPES,
  getLevelsForSession,
  groupMatchesSelection,
} from '@/lib/academicPrograms';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const inputErrClass = "w-full border border-red-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-red-500";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const AGE_CATEGORIES = ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)', 'Corporate'];
const STATUSES = ['Prospect', 'Enrolled', 'Trial', 'Inactive', 'Alumni'];
const PHOTO_CONSENTS = ['Non demandé', 'Accepte', 'Refuse'];
const SOURCES = [
  'Réseaux sociaux (Facebook / Instagram)',
  'Recherche Google',
  'Famille / Ami(e)',
  'Passage devant le centre (walk-in)',
  'Ancien élève / Réinscription',
];

const StudentSchema = z.object({
  full_name:      z.string().trim().min(2, 'Au moins 2 caractères').max(120, 'Trop long (max 120)'),
  date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ').optional().or(z.literal('')),
  telephone:      z.string().trim().max(30, 'Trop long').optional().or(z.literal('')),
  email:          z.string().trim().email('Email invalide').optional().or(z.literal('')),
  parent_email:   z.string().trim().email('Email invalide').optional().or(z.literal('')),
  age_category:   z.enum(AGE_CATEGORIES).optional().or(z.literal('')),
  niveau_cefr:    z.enum(ALL_LEVELS).optional().or(z.literal('')),
  session_type:   z.enum(SESSION_TYPES).optional().or(z.literal('')),
  photo_consent:  z.enum(PHOTO_CONSENTS).optional().or(z.literal('')),
  referral_source: z.enum(SOURCES).optional().or(z.literal('')),
  status:         z.enum(STATUSES).optional().or(z.literal('')),
  groupe_id:      z.string().uuid().optional().or(z.literal('')),
  plan_type:      z.enum(['Standard', 'Premium']),
  premium_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ').optional().or(z.literal('')),
  premium_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ').optional().or(z.literal('')),
  photo_url:      z.string().optional().or(z.literal('')),
  notes:          z.string().max(2000, 'Trop long (max 2000)').optional().or(z.literal('')),
}).refine(
  (data) => !data.premium_start_date || !data.premium_end_date || data.premium_end_date >= data.premium_start_date,
  { message: 'La date de fin doit suivre la date de début', path: ['premium_end_date'] },
);

export default function StudentForm() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({
    full_name: '', date_naissance: '', telephone: '', email: '', parent_email: '',
    niveau_cefr: '', age_category: '', session_type: 'Yearly', status: 'Prospect',
    photo_consent: 'Non demandé', referral_source: '', groupe_id: '', plan_type: 'Standard',
    premium_start_date: '', premium_end_date: '', photo_url: '', notes: '',
  });

  useEffect(() => {
    entities.Group.list('name', 200).then(setGroups).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      entities.Student.filter({ id })
        .then(d => {
          if (d[0]) {
            const row = d[0];
            setForm(f => ({
              ...f,
              ...row,
              age_category: row.age_category ?? '',
              niveau_cefr:  row.niveau_cefr  ?? '',
              session_type: row.session_type ?? 'Yearly',
              photo_consent: row.photo_consent ?? 'Non demandé',
              referral_source: row.referral_source ?? '',
              status:       row.status       ?? '',
              date_naissance: row.date_naissance ?? '',
              telephone:    row.telephone    ?? '',
              email:        row.email        ?? '',
              parent_email: row.parent_email ?? '',
              groupe_id:    row.groupe_id     ?? '',
              plan_type:    row.plan_type     ?? 'Standard',
              premium_start_date: row.premium_start_date ?? '',
              premium_end_date: row.premium_end_date ?? '',
              photo_url:    row.photo_url     ?? '',
              notes:        row.notes        ?? '',
            }));
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[StudentForm] load failed:', err);
        });
    }
  }, [id, isEdit]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: undefined }));
  };

  const changeSession = (sessionType) => {
    setForm(f => ({
      ...f,
      session_type: sessionType,
      niveau_cefr: '',
      groupe_id: '',
      plan_type: sessionType === 'Yearly' ? f.plan_type : 'Standard',
      premium_start_date: sessionType === 'Yearly' ? f.premium_start_date : '',
      premium_end_date: sessionType === 'Yearly' ? f.premium_end_date : '',
    }));
    setErrors(e => ({ ...e, session_type: undefined, niveau_cefr: undefined, groupe_id: undefined }));
  };

  const changeLevel = (level) => {
    setForm(f => ({
      ...f,
      niveau_cefr: level,
      groupe_id: groups.some(g => g.id === f.groupe_id && groupMatchesSelection(g, f.session_type, level))
        ? f.groupe_id
        : '',
    }));
    setErrors(e => ({ ...e, niveau_cefr: undefined, groupe_id: undefined }));
  };

  const changeGroup = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    setForm(f => group ? {
      ...f,
      groupe_id: groupId,
      session_type: group.session_type || 'Yearly',
      niveau_cefr: group.niveau || f.niveau_cefr,
      plan_type: (group.session_type || 'Yearly') === 'Yearly' ? f.plan_type : 'Standard',
      premium_start_date: (group.session_type || 'Yearly') === 'Yearly' ? f.premium_start_date : '',
      premium_end_date: (group.session_type || 'Yearly') === 'Yearly' ? f.premium_end_date : '',
    } : { ...f, groupe_id: '' });
  };

  const availableGroups = groups.filter(group => (
    groupMatchesSelection(group, form.session_type, form.niveau_cefr)
    || group.id === form.groupe_id
  ));

  const [photoPreview, setPhotoPreview] = useState(null);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file, purpose: 'student_photo', studentId: id || null });
      set('photo_url', file_url);
      setPhotoPreview(URL.createObjectURL(file));
      toast.success('Photo téléversée');
    } catch (err) {
      toast.error(err?.message || 'Échec du téléversement de la photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    const parsed = StudentSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors(fieldErrors);
      const firstMsg = Object.values(fieldErrors).flat()[0];
      toast.error(firstMsg || 'Formulaire invalide');
      return;
    }

    // Convert empty strings back to null for DB enum/nullable fields
    const payload = {
      ...parsed.data,
      age_category:   parsed.data.age_category   || null,
      niveau_cefr:    parsed.data.niveau_cefr    || null,
      session_type:   parsed.data.session_type   || 'Yearly',
      photo_consent:  parsed.data.photo_consent  || 'Non demandé',
      referral_source: parsed.data.referral_source || null,
      status:         parsed.data.status         || null,
      date_naissance: parsed.data.date_naissance || null,
      telephone:      parsed.data.telephone      || null,
      email:          parsed.data.email          || null,
      parent_email:   parsed.data.parent_email   || null,
      groupe_id:      parsed.data.groupe_id      || null,
      plan_type:      parsed.data.session_type === 'Yearly' ? (parsed.data.plan_type || 'Standard') : 'Standard',
      premium_start_date: parsed.data.session_type === 'Yearly' && parsed.data.plan_type === 'Premium' ? (parsed.data.premium_start_date || null) : null,
      premium_end_date: parsed.data.session_type === 'Yearly' && parsed.data.plan_type === 'Premium' ? (parsed.data.premium_end_date || null) : null,
      photo_url:      parsed.data.photo_url      || null,
      notes:          parsed.data.notes          || null,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await entities.Student.update(id, payload);
        toast.success('Apprenant mis à jour');
      } else {
        await entities.Student.create(payload);
        toast.success('Apprenant créé');
      }
      qc.invalidateQueries({ queryKey: ['Student'] });
      router.push('/students');
    } catch {
      // entities.js already toasted — stay on the form for retry.
      setSaving(false);
    }
  };

  const fieldErr = (k) => errors[k]?.[0];

  return (
    <div className="p-8 max-w-2xl">
      <button onClick={() => router.push('/students')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft size={15} /> Retour
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? "Modifier l'apprenant" : 'Ajouter un apprenant'}</h1>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-5" noValidate>
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
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} disabled={uploading} />
            </label>
          </div>
          <div className="col-span-2">
            <label htmlFor="full_name" className={labelClass}>Nom complet *</label>
            <input
              id="full_name"
              className={fieldErr('full_name') ? inputErrClass : inputClass}
              aria-invalid={!!fieldErr('full_name')}
              aria-describedby={fieldErr('full_name') ? 'full_name-err' : undefined}
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              required
            />
            {fieldErr('full_name') && <p id="full_name-err" className="text-xs text-red-600 mt-1">{fieldErr('full_name')}</p>}
          </div>
          <div>
            <label htmlFor="date_naissance" className={labelClass}>Date de naissance</label>
            <input id="date_naissance" type="date" className={fieldErr('date_naissance') ? inputErrClass : inputClass} value={form.date_naissance || ''} onChange={e => set('date_naissance', e.target.value)} />
            {fieldErr('date_naissance') && <p className="text-xs text-red-600 mt-1">{fieldErr('date_naissance')}</p>}
          </div>
          <div>
            <label htmlFor="telephone" className={labelClass}>Téléphone</label>
            <input id="telephone" className={inputClass} value={form.telephone || ''} onChange={e => set('telephone', e.target.value)} />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Email (apprenant)</label>
            <input
              id="email"
              type="email"
              className={fieldErr('email') ? inputErrClass : inputClass}
              aria-invalid={!!fieldErr('email')}
              aria-describedby={fieldErr('email') ? 'email-err' : undefined}
              value={form.email || ''}
              onChange={e => set('email', e.target.value)}
            />
            {fieldErr('email') && <p id="email-err" className="text-xs text-red-600 mt-1">{fieldErr('email')}</p>}
          </div>
          <div>
            <label htmlFor="parent_email" className={labelClass}>Email parent / tuteur</label>
            <input
              id="parent_email"
              type="email"
              className={fieldErr('parent_email') ? inputErrClass : inputClass}
              aria-invalid={!!fieldErr('parent_email')}
              aria-describedby={fieldErr('parent_email') ? 'parent_email-err' : undefined}
              value={form.parent_email || ''}
              onChange={e => set('parent_email', e.target.value)}
              placeholder="Pour accès portail parent"
            />
            {fieldErr('parent_email') && <p id="parent_email-err" className="text-xs text-red-600 mt-1">{fieldErr('parent_email')}</p>}
          </div>
          <p className="col-span-2 -mt-2 text-xs text-muted-foreground">Email parent recommandé — active l’accès au portail parent (peut être ajouté plus tard).</p>
          <div>
            <label htmlFor="age_category" className={labelClass}>Catégorie d&apos;âge</label>
            <select id="age_category" className={inputClass} value={form.age_category || ''} onChange={e => set('age_category', e.target.value)}>
              <option value="">— Non défini —</option>
              {AGE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="session_type" className={labelClass}>Session</label>
            <select id="session_type" className={inputClass} value={form.session_type || 'Yearly'} onChange={e => changeSession(e.target.value)}>
              {SESSION_TYPES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="niveau_cefr" className={labelClass}>Niveau (NIV)</label>
            <select id="niveau_cefr" className={inputClass} value={form.niveau_cefr || ''} onChange={e => changeLevel(e.target.value)}>
              <option value="">— Non défini —</option>
              {getLevelsForSession(form.session_type, form.niveau_cefr).map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="status" className={labelClass}>Statut</label>
            <select id="status" className={inputClass} value={form.status || ''} onChange={e => set('status', e.target.value)}>
              <option value="">— Non défini —</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="photo_consent" className={labelClass}>Autorisation d&apos;image (photos / vidéos, réseaux sociaux)</label>
            <select id="photo_consent" className={inputClass} value={form.photo_consent || 'Non demandé'} onChange={e => set('photo_consent', e.target.value)}>
              {PHOTO_CONSENTS.map(c => <option key={c}>{c}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">« Accepte » autorise la publication des photos/vidéos de l&apos;enfant. Retirable à tout moment.</p>
          </div>
          <div className="col-span-2">
            <label htmlFor="referral_source" className={labelClass}>Comment avez-vous connu le centre ?</label>
            <select id="referral_source" className={inputClass} value={form.referral_source || ''} onChange={e => set('referral_source', e.target.value)}>
              <option value="">— Non renseigné —</option>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="groupe_id" className={labelClass}>Groupe assigné</label>
            <select id="groupe_id" className={inputClass} value={form.groupe_id || ''} onChange={e => changeGroup(e.target.value)}>
              <option value="">— Aucun groupe —</option>
              {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}{g.niveau ? ` (${g.niveau})` : ''}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Groupes filtrés par session et niveau.</p>
          </div>
          <div className={`col-span-2 rounded-xl border p-4 transition-colors ${form.plan_type === 'Premium' ? 'border-amber-300 bg-amber-50/70' : 'border-border bg-muted/20'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2 ${form.plan_type === 'Premium' ? 'bg-amber-400 text-amber-950' : 'bg-muted text-muted-foreground'}`}>
                  <Crown size={17} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Formule Premium</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pour le programme Yearly : ajoute un atelier partagé d’une heure chaque week-end.</p>
                </div>
              </div>
              <select
                id="plan_type"
                aria-label="Formule de l'apprenant"
                className={`${inputClass} sm:w-36`}
                value={form.plan_type}
                onChange={e => set('plan_type', e.target.value)}
                disabled={form.session_type !== 'Yearly'}
              >
                <option value="Standard">Standard</option>
                <option value="Premium">Premium</option>
              </select>
            </div>
            {form.session_type !== 'Yearly' && <p className="mt-3 text-xs text-muted-foreground">La formule Premium est réservée au programme Yearly.</p>}
            {form.plan_type === 'Premium' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-amber-200">
                <div>
                  <label htmlFor="premium_start_date" className={labelClass}><CalendarDays size={12} className="inline mr-1" />Début</label>
                  <input id="premium_start_date" type="date" className={inputClass} value={form.premium_start_date || ''} onChange={e => set('premium_start_date', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="premium_end_date" className={labelClass}>Fin (facultative)</label>
                  <input id="premium_end_date" type="date" className={fieldErr('premium_end_date') ? inputErrClass : inputClass} value={form.premium_end_date || ''} onChange={e => set('premium_end_date', e.target.value)} min={form.premium_start_date || undefined} />
                  {fieldErr('premium_end_date') && <p className="text-xs text-red-600 mt-1">{fieldErr('premium_end_date')}</p>}
                </div>
              </div>
            )}
          </div>
          <div className="col-span-2">
            <label htmlFor="notes" className={labelClass}>Notes</label>
            <textarea id="notes" className={`${fieldErr('notes') ? inputErrClass : inputClass} h-20 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
            {fieldErr('notes') && <p className="text-xs text-red-600 mt-1">{fieldErr('notes')}</p>}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || uploading} className="px-5 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50 bg-primary">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button type="button" onClick={() => router.push('/students')} className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground">Annuler</button>
        </div>
      </form>
    </div>
  );
}
