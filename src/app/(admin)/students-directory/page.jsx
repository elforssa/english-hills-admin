import { redirect } from 'next/navigation';

// RWR-r5 §6.4 (C2): « Annuaire » is merged into « Liste des apprenants » (cards view).
// Old links and bookmarks keep their filters; the Annuaire's « view=list » is the table.
const KEPT = ['q', 'status', 'category', 'session', 'level'];

export default async function StudentsDirectory({ searchParams }) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const key of KEPT) {
    const value = Array.isArray(params?.[key]) ? params[key][0] : params?.[key];
    if (value) next.set(key, String(value).slice(0, 200));
  }
  if (params?.view !== 'list') next.set('view', 'cards');
  redirect(`/students${next.size ? `?${next}` : ''}`);
}
