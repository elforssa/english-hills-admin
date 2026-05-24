'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, CreditCard, FileText, UserCheck, BarChart3,
  LogOut, ChevronDown, ChevronRight, Shield, Menu, X,
  Bell, MessageSquare, Award, Brain, Briefcase, FolderOpen, UserPlus, ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const ADMIN = ['admin', 'director'];
const STAFF = ['admin', 'director', 'teacher'];

const NAV = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, roles: [...ADMIN, 'teacher'] },
  { href: '/reports',   label: 'Rapports',         icon: BarChart3,       roles: ADMIN },
  {
    label: 'Apprenants', icon: Users, roles: ADMIN,
    children: [
      { href: '/students-directory', label: 'Annuaire', roles: ADMIN },
      { href: '/students', label: 'Liste des apprenants', roles: ADMIN },
      { href: '/students/new', label: 'Ajouter un apprenant', roles: ADMIN },
      { href: '/dismissal', label: 'Sortie des jeunes', roles: ADMIN },
    ],
  },
  {
    label: 'Académique', icon: BookOpen, roles: [...ADMIN, 'teacher'],
    children: [
      { href: '/groups', label: 'Groupes & niveaux', roles: [...ADMIN, 'teacher'] },
      { href: '/attendance', label: 'Présences', roles: [...ADMIN, 'teacher'] },
      { href: '/timetable', label: 'Emploi du temps', roles: [...ADMIN, 'teacher'] },
      { href: '/placement-tests', label: 'Tests de niveau', roles: ADMIN },
      { href: '/assessments', label: 'Notes & bulletins', roles: [...ADMIN, 'teacher'] },
    ],
  },
  {
    label: 'Finance', icon: CreditCard, roles: ADMIN,
    children: [
      { href: '/finance', label: 'Tableau de bord finance', roles: ADMIN },
      { href: '/receipts/new', label: 'Nouveau reçu', roles: ADMIN },
      { href: '/receipts', label: 'Tous les reçus', roles: ADMIN },
    ],
  },
  {
    label: 'Inscriptions', icon: ClipboardList, roles: ADMIN,
    children: [
      { href: '/enrollments', label: 'Pré-inscriptions', roles: ADMIN },
    ],
  },
  {
    label: 'Enseignants & RH', icon: GraduationCap, roles: ADMIN,
    children: [
      { href: '/teachers', label: 'Liste des enseignants', roles: ADMIN },
      { href: '/teachers/new', label: 'Ajouter un enseignant', roles: ADMIN },
      { href: '/leave-requests', label: 'Congés & absences', roles: ADMIN },
      { href: '/payroll', label: 'Paie & RH', roles: ADMIN },
    ],
  },
  {
    label: 'Portfolios & Certifs', icon: FolderOpen, roles: [...ADMIN, 'teacher'],
    children: [
      { href: '/portfolios', label: 'Portfolios numériques', roles: [...ADMIN, 'teacher'] },
      { href: '/certificates', label: 'Certificats', roles: ADMIN },
      { href: '/learning-assessments', label: "Profils d'apprentissage", roles: [...ADMIN, 'teacher'] },
    ],
  },
  {
    label: 'Communication', icon: MessageSquare, roles: ADMIN,
    children: [
      { href: '/notifications', label: 'Notifications', roles: ADMIN },
      { href: '/communications', label: 'Messages & Annonces', roles: ADMIN },
    ],
  },
  {
    label: 'Portails', icon: Shield, roles: ADMIN,
    children: [
      { href: '/parent-portal', label: 'Espace Parents', roles: ADMIN },
      { href: '/teacher-portal', label: 'Espace Enseignants', roles: ADMIN },
      { href: '/student-portal', label: 'Espace Apprenants', roles: ADMIN },
    ],
  },
  { href: '/teacher-portal', label: 'Mon espace enseignant', icon: GraduationCap, roles: ['teacher'] },
  { href: '/parent-portal', label: 'Espace Parents', icon: Users, roles: ['parent'] },
  { href: '/student-portal', label: 'Mon espace apprenant', icon: BookOpen, roles: ['student'] },
  { href: '/settings', label: 'Paramètres', icon: Shield, roles: ADMIN },
  { href: '/inscription', label: 'Formulaire public', icon: UserPlus, roles: ADMIN },
];

function NavItem({ item, onNavigate }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(() =>
    item.children?.some((c) => pathname?.startsWith(c.href))
  );

  if (item.children) {
    const Icon = item.icon;
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150"
        >
          <span className="flex items-center gap-3">
            <Icon size={15} className="opacity-70" />
            {item.label}
          </span>
          {open ? <ChevronDown size={12} className="opacity-50" /> : <ChevronRight size={12} className="opacity-50" />}
        </button>
        {open && (
          <div className="ml-6 mt-1 space-y-0.5 border-l border-white/10 pl-3">
            {item.children.map((child) => {
              const isActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
                  className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white'
                  }`}
                >
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white mr-2 flex-shrink-0" />}
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const Icon = item.icon;
  const isActive = pathname === item.href;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
        isActive
          ? 'bg-white/15 text-white font-semibold'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'
      }`}
    >
      <Icon size={15} className={isActive ? 'opacity-100' : 'opacity-60'} />
      {item.label}
    </Link>
  );
}

function SidebarContent({ onNavigate, userRole, userEmail, onLogout }) {
  const canSee = (item) => !item.roles || item.roles.includes(userRole);

  const filteredNav = NAV
    .filter(canSee)
    .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item))
    .filter((item) => !item.children || item.children.length > 0);

  return (
    <>
      <div className="flex flex-col items-center px-5 py-5 border-b border-white/10">
        <img
          src="/eh-logo.png"
          alt="English Hills"
          className="h-11 w-auto"
        />
        <p className="text-white/30 text-[10px] font-medium tracking-widest uppercase mt-2">
          {userRole === 'director' ? 'Directeur' :
           userRole === 'admin' ? 'Administrateur' :
           userRole === 'teacher' ? 'Enseignant' :
           userRole === 'parent' ? 'Parent' :
           userRole === 'student' ? 'Apprenant' : 'Plateforme'}
        </p>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {filteredNav.map((item, i) => <NavItem key={i} item={item} onNavigate={onNavigate} />)}
      </nav>

      <div className="px-3 py-4 border-t border-white/8 space-y-0.5">
        <a
          href="https://english-hills.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/40 hover:text-white/70 hover:bg-sidebar-accent/50 w-full transition-all duration-150"
        >
          <ExternalLink size={13} />
          Retour au site
        </a>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/50 hover:text-white hover:bg-sidebar-accent w-full transition-all duration-150"
        >
          <LogOut size={14} />
          Déconnexion
        </button>
      </div>
    </>
  );
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, role, logout } = useAuth();

  const userRole  = role || '';
  const userEmail = user?.email || '';

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-lg text-white shadow-lg"
        style={{ backgroundColor: 'var(--brand-sidebar)' }}
      >
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative flex flex-col w-56 min-h-screen z-50" style={{ backgroundColor: 'var(--brand-sidebar)' }}>
            <button onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" className="absolute top-4 right-4 text-white/60 hover:text-white">
              <X size={18} />
            </button>
            <SidebarContent
              onNavigate={() => setMobileOpen(false)}
              userRole={userRole}
              userEmail={userEmail}
              onLogout={logout}
            />
          </div>
        </div>
      )}

      <div
        className="hidden lg:flex flex-col w-60 min-h-screen flex-shrink-0"
        style={{ backgroundColor: 'var(--brand-sidebar)' }}
      >
        <SidebarContent
          onNavigate={() => {}}
          userRole={userRole}
          userEmail={userEmail}
          onLogout={logout}
        />
      </div>
    </>
  );
}
