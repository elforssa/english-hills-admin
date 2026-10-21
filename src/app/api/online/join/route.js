// POST /api/online/join { lesson, student? } — issues a per-person, per-lesson pass
// through online_issue_join (as the caller), resolves the course room as the service
// role and returns only the provider's short-lived embed. Gated by
// ONLINE_LEARNING_LIVE_ENABLED; the fake provider is refused in Production.
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleJoin } from '@/lib/online/handlers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const result = await handleJoin({ body, env: process.env, getUserClient: getServerClient,
    getServiceClient: getServiceRoleClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
