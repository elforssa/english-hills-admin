// POST /api/webhooks/online/zoom-video — Zoom Video SDK join/leave evidence (Q14 = A) and
// Zoom's endpoint validation challenge (OL-r6 A3). The adapter verifies x-zm-signature
// and the five-minute timestamp window before anything is parsed or written; 404 when
// the live gate is off or another provider is configured. Evidence never writes attendance.
import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleWebhook } from '@/lib/online/handlers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const rawBody = await request.text();
  const result = await handleWebhook({ provider: 'zoom-video', rawBody, headers: request.headers, env: process.env,
    getServiceClient: getServiceRoleClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
