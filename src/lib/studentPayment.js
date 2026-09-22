// A student's payment status describes current, non-voided engagements.
// Receipt snapshots remain historical and must not be used for live balances.
export function studentPaymentSummary(charges) {
  const active = charges.filter((charge) => !charge.voided_at);
  if (active.length === 0) return { status: 'Aucun engagement', balance: 0 };

  const balance = active.reduce((sum, charge) => sum + Number(charge.balance || 0), 0);
  if (balance <= 0) return { status: 'Soldé', balance: 0 };

  const outstanding = active.filter((charge) => Number(charge.balance || 0) > 0);
  const status = outstanding.some((charge) => charge.settlement_status === 'En retard')
    ? 'En retard'
    : outstanding.some((charge) => Number(charge.paid_amount || 0) > 0)
      ? 'Acompte versé'
      : 'En attente';
  return { status, balance };
}
