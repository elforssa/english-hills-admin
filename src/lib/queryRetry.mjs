// Read retry policy for TanStack Query (reads only; mutations are never retried
// automatically). Only failures on an explicit allowlist are treated as transient
// and retried up to three times with TanStack's default backoff (1 s, 2 s, 4 s):
// a fetch TypeError or network-error message, the browser being offline, a
// timeout, a 502/503/504 gateway answer, and the pagination "Dataset changed"
// error. Every other failure, including any SQLSTATE or PGRST code and any other
// HTTP answer (401, 403, 404, 409, 429, 500, …) with or without a code, keeps the
// previous single retry.
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const NETWORK_MESSAGE = /failed to fetch|load failed|networkerror when attempting to fetch|fetch failed|network request failed|err_internet_disconnected|err_network_changed|\boffline\b/i;
const TIMEOUT_MESSAGE = /\btime[ds]? ?out\b|timing out/i;
const GATEWAY_MESSAGE = /bad gateway|service unavailable|gateway time-?out|invalid response was received from the upstream server/i;
const PAGINATION_MESSAGE = /^Dataset changed during pagination/;

function isOffline() {
  return typeof navigator !== 'undefined' && navigator?.onLine === false;
}

export function isTransientReadFailure(error) {
  // A code means the server answered (SQLSTATE, PGRST…): never transient.
  if (typeof error?.code === 'string' && error.code) return false;
  // An HTTP status, when the error carries one, decides on its own.
  const status = typeof error?.status === 'number' ? error.status : 0;
  if (status > 0) return GATEWAY_STATUSES.has(status);
  const message = typeof error?.message === 'string' ? error.message : '';
  return isOffline()
    || error?.name === 'TimeoutError'
    || NETWORK_MESSAGE.test(message)
    || TIMEOUT_MESSAGE.test(message)
    || GATEWAY_MESSAGE.test(message)
    || PAGINATION_MESSAGE.test(message);
}

export function shouldRetryRead(failureCount, error) {
  return failureCount < (isTransientReadFailure(error) ? 3 : 1);
}
