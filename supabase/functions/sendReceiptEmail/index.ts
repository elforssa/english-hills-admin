// =============================================================================
// Edge Function — sendReceiptEmail
//
// Sends a French HTML receipt email via Resend whenever a row is inserted
// into public.receipts. Triggered by migration 005 (AFTER INSERT via pg_net).
//
// Supabase webhook payload shape:
//   { type, table, schema, record, old_record? }
//
// We accept `record` as the receipt object, with fallbacks to `data` and
// the raw body for manual invocations.
//
// Env vars (set with `supabase secrets set <name>=...`):
//   • RESEND_API_KEY        — server API key from resend.com
//   • RESEND_FROM_ADDRESS   — verified sender, e.g.
//                             "English Hills <noreply@english-hills.com>"
// =============================================================================

import { Resend } from 'npm:resend@4.0.0';

const FROM_DEFAULT = 'English Hills Language Center <onboarding@resend.dev>';

Deno.serve(async (req) => {
  try {
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

    const restant = (montant_total || 0) - (montant_paye || 0);

    const formattedDate = date
      ? new Date(date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
      : '';

    const body = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
  <div style="background: #1E3A6E; padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px; letter-spacing: 1px;">English Hills Language Center</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">Confirmation de paiement</p>
  </div>

  <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 28px 32px; border-radius: 0 0 8px 8px;">
    <p style="margin: 0 0 16px; font-size: 15px;">Bonjour <strong>${nom_prenom || 'Cher(e) apprenant(e)'}</strong>,</p>
    <p style="margin: 0 0 24px; font-size: 14px; color: #555;">Nous vous confirmons la réception de votre paiement. Voici le récapitulatif :</p>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      ${receipt_number ? `<tr><td style="padding: 8px 0; color: #777; width: 45%;">N° de reçu</td><td style="padding: 8px 0; font-weight: 600;">${receipt_number}</td></tr>` : ''}
      <tr><td style="padding: 8px 0; color: #777;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr>
      <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #777;">Catégorie</td><td style="padding: 8px 0;">${categorie || '—'}</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Niveau</td><td style="padding: 8px 0;">${niveau || '—'}</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Type de cours</td><td style="padding: 8px 0;">${type_cours || '—'}</td></tr>
      ${jours ? `<tr><td style="padding: 8px 0; color: #777;">Jours</td><td style="padding: 8px 0;">${jours}</td></tr>` : ''}
      ${plage_horaire ? `<tr><td style="padding: 8px 0; color: #777;">Horaire</td><td style="padding: 8px 0;">${plage_horaire}</td></tr>` : ''}
      <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #777;">Montant total</td><td style="padding: 8px 0; font-weight: 600;">${(montant_total || 0).toLocaleString('fr-MA')} MAD</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Montant payé</td><td style="padding: 8px 0; font-weight: 600; color: #059669;">${(montant_paye || 0).toLocaleString('fr-MA')} MAD</td></tr>
      ${restant > 0 ? `<tr><td style="padding: 8px 0; color: #777;">Solde restant</td><td style="padding: 8px 0; font-weight: 600; color: #dc2626;">${restant.toLocaleString('fr-MA')} MAD</td></tr>` : ''}
      <tr><td style="padding: 8px 0; color: #777;">Mode de paiement</td><td style="padding: 8px 0;">${mode_paiement || '—'}</td></tr>
      <tr><td style="padding: 8px 0; color: #777;">Statut</td><td style="padding: 8px 0;"><strong>${statut_paiement || '—'}</strong></td></tr>
      ${observation ? `<tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #777; vertical-align: top;">Observation</td><td style="padding: 8px 0;">${observation}</td></tr>` : ''}
    </table>

    <p style="font-size: 13px; color: #888; border-top: 1px solid #f0f0f0; padding-top: 16px; margin: 0;">
      Pour toute question, contactez-nous à <a href="mailto:contact@english-hills.com" style="color: #1E4D8B;">contact@english-hills.com</a><br>
      English Hills Language Center — Bouskoura / Sidi Maarouf, Casablanca
    </p>
  </div>
</div>
    `.trim();

    const { data, error } = await resend.emails.send({
      from,
      to: [email],
      subject: `Confirmation de paiement${receipt_number ? ` — Reçu N° ${receipt_number}` : ''} — ${nom_prenom || ''}`,
      html: body,
    });

    if (error) {
      return Response.json({ error: error.message || 'Resend error' }, { status: 500 });
    }

    return Response.json({ success: true, sent_to: email, id: data?.id });
  } catch (error) {
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});
