'use client';

import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { entities } from '@/lib/entities';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PlacementTestModal from '@/components/placement/PlacementTestModal';
import { Button } from '@/components/ui/button';
import PersonLink from '@/components/PersonLink';

const STATUS_COLORS = {
  'Planifié': 'bg-blue-100 text-blue-700',
  'Passé': 'bg-yellow-100 text-yellow-700',
  'Résultat saisi': 'bg-purple-100 text-purple-700',
  'Affecté': 'bg-green-100 text-green-700',
};

export default function PlacementTests() {
  const { role } = useAuth();
  const [tests, setTests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = () => Promise.all([
    entities.PlacementTest.listAll('-date_test'),
    entities.Group.listAll('name'),
    entities.Student.listAll('full_name'),
  ])
    .then(([t, g, s]) => { setTests(t); setGroups(g); setStudents(s); })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[placement-tests] load failed:', err);
    })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce test ?')) return;
    await entities.PlacementTest.delete(id);
    toast.success('Supprimé'); load();
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Tests de niveau</h1>
        <Button onClick={() => setModal({})} className="self-start sm:self-auto">
          <Plus size={15} /> Planifier un test
        </Button>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {tests.map(t => (
                <div key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm"><PersonLink id={t.student_id}>{t.student_name}</PersonLink>{t.crm_lead_id && <span className="ml-2 text-xs font-normal text-muted-foreground">Prospect CRM</span>}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                  </div>
                  <button onClick={() => setModal(t)} className="text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">Test du {t.date_test || '—'}</button>
                  <p className="text-xs text-muted-foreground">{t.heure ? `à ${t.heure}` : ''} {t.examinateur ? `· ${t.examinateur}` : ''}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {t.score != null && <span className="text-xs font-semibold">Score: {t.score}</span>}
                    {t.niveau_recommande && <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{t.niveau_recommande}</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setModal(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                    {role !== 'receptionist' && !t.crm_lead_id && <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>}
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
                      <td className="px-4 py-3"><button onClick={() => setModal(t)} className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">Test du {t.date_test || '—'}</button></td>
                      <td className="px-4 py-3 text-muted-foreground">{t.heure || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.examinateur || '—'}</td>
                      <td className="px-4 py-3 font-semibold">{t.score ?? '—'}</td>
                      <td className="px-4 py-3">
                        {t.niveau_recommande ? <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{t.niveau_recommande}</span> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setModal(t)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></button>
                          {role !== 'receptionist' && !t.crm_lead_id && <button onClick={() => handleDelete(t.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {modal !== null && <PlacementTestModal test={modal.id ? modal : null} groups={groups} students={students} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
    </div>
  );
}
