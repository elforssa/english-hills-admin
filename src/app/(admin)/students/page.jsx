'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Download, Upload, UserSearch } from 'lucide-react';
import Pagination from '@/components/ui/pagination';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { exportToCsv } from '@/utils/exportCsv';
import { useEntityList } from '@/lib/queries';
import { STUDENT_STATUS_COLORS } from '@/lib/statusColors';

const PAGE_SIZE = 20;

export default function Students() {
  // Cached + deduped across pages. Sibling pages (e.g. /students/[id]) that
  // also call useEntityList('Student', ...) reuse this fetch.
  const { data: students = [], isLoading: loading } = useEntityList(
    'Student', '-created_date', 200,
  );

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [page, setPage] = useState(1);

  const ACTIVE_STATUSES = ['Enrolled', 'Trial', 'Alumni'];
  const activeStudents = filterStatus ? students : students.filter(s => ACTIVE_STATUSES.includes(s.status));

  const filtered = activeStudents.filter(s => {
    const matchSearch = !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || filterStatus === 'all_shown' || s.status === filterStatus;
    const matchCat = !filterCat || s.age_category === filterCat;
    const matchLevel = !filterLevel || s.niveau_cefr === filterLevel;
    return matchSearch && matchStatus && matchCat && matchLevel;
  });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Apprenants</h1>
          <p className="text-muted-foreground text-sm mt-1">{activeStudents.length} apprenants {filterStatus ? '' : 'actifs'} · {students.length} au total</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button
            onClick={() => exportToCsv(filtered.map(s => ({
              Nom: s.full_name,
              Email: s.email || '',
              Téléphone: s.telephone || '',
              Catégorie: s.age_category || '',
              Niveau: s.niveau_cefr || '',
              Statut: s.status || '',
              'Date naissance': s.date_naissance || '',
            })), `apprenants-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted"
          >
            <Download size={15} /> CSV
          </button>
          <Link
            href="/students/import"
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted"
          >
            <Upload size={15} /> Import CSV
          </Link>
          <Link href="/students/new" className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90">
            <Plus size={15} /> Ajouter
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-0 w-full sm:w-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Rechercher..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">Actifs (Enrolled/Trial/Alumni)</option>
          <option value="all_shown">Tous les statuts</option>
          {['Enrolled','Trial','Alumni','Prospect','Inactive'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}>
          <option value="">Toutes catégories</option>
          {['Young Learners (6-12)','Teens (13-17)','Adults (18+)','Corporate'].map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(1); }}>
          <option value="">Tous les niveaux</option>
          {['A1','A2','B1','B2','C1','C2'].map(l => <option key={l}>{l}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <SkeletonTable rows={10} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <UserSearch size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">Aucun apprenant trouvé</p>
            <p className="text-xs text-muted-foreground mt-1">
              Essayez d&apos;élargir vos filtres, ou ajoutez un nouvel apprenant.
            </p>
            <Link href="/students/new" className="inline-flex items-center gap-1 text-sm font-semibold mt-3 hover:underline" style={{ color: '#1E4D8B' }}>
              <Plus size={14} /> Ajouter un apprenant
            </Link>
          </div>
        ) : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {paged.map(s => (
                <Link key={s.id} href={`/students/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.age_category || '—'} {s.niveau_cefr ? `· ${s.niveau_cefr}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{s.telephone || '—'}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ml-3 flex-shrink-0 ${STUDENT_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-500'}`}>{s.status || '—'}</span>
                </Link>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nom</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Catégorie</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Niveau</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Téléphone</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map(s => (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{s.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.age_category || '—'}</td>
                      <td className="px-4 py-3">
                        {s.niveau_cefr ? <span className="inline-block text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{s.niveau_cefr}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.telephone || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STUDENT_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-500'}`}>{s.status || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/students/${s.id}`} className="text-xs font-medium text-primary hover:underline">Voir</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}
