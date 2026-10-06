// Validate read availability only; do not recalculate finance aggregates.
export function financeReadResult(response, keys) {
  if (response?.error) return { state: 'error', reason: 'rpc-error' };
  if (response?.data == null) return { state: 'unavailable', reason: 'missing' };
  const data = response.data;
  if (typeof data !== 'object' || Array.isArray(data) || keys.some(key =>
    !['number','string'].includes(typeof data[key]) || String(data[key]).trim() === '' || !Number.isFinite(Number(data[key])))) {
    return { state: 'unavailable', reason: 'malformed' };
  }
  return { state: 'ready', data: Object.fromEntries(keys.map(key => [key, Number(data[key])])) };
}
export function failedRead(previous, reason = 'rejected') {
  return { ...previous, state: previous?.data ? 'stale' : 'error', reason, data: previous?.data };
}
