'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { shouldRetryRead } from '@/lib/queryRetry.mjs';
export async function crmRpc(name, args) {
  const {
    data,
    error
  } = await getBrowserClient().rpc(name, args);
  if (error) throw error;
  return data;
}
export function useCrmRead(name, args = {}, enabled = true) {
  const {
    user,
    role
  } = useAuth();
  return useQuery({
    queryKey: ['crm', user?.id, role, name, args],
    queryFn: () => crmRpc(name, args),
    enabled: enabled && !!user && ['receptionist', 'admin', 'director'].includes(role),
    staleTime: 15000,
    retry: shouldRetryRead,
    refetchOnWindowFocus: true,
    refetchInterval: ['crm_get_opportunities','crm_get_work_queue','crm_get_admissions_calendar'].includes(name) ? 60000 : false
  });
}
export function useCrmRefresh() {
  const client = useQueryClient();
  return () => {
    window.dispatchEvent(new Event('crm:refresh'));
    return client.invalidateQueries({ queryKey: ['crm'] });
  };
}
