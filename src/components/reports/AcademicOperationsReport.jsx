'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowUpRight, BookOpenCheck, CalendarCheck2, Crown,
  GraduationCap, Link2, UsersRound,
} from 'lucide-react';
import { SESSION_TYPES } from '@/lib/academicPrograms';

const ACTIVE_STUDENT_STATUSES = new Set(['Enrolled', 'Trial', 'Alumni']);

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date = new Date()) {
  const value = new Date(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return dateString(value);
}

function Metric({ icon: Icon, label, value, note, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-900 text-white border-slate-800',
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
  students, teachers, groups, enrollments, receipts, premiumSessions, premiumHomework,
  premiumGroups, premiumMemberships, premiumAttendance, loading,
}) {
  const [sessionFilter, setSessionFilter] = useState('');
  const today = dateString(new Date());
  const currentWeek = mondayOf();

  const data = useMemo(() => {
    const studentById = Object.fromEntries(students.map((student) => [student.id, student]));
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
    const studentsWithoutGroup = sessionStudents
      .filter((student) => !student.groupe_id && !enrollments.some((enrollment) => enrollment.student_id === student.id && enrollment.group_id && ['Validated', 'Trial'].includes(enrollment.status)))
      .map((student) => ({ id: student.id, label: `${student.full_name} · ${student.session_type || 'Yearly'} · ${student.niveau_cefr || 'niveau non défini'}` }));
    const unlinkedReceipts = receipts
      .filter((receipt) => receipt.student_id && !receipt.group_id)
      .filter((receipt) => {
        const receiptSession = receipt.session_type || studentById[receipt.student_id]?.session_type || 'Yearly';
        return !sessionFilter || receiptSession === sessionFilter;
      })
      .map((receipt) => ({
        id: receipt.id,
        label: `${receipt.nom_prenom || studentById[receipt.student_id]?.full_name || 'Reçu'} · ${receipt.date || 'date inconnue'}`,
      }));

    const activePremium = sessionStudents.filter((student) => student.plan_type === 'Premium'
      && (student.session_type || 'Yearly') === 'Yearly'
      && (!student.premium_start_date || student.premium_start_date <= today)
      && (!student.premium_end_date || student.premium_end_date >= today));
    const activePremiumIds = new Set(activePremium.map((student) => student.id));
    const activeMemberships = premiumMemberships.filter((membership) => membership.active && activePremiumIds.has(membership.student_id));
    const assignedPremiumIds = new Set(activeMemberships.map((membership) => membership.student_id));
    const activePremiumGroups = premiumGroups.filter((group) => group.active && (!sessionFilter || sessionFilter === 'Yearly'));
    const activePremiumGroupIds = new Set(activePremiumGroups.map((group) => group.id));
    const weekSessions = premiumSessions.filter((session) => session.week_start === currentWeek
      && session.status !== 'Cancelled' && session.premium_group_id && activePremiumGroupIds.has(session.premium_group_id));
    const weekSessionIds = new Set(weekSessions.map((session) => session.id));
    const weekHomework = premiumHomework.filter((submission) => weekSessionIds.has(submission.premium_session_id));
    const unassignedPremium = activePremium
      .filter((student) => !assignedPremiumIds.has(student.id))
      .map((student) => ({ id: student.id, label: `${student.full_name} · ${student.niveau_cefr || student.session_type || 'Premium'}` }));
    const preparedCount = weekHomework.filter((submission) => submission.status === 'Prepared').length;
    const submittedCount = weekHomework.length;
    const attendanceCount = premiumAttendance.filter((item) => weekSessionIds.has(item.premium_session_id)).length;

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
      const premiumCount = activePremiumGroups.filter((group) => group.teacher_id === teacher.id).length;
      return { id: teacher.id, name: teacher.full_name, groups: teacherGroups.length, students: regularStudents.size, premium: premiumCount };
    }).filter((row) => row.groups || row.premium).sort((a, b) => (b.students + b.premium) - (a.students + a.premium));

    return {
      sessionGroups, sessionStudents, unassignedGroups, studentsWithoutGroup, unlinkedReceipts,
      activePremium, activeMemberships, activePremiumGroups, weekSessions, unassignedPremium,
      preparedCount, submittedCount, attendanceCount,
      sessionRows, teacherRows,
    };
  }, [students, teachers, groups, enrollments, receipts, premiumSessions, premiumHomework, premiumGroups, premiumMemberships, premiumAttendance, sessionFilter, today, currentWeek]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 text-white overflow-hidden">
      <div className="relative px-5 py-5 lg:px-6">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Pilotage académique</p>
            <h2 className="mt-2 text-xl font-black tracking-tight">Groupes, affectations et promesses Premium</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">Les écarts qui demandent une action humaine, regroupés dans une seule vue.</p>
          </div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Session
            <select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)} className="mt-1 block min-w-52 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white">
              <option className="text-slate-950" value="">Toutes les sessions</option>
              {SESSION_TYPES.map((session) => <option className="text-slate-950" key={session} value={session}>{session}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="bg-slate-100 p-4 lg:p-6 text-slate-950 space-y-5">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric icon={UsersRound} label="Groupes sans enseignant" value={loading ? '—' : data.unassignedGroups.length} note={`${data.sessionGroups.length} groupe(s) dans la vue`} tone={data.unassignedGroups.length ? 'rose' : 'emerald'} />
          <Metric icon={GraduationCap} label="Apprenants sans groupe" value={loading ? '—' : data.studentsWithoutGroup.length} note={`${data.sessionStudents.length} apprenant(s) actif(s)`} tone={data.studentsWithoutGroup.length ? 'amber' : 'emerald'} />
          <Metric icon={Link2} label="Reçus à relier" value={loading ? '—' : data.unlinkedReceipts.length} note="Affectation manuelle en attente" tone={data.unlinkedReceipts.length ? 'amber' : 'emerald'} />
          <Metric icon={Crown} label="Premium à affecter" value={loading ? '—' : data.unassignedPremium.length} note={`${data.activeMemberships.length}/${data.activePremium.length} affecté(s) à ${data.activePremiumGroups.length} atelier(s)`} tone={data.unassignedPremium.length ? 'rose' : 'slate'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ActionList title="Groupes sans enseignant" description="À affecter avant l’ouverture des cours." items={data.unassignedGroups} href="/groups" empty="Tous les groupes visibles ont un enseignant." accent="rose" />
          <ActionList title="Apprenants sans groupe" description="Actifs mais sans groupe direct ou inscription validée." items={data.studentsWithoutGroup} href="/students" empty="Tous les apprenants actifs sont affectés." />
          <ActionList title="Reçus sans groupe" description="Reçus rapides conservés pour liaison ultérieure." items={data.unlinkedReceipts} href="/receipts" empty="Aucun reçu ne reste à relier dans cette vue." />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <section className="xl:col-span-3 rounded-xl border border-border bg-white overflow-hidden">
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

          <section className="xl:col-span-2 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="flex items-center justify-between border-b border-amber-200 px-4 py-3.5">
              <div className="flex items-center gap-2"><BookOpenCheck size={16} className="text-amber-700" /><div><h3 className="text-sm font-bold">Préparation Premium</h3><p className="text-[11px] text-amber-800/70">Semaine du {currentWeek}</p></div></div>
              <Link href="/premium-sessions" className="text-xs font-bold text-amber-900 hover:underline">Planning</Link>
            </div>
            <div className="grid grid-cols-4 gap-px bg-amber-200">
              <div className="bg-amber-50 p-4 text-center"><p className="text-xl font-black">{data.weekSessions.length}</p><p className="text-[10px] text-amber-800">Ateliers</p></div>
              <div className="bg-amber-50 p-4 text-center"><p className="text-xl font-black">{data.submittedCount}</p><p className="text-[10px] text-amber-800">Reçues</p></div>
              <div className="bg-amber-50 p-4 text-center"><p className="text-xl font-black">{data.preparedCount}</p><p className="text-[10px] text-amber-800">Prêtes</p></div>
              <div className="bg-amber-50 p-4 text-center"><p className="text-xl font-black">{data.attendanceCount}</p><p className="text-[10px] text-amber-800">Présences saisies</p></div>
            </div>
            <div className="p-4">
              {data.unassignedPremium.length ? (
                <div className="flex items-start gap-2 text-xs text-rose-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><p><strong>{data.unassignedPremium.length} apprenant(s)</strong> Premium ne sont pas encore affectés à un atelier.</p></div>
              ) : <p className="text-xs text-emerald-700">Tous les apprenants Premium Yearly actifs sont affectés à un atelier.</p>}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="border-b border-border px-4 py-3.5"><h3 className="text-sm font-bold">Charge des enseignants</h3><p className="text-[11px] text-muted-foreground">Groupes réguliers et ateliers Premium actifs.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-2 text-left">Enseignant</th><th className="px-3 py-2 text-right">Groupes</th><th className="px-3 py-2 text-right">Apprenants</th><th className="px-4 py-2 text-right">Ateliers Premium</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.teacherRows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-3 py-3 text-right">{row.groups}</td><td className="px-3 py-3 text-right">{row.students}</td><td className="px-4 py-3 text-right">{row.premium}</td></tr>)}
                {!data.teacherRows.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Aucune affectation enseignant dans cette vue.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
