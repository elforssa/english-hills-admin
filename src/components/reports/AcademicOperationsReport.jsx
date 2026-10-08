'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowUpRight, CalendarCheck2, GraduationCap, UsersRound,
} from 'lucide-react';
import { isPendingPreEnrollment, studentNeedsGroup } from '@/lib/enrollmentWorkflow.mjs';
import { SESSION_TYPES } from '@/lib/academicPrograms';

const ACTIVE_STUDENT_STATUSES = new Set(['Enrolled', 'Trial', 'Alumni']);

function Metric({ icon: Icon, label, value, note, tone = 'slate' }) {
  const tones = {
    slate: 'bg-primary/5 text-foreground border-primary/15',
    amber: 'bg-amber-50 text-amber-950 border-amber-200',
    rose: 'bg-rose-50 text-rose-950 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-950 border-emerald-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold opacity-70">{label}</p>
        <Icon size={15} className="opacity-60" />
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] opacity-65">{note}</p>
    </div>
  );
}

function ActionList({ title, description, items, href, empty, accent = 'amber' }) {
  const accentClasses = accent === 'rose'
    ? 'border-rose-200 bg-rose-50/60 text-rose-700'
    : 'border-amber-200 bg-amber-50/60 text-amber-800';
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3.5">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Link href={href} className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
          Traiter <ArrowUpRight size={12} />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-xs text-emerald-700">{empty}</p>
      ) : (
        <div className="p-3 space-y-2">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className={`rounded-lg border px-3 py-2 text-xs font-medium ${accentClasses}`}>
              {item.label}
            </div>
          ))}
          {items.length > 5 && <p className="px-1 text-[11px] text-muted-foreground">+ {items.length - 5} autre(s) élément(s)</p>}
        </div>
      )}
    </section>
  );
}

export default function AcademicOperationsReport({
  students, teachers, groups, enrollments, loading,
}) {
  const [sessionFilter, setSessionFilter] = useState('');

  const data = useMemo(() => {
    const studentsById = new Map(students.map((student) => [student.id, student]));
    const membersByGroup = new Map(groups.map((group) => [group.id, new Set()]));

    students.forEach((student) => {
      if (student.groupe_id && membersByGroup.has(student.groupe_id)) membersByGroup.get(student.groupe_id).add(student.id);
    });
    enrollments.forEach((enrollment) => {
      if (['Validated', 'Trial'].includes(enrollment.status) && enrollment.group_id && membersByGroup.has(enrollment.group_id)) {
        membersByGroup.get(enrollment.group_id).add(enrollment.student_id);
      }
    });

    const sessionGroups = groups.filter((group) => !sessionFilter || (group.session_type || 'Yearly') === sessionFilter);
    const activeStudents = students.filter((student) => ACTIVE_STUDENT_STATUSES.has(student.status));
    const sessionStudents = activeStudents.filter((student) => !sessionFilter || (student.session_type || 'Yearly') === sessionFilter);
    const unassignedGroups = sessionGroups
      .filter((group) => !group.teacher_id)
      .map((group) => ({ id: group.id, label: `${group.name} · ${group.session_type || 'Yearly'} · ${group.niveau}` }));
    const studentsWithoutGroup = activeStudents
      .filter((student) => studentNeedsGroup(student, enrollments, sessionFilter))
      .map((student) => {
        const pending = enrollments.filter(e => e.student_id === student.id && e.status === 'Confirmed' && !e.group_id
          && (!sessionFilter || (e.session_type || student.session_type || 'Yearly') === sessionFilter));
        const sessions = pending.map(e => [e.session_type || student.session_type || 'Yearly', e.school_year].filter(Boolean).join(' · '));
        return { id: student.id, label: `${student.full_name} · ${sessions.length ? sessions.join(' / ') : student.session_type || 'Yearly'}` };
      });
    const enrollmentsToReview = enrollments
      .filter(isPendingPreEnrollment)
      .filter((enrollment) => !sessionFilter || (enrollment.session_type || studentsById.get(enrollment.student_id)?.session_type || 'Yearly') === sessionFilter)
      .map((enrollment) => ({ id: enrollment.id, label: `${studentsById.get(enrollment.student_id)?.full_name || 'Apprenant'} · ${enrollment.status}` }));

    const sessionRows = SESSION_TYPES.map((sessionType) => {
      const rowGroups = groups.filter((group) => (group.session_type || 'Yearly') === sessionType);
      const rowStudents = activeStudents.filter((student) => (student.session_type || 'Yearly') === sessionType);
      const assigned = rowGroups.filter((group) => group.teacher_id).length;
      const capacity = rowGroups.reduce((sum, group) => sum + Number(group.capacite_max || 0), 0);
      const occupied = rowGroups.reduce((sum, group) => sum + (membersByGroup.get(group.id)?.size || 0), 0);
      return { sessionType, groups: rowGroups.length, students: rowStudents.length, assigned, capacity, occupied };
    }).filter((row) => row.groups || row.students);

    const teacherRows = teachers.map((teacher) => {
      const teacherGroups = sessionGroups.filter((group) => group.teacher_id === teacher.id);
      const regularStudents = new Set(teacherGroups.flatMap((group) => [...(membersByGroup.get(group.id) || [])]));
      return { id: teacher.id, name: teacher.full_name, groups: teacherGroups.length, students: regularStudents.size };
    }).filter((row) => row.groups).sort((a, b) => b.students - a.students);

    return {
      sessionGroups, sessionStudents, unassignedGroups, studentsWithoutGroup, enrollmentsToReview,
      sessionRows, teacherRows,
    };
  }, [students, teachers, groups, enrollments, sessionFilter]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative bg-[var(--brand-sidebar)] px-5 py-5 text-white lg:px-6">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-100">Pilotage académique</p>
            <h2 className="mt-2 text-xl font-black tracking-tight">Groupes et affectations</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-blue-100/80">Les écarts qui demandent une action humaine, regroupés dans une seule vue.</p>
          </div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-blue-100">
            Session
            <select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)} className="mt-1 block min-w-52 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">
              <option value="">Toutes les sessions</option>
              {SESSION_TYPES.map((session) => <option key={session} value={session}>{session}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-5 bg-background p-4 text-foreground lg:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Metric icon={UsersRound} label="Groupes sans enseignant" value={loading ? '—' : data.unassignedGroups.length} note={`${data.sessionGroups.length} groupe(s) dans la vue`} tone={data.unassignedGroups.length ? 'rose' : 'emerald'} />
          <Metric icon={GraduationCap} label="Apprenants sans groupe" value={loading ? '—' : data.studentsWithoutGroup.length} note={`${data.sessionStudents.length} apprenant(s) actif(s)`} tone={data.studentsWithoutGroup.length ? 'amber' : 'emerald'} />
          <Metric icon={AlertTriangle} label="Inscriptions à examiner" value={loading ? '—' : data.enrollmentsToReview.length} note="Demandes soumises ou en revue" tone={data.enrollmentsToReview.length ? 'amber' : 'emerald'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ActionList title="Groupes sans enseignant" description="À affecter avant l’ouverture des cours." items={data.unassignedGroups} href="/groups" empty="Tous les groupes visibles ont un enseignant." accent="rose" />
          <ActionList title="Apprenants sans groupe" description="Apprenants actifs avec un groupe à affecter, y compris pour une session supplémentaire." items={data.studentsWithoutGroup} href="/students" empty="Tous les apprenants actifs sont affectés." />
          <ActionList title="Inscriptions à examiner" description="Demandes académiques en attente d’une décision." items={data.enrollmentsToReview} href="/enrollments" empty="Aucune inscription ne demande de revue." />
        </div>

        <section className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
            <CalendarCheck2 size={16} className="text-primary" />
            <div><h3 className="text-sm font-bold">Couverture par session</h3><p className="text-[11px] text-muted-foreground">Groupes, enseignants et occupation active.</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-2 text-left">Session</th><th className="px-3 py-2 text-right">Groupes</th><th className="px-3 py-2 text-right">Affectés</th><th className="px-3 py-2 text-right">Apprenants</th><th className="px-4 py-2 text-right">Occupation</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.sessionRows.map((row) => (
                  <tr key={row.sessionType}>
                    <td className="px-4 py-3 font-semibold">{row.sessionType}</td><td className="px-3 py-3 text-right">{row.groups}</td><td className="px-3 py-3 text-right">{row.assigned}/{row.groups}</td><td className="px-3 py-3 text-right">{row.students}</td><td className="px-4 py-3 text-right font-semibold">{row.capacity ? `${Math.round((row.occupied / row.capacity) * 100)}%` : '—'}</td>
                  </tr>
                ))}
                {!data.sessionRows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Aucune donnée académique.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="border-b border-border px-4 py-3.5"><h3 className="text-sm font-bold">Charge des enseignants</h3><p className="text-[11px] text-muted-foreground">Groupes réguliers actifs.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-2 text-left">Enseignant</th><th className="px-3 py-2 text-right">Groupes</th><th className="px-4 py-2 text-right">Apprenants</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.teacherRows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-3 py-3 text-right">{row.groups}</td><td className="px-4 py-3 text-right">{row.students}</td></tr>)}
                {!data.teacherRows.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Aucune affectation enseignant dans cette vue.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
