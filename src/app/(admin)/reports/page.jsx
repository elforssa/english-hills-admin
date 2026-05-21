'use client';

// =============================================================================
// /reports — analytics dashboard for admins & directors.
//
// Three sections, each rendered with `recharts` (already in deps):
//   • Présences   — daily roll-up of Présent / Absent / Retard / Justifié
//                   over the last N days (default 30).
//   • Finance     — monthly encaissé vs facturé, plus % recouvrement.
//   • Paie        — payroll YTD per teacher (brut/net) for the chosen year.
//
// Year/period selectors are local state; the data fetch reuses the
// React Query hooks added in Fix 9 so other pages benefit from the cache.
// =============================================================================

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, Users, CreditCard, Briefcase, Calendar } from 'lucide-react';
import { useEntityList } from '@/lib/queries';

// Brand palette — matches the rest of the platform.
const COLORS = {
  primary:  '#1E4D8B',
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

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDay(d) {
  return d.toISOString().slice(0, 10);
}

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
    <section className="bg-card border border-border rounded-2xl p-5">
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
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [days, setDays]   = useState(30);
  const currentYear       = String(new Date().getFullYear());
  const [year, setYear]   = useState(currentYear);

  // Limits below mirror what the existing dashboard pulls. Real production
  // numbers should swap to server-side aggregation (Postgres views) once
  // a center crosses ~10k attendance rows.
  const { data: attendance = [], isLoading: attLoading } = useEntityList('Attendance', '-session_date', 5000);
  const { data: receipts   = [], isLoading: recLoading } = useEntityList('Receipt', '-date', 5000);
  const { data: payroll    = [], isLoading: payLoading } = useEntityList('Payroll', '-created_date', 2000);
  const { data: students   = [] } = useEntityList('Student', 'full_name', 500);
  const { data: teachers   = [] } = useEntityList('Teacher', 'full_name', 200);

  // ── attendance roll-up: build {date, Présent, Absent, Retard, Justifié} ──
  const attendanceSeries = useMemo(() => {
    const end = startOfDay(new Date());
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));

    const bucket = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      bucket[fmtDay(d)] = { date: fmtDay(d), 'Présent': 0, 'Absent': 0, 'Retard': 0, 'Justifié': 0 };
    }

    for (const a of attendance) {
      if (!a.session_date || !bucket[a.session_date]) continue;
      const status = a.status || 'Présent';
      if (status in bucket[a.session_date]) bucket[a.session_date][status]++;
    }

    return Object.values(bucket);
  }, [attendance, days]);

  const attendanceTotals = useMemo(() => {
    const t = { 'Présent': 0, 'Absent': 0, 'Retard': 0, 'Justifié': 0 };
    for (const row of attendanceSeries) {
      t['Présent']  += row['Présent'];
      t['Absent']   += row['Absent'];
      t['Retard']   += row['Retard'];
      t['Justifié'] += row['Justifié'];
    }
    const total = t['Présent'] + t['Absent'] + t['Retard'] + t['Justifié'];
    const rate = total > 0 ? Math.round(((t['Présent'] + t['Justifié']) / total) * 100) : 0;
    return { ...t, total, rate };
  }, [attendanceSeries]);

  // ── finance: monthly encaissé vs facturé for selected year ──
  const financeMonthly = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: fmtMonth(i, parseInt(year, 10)),
      monthIdx: i,
      encaisse: 0,
      facture:  0,
    }));

    for (const r of receipts) {
      if (!r.date) continue;
      const d = new Date(r.date);
      if (String(d.getFullYear()) !== year) continue;
      const m = months[d.getMonth()];
      m.facture  += Number(r.montant_total || 0);
      m.encaisse += Number(r.montant_paye  || 0);
    }
    return months;
  }, [receipts, year]);

  const financeTotals = useMemo(() => {
    const facture  = financeMonthly.reduce((s, m) => s + m.facture,  0);
    const encaisse = financeMonthly.reduce((s, m) => s + m.encaisse, 0);
    return {
      facture, encaisse,
      restant: facture - encaisse,
      rate: facture > 0 ? Math.round((encaisse / facture) * 100) : 0,
    };
  }, [financeMonthly]);

  // ── payroll: YTD per teacher for selected year ──
  const payrollByTeacher = useMemo(() => {
    const m = new Map();
    for (const p of payroll) {
      if (String(p.annee) !== year) continue;
      const key = p.teacher_id || p.teacher_name || 'unknown';
      const entry = m.get(key) || {
        name: p.teacher_name || '—',
        brut: 0, net: 0, count: 0,
      };
      entry.brut  += Number(p.salaire_brut || 0);
      entry.net   += Number(p.salaire_net  || 0);
      entry.count += 1;
      m.set(key, entry);
    }
    return Array.from(m.values())
      .sort((a, b) => b.net - a.net)
      .slice(0, 12);
  }, [payroll, year]);

  const payrollTotals = useMemo(() => {
    const brut = payrollByTeacher.reduce((s, t) => s + t.brut, 0);
    const net  = payrollByTeacher.reduce((s, t) => s + t.net,  0);
    return { brut, net };
  }, [payrollByTeacher]);

  // ── student status mix — useful sanity check on the active pipeline ──
  const studentMix = useMemo(() => {
    const counts = {};
    for (const s of students) {
      const k = s.status || 'Prospect';
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [students]);

  const studentMixColors = [COLORS.success, COLORS.teal, COLORS.warning, COLORS.purple, '#94a3b8'];

  // ── available years (current + previous 2, plus anything we have data for)
  const availableYears = useMemo(() => {
    const ys = new Set([currentYear,
      String(parseInt(currentYear, 10) - 1),
      String(parseInt(currentYear, 10) - 2),
    ]);
    for (const r of receipts) {
      if (r.date) ys.add(String(new Date(r.date).getFullYear()));
    }
    for (const p of payroll) {
      if (p.annee) ys.add(String(p.annee));
    }
    return Array.from(ys).filter(y => /^\d{4}$/.test(y)).sort().reverse();
  }, [receipts, payroll, currentYear]);

  const loading = attLoading || recLoading || payLoading;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rapports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Synthèse présences, finance et paie. Les données sont rafraîchies en temps réel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-muted-foreground" />
          <select
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
          hint={`${financeTotals.rate}% du facturé`}
          color={COLORS.primary}
        />
        <StatCard
          label={`Reste à recouvrer ${year}`}
          value={loading ? '—' : MAD(financeTotals.restant)}
          hint={MAD(financeTotals.facture) + ' facturé'}
          color={COLORS.danger}
        />
        <StatCard
          label={`Paie nette ${year}`}
          value={loading ? '—' : MAD(payrollTotals.net)}
          hint={`${payrollByTeacher.length} enseignant(s)`}
          color={COLORS.purple}
        />
      </div>

      <div className="space-y-6">
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
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs text-emerald-600 font-medium">Encaissé</p>
              <p className="text-lg font-bold text-emerald-700">{MAD(financeTotals.encaisse)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-red-500 font-medium">Restant</p>
              <p className="text-lg font-bold text-red-600">{MAD(financeTotals.restant)}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground font-medium">Taux</p>
              <p className="text-lg font-bold text-foreground">{financeTotals.rate}%</p>
            </div>
          </div>
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
                  data={payrollByTeacher}
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
          subtitle={`${students.length} au total · répartition par statut`}
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
