'use client';

// TanStack hooks over the online RPCs (migration 117) and the gated online routes.
// Reads run as the signed-in user; the database decides what each role may see.
import { formatCentre } from '../centreClock.mjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { shouldRetryRead } from '@/lib/queryRetry.mjs';

export async function onlineRpc(name, args = {}) {
  const { data, error } = await getBrowserClient().rpc(name, args);
  if (error) throw error;
  return data;
}

export function useOnlineRead(name, args = {}, { enabled = true, roles = null, refetchInterval = false } = {}) {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ['online', user?.id, role, name, args],
    queryFn: () => onlineRpc(name, args),
    enabled: enabled && !!user && (!roles || roles.includes(role)),
    staleTime: 15000,
    retry: shouldRetryRead,
    refetchOnWindowFocus: true,
    refetchInterval,
  });
}

export function useOnlineRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['online'] });
}

// POST to a gated online route; resolves { ok, status, body } and never throws for
// an HTTP refusal (the body carries a closed { reason }).
export async function onlinePost(path, body) {
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store' });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, body: data || {} };
  } catch {
    return { ok: false, status: 0, body: { reason: 'provider_error' } };
  }
}

export const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function civilDate(localDate) {
  if (!localDate) return '';
  const [y, m, d] = String(localDate).split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].toLowerCase();
  return `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function casablancaTime(instant) {
  if (!instant) return '';
  return formatCentre(instant, 'fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Display only: the server re-checks the window when a pass is requested.
export function joinWindowState(lesson, now = Date.now()) {
  if (lesson.status === 'cancelled') return 'cancelled';
  const opens = Date.parse(lesson.join_opens_at ?? lesson.host_opens_at), closes = Date.parse(lesson.join_closes_at);
  if (Number.isNaN(opens) || Number.isNaN(closes)) return 'closed';
  if (now < opens) return 'upcoming';
  if (now > closes) return 'over';
  return 'open';
}
