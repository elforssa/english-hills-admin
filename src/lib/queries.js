// =============================================================================
// queries — TanStack Query hooks layered on top of `entities` (src/lib/entities).
//
// Every list page in (admin)/ currently looks like:
//
//     const [rows, setRows]       = useState([]);
//     const [loading, setLoading] = useState(true);
//     useEffect(() => {
//       entities.Student.list('-created_date', 200).then(d => {
//         setRows(d); setLoading(false);
//       });
//     }, []);
//
// That pattern can't dedupe between sibling pages, doesn't refetch on
// invalidation, and silently drops errors. This module replaces it with
// `useEntityList(name, ...)` and `useEntityFilter(name, ...)` so a single
// `queryKey` is shared across the app.
//
// Migration pattern (see src/app/(admin)/students/page.jsx for the example):
//
//   - import { useEntityList } from '@/lib/queries';
//   - const { data: students = [], isLoading, error } = useEntityList('Student', '-created_date', 200);
//   - Drop useState/useEffect for the fetch.
//   - Mutations invalidate with: queryClient.invalidateQueries({ queryKey: ['Student'] });
//
// Mutation helpers (`useEntityCreate` / `useEntityUpdate` / `useEntityDelete`)
// take care of invalidation automatically.
// =============================================================================

'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { entities } from './entities';

// Stable query keys live here so they can be referenced from anywhere
// (mutation helpers, manual invalidations from pages, devtools).
//
//   entityKeys.all('Student')                          // ['Student']
//   entityKeys.list('Student', '-created_date', 200)   // ['Student','list','-created_date',200]
//   entityKeys.filter('Student', {status:'Enrolled'})  // ['Student','filter',{status:'Enrolled'}]
export const entityKeys = {
  all:    (name) => [name],
  list:   (name, orderBy, limit) => [name, 'list', orderBy ?? null, limit ?? null],
  filter: (name, criteria, orderBy, limit) => [
    name, 'filter', criteria ?? null, orderBy ?? null, limit ?? null,
  ],
};

function getEntity(name) {
  const entity = entities[name];
  if (!entity) throw new Error(`Unknown entity "${name}"`);
  return entity;
}

/**
 * useEntityList('Student', '-created_date', 200)
 */
export function useEntityList(name, orderBy, limit, options = {}) {
  return useQuery({
    queryKey: entityKeys.list(name, orderBy, limit),
    queryFn:  () => getEntity(name).list(orderBy, limit),
    staleTime: 30_000, // 30s — keeps tab-switching snappy without aging too much.
    ...options,
  });
}

/**
 * useEntityFilter('Receipt', { student_id }, '-date', 200)
 */
export function useEntityFilter(name, criteria, orderBy, limit, options = {}) {
  return useQuery({
    queryKey: entityKeys.filter(name, criteria, orderBy, limit),
    queryFn:  () => getEntity(name).filter(criteria, orderBy, limit),
    enabled:  criteria !== null && criteria !== undefined,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * useEntityCreate('Student')
 *
 *   const create = useEntityCreate('Student');
 *   create.mutate({ full_name: 'Amal' });
 *
 * Invalidates every cached list/filter for the entity on success.
 */
export function useEntityCreate(name) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => getEntity(name).create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: entityKeys.all(name) }),
  });
}

/**
 * useEntityUpdate('Student')
 *
 *   const update = useEntityUpdate('Student');
 *   update.mutate({ id, data: { status: 'Enrolled' } });
 */
export function useEntityUpdate(name) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => getEntity(name).update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: entityKeys.all(name) }),
  });
}

/**
 * useEntityDelete('Student')
 *
 *   const remove = useEntityDelete('Student');
 *   remove.mutate(id);
 */
export function useEntityDelete(name) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => getEntity(name).delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: entityKeys.all(name) }),
  });
}
