'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { Phone, Mail, User, BookOpen, Clock, Calendar, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getLevelsForSession, groupMatchesEnrollment, SESSION_TYPES } from '@/lib/academicPrograms';
import { currentSchoolYear } from '@/lib/enrollmentWorkflow.mjs';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { displayLabel, ENROLLMENT_LABELS } from '@/lib/ui/presentation.mjs';
import { changedEnrollmentFields, createEnrollment, membershipErrorMessage, placeLearnerInGroup, removeLearnerFromGroup,
  saveEnrollmentChanges } from '@/lib/academic/membershipActions.mjs';

const enrollmentLabel = (status) => status === 'Confirmed' ? 'Inscrit — groupe à affecter' : displayLabel(ENROLLMENT_LABELS, status);
// Confirmed, Validated and Ended follow payment, placement and the leaver commands (ACA-5).
const LOCKED_STATUSES = ['Confirmed', 'Validated', 'Ended'];

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

export default function EnrollmentModal({ enrollment, students, groups, onSave, onClose, assignmentOnly = false }) {
  const { role } = useAuth();
  const isReceptionist = role === 'receptionist';
  // A new row (none, or a partial one opened from the learner file) starts in the current school year.
  const [form, setForm] = useState(() => enrollment?.id ? enrollment : { student_id: '', group_id: '', status: 'Submitted',
    date_inscription: new Date().toISOString().split('T')[0], notes: '', school_year: currentSchoolYear(), ...(enrollment || {}) });
  const operationalAssignmentOnly = assignmentOnly || (isReceptionist && ['Confirmed','Validated'].includes(form.status));
  const ended = form.status === 'Ended';
  const statusLocked = Boolean(form.id) && LOCKED_STATUSES.includes(enrollment?.status);
  const [saving, setSaving] = useState(false);
  const created = useRef(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedStudent = students.find(s => s.id === form.student_id);
  const selectedGroup = groups.find(g => g.id === form.group_id);
  const effectiveSession = form.session_type || selectedStudent?.session_type || 'Yearly';
  const availableGroups = groups.filter(group => (
    !selectedStudent
    || groupMatchesEnrollment(group, form, selectedStudent)
    || group.id === form.group_id
  ));
  // A trial needs its group; so does a validation chosen here. Removing the group of
  // an existing Validated enrollment is allowed (it becomes Confirmed).
  const needsGroup = form.status === 'Trial' || (!isReceptionist && !statusLocked && form.status === 'Validated');

  // Versions: the first command sends the ones loaded with the dialog, so a stale
  // dialog is refused (S1); they are re-read only after this save changed the row.
  const reread = async (client, enrollmentId, studentId) => {
    const [{ data: row, error }, { data: file, error: fileError }] = await Promise.all([
      client.from('enrollments').select('id,updated_at').eq('id', enrollmentId).single(),
      client.from('students').select('id,updated_at').eq('id', studentId).single(),
    ]);
    if (error || fileError) throw error || fileError;
    return { row, file };
  };

  // Director/admin: every write goes through the enrollment commands. A group
  // change is a placement (or a removal); status and the other fields go through
  // save_enrollment_changes with only what changed.
  const saveAsManagement = async (client) => {
    const student = students.find(s => s.id === form.student_id);
    const groupId = form.group_id || null;
    let row = form.id ? { id: enrollment.id, updated_at: enrollment.updated_at } : null;
    let file = student ? { id: student.id, updated_at: student.updated_at } : null;
    let changed = false;
    const refresh = async () => { ({ row, file } = await reread(client, row.id, form.student_id)); };
    if (!row) {
      if (!form.school_year) throw { message: 'Programme et année scolaire requis.' };
      const { data, error } = await createEnrollment(client, form.student_id, {
        session_type: effectiveSession, school_year: form.school_year, level: form.level || null,
        status: form.status === 'Under Review' ? 'Under Review' : 'Submitted',
        date_inscription: form.date_inscription || null, notes: form.notes || null,
      });
      if (error) throw error;
      // N3: from here a failure closes the dialog, so a retry starts from this row.
      created.current = true;
      row = { id: data };
      changed = true;
    } else if (ended) {
      const changes = changedEnrollmentFields(enrollment, form);
      if ('notes' in changes) {
        const { error } = await saveEnrollmentChanges(client, row, { notes: changes.notes });
        if (error) throw error;
      }
      return;
    } else if (!assignmentOnly) {
      const changes = changedEnrollmentFields(enrollment, form);
      delete changes.status; // after the group, below
      if (Object.keys(changes).length) {
        const { error } = await saveEnrollmentChanges(client, row, changes);
        if (error) throw error;
        changed = true;
      }
    }
    const before = enrollment?.group_id || null;
    if (groupId !== before) {
      if (changed || !file?.updated_at) await refresh();
      const { error } = groupId
        ? await placeLearnerInGroup(client, { student: file, group: groupId, enrollment: row })
        : await removeLearnerFromGroup(client, { student: file, group: before, enrollment: row });
      if (error) throw error;
      changed = true;
    }
    const targetStatus = form.status;
    const currentStatus = form.id ? enrollment.status : 'Submitted';
    if (!assignmentOnly && !statusLocked && targetStatus !== currentStatus && !(groupId && currentStatus === 'Confirmed')) {
      if (changed) await refresh();
      const { error } = await saveEnrollmentChanges(client, row, { status: targetStatus });
      if (error) throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const client = getBrowserClient();
      if (isReceptionist) {
        const payload = { ...form, student_id: form.student_id || null, group_id: form.group_id || null,
          status: form.status === 'Confirmed' && form.group_id ? 'Validated'
            : form.status === 'Validated' && !form.group_id ? 'Confirmed' : form.status };
        const { error } = await client.rpc('save_receptionist_enrollment', {
          p_student: payload.student_id, p_enrollment: form.id || null, p_group: payload.group_id,
          p_status: payload.status, p_level: payload.level || null,
          p_date: payload.date_inscription || null, p_notes: payload.notes || null,
          p_session: payload.session_type || null, p_school_year: payload.school_year || null,
        });
        if (error) throw error;
      } else {
        await saveAsManagement(client);
      }
      toast.success(form.id ? 'Mis à jour' : 'Inscription créée');
      onSave();
    } catch (error) {
      // Stale version (PT409, egc.stale): "Cette inscription a changé, rechargez".
      toast.error(membershipErrorMessage(error));
      // N2/N3: a record conflict, or a failure after the enrollment was created,
      // closes the dialog and reloads the current state.
      if (isRecordConflict(error) || created.current) onSave();
    } finally {
      setSaving(false);
    }
  };
  const statusOptions = isReceptionist
    ? (operationalAssignmentOnly ? ['Confirmed','Validated'] : ['Submitted','Under Review','Trial'])
    : statusLocked ? [enrollment.status]
      : ['Submitted','Under Review','Trial','Validated', ...(form.id ? ['Rejected'] : [])];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{operationalAssignmentOnly ? 'Affecter un groupe' : form.id ? 'Modifier' : 'Nouvelle pré-inscription'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(form.session_type || form.school_year) && form.id && <p className="rounded-lg bg-slate-50 p-3 text-sm font-medium">Session : {form.session_type || 'Non renseignée'} · Année : {form.school_year || 'Non renseignée'} · Niveau : {form.level || 'À définir'}</p>}
          {ended && <p className="rounded-lg bg-slate-50 p-3 text-sm">Inscription terminée{enrollment?.end_reason ? ` : ${enrollment.end_reason}` : ''}. Seules les notes se modifient ; « Rouvrir l’inscription » est sur la fiche apprenant.</p>}
          {!form.id && <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>Session *<select className={inputClass} required value={effectiveSession} onChange={e => setForm(v => ({ ...v, session_type: e.target.value, level: null, group_id: '' }))}>
              {SESSION_TYPES.map(session => <option key={session}>{session}</option>)}</select></label>
            <label className={labelClass}>Année scolaire *<input className={inputClass} required placeholder="2026/2027" pattern="[0-9]{4}/[0-9]{4}" value={form.school_year || ''} onChange={e => set('school_year', e.target.value)} /></label>
          </div>}
          <div>
            <label htmlFor="enrollment-student" className={labelClass}>Apprenant *</label>
            <select id="enrollment-student" className={inputClass} value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value, group_id: '' }))} required disabled={Boolean(form.id)}>
              <option value="">— Choisir un apprenant —</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name}{s.telephone ? ` · ${s.telephone}` : ''}{s.age_category ? ` · ${s.age_category}` : ''}
                </option>
              ))}
            </select>
            {selectedStudent && (
              <div className="mt-2 p-2.5 bg-blue-50 rounded-md text-xs text-blue-800 space-y-1">
                {selectedStudent.telephone && <div className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {selectedStudent.telephone}</div>}
                {selectedStudent.email && <div className="flex items-center gap-1.5"><Mail size={12} className="shrink-0" /> {selectedStudent.email}</div>}
                {selectedStudent.age_category && <div className="flex items-center gap-1.5"><User size={12} className="shrink-0" /> {selectedStudent.age_category}</div>}
                {!form.session_type && <div className="flex items-center gap-1.5"><Calendar size={12} className="shrink-0" /> Session du dossier&nbsp;: {selectedStudent.session_type || 'Yearly'}</div>}
                {!form.session_type && selectedStudent.niveau_cefr && <div className="flex items-center gap-1.5"><BookOpen size={12} className="shrink-0" /> Niveau du dossier&nbsp;: {selectedStudent.niveau_cefr}</div>}
                <div className="text-blue-600 font-medium">Statut&nbsp;: {selectedStudent.status}</div>
              </div>
            )}
          </div>
          {selectedStudent && !ended && <div>
            <label htmlFor="enrollment-level" className={labelClass}>Niveau de cette inscription</label>
            <select id="enrollment-level" className={inputClass} value={form.level || ''} onChange={e => setForm(f => ({ ...f, level: e.target.value || null,
              group_id: e.target.value && selectedGroup?.niveau !== e.target.value ? '' : f.group_id }))}>
              <option value="">— À définir lors de l’affectation —</option>
              {getLevelsForSession(effectiveSession, form.level).map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>}
          {!ended && <div>
            <label htmlFor="enrollment-group" className={labelClass}>Groupe</label>
            <select id="enrollment-group" className={inputClass} value={form.group_id || ''} onChange={e => {
              const group = groups.find(g => g.id === e.target.value);
              setForm(f => ({ ...f, group_id: e.target.value, level: group?.niveau || f.level || null }));
            }} required={operationalAssignmentOnly || needsGroup}>
              <option value="">— Choisir un groupe —</option>
              {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.niveau}{g.horaire ? ` · ${g.horaire}` : ''}{g.jours ? ` (${g.jours})` : ''}</option>)}
            </select>
            {selectedStudent && <p className="text-xs text-muted-foreground mt-1">Groupes filtrés par session et niveau de cette inscription.</p>}
            {selectedGroup && (
              <div className="mt-2 p-2.5 bg-green-50 rounded-md text-xs text-green-800 space-y-1">
                {selectedGroup.horaire && <div className="flex items-center gap-1.5"><Clock size={12} className="shrink-0" /> {selectedGroup.horaire}</div>}
                {selectedGroup.jours && <div className="flex items-center gap-1.5"><Calendar size={12} className="shrink-0" /> {selectedGroup.jours}</div>}
                {selectedGroup.salle && <div className="flex items-center gap-1.5"><Building2 size={12} className="shrink-0" /> Salle&nbsp;: {selectedGroup.salle}</div>}
                {selectedGroup.capacite_max && <div className="flex items-center gap-1.5"><Users size={12} className="shrink-0" /> Capacité max&nbsp;: {selectedGroup.capacite_max}</div>}
              </div>
            )}
          </div>}
          <div hidden={operationalAssignmentOnly || ended}>
            <label htmlFor="enrollment-status" className={labelClass}>Statut</label>
            <select id="enrollment-status" className={inputClass} value={form.status} onChange={e => set('status', e.target.value)} disabled={!isReceptionist && statusLocked}>
              {statusOptions.map(s => <option key={s} value={s}>{enrollmentLabel(s)}</option>)}
            </select>
            {!isReceptionist && statusLocked && <p className="mt-1 text-xs text-muted-foreground">Le statut suit le paiement, l’affectation et « Ancien apprenant ».</p>}
          </div>
          <div hidden={operationalAssignmentOnly || ended}>
            <label htmlFor="enrollment-date" className={labelClass}>Date</label>
            <input id="enrollment-date" type="date" className={inputClass} value={form.date_inscription || ''} onChange={e => set('date_inscription', e.target.value)} />
          </div>
          <div hidden={operationalAssignmentOnly}>
            <label htmlFor="enrollment-notes" className={labelClass}>Notes</label>
            <textarea id="enrollment-notes" className={`${inputClass} h-16 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
