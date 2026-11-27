'use client';

import ReadState from '@/components/operational/ReadState';
import { useAuth } from '@/context/AuthContext';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdmissionsCalendar from '@/components/placement/AdmissionsCalendar';
import { entities } from '@/lib/entities';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PlacementTestModal from '@/components/placement/PlacementTestModal';
import StudentTestDialog from '@/components/placement/StudentTestDialog';
import PeopleSearch from '@/components/people/PeopleSearch';
import { Button } from '@/components/ui/button';
import PersonLink from '@/components/PersonLink';
import { crmRpc } from '@/lib/crm/queries';
import { personHref } from '@/lib/people.mjs';
import { displayStatus, placementError } from '@/lib/academic/placement.mjs';
import { PLACEMENT_STATUS_COLORS } from '@/lib/statusColors';

const STATUS_COLORS = PLACEMENT_STATUS_COLORS;

function PlacementTestsList() {
  const { role, user } = useAuth();
  const router = useRouter();
  const canDelete = ['admin', 'director'].includes(role);
  const scope = `${user?.id}:${role}`;
  const loadGeneration = useRef(0);
  const [attemptedScope, setAttemptedScope] = useState(null);
  const [loadedScope, setLoadedScope] = useState(null);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // RWR-r5 §6.2: a prospect's test opens its CRM form; a learner's own test, StudentTestDialog.
  const [modal, setModal] = useState(null);
  const [picking, setPicking] = useState(false);
  const [booking, setBooking] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    const generation = ++loadGeneration.current;
    setAttemptedScope(scope);
    setLoading(true); setLoadError(false);
    return entities.PlacementTest.listAll('-date_test')
    .then(t => { if (generation !== loadGeneration.current) return; if (!Array.isArray(t)) throw new Error('Unavailable list'); setTests(t); setNow(new Date()); setLoaded(true); setLoadedScope(scope); })
    .catch(() => { if (generation === loadGeneration.current) setLoadError(true); })
    .finally(() => { if (generation === loadGeneration.current) setLoading(false); });
  }, [scope]);
  const cancelLoad = useCallback(() => { ++loadGeneration.current; }, []);
  useEffect(() => { load(); return cancelLoad; }, [load, cancelLoad]);
  const sameScope = loadedScope === scope;

  const handleDelete = async (test) => {
    if (!confirm('Supprimer ce test ?')) return;
    try {
      await crmRpc('delete_placement_test', { p_test: test.id, p_expected_updated_at: test.updated_at });
      toast.success('Test supprimé');
    } catch (err) { toast.error(placementError(err)); }
    load();
  };
  // « Planifier un test » (§6.2, one booking path): a prospect's test is booked with its
  // appointment (« Rendez-vous au centre » with the test); a learner's here.
  const picked = (row) => {
    setPicking(false);
    if (row.kind === 'student') { setBooking({ id: row.id, name: row.name }); return; }
    toast.info('Le test d’un prospect se planifie avec son rendez-vous : « Rendez-vous au centre », avec test de niveau.');
    router.push(personHref(row));
  };
  const open = (t) => (t.crm_lead_id ? setModal(t) : setModal({ studentTest: t.id }));

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Tests de niveau</h1>
        <Button disabled={loading || loadError || !sameScope} onClick={() => setPicking(true)} className="self-start sm:self-auto">
          <Plus size={15} /> Planifier un test
        </Button>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <ReadState state={attemptedScope !== scope ? 'loading' : loading ? sameScope ? 'refreshing' : 'loading' : loadError ? sameScope ? 'stale' : 'error' : !sameScope ? 'loading' : tests.length ? 'ready' : 'empty'} message={!loading && !loadError && sameScope && !tests.length ? 'Aucun test de niveau enregistré. Planifiez un test pour un apprenant existant.' : undefined} onRetry={loadError ? load : undefined}>
        {sameScope && loaded && tests.length > 0 && (
          <>
            <div className="sm:hidden divide-y divide-border">
              {tests.map(t => (
                <div key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm"><PersonLink id={t.student_id}>{t.student_name}</PersonLink>{t.crm_lead_id && <span className="ml-2 text-xs font-normal text-muted-foreground">Prospect CRM</span>}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[displayStatus(t, now)] || 'bg-gray-100 text-gray-500'}`}>{displayStatus(t, now)}</span>
                  </div>
                  <button onClick={() => open(t)} className="text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">Test du {t.date_test || '—'}</button>
                  <p className="text-xs text-muted-foreground">{t.heure ? `à ${t.heure}` : ''} {t.examinateur ? `· ${t.examinateur}` : ''}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {t.score != null && <span className="text-xs font-semibold">Score: {t.score}</span>}
                    {t.niveau_recommande && <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{t.niveau_recommande}</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => open(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                    {canDelete && !t.crm_lead_id && <button aria-label="Supprimer le test" onClick={() => handleDelete(t)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Apprenant','Date','Heure','Examinateur','Score','Niveau','Statut',''].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tests.map(t => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium"><PersonLink id={t.student_id}>{t.student_name}</PersonLink>{t.crm_lead_id && <span className="ml-2 text-xs font-normal text-muted-foreground">Prospect CRM</span>}</td>
                      <td className="px-4 py-3"><button onClick={() => open(t)} className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">Test du {t.date_test || '—'}</button></td>
                      <td className="px-4 py-3 text-muted-foreground">{t.heure || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.examinateur || '—'}</td>
                      <td className="px-4 py-3 font-semibold">{t.score ?? '—'}</td>
                      <td className="px-4 py-3">
                        {t.niveau_recommande ? <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{t.niveau_recommande}</span> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[displayStatus(t, now)] || 'bg-gray-100 text-gray-500'}`}>{displayStatus(t, now)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => open(t)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></button>
                          {canDelete && !t.crm_lead_id && <button aria-label="Supprimer le test" onClick={() => handleDelete(t)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        </ReadState>
      </div>
      {modal?.id && <PlacementTestModal test={modal} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
      {modal?.studentTest && <StudentTestDialog key={modal.studentTest} testId={modal.studentTest} onSaved={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
      {booking && <StudentTestDialog key={booking.id} student={booking} onSaved={() => { setBooking(null); load(); }} onClose={() => setBooking(null)} />}
      <PeopleSearch open={picking} onClose={() => setPicking(false)} onPick={picked} title="Planifier un test de niveau" description="Choisissez l’apprenant ou le prospect : nom, e-mail ou téléphone. Le test d’un prospect se planifie avec son rendez-vous." />
    </div>
  );
}

function PlacementMode() {
  const params=useSearchParams();
  return params.get('view')==='calendar' ? <AdmissionsCalendar/> : <PlacementTestsList/>;
}
export default function PlacementTests() {
  return <Suspense fallback={<p className="p-8">Chargement…</p>}><PlacementMode/></Suspense>;
}
