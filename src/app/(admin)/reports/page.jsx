'use client';

// =============================================================================
// /reports — analytics dashboard for admins & directors.
//
// Three sections, each rendered with `recharts` (already in deps):
//   • Présences   — daily roll-up of Présent / Absent / Retard / Justifié
//                   over the last N days (default 30).
//   • Finance     — monthly encaissé and facturé side by side (different sets: no rate).
//   • Paie        — payroll YTD per teacher (brut/net) for the chosen year.
//
// Year/period selectors are local state. Plan SCG-r1 (REL-3, REL-6): the
// database returns small totals (report_* functions, the caller's own RLS)
// instead of whole tables, and the attendance days and current year are
// Casablanca civil dates computed by the database; the browser does no date
// arithmetic, so its time-zone table cannot move a day.
// =============================================================================

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, Users, CreditCard, Briefcase, Calendar } from 'lucide-react';
import { useEntityAll } from '@/lib/queries';
import { entities } from '@/lib/entities';
import AcademicOperationsReport from '@/components/reports/AcademicOperationsReport';
import { getBrowserClient } from '@/lib/supabase';
import {
  ACADEMIC_ENROLLMENT_STATUSES, attendanceSeries as toAttendanceSeries, attendanceTotals as toAttendanceTotals,
  isAcademicSourceStudent, reportYears,
} from '@/lib/reportData.mjs';
import { ACTIVE_STUDENT_STATUSES } from '@/lib/enrollmentWorkflow.mjs';

// Brand palette — matches the rest of the platform.
const COLORS = {
  primary:  'var(--brand)',
  success:  '#059669',
  warning:  '#d97706',
  danger:   '#B91C2E',
  purple:   '#7c3aed',
  teal:     '#0891b2',
  amber:    '#f59e0b',
};

const ATTENDANCE_COLORS = {
  'Présent':   COLORS.success,
  'Absent':    COLORS.danger,
  'Retard':    COLORS.warning,
  'Justifié':  COLORS.teal,
};

const PRESET_RANGES = [
  { id: 7,   label: '7 jours' },
  { id: 30,  label: '30 jours' },
  { id: 90,  label: '90 jours' },
];

function fmtMonth(monthIdx, year) {
  return new Date(year, monthIdx, 1).toLocaleDateString('fr-MA', {
    month: 'short', year: '2-digit',
  });
}

function MAD(n) {
  return `${Math.round(n || 0).toLocaleString('fr-MA')} MAD`;
}

// ── small wrapper used for every chart panel — keeps the page scannable.
function Panel({ title, subtitle, icon: Icon, right, children }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
              <Icon size={18} />
            </div>
          )}
          <div>
            <h2 className="font-semibold text-sm">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function StatCard({ label, value, hint, color = COLORS.primary }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

async function rpc(name, args) {
  const { data, error } = await getBrowserClient().rpc(name, args);
  if (error) throw error;
  return data;
}

const chunks = (values, size = 100) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));

// The academic-operations report's rows only: live enrollments, active learners,
// the learners those enrollments name and the learners filed in a group.
async function loadAcademicSources(groups) {
  const [enrollments, active] = await Promise.all([
    entities.Enrollment.filterAll({ status: ACADEMIC_ENROLLMENT_STATUSES }, '-created_date'),
    entities.Student.filterAll({ status: ACTIVE_STUDENT_STATUSES }, 'full_name'),
  ]);
  const have = new Set(active.map(s => s.id));
  const named = [...new Set(enrollments.map(e => e.student_id).filter(id => id && !have.has(id)))];
  const extra = (await Promise.all([
    ...chunks(named).map(ids => entities.Student.filterAll({ id: ids }, 'full_name')),
    ...chunks(groups.map(g => g.id)).map(ids => entities.Student.filterAll({ groupe_id: ids }, 'full_name')),
  ])).flat();
  const liveIds = new Set(enrollments.map(e => e.student_id));
  const groupIds = new Set(groups.map(g => g.id));
  const students = [...active];
  for (const student of extra) {
    if (have.has(student.id) || !isAcademicSourceStudent(student, liveIds, groupIds)) continue;
    have.add(student.id);
    students.push(student);
  }
  return { students, enrollments };
}

export default function ReportsPage() {
  const [days, setDays]   = useState(30);
  const [chosenYear, setYear] = useState(null);

  const yearsQuery = useQuery({ queryKey: ['report', 'years'], queryFn: () => rpc('report_years') });
  const { years: availableYears, current: currentYear } = reportYears(yearsQuery.data);
  const year = chosenYear || currentYear;
  const attendanceQuery = useQuery({ queryKey: ['report', 'attendance', days], queryFn: () => rpc('report_attendance_daily', { p_days: days }) });
  const financeQuery = useQuery({ queryKey: ['report', 'finance', year], enabled: Boolean(year),
    queryFn: () => rpc('get_finance_year_months', { p_year: Number(year) }) });
  const payrollQuery = useQuery({ queryKey: ['report', 'payroll', year], enabled: Boolean(year),
    queryFn: () => rpc('report_payroll_by_teacher', { p_year: Number(year) }) });
  const mixQuery = useQuery({ queryKey: ['report', 'student-mix'], queryFn: () => rpc('report_student_mix') });
  const { data: teachers = [], isLoading: teachersLoading, isError: teachersError } = useEntityAll('Teacher', 'full_name');
  const { data: groups = [], isLoading: groupsLoading, isError: groupsError } = useEntityAll('Group', 'name');
  const academicQuery = useQuery({ queryKey: ['report', 'academic-sources', groups.map(g => g.id)], enabled: !groupsLoading && !groupsError,
    queryFn: () => loadAcademicSources(groups) });
  const students = academicQuery.data?.students ?? [];
  const enrollments = academicQuery.data?.enrollments ?? [];
  const financeRows = useMemo(() => (Array.isArray(financeQuery.data) ? financeQuery.data : []), [financeQuery.data]);

  // ── attendance roll-up: {date, Présent, Absent, Retard, Justifié} per Casablanca day ──
  const attendanceSeries = useMemo(() => toAttendanceSeries(attendanceQuery.data), [attendanceQuery.data]);
  const attendanceTotals = useMemo(() => toAttendanceTotals(attendanceSeries), [attendanceSeries]);

  // ── finance: monthly encaissé vs facturé for selected year ──
  const financeMonthly = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: fmtMonth(i, parseInt(year, 10)),
      monthIdx: i,
      encaisse: 0,
      facture:  0,
    }));

    for (const row of financeRows) Object.assign(months[Number(row.month_idx)], { facture: Number(row.facture || 0), encaisse: Number(row.encaisse || 0) });
    return months;
  }, [financeRows, year]);

  // Facturé (charges created) and encaissé (payments dated) are different sets,
  // so no remaining balance or rate is derived from them (FIN-9).
  const financeTotals = useMemo(() => ({
    facture: financeMonthly.reduce((s, m) => s + m.facture, 0),
    encaisse: financeMonthly.reduce((s, m) => s + m.encaisse, 0),
  }), [financeMonthly]);

  // ── payroll: YTD per teacher for selected year (largest net first) ──
  const payrollByTeacher = useMemo(() => (payrollQuery.data || []).map(row => ({
    name: row.teacher_name, brut: Number(row.brut || 0), net: Number(row.net || 0), count: Number(row.n || 0),
  })), [payrollQuery.data]);

  // Totals cover every teacher; only the chart is limited to the top 12.
  const payrollTotals = useMemo(() => ({
    brut: payrollByTeacher.reduce((s, t) => s + t.brut, 0),
    net: payrollByTeacher.reduce((s, t) => s + t.net, 0),
  }), [payrollByTeacher]);
  const payrollChart = useMemo(() => payrollByTeacher.slice(0, 12), [payrollByTeacher]);

  // ── student status mix — useful sanity check on the active pipeline ──
  const studentMix = useMemo(() => (mixQuery.data || []).map(row => ({ name: row.status, value: Number(row.n) })), [mixQuery.data]);

  const studentMixColors = [COLORS.success, COLORS.teal, COLORS.warning, COLORS.purple, '#94a3b8'];

  const loading = attendanceQuery.isLoading || financeQuery.isLoading || payrollQuery.isLoading || yearsQuery.isLoading;
  const academicLoading = teachersLoading || groupsLoading || academicQuery.isLoading;
  const queries = [yearsQuery, attendanceQuery, financeQuery, payrollQuery, mixQuery, academicQuery];
  const dataError = teachersError || groupsError || queries.some(q => q.isError);

  if (dataError) return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto" role="alert">
      <h1 className="text-2xl font-bold">Rapports indisponibles</h1>
      <p className="mt-2 text-sm text-muted-foreground">Une source de données n’a pas pu être chargée. Aucun total partiel n’est affiché.</p>
      <button className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-semibold text-primary" onClick={() => {
        if (teachersError || groupsError) window.location.reload();
        else queries.filter(q => q.isError).forEach(q => q.refetch());
      }}>Réessayer</button>
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Pilotage du centre</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Rapports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Synthèse présences, finance et paie. Les données sont rafraîchies en temps réel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-muted-foreground" />
          <select aria-label="Année des rapports"
            value={year}
            onChange={e => setYear(e.target.value)}
            className="border border-border rounded-md px-3 py-1.5 text-sm bg-white"
          >
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      {/* ── KPI ROW ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label={`Taux de présence (${days}j)`}
          value={loading ? '—' : `${attendanceTotals.rate}%`}
          hint={`${attendanceTotals.total} sessions enregistrées`}
          color={COLORS.success}
        />
        <StatCard
          label={`Encaissé ${year}`}
          value={loading ? '—' : MAD(financeTotals.encaisse)}
          hint="Paiements datés de l’année"
          color={COLORS.primary}
        />
        <StatCard
          label={`Facturé ${year}`}
          value={loading ? '—' : MAD(financeTotals.facture)}
          hint="Engagements créés dans l’année"
          color={COLORS.amber}
        />
        <StatCard
          label={`Paie nette ${year}`}
          value={loading ? '—' : MAD(payrollTotals.net)}
          hint={`${payrollByTeacher.length} enseignant(s)`}
          color={COLORS.purple}
        />
      </div>

      <div className="space-y-6">
        <AcademicOperationsReport
          students={students}
          teachers={teachers}
          groups={groups}
          enrollments={enrollments}
          loading={academicLoading}
        />

        {/* ── Attendance ─────────────────────────────────────────────── */}
        <Panel
          title="Présences"
          subtitle={`Sessions par jour sur les ${days} derniers jours`}
          icon={Users}
          right={
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {PRESET_RANGES.map(r => (
                <button
                  key={r.id}
                  onClick={() => setDays(r.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    days === r.id ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceSeries} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={d => d.slice(5)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Présent"  stackId="1" stroke={ATTENDANCE_COLORS['Présent']}  fill={ATTENDANCE_COLORS['Présent']}  fillOpacity={0.5} />
                <Area type="monotone" dataKey="Justifié" stackId="1" stroke={ATTENDANCE_COLORS['Justifié']} fill={ATTENDANCE_COLORS['Justifié']} fillOpacity={0.5} />
                <Area type="monotone" dataKey="Retard"   stackId="1" stroke={ATTENDANCE_COLORS['Retard']}   fill={ATTENDANCE_COLORS['Retard']}   fillOpacity={0.5} />
                <Area type="monotone" dataKey="Absent"   stackId="1" stroke={ATTENDANCE_COLORS['Absent']}   fill={ATTENDANCE_COLORS['Absent']}   fillOpacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* ── Finance ────────────────────────────────────────────────── */}
        <Panel
          title="Finance"
          subtitle={`Encaissé vs facturé — ${year}`}
          icon={CreditCard}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeMonthly} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={v => MAD(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="facture"  name="Facturé"  fill={COLORS.amber}   radius={[4, 4, 0, 0]} />
                <Bar dataKey="encaisse" name="Encaissé" fill={COLORS.success} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs text-emerald-600 font-medium">Encaissé</p>
              <p className="text-lg font-bold text-emerald-700">{MAD(financeTotals.encaisse)}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground font-medium">Facturé</p>
              <p className="text-lg font-bold text-foreground">{MAD(financeTotals.facture)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Facturé : engagements créés dans le mois. Encaissé : paiements datés du mois, quel que soit l’engagement. Le reste à encaisser figure dans Finance.</p>
        </Panel>

        {/* ── Payroll YTD ───────────────────────────────────────────── */}
        <Panel
          title="Paie YTD"
          subtitle={`Top enseignants — ${year}`}
          icon={Briefcase}
        >
          {payrollByTeacher.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucune paie enregistrée pour {year}.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={payrollChart}
                  layout="vertical"
                  margin={{ left: 80, right: 16, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    type="number"
                    tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={120}
                  />
                  <Tooltip formatter={v => MAD(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="brut" name="Brut" fill={COLORS.amber}   radius={[0, 3, 3, 0]} />
                  <Bar dataKey="net"  name="Net"  fill={COLORS.purple} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        {/* ── Student funnel ────────────────────────────────────────── */}
        <Panel
          title="Apprenants"
          subtitle={`${studentMix.reduce((sum, m) => sum + m.value, 0)} au total · répartition par statut`}
          icon={TrendingUp}
        >
          {studentMix.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun apprenant enregistré.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={studentMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {studentMix.map((_, i) => (
                        <Cell key={i} fill={studentMixColors[i % studentMixColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {studentMix
                  .sort((a, b) => b.value - a.value)
                  .map((m, i) => (
                    <div key={m.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: studentMixColors[i % studentMixColors.length] }}
                        />
                        <span className="text-muted-foreground">{m.name}</span>
                      </div>
                      <span className="font-semibold">{m.value}</span>
                    </div>
                  ))}
                <div className="text-xs text-muted-foreground pt-2 mt-2 border-t border-border">
                  Enseignants actifs: <strong className="text-foreground">{teachers.length}</strong>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
