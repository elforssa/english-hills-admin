// =============================================================================
// Service-role Supabase client — SERVER ONLY.
//
// Lives in a separate file from src/lib/supabase.js with the `server-only`
// import at the top so a stray `"use client"` import will fail the Next.js
// build instead of silently bundling SUPABASE_SERVICE_ROLE_KEY into the
// browser. Bypasses RLS — only call from a route handler / server action
// after authorizing the caller.
// =============================================================================

import 'server-only';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

export function getServiceRoleClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env'
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
