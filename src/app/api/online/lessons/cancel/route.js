// POST /api/online/lessons/cancel { lesson, version, scope, reason } — operations staff.
// online_cancel_lesson runs as the caller and writes the family notices; this route then e-mails
// them through the server helper (external e-mail is disabled locally) and marks them
// sent. The addresses never reach the caller.
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleLessonAction } from '@/lib/online/handlers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const result = await handleLessonAction({ action: 'cancel', body, env: process.env, getUserClient: getServerClient,
    getServiceClient: getServiceRoleClient, getProvider, sendEmail });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
