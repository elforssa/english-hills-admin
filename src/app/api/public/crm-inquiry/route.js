import 'server-only';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { inquiryPost, inquiryOptions } from '@/lib/crm/website/endpoint.mjs';
export const runtime = 'nodejs';
async function rpc(name, args) {
  const { data, error } = await getServiceRoleClient().rpc(name, args);
  if (error) { const failure = new Error('Inquiry storage unavailable'); failure.code = error.code; throw failure; }
  return data;
}
export function POST(request) { return inquiryPost(request, { rpc, env: process.env }); }
export function OPTIONS(request) { return inquiryOptions(request, rpc); }
