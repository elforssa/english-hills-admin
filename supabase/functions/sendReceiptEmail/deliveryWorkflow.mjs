import { receiptEmailDecision } from './receiptState.mjs';

export async function deliverReceiptEmail(receiptId, dependencies) {
  // Loading is deliberately outside the delivery error handler: a failed lookup
  // gives us no trustworthy current status and must never rewrite the row.
  const receipt = await dependencies.loadReceipt(receiptId);
  const decision = receiptEmailDecision(receipt);
  if (decision.action === 'skip') {
    if (decision.persistStatus) {
      await dependencies.persistStatus(receiptId, decision.persistStatus, `${decision.reason}.`);
    }
    return { status: 'skipped', reason: decision.reason, receipt };
  }

  let providerResult;
  try {
    providerResult = await dependencies.sendReceipt(receipt);
  } catch (error) {
    try {
      await dependencies.persistStatus(receiptId, 'failed', error instanceof Error ? error.message : String(error));
      return { status: 'failed', receipt, error: error instanceof Error ? error.message : String(error) };
    } catch (persistError) {
      return { status: 'unknown', receipt, error: persistError instanceof Error ? persistError.message : String(persistError) };
    }
  }
  try {
    await dependencies.persistStatus(receiptId, 'sent', null);
    return { status: 'sent', receipt, providerResult };
  } catch (error) {
    // The provider accepted the message, but the database result is unknown.
    // Never turn this into a retryable "failed" status.
    return { status: 'unknown', receipt, providerResult, error: error instanceof Error ? error.message : String(error) };
  }
}
