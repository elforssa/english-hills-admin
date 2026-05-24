'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { Search, Phone, Mail, Users, ArrowRight, BookOpen } from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [view, setView] = useState('grid');

  useEffect(() => {
    Promise.all([
      entities.Student.list('full_name', 500),
      entities.Group.list('name', 100),
    ]).then(([s, g]) => { setStudents(s); setGroups(g); setLoading(false); });
  }, []);

  const groupName = (gid) => groups.find(g => g.id === gid)?.name;

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !search || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.telephone?.includes(search);
    const matchStatus = !filterStatus || s.status === filterStatus;
    const matchCat = !filterCat || s.age_category === filterCat;
    const matchLevel = !filterLevel || s.niveau_cefr === filterLevel;
    return matchSearch && matchStatus && matchCat && matchLevel;
  });

  const byLevel = ['A1','A2','B1','B2','C1','C2'].reduce((acc, lvl) => {
    acc[lvl] = students.filter(s => s.niveau_cefr === lvl).length;
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Annuaire des apprenants</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{students.length} apprenants inscrits</p>
        </div>
        <Link
          href="/students/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-all shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
        >
          + Ajouter un apprenant
        </Link>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['A1','A2','B1','B2','C1','C2'].map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilterLevel(filterLevel === lvl ? '' : lvl)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterLevel === lvl ? 'text-white border-transparent shadow-sm' : 'bg-white border-border text-muted-foreground hover:border-gray-300'}`}
            style={filterLevel === lvl ? { backgroundColor: LEVEL_COLORS[lvl] } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filterLevel === lvl ? 'white' : LEVEL_COLORS[lvl] }} />
            {lvl}
            <span className={`ml-1 ${filterLevel === lvl ? 'text-white/80' : 'text-muted-foreground/60'}`}>{byLevel[lvl]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Nom, email, téléphone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {['Enrolled','Trial','Prospect','Inactive','Alumni'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <div className="flex border border-border rounded-xl overflow-hidden bg-white">
          {['grid','list'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${view === v ? 'text-white bg-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {v === 'grid' ? '⊞ Grille' : '≡ Liste'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Chargement...</div>
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
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
