'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Download, Upload, UserSearch, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { exportToCsv } from '@/utils/exportCsv';
import { useEntityUpdate } from '@/lib/queries';
import { getBrowserClient } from '@/lib/supabase';
import { toast } from 'sonner';
import { STUDENT_STATUS_COLORS, SESSION_TYPE_COLORS } from '@/lib/statusColors';
import { ALL_LEVELS, SESSION_TYPES, getLevelsForSession } from '@/lib/academicPrograms';

const PAGE_SIZE = 20;

const AGE_CATEGORIES = ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)', 'Corporate'];
const SOURCES = [
  'Réseaux sociaux (Facebook / Instagram)',
  'Recherche Google',
  'Famille / Ami(e)',
  'Passage devant le centre (walk-in)',
  'Ancien élève / Réinscription',
];

// Compact borderless dropdown for editing a single field directly in a table
// row. `empty` (when provided) renders a "clear" option that maps to null.
function InlineSelect({ value, options, onChange, empty, label, className = '' }) {
  return (
    <select
      value={value ?? ''}
      aria-label={label}
      onChange={e => onChange(e.target.value)}
      className={`text-sm rounded-md border border-transparent hover:border-border focus:border-primary px-1.5 py-1 -ml-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${className}`}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function Students() {
  const update = useEntityUpdate('Student');

  // Keep the current server value visible until persistence succeeds.
  const patchStudentFields = async (id, data) => {
    try {
      await update.mutateAsync({ id, data });
    } catch { /* entities.update already reports the failure */ }
  };
  const patchStudent = (id, field, value) => patchStudentFields(id, { [field]: value === '' ? null : value });

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [page, setPage] = useState(1);

  const filters = {
    p_search: search, p_status: filterStatus, p_age_category: filterCat,
    p_session: filterSession, p_level: filterLevel, p_incomplete: filterIncomplete,
    p_source: filterSource, p_plan: filterPlan,
  };
  const { data: result, isLoading: loading, isError, refetch } = useQuery({
    queryKey: ['Student', 'page', filters, page],
    queryFn: async () => {
      const { data, error } = await getBrowserClient().rpc('search_students_page', {
        ...filters, p_page: page, p_page_size: PAGE_SIZE,
      });
      if (error) throw error;
      return data;
    },
  });
  const paged = result?.rows || [];
  const matchedCount = Number(result?.count || 0);

  const exportStudents = async () => {
    try {
      const { data, error } = await getBrowserClient().rpc('search_students_page', {
        ...filters, p_page: 1, p_page_size: 0,
      });
      if (error) throw error;
      const rows = data?.rows || [];
      if (rows.length !== Number(data?.count)) throw new Error('Incomplete student export');
      exportToCsv(rows.map(s => ({
        Nom: s.full_name,
        Email: s.email || '',
        Téléphone: s.telephone || '',
        Catégorie: s.age_category || '',
        Session: s.session_type || '',
        Niveau: s.niveau_cefr || '',
        Statut: s.status || '',
        Formule: s.plan_type || 'Standard',
        Source: s.referral_source || '',
        'Date naissance': s.date_naissance || '',
      })), `apprenants-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { toast.error('Export impossible. Aucun fichier CSV créé.'); }
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Apprenants</h1>
          <p className="text-muted-foreground text-sm mt-1">{loading || isError ? '—' : matchedCount} apprenants correspondants · {loading || isError ? '—' : result.total} au total</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button
            onClick={exportStudents}
            disabled={loading || isError}
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <Download size={15} /> CSV
          </button>
          <Link
            href="/students/import"
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted"
          >
            <Upload size={15} /> Import CSV
          </Link>
          <Button asChild>
            <Link href="/students/new">
              <Plus size={15} /> Ajouter
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-0 w-full sm:w-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Rechercher..." aria-label="Rechercher un apprenant" maxLength={120} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select aria-label="Filtrer par statut" className="border border-border rounded-md px-3 py-2 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex-1 sm:flex-none" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">Actifs (Enrolled/Trial/Alumni)</option>
          <option value="all_shown">Tous les statuts</option>
          {['Enrolled','Trial','Alumni','Prospect','Inactive'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Filtrer par catégorie" className="border border-border rounded-md px-3 py-2 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex-1 sm:flex-none" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}>
          <option value="">Toutes catégories</option>
          {AGE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select aria-label="Filtrer par session" className="border border-border rounded-md px-3 py-2 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex-1 sm:flex-none" value={filterSession} onChange={e => { setFilterSession(e.target.value); setPage(1); }}>
          <option value="">Toutes sessions</option>
          {SESSION_TYPES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Filtrer par niveau" className="border border-border rounded-md px-3 py-2 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex-1 sm:flex-none" value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(1); }}>
          <option value="">Tous les niveaux</option>
          {(filterSession ? getLevelsForSession(filterSession) : ALL_LEVELS).map(l => <option key={l}>{l}</option>)}
        </select>
        <select aria-label="Filtrer par complétude" className="border border-border rounded-md px-3 py-2 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex-1 sm:flex-none" value={filterIncomplete ? 'incomplete' : ''} onChange={e => { setFilterIncomplete(e.target.value === 'incomplete'); setPage(1); }}>
          <option value="">Complétude : tous</option>
          <option value="incomplete">À compléter (sans email)</option>
        </select>
        <select aria-label="Filtrer par source" className="border border-border rounded-md px-3 py-2 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex-1 sm:flex-none" value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}>
          <option value="">Source : toutes</option>
          {SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Filtrer par formule" className="border border-border rounded-md px-3 py-2 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex-1 sm:flex-none" value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }}>
          <option value="">Toutes les formules</option>
          <option value="Premium">Premium</option>
          <option value="Standard">Standard</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <SkeletonTable rows={10} cols={6} />
        ) : isError ? (
          <div className="p-10 text-center" role="alert"><p className="text-sm font-medium">Impossible de charger les apprenants.</p><button className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-white" onClick={() => refetch()}>Réessayer</button></div>
        ) : matchedCount === 0 ? (
          <div className="p-10 text-center">
            <UserSearch size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">Aucun apprenant trouvé</p>
            <p className="text-xs text-muted-foreground mt-1">
              Essayez d&apos;élargir vos filtres, ou ajoutez un nouvel apprenant.
            </p>
            <Link href="/students/new" className="inline-flex items-center gap-1 text-sm font-semibold mt-3 hover:underline" style={{ color: 'var(--brand)' }}>
              <Plus size={14} /> Ajouter un apprenant
            </Link>
          </div>
        ) : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {paged.map(s => (
                <Link key={s.id} href={`/students/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">{s.full_name}{s.plan_type === 'Premium' && <Crown size={13} className="shrink-0 text-primary" />}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.age_category || '—'} · {s.session_type || 'Yearly'} {s.niveau_cefr ? `· ${s.niveau_cefr}` : ''}</p>
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
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Session</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Niveau</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Téléphone</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map(s => (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <span className="inline-flex items-center gap-1.5">{s.full_name}{s.plan_type === 'Premium' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold"><Crown size={10} /> Premium</span>}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <InlineSelect
                          value={s.age_category}
                          label={`Catégorie de ${s.full_name}`}
                          options={AGE_CATEGORIES}
                          empty="— Non défini —"
                          onChange={v => patchStudent(s.id, 'age_category', v)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <InlineSelect
                          value={s.session_type || 'Yearly'}
                          label={`Session de ${s.full_name}`}
                          options={SESSION_TYPES}
                          className={`font-medium ${SESSION_TYPE_COLORS[s.session_type] || ''}`}
                          onChange={v => patchStudentFields(s.id, { session_type: v, niveau_cefr: null, groupe_id: null })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <InlineSelect
                          value={s.niveau_cefr}
                          label={`Niveau de ${s.full_name}`}
                          options={getLevelsForSession(s.session_type || 'Yearly', s.niveau_cefr)}
                          empty="—"
                          className="font-semibold"
                          onChange={v => patchStudentFields(s.id, { niveau_cefr: v || null, groupe_id: null })}
                        />
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
        <Pagination page={page} total={matchedCount} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}
