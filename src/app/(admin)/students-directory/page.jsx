'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { Search, Phone, Mail, Users, ArrowRight, BookOpen } from 'lucide-react';
import { ALL_LEVELS, SESSION_TYPES, getLevelsForSession } from '@/lib/academicPrograms';

const STATUS_CONFIG = {
  Enrolled: { bg: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  Trial: { bg: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100', dot: 'bg-blue-500' },
  Prospect: { bg: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-400' },
  Inactive: { bg: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200', dot: 'bg-gray-400' },
  Alumni: { bg: 'bg-purple-50 text-purple-700 ring-1 ring-purple-100', dot: 'bg-purple-500' },
};

const LEVEL_COLORS = {
  A1: '#6366f1', A2: '#8b5cf6', B1: '#0891b2', B2: '#059669', C1: '#d97706', C2: '#B91C2E',
};

const CATS = ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)', 'Corporate'];

export default function StudentsDirectory() {
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [view, setView] = useState('grid');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      entities.Student.listAll('full_name'),
      entities.Group.listAll('name'),
    ]).then(([s, g]) => {
      if (active) { setStudents(s); setGroups(g); }
    }).catch(() => {
      if (active) setLoadError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reload]);

  const groupName = (gid) => groups.find(g => g.id === gid)?.name;

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !search || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.telephone?.includes(search);
    const matchStatus = !filterStatus || s.status === filterStatus;
    const matchCat = !filterCat || s.age_category === filterCat;
    const matchSession = !filterSession || (s.session_type || 'Yearly') === filterSession;
    const matchLevel = !filterLevel || s.niveau_cefr === filterLevel;
    return matchSearch && matchStatus && matchCat && matchSession && matchLevel;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Annuaire des apprenants</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{students.length} apprenants inscrits</p>
        </div>
        <Link
          href="/students/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          + Ajouter un apprenant
        </Link>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <select aria-label="Filtrer l'annuaire par session" className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white" value={filterSession} onChange={e => { setFilterSession(e.target.value); setFilterLevel(''); }}>
          <option value="">Toutes les sessions</option>
          {SESSION_TYPES.map(session => <option key={session}>{session}</option>)}
        </select>
        <select aria-label="Filtrer l'annuaire par niveau" className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white" value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {(filterSession ? getLevelsForSession(filterSession) : ALL_LEVELS).map(level => <option key={level}>{level}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Rechercher dans l'annuaire"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Nom, email, téléphone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select aria-label="Filtrer l'annuaire par statut" className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {['Enrolled','Trial','Prospect','Inactive','Alumni'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Filtrer l'annuaire par catégorie" className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <div className="flex border border-border rounded-xl overflow-hidden bg-white">
          {['grid','list'].map(v => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
              className={`px-3 py-2 text-xs font-medium transition-colors ${view === v ? 'text-white bg-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {v === 'grid' ? '⊞ Grille' : '≡ Liste'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Chargement...</div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          Impossible de charger l’annuaire. <button type="button" onClick={() => setReload(value => value + 1)} className="ml-2 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Réessayer</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users size={40} className="mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground">Aucun apprenant trouvé.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(s => {
            const sc = STATUS_CONFIG[s.status] || STATUS_CONFIG.Prospect;
            const lvlColor = LEVEL_COLORS[s.niveau_cefr] || 'var(--brand)';
            const grp = groupName(s.groupe_id);
            return (
              <Link key={s.id} href={`/students/${s.id}`} className="group bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 block">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-base flex-shrink-0" style={{ backgroundColor: lvlColor }}>
                    {s.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  {s.niveau_cefr && (
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: lvlColor }}>
                      {s.niveau_cefr}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-foreground text-sm mb-1 truncate">{s.full_name}</p>
                <p className="text-xs text-muted-foreground mb-3">{s.age_category || 'Catégorie non définie'}</p>
                {grp && (
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <BookOpen size={10} className="flex-shrink-0" style={{ color: 'var(--brand)' }} />
                    {grp}
                  </p>
                )}
                <div className="space-y-1 mb-3">
                  {s.telephone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                      <Phone size={10} className="flex-shrink-0" />
                      {s.telephone}
                    </p>
                  )}
                  {s.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                      <Mail size={10} className="flex-shrink-0" />
                      {s.email}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {s.status || 'Prospect'}
                  </span>
                  <ArrowRight size={12} className="text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {['Apprenant','Niveau','Groupe','Téléphone','Email','Statut',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(s => {
                const sc = STATUS_CONFIG[s.status] || STATUS_CONFIG.Prospect;
                const lvlColor = LEVEL_COLORS[s.niveau_cefr] || 'var(--brand)';
                const grp = groupName(s.groupe_id);
                return (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: lvlColor }}>
                          {s.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium">{s.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.niveau_cefr ? <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: lvlColor }}>{s.niveau_cefr}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{grp || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{s.telephone || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{s.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {s.status || 'Prospect'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/students/${s.id}`} className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand)' }}>Voir →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
