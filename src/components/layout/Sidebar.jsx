'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, CreditCard, FileText, UserCheck, BarChart3,
  LogOut, ChevronDown, ChevronRight, Shield, Menu, X,
  Bell, MessageSquare, Award, Brain, Briefcase, FolderOpen, UserPlus, ExternalLink, History, RadioTower,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { receptionistCanAccess } from '@/lib/roleAccess.mjs';

const ADMIN = ['admin', 'director'];
const OPERATIONS = [...ADMIN, 'receptionist'];
const STAFF = ['admin', 'director', 'teacher'];

const NAV = [
  { label: 'CRM', icon: Users, roles: OPERATIONS, children: [
    { href: '/crm/leads', label: 'Opportunités', roles: OPERATIONS },
    { href: '/crm/today', label: 'Tâches', roles: OPERATIONS },
  ] },
  { label: 'Admissions', icon: ClipboardList, roles: OPERATIONS, children: [
    { href: '/placement-tests', label: 'Tests de niveau', roles: OPERATIONS },
    { href: '/placement-tests?view=calendar', label: 'Calendrier', roles: OPERATIONS },
    { href: '/enrollments', label: 'Inscriptions', roles: OPERATIONS },
  ] },
  { href: '/crm/analytics', label: 'Analyse marketing', icon: BarChart3, roles: ['director'] },
  { href: '/crm/integrations/lifecycle', label: 'Retour Meta', icon: RadioTower, roles: ['director'] },
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, roles: [...ADMIN, 'teacher'] },
  { href: '/reports',   label: 'Rapports',         icon: BarChart3,       roles: ADMIN },
  {
    label: 'Apprenants', icon: Users, roles: OPERATIONS,
    children: [
      { href: '/students-directory', label: 'Annuaire', roles: OPERATIONS },
      { href: '/students', label: 'Liste des apprenants', roles: OPERATIONS },
      { href: '/students/new', label: 'Ajouter un apprenant', roles: OPERATIONS },
      { href: '/dismissal', label: 'Sortie des jeunes', roles: ADMIN },
    ],
  },
  {
    label: 'Académique', icon: BookOpen, roles: [...OPERATIONS, 'teacher'],
    children: [
      { href: '/groups', label: 'Groupes & niveaux', roles: [...OPERATIONS, 'teacher'] },
      { href: '/attendance', label: 'Présences', roles: [...OPERATIONS, 'teacher'] },
      { href: '/timetable', label: 'Emploi du temps', roles: [...OPERATIONS, 'teacher'] },
      { href: '/premium-sessions', label: 'Heures Premium', roles: [...OPERATIONS, 'teacher'] },
      { href: '/assessments', label: 'Notes & bulletins', roles: [...OPERATIONS, 'teacher'] },
    ],
  },
  {
    label: 'Finance', icon: CreditCard, roles: OPERATIONS,
    children: [
      { href: '/finance', label: 'Tableau de bord finance', roles: ADMIN },
      { href: '/receipts/new', label: 'Nouveau reçu', roles: OPERATIONS },
      { href: '/receipts', label: 'Tous les reçus', roles: OPERATIONS },
    ],
  },
  {
    label: 'Enseignants & RH', icon: GraduationCap, roles: OPERATIONS,
    children: [
      { href: '/teachers', label: 'Liste des enseignants', roles: OPERATIONS },
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
      { href: '/activity-log', label: "Journal d'activité", roles: ADMIN },
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
  { href: '/settings', label: 'Mon compte', icon: Shield, roles: ['receptionist'] },
  { href: '/settings', label: 'Paramètres', icon: Shield, roles: ADMIN },
  { href: '/inscription', label: 'Formulaire public', icon: UserPlus, roles: ADMIN },
];

function NavItem({ item, onNavigate }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = href => {
    const [path,query] = href.split('?');
    if (pathname !== path) return false;
    if (path === '/placement-tests') return (params.get('view') === 'calendar') === (new URLSearchParams(query).get('view') === 'calendar');
    return true;
  };
  const [open, setOpen] = useState(() =>
    item.children?.some((c) => pathname?.startsWith(c.href.split('?')[0]))
  );

  useEffect(() => { if (item.children?.some(c => pathname === c.href.split('?')[0])) setOpen(true); }, [pathname, item.children]);

  if (item.children) {
    const Icon = item.icon;
    return (
      <div>
        <button
          aria-expanded={open}
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
              const isActive = active(child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={isActive ? "page" : undefined}
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
  const isActive = active(item.href);
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
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
  const canSee = (item) => (!item.roles || item.roles.includes(userRole)) &&
    (userRole !== 'receptionist' || !item.href || receptionistCanAccess(item.href.split('?')[0]));
  const filteredNav = NAV
    .filter(canSee)
    .map((item) => (item.children ? { ...item,
      label: userRole === 'receptionist' && item.label === 'Enseignants & RH' ? 'Enseignants' : item.label,
      children: item.children.filter(canSee) } : item))
    .filter((item) => !item.children || item.children.length > 0);

  return (
    <>
      <div className="flex flex-col items-center px-5 py-5 border-b border-white/10">
        <img
          src="/eh-logo.png"
          alt="English Hills"
          className="h-11 w-auto"
        />
        <p className="text-white/70 text-[10px] font-medium tracking-widest uppercase mt-2">
          {userRole === 'director' ? 'Directeur' :
           userRole === 'admin' ? 'Administrateur' :
           userRole === 'receptionist' ? 'Accueil' :
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
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50 w-full transition-all duration-150"
        >
          <ExternalLink size={13} />
          Retour au site
        </a>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent w-full transition-all duration-150"
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
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const { user, role, logout } = useAuth();

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    requestAnimationFrame(() => {
      if (!window.matchMedia('(min-width: 1024px)').matches) triggerRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const resetAtDesktop = () => {
      if (desktop.matches) flushSync(() => setMobileOpen(false));
    };
    desktop.addEventListener('change', resetAtDesktop);
    return () => desktop.removeEventListener('change', resetAtDesktop);
  }, []);

  useLayoutEffect(() => {
    if (!mobileOpen) return undefined;
    const main = document.getElementById('main-content');
    if (main) main.inert = true;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobile();
      } else if (event.key === 'Tab') {
        const focusable = [...dialogRef.current.querySelectorAll('a[href], button:not([disabled])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); if (main) main.inert = false; };
  }, [mobileOpen, closeMobile]);

  const userRole  = role || '';
  const userEmail = user?.email || '';

  return (
    <>
      <div className="lg:hidden fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b bg-background px-4"><button
        ref={triggerRef}
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={mobileOpen}
        aria-controls="mobile-sidebar"
        aria-hidden={mobileOpen}
        tabIndex={mobileOpen ? -1 : 0}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        style={{ backgroundColor: 'var(--brand-sidebar)' }}
      >
        <Menu size={20} />
      </button></div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" aria-hidden="true" onClick={closeMobile} />
          <div id="mobile-sidebar" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Menu de navigation" className="operational operational-sidebar relative flex flex-col w-60 min-h-screen z-50" style={{ backgroundColor: 'var(--brand-sidebar)' }}>
            <button ref={closeRef} onClick={closeMobile} aria-label="Fermer le menu" className="absolute top-2 right-2 inline-flex h-11 w-11 items-center justify-center text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <X size={18} />
            </button>
            <SidebarContent
              onNavigate={closeMobile}
              userRole={userRole}
              userEmail={userEmail}
              onLogout={logout}
            />
          </div>
        </div>
      )}

      <div
        className="operational operational-sidebar hidden lg:flex flex-col w-60 min-h-screen flex-shrink-0"
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
