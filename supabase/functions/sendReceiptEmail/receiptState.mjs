export function receiptEmailDecision(receipt) {
  if (receipt?.voided_at || receipt?.deleted_at) {
    return { action: 'skip', reason: 'Receipt was voided before delivery' };
  }
  if (receipt?.email_delivery_status === 'sent') {
    return { action: 'skip', reason: 'Receipt email was already sent' };
  }
  if (receipt?.email_delivery_status === 'unknown') {
    return { action: 'skip', reason: 'Historical delivery status is unknown' };
  }
  if (!receipt?.email) {
    return { action: 'skip', reason: 'No email on receipt' };
  }
  return { action: 'send' };
}
