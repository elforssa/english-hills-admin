'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
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
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: name === 'crm_get_today' ? 60000 : false
  });
}
export function useCrmRefresh() {
  const client = useQueryClient();
  return () => {
    window.dispatchEvent(new Event('crm:refresh'));
    return client.invalidateQueries({ queryKey: ['crm'] });
  };
}
