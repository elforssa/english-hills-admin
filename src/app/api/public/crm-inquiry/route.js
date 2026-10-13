import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { getServiceRoleClient } from '@/lib/supabase-admin';
import { inquiryPost, inquiryOptions } from '@/lib/crm/website/endpoint.mjs';
export const runtime = 'nodejs';
async function rpc(name, args) {
  const { data, error } = await getServiceRoleClient().rpc(name, args);
  if (error) { const failure = new Error('Inquiry storage unavailable'); failure.code = error.code; throw failure; }
  return data;
}
// Tags only (site, form, visitor reason); the scrubber redacts the visitor-token header.
const captureWarning = (message, tags) => Sentry.captureMessage(message, { level: 'warning', tags });
export function POST(request) { return inquiryPost(request, { rpc, env: process.env, captureWarning }); }
export function OPTIONS(request) { return inquiryOptions(request, rpc); }
