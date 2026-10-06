'use client';
import { useAuth } from '@/context/AuthContext';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Upload, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EnrollmentModal from '@/components/students/EnrollmentModal';
import Pagination from '@/components/ui/pagination';
import PageFrame from '@/components/operational/PageFrame';
import PageHeader from '@/components/operational/PageHeader';
import SearchField from '@/components/operational/SearchField';
import FilterBar from '@/components/operational/FilterBar';
import FormField from '@/components/operational/FormField';
import ReadState from '@/components/operational/ReadState';
import { queryReadState, DOSSIER_LABELS, ENROLLMENT_LABELS, displayLabel, programmeLabel } from '@/lib/ui/presentation.mjs';
import { exportToCsv } from '@/utils/exportCsv';
import { useEntityUpdate, useEntityAll } from '@/lib/queries';
import { getBrowserClient } from '@/lib/supabase';
import { toast } from 'sonner';
import { STUDENT_STATUS_COLORS, SESSION_TYPE_COLORS, PAYMENT_STATUS_COLORS } from '@/lib/statusColors';
import { money } from '@/lib/receiptFinance';
import { ALL_LEVELS, SESSION_TYPES, getLevelsForSession } from '@/lib/academicPrograms';
import { listHref, recordHref } from '@/lib/navigation.mjs';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
      className={`operational-control cursor-pointer ${className}`}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map(o => <option key={o} value={o}>{programmeLabel(o)}</option>)}
    </select>
  );
}

export default function StudentsPage() {
  const { role, user } = useAuth();
  const canEditProgramme = hasCapability(role, 'canEditStudentProgramme');
  const canImport = hasCapability(role, 'canImportStudents');
  const canExport = hasCapability(role, 'canExportStudents');
  const update = useEntityUpdate('Student');
  const queryClient = useQueryClient();
  const [placement, setPlacement] = useState(null);
  const { data: groups = [], isLoading: groupsLoading, isError: groupsError, refetch: reloadGroups } = useEntityAll('Group', 'name', { enabled: Boolean(placement && !placement.choices) });

  // Keep the current server value visible until persistence succeeds.
  const patchStudentFields = async (student, data) => {
    try {
      if (role === 'receptionist') {
        const { error } = await getBrowserClient().rpc('save_receptionist_student', {
          p_student: student.id, p_expected_updated_at: student.updated_at, p_changes: data,
        });
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ['Student'] });
      } else await update.mutateAsync({ id: student.id, data });
    } catch (error) { if (role === 'receptionist') toast.error(error.message); }
  };
  const patchStudent = (student, field, value) => patchStudentFields(student, { [field]: value === '' ? null : value });

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [page, setPage] = useState(1);
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const restore = () => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get('q') || '');
    setFilterStatus(params.get('status') || '');
    setFilterGroup(params.get('group') || '');
    setFilterCat(params.get('category') || '');
    setFilterLevel(params.get('level') || '');
    setFilterSession(params.get('session') || '');
    setFilterIncomplete(params.get('incomplete') === '1');
    setFilterSource(params.get('source') || '');
    setFilterPlan(params.get('plan') || '');
    const payment = params.get('payment') || '';
    setFilterPayment(['', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none'].includes(payment) ? payment : '');
    setPage(Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1));
    setUrlReady(true);
    };
    restore();
    window.addEventListener('popstate',restore);
    return () => window.removeEventListener('popstate',restore);
  }, []);

  const listUrl = listHref('/students', { q: search, status: filterStatus, group: filterGroup,
    category: filterCat, level: filterLevel, session: filterSession,
    incomplete: filterIncomplete ? '1' : '', source: filterSource,
    plan: filterPlan, payment: filterPayment, page });
  useEffect(() => { if (urlReady) window.history.replaceState(window.history.state, '', listUrl); }, [urlReady, listUrl]);
  const studentHref = (id) => recordHref(`/students/${id}`, listUrl);

  const filters = {
    p_search: search, p_status: filterStatus, p_age_category: filterCat,
    p_session: filterSession, p_level: filterLevel, p_incomplete: filterIncomplete,
    p_source: filterSource, p_plan: filterPlan, p_group: filterGroup,
    p_payment: filterPayment,
  };
  const listRead = useQuery({
    queryKey: ['Student', 'page', user?.id, role, filters, page],
    enabled: urlReady,
    queryFn: async () => {
      const { data, error } = await getBrowserClient().rpc('search_students_page', {
        ...filters, p_page: page, p_page_size: PAGE_SIZE,
      });
      if (error) throw error;
      if (!data || !Array.isArray(data.rows) || !Number.isSafeInteger(data.count) || data.count < 0 || !Number.isSafeInteger(data.total) || data.total < 0) return null;
      return data;
    },
  });
  const { data: result, isLoading: queryLoading, isError, refetch } = listRead;
  const loading = !urlReady || queryLoading;
  const paged = result?.rows || [];
  const matchedCount = Number(result?.count || 0);
  const studentIds = paged.map(student => student.id);
  const { data: pageEnrollments = [], isFetching: enrollmentsLoading, isError: enrollmentsError, refetch: reloadEnrollments } = useQuery({
    queryKey: ['Student', 'placement-enrollments', studentIds],
    enabled: role === 'receptionist' && studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await getBrowserClient().from('enrollments')
        .select('id,student_id,status,group_id,session_type,level,school_year,date_inscription,notes,created_at')
        .in('student_id', studentIds)
        .in('status', ['Submitted', 'Under Review', 'Trial', 'Confirmed', 'Validated'])
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const renderGroup = (student) => {
    if (role !== 'receptionist') return <div className="space-y-1">
      {student.groupe_id && <span>{student.group_name || 'Groupe affecté'}</span>}
      {(student.pending_enrollments || []).map(enrollment => (
        <button key={enrollment.id} className="block text-left text-xs font-semibold text-primary hover:underline"
          onClick={() => setPlacement({ student, enrollment })}>
          Groupe à affecter · {enrollment.session_type || student.session_type || 'Session'}{enrollment.school_year ? ` · ${enrollment.school_year}` : ''}
        </button>
      ))}
      {!student.groupe_id && !student.pending_enrollments?.length && <Link data-touch-target href={`/students/${student.id}/edit`} className="text-xs font-semibold text-primary hover:underline">Groupe à affecter</Link>}
    </div>;

    if (enrollmentsLoading) return <span className="text-xs text-muted-foreground">Chargement des inscriptions…</span>;
    if (enrollmentsError) return <button className="text-xs text-primary underline" onClick={() => reloadEnrollments()}>Réessayer le chargement des inscriptions</button>;
    const relevant = pageEnrollments.filter(enrollment => enrollment.student_id === student.id);
    const awaitingGroup = relevant.filter(enrollment => !enrollment.group_id);
    return <div className="space-y-1">
      {student.groupe_id && <span>{student.group_name || 'Groupe affecté'}</span>}
      {awaitingGroup.length === 1 && <button className="block text-left text-xs font-semibold text-primary hover:underline"
        onClick={() => setPlacement({ student, enrollment: awaitingGroup[0] })}>
        Groupe à affecter · {displayLabel(ENROLLMENT_LABELS, awaitingGroup[0].status)} · {awaitingGroup[0].session_type || student.session_type || 'Session'}
      </button>}
      {awaitingGroup.length > 1 && <button className="text-xs font-semibold text-primary hover:underline"
        onClick={() => setPlacement({ student, choices: awaitingGroup })}>Choisir l’inscription à affecter ({awaitingGroup.length})</button>}
      {!student.groupe_id && relevant.length === 0 && <button className="text-xs font-semibold text-primary hover:underline"
        onClick={() => setPlacement({ student, enrollment: null })}>Groupe à affecter</button>}
      {!student.groupe_id && relevant.length > 0 && awaitingGroup.length === 0 && <Link data-touch-target href={`/students/${student.id}`} className="text-xs text-primary underline">Voir les inscriptions affectées</Link>}
    </div>;
  };

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
        Groupe: s.group_name || 'À affecter',
        Session: s.session_type || '',
        Niveau: s.niveau_cefr || '',
        Statut: s.status || '',
        'Statut paiement': s.payment_status || 'Aucun engagement',
        'Solde restant (MAD)': Number(s.payment_balance || 0),
        Formule: s.plan_type || 'Standard',
        Source: s.referral_source || '',
        'Date naissance': s.date_naissance || '',
      })), `apprenants-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { toast.error('Export impossible. Aucun fichier CSV créé.'); }
  };

  const activeFilterCount = [search,filterStatus,filterGroup,filterCat,filterLevel,filterSession,filterIncomplete,filterSource,filterPlan,filterPayment].filter(Boolean).length;
  function resetFilters() {
    setSearch(''); setFilterStatus(''); setFilterGroup(''); setFilterCat(''); setFilterLevel(''); setFilterSession(''); setFilterIncomplete(false); setFilterSource(''); setFilterPlan(''); setFilterPayment(''); setPage(1);
  }
  return (
    <PageFrame>
      <PageHeader title="Apprenants" description={<>{loading || isError || !result ? '—' : matchedCount} apprenants correspondants · {loading || isError || !result ? '—' : result?.total} au total</>} actions={<>
          {canExport && <button
            onClick={exportStudents}
            disabled={loading || isError || !result}
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <Download size={15} /> CSV
          </button>}
          {canImport && <Link
            href="/students/import"
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted"
          >
            <Upload size={15} /> Import CSV
          </Link>}
          <Button asChild>
            <Link data-touch-target href="/students/new">
              <Plus size={15} /> Ajouter
            </Link>
          </Button>
      </>}/>
      <FilterBar activeCount={activeFilterCount} onReset={resetFilters} search={<SearchField label="Rechercher un apprenant" className="flex-1 basis-60" placeholder="Nom ou téléphone…" maxLength={120} value={search} onChange={value=>{setSearch(value);setPage(1);}}/>} more={<>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par paiement"><select aria-label="Filtrer par paiement" className="operational-control" value={filterPayment} onChange={e => { setFilterPayment(e.target.value); setPage(1); }}>
          <option value="">Paiements : tous</option>
          <option value="due">Reste à payer (tous)</option>
          <option value="unpaid">En attente</option>
          <option value="partial">Acompte versé</option>
          <option value="overdue">En retard</option>
          <option value="paid">Soldé</option>
          <option value="none">Aucun engagement</option>
        </select></FormField></div>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par catégorie"><select aria-label="Filtrer par catégorie" className="operational-control" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}>
          <option value="">Toutes catégories</option>
          {AGE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select></FormField></div>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par affectation de groupe"><select aria-label="Filtrer par affectation de groupe" className="operational-control" value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPage(1); }}>
          <option value="">Groupes : tous</option>
          <option value="unassigned">Groupe à affecter</option>
        </select></FormField></div>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par session"><select aria-label="Filtrer par session" className="operational-control" value={filterSession} onChange={e => { setFilterSession(e.target.value); setPage(1); }}>
          <option value="">Toutes sessions</option>
          {SESSION_TYPES.map(s => <option key={s} value={s}>{programmeLabel(s)}</option>)}
        </select></FormField></div>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par niveau"><select aria-label="Filtrer par niveau" className="operational-control" value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(1); }}>
          <option value="">Tous les niveaux</option>
          {(filterSession ? getLevelsForSession(filterSession) : ALL_LEVELS).map(l => <option key={l}>{l}</option>)}
        </select></FormField></div>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par complétude"><select aria-label="Filtrer par complétude" className="operational-control" value={filterIncomplete ? 'incomplete' : ''} onChange={e => { setFilterIncomplete(e.target.value === 'incomplete'); setPage(1); }}>
          <option value="">Complétude : tous</option>
          <option value="incomplete">À compléter (sans email)</option>
        </select></FormField></div>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par source"><select aria-label="Filtrer par source" className="operational-control" value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}>
          <option value="">Source : toutes</option>
          {SOURCES.map(s => <option key={s} value={s}>{programmeLabel(s)}</option>)}
        </select></FormField></div>
<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par formule"><select aria-label="Filtrer par formule" className="operational-control" value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }}>
          <option value="">Toutes les formules</option>
          <option value="Premium">Premium</option>
          <option value="Standard">Standard</option>
        </select></FormField></div>      </>}>{<div className="min-w-0 flex-1 basis-48"><FormField label="Filtrer par statut"><select aria-label="Filtrer par statut" className="operational-control" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">Dossiers actifs (inscrits, essai, anciens)</option>
          <option value="all_shown">Tous les statuts</option>
          {['Enrolled','Trial','Alumni','Prospect','Inactive'].map(s => <option key={s} value={s}>{displayLabel(DOSSIER_LABELS,s)}</option>)}
        </select></FormField></div>}</FilterBar>

      {placement && (placement.choices ? <EnrollmentChoiceDialog student={placement.student} enrollments={placement.choices}
        onSelect={enrollment => setPlacement({ student: placement.student, enrollment })} onClose={() => setPlacement(null)} />
        : groupsLoading ? <p role="status" className="mb-4 text-sm">Chargement des groupes…</p>
        : groupsError ? <div role="alert" className="mb-4 text-sm">Impossible de charger les groupes. <button className="text-primary underline" onClick={() => reloadGroups()}>Réessayer</button> <button onClick={() => setPlacement(null)}>Annuler</button></div>
          : placement.enrollment ? <EnrollmentModal key={placement.enrollment.id} assignmentOnly enrollment={placement.enrollment} students={[placement.student]} groups={groups}
            onClose={() => setPlacement(null)} onSave={() => {
              setPlacement(null);
              queryClient.invalidateQueries({ queryKey: ['Student'] });
              queryClient.invalidateQueries({ queryKey: ['Enrollment'] });
            }} /> : <DossierGroupPlacement student={placement.student} groups={groups}
            onClose={() => setPlacement(null)} onSave={() => {
              setPlacement(null);
              queryClient.invalidateQueries({ queryKey: ['Student'] });
              queryClient.invalidateQueries({ queryKey: ['Enrollment'] });
            }} />)}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <ReadState state={!urlReady ? 'loading' : queryReadState(listRead, {empty: matchedCount === 0, filtered: activeFilterCount > 0})} message={result && matchedCount === 0 && !isError && !loading ? activeFilterCount ? 'Aucun apprenant correspondant à ces filtres.' : 'Aucun dossier dans le périmètre actif. Choisissez Tous les statuts ou ajoutez un apprenant.' : undefined} onRetry={isError || (!result && !loading) ? refetch : undefined} onReset={activeFilterCount ? resetFilters : undefined}>
          {paged.length > 0 && <>
            <div className="sm:hidden divide-y divide-border">
              {paged.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 break-words text-sm font-semibold [overflow-wrap:anywhere]"><Link data-touch-target href={studentHref(s.id)} className="inline-flex min-h-11 min-w-11 items-center text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{s.full_name}</Link>{s.plan_type === 'Premium' && <Crown size={13} className="shrink-0 text-primary" />}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.age_category || '—'} · {programmeLabel(s.session_type)} {s.niveau_cefr ? `· ${s.niveau_cefr}` : ''}</p>
                    {renderGroup(s)}
                    <p className="text-xs text-muted-foreground">{s.telephone || '—'}</p>
                    <p className="mt-1 text-xs"><span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${PAYMENT_STATUS_COLORS[s.payment_status] || PAYMENT_STATUS_COLORS['Aucun engagement']}`}>{s.payment_status || 'Aucun engagement'}</span>{Number(s.payment_balance) > 0 && <span className="ml-2 font-semibold">{money(s.payment_balance)} MAD · solde restant actuel</span>}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ml-3 max-w-28 break-words ${STUDENT_STATUS_COLORS[s.status] || 'bg-slate-100 text-slate-700'}`}>{displayLabel(DOSSIER_LABELS,s.status)}</span>
                </div>
              ))}
            </div>
            <div role="region" tabIndex={0} aria-label="Tableau des apprenants, défilement horizontal" className="hidden sm:block overflow-x-auto max-w-full transition-none focus:outline focus:outline-2 focus:outline-ring focus:outline-offset-2">
              <table aria-label="Dossiers apprenants" className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Nom</th>
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Catégorie</th>
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Groupe</th>
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Programme</th>
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Niveau</th>
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Téléphone</th>
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Statut</th>
                    <th scope="col" className="text-left px-3 py-3 font-semibold text-muted-foreground">Paiement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map(s => (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-3 font-medium text-foreground">
                        <span className="inline-flex min-w-0 max-w-64 flex-wrap items-center gap-1.5 break-words"><Link data-touch-target href={studentHref(s.id)} className="inline-flex min-h-11 min-w-11 items-center text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{s.full_name}</Link>{s.plan_type === 'Premium' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold"><Crown size={10} /> Premium</span>}</span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <InlineSelect
                          value={s.age_category}
                          label={`Catégorie de ${s.full_name}`}
                          options={AGE_CATEGORIES}
                          empty="— Non défini —"
                          onChange={v => patchStudent(s, 'age_category', v)}
                        />
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{renderGroup(s)}</td>
                      <td className="px-3 py-3">
                        {canEditProgramme ? <InlineSelect
                          value={s.session_type}
                          label={`Session de ${s.full_name}`}
                          options={SESSION_TYPES}
                          className={`font-medium ${SESSION_TYPE_COLORS[s.session_type] || ''}`}
                          onChange={v => patchStudentFields(s, { session_type: v, niveau_cefr: null, groupe_id: null })}
                        /> : <span className={`font-medium ${SESSION_TYPE_COLORS[s.session_type] || ''}`}>{programmeLabel(s.session_type)}</span>}
                      </td>
                      <td className="px-3 py-3">
                        {canEditProgramme ? <InlineSelect
                          value={s.niveau_cefr}
                          label={`Niveau de ${s.full_name}`}
                          options={getLevelsForSession(s.session_type || 'Yearly', s.niveau_cefr)}
                          empty="—"
                          className="font-semibold"
                          onChange={v => patchStudentFields(s, { niveau_cefr: v || null, groupe_id: null })}
                        /> : <span className="font-semibold">{s.niveau_cefr || '—'}</span>}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{s.telephone || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STUDENT_STATUS_COLORS[s.status] || 'bg-slate-100 text-slate-700'}`}>{displayLabel(DOSSIER_LABELS,s.status)}</span>
                      </td>
                      <td className="px-3 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLORS[s.payment_status] || PAYMENT_STATUS_COLORS['Aucun engagement']}`}>{s.payment_status || 'Aucun engagement'}</span>{Number(s.payment_balance) > 0 && <span className="block mt-1 text-xs font-semibold text-foreground">{money(s.payment_balance)} MAD · solde restant actuel</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        }</ReadState>
        {result && <Pagination pending={listRead.isFetching || isError} page={page} total={matchedCount} pageSize={PAGE_SIZE} onChange={setPage} />}
      </div>
    </PageFrame>
  );
}

function EnrollmentChoiceDialog({ student, enrollments, onSelect, onClose }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Choisir une inscription pour {student.full_name}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Sélectionnez l’inscription à laquelle affecter le groupe.</p>
      <div className="space-y-2">
        {enrollments.map(enrollment => <button key={enrollment.id} type="button" className="block w-full rounded-md border border-border p-3 text-left text-sm hover:border-primary"
          onClick={() => onSelect(enrollment)}>
          <span className="block font-semibold">{displayLabel(ENROLLMENT_LABELS,enrollment.status)} · {enrollment.session_type || student.session_type || 'Session'} · {enrollment.level || 'Niveau à définir'}</span>
          <span className="text-xs text-muted-foreground">{enrollment.school_year || 'Année non renseignée'} · Réf. {enrollment.id.slice(0, 8)}</span>
        </button>)}
      </div>
    </DialogContent>
  </Dialog>;
}

function DossierGroupPlacement({ student, groups, onClose, onSave }) {
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const matchingGroups = groups.filter(group => !group.deleted_at
    && (group.session_type || 'Yearly') === (student.session_type || 'Yearly')
    && group.niveau === student.niveau_cefr);

  const assign = async (event) => {
    event.preventDefault();
    if (!groupId) return;
    setSaving(true);
    try {
      const { error } = await getBrowserClient().rpc('assign_receptionist_student_group', {
        p_student: student.id, p_enrollment: null, p_group: groupId,
        p_student_updated_at: student.updated_at, p_enrollment_updated_at: null,
      });
      if (error) throw error;
      toast.success('Groupe affecté');
      onSave();
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Affecter un groupe à {student.full_name}</DialogTitle></DialogHeader>
      {!student.niveau_cefr
        ? <p className="text-sm text-muted-foreground">Le niveau doit être défini avant l’affectation directe. Créez une pré-inscription depuis la <Link data-touch-target href={`/students/${student.id}`} className="text-primary underline" onClick={onClose}>fiche apprenant</Link> pour choisir un niveau et un groupe.</p>
        : <form onSubmit={assign} className="space-y-4">
          <label className="block text-sm font-medium">Groupe compatible
            <select aria-label="Groupe compatible" required className="mt-2 w-full rounded-md border border-border bg-white px-3 py-2" value={groupId} onChange={event => setGroupId(event.target.value)}>
              <option value="">— Choisir un groupe —</option>
              {matchingGroups.map(group => <option key={group.id} value={group.id}>{group.name} · {group.niveau}</option>)}
            </select>
          </label>
          {matchingGroups.length === 0 && <p className="text-sm text-muted-foreground">Aucun groupe compatible disponible.</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving || !groupId}>{saving ? 'Enregistrement…' : 'Affecter'}</Button></div>
        </form>}
    </DialogContent>
  </Dialog>;
}
