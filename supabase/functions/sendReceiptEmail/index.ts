// =============================================================================
// Edge Function — sendReceiptEmail
//
// Sends a French HTML receipt email via Resend whenever a row is inserted
// into public.receipts. Triggered by migration 005 (AFTER INSERT via pg_net).
//
// Authentication
// --------------
// Supabase pg_net signs outbound webhooks with the project's `service_role`
// key in the Authorization header. We require it on every request — without
// it, anyone who knows this function's public URL could POST arbitrary
// payloads and trigger emails through our Resend account.
//
// Set the expected secret with:
//   supabase secrets set FUNCTION_AUTH_TOKEN=$(supabase status | grep service_role | awk '{print $2}')
//
// Supabase webhook payload shape:
//   { type, table, schema, record, old_record? }
//
// Env vars (set with `supabase secrets set <name>=...`):
//   • RESEND_API_KEY        — server API key from resend.com
//   • RESEND_FROM_ADDRESS   — verified sender, e.g.
//                             "English Hills <noreply@english-hills.com>"
//   • FUNCTION_AUTH_TOKEN   — shared secret expected in the Authorization
//                             header (set this to the service_role key).
// =============================================================================

import { Resend } from 'npm:resend@4.0.0';

const FROM_DEFAULT = 'English Hills Language Center <onboarding@resend.dev>';

// Escapes HTML special characters in user-supplied strings before they're
// interpolated into the email template. Without this, a student named
// `<img src=x onerror=...>` would inject scripts into every receipt email.
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Constant-time string compare to avoid timing attacks on the shared token.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  try {
    // ── Authn: require the shared secret in Authorization ────────────────
    const expectedToken =
      Deno.env.get('FUNCTION_AUTH_TOKEN') ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!expectedToken) {
      return Response.json(
        { error: 'Function auth not configured' },
        { status: 500 },
      );
    }
    const authHeader = req.headers.get('Authorization') || '';
    const presented = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';
    if (!presented || !safeEqual(presented, expectedToken)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const receipt = payload.record ?? payload.data ?? payload;

    if (!receipt || !receipt.email) {
      return Response.json({ skipped: true, reason: 'No email on receipt' });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return Response.json(
        { error: 'RESEND_API_KEY is not configured for this function' },
        { status: 500 },
      );
    }

    const from = Deno.env.get('RESEND_FROM_ADDRESS') || FROM_DEFAULT;
    const resend = new Resend(apiKey);

    const {
      nom_prenom,
      email,
      date,
      receipt_number,
      categorie,
      niveau,
      type_cours,
      jours,
      plage_horaire,
      montant_total,
      montant_paye,
      mode_paiement,
      statut_paiement,
      observation,
    } = receipt;

    const restant = (Number(montant_total) || 0) - (Number(montant_paye) || 0);

    const formattedDate = date
      ? new Date(date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
      : '';

    // All user-facing fields are escapeHtml()'d. Numeric fields are coerced
    // to Number so toLocaleString can't be called on a malicious payload.
    const safe = {
      nom_prenom:      escapeHtml(nom_prenom || 'Cher(e) apprenant(e)'),
      receipt_number:  escapeHtml(receipt_number),
      categorie:       escapeHtml(categorie || '—'),
      niveau:          escapeHtml(niveau || '—'),
      type_cours:      escapeHtml(type_cours || '—'),
      jours:           escapeHtml(jours),
      plage_horaire:   escapeHtml(plage_horaire),
      mode_paiement:   escapeHtml(mode_paiement || '—'),
      statut_paiement: escapeHtml(statut_paiement || '—'),
      observation:     escapeHtml(observation),
      formattedDate:   escapeHtml(formattedDate),
      montantTotal:    (Number(montant_total) || 0).toLocaleString('fr-MA'),
      montantPaye:     (Number(montant_paye)  || 0).toLocaleString('fr-MA'),
      restant:         restant.toLocaleString('fr-MA'),
    };

    const body = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
  <div style="background: #1E3A6E; padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px; letter-spacing: 1px;">English Hills Language Center</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">Confirmation de paiement</p>
  </div>

  <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 28px 32px; border-radius: 0 0 8px 8px;">
    <p style="margin: 0 0 16px; font-size: 15px;">Bonjour <strong>${safe.nom_prenom}</strong>,</p>
    <p style="margin: 0 0 24px; font-size: 14px; color: #555;">Nous vous confirmons la réception de votre paiement. Voici le récapitulatif :</p>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      ${safe.receipt_number ? `<tr><td style="padding: 8px 0; color: #777; width: 45%;">N° de reçu</td><td style="padding: 8px 0; font-weight: 600;">${safe.receipt_number}</td></tr>` : ''}
      <tr><td style="padding: 8px 0; color: #777;">Date</td><td style="padding: 8px 0; font-weight: 600;">${safe.formattedDate}</td></tr>
      <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #777;">Catégorie</td><td style="padding: 8px 0;">${safe.categorie}</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Niveau</td><td style="padding: 8px 0;">${safe.niveau}</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Type de cours</td><td style="padding: 8px 0;">${safe.type_cours}</td></tr>
      ${safe.jours ? `<tr><td style="padding: 8px 0; color: #777;">Jours</td><td style="padding: 8px 0;">${safe.jours}</td></tr>` : ''}
      ${safe.plage_horaire ? `<tr><td style="padding: 8px 0; color: #777;">Horaire</td><td style="padding: 8px 0;">${safe.plage_horaire}</td></tr>` : ''}
      <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #777;">Montant total</td><td style="padding: 8px 0; font-weight: 600;">${safe.montantTotal} MAD</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Montant payé</td><td style="padding: 8px 0; font-weight: 600; color: #059669;">${safe.montantPaye} MAD</td></tr>
      ${restant > 0 ? `<tr><td style="padding: 8px 0; color: #777;">Solde restant</td><td style="padding: 8px 0; font-weight: 600; color: #dc2626;">${safe.restant} MAD</td></tr>` : ''}
      <tr><td style="padding: 8px 0; color: #777;">Mode de paiement</td><td style="padding: 8px 0;">${safe.mode_paiement}</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Statut</td><td style="padding: 8px 0;"><strong>${safe.statut_paiement}</strong></td></tr>
      ${safe.observation ? `<tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #777; vertical-align: top;">Observation</td><td style="padding: 8px 0;">${safe.observation}</td></tr>` : ''}
    </table>

    <p style="font-size: 13px; color: #888; border-top: 1px solid #f0f0f0; padding-top: 16px; margin: 0;">
      Pour toute question, contactez-nous à <a href="mailto:contact@english-hills.com" style="color: #1E4D8B;">contact@english-hills.com</a><br>
      English Hills Language Center — Bouskoura / Sidi Maarouf, Casablanca
    </p>
  </div>
</div>
    `.trim();

    // Strip CR/LF from values that flow into headers (subject) — RFC 5322
    // line breaks would otherwise allow header injection.
    const safeSubjectParts = [
      'Confirmation de paiement',
      receipt_number ? ` — Reçu N° ${String(receipt_number).replace(/[\r\n]/g, '')}` : '',
      nom_prenom ? ` — ${String(nom_prenom).replace(/[\r\n]/g, '')}` : '',
    ];

    const { data, error } = await resend.emails.send({
      from,
      to: [email],
      subject: safeSubjectParts.join(''),
      html: body,
    });

    if (error) {
      return Response.json({ error: error.message || 'Resend error' }, { status: 500 });
    }

    return Response.json({ success: true, sent_to: email, id: data?.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'Unknown error' }, { status: 500 });
  }
});
