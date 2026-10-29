'use client';

import { useEffect, useState } from 'react';
import { getTeacherDirectory } from '@/lib/teacher-directory';
import { useParams, useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { currentSchoolYear, groupMemberIds, isMembership } from '@/lib/enrollmentWorkflow.mjs';
import { egcReason, membershipErrorMessage, placeLearnerInGroup, removeLearnerFromGroup } from '@/lib/academic/membershipActions.mjs';
import { groupMatchesEnrollment } from '@/lib/academicPrograms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { entities } from '@/lib/entities';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, Users, UserSearch, UserPlus, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { STUDENT_STATUS_COLORS } from '@/lib/statusColors';
import ProgrammePill from '@/components/operational/ProgrammePill';
import ContextLink from '@/components/ContextLink';
import { safeReturnTo } from '@/lib/navigation.mjs';
import { getTeacherRoster, rosterToAcademicRows } from '@/lib/portal';
import ReadState from '@/components/operational/ReadState';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';

const chunks = (values, size = 100) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));

// Staff read this group only (plan SCG-r1, REL-3): the learners filed in it or
// named by one of its enrollments, and those learners' enrollments.
async function loadGroupRoster(groupId) {
  const [filed, groupEnrollments] = await Promise.all([
    entities.Student.filterAll({ groupe_id: groupId }, 'full_name'),
    entities.Enrollment.filterAll({ group_id: groupId }, '-created_at'),
  ]);
  const have = new Set(filed.map(s => s.id));
  const named = [...new Set(groupEnrollments.map(e => e.student_id).filter(sid => sid && !have.has(sid)))];
  const others = (await Promise.all(chunks(named).map(ids => entities.Student.filterAll({ id: ids }, 'full_name')))).flat();
  const students = [...filed, ...others];
  const ids = students.map(s => s.id);
  const theirs = (await Promise.all(chunks(ids).map(chunk => entities.Enrollment.filterAll({ student_id: chunk }, '-created_at')))).flat();
  const enrollments = [...new Map([...groupEnrollments, ...theirs].map(e => [e.id, e])).values()];
  return [enrollments, students];
}

export default function GroupDetail() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'director' || role === 'receptionist';

  const queryClient = useQueryClient();
  const [enrollments, setEnrollments] = useState([]);
  const [reload, setReload] = useState(0);
  const [group, setGroup] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]); // roster (in this group)
  const [visibleStudents, setVisibleStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [override, setOverride] = useState(null); // { student, reason }
  const canOverride = role === 'admin' || role === 'director';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    (async () => {
      const [g] = await entities.Group.filter({ id });
      setGroup(g || null);
      if (g?.teacher_id) {
        const [t] = await getTeacherDirectory({ id: g.teacher_id });
        setTeacher(t || null);
      }
      // A teacher reads the class list of this group (no contact field, Q1 = A).
      const [registrations, everyone] = role === 'teacher'
        ? await getTeacherRoster(id).then(rows => {
          const roster = rosterToAcademicRows(rows);
          return [roster.enrollments, roster.students];
        })
        : await loadGroupRoster(id);
      setEnrollments(registrations);
      const members = groupMemberIds(everyone, registrations, id);
      setStudents(everyone.filter(s => members.has(s.id)));
      setVisibleStudents(everyone);
      setLoading(false);
    })().catch(() => { setLoadError(true); setLoading(false); });
  }, [id, reload, role]);

  // The picker needs every learner and enrollment: read only when it opens.
  const picker = useQuery({
    queryKey: ['Student', 'group-picker', id],
    enabled: pickerOpen && canManage,
    queryFn: async () => {
      const [pickerEnrollments, pickerStudents] = await Promise.all([
        entities.Enrollment.listAll('-created_at'),
        entities.Student.listAll('full_name'),
      ]);
      return { enrollments: pickerEnrollments, students: pickerStudents };
    },
  });
  const pickerEnrollments = picker.data?.enrollments ?? [];

  const groupSchoolYear = (group?.annee || '').replace('-', '/') || currentSchoolYear();
  // Seats as the server counts them: members plus every non-rejected, non-ended
  // enrollment that carries this group (pre-enrollments too), visible learners only.
  const seats = new Set([...students.map(s => s.id), ...enrollments
    .filter(e => e.group_id === id && !['Rejected', 'Ended'].includes(e.status) && visibleStudents.some(s => s.id === e.student_id))
    .map(e => e.student_id)]).size;
  const full = Boolean(group?.capacite_max) && seats >= group.capacite_max;
  // A paid enrollment without level fits any group of its programme (the group sets the level).
  const matchingPending = (student) => pickerEnrollments.filter(e => e.student_id === student.id
    && e.status === 'Confirmed' && !e.group_id && groupMatchesEnrollment(group, e, student));
  // D1: one group per programme and school year; a member of another group of this
  // programme changes group from their enrollment, not from this picker.
  const inOtherGroupOfProgramme = (student) => pickerEnrollments.some(e => e.student_id === student.id && isMembership(e)
    && e.group_id !== id && e.session_type === (group.session_type || 'Yearly') && (!e.school_year || e.school_year === groupSchoolYear));
  const intendedMatch = (s) => (s.session_type || 'Yearly') === (group.session_type || 'Yearly')
    && (role === 'receptionist' ? s.niveau_cefr === group.niveau : (!s.niveau_cefr || s.niveau_cefr === group.niveau));
  // N4: the label follows the learner's membership in another programme's group.
  const memberOfOtherProgramme = (student) => pickerEnrollments.some(e => e.student_id === student.id && isMembership(e)
    && e.session_type !== (group.session_type || 'Yearly'));
  // A member of another programme's group is offered to management too (DAT-1).
  const otherProgrammeMember = (s) => role !== 'receptionist' && s.groupe_id && s.groupe_id !== id && !intendedMatch(s);
  const available = (picker.data?.students ?? []).filter(s => !students.some(member => member.id === s.id) && !inOtherGroupOfProgramme(s)
    && (matchingPending(s).length > 0 || intendedMatch(s) || otherProgrammeMember(s)));
  const refreshMemberships = () => {
    invalidateAfterLearnerSave(queryClient);
    setReload(value => value + 1);
  };

  // Every placement creates or uses an enrollment (DAT-2): the reception keeps its
  // command; director and admin use place_learner_in_group, with a capacity
  // override reason when the group is full (D4-A).
  const addToGroup = async (s, overrideReason = null) => {
    const pending = matchingPending(s);
    if (pending.length > 1) { toast.error('Choisissez l’inscription à affecter depuis la fiche apprenant.'); return; }
    if (full && !overrideReason) {
      if (canOverride) setOverride({ student: s, reason: '' });
      else toast.error('Ce groupe est complet.');
      return;
    }
    setBusyId(s.id);
    try {
      const selected = pending[0] || null;
      const { error } = role === 'receptionist'
        ? await getBrowserClient().rpc('assign_receptionist_student_group', {
          p_student: s.id, p_enrollment: selected?.id || null, p_group: id,
          p_student_updated_at: s.updated_at, p_enrollment_updated_at: selected?.updated_at || null,
        })
        : await placeLearnerInGroup(getBrowserClient(), { student: s, group: id, enrollment: selected,
          schoolYear: selected ? null : groupSchoolYear, overrideReason });
      if (error) throw error;
      setOverride(null);
      refreshMemberships();
      toast.success(`${s.full_name} ajouté(e) au groupe`);
    } catch (error) {
      // The server counts every seat (pending enrollments with this group too):
      // its capacity answer opens the override dialog for direction (S2).
      if (egcReason(error?.hint) === 'capacity' && canOverride && !overrideReason) {
        setOverride({ student: s, reason: '' });
        return;
      }
      toast.error(membershipErrorMessage(error));
      // Changed in the meantime (ADR-009): reload the members for review.
      if (isRecordConflict(error)) refreshMemberships();
    } finally {
      setBusyId(null);
    }
  };

  const removeFromGroup = async (s) => {
    if (!confirm(`Retirer ${s.full_name} de ce groupe ?`)) return;
    setBusyId(s.id);
    try {
      const matching = enrollments.filter(e => e.student_id === s.id && e.group_id === id && isMembership(e));
      if (matching.length > 1) { toast.error('Sélectionnez une inscription depuis la fiche apprenant.'); return; }
      const { error } = role === 'receptionist'
        ? await getBrowserClient().rpc('assign_receptionist_student_group', {
          p_student: s.id, p_enrollment: matching[0]?.id || null, p_group: null,
          p_student_updated_at: s.updated_at, p_enrollment_updated_at: matching[0]?.updated_at || null,
        })
        : await removeLearnerFromGroup(getBrowserClient(), { student: s, group: id, enrollment: matching[0] || null });
      if (error) { toast.error(membershipErrorMessage(error)); if (isRecordConflict(error)) refreshMemberships(); return; }
      refreshMemberships();
      toast.success(`${s.full_name} retiré(e) du groupe`);
    } catch {
      // toasted
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>;
  if (loadError) return <div className="p-4 lg:p-8"><ReadState state="error" onRetry={() => setReload(value => value + 1)} /></div>;
  if (!group) return <div className="p-8 text-center text-muted-foreground text-sm">Groupe introuvable.</div>;

  const meta = [
    ['Session', group.session_type || 'Yearly'],
    ['Niveau', group.niveau],
    ['Catégorie', group.categorie],
    ['Enseignant', teacher?.full_name || '—'],
    ['Horaire', `${group.jours || ''} ${group.horaire || ''}`.trim() || '—'],
    ['Salle', group.salle || '—'],
    ['Terme', `${group.terme || '—'}${group.annee ? ` · ${group.annee}` : ''}`],
  ];
  return (
    <div className="p-4 lg:p-8">
      <button onClick={() => router.push(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'), '/groups'))} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft size={15} /> Retour
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{group.name}</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
            <Users size={14} /> {students.length} apprenant{students.length > 1 ? 's' : ''}
            {group.capacite_max ? ` / ${group.capacite_max}` : ''}
            {full && <span className="text-amber-600 font-medium">· complet</span>}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setPickerOpen(true)}
            disabled={full && !canOverride}
            title={full ? (canOverride ? 'Groupe complet : un dépassement demande un motif' : 'Groupe complet') : undefined}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus size={15} /> Ajouter des apprenants
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {meta.map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium">{label === 'Enseignant' && teacher && canManage ? <ContextLink href={`/teachers/${teacher.id}`} className="inline-flex min-h-10 items-center rounded text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{teacher.full_name}</ContextLink> : val || '—'}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 lg:px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Apprenants du groupe</h2>
        </div>
        {students.length === 0 ? (
          <div className="p-10 text-center">
            <UserSearch size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">Aucun apprenant dans ce groupe</p>
            {canManage && (
              <button onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1 text-sm font-semibold mt-3 hover:underline" style={{ color: 'var(--brand)' }}>
                <UserPlus size={14} /> Ajouter des apprenants
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  {['Nom', 'Catégorie', 'Session', 'Niveau', ...(canManage ? ['Téléphone'] : []), 'Statut', ''].map(hd => (
                    <th key={hd} className="text-left px-4 py-3 font-semibold text-muted-foreground">{hd}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map(s => (
                  <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {canManage ? <ContextLink href={`/students/${s.id}`} className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{s.full_name}</ContextLink> : s.full_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.age_category || '—'}</td>
                    <td className="px-4 py-3">
                      {group.session_type
                        ? <ProgrammePill sessionType={group.session_type} />
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {group.niveau ? <span className="inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold text-white bg-primary">{group.niveau}</span> : '—'}
                    </td>
                    {canManage && <td className="px-4 py-3 text-muted-foreground">{s.telephone || '—'}</td>}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STUDENT_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-500'}`}>{s.status || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <button
                          onClick={() => removeFromGroup(s)}
                          disabled={busyId === s.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          <X size={13} /> Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pickerOpen && (
        <Dialog open onOpenChange={(o) => !o && setPickerOpen(false)}>
          <DialogContent className="max-w-md p-0">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>Ajouter des apprenants à « {group.name} »</DialogTitle>
            </DialogHeader>
            <Command>
              <CommandInput placeholder="Rechercher un apprenant…" />
              <CommandList className="max-h-80">
                <CommandEmpty>{picker.isError ? 'Impossible de charger les apprenants.' : picker.isLoading ? 'Chargement…' : 'Aucun apprenant disponible.'}</CommandEmpty>
                <CommandGroup>
                  {available.map(s => (
                    <CommandItem
                      key={s.id}
                      value={`${s.full_name} ${s.telephone || ''}`}
                      onSelect={() => addToGroup(s)}
                      disabled={busyId === s.id || (full && !canOverride)}
                    >
                      <UserPlus size={14} className="mr-2 text-muted-foreground" />
                      <span className="flex-1 truncate">{s.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {memberOfOtherProgramme(s) ? 'déjà dans un autre programme' : `${s.session_type || 'Yearly'} · ${s.niveau_cefr || 'NIV à définir'}`}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{students.length} dans le groupe{group.capacite_max ? ` / ${group.capacite_max}` : ''}</span>
              <button onClick={() => setPickerOpen(false)} className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-md bg-primary text-white hover:opacity-90">
                <Check size={14} /> Terminé
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {override && (
        <Dialog open onOpenChange={(o) => !o && setOverride(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Groupe complet</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); addToGroup(override.student, override.reason.trim()); }}>
              <p className="text-sm text-muted-foreground">
                « {group.name} » a atteint sa capacité ({group.capacite_max}). Ajouter {override.student.full_name} quand même ? Le motif est enregistré dans le journal.
              </p>
              <label htmlFor="capacity-override-reason" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motif du dépassement *</label>
              <textarea id="capacity-override-reason" required maxLength={200} value={override.reason}
                onChange={(event) => setOverride(current => ({ ...current, reason: event.target.value }))}
                className="h-20 w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOverride(null)} className="rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">Annuler</button>
                <button type="submit" disabled={!override.reason.trim() || busyId === override.student.id} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Ajouter quand même</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
