// A pressed "Enregistrer" survives a page reload: the pending idempotency key
// lets the next page look the attempt up in receipts.idempotency_key instead of
// silently issuing a second receipt under a new key (FIN-13). Storage can be
// missing or throw (private window, blocked site data); every access is guarded
// and the form keeps working without it.
export const PENDING_PAYMENT_STORAGE_KEY = 'english-hills:pending-payment';

function sessionStore(storage) {
  if (storage) return storage;
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

export function savePendingPayment(key, { storage, now = Date.now() } = {}) {
  try {
    sessionStore(storage)?.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify({ key, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function readPendingPayment({ storage } = {}) {
  try {
    const raw = sessionStore(storage)?.getItem(PENDING_PAYMENT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value?.key === 'string' && value.key && Number.isFinite(value.savedAt) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingPayment({ storage } = {}) {
  try { sessionStore(storage)?.removeItem(PENDING_PAYMENT_STORAGE_KEY); } catch { /* storage unavailable */ }
}

// recorded: the earlier attempt committed (show its receipt, do not prefill);
// not_recorded: it did not, the form already holds a fresh key;
// unknown: the lookup failed, keep the pending key for the next load.
// The caller clears the pending key once it has shown a settled answer.
export async function recoverPendingPayment(lookupReceiptByKey, { storage } = {}) {
  const pending = readPendingPayment({ storage });
  if (!pending) return { status: 'none' };
  let receipt;
  try {
    receipt = await lookupReceiptByKey(pending.key);
  } catch {
    return { status: 'unknown' };
  }
  return receipt ? { status: 'recorded', receipt } : { status: 'not_recorded' };
}

export function pendingPaymentSettled(result) {
  return result?.status === 'recorded' || result?.status === 'not_recorded';
}

// Soft check before a payment: same learner, same amount, same payment date.
export function identicalReceiptPrompt(existing, { paymentDate, today }) {
  const when = paymentDate === today ? 'aujourd’hui' : `le ${paymentDate}`;
  const number = existing?.receipt_number ? ` (reçu N° ${existing.receipt_number})` : '';
  return `Un reçu identique existe déjà ${when} pour cet apprenant, du même montant${number}. Enregistrer quand même un deuxième paiement ?`;
}
