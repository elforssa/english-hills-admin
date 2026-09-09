import { storageRequest } from '@/lib/storage-server';
export const dynamic = 'force-dynamic';
export async function POST(request) { return storageRequest(request, 'finalize'); }
