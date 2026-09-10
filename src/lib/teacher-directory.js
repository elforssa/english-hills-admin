'use client';

import { getBrowserClient } from './supabase';

// Only this three-column RPC belongs in non-HR screens. Page through results
// so teacher identity/names do not silently disappear after the old 100-row cap.
export async function getTeacherDirectory({ id = null } = {}) {
  const sb = getBrowserClient();
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sb.rpc('get_teacher_directory', { p_teacher_id: id })
      .select('id, full_name, email')
      .order('full_name').order('id').range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

// Use the same database identity rule as RLS instead of repeating email
// matching over a capped directory in individual pages. No HR row is returned.
export async function getMyTeacher() {
  const { data: id, error } = await getBrowserClient().rpc('get_my_teacher_id');
  if (error) throw error;
  if (!id) return null;
  const [teacher] = await getTeacherDirectory({ id });
  return teacher || null;
}
