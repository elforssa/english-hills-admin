'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { entities, integrations, reportError } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import { createLearnerIdentity, createStudentOnce, isReceptionistIdentityConflict, resolveReceptionistIdentityConflict } from '@/lib/studentCreate.mjs';
import { isRecordConflict, recordConflictMessage } from '@/lib/conflictErrors.mjs';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { currentSchoolYear } from '@/lib/enrollmentWorkflow.mjs';
import { membershipErrorMessage, placeLearnerInGroup } from '@/lib/academic/membershipActions.mjs';
import { STUDENT_MESSAGES, birthDateProblem, categoryFits, latestBirthDate } from '@/lib/academic/learnerRules.mjs';
import { centreDate } from '@/lib/centreClock.mjs';
import { toast } from 'sonner';
import { ArrowLeft, Upload } from 'lucide-react';
import StorageImage from '@/components/StorageImage';
import { checkPhone, formatPhoneFr } from '@/lib/phone.mjs';
import { usePeopleGate } from '@/components/people/usePeopleGate';
import {
  ALL_LEVELS,
  SESSION_TYPES,
  getLevelsForSession,
  groupMatchesSelection,
  programmeName,
} from '@/lib/academicPrograms';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';
import { courseEndedSuffix, isClosedCourse } from '@/lib/academic/courseClose.mjs';
import { useClosedOnlineGroupIds } from '@/lib/queries';
import { useAuth } from '@/context/AuthContext';
import { AGE_CATEGORY_LABELS } from '@/lib/ui/presentation.mjs';
import { ORIGINS, SELECTABLE_ORIGINS, originLabel } from '@/lib/catalogue.mjs';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const inputErrClass = "w-full border border-red-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-red-500";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const AGE_CATEGORIES = ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)', 'Corporate'];
// RWR-r5 §5.4: the learner's origin is the catalogue's origin list (students.origin_code).
// The old answer (referral_source) is kept as written and shown until D4 maps it.
const ORIGIN_CODES = ORIGINS.map(o => o.code);

const StudentSchema = z.object({
  full_name:      z.string().trim().min(2, 'Au moins 2 caractères').max(120, 'Trop long (max 120)'),
  date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ').optional().or(z.literal('')),
  telephone:      z.string().trim().max(30, 'Trop long').optional().or(z.literal('')),
  email:          z.string().trim().email('Email invalide').optional().or(z.literal('')),
  parent_email:   z.string().trim().email('Email invalide').optional().or(z.literal('')),
  age_category:   z.enum(AGE_CATEGORIES).optional().or(z.literal('')),
  niveau_cefr:    z.enum(ALL_LEVELS).optional().or(z.literal('')),
  session_type:   z.enum(SESSION_TYPES).optional().or(z.literal('')),
  origin_code:    z.enum(ORIGIN_CODES).optional().or(z.literal('')),
  groupe_id:      z.guid().optional().or(z.literal('')),
  photo_url:      z.string().optional().or(z.literal('')),
  notes:          z.string().max(2000, 'Trop long (max 2000)').optional().or(z.literal('')),
});

export default function StudentForm() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = Boolean(id);
  // EAP (Q3 = B): a new file has no paid enrollment, so a placement at creation needs
  // its reason (logged, listed in Contrôles). RPW-r2 item 1: one form for every staff
  // role; a role without direct learner writes saves through the reception command.
  const { role } = useAuth();
  const viaCommand = !hasCapability(role, 'canWriteStudentRecords');
  const canPlaceAtCreation = !isEdit && hasCapability(role, 'canPlaceWithoutPaidEnrollment');
  const [loadedVersion, setLoadedVersion] = useState(null);
  // Edit saves only once the record is loaded: an earlier click would send no version.
  const [loaded, setLoaded] = useState(!id);
  // A failed or empty load says so in French instead of leaving « Enregistrer » silently disabled (review N5).
  const [loadError, setLoadError] = useState(null);
  const [withoutEnrollmentReason, setWithoutEnrollmentReason] = useState('');
  // REL-4: one learner id from the first send to a confirmed success, so a retry
  // after a lost answer replays the create instead of inserting a second learner.
  const [newStudentId] = useState(() => createLearnerIdentity());
  const [saving, setSaving] = useState(false);
  // §5.1: a phone is checked on create or when it changes (a stored legacy value never
  // blocks other edits); §5.2: a new learner passes the duplicate gate first.
  const [loadedPhone, setLoadedPhone] = useState('');
  const [storedPhone, setStoredPhone] = useState('');
  const people = usePeopleGate();
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({
    full_name: '', date_naissance: '', telephone: '', email: '', parent_email: '',
    niveau_cefr: '', age_category: '', session_type: 'Yearly',
    origin_code: '', groupe_id: '', photo_url: '', notes: '',
  });
  // EGC: the status follows enrollments and the file group is the database's copy
  // of a membership. Edit never writes them; programme and level follow the group.
  const [schoolYear, setSchoolYear] = useState(() => currentSchoolYear());
  const [placed, setPlaced] = useState(false);
  // RWR-r5 §6.4 (141): as the trigger, an unchanged birth date or category is not re-checked.
  const [loadedRules, setLoadedRules] = useState(null);

  useEffect(() => {
    entities.Group.listAll('name').then(setGroups).catch(() => {});
  }, []);

  const loadStudent = () => entities.Student.filter({ id })
        .then(d => {
          if (d[0]) {
            const row = d[0];
            setLoadedVersion(row.updated_at ?? null);
            setLoadedRules({ birth: row.date_naissance ?? '', category: row.age_category ?? '', session: row.session_type ?? 'Yearly' });
            // Shown in the national form (B1); an unchanged number is saved exactly as stored.
            setStoredPhone(row.telephone ?? '');
            setLoadedPhone(row.telephone ? formatPhoneFr(row.telephone) : '');
            setForm(f => ({
              ...f,
              ...row,
              age_category: row.age_category ?? '',
              niveau_cefr:  row.niveau_cefr  ?? '',
              session_type: row.session_type ?? 'Yearly',
              origin_code:  row.origin_code ?? '',
              date_naissance: row.date_naissance ?? '',
              telephone:    row.telephone ? formatPhoneFr(row.telephone) : '',
              email:        row.email        ?? '',
              parent_email: row.parent_email ?? '',
              groupe_id:    row.groupe_id     ?? '',
              photo_url:    row.photo_url     ?? '',
              notes:        row.notes        ?? '',
            }));
            setPlaced(Boolean(row.groupe_id));
            setLoaded(true);
            setLoadError(null);
          } else {
            setLoadError('Fiche introuvable ou inaccessible. Revenez à la liste des apprenants.');
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[StudentForm] load failed:', err);
          setLoadError('Impossible de charger la fiche de l’apprenant. Rechargez la page.');
        });

  useEffect(() => {
    if (isEdit) loadStudent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // The reception command answers its own refusals in French (hint rpw.*).
  const commandErrorMessage = (error) => (String(error?.hint || '').startsWith('rpw.') && error?.message)
    ? error.message : membershipErrorMessage(error);

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
    } : { ...f, groupe_id: '' });
  };

  // CDC (D4): a closed course is never offered (the current group stays shown).
  const closedOnline = useClosedOnlineGroupIds();
  const availableGroups = groups.filter(group => (
    (groupMatchesSelection(group, form.session_type, form.niveau_cefr) && !isClosedCourse(group, closedOnline))
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

    // Convert empty strings back to null for DB enum/nullable fields. The file
    // group and the status are never written (D3-A: a new file is a Prospect).
    const { groupe_id: chosenGroup, ...fields } = parsed.data;
    const payload = {
      ...fields,
      age_category:   fields.age_category   || null,
      niveau_cefr:    fields.niveau_cefr    || null,
      session_type:   fields.session_type   || 'Yearly',
      origin_code:    fields.origin_code    || null,
      date_naissance: fields.date_naissance || null,
      telephone:      fields.telephone      || null,
      email:          fields.email          || null,
      parent_email:   fields.parent_email   || null,
      photo_url:      fields.photo_url      || null,
      notes:          fields.notes          || null,
    };
    if (isEdit && placed) { delete payload.session_type; delete payload.niveau_cefr; }
    // §6.4: never after today, at least a year ago; the category fits the programme.
    const birthProblem = (!isEdit || (payload.date_naissance || '') !== (loadedRules?.birth || '')) && birthDateProblem(payload.date_naissance);
    if (birthProblem) { setErrors({ date_naissance: [STUDENT_MESSAGES[birthProblem]] }); toast.error(STUDENT_MESSAGES[birthProblem]); return; }
    const programme = form.session_type || 'Yearly';
    if ((!isEdit || (payload.age_category || '') !== (loadedRules?.category || '') || programme !== loadedRules?.session) && !categoryFits(payload.age_category, programme)) {
      setErrors({ age_category: [STUDENT_MESSAGES['student.category_level']] }); toast.error(STUDENT_MESSAGES['student.category_level']); return;
    }
    if (!isEdit || (payload.telephone || '') !== (loadedPhone || '')) {
      const phone = checkPhone(payload.telephone);
      if (!phone.ok) { setErrors({ telephone: [phone.error] }); toast.error(phone.error); return; }
    } else payload.telephone = storedPhone || null;
    if (!isEdit) {
      try {
        if (!(await people.check({ phone: payload.telephone, name: payload.full_name, birth: payload.date_naissance }))) {
          toast.error('Cette personne existe peut-être déjà : répondez pour chaque fiche, puis enregistrez.');
          return;
        }
      } catch { toast.error('Vérification des doublons impossible. Réessayez.'); return; }
    }

    if (canPlaceAtCreation && chosenGroup && !withoutEnrollmentReason.trim()) {
      setErrors({ without_enrollment_reason: ['Indiquez le motif de l’affectation sans inscription payée.'] });
      toast.error('Indiquez le motif de l’affectation sans inscription payée.');
      return;
    }
    setSaving(true);
    const client = getBrowserClient();
    if (isEdit && viaCommand) {
      const { error } = await client.rpc('save_receptionist_student', {
        p_student: id, p_expected_updated_at: loadedVersion, p_changes: payload,
      });
      setSaving(false);
      if (error && isRecordConflict(error)) {
        // Changed in the meantime (ADR-009): reload the latest record for review.
        toast.error(recordConflictMessage());
        invalidateAfterLearnerSave(qc);
        await loadStudent();
        return;
      }
      if (error) { toast.error(commandErrorMessage(error)); return; }
      toast.success('Apprenant mis à jour');
      invalidateAfterLearnerSave(qc);
      router.push(`/students/${id}`);
      return;
    }
    if (isEdit) {
      const { error } = await client.from('students').update(payload).eq('id', id);
      if (error) { toast.error(membershipErrorMessage(error)); setSaving(false); return; }
      toast.success('Apprenant mis à jour');
      invalidateAfterLearnerSave(qc);
      router.push('/students');
      return;
    }
    if (viaCommand) {
      const studentId = newStudentId.current();
      const { data, error } = await client.rpc('save_receptionist_student', {
        p_student: studentId, p_expected_updated_at: null, p_changes: payload,
      });
      if (error && isReceptionistIdentityConflict(error)) {
        // An earlier send of this learner committed; the reception read hides a deleted
        // one, and a failed read keeps the id for an exact resend.
        const conflict = await resolveReceptionistIdentityConflict(async () => {
          const { data: rows, error: readError } = await client.from('students').select('id').eq('id', studentId);
          if (readError) throw readError;
          return rows;
        });
        newStudentId.settle(conflict.status);
        toast.error(conflict.message);
        setSaving(false);
        if (conflict.status === 'already_created') router.push(`/students/${studentId}`);
        return;
      }
      if (error) { toast.error(commandErrorMessage(error)); setSaving(false); return; }
      newStudentId.settle('created');
      invalidateAfterLearnerSave(qc);
      if (!(await people.record(studentId))) toast.error('Apprenant créé ; les réponses sur les doublons n’ont pas été enregistrées.');
      const created = Array.isArray(data) ? data[0] : data;
      if (chosenGroup && canPlaceAtCreation) {
        const { error: placeError } = await placeLearnerInGroup(client, {
          student: { id: studentId, updated_at: created?.updated_at }, group: chosenGroup, schoolYear,
          withoutEnrollmentReason: withoutEnrollmentReason.trim() });
        if (placeError) {
          toast.error(`Apprenant créé, mais non affecté : ${membershipErrorMessage(placeError)}`);
          router.push(`/students/${studentId}`);
          return;
        }
        invalidateAfterLearnerSave(qc);
      }
      toast.success('Apprenant créé');
      router.push(`/students/${studentId}`);
      return;
    }
    let studentId;
    try {
      studentId = newStudentId.current();
      const created = await createStudentOnce(client, studentId, { ...payload, status: 'Prospect' });
      invalidateAfterLearnerSave(qc);
      newStudentId.settle(created.status);
      if (created.status === 'deleted') { toast.error(created.message); setSaving(false); return; }
      if (created.status === 'already_created') { toast.error(created.message); router.push(`/students/${studentId}`); return; }
      if (!(await people.record(studentId))) toast.error('Apprenant créé ; les réponses sur les doublons n’ont pas été enregistrées.');
      // Optional placement: a Validated enrollment of the group's programme (DAT-2),
      // unpaid, so placed with the management reason (logged, listed in Contrôles).
      if (chosenGroup && canPlaceAtCreation) {
        const { error } = await placeLearnerInGroup(client, { student: created.row, group: chosenGroup, schoolYear,
          withoutEnrollmentReason: withoutEnrollmentReason.trim() });
        if (error) {
          toast.error(`Apprenant créé, mais non affecté : ${membershipErrorMessage(error)}`);
          router.push(`/students/${studentId}`);
          return;
        }
      }
      toast.success('Apprenant créé');
      invalidateAfterLearnerSave(qc);
      router.push('/students');
    } catch (error) {
      // Report a create failure; stay on the form for retry: a create keeps its learner id.
      reportError('create', 'Student', error);
      setSaving(false);
    }
  };

  const fieldErr = (k) => errors[k]?.[0];

  return (
    <div className="p-8 max-w-2xl">
      <button onClick={() => router.push('/students')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft size={15} /> Retour
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Modifier l’apprenant' : 'Ajouter un apprenant'}</h1>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 border border-border">
              {form.photo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <StorageImage src={photoPreview || form.photo_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-xl font-bold text-muted-foreground">{form.full_name?.[0] || '?'}</span>}
            </div>
            {(isEdit || !viaCommand) ? <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted cursor-pointer">
              <Upload size={14} /> {uploading ? 'Téléversement…' : 'Photo'}
              <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhoto} disabled={uploading} />
            </label> : <p className="text-xs text-muted-foreground">La photo s’ajoute depuis la fiche, après l’enregistrement.</p>}
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
            <input id="date_naissance" type="date" className={fieldErr('date_naissance') ? inputErrClass : inputClass} max={latestBirthDate(centreDate())} value={form.date_naissance || ''} onChange={e => set('date_naissance', e.target.value)} />
            {fieldErr('date_naissance') && <p className="text-xs text-red-600 mt-1">{fieldErr('date_naissance')}</p>}
          </div>
          <div>
            <label htmlFor="telephone" className={labelClass}>Téléphone</label>
            <input id="telephone" type="tel" className={fieldErr('telephone') ? inputErrClass : inputClass} value={form.telephone || ''} onChange={e => { set('telephone', e.target.value); setErrors(v => ({ ...v, telephone: undefined })); }} />
            {fieldErr('telephone') && <p className="text-xs text-red-600 mt-1">{fieldErr('telephone')}</p>}
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
            <select id="age_category" className={fieldErr('age_category') ? inputErrClass : inputClass} value={form.age_category || ''} onChange={e => set('age_category', e.target.value)}>
              <option value="">— Non défini —</option>
              {/* §6.4: only the categories that fit the programme (a stored one stays shown). */}
              {AGE_CATEGORIES.filter(c => categoryFits(c, form.session_type || 'Yearly') || c === form.age_category).map(c => <option key={c} value={c}>{AGE_CATEGORY_LABELS[c]}</option>)}
            </select>
            {fieldErr('age_category') && <p className="text-xs text-red-600 mt-1">{fieldErr('age_category')}</p>}
          </div>
          <div>
            <label htmlFor="session_type" className={labelClass}>Session</label>
            <select id="session_type" className={inputClass} value={form.session_type || 'Yearly'} onChange={e => changeSession(e.target.value)} disabled={placed}>
              {SESSION_TYPES.map(s => <option key={s} value={s}>{programmeName(s)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="niveau_cefr" className={labelClass}>Niveau (NIV)</label>
            <select id="niveau_cefr" className={inputClass} value={form.niveau_cefr || ''} onChange={e => changeLevel(e.target.value)} disabled={placed}>
              <option value="">— Non défini —</option>
              {getLevelsForSession(form.session_type, form.niveau_cefr).map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          {placed && <p className="col-span-2 -mt-2 text-xs text-muted-foreground">Le programme et le niveau suivent le groupe ; modifiez l’inscription depuis la fiche apprenant.</p>}
          <div className="col-span-2">
            <label htmlFor="origin_code" className={labelClass}>Origine</label>
            <select id="origin_code" className={inputClass} value={form.origin_code || ''} onChange={e => set('origin_code', e.target.value)}>
              <option value="">— Non renseigné —</option>
              {SELECTABLE_ORIGINS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
              {form.origin_code && !SELECTABLE_ORIGINS.some(o => o.code === form.origin_code) && <option value={form.origin_code}>{originLabel(form.origin_code)}</option>}
            </select>
            {!form.origin_code && form.referral_source && <p className="mt-1 text-xs text-muted-foreground">Ancienne réponse : {form.referral_source}</p>}
          </div>
          {canPlaceAtCreation && <>
          <div>
            <label htmlFor="groupe_id" className={labelClass}>Affecter à un groupe (facultatif)</label>
            <select id="groupe_id" className={inputClass} value={form.groupe_id || ''} onChange={e => changeGroup(e.target.value)}>
              <option value="">— Aucun groupe —</option>
              {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}{g.niveau ? ` (${g.niveau})` : ''}{courseEndedSuffix(g)}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Groupes filtrés par session et niveau. Sans paiement, l’affectation crée une inscription non payée : préférez « Inscrire et encaisser » depuis la fiche apprenant.</p>
          </div>
          <div>
            <label htmlFor="school_year" className={labelClass}>Année scolaire</label>
            <input id="school_year" className={inputClass} placeholder="2026/2027" pattern="[0-9]{4}/[0-9]{4}" value={schoolYear} onChange={e => setSchoolYear(e.target.value)} disabled={!form.groupe_id} />
          </div>
          {form.groupe_id && <div className="col-span-2">
            <label htmlFor="without_enrollment_reason" className={labelClass}>Motif de l’affectation sans inscription payée *</label>
            <textarea id="without_enrollment_reason" className={`${fieldErr('without_enrollment_reason') ? inputErrClass : inputClass} h-16 resize-none`} maxLength={200}
              value={withoutEnrollmentReason} onChange={e => { setWithoutEnrollmentReason(e.target.value); setErrors(v => ({ ...v, without_enrollment_reason: undefined })); }} />
            {fieldErr('without_enrollment_reason') && <p className="text-xs text-red-600 mt-1">{fieldErr('without_enrollment_reason')}</p>}
            <p className="text-xs text-muted-foreground mt-1">Enregistré dans le journal ; l’inscription apparaît dans « Contrôles » jusqu’au paiement.</p>
          </div>}
          </>}
          {people.gate && <div className="col-span-2">{people.gate}</div>}
          <div className="col-span-2">
            <label htmlFor="notes" className={labelClass}>Notes</label>
            <textarea id="notes" className={`${fieldErr('notes') ? inputErrClass : inputClass} h-20 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
            {fieldErr('notes') && <p className="text-xs text-red-600 mt-1">{fieldErr('notes')}</p>}
          </div>
        </div>
        {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || uploading || !loaded} className="px-5 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50 bg-primary">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button type="button" onClick={() => router.push('/students')} className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground">Annuler</button>
        </div>
      </form>
    </div>
  );
}
