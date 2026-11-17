// GET /api/online/status — the status line of « Cours en ligne » for the director and
// the admin (plan ORR-r2, section 2, binding note 1): whether the configured provider's
// credentials are « correctes », « incorrectes » (a paste mistake) or « absentes ». It
// answers whatever the live switch and the gate say, so a closed gate can be seen; it is
// refused to every other caller, signed in or not, and carries words only.
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { getProvider } from '@/lib/online/provider/index.mjs';
import { handleStatus } from '@/lib/online/handlers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await handleStatus({ env: process.env, getUserClient: getServerClient, getProvider });
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
