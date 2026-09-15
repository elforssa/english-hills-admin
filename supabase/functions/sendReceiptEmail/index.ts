import { Resend } from 'npm:resend@4.0.0';
import { deliverReceiptEmail } from './deliveryWorkflow.mjs';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (value: unknown) => Number(value || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 });
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let mismatch = 0; for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i); return mismatch === 0; }

async function track(id: string | undefined, status: 'sent' | 'failed' | 'skipped', error?: string) {
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!id || !url || !key) return;
  // Never let a delayed/erroring worker rewrite historical-unknown or already
  // sent rows into a retryable status. The RPC applies the same invariant.
  const mutableStatuses = '&email_delivery_status=in.(pending,queued,failed)';
  const activeFilter = status === 'skipped' ? '' : '&voided_at=is.null&deleted_at=is.null';
  await fetch(`${url}/rest/v1/receipts?id=eq.${encodeURIComponent(id)}${mutableStatuses}${activeFilter}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_delivery_status: status, email_last_error: error || null }),
  });
}

async function loadCurrentReceipt(id: string) {
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase receipt lookup is not configured');
  const response = await fetch(`${url}/rest/v1/receipts?id=eq.${encodeURIComponent(id)}&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Receipt lookup failed (${response.status})`);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]) throw new Error('Receipt not found');
  return rows[0] as Record<string, unknown>;
}

Deno.serve(async (request) => {
  try {
    const expected = Deno.env.get('FUNCTION_AUTH_TOKEN') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const presented = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
    if (!expected || !presented || !safeEqual(presented, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = await request.json();
    const submitted = payload.record ?? payload.data ?? payload;
    const receiptId = String(submitted?.id || '');
    if (!receiptId) return Response.json({ error: 'Receipt id is required' }, { status: 400 });
    const outcome = await deliverReceiptEmail(receiptId, {
      loadReceipt: loadCurrentReceipt,
      persistStatus: track,
      sendReceipt: async (receipt: Record<string, unknown>) => {
        const apiKey = Deno.env.get('RESEND_API_KEY');
        if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
        const session = escapeHtml(receipt.session_type || 'Historique'); const service = escapeHtml(receipt.service_description || 'Reçu historique');
        const formula = receipt.session_type === 'Yearly' ? escapeHtml(receipt.plan_type) : '';
        const discount = Number(receipt.discount_amount_snapshot || 0); const balance = Number(receipt.balance_after_snapshot || 0);
        const body = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a2e"><div style="background:#1E3A6E;padding:24px 32px;color:white"><h1 style="margin:0;font-size:20px">English Hills Language Center</h1><p>Confirmation de paiement</p></div><div style="border:1px solid #e5e7eb;padding:28px 32px"><p>Bonjour <strong>${escapeHtml(receipt.nom_prenom)}</strong>,</p><p>Nous confirmons la réception de votre paiement.</p><table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td>N° de reçu</td><td><strong>${escapeHtml(receipt.receipt_number)}</strong></td></tr><tr><td>Date</td><td>${escapeHtml(receipt.date)}</td></tr><tr><td>Session</td><td>${session}</td></tr><tr><td>Service / période</td><td>${service}</td></tr>${formula ? `<tr><td>Formule</td><td>${formula}</td></tr>` : ''}<tr><td>Niveau</td><td>${escapeHtml(receipt.niveau || 'À déterminer')}</td></tr><tr><td>Prix brut</td><td>${money(receipt.gross_amount_snapshot)} MAD</td></tr>${discount > 0 ? `<tr><td>Remise</td><td>−${money(discount)} MAD</td></tr>` : ''}<tr><td>Prix net</td><td><strong>${money(receipt.net_amount_snapshot)} MAD</strong></td></tr><tr><td>Déjà payé</td><td>${money(receipt.paid_before_snapshot)} MAD</td></tr><tr><td>Reçu ce jour</td><td style="color:#059669"><strong>${money(receipt.montant_paye)} MAD</strong></td></tr><tr><td>Solde après</td><td>${money(balance)} MAD</td></tr><tr><td>Mode</td><td>${escapeHtml(receipt.mode_paiement)}</td></tr>${receipt.payment_note ? `<tr><td>Note</td><td>${escapeHtml(receipt.payment_note)}</td></tr>` : ''}</table><p style="border-top:1px solid #eee;padding-top:16px;color:#777">English Hills Language Center — Casablanca</p></div></div>`;
        const resend = new Resend(apiKey);
        const { data, error } = await resend.emails.send({ from: Deno.env.get('RESEND_FROM_ADDRESS') || 'English Hills Language Center <onboarding@resend.dev>', to: [String(receipt.email)], subject: `Confirmation de paiement — Reçu N° ${String(receipt.receipt_number || '').replace(/[\r\n]/g, '')}`, html: body }, { idempotencyKey: `receipt/${receipt.id}` });
        if (error) throw new Error(error.message);
        return data;
      },
    });
    if (outcome.status === 'skipped') return Response.json({ skipped: true, reason: outcome.reason });
    if (outcome.status === 'failed') return Response.json({ error: outcome.error }, { status: 500 });
    return Response.json({ success: true, sent_to: outcome.receipt.email, id: outcome.providerResult?.id });
  } catch (error) {
    // Lookup/parse failures do not establish the current delivery state, so
    // they are reported without mutating unknown/sent receipts.
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
