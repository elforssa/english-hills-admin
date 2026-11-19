// POST /api/webhooks/online/zoom-video — Zoom Video SDK evidence (plan ORR-r2, section 3):
// session.user_joined, session.user_left, session.started and session.ended, and Zoom's
// endpoint validation challenge (OL-r6 A3). Behind its own gate (onlineWebhookGate,
// independent of the live switch; 404 otherwise, kill switch: remove the webhook secret
// and redeploy); 413 before the body is read when Content-Length is missing or above
// 64 KiB; the adapter verifies x-zm-signature and the five-minute window before anything
// is parsed or written; a failed write answers 503 (429 at the write ceiling), never 200.
// Evidence never writes attendance.
import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleWebhook } from '@/lib/online/handlers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const result = await handleWebhook({ provider: 'zoom-video', request, env: process.env,
    getServiceClient: getServiceRoleClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
