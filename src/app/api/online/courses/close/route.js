// POST /api/online/courses/close { group, version } — director/admin. Closes the course
// and revokes every open pass through online_close_course (as the caller), resolves the opaque
// room reference as the service role (review fix N1) and closes the provider room. Closed unless the live gate is on; the fake provider is refused in Production.
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleCourseAction } from '@/lib/online/handlers.mjs';
import { rejectCrossOrigin } from '@/lib/http/requestOrigin.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const refused = rejectCrossOrigin(request);
  if (refused) return refused;
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const result = await handleCourseAction({ action: 'close', body, env: process.env, getUserClient: getServerClient,
    getServiceClient: getServiceRoleClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
