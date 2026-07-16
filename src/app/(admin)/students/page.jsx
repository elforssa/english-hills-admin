'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Download, Upload, UserSearch, Camera, CameraOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { exportToCsv } from '@/utils/exportCsv';
import { useEntityList, useEntityUpdate, entityKeys } from '@/lib/queries';
import { STUDENT_STATUS_COLORS, SESSION_TYPE_COLORS } from '@/lib/statusColors';

const PAGE_SIZE = 20;
const LIST_ORDER = '-created_date';
const LIST_LIMIT = 200;

const AGE_CATEGORIES = ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)', 'Corporate'];
const NIVEAUX = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SESSION_TYPES = ['Yearly', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One'];
const PHOTO_CONSENTS = ['Accepte', 'Refuse', 'Non demandé'];
const SOURCES = [
  'Réseaux sociaux (Facebook / Instagram)',
  'Publicité payante (Ads)',
  'Recherche Google',
  'Famille / Ami(e)',
  'Passage devant le centre (walk-in)',
  'Ancien élève / Réinscription',
];

// Small camera badge showing a student's image-consent at a glance.
function ConsentIcon({ v }) {
  if (v === 'Accepte') return <Camera size={13} className="text-green-600" title="Photos autorisées" />;
  if (v === 'Refuse') return <CameraOff size={13} className="text-red-600" title="Photos refusées" />;
  return <Camera size={13} className="text-muted-foreground/40" title="Autorisation non demandée" />;
}

// Compact borderless dropdown for editing a single field directly in a table
// row. `empty` (when provided) renders a "clear" option that maps to null.
function InlineSelect({ value, options, onChange, empty, className = '' }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`text-sm rounded-md border border-transparent hover:border-border focus:border-primary px-1.5 py-1 -ml-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${className}`}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function Students() {
  // Cached + deduped across pages. Sibling pages (e.g. /students/[id]) that
  // also call useEntityList('Student', ...) reuse this fetch.
  const { data: students = [], isLoading: loading } = useEntityList(
    'Student', LIST_ORDER, LIST_LIMIT,
  );

  const qc = useQueryClient();
  const update = useEntityUpdate('Student');

  // Inline single-field edit. Optimistically patches the cached list so the
  // dropdown reflects the choice instantly (the mutation's onSuccess refetch
  // then reconciles). Nullable fields store '' as null. entities.update toasts
  // on failure; the refetch reverts the optimistic value if the write fails.
  const patchStudent = (id, field, value) => {
    const stored = value === '' ? null : value;
    qc.setQueryData(entityKeys.list('Student', LIST_ORDER, LIST_LIMIT), (old) =>
      Array.isArray(old) ? old.map(r => (r.id === id ? { ...r, [field]: stored } : r)) : old,
    );
    update.mutate({ id, data: { [field]: stored } });
  };

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterConsent, setFilterConsent] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [page, setPage] = useState(1);

  const ACTIVE_STATUSES = ['Enrolled', 'Trial', 'Alumni'];
  const activeStudents = filterStatus ? students : students.filter(s => ACTIVE_STATUSES.includes(s.status));

  const filtered = activeStudents.filter(s => {
    const matchSearch = !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || filterStatus === 'all_shown' || s.status === filterStatus;
    const matchCat = !filterCat || s.age_category === filterCat;
    const matchLevel = !filterLevel || s.niveau_cefr === filterLevel;
    const matchSession = !filterSession || s.session_type === filterSession;
    // "À compléter" = no way to link a parent portal (no email at all).
    const matchComplete = !filterIncomplete || (!s.email && !s.parent_email);
    const matchConsent = !filterConsent || (s.photo_consent || 'Non demandé') === filterConsent;
    const matchSource = !filterSource || s.referral_source === filterSource;
    return matchSearch && matchStatus && matchCat && matchLevel && matchSession && matchComplete && matchConsent && matchSource;
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
              Session: s.session_type || '',
              Niveau: s.niveau_cefr || '',
              Statut: s.status || '',
              Source: s.referral_source || '',
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
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Rechercher..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">Actifs (Enrolled/Trial/Alumni)</option>
          <option value="all_shown">Tous les statuts</option>
          {['Enrolled','Trial','Alumni','Prospect','Inactive'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}>
          <option value="">Toutes catégories</option>
          {AGE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterSession} onChange={e => { setFilterSession(e.target.value); setPage(1); }}>
          <option value="">Toutes sessions</option>
          {SESSION_TYPES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(1); }}>
          <option value="">Tous les niveaux</option>
          {NIVEAUX.map(l => <option key={l}>{l}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterIncomplete ? 'incomplete' : ''} onChange={e => { setFilterIncomplete(e.target.value === 'incomplete'); setPage(1); }}>
          <option value="">Complétude : tous</option>
          <option value="incomplete">À compléter (sans email)</option>
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterConsent} onChange={e => { setFilterConsent(e.target.value); setPage(1); }}>
          <option value="">Autorisation photo : toutes</option>
          {PHOTO_CONSENTS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none flex-1 sm:flex-none" value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}>
          <option value="">Source : toutes</option>
          {SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <SkeletonTable rows={10} cols={6} />
        ) : filtered.length === 0 ? (
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
                    <p className="font-semibold text-sm truncate">{s.full_name}</p>
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
                        <span className="inline-flex items-center gap-1.5">{s.full_name}<ConsentIcon v={s.photo_consent} /></span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <InlineSelect
                          value={s.age_category}
                          options={AGE_CATEGORIES}
                          empty="— Non défini —"
                          onChange={v => patchStudent(s.id, 'age_category', v)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <InlineSelect
                          value={s.session_type || 'Yearly'}
                          options={SESSION_TYPES}
                          className={`font-medium ${SESSION_TYPE_COLORS[s.session_type] || ''}`}
                          onChange={v => patchStudent(s.id, 'session_type', v)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <InlineSelect
                          value={s.niveau_cefr}
                          options={NIVEAUX}
                          empty="—"
                          className="font-semibold"
                          onChange={v => patchStudent(s.id, 'niveau_cefr', v)}
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
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}
