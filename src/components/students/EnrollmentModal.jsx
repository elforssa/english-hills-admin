'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { Phone, Mail, User, BookOpen, Clock, Calendar, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getLevelsForSession, groupMatchesEnrollment } from '@/lib/academicPrograms';
import { isSchoolYear, LIVE_ENROLLMENT_STATUSES, schoolYearOfGroup } from '@/lib/enrollmentWorkflow.mjs';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { displayLabel, ENROLLMENT_LABELS } from '@/lib/ui/presentation.mjs';
import { changedEnrollmentFields, eapReason, egcReason, membershipErrorMessage, placeLearnerInGroup, removeLearnerFromGroup,
  saveEnrollmentChanges } from '@/lib/academic/membershipActions.mjs';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';
import { courseEndedSuffix, isClosedCourse } from '@/lib/academic/courseClose.mjs';
import { useClosedOnlineGroupIds } from '@/lib/queries';
import { queryClientInstance } from '@/lib/query-client';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

// EAP (migration 127): an enrollment is born at the payment (« Inscrire et encaisser »),
// so this dialog only edits an existing one. Its status follows the payment, the
// placement and « Ancien apprenant »; it is never chosen here.
export default function EnrollmentModal({ enrollment, students, groups, onSave, onClose, assignmentOnly = false }) {
  const { role } = useAuth();
  const isReceptionist = role === 'receptionist';
  const isManagement = role === 'director' || role === 'admin';
  const [form, setForm] = useState(() => ({ ...enrollment }));
  // Reception only assigns the group of a paid enrollment (save_receptionist_enrollment).
  const operationalAssignmentOnly = assignmentOnly || isReceptionist;
  const ended = enrollment.status === 'Ended';
  const paid = LIVE_ENROLLMENT_STATUSES.includes(enrollment.status);
  const [saving, setSaving] = useState(false);
  // Q3 = B: management places a learner without a paid enrollment with its own reason;
  // a full group asks for the separate capacity override reason (D4-A).
  const [askCapacity, setAskCapacity] = useState(false);
  const [askWithoutEnrollment, setAskWithoutEnrollment] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [withoutEnrollmentReason, setWithoutEnrollmentReason] = useState('');
  // The fields saved by an earlier send of this dialog, with the versions they left,
  // so a resend after a reason request places without saving them twice.
  const progress = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedStudent = students.find(s => s.id === form.student_id);
  const selectedGroup = groups.find(g => g.id === form.group_id);
  const effectiveSession = form.session_type || selectedStudent?.session_type || 'Yearly';
  // H5: when the enrollment's school year is known, only groups of that year (or the
  // current one) are offered; a group without a year cannot take a placement.
  const yearOk = group => !isSchoolYear(form.school_year) || schoolYearOfGroup(group) === form.school_year;
  // CDC (D4): a closed course is never offered (the current group stays shown);
  // a finished one not yet closed is marked « terminé le … ».
  const closedOnline = useClosedOnlineGroupIds();
  const availableGroups = groups.filter(group => (
    (!selectedStudent || groupMatchesEnrollment(group, form, selectedStudent)) && yearOk(group) && !isClosedCourse(group, closedOnline)
  ) || group.id === form.group_id);
  const before = enrollment.group_id || null;
  const groupId = form.group_id || null;
  const placing = Boolean(groupId) && groupId !== before;
  const needsWithoutEnrollmentReason = isManagement && placing && (!paid || askWithoutEnrollment);
  const needsOverrideReason = isManagement && placing && askCapacity;

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

  // Director/admin: every write goes through the enrollment commands. Level, date and
  // notes go through save_enrollment_changes with only what changed; a group change
  // is a placement (or a removal).
  const saveAsManagement = async (client) => {
    let row = progress.current?.row || { id: enrollment.id, updated_at: enrollment.updated_at };
    let file = progress.current?.file || (selectedStudent ? { id: selectedStudent.id, updated_at: selectedStudent.updated_at } : null);
    if (ended) {
      const changes = changedEnrollmentFields(enrollment, form);
      if ('notes' in changes) {
        const { error } = await saveEnrollmentChanges(client, row, { notes: changes.notes });
        if (error) throw error;
      }
      return;
    }
    if (!assignmentOnly) {
      const changes = changedEnrollmentFields(progress.current?.saved || enrollment, form);
      // SF2: a move between two groups takes the new group's level (owner decision
      // 4); an unplaced enrollment saves its level first, then is placed.
      if (before && groupId && groupId !== before) delete changes.level;
      if (Object.keys(changes).length) {
        const { error } = await saveEnrollmentChanges(client, row, changes);
        if (error) throw error;
        ({ row, file } = await reread(client, row.id, form.student_id));
        progress.current = { row, file, saved: { ...(progress.current?.saved || enrollment), ...changes } };
      }
    }
    if (groupId === before) return;
    const { error } = groupId
      ? await placeLearnerInGroup(client, { student: file, group: groupId, enrollment: row,
        overrideReason: needsOverrideReason ? overrideReason.trim() : null,
        withoutEnrollmentReason: needsWithoutEnrollmentReason ? withoutEnrollmentReason.trim() : null })
      : await removeLearnerFromGroup(client, { student: file, group: before, enrollment: row });
    if (error) throw error;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const client = getBrowserClient();
      if (isReceptionist) {
        // The group-assignment branch of the command; the pre-enrollment branch is retired.
        const { error } = await client.rpc('save_receptionist_enrollment', {
          p_student: form.student_id, p_enrollment: enrollment.id, p_group: groupId,
          p_status: 'Validated', p_level: form.level || null,
          p_date: form.date_inscription || null, p_notes: form.notes || null,
          p_session: form.session_type || null, p_school_year: form.school_year || null,
        });
        if (error) throw error;
      } else {
        await saveAsManagement(client);
      }
      toast.success('Mis à jour');
      invalidateAfterLearnerSave(queryClientInstance);
      onSave();
    } catch (error) {
      // Management answers a reason request in this dialog and sends again.
      if (isManagement && egcReason(error?.hint) === 'capacity' && !needsOverrideReason) {
        setAskCapacity(true);
        toast.error('Ce groupe est complet : indiquez le motif du dépassement.');
        return;
      }
      if (isManagement && eapReason(error?.hint) === 'placement_reason_required' && !needsWithoutEnrollmentReason) {
        setAskWithoutEnrollment(true);
        toast.error(membershipErrorMessage(error));
        return;
      }
      // Stale version (PT409, egc.stale): "Cette inscription a changé, rechargez".
      toast.error(membershipErrorMessage(error));
      // N2/N3: a record conflict, or a failure after this dialog saved the fields,
      // closes the dialog and reloads the current state.
      if (isRecordConflict(error) || progress.current) { invalidateAfterLearnerSave(queryClientInstance); onSave(); }
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{operationalAssignmentOnly ? 'Affecter un groupe' : 'Modifier l’inscription'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-lg bg-slate-50 p-3 text-sm font-medium">Session : {form.session_type || 'Non renseignée'} · Année : {form.school_year || 'Non renseignée'} · Niveau : {form.level || 'À définir'} · {displayLabel(ENROLLMENT_LABELS, enrollment.status)}</p>
          {ended && <p className="rounded-lg bg-slate-50 p-3 text-sm">Inscription terminée{enrollment?.end_reason ? ` : ${enrollment.end_reason}` : ''}. Seules les notes se modifient ; « Rouvrir l’inscription » est sur la fiche apprenant.</p>}
          {selectedStudent && (
            <div className="p-2.5 bg-blue-50 rounded-md text-xs text-blue-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold"><User size={12} className="shrink-0" /> {selectedStudent.full_name}</div>
              {selectedStudent.telephone && <div className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {selectedStudent.telephone}</div>}
              {selectedStudent.email && <div className="flex items-center gap-1.5"><Mail size={12} className="shrink-0" /> {selectedStudent.email}</div>}
              {selectedStudent.age_category && <div className="flex items-center gap-1.5"><User size={12} className="shrink-0" /> {selectedStudent.age_category}</div>}
              {!form.session_type && <div className="flex items-center gap-1.5"><Calendar size={12} className="shrink-0" /> Session du dossier&nbsp;: {selectedStudent.session_type || 'Yearly'}</div>}
              {!form.session_type && selectedStudent.niveau_cefr && <div className="flex items-center gap-1.5"><BookOpen size={12} className="shrink-0" /> Niveau du dossier&nbsp;: {selectedStudent.niveau_cefr}</div>}
            </div>
          )}
          {selectedStudent && !ended && !operationalAssignmentOnly && <div>
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
            }} required={operationalAssignmentOnly}>
              <option value="">— Choisir un groupe —</option>
              {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.niveau}{g.horaire ? ` · ${g.horaire}` : ''}{g.jours ? ` (${g.jours})` : ''}{courseEndedSuffix(g)}</option>)}
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
          {needsWithoutEnrollmentReason && <div>
            <label htmlFor="enrollment-without-enrollment-reason" className={labelClass}>Motif de l’affectation sans inscription payée *</label>
            <textarea id="enrollment-without-enrollment-reason" required maxLength={200} className={`${inputClass} h-16 resize-none`}
              value={withoutEnrollmentReason} onChange={e => setWithoutEnrollmentReason(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Cette inscription n’est pas payée : l’affectation est enregistrée dans le journal et listée dans « Contrôles ».</p>
          </div>}
          {needsOverrideReason && <div>
            <label htmlFor="enrollment-capacity-override-reason" className={labelClass}>Motif du dépassement *</label>
            <textarea id="enrollment-capacity-override-reason" required maxLength={200} className={`${inputClass} h-16 resize-none`}
              value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
          </div>}
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
            <Button type="submit" disabled={saving || (needsWithoutEnrollmentReason && !withoutEnrollmentReason.trim())
              || (needsOverrideReason && !overrideReason.trim())}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
