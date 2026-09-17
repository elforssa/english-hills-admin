// =============================================================================
// notifications — small client helper around the notification read-state RPC.
//
// The recipient has SELECT access to their notifications but no UPDATE policy,
// so marking them read goes through the SECURITY DEFINER RPC
// mark_my_notifications_read() (migration 028).
// =============================================================================

'use client';

import { getBrowserClient } from './supabase';

/**
 * markMyNotificationsRead() → Promise<number>
 * Marks all of the current user's unread notifications as read.
 * Returns the number updated. Errors reject so callers keep unread state.
 */
export async function markMyNotificationsRead() {
  const sb = getBrowserClient();
  const { data, error } = await sb.rpc('mark_my_notifications_read');
  if (error) throw error;
  return data ?? 0;
}
