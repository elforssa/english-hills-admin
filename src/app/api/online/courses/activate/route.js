// POST /api/online/courses/activate { group, version } — director/admin. Creates the
// provider room and stores its opaque reference through online_activate_course (as the
// caller). Closed unless the live gate is on; the fake provider is refused in Production.
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
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
  const result = await handleCourseAction({ action: 'activate', body, env: process.env, getUserClient: getServerClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
