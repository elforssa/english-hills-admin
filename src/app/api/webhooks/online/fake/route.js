// POST /api/webhooks/online/fake — the fake provider's evidence, for local development,
// CI and previews. Same handler and order as the Zoom route: its own gate (the fake
// provider is refused whenever VERCEL_ENV is production), 413 before the body, signature
// before any write, 503/429 on a failed write. Evidence never writes attendance.
import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleWebhook } from '@/lib/online/handlers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const result = await handleWebhook({ provider: 'fake', request, env: process.env,
    getServiceClient: getServiceRoleClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
