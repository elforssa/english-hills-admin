import { storageRequest } from '@/lib/storage-server';
import { rejectCrossOrigin } from '@/lib/http/requestOrigin.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request) { return rejectCrossOrigin(request) || storageRequest(request, 'finalize'); }
