'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { Users, GraduationCap, BookOpen, TrendingUp, Clock, CheckCircle, ArrowRight, FileText, UserPlus, ClipboardCheck, LogOut } from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();
  const [userRole, setUserRole] = useState('');
  const [stats, setStats] = useState({ students: 0, teachers: 0, groups: 0, totalEncaisse: 0, enrollmentsPending: 0, testsPlanifies: 0 });
  const [recentReceipts, setRecentReceipts] = useState([]);
  const [monthlyData, setMonthlyData] = useState({ encaisse: 0, restant: 0, total: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  const isAdmin = userRole === 'admin' || userRole === 'director';

  useEffect(() => {
    auth.me().then(user => {
      if (!user) { setLoading(false); return; }
      if (user.role === 'parent') { router.replace('/parent-portal'); return; }
      if (user.role === 'student') { router.replace('/student-portal'); return; }
      if (user.role === 'teacher') { router.replace('/teacher-portal'); return; }
      setUserRole(user.role || '');
    }).catch(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!userRole) return;
    Promise.all([
      entities.Student.list('full_name', 200),
      entities.Teacher.list('full_name', 100),
      entities.Group.list('name', 100),
      entities.Receipt.list('-created_date', 200),
      entities.Enrollment.list('-created_date', 200),
      entities.PlacementTest.filter({ status: 'Planifié' }),
    ]).then(([students, teachers, groups, receipts, pendingEnroll, plannedTests]) => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthReceipts = receipts.filter(r => r.date && r.date.startsWith(currentMonth));
      const encaisse = monthReceipts.reduce((s, r) => s + (r.montant_paye || 0), 0);
      const total = monthReceipts.reduce((s, r) => s + (r.montant_total || 0), 0);
      setMonthlyData({ encaisse, restant: total - encaisse, total, count: monthReceipts.length });

      const ACTIVE_STATUSES = ['Enrolled', 'Trial', 'Alumni'];
      setStats({
        students: students.filter(s => ACTIVE_STATUSES.includes(s.status)).length,
        teachers: teachers.length,
        groups: groups.length,
        totalEncaisse: receipts.reduce((s, r) => s + (r.montant_paye || 0), 0),
        enrollmentsPending: pendingEnroll.filter(e => ['Submitted', 'Under Review', 'Rejected'].includes(e.status)).length,
        testsPlanifies: plannedTests.length,
      });
      setRecentReceipts(receipts.slice(0, 5));
      setLoading(false);
    });
  }, [userRole]);

  const PAYMENT_STATUS = {
    'Soldé': { bg: 'bg-emerald-50 text-emerald-700 ring-emerald-100', dot: 'bg-emerald-500' },
    'Acompte versé': { bg: 'bg-amber-50 text-amber-700 ring-amber-100', dot: 'bg-amber-500' },
    'En attente': { bg: 'bg-blue-50 text-blue-700 ring-blue-100', dot: 'bg-blue-400' },
    'En retard': { bg: 'bg-red-50 text-red-700 ring-red-100', dot: 'bg-red-500' },
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Bouskoura / Sidi Maarouf, Casablanca</p>
        </div>
        {isAdmin && (
          <Link
            href="/receipts/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm hover:shadow-md hover:opacity-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
          >
            <FileText size={15} />
            Nouveau reçu
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Apprenants', value: stats.students, icon: Users, href: '/students', color: '#1E4D8B', bg: '#EEF2FF' },
          { label: 'Enseignants', value: stats.teachers, icon: GraduationCap, href: '/teachers', color: '#7c3aed', bg: '#F5F3FF' },
          { label: 'Groupes actifs', value: stats.groups, icon: BookOpen, href: '/groups', color: '#0891b2', bg: '#ECFEFF' },
          ...(isAdmin ? [
            { label: 'Total encaissé', value: `${stats.totalEncaisse.toLocaleString('fr-MA')} MAD`, icon: TrendingUp, href: '/finance', color: '#059669', bg: '#ECFDF5' },
            { label: 'Inscriptions en attente', value: stats.enrollmentsPending, icon: Clock, href: '/enrollments', color: '#d97706', bg: '#FFFBEB' },
            { label: 'Tests planifiés', value: stats.testsPlanifies, icon: CheckCircle, href: '/placement-tests', color: '#B91C2E', bg: '#FFF1F2' },
          ] : [
            { label: 'Tests planifiés', value: stats.testsPlanifies, icon: CheckCircle, href: '/placement-tests', color: '#B91C2E', bg: '#FFF1F2' },
          ]),
        ].map(({ label, value, icon: Icon, href, color, bg }) => (
          <Link
            key={label}
            href={href}
            className="group bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                <Icon size={18} style={{ color }} />
              </div>
              <ArrowRight size={14} className="text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-all mt-1" />
            </div>
            <p className="text-2xl font-bold text-foreground mb-1">{loading ? '—' : value}</p>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
          </Link>
        ))}
      </div>

      {isAdmin && <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="font-semibold text-sm text-foreground">
              Paiements — {new Date().toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{loading ? '—' : monthlyData.count} reçu(s) ce mois</p>
          </div>
          <Link href="/finance" className="text-xs font-semibold hover:underline flex items-center gap-1 self-start sm:self-auto" style={{ color: '#1E4D8B' }}>
            Voir Finance <ArrowRight size={11} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-emerald-50 rounded-xl p-4">
            <p className="text-xs text-emerald-600 font-medium mb-1">Encaissé</p>
            <p className="text-xl font-bold text-emerald-700">{loading ? '—' : monthlyData.encaisse.toLocaleString('fr-MA')} MAD</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-xs text-red-500 font-medium mb-1">Solde restant</p>
            <p className="text-xl font-bold text-red-600">{loading ? '—' : monthlyData.restant.toLocaleString('fr-MA')} MAD</p>
          </div>
          <div className="bg-muted rounded-xl p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Total facturé</p>
            <p className="text-xl font-bold text-foreground">{loading ? '—' : monthlyData.total.toLocaleString('fr-MA')} MAD</p>
          </div>
        </div>
        {!loading && monthlyData.total > 0 && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Taux de recouvrement mensuel</span>
              <span className="font-bold" style={{ color: '#1E4D8B' }}>
                {Math.round((monthlyData.encaisse / monthlyData.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full transition-all"
                style={{
                  width: `${Math.round((monthlyData.encaisse / monthlyData.total) * 100)}%`,
                  background: 'linear-gradient(90deg, #059669, #10b981)',
                }}
              />
            </div>
          </div>
        )}
        {!loading && monthlyData.total === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Aucun reçu enregistré ce mois.</p>
        )}
      </div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground">Accès rapides</h2>
          </div>
          <div className="p-4 space-y-2">
            {[
              ...(isAdmin ? [
                { href: '/receipts/new', label: 'Nouveau reçu de paiement', icon: FileText, color: '#1E4D8B' },
                { href: '/students/new', label: 'Ajouter un apprenant', icon: UserPlus, color: '#7c3aed' },
              ] : []),
              { href: '/attendance', label: 'Marquer les présences', icon: ClipboardCheck, color: '#0891b2' },
              { href: '/students-directory', label: 'Annuaire des apprenants', icon: Users, color: '#059669' },
              ...(isAdmin ? [
                { href: '/enrollments', label: 'Valider des inscriptions', icon: CheckCircle, color: '#d97706' },
                { href: '/dismissal', label: 'Sortie des jeunes', icon: LogOut, color: '#B91C2E' },
              ] : []),
            ].map(({ href, label, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '15' }}>
                  <Icon size={13} style={{ color }} />
                </div>
                <span className="text-sm font-medium text-foreground group-hover:text-primary">{label}</span>
                <ArrowRight size={12} className="ml-auto text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-all" />
              </Link>
            ))}
          </div>
        </div>

        {isAdmin && <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground">Reçus récents</h2>
            <Link href="/receipts" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: '#1E4D8B' }}>
              Voir tout <ArrowRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="divide-y divide-border" aria-busy="true" aria-label="Chargement des reçus">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center justify-between animate-pulse">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 bg-muted rounded" />
                    <div className="h-2 w-24 bg-muted/70 rounded" />
                  </div>
                  <div className="h-5 w-16 bg-muted rounded-full" />
                </div>
              ))}
            </div>
          ) : recentReceipts.length === 0 ? (
            <div className="p-8 text-center">
              <FileText size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Aucun reçu pour l&apos;instant.</p>
              <Link href="/receipts/new" className="text-sm font-semibold mt-2 inline-block" style={{ color: '#1E4D8B' }}>Créer le premier →</Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentReceipts.map(r => {
                const restant = (r.montant_total || 0) - (r.montant_paye || 0);
                const statusKey = r.statut_paiement || (restant === 0 ? 'Soldé' : 'En attente');
                const sc = PAYMENT_STATUS[statusKey] || PAYMENT_STATUS['En attente'];
                return (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-white bg-primary">
                      {r.nom_prenom?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{r.nom_prenom}</p>
                      <p className="text-xs text-muted-foreground">{r.categorie} · {r.niveau} · {r.date}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-foreground">{(r.montant_paye || 0).toLocaleString('fr-MA')} MAD</p>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ring-1 ${sc.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {statusKey}
                      </span>
                    </div>
                    <Link href={`/receipts/${r.id}/print`} className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                      <FileText size={14} />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}
