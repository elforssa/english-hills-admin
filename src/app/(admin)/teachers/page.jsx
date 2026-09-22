'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { entities } from '@/lib/entities';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StorageImage from '@/components/StorageImage';
import { recordHref } from '@/lib/navigation.mjs';

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search).get('q') || '');
    setUrlReady(true);
  }, []);
  const listUrl = `/teachers${search ? `?q=${encodeURIComponent(search)}` : ''}`;
  useEffect(() => { if (urlReady) window.history.replaceState(window.history.state, '', listUrl); }, [urlReady, listUrl]);

  const load = () => entities.Teacher.listAll('-created_date').then(d => { setTeachers(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  const filtered = teachers.filter(t => !search || t.full_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Enseignants</h1>
          <p className="text-muted-foreground text-sm mt-1">{teachers.length} enseignants</p>
        </div>
        <Button asChild className="self-start sm:self-auto">
          <Link href="/teachers/new">
            <Plus size={15} /> Ajouter
          </Link>
        </Button>
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
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                    {t.photo_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <StorageImage src={t.photo_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-muted-foreground">{t.full_name?.[0] || '?'}</span>}
                  </div>
                  <div className="min-w-0">
                    <Link href={recordHref(`/teachers/${t.id}`, listUrl)} className="block font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded truncate py-1">{t.full_name}</Link>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.contract_type === 'Employé' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{t.contract_type || 'Freelance'}</span>
                  </div>
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
