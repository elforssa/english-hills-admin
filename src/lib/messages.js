'use client';

import { getBrowserClient } from './supabase';

export async function markMessageRead(messageId) {
  const { data, error } = await getBrowserClient().rpc('mark_message_read', {
    p_message_id: messageId,
  });
  if (error) throw error;
  return data === true;
}
