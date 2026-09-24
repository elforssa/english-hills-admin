import 'server-only';
import { webhookGet, webhookPost } from '@/lib/crm/meta/protocol.mjs';
import { metaRpc } from '@/lib/crm/meta/server';
export const runtime = 'nodejs';
export function GET(request) { return webhookGet(request, process.env.CRM_META_VERIFY_TOKEN); }
export function POST(request) {
  return webhookPost(request, { appSecret: process.env.CRM_META_APP_SECRET,
    persist: events => metaRpc('crm_accept_meta_events', { p_events: events }) });
}
