// POST /api/webhooks/online/fake — provider join/leave evidence (Q14 = A). Each adapter
// gets its own static path. The signature is verified by the adapter before any write;
// 404 when the live gate is off, when another provider is configured, for an adapter
// without webhooks and for the fake provider in Production. Evidence never writes attendance.
import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleWebhook } from '@/lib/online/handlers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const rawBody = await request.text();
  const result = await handleWebhook({ provider: 'fake', rawBody, headers: request.headers, env: process.env,
    getServiceClient: getServiceRoleClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
