export function receiptEmailDecision(receipt) {
  if (receipt?.email_delivery_status === 'unknown') {
    return { action: 'skip', reason: 'Historical delivery status is unknown', preserveStatus: true };
  }
  if (receipt?.email_delivery_status === 'sent') {
    return { action: 'skip', reason: 'Receipt email was already sent', preserveStatus: true };
  }
  if (receipt?.voided_at || receipt?.deleted_at) {
    return { action: 'skip', reason: 'Receipt was voided before delivery', persistStatus: 'skipped' };
  }
  if (!receipt?.email) {
    return { action: 'skip', reason: 'No email on receipt', persistStatus: 'skipped' };
  }
  return { action: 'send' };
}

export function receiptEmailRetryDecision(receipt) {
  if (receipt?.email_delivery_status === 'unknown') {
    return { allowed: false, reason: 'Historical delivery status is unknown' };
  }
  if (receipt?.email_delivery_status === 'sent') {
    return { allowed: false, reason: 'Receipt email was already sent' };
  }
  if (receipt?.voided_at || receipt?.deleted_at || !receipt?.email) {
    return { allowed: false, reason: 'Receipt is not deliverable' };
  }
  return { allowed: true };
}
