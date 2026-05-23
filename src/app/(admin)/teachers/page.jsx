'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = () => entities.Teacher.list('-created_date', 100).then(d => { setTeachers(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cet enseignant ?')) return;
    await entities.Teacher.delete(id);
    toast.success('Enseignant supprimé');
    load();
  };

  const filtered = teachers.filter(t => !search || t.full_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Enseignants</h1>
          <p className="text-muted-foreground text-sm mt-1">{teachers.length} enseignants</p>
        </div>
        <Link href="/teachers/new" className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto bg-primary">
          <Plus size={15} /> Ajouter
        </Link>
      </div>

      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <p className="text-muted-foreground text-sm col-span-3">Chargement...</p> :
          filtered.map(t => (
            <div key={t.id} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-foreground">{t.full_name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.contract_type === 'Employé' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{t.contract_type || 'Freelance'}</span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/teachers/${t.id}/edit`} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></Link>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t.email || '—'}</p>
              <p className="text-xs text-muted-foreground">{t.telephone || '—'}</p>
              {t.niveaux_autorises?.length > 0 && (
                <div className="flex gap-1 mt-3 flex-wrap">
                  {t.niveaux_autorises.map(n => (
                    <span key={n} className="text-xs font-bold text-white px-1.5 py-0.5 rounded bg-primary">{n}</span>
                  ))}
                </div>
              )}
              {t.certifications?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">{t.certifications.join(', ')}</p>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}
